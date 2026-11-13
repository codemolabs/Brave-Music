const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const https = require('https');
const config = require('../config/appConfig');
const libraryService = require('./LibraryService');

const SPOTIFY_FETCH_PLAYLIST_HASH = 'b39f62e9b566aa849b1780927de1450f47e02c54abf1e66e513f96e849591e41';
const SPOTIFY_FALLBACK_EMBED_PLAYLIST_ID = '37i9dQZF1DXcBWIGoYBM5M';

class DownloadService {
  constructor() {
    this.activeProcesses = new Map(); // downloadId -> ChildProcess
    this.canceledDownloads = new Set();
  }

  // Extract Spotify entity type & ID (supports localized /intl-xx/ paths & URIs)
  parseSpotifyUrl(url) {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    const webMatch = trimmed.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|playlist|episode|artist)\/([a-zA-Z0-9]+)/i);
    if (webMatch) {
      const type = webMatch[1].toLowerCase();
      const id = webMatch[2];
      return { type, id, canonicalUrl: `https://open.spotify.com/${type}/${id}` };
    }
    const uriMatch = trimmed.match(/spotify:(track|album|playlist|episode|artist):([a-zA-Z0-9]+)/i);
    if (uriMatch) {
      const type = uriMatch[1].toLowerCase();
      const id = uriMatch[2];
      return { type, id, canonicalUrl: `https://open.spotify.com/${type}/${id}` };
    }
    return null;
  }

  // Check if URL is from Spotify
  isSpotifyUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return Boolean(this.parseSpotifyUrl(url)) || /spotify\.(link|app\.link)\//i.test(url.trim());
  }

  // Check if URL is a Spotify playlist, mix, album, or artist top-tracks collection
  isSpotifyPlaylistUrl(url) {
    const parsed = this.parseSpotifyUrl(url);
    if (!parsed) return false;
    return ['playlist', 'album', 'artist'].includes(parsed.type);
  }

  // Check if URL is a YouTube or YouTube Music playlist / mix
  isYouTubePlaylistUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    return /[?&]list=([a-zA-Z0-9_-]+)/i.test(trimmed) ||
      /\/playlist\?list=/i.test(trimmed);
  }

  // Resilient HTTP/HTTPS request helper using Electron's Chromium stack when available, with IPv4 retry fallback
  async httpRequest(targetUrl, { method = 'GET', headers = {}, body = null, timeoutMs = 12000, retries = 1 } = {}) {
    const reqHeaders = {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      ...headers
    };

    for (let attempt = 0; attempt <= retries; attempt++) {
      // Prefer Chromium's network stack when running inside Electron main process
      try {
        const electron = require('electron');
        if (electron?.net?.fetch) {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);
          try {
            const resp = await electron.net.fetch(targetUrl, {
              method,
              headers: reqHeaders,
              body,
              signal: controller.signal
            });
            const text = await resp.text();
            clearTimeout(timer);
            return { status: resp.status, ok: resp.ok, body: text, url: resp.url || targetUrl };
          } catch (netErr) {
            clearTimeout(timer);
            if (attempt < retries) continue;
          }
        }
      } catch {}

      try {
        const result = await new Promise((resolve, reject) => {
          const parsedUrl = new URL(targetUrl);
          const transport = parsedUrl.protocol === 'http:' ? http : https;
          const req = transport.request(targetUrl, {
            method,
            family: 4,
            agent: false,
            headers: {
              ...reqHeaders,
              ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {})
            }
          }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              res.resume();
              const nextUrl = new URL(res.headers.location, targetUrl).toString();
              return resolve({ redirect: nextUrl });
            }
            let data = '';
            res.on('data', chunk => {
              data += chunk;
              if (data.length > 12 * 1024 * 1024) {
                res.destroy();
                reject(new Error('Response too large'));
              }
            });
            res.on('end', () => {
              resolve({ status: res.statusCode || 0, ok: res.statusCode >= 200 && res.statusCode < 300, body: data, url: targetUrl });
            });
          });
          req.on('error', reject);
          req.setTimeout(timeoutMs, () => req.destroy(new Error('Request timeout')));
          if (body) req.write(body);
          req.end();
        });

        if (result.redirect) {
          targetUrl = result.redirect;
          continue;
        }
        return result;
      } catch (err) {
        if (attempt >= retries) return null;
      }
    }
    return null;
  }

  // Expand short share links (spotify.link, spotify.app.link, etc.) to canonical URL
  async expandShortUrl(inputUrl) {
    const trimmed = String(inputUrl || '').trim();
    if (!/^https?:\/\/(spotify\.link|spotify\.app\.link)\//i.test(trimmed)) {
      return trimmed;
    }
    try {
      const resp = await this.httpRequest(trimmed, { method: 'GET', timeoutMs: 8000, retries: 1 });
      if (resp && resp.url && !/spotify\.(link|app\.link)/i.test(resp.url)) {
        return resp.url;
      }
      if (resp && resp.body) {
        const canon = resp.body.match(/https:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(playlist|album|track|artist|episode)\/[a-zA-Z0-9]+/i);
        if (canon) return canon[0];
      }
    } catch {}
    return trimmed;
  }

  // Read live Spotify sp_dc cookie from Electron session memory first, then saved session file
  async getSpotifySpDcCookie() {
    try {
      const electron = require('electron');
      if (electron?.session?.fromPartition) {
        const ses = electron.session.fromPartition('persist:bravemusic');
        if (ses?.cookies) {
          const cookies = await ses.cookies.get({ domain: 'spotify.com', name: 'sp_dc' });
          if (cookies && cookies.length > 0 && cookies[0].value) {
            return cookies[0].value;
          }
        }
      }
    } catch {}

    try {
      const sessionFile = path.join(config.paths.configDir, 'spotify_session.json');
      if (fs.existsSync(sessionFile)) {
        const parsed = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
        if (Array.isArray(parsed)) {
          const found = parsed.find(c => c && c.name === 'sp_dc' && c.value);
          if (found) return found.value;
        } else if (parsed && typeof parsed.sp_dc === 'string') {
          return parsed.sp_dc;
        }
      }
    } catch {}

    return '';
  }

  // Smart cleaner for song title and artist name (removes video noise, Topic, VEVO, etc.)
  cleanTrackMetadata({ title, artist, creator, uploader, album }) {
    let cleanTitle = String(title || '').trim();
    let cleanArtist = String(artist || creator || '').trim();
    const cleanUploader = String(uploader || '')
      .replace(/\s*-\s*Topic$/i, '')
      .replace(/VEVO$/i, '')
      .trim();

    // Strip common video noise from title
    const noiseRegex = /\s*[\(\[](?:official\s*(?:music\s*)?video|official\s*audio|official\s*lyric\s*video|lyric\s*video|lyrics|audio|visualizer|video|hd|4k|remastered|explicit|clean\s*version)[\)\]]/gi;
    cleanTitle = cleanTitle.replace(noiseRegex, '');
    cleanTitle = cleanTitle.replace(/\s*\|\s*(?:official\s*(?:music\s*)?video|official\s*audio|lyrics|audio).*/gi, '');

    // If artist is missing, empty, or generic
    if (!cleanArtist || cleanArtist === 'NA' || cleanArtist === 'undefined' || cleanArtist === 'Unknown' || cleanArtist.toLowerCase() === 'brave music') {
      const dashMatch = cleanTitle.match(/^([^-–—|]+)\s*[-–—|]\s*(.+)$/);
      if (dashMatch) {
        let p1 = dashMatch[1].trim();
        let p2 = dashMatch[2].trim();
        if (cleanUploader && p2.toLowerCase().includes(cleanUploader.toLowerCase())) {
          cleanArtist = p2;
          cleanTitle = p1;
        } else {
          cleanArtist = p1;
          cleanTitle = p2;
        }
      } else if (cleanUploader && cleanUploader !== 'NA') {
        cleanArtist = cleanUploader;
      } else {
        cleanArtist = 'Unknown Artist';
      }
    }

    // If cleanTitle starts with cleanArtist + delimiter, strip redundant artist from title
    if (cleanArtist && cleanArtist !== 'Unknown Artist' && cleanTitle.toLowerCase().startsWith(cleanArtist.toLowerCase())) {
      const rest = cleanTitle.substring(cleanArtist.length).replace(/^[\s-–—|:]+/, '').trim();
      if (rest) cleanTitle = rest;
    }

    // Clean remaining quotes and whitespace
    cleanTitle = cleanTitle.replace(/^["'\s]+|["'\s]+$/g, '');
    cleanArtist = cleanArtist.replace(/^["'\s]+|["'\s]+$/g, '');

    return {
      title: cleanTitle || title || 'Unknown Track',
      artist: cleanArtist || 'Unknown Artist'
    };
  }

  // Fetch full YouTube / YouTube Music playlist or Mix metadata via yt-dlp flat-playlist
  async fetchYouTubePlaylistMetadata(url) {
    const trimmed = String(url || '').trim();
    const listMatch = trimmed.match(/[?&]list=([a-zA-Z0-9_-]+)/i);
    const playlistId = listMatch ? listMatch[1] : null;
    // Personalized YouTube Mixes (list=RD...) require the seed ?v= parameter; /playlist?list=RD... fails as unviewable
    const isDynamicMix = Boolean(playlistId && /^RD(?!CLAK)/i.test(playlistId));
    const cleanUrl = (playlistId && !isDynamicMix)
      ? `https://www.youtube.com/playlist?list=${playlistId}`
      : trimmed;
    const itemLimit = isDynamicMix ? '1:35' : '1:500';

    return new Promise((resolve) => {
      let isSettled = false;
      const child = spawn(config.paths.ytdlpBin, [
        ...this.getRuntimeYtDlpFlags(),
        '--flat-playlist',
        '--playlist-items', itemLimit,
        '--dump-single-json',
        '--no-warnings',
        '--socket-timeout', '15',
        cleanUrl
      ], this.getYtDlpSpawnOptions());

      let jsonStr = '';
      child.stdout.on('data', chunk => {
        jsonStr += chunk.toString();
        if (jsonStr.length > 30 * 1024 * 1024) {
          try { child.kill('SIGTERM'); } catch (e) { }
        }
      });

      child.stderr.on('data', () => { });

      const timer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          try { child.kill('SIGKILL'); } catch (e) { }
          resolve(null);
        }
      }, 30000);

      child.on('close', (code) => {
        clearTimeout(timer);
        if (isSettled) return;
        isSettled = true;

        if (code === 0 && jsonStr.trim()) {
          try {
            const data = JSON.parse(jsonStr);
            const name = (data.title || data.playlist_title || 'YouTube Playlist').trim();
            const coverUrl = (data.thumbnails && Array.isArray(data.thumbnails) && data.thumbnails.length > 0)
              ? data.thumbnails.slice(-1)[0].url
              : (data.thumbnail || '');
            const rawEntries = Array.isArray(data.entries) ? data.entries : [];
            const tracks = rawEntries
              .map((e, index) => ({
                id: e.id,
                url: e.url || (e.id ? `https://www.youtube.com/watch?v=${e.id}` : null),
                title: e.title,
                uploader: e.uploader || e.channel || '',
                artist: e.artist || '',
                duration: typeof e.duration === 'number' ? Math.round(e.duration) : 0,
                thumbnail: (e.thumbnails && Array.isArray(e.thumbnails) && e.thumbnails.length > 0)
                  ? e.thumbnails.slice(-1)[0].url
                  : (e.thumbnail || coverUrl),
                index: index + 1
              }))
              .filter(t => Boolean(t.id && t.title && t.title !== '[Deleted video]' && t.title !== '[Private video]'));

            return resolve({
              name,
              coverUrl,
              id: playlistId || data.id,
              source: 'youtube',
              tracks
            });
          } catch (e) {
            console.warn('[DownloadService] Failed to parse YouTube playlist JSON:', e.message);
          }
        }
        resolve(null);
      });

      child.on('error', () => {
        clearTimeout(timer);
        if (!isSettled) {
          isSettled = true;
          resolve(null);
        }
      });
    });
  }

  // Check if Zotify has authenticated credentials saved
  hasZotifyCredentials() {
    const credPath = path.join(os.homedir(), '.config', 'zotify', 'credentials.json');
    try {
      if (fs.existsSync(credPath)) {
        const stat = fs.statSync(credPath);
        return stat.size > 20; // genuine credentials file has tokens and is > 20 bytes
      }
    } catch (e) { }
    return false;
  }

  // Parse Spotify __NEXT_DATA__ script JSON from an /embed/ page
  parseSpotifyEmbedHtml(html) {
    if (!html || typeof html !== 'string') return {};
    const scriptMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!scriptMatch) return {};
    try {
      const json = JSON.parse(scriptMatch[1]);
      return {
        entity: json?.props?.pageProps?.state?.data?.entity || null,
        session: json?.props?.pageProps?.state?.settings?.session || null
      };
    } catch {
      return {};
    }
  }

  // Query Spotify Pathfinder GraphQL with pagination so >100-track playlists and personalized mixes resolve completely
  async fetchSpotifyPlaylistPathfinder(id, accessToken, maxTracks = 1000) {
    if (!id || !accessToken) return null;
    const uri = `spotify:playlist:${id}`;
    const pageSize = 100;
    const allTracks = [];
    let playlistName = '';
    let coverUrl = '';
    let totalCount = null;

    for (let offset = 0; offset < maxTracks; offset += pageSize) {
      const payload = JSON.stringify({
        variables: { uri, offset, limit: pageSize, enableWatchFeedEntrypoint: false },
        operationName: 'fetchPlaylist',
        extensions: { persistedQuery: { version: 1, sha256Hash: SPOTIFY_FETCH_PLAYLIST_HASH } }
      });

      const resp = await this.httpRequest('https://api-partner.spotify.com/pathfinder/v1/query', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'app-platform': 'WebPlayer'
        },
        body: payload,
        timeoutMs: 12000,
        retries: 1
      });

      if (!resp || !resp.ok || !resp.body) break;
      let parsed;
      try {
        parsed = JSON.parse(resp.body);
      } catch {
        break;
      }

      const pl = parsed?.data?.playlistV2;
      if (!pl || pl.__typename === 'NotFound' || pl.__typename === 'GenericError') break;

      if (!playlistName && pl.name) playlistName = pl.name.trim();
      if (!coverUrl) {
        const sources = pl.images?.items?.[0]?.sources;
        if (Array.isArray(sources) && sources.length > 0) {
          coverUrl = sources.slice(-1)[0]?.url || sources[0]?.url || '';
        }
      }

      const content = pl.content;
      if (!content || !Array.isArray(content.items) || content.items.length === 0) break;
      if (typeof content.totalCount === 'number') totalCount = content.totalCount;

      for (const entry of content.items) {
        const trackObj = entry?.itemV2?.data;
        if (!trackObj) continue;
        const title = trackObj.name || trackObj.title || '';
        if (!title) continue;
        const artistList = Array.isArray(trackObj.artists?.items)
          ? trackObj.artists.items.map(a => a?.profile?.name).filter(Boolean)
          : [];
        const artist = artistList.join(', ') || 'Unknown Artist';
        const albumSources = trackObj.albumOfTrack?.coverArt?.sources;
        const trackThumb = Array.isArray(albumSources) && albumSources.length > 0
          ? (albumSources[albumSources.length - 1]?.url || albumSources[0]?.url || coverUrl)
          : coverUrl;
        const durationMs = trackObj.trackDuration?.totalMilliseconds || 0;

        allTracks.push({
          title,
          artist,
          duration: durationMs > 0 ? Math.round(durationMs / 1000) : 0,
          thumbnail: trackThumb,
          index: allTracks.length + 1
        });
      }

      if (content.items.length < pageSize || (totalCount !== null && allTracks.length >= totalCount)) {
        break;
      }
    }

    if (allTracks.length === 0) return null;
    return {
      name: playlistName || 'Spotify Playlist',
      coverUrl,
      type: 'playlist',
      id,
      source: 'spotify',
      tracks: allTracks
    };
  }

  // Fetch full Spotify playlist, personalized mix, album, or artist top-tracks metadata
  async fetchSpotifyPlaylistMetadata(url) {
    const parsed = this.parseSpotifyUrl(url);
    if (!parsed || !['playlist', 'album', 'artist'].includes(parsed.type)) return null;
    const { type, id } = parsed;

    const spDc = await this.getSpotifySpDcCookie();
    const cookieHeaders = spDc ? { Cookie: `sp_dc=${spDc}` } : {};

    // 1. Fetch entity embed page (using user sp_dc cookie when available for personalized accessToken)
    const embedUrl = `https://open.spotify.com/embed/${type}/${id}`;
    const embResp = await this.httpRequest(embedUrl, { headers: cookieHeaders, timeoutMs: 12000, retries: 1 });
    let { entity, session } = embResp && embResp.ok ? this.parseSpotifyEmbedHtml(embResp.body) : {};

    // 2. For playlists & personalized Mixes, obtain an authenticated token (falling back to a bootstrap embed if mix embed is blank) and query Pathfinder with pagination
    if (type === 'playlist') {
      let accessToken = session?.accessToken || '';
      if (!accessToken && spDc) {
        const bootResp = await this.httpRequest(
          `https://open.spotify.com/embed/playlist/${SPOTIFY_FALLBACK_EMBED_PLAYLIST_ID}`,
          { headers: cookieHeaders, timeoutMs: 10000, retries: 1 }
        );
        if (bootResp && bootResp.ok) {
          accessToken = this.parseSpotifyEmbedHtml(bootResp.body).session?.accessToken || '';
        }
      }

      if (accessToken) {
        const pfData = await this.fetchSpotifyPlaylistPathfinder(id, accessToken);
        if (pfData && pfData.tracks.length > 0) {
          if (!pfData.coverUrl && entity) {
            pfData.coverUrl = entity.coverArt?.sources?.[0]?.url || entity.visualIdentity?.image?.[0]?.url || '';
          }
          return pfData;
        }
      }
    }

    // 3. Fallback / Primary path for Albums & Artist Top Tracks via embed __NEXT_DATA__
    if (entity && Array.isArray(entity.trackList) && entity.trackList.length > 0) {
      const name = (entity.name || entity.title || `Spotify ${type}`).trim();
      const coverUrl = entity.coverArt?.sources?.[0]?.url ||
                       entity.visualIdentity?.image?.[0]?.url || '';
      const tracks = entity.trackList
        .map((t, index) => ({
          title: t.title || t.name,
          artist: (t.subtitle || (Array.isArray(t.artists) ? t.artists.map(a => a.name).join(', ') : (type === 'artist' ? name : 'Unknown Artist')))
            .replace(/\u00a0/g, ' ')
            .trim(),
          duration: typeof t.duration === 'number' ? Math.round(t.duration / 1000) : 0,
          thumbnail: coverUrl,
          index: index + 1
        }))
        .filter(t => Boolean(t.title));

      if (tracks.length > 0) {
        return {
          name,
          coverUrl,
          type,
          id,
          source: 'spotify',
          tracks
        };
      }
    }

    return null;
  }

  // Resolve Spotify metadata for single tracks / episodes when URL is from open.spotify.com
  async resolveUrl(inputUrl, isVideo = false) {
    const trimmed = String(inputUrl || '').trim();
    const parsed = this.parseSpotifyUrl(trimmed);
    if (!parsed) {
      return { url: trimmed, isSpotify: false };
    }

    const { type, id, canonicalUrl } = parsed;
    const suffix = isVideo ? 'official music video' : 'official audio';

    // 1. Try public embed endpoint for complete title, artists, and high-res cover art
    try {
      const spDc = await this.getSpotifySpDcCookie();
      const embResp = await this.httpRequest(`https://open.spotify.com/embed/${type}/${id}`, {
        headers: spDc ? { Cookie: `sp_dc=${spDc}` } : {},
        timeoutMs: 10000,
        retries: 1
      });
      const { entity: embedEntity } = embResp && embResp.ok ? this.parseSpotifyEmbedHtml(embResp.body) : {};

      if (embedEntity) {
        const title = embedEntity.name || embedEntity.title || '';
        let artist = '';
        if (Array.isArray(embedEntity.artists) && embedEntity.artists.length > 0) {
          artist = embedEntity.artists.map(a => a.name).join(', ');
        } else if (embedEntity.subtitle) {
          artist = embedEntity.subtitle.replace(/\u00a0/g, ' ');
        }
        const thumb = embedEntity.coverArt?.sources?.[0]?.url ||
          embedEntity.visualIdentity?.image?.[0]?.url || '';

        if (title) {
          const query = artist ? `${title} ${artist} ${suffix}` : `${title} ${suffix}`;
          return {
            url: `ytsearch1:${query}`,
            isSpotify: true,
            spotifyTitle: title,
            spotifyArtist: artist,
            thumbnail: thumb
          };
        }
      }
    } catch (e) {
      console.warn('[DownloadService] Spotify embed resolution note:', e.message);
    }

    // 2. Fallback to Spotify public oEmbed endpoint for single tracks
    try {
      const oEmbedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(canonicalUrl)}`;
      const oResp = await this.httpRequest(oEmbedUrl, { timeoutMs: 8000, retries: 1 });
      const metadata = oResp && oResp.ok ? JSON.parse(oResp.body) : null;

      if (metadata && metadata.title) {
        const searchQuery = `ytsearch1:${metadata.title} ${suffix}`;
        return {
          url: searchQuery,
          isSpotify: true,
          spotifyTitle: metadata.title,
          thumbnail: metadata.thumbnail_url || ''
        };
      }
    } catch (e) {
      console.warn('[DownloadService] Spotify oEmbed resolution fallback:', e.message);
    }

    return { url: trimmed, isSpotify: true };
  }

  getYtDlpSpawnOptions() {
    const snapGnomeLib = process.env.SNAP
      ? `${process.env.SNAP}/gnome-platform/usr/lib/x86_64-linux-gnu:${process.env.SNAP}/gnome-platform/lib/x86_64-linux-gnu:`
      : '';
    return {
      windowsHide: true,
      env: {
        ...process.env,
        PATH: `${config.paths.bundledBinDir}:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ''}`,
        LD_LIBRARY_PATH: `${snapGnomeLib}${config.paths.bundledBinDir}:${process.env.LD_LIBRARY_PATH || ''}`,
        PYTHONIOENCODING: 'utf-8'
      }
    };
  }

  getRuntimeYtDlpFlags() {
    const flags = [
      '--ignore-config',
      '--no-update',
      '--extractor-args', 'youtube:player_client=web_embedded,web,default',
      '--concurrent-fragments', '4'
    ];
    const nodeBin = config.paths.nodeBin;
    if (nodeBin) {
      flags.push('--js-runtimes', `node:${nodeBin}`);
    }
    const ffmpegDir = config.paths.ffmpegDir;
    if (ffmpegDir) {
      flags.push('--ffmpeg-location', ffmpegDir);
    }
    return flags;
  }

  // Get format parameters
  getFormatOptions(format = 'audio-mp3') {
    const hasFfmpeg = config.paths.hasFfmpeg;
    const runtimeFlags = this.getRuntimeYtDlpFlags();
    switch (format) {
      case 'audio-flac':
        return {
          isVideo: false,
          ext: hasFfmpeg ? 'flac' : 'm4a',
          bitrate: hasFfmpeg ? 'FLAC Lossless' : '256kbps',
          zotifyCodec: 'flac',
          ytdlpArgs: hasFfmpeg
            ? [...runtimeFlags, '-f', 'bestaudio/best', '-x', '--audio-format', 'flac']
            : [...runtimeFlags, '-f', 'bestaudio[ext=m4a]/bestaudio/best']
        };
      case 'audio-m4a':
        return {
          isVideo: false,
          ext: 'm4a',
          bitrate: '256kbps',
          zotifyCodec: 'aac',
          ytdlpArgs: hasFfmpeg
            ? [...runtimeFlags, '-f', 'bestaudio[ext=m4a]/bestaudio/best', '-x', '--audio-format', 'm4a']
            : [...runtimeFlags, '-f', 'bestaudio[ext=m4a]/bestaudio/best']
        };
      case 'video-mp4':
        return {
          isVideo: true,
          ext: 'mp4',
          bitrate: 'HD',
          zotifyCodec: null,
          ytdlpArgs: hasFfmpeg
            ? [...runtimeFlags, '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best', '--merge-output-format', 'mp4']
            : [...runtimeFlags, '-f', 'best[ext=mp4]/best']
        };
      case 'video-720p':
        return {
          isVideo: true,
          ext: 'mp4',
          bitrate: '720p',
          zotifyCodec: null,
          ytdlpArgs: hasFfmpeg
            ? [...runtimeFlags, '-f', 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best', '--merge-output-format', 'mp4']
            : [...runtimeFlags, '-f', 'best[height<=720][ext=mp4]/best[ext=mp4]/best']
        };
      case 'audio-mp3':
      default:
        return {
          isVideo: false,
          ext: hasFfmpeg ? 'mp3' : 'm4a',
          bitrate: hasFfmpeg ? '320kbps' : '256kbps',
          zotifyCodec: 'mp3',
          ytdlpArgs: hasFfmpeg
            ? [...runtimeFlags, '-f', 'bestaudio/best', '-x', '--audio-format', 'mp3', '--audio-quality', '0', '--postprocessor-args', 'ExtractAudio+ffmpeg:-b:a 320k']
            : [...runtimeFlags, '-f', 'bestaudio[ext=m4a]/bestaudio/best']
        };
    }
  }

  // Download via Zotify tool for Spotify links
  async downloadViaZotify({ url, downloadId, formatOptions, onProgress }) {
    const codec = formatOptions.zotifyCodec || 'mp3';
    const downloadsDir = config.paths.downloadsDir;

    // Snapshot existing files before download
    const existingFiles = new Set(fs.existsSync(downloadsDir) ? fs.readdirSync(downloadsDir) : []);

    const zotifyArgs = [
      '--codec', codec,
      '-q', 'very_high',
      '-rp', downloadsDir,
      '-ns', 'True',
      '--output', '{artist} - {song_name}.{ext}',
      url
    ];

    return new Promise((resolve) => {
      let isSettled = false;
      const child = spawn(config.paths.zotifyBin, zotifyArgs, { windowsHide: true });
      this.activeProcesses.set(downloadId, child);

      // 25 second timeout safeguard in case zotify hangs on interactive login prompt
      const timeoutTimer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          try { child.kill('SIGKILL'); } catch (e) { }
          this.activeProcesses.delete(downloadId);
          console.warn('[DownloadService] Zotify timed out (credentials needed), switching to yt-dlp');
          resolve({ success: false, fallback: true, error: 'Zotify requires interactive authentication' });
        }
      }, 25000);

      let outputText = '';
      child.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        outputText += text;

        if (text.includes('Login via saved credentials failed') || text.includes('Falling back to interactive login')) {
          if (!isSettled) {
            isSettled = true;
            clearTimeout(timeoutTimer);
            try { child.kill('SIGTERM'); } catch (e) { }
            this.activeProcesses.delete(downloadId);
            resolve({ success: false, fallback: true, error: 'Interactive login required' });
          }
        }

        if (typeof onProgress === 'function') {
          onProgress({
            downloadId,
            percent: 50,
            speed: 'Zotify Engine',
            size: 'Spotify Stream',
            eta: 'Downloading…'
          });
        }
      });

      child.stderr.on('data', (chunk) => {
        outputText += chunk.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timeoutTimer);
        this.activeProcesses.delete(downloadId);

        if (isSettled) return;
        isSettled = true;

        if (code === 0) {
          // Identify newly created files in downloadsDir
          const currentFiles = fs.existsSync(downloadsDir) ? fs.readdirSync(downloadsDir) : [];
          const newFiles = currentFiles.filter(f => !existingFiles.has(f) && !f.endsWith('.part') && !f.endsWith('.ytdl'));

          const addedTracks = [];
          for (const filename of newFiles) {
            const filepath = path.join(downloadsDir, filename);
            const ext = path.extname(filename).toLowerCase();
            const nameNoExt = path.basename(filename, ext);
            const parts = nameNoExt.split(' - ');
            const artist = parts.length > 1 ? parts[0].trim() : 'Spotify Artist';
            const title = parts.length > 1 ? parts.slice(1).join(' - ').trim() : nameNoExt;

            const trackData = {
              id: `zotify_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
              originalId: downloadId,
              title,
              artist,
              album: 'Spotify Download',
              duration: 0,
              thumbnail: '',
              filename,
              downloadUrl: url,
              addedAt: new Date().toISOString(),
              playlist: null
            };

            const saved = libraryService.addTrack(trackData);
            if (saved) addedTracks.push(saved);
          }

          if (addedTracks.length > 0) {
            return resolve({
              success: true,
              downloadId,
              count: addedTracks.length,
              tracks: addedTracks
            });
          }
        }

        // If zotify didn't create tracks or exited with non-zero, trigger fallback
        resolve({
          success: false,
          fallback: true,
          error: outputText || 'Zotify could not complete download'
        });
      });

      child.on('error', (err) => {
        clearTimeout(timeoutTimer);
        this.activeProcesses.delete(downloadId);
        if (!isSettled) {
          isSettled = true;
          resolve({ success: false, fallback: true, error: err.message });
        }
      });
    });
  }

  // Disk storage safeguard (detect storage out / ENOSPC before downloading)
  checkDiskSpace(minBytes = 35 * 1024 * 1024) {
    try {
      const dir = config.paths.downloadsDir;
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (typeof fs.statfsSync === 'function') {
        const stats = fs.statfsSync(dir);
        const freeBlocks = (typeof stats.bavail === 'number' && stats.bavail >= 0) ? stats.bavail : stats.bfree;
        const freeBytes = freeBlocks * stats.bsize;
        if (freeBytes < minBytes) {
          const freeMb = Math.max(0, Math.round(freeBytes / (1024 * 1024)));
          return {
            sufficient: false,
            freeBytes,
            error: `Storage critically low (${freeMb} MB free). Please free up disk space to download music.`
          };
        }
      }
    } catch (e) {
      console.warn('[DownloadService] Disk check notice:', e.message);
    }
    return { sufficient: true };
  }

  // Write clean ID3v2 / container tags directly via bundled ffmpeg without requiring ffmetadata demuxer
  async embedTrackMetadata(filepath, { title, artist, album, trackNumber, totalTracks } = {}) {
    if (!filepath || !fs.existsSync(filepath) || !config.paths.hasFfmpeg) return;
    const ext = path.extname(filepath).toLowerCase();
    if (!['.mp3', '.m4a', '.flac', '.ogg'].includes(ext)) return;

    const ffmpegBin = path.join(config.paths.ffmpegDir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
    if (!fs.existsSync(ffmpegBin)) return;

    const tmpOut = `${filepath}.tagged${ext}`;
    const args = ['-y', '-v', 'error', '-i', filepath, '-c', 'copy'];
    if (ext === '.mp3') {
      args.push('-id3v2_version', '3');
    }
    if (title) args.push('-metadata', `title=${title}`);
    if (artist) args.push('-metadata', `artist=${artist}`);
    if (album) args.push('-metadata', `album=${album}`);
    if (trackNumber && totalTracks) {
      args.push('-metadata', `track=${trackNumber}/${totalTracks}`);
    } else if (trackNumber) {
      args.push('-metadata', `track=${trackNumber}`);
    }
    args.push(tmpOut);

    await new Promise((resolve) => {
      const child = spawn(ffmpegBin, args, this.getYtDlpSpawnOptions());
      const timer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch {}
        resolve();
      }, 15000);
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0 && fs.existsSync(tmpOut) && fs.statSync(tmpOut).size > 0) {
          try {
            fs.renameSync(tmpOut, filepath);
          } catch {
            try { fs.unlinkSync(tmpOut); } catch {}
          }
        } else {
          try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut); } catch {}
        }
        resolve();
      });
      child.on('error', () => {
        clearTimeout(timer);
        try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut); } catch {}
        resolve();
      });
    });
  }

  // Generate ranked search queries for a Spotify track so minor metadata quirks don't drop tracks
  buildSpotifyQueries(track, isVideo = false) {
    const rawTitle = String(track?.title || '').trim();
    const rawArtist = String(track?.artist || '').replace(/^Unknown Artist$/i, '').trim();
    const cleanTitle = rawTitle.replace(/\s*[\(\[](?:feat\.?|ft\.?|with|remaster(?:ed)?|explicit)[^\)\]]*[\)\]]/gi, '').trim() || rawTitle;
    const primaryArtist = rawArtist.split(/[,;&]/)[0]?.trim() || rawArtist;
    const suffix = isVideo ? 'official music video' : 'official audio';

    const queries = [
      `ytsearch1:${rawTitle} ${rawArtist} ${suffix}`.trim(),
      `ytsearch1:${cleanTitle} ${primaryArtist} audio`.trim(),
      `ytsearch1:${cleanTitle} ${primaryArtist}`.trim()
    ];
    return [...new Set(queries.filter(q => q.length > 'ytsearch1:'.length))];
  }

  // Shared per-track yt-dlp runner returning parsed RECORD fields on success or null
  runYtDlpTrack({ downloadId, ytdlpArgs, targetArg, itemIndex, totalTracks, titleLabel, onProgress, downloadsDir }) {
    const trackArgs = [
      ...ytdlpArgs,
      '--no-playlist',
      '--no-warnings',
      '--socket-timeout', String(config.audio.socketTimeout),
      '--match-filter', '!is_live',
      '-o', path.join(downloadsDir, '%(title).100B [%(id)s].%(ext)s'),
      '--print', 'after_move:RECORD:%(filepath)s<DELIM>%(id)s<DELIM>%(title)s<DELIM>%(artist)s<DELIM>%(creator)s<DELIM>%(uploader)s<DELIM>%(duration)s<DELIM>%(thumbnail)s',
      targetArg
    ];

    return new Promise((resolve) => {
      let settled = false;
      const child = spawn(config.paths.ytdlpBin, trackArgs, this.getYtDlpSpawnOptions());
      this.activeProcesses.set(downloadId, child);

      let trackOutput = '';
      child.stdout.on('data', chunk => {
        const str = chunk.toString();
        trackOutput += str;
        const pctMatch = str.match(/\[download\]\s+([\d.]+)%/i);
        if (pctMatch && typeof onProgress === 'function') {
          const itemPct = parseFloat(pctMatch[1]);
          const overallPct = Math.round(((itemIndex - 1) / totalTracks) * 100 + (itemPct / totalTracks));
          onProgress({
            downloadId,
            percent: Math.min(99, overallPct),
            itemIndex,
            itemTotal: totalTracks,
            status: `Downloading ${itemIndex} of ${totalTracks}: ${titleLabel} (${Math.round(itemPct)}%)…`
          });
        }
      });
      child.stderr.on('data', chunk => { trackOutput += chunk.toString(); });

      child.on('close', () => {
        this.activeProcesses.delete(downloadId);
        if (settled) return;
        settled = true;

        const lines = trackOutput.split(/[\r\n]+/).map(s => s.trim());
        const recordLine = lines.find(l => l.startsWith('RECORD:'));
        if (!recordLine) return resolve(null);

        const parts = recordLine.substring(7).split('<DELIM>');
        const filepath = parts[0]?.trim();
        if (!filepath || !fs.existsSync(filepath)) return resolve(null);

        resolve({
          filepath,
          ytId: parts[1] || `${Date.now()}_${itemIndex}`,
          rawTitle: parts[2] || '',
          rawArtist: parts[3] || '',
          rawCreator: parts[4] || '',
          rawUploader: parts[5] || '',
          ytDuration: parseInt(parts[6] || parts[4] || '0', 10) || 0,
          ytThumb: parts[7] || parts[5] || ''
        });
      });

      child.on('error', () => {
        this.activeProcesses.delete(downloadId);
        if (!settled) {
          settled = true;
          resolve(null);
        }
      });
    });
  }

  // Download entire Spotify playlist/mix/album with sequential ID3 metadata & live per-track saving
  async downloadSpotifyPlaylist({ spotifyData, downloadId, formatOpts, playlistName, onProgress, originalUrl }) {
    const effectivePlaylistName = (playlistName || spotifyData.name || 'Spotify Playlist').trim();
    const coverUrl = spotifyData.coverUrl || '';

    libraryService.createPlaylist(effectivePlaylistName, coverUrl);
    if (coverUrl) {
      libraryService.setPlaylistCover(effectivePlaylistName, coverUrl);
    }

    const totalTracks = spotifyData.tracks.length;
    const addedTracks = [];
    const orderedTrackIds = [];
    const downloadsDir = config.paths.downloadsDir;

    if (typeof onProgress === 'function') {
      onProgress({
        downloadId,
        percent: 1,
        itemIndex: 0,
        itemTotal: totalTracks,
        playlistCreated: { name: effectivePlaylistName, cover: coverUrl },
        status: `Initialized "${effectivePlaylistName}" (${totalTracks} tracks in sequence)`
      });
    }

    for (let i = 0; i < totalTracks; i++) {
      if (this.canceledDownloads.has(downloadId)) {
        this.canceledDownloads.delete(downloadId);
        libraryService.syncPlaylistSequence(effectivePlaylistName, orderedTrackIds);
        return {
          success: addedTracks.length > 0,
          downloadId,
          canceled: true,
          error: 'Download canceled by user',
          count: addedTracks.length,
          tracks: addedTracks,
          playlist: effectivePlaylistName
        };
      }

      const track = spotifyData.tracks[i];
      const currentPercent = Math.round((i / totalTracks) * 100);

      if (typeof onProgress === 'function') {
        onProgress({
          downloadId,
          percent: currentPercent,
          itemIndex: i + 1,
          itemTotal: totalTracks,
          speed: 'Spotify Engine',
          size: `${i + 1}/${totalTracks}`,
          status: `Downloading ${i + 1} of ${totalTracks}: ${track.title} (${track.artist})…`
        });
      }

      try {
        const queries = this.buildSpotifyQueries(track, formatOpts.isVideo);
        let dlResult = null;
        for (const query of queries) {
          if (this.canceledDownloads.has(downloadId)) break;
          dlResult = await this.runYtDlpTrack({
            downloadId,
            ytdlpArgs: formatOpts.ytdlpArgs,
            targetArg: query,
            itemIndex: i + 1,
            totalTracks,
            titleLabel: track.title,
            onProgress,
            downloadsDir
          });
          if (dlResult) break;
        }

        if (dlResult) {
          await this.embedTrackMetadata(dlResult.filepath, {
            title: track.title,
            artist: track.artist,
            album: effectivePlaylistName,
            trackNumber: i + 1,
            totalTracks
          });

          const filename = path.basename(dlResult.filepath);
          const trackData = {
            id: `${dlResult.ytId}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            originalId: dlResult.ytId,
            title: track.title,
            artist: track.artist,
            album: effectivePlaylistName,
            duration: track.duration || dlResult.ytDuration,
            thumbnail: track.thumbnail || coverUrl || dlResult.ytThumb,
            filename,
            format: formatOpts.ext ? formatOpts.ext.toUpperCase() : undefined,
            bitrate: formatOpts.bitrate || undefined,
            source: 'spotify',
            trackNumber: i + 1,
            downloadUrl: originalUrl,
            addedAt: new Date().toISOString(),
            playlist: effectivePlaylistName
          };

          const savedTrack = libraryService.addTrack(trackData);
          if (savedTrack) {
            libraryService.addTrackToPlaylist(savedTrack.id, effectivePlaylistName);
            orderedTrackIds.push(savedTrack.id);
            addedTracks.push(savedTrack);
            if (typeof onProgress === 'function') {
              onProgress({
                downloadId,
                percent: Math.min(99, Math.round(((i + 1) / totalTracks) * 100)),
                itemIndex: i + 1,
                itemTotal: totalTracks,
                trackSaved: savedTrack,
                playlist: effectivePlaylistName,
                status: `Saved ${i + 1} of ${totalTracks}: ${savedTrack.title} (${savedTrack.artist})`
              });
            }
          }
        }
      } catch (err) {
        console.warn(`[DownloadService] Failed downloading track ${track.title}:`, err.message);
      }
    }

    libraryService.syncPlaylistSequence(effectivePlaylistName, orderedTrackIds);
    if (coverUrl) {
      libraryService.setPlaylistCover(effectivePlaylistName, coverUrl);
    }

    if (typeof onProgress === 'function') {
      onProgress({
        downloadId,
        percent: 100,
        itemIndex: totalTracks,
        itemTotal: totalTracks,
        status: `Completed playlist download (${addedTracks.length}/${totalTracks} tracks saved)`
      });
    }

    return {
      success: addedTracks.length > 0,
      downloadId,
      count: addedTracks.length,
      tracks: addedTracks,
      playlist: effectivePlaylistName,
      error: addedTracks.length === 0 ? 'Could not download tracks from Spotify playlist' : null
    };
  }

  // Download entire YouTube / YouTube Music playlist in exact provider sequence
  async downloadYouTubePlaylist({ ytData, downloadId, formatOpts, playlistName, onProgress, originalUrl }) {
    const effectivePlaylistName = (playlistName || ytData.name || 'YouTube Playlist').trim();
    const coverUrl = ytData.coverUrl || '';

    libraryService.createPlaylist(effectivePlaylistName, coverUrl);
    if (coverUrl) {
      libraryService.setPlaylistCover(effectivePlaylistName, coverUrl);
    }

    const totalTracks = ytData.tracks.length;
    const addedTracks = [];
    const orderedTrackIds = [];
    const downloadsDir = config.paths.downloadsDir;

    if (typeof onProgress === 'function') {
      onProgress({
        downloadId,
        percent: 1,
        itemIndex: 0,
        itemTotal: totalTracks,
        playlistCreated: { name: effectivePlaylistName, cover: coverUrl },
        status: `Initialized "${effectivePlaylistName}" (${totalTracks} tracks in sequence)`
      });
    }

    for (let i = 0; i < totalTracks; i++) {
      if (this.canceledDownloads.has(downloadId)) {
        this.canceledDownloads.delete(downloadId);
        libraryService.syncPlaylistSequence(effectivePlaylistName, orderedTrackIds);
        return {
          success: addedTracks.length > 0,
          downloadId,
          canceled: true,
          error: 'Download canceled by user',
          count: addedTracks.length,
          tracks: addedTracks,
          playlist: effectivePlaylistName
        };
      }

      const track = ytData.tracks[i];
      const overallPercent = Math.round((i / totalTracks) * 100);

      if (typeof onProgress === 'function') {
        onProgress({
          downloadId,
          percent: overallPercent,
          itemIndex: i + 1,
          itemTotal: totalTracks,
          speed: 'YouTube Engine',
          size: `${i + 1}/${totalTracks}`,
          status: `Downloading ${i + 1} of ${totalTracks}: ${track.title}…`
        });
      }

      const trackUrl = track.url || (track.id ? `https://www.youtube.com/watch?v=${track.id}` : null);
      if (!trackUrl) continue;

      try {
        const dlResult = await this.runYtDlpTrack({
          downloadId,
          ytdlpArgs: formatOpts.ytdlpArgs,
          targetArg: trackUrl,
          itemIndex: i + 1,
          totalTracks,
          titleLabel: track.title,
          onProgress,
          downloadsDir
        });

        if (dlResult) {
          const cleaned = this.cleanTrackMetadata({
            title: dlResult.rawTitle || track.title,
            artist: dlResult.rawArtist || track.artist || '',
            creator: dlResult.rawCreator,
            uploader: dlResult.rawUploader || track.uploader || '',
            album: effectivePlaylistName
          });

          await this.embedTrackMetadata(dlResult.filepath, {
            title: cleaned.title,
            artist: cleaned.artist,
            album: effectivePlaylistName,
            trackNumber: i + 1,
            totalTracks
          });

          const filename = path.basename(dlResult.filepath);
          const trackData = {
            id: `${dlResult.ytId}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            originalId: dlResult.ytId,
            title: cleaned.title,
            artist: cleaned.artist,
            album: effectivePlaylistName,
            duration: dlResult.ytDuration || track.duration || 0,
            thumbnail: dlResult.ytThumb || track.thumbnail || coverUrl || '',
            filename,
            format: formatOpts.ext ? formatOpts.ext.toUpperCase() : undefined,
            bitrate: formatOpts.bitrate || undefined,
            source: 'youtube',
            trackNumber: i + 1,
            downloadUrl: originalUrl,
            addedAt: new Date().toISOString(),
            playlist: effectivePlaylistName
          };

          const savedTrack = libraryService.addTrack(trackData);
          if (savedTrack) {
            libraryService.addTrackToPlaylist(savedTrack.id, effectivePlaylistName);
            if (!coverUrl && dlResult.ytThumb) {
              libraryService.setPlaylistCover(effectivePlaylistName, dlResult.ytThumb);
            }
            orderedTrackIds.push(savedTrack.id);
            addedTracks.push(savedTrack);
            if (typeof onProgress === 'function') {
              onProgress({
                downloadId,
                percent: Math.min(99, Math.round(((i + 1) / totalTracks) * 100)),
                itemIndex: i + 1,
                itemTotal: totalTracks,
                trackSaved: savedTrack,
                playlist: effectivePlaylistName,
                status: `Saved ${i + 1} of ${totalTracks}: ${savedTrack.title} (${savedTrack.artist})`
              });
            }
          }
        }
      } catch (err) {
        console.warn(`[DownloadService] Failed downloading YouTube playlist item ${track.title}:`, err.message);
      }
    }

    libraryService.syncPlaylistSequence(effectivePlaylistName, orderedTrackIds);
    if (coverUrl) {
      libraryService.setPlaylistCover(effectivePlaylistName, coverUrl);
    }

    if (typeof onProgress === 'function') {
      onProgress({
        downloadId,
        percent: 100,
        itemIndex: totalTracks,
        itemTotal: totalTracks,
        status: `Completed playlist download (${addedTracks.length}/${totalTracks} tracks saved)`
      });
    }

    return {
      success: addedTracks.length > 0,
      downloadId,
      count: addedTracks.length,
      tracks: addedTracks,
      playlist: effectivePlaylistName,
      error: addedTracks.length === 0 ? 'Could not download tracks from YouTube playlist' : null
    };
  }

  // Start download via auto-selected engine (Spotify Pathfinder/Embed / Zotify / yt-dlp)
  async startDownload({ url: rawUrl, isPlaylist, playlistName, format = 'audio-mp3', onProgress }) {
    // Storage space pre-check
    const diskCheck = this.checkDiskSpace();
    if (!diskCheck.sufficient) {
      return {
        success: false,
        error: diskCheck.error
      };
    }

    const downloadId = Date.now().toString();
    const formatOpts = this.getFormatOptions(format);
    const url = await this.expandShortUrl(rawUrl);

    // 1. Direct High-Resolution Spotify Playlist / Mix / Album / Artist handler
    if (this.isSpotifyPlaylistUrl(url)) {
      if (typeof onProgress === 'function') {
        onProgress({
          downloadId,
          percent: 5,
          speed: 'Spotify Engine',
          size: 'Playlist',
          status: 'Fetching Spotify playlist/mix metadata and full tracklist…'
        });
      }

      const spotifyData = await this.fetchSpotifyPlaylistMetadata(url);
      if (spotifyData && Array.isArray(spotifyData.tracks) && spotifyData.tracks.length > 0) {
        return this.downloadSpotifyPlaylist({
          spotifyData,
          downloadId,
          formatOpts,
          playlistName: playlistName || spotifyData.name,
          onProgress,
          originalUrl: url
        });
      }

      // Never fall back a Spotify playlist/mix URL to single-track oEmbed search (which produces 1-song broken playlists)
      return {
        success: false,
        downloadId,
        error: 'Could not extract tracks from this Spotify playlist or mix. If it is personalized or private (Daily Mix, Blend, Daylist), sign in to Spotify in Brave Music and try again.'
      };
    }

    const isSpotify = this.isSpotifyUrl(url);
    const urlIsPlaylist = /[?&]list=[a-zA-Z0-9_-]+/i.test(url) || /\/playlist\b/i.test(url) || /\/album\b/i.test(url) || /\/artist\b/i.test(url);
    const effectiveIsPlaylist = Boolean(isPlaylist || urlIsPlaylist);

    // 2. Direct High-Resolution YouTube Playlist Handler
    if (this.isYouTubePlaylistUrl(url) || (effectiveIsPlaylist && !isSpotify)) {
      if (typeof onProgress === 'function') {
        onProgress({
          downloadId,
          percent: 5,
          speed: 'YouTube Engine',
          size: 'Playlist',
          status: 'Fetching YouTube playlist metadata and cover art…'
        });
      }

      const ytData = await this.fetchYouTubePlaylistMetadata(url);
      if (ytData && Array.isArray(ytData.tracks) && ytData.tracks.length > 0) {
        return this.downloadYouTubePlaylist({
          ytData,
          downloadId,
          formatOpts,
          playlistName: playlistName || ytData.name,
          onProgress,
          originalUrl: url
        });
      }
    }

    // 3. If single Spotify track and Zotify credentials exist, try Zotify first
    if (isSpotify && !formatOpts.isVideo && this.hasZotifyCredentials()) {
      if (typeof onProgress === 'function') {
        onProgress({ downloadId, percent: 10, speed: 'Zotify', size: 'Audio', eta: 'Authenticating…' });
      }

      const zotifyResult = await this.downloadViaZotify({
        url,
        downloadId,
        formatOptions: formatOpts,
        onProgress
      });

      if (zotifyResult.success) {
        return zotifyResult;
      }
      console.log('[DownloadService] Zotify fallback triggered, continuing with yt-dlp engine…');
    }

    // 4. Main Fallback Engine (yt-dlp) with Spotify embed resolution & Clean Metadata
    const resolved = await this.resolveUrl(url, formatOpts.isVideo);

    const baseArgs = [
      ...formatOpts.ytdlpArgs,
      '--progress',
      '--newline',
      '--no-warnings',
      '--socket-timeout', String(config.audio.socketTimeout),
      '--match-filter', '!is_live',
      '--print', 'after_move:RECORD:%(filepath)s<DELIM>%(id)s<DELIM>%(title)s<DELIM>%(artist)s<DELIM>%(creator)s<DELIM>%(uploader)s<DELIM>%(duration)s<DELIM>%(thumbnail)s<DELIM>%(playlist_title)s'
    ];

    if (!effectiveIsPlaylist) {
      baseArgs.push('--no-playlist');
      baseArgs.push('-o', path.join(config.paths.downloadsDir, '%(title).100B [%(id)s].%(ext)s'));
    } else {
      baseArgs.push('--yes-playlist');
      baseArgs.push('--ignore-errors');
      baseArgs.push('--no-abort-on-error');
      baseArgs.push('-o', path.join(config.paths.downloadsDir, '%(title).100B [%(id)s].%(ext)s'));
    }

    baseArgs.push(resolved.url);

    return new Promise((resolve) => {
      let isSettled = false;
      const child = spawn(config.paths.ytdlpBin, baseArgs, this.getYtDlpSpawnOptions());
      this.activeProcesses.set(downloadId, child);

      // Inactivity timeout: if no output for 90 seconds, terminate stalled download
      let activityTimer = null;
      const resetActivityTimer = () => {
        if (activityTimer) clearTimeout(activityTimer);
        activityTimer = setTimeout(() => {
          if (!isSettled) {
            isSettled = true;
            console.warn('[DownloadService] yt-dlp activity timeout (90s idle)');
            try { child.kill('SIGTERM'); } catch (e) { }
            setTimeout(() => {
              try { child.kill('SIGKILL'); } catch (e) { }
            }, 2000);
            this.activeProcesses.delete(downloadId);
            resolve({
              success: false,
              downloadId,
              error: 'Download stalled: network stream timed out after 90s of inactivity'
            });
          }
        }, 90000);
      };

      resetActivityTimer();

      const outputLines = [];
      let errOutput = '';

      const handleProgressLine = (line) => {
        if (!line || typeof onProgress !== 'function') return;

        // 1. Playlist item counter
        const itemMatch = line.match(/\[download\]\s+Downloading\s+(?:item|video)\s+(\d+)\s+of\s+(\d+)/i);
        if (itemMatch) {
          const cur = parseInt(itemMatch[1], 10);
          const total = parseInt(itemMatch[2], 10);
          onProgress({
            downloadId,
            percent: Math.round(((cur - 1) / total) * 100),
            itemIndex: cur,
            itemTotal: total,
            status: `Downloading item ${cur} of ${total}…`
          });
          return;
        }

        // 2. Stream destination / format indicator
        const destMatch = line.match(/\[download\]\s+Destination:\s+(.+)/i);
        if (destMatch) {
          const destFile = destMatch[1];
          const isVideoExt = /\.(mp4|webm|mkv|m4v)/i.test(destFile);
          const isAudioExt = /\.(m4a|mp3|opus|aac|flac|wav)/i.test(destFile);
          if (isVideoExt) {
            onProgress({
              downloadId,
              status: 'Downloading video stream…'
            });
          } else if (isAudioExt) {
            onProgress({
              downloadId,
              status: 'Downloading audio stream…'
            });
          }
          return;
        }

        // 3. Post-processing / FFmpeg merger
        if (/\[(?:Merger|ffmpeg)\]/i.test(line)) {
          onProgress({
            downloadId,
            percent: 98,
            speed: 'FFmpeg Engine',
            status: 'Merging video & audio streams with FFmpeg…'
          });
          return;
        }

        // 4. Download 100% completion notice
        if (/\[download\]\s+100%/i.test(line)) {
          onProgress({
            downloadId,
            percent: 100,
            speed: 'Finalizing',
            status: 'Processing metadata and saving track…'
          });
          return;
        }

        // 5. Real-time download progress percentage, speed and ETA
        const pctMatch = line.match(/\[download\]\s+([\d.]+)%/i);
        if (pctMatch) {
          const pct = parseFloat(pctMatch[1]);
          const sizeMatch = line.match(/of\s+(?:~\s*)?([\d.]+\s*[a-zA-Z]+)/i);
          const size = sizeMatch ? sizeMatch[1].trim() : '';
          const speedMatch = line.match(/at\s+((?:~?\s*[\d.]+\s*[a-zA-Z/]+)|(?:Unknown(?:\s+speed)?))/i);
          const speed = speedMatch ? speedMatch[1].trim() : '';
          const etaMatch = line.match(/ETA\s+([\d:]+|Unknown)/i);
          const eta = etaMatch ? etaMatch[1].trim() : '';

          onProgress({
            downloadId,
            percent: pct,
            size,
            speed,
            eta,
            status: pct >= 100 ? 'Stream downloaded, finalizing…' : (size ? `Downloading stream (${size})` : 'Downloading stream…')
          });
          return;
        }
      };

      child.stdout.on('data', (chunk) => {
        resetActivityTimer();
        const text = chunk.toString();
        const lines = text.split(/[\r\n]+/).map(s => s.trim()).filter(Boolean);
        outputLines.push(...lines);
        for (const line of lines) {
          handleProgressLine(line);
        }
      });

      child.stderr.on('data', (chunk) => {
        resetActivityTimer();
        const text = chunk.toString();
        errOutput += text;
        const lines = text.split(/[\r\n]+/).map(s => s.trim()).filter(Boolean);
        for (const line of lines) {
          handleProgressLine(line);
        }
      });

      child.on('close', async (code) => {
        if (activityTimer) clearTimeout(activityTimer);
        this.activeProcesses.delete(downloadId);

        if (isSettled) return;
        isSettled = true;

        const recordLines = outputLines.filter(l => typeof l === 'string' && l.startsWith('RECORD:'));

        if (code === 0 || (effectiveIsPlaylist && recordLines.length > 0)) {
          const addedTracks = [];

          for (const line of recordLines) {
            const rawContent = line.substring(7); // strip 'RECORD:'
            const parts = rawContent.split('<DELIM>');
            const filepath = parts[0] ? parts[0].trim() : '';
            const id = parts[1] || downloadId;
            const rawTitle = resolved.spotifyTitle || parts[2] || 'Unknown Track';
            const rawArtist = resolved.spotifyArtist || parts[3] || '';
            const rawCreator = parts[4] || '';
            const rawUploader = parts[5] || '';
            const duration = parseInt(parts[6] || parts[4] || '0', 10);
            const thumbnail = resolved.thumbnail || parts[7] || parts[5] || '';
            const extractedPlaylist = (effectiveIsPlaylist && parts[8] && parts[8] !== 'NA' && parts[8].trim()) ? parts[8].trim() : null;

            const targetPlaylistName = playlistName || extractedPlaylist || (effectiveIsPlaylist ? 'Downloaded Playlist' : null);

            if (filepath && fs.existsSync(filepath)) {
              const filename = path.basename(filepath);
              const cleaned = this.cleanTrackMetadata({
                title: rawTitle,
                artist: rawArtist,
                creator: rawCreator,
                uploader: rawUploader,
                album: targetPlaylistName
              });

              await this.embedTrackMetadata(filepath, {
                title: cleaned.title,
                artist: cleaned.artist,
                album: targetPlaylistName || 'Single',
                trackNumber: recordLines.length > 1 ? addedTracks.length + 1 : 1,
                totalTracks: recordLines.length > 1 ? recordLines.length : 1
              });

              const trackData = {
                id: `${id}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
                originalId: id,
                title: cleaned.title,
                artist: cleaned.artist,
                album: targetPlaylistName || (effectiveIsPlaylist ? 'Downloaded Album' : 'Single'),
                duration,
                thumbnail,
                filename,
                format: formatOpts.ext ? formatOpts.ext.toUpperCase() : undefined,
                bitrate: formatOpts.bitrate || undefined,
                source: resolved.isSpotify ? 'spotify' : 'youtube',
                downloadUrl: url,
                addedAt: new Date().toISOString(),
                playlist: targetPlaylistName
              };

              const saved = libraryService.addTrack(trackData);
              if (saved) {
                addedTracks.push(saved);
                if (targetPlaylistName) {
                  libraryService.createPlaylist(targetPlaylistName, thumbnail);
                  libraryService.addTrackToPlaylist(saved.id, targetPlaylistName);
                }
                if (typeof onProgress === 'function') {
                  onProgress({
                    downloadId,
                    trackSaved: saved,
                    playlist: targetPlaylistName,
                    status: `Saved track: ${saved.title} (${saved.artist})`
                  });
                }
              }
            }
          }

          if (addedTracks.length === 0) {
            resolve({
              success: false,
              downloadId,
              error: 'No downloadable media found at the provided URL'
            });
            return;
          }

          resolve({
            success: true,
            downloadId,
            count: addedTracks.length,
            tracks: addedTracks
          });
        } else {
          if (child._canceled) {
            resolve({
              success: false,
              downloadId,
              canceled: true,
              error: 'Download canceled by user'
            });
            return;
          }

          console.error('[DownloadService] Download engine error:', errOutput);
          let userMsg = errOutput;
          if (errOutput.includes('matches filter !is_live')) {
            userMsg = 'Live streams cannot be downloaded. Please provide a regular track or playlist link.';
          } else if (errOutput.includes('No space left on device') || errOutput.includes('ENOSPC')) {
            userMsg = 'Storage full: Device ran out of disk space while saving media.';
          } else if (errOutput.includes('HTTP Error 403') || errOutput.includes('Sign in to confirm')) {
            userMsg = 'Provider restricted this stream. Try another format or check back in a moment.';
          } else if (errOutput.includes('timed out') || errOutput.includes('IncompleteRead')) {
            userMsg = 'Connection timed out while downloading stream. Please check your internet connection.';
          } else if (errOutput.includes('Video unavailable') || errOutput.includes('Private video')) {
            userMsg = 'This track or video is unavailable or marked private.';
          } else if (errOutput.includes('is not a valid URL')) {
            userMsg = 'Invalid link format. Please provide a valid YouTube or Spotify URL.';
          }

          if (userMsg === errOutput) {
            const errorMatch = errOutput.match(/ERROR:\s*([^\r\n]+)/i);
            if (errorMatch) {
              userMsg = errorMatch[1].trim();
            } else {
              const firstLine = (errOutput.split(/[\r\n]+/)[0] || 'Download process exited with error').trim();
              userMsg = firstLine.length > 120 ? firstLine.substring(0, 117) + '…' : firstLine;
            }
          }

          resolve({
            success: false,
            downloadId,
            error: userMsg || 'Process exited with non-zero status'
          });
        }
      });

      child.on('error', (err) => {
        if (activityTimer) clearTimeout(activityTimer);
        this.activeProcesses.delete(downloadId);
        if (isSettled) return;
        isSettled = true;
        console.error('[DownloadService] Process error:', err.message);
        let userMsg = err.message;
        if (err.code === 'ENOENT') {
          userMsg = 'yt-dlp engine not found. Please ensure yt-dlp is installed on your system.';
        }
        resolve({
          success: false,
          downloadId,
          error: userMsg
        });
      });
    });
  }

  // Cancel an active download by ID
  cancelDownload(downloadId) {
    this.canceledDownloads.add(downloadId);
    const proc = this.activeProcesses.get(downloadId);
    if (proc) {
      try {
        proc._canceled = true;
        proc.kill('SIGTERM');
        setTimeout(() => {
          try { proc.kill('SIGKILL'); } catch (e) { }
        }, 1200);
        this.activeProcesses.delete(downloadId);
        return { success: true, downloadId };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
    return { success: true, downloadId };
  }
}

module.exports = new DownloadService();
