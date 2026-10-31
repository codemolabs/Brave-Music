const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const config = require('../config/appConfig');
const libraryService = require('./LibraryService');

class DownloadService {
  constructor() {
    this.activeProcesses = new Map(); // downloadId -> ChildProcess
    this.canceledDownloads = new Set();
  }

  // Check if URL is from Spotify
  isSpotifyUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return /open\.spotify\.com\/(track|album|playlist|episode)\/|spotify:(track|album|playlist):/i.test(url.trim());
  }

  // Check if URL is a Spotify playlist or album
  isSpotifyPlaylistUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return /open\.spotify\.com\/(playlist|album)\/([a-zA-Z0-9]+)/i.test(url.trim()) ||
           /spotify:(playlist|album):([a-zA-Z0-9]+)/i.test(url.trim());
  }

  // Check if Zotify has authenticated credentials saved
  hasZotifyCredentials() {
    const credPath = path.join(os.homedir(), '.config', 'zotify', 'credentials.json');
    try {
      if (fs.existsSync(credPath)) {
        const stat = fs.statSync(credPath);
        return stat.size > 20; // genuine credentials file has tokens and is > 20 bytes
      }
    } catch (e) {}
    return false;
  }

  // Fetch full Spotify playlist or album metadata via public embed endpoint
  async fetchSpotifyPlaylistMetadata(url) {
    const trimmed = String(url || '').trim();
    const match = trimmed.match(/open\.spotify\.com\/(playlist|album)\/([a-zA-Z0-9]+)/i) ||
                  trimmed.match(/spotify:(playlist|album):([a-zA-Z0-9]+)/i);
    if (!match) return null;
    const type = match[1].toLowerCase();
    const id = match[2];
    const embedUrl = `https://open.spotify.com/embed/${type}/${id}`;

    return new Promise((resolve) => {
      const req = https.get(embedUrl, {
        family: 4,
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return resolve(null);
        }
        let html = '';
        res.on('data', chunk => {
          html += chunk;
          if (html.length > 8 * 1024 * 1024) {
            res.destroy();
            resolve(null);
          }
        });
        res.on('end', () => {
          try {
            const scriptMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
            if (!scriptMatch) return resolve(null);
            const data = JSON.parse(scriptMatch[1]);
            const entity = data?.props?.pageProps?.state?.data?.entity;
            if (!entity) return resolve(null);

            const name = entity.name || entity.title || 'Spotify Playlist';
            const coverUrl = entity.coverArt?.sources?.[0]?.url ||
                             entity.visualIdentity?.image?.[0]?.url || '';
            const rawTracks = entity.trackList || [];
            const tracks = rawTracks.map(t => ({
              title: t.title || t.name,
              artist: t.subtitle || (Array.isArray(t.artists) ? t.artists.map(a => a.name).join(', ') : 'Unknown Artist'),
              duration: typeof t.duration === 'number' ? Math.round(t.duration / 1000) : 0,
              thumbnail: coverUrl
            })).filter(t => Boolean(t.title));

            resolve({
              name,
              coverUrl,
              type,
              id,
              tracks
            });
          } catch (e) {
            resolve(null);
          }
        });
      });

      req.on('error', () => resolve(null));
      req.setTimeout(12000, () => {
        req.destroy();
        resolve(null);
      });
    });
  }

  // Resolve Spotify metadata if URL is from open.spotify.com
  async resolveUrl(inputUrl, isVideo = false) {
    const trimmed = String(inputUrl || '').trim();
    
    // Check if it's a Spotify track, album, or playlist
    const spotifyMatch = trimmed.match(/open\.spotify\.com\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)/i) ||
                         trimmed.match(/spotify:(track|album|playlist):([a-zA-Z0-9]+)/i);
    if (!spotifyMatch) {
      return { url: trimmed, isSpotify: false };
    }

    const type = spotifyMatch[1].toLowerCase();
    const id = spotifyMatch[2];
    const suffix = isVideo ? 'official music video' : 'official audio';

    // 1. Try public embed endpoint for complete title, artists, and high-res cover art
    try {
      const embedUrl = `https://open.spotify.com/embed/${type}/${id}`;
      const embedEntity = await new Promise((resolve) => {
        const req = https.get(embedUrl, {
          family: 4,
          headers: {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9'
          }
        }, (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            return resolve(null);
          }
          let data = '';
          res.on('data', chunk => {
            data += chunk;
            if (data.length > 5 * 1024 * 1024) {
              res.destroy();
              resolve(null);
            }
          });
          res.on('end', () => {
            try {
              const scriptMatch = data.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
              if (!scriptMatch) return resolve(null);
              const json = JSON.parse(scriptMatch[1]);
              resolve(json?.props?.pageProps?.state?.data?.entity || null);
            } catch (e) {
              resolve(null);
            }
          });
        });
        req.on('error', () => resolve(null));
        req.setTimeout(6000, () => {
          req.destroy();
          resolve(null);
        });
      });

      if (embedEntity) {
        const title = embedEntity.name || embedEntity.title || '';
        let artist = '';
        if (Array.isArray(embedEntity.artists) && embedEntity.artists.length > 0) {
          artist = embedEntity.artists.map(a => a.name).join(', ');
        } else if (embedEntity.subtitle) {
          artist = embedEntity.subtitle;
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

    // 2. Fallback to Spotify public oEmbed endpoint
    try {
      const oEmbedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(trimmed)}`;
      const metadata = await new Promise((resolve) => {
        const req = https.get(oEmbedUrl, { family: 4 }, (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            return resolve(null);
          }
          let data = '';
          res.on('data', chunk => {
            data += chunk;
            if (data.length > 60000) {
              res.destroy();
              resolve(null);
            }
          });
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              resolve(null);
            }
          });
        });
        req.on('error', () => resolve(null));
        req.setTimeout(5000, () => {
          req.destroy();
          resolve(null);
        });
      });

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

  // Get format parameters
  getFormatOptions(format = 'audio-mp3') {
    switch (format) {
      case 'audio-flac':
        return {
          isVideo: false,
          ext: 'flac',
          zotifyCodec: 'flac',
          ytdlpArgs: ['-x', '--audio-format', 'flac']
        };
      case 'audio-m4a':
        return {
          isVideo: false,
          ext: 'm4a',
          zotifyCodec: 'aac',
          ytdlpArgs: ['-f', 'bestaudio[ext=m4a]/bestaudio']
        };
      case 'video-mp4':
        return {
          isVideo: true,
          ext: 'mp4',
          zotifyCodec: null,
          ytdlpArgs: ['-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best', '--merge-output-format', 'mp4']
        };
      case 'video-720p':
        return {
          isVideo: true,
          ext: 'mp4',
          zotifyCodec: null,
          ytdlpArgs: ['-f', 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best', '--merge-output-format', 'mp4']
        };
      case 'audio-mp3':
      default:
        return {
          isVideo: false,
          ext: 'mp3',
          zotifyCodec: 'mp3',
          ytdlpArgs: ['-x', '--audio-format', 'mp3', '--audio-quality', '0']
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
      const child = spawn(config.paths.zotifyBin, zotifyArgs);
      this.activeProcesses.set(downloadId, child);

      // 25 second timeout safeguard in case zotify hangs on interactive login prompt
      const timeoutTimer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          try { child.kill('SIGKILL'); } catch (e) {}
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
            try { child.kill('SIGTERM'); } catch (e) {}
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

  // Download entire Spotify playlist / album using embed metadata and high-performance audio engine
  async downloadSpotifyPlaylist({ spotifyData, downloadId, formatOpts, playlistName, onProgress, originalUrl }) {
    const effectivePlaylistName = (playlistName || spotifyData.name || 'Spotify Playlist').trim();
    const coverUrl = spotifyData.coverUrl || '';

    // Initialize playlist and cover in library
    libraryService.createPlaylist(effectivePlaylistName, coverUrl);
    if (coverUrl) {
      libraryService.setPlaylistCover(effectivePlaylistName, coverUrl);
    }

    const totalTracks = spotifyData.tracks.length;
    const addedTracks = [];
    const downloadsDir = config.paths.downloadsDir;

    for (let i = 0; i < totalTracks; i++) {
      if (this.canceledDownloads.has(downloadId)) {
        this.canceledDownloads.delete(downloadId);
        return {
          success: false,
          downloadId,
          canceled: true,
          error: 'Download canceled by user',
          count: addedTracks.length,
          tracks: addedTracks
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

      const suffix = formatOpts.isVideo ? 'official music video' : 'official audio';
      const searchQuery = `ytsearch1:${track.title} ${track.artist} ${suffix}`;

      const trackArgs = [
        ...formatOpts.ytdlpArgs,
        '--no-playlist',
        '--no-warnings',
        '--socket-timeout', String(config.audio.socketTimeout),
        '--match-filter', '!is_live',
        '-o', path.join(downloadsDir, '%(title).100B [%(id)s].%(ext)s'),
        '--print', 'after_move:RECORD:%(filepath)s<DELIM>%(id)s<DELIM>%(title)s<DELIM>%(uploader)s<DELIM>%(duration)s<DELIM>%(thumbnail)s',
        searchQuery
      ];

      try {
        const savedTrack = await new Promise((resolveTrack) => {
          let trackSettled = false;
          const child = spawn(config.paths.ytdlpBin, trackArgs);
          this.activeProcesses.set(downloadId, child);

          let trackOutput = '';
          child.stdout.on('data', chunk => {
            const str = chunk.toString();
            trackOutput += str;
            const pctMatch = str.match(/\[download\]\s+([\d.]+)%/i);
            if (pctMatch && typeof onProgress === 'function') {
              const itemPct = parseFloat(pctMatch[1]);
              const overallPct = Math.round((i / totalTracks) * 100 + (itemPct / totalTracks));
              onProgress({
                downloadId,
                percent: Math.min(99, overallPct),
                itemIndex: i + 1,
                itemTotal: totalTracks,
                status: `Downloading ${i + 1} of ${totalTracks}: ${track.title} (${Math.round(itemPct)}%)…`
              });
            }
          });
          child.stderr.on('data', chunk => trackOutput += chunk.toString());

          child.on('close', (code) => {
            this.activeProcesses.delete(downloadId);
            if (trackSettled) return;
            trackSettled = true;

            const lines = trackOutput.split(/[\r\n]+/).map(s => s.trim());
            const recordLine = lines.find(l => l.startsWith('RECORD:'));
            if (recordLine) {
              const parts = recordLine.substring(7).split('<DELIM>');
              const filepath = parts[0]?.trim();
              const ytId = parts[1] || `${Date.now()}_${i}`;
              const ytDuration = parseInt(parts[4] || '0', 10);
              const ytThumb = parts[5] || '';

              if (filepath && fs.existsSync(filepath)) {
                const filename = path.basename(filepath);
                const trackData = {
                  id: `${ytId}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
                  originalId: ytId,
                  title: track.title, // Preserves genuine original title
                  artist: track.artist, // Preserves genuine original artist
                  album: effectivePlaylistName,
                  duration: track.duration || ytDuration,
                  thumbnail: coverUrl || ytThumb,
                  filename,
                  downloadUrl: originalUrl,
                  addedAt: new Date().toISOString(),
                  playlist: effectivePlaylistName
                };
                const saved = libraryService.addTrack(trackData);
                if (saved) {
                  libraryService.addTrackToPlaylist(saved.id, effectivePlaylistName);
                  return resolveTrack(saved);
                }
              }
            }
            resolveTrack(null);
          });

          child.on('error', () => {
            this.activeProcesses.delete(downloadId);
            if (!trackSettled) {
              trackSettled = true;
              resolveTrack(null);
            }
          });
        });

        if (savedTrack) {
          addedTracks.push(savedTrack);
        }
      } catch (err) {
        console.warn(`[DownloadService] Failed downloading track ${track.title}:`, err.message);
      }
    }

    if (coverUrl) {
      libraryService.setPlaylistCover(effectivePlaylistName, coverUrl);
    }

    if (typeof onProgress === 'function') {
      onProgress({
        downloadId,
        percent: 100,
        itemIndex: totalTracks,
        itemTotal: totalTracks,
        status: `Completed playlist download (${addedTracks.length} tracks saved)`
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

  // Start download via auto-selected engine (Spotify embed / Zotify / yt-dlp)
  async startDownload({ url, isPlaylist, playlistName, format = 'audio-mp3', onProgress }) {
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

    // 1. Direct High-Resolution Spotify Playlist / Album handler
    if (this.isSpotifyPlaylistUrl(url)) {
      if (typeof onProgress === 'function') {
        onProgress({
          downloadId,
          percent: 5,
          speed: 'Spotify Engine',
          size: 'Playlist',
          status: 'Fetching Spotify playlist metadata and tracks…'
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
    }

    const isSpotify = this.isSpotifyUrl(url);

    // 2. If single Spotify track and Zotify credentials exist, try Zotify first
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

    // 3. Main Engine (yt-dlp) with Spotify embed resolution & YouTube Playlist Handling
    const resolved = await this.resolveUrl(url, formatOpts.isVideo);
    const urlIsPlaylist = /[?&]list=[a-zA-Z0-9_-]+/i.test(url) || /\/playlist\b/i.test(url) || /\/album\b/i.test(url);
    const effectiveIsPlaylist = Boolean(isPlaylist || urlIsPlaylist);

    const baseArgs = [
      ...formatOpts.ytdlpArgs,
      '--progress',
      '--newline',
      '--no-warnings',
      '--socket-timeout', String(config.audio.socketTimeout),
      '--match-filter', '!is_live',
      '--print', 'after_move:RECORD:%(filepath)s<DELIM>%(id)s<DELIM>%(title)s<DELIM>%(uploader)s<DELIM>%(duration)s<DELIM>%(thumbnail)s<DELIM>%(playlist_title)s'
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
      const child = spawn(config.paths.ytdlpBin, baseArgs);
      this.activeProcesses.set(downloadId, child);

      // Inactivity timeout: if no output for 90 seconds, terminate stalled download
      let activityTimer = null;
      const resetActivityTimer = () => {
        if (activityTimer) clearTimeout(activityTimer);
        activityTimer = setTimeout(() => {
          if (!isSettled) {
            isSettled = true;
            console.warn('[DownloadService] yt-dlp activity timeout (90s idle)');
            try { child.kill('SIGTERM'); } catch (e) {}
            setTimeout(() => {
              try { child.kill('SIGKILL'); } catch (e) {}
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

      child.on('close', (code) => {
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
            const title = parts[2] || resolved.spotifyTitle || 'Unknown Track';
            const artist = resolved.spotifyArtist || parts[3] || 'Brave Music';
            const duration = parseInt(parts[4] || '0', 10);
            const thumbnail = parts[5] || resolved.thumbnail || '';
            const extractedPlaylist = (parts[6] && parts[6] !== 'NA' && parts[6].trim()) ? parts[6].trim() : null;

            const targetPlaylistName = playlistName || extractedPlaylist || (effectiveIsPlaylist ? 'Downloaded Playlist' : null);

            if (filepath && fs.existsSync(filepath)) {
              const filename = path.basename(filepath);
              const trackData = {
                id: `${id}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
                originalId: id,
                title, // Genuine original title preserved!
                artist,
                album: targetPlaylistName || (effectiveIsPlaylist ? 'Downloaded Album' : 'Single'),
                duration,
                thumbnail,
                filename,
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
          try { proc.kill('SIGKILL'); } catch (e) {}
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
