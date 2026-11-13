const path = require('path');
const os = require('os');
const fs = require('fs');

// Brave Music Application Storage Configuration (Linux)
const DATA_DIR = process.env.BRAVE_MUSIC_DATA_DIR || path.join(os.homedir(), '.local', 'share', 'brave-music');
const DOWNLOADS_DIR = path.join(DATA_DIR, 'downloads');
const THUMBNAILS_DIR = path.join(DATA_DIR, 'thumbnails');
const DB_FILE = path.join(DATA_DIR, 'library.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const BUNDLED_BIN_DIR = path.resolve(__dirname, '..', 'bin');

// Ensure necessary directories exist
fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });

function loadCustomSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('[appConfig] Error reading settings.json:', e.message);
  }
  return {};
}

const savedSettings = loadCustomSettings();
let currentDownloadsDir = (savedSettings && savedSettings.downloadsDir && fs.existsSync(savedSettings.downloadsDir))
  ? savedSettings.downloadsDir
  : DOWNLOADS_DIR;

// Locate yt-dlp binary (prioritizing Snap / bundled standalone engine so it never fails inside sandboxes)
function resolveYtDlpBinary() {
  const envPath = process.env.YTM_YTDLP || process.env.YTDLP_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  const snapRoot = process.env.SNAP || '';
  const candidatePaths = [
    snapRoot ? path.join(snapRoot, 'opt', 'brave-music', 'backend', 'bin', 'yt-dlp') : null,
    snapRoot ? path.join(snapRoot, 'bin', 'yt-dlp') : null,
    path.join(BUNDLED_BIN_DIR, 'yt-dlp'),
    '/opt/brave-music/backend/bin/yt-dlp',
    path.join(os.homedir(), '.local', 'bin', 'yt-dlp'),
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    '/bin/yt-dlp'
  ];

  for (const p of candidatePaths) {
    if (p && fs.existsSync(p)) return p;
  }

  return 'yt-dlp';
}

// Locate Node JS runtime wrapper for yt-dlp EJS signature decryption
function resolveNodeBinary() {
  const snapRoot = process.env.SNAP || '';
  const candidatePaths = [
    snapRoot ? path.join(snapRoot, 'opt', 'brave-music', 'backend', 'bin', 'node') : null,
    path.join(BUNDLED_BIN_DIR, 'node'),
    '/opt/brave-music/backend/bin/node',
    '/usr/local/bin/node',
    '/usr/bin/node',
    '/bin/node'
  ];

  for (const p of candidatePaths) {
    if (p && fs.existsSync(p)) return p;
  }

  return null;
}

// Check if both ffmpeg and ffprobe are available for audio postprocessing
function resolveFfmpegDir() {
  const snapRoot = process.env.SNAP || '';
  const candidateDirs = [
    snapRoot ? path.join(snapRoot, 'opt', 'brave-music', 'backend', 'bin') : null,
    snapRoot ? path.join(snapRoot, 'usr', 'bin') : null,
    snapRoot ? path.join(snapRoot, 'bin') : null,
    BUNDLED_BIN_DIR,
    '/usr/local/bin',
    '/usr/bin',
    '/bin'
  ];

  for (const dir of candidateDirs) {
    if (dir && fs.existsSync(path.join(dir, 'ffmpeg')) && fs.existsSync(path.join(dir, 'ffprobe'))) {
      return dir;
    }
  }

  return null;
}

// Locate zotify binary
function resolveZotifyBinary() {
  const envPath = process.env.BRAVE_MUSIC_ZOTIFY || process.env.ZOTIFY_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  const snapRoot = process.env.SNAP || '';
  const candidatePaths = [
    snapRoot ? path.join(snapRoot, 'bin', 'zotify') : null,
    path.join(BUNDLED_BIN_DIR, 'zotify'),
    path.join(os.homedir(), '.local', 'bin', 'zotify'),
    '/usr/local/bin/zotify',
    '/usr/bin/zotify',
    '/bin/zotify'
  ];

  for (const p of candidatePaths) {
    if (p && fs.existsSync(p)) return p;
  }

  return 'zotify';
}

const config = {
  paths: {
    dataDir: DATA_DIR,
    bundledBinDir: BUNDLED_BIN_DIR,
    get downloadsDir() {
      return currentDownloadsDir;
    },
    set downloadsDir(newDir) {
      if (newDir && typeof newDir === 'string') {
        currentDownloadsDir = newDir;
        try {
          fs.mkdirSync(newDir, { recursive: true });
          const settings = loadCustomSettings();
          settings.downloadsDir = newDir;
          fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
        } catch (e) {
          console.error('[appConfig] Error saving settings:', e.message);
        }
      }
    },
    thumbnailsDir: THUMBNAILS_DIR,
    dbFile: DB_FILE,
    settingsFile: SETTINGS_FILE,
    get ytdlpBin() {
      return resolveYtDlpBinary();
    },
    get nodeBin() {
      return resolveNodeBinary();
    },
    get ffmpegDir() {
      return resolveFfmpegDir();
    },
    get hasFfmpeg() {
      return Boolean(resolveFfmpegDir());
    },
    get zotifyBin() {
      return resolveZotifyBinary();
    }
  },
  audio: {
    format: 'm4a',
    qualitySelector: 'bestaudio[ext=m4a]/bestaudio',
    socketTimeout: 15
  },
  adblock: {
    patterns: [
      '*://*.doubleclick.net/*',
      '*://*.googleadservices.com/*',
      '*://*.googlesyndication.com/*',
      '*://*.adservice.google.*/*',
      '*://*.adservice.google.com/*',
      '*://*.youtube.com/pagead/*',
      '*://*.youtube.com/api/stats/ads*',
      '*://*.youtube.com/ptracking*',
      '*://*.youtube.com/youtubei/v1/log_event*',
      '*://*.youtube.com/api/stats/qoe?*adformat*',
      '*://*.youtube.com/pagead/parallel_ad_playback*',
      '*://*.youtube.com/generate_204*',
      '*://*.youtube.com/get_midroll_info*',
      '*://*.youtube.com/youtubei/v1/player/ad_break*',
      '*://*.googlevideo.com/videoplayback?*&adformat=*',
      '*://*.googlevideo.com/videoplayback?*&oad=*',
      '*://*.googlevideo.com/videoplayback?*&ctier=*',
      '*://*.spclient.wg.spotify.com/ads/*',
      '*://*.spclient.wg.spotify.com/ad-logic/*',
      '*://*.spclient.wg.spotify.com/audio-stream-ad/*',
      '*://*.spclient.wg.spotify.com/melody/v1/check_edge*',
      '*://*.audio-ak-spotify-com.akamaized.net/ad/*',
      '*://*.audio-akp-spotify-com.akamaized.net/ad/*',
      '*://*.spotify.com/ad-logic/*',
      '*://*.spotify.com/ads/*',
      '*://*.scorecardresearch.com/*',
      '*://*.quantserve.com/*',
      '*://*.moatads.com/*',
      '*://*.pubmatic.com/*',
      '*://*.adnxs.com/*',
      '*://*.rubiconproject.com/*',
      '*://*.criteo.com/*'
    ]
  }
};

module.exports = config;
