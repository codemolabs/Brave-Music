const path = require('path');
const os = require('os');
const fs = require('fs');

const isWin = process.platform === 'win32';

// Brave Music Application Storage Configuration
const DATA_DIR = process.env.BRAVE_MUSIC_DATA_DIR || (
  isWin
    ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'brave-music')
    : path.join(os.homedir(), '.local', 'share', 'brave-music')
);
const DOWNLOADS_DIR = path.join(DATA_DIR, 'downloads');
const THUMBNAILS_DIR = path.join(DATA_DIR, 'thumbnails');
const DB_FILE = path.join(DATA_DIR, 'library.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

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

// Locate yt-dlp binary
function resolveYtDlpBinary() {
  const envPath = process.env.YTM_YTDLP || process.env.YTDLP_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  const binaryName = isWin ? 'yt-dlp.exe' : 'yt-dlp';
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');

  const candidatePaths = isWin ? [
    path.join(__dirname, '..', '..', 'bin', binaryName),
    path.join(process.resourcesPath || '', 'bin', binaryName),
    path.join(process.resourcesPath || '', binaryName),
    path.join(localAppData, 'Programs', 'yt-dlp', binaryName),
    path.join(localAppData, 'Microsoft', 'WinGet', 'Packages', 'yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe', binaryName),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'yt-dlp', binaryName),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'yt-dlp', binaryName)
  ] : [
    path.join(os.homedir(), '.local', 'bin', 'yt-dlp'),
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    '/bin/yt-dlp'
  ];

  for (const p of candidatePaths) {
    if (p && fs.existsSync(p)) return p;
  }

  return binaryName;
}

// Locate zotify binary
function resolveZotifyBinary() {
  const envPath = process.env.BRAVE_MUSIC_ZOTIFY || process.env.ZOTIFY_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  const binaryName = isWin ? 'zotify.exe' : 'zotify';
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');

  const candidatePaths = isWin ? [
    path.join(__dirname, '..', '..', 'bin', binaryName),
    path.join(process.resourcesPath || '', 'bin', binaryName),
    path.join(localAppData, 'Programs', 'Python', 'Scripts', binaryName)
  ] : [
    path.join(os.homedir(), '.local', 'bin', 'zotify'),
    '/usr/local/bin/zotify',
    '/usr/bin/zotify',
    '/bin/zotify'
  ];

  for (const p of candidatePaths) {
    if (p && fs.existsSync(p)) return p;
  }

  return binaryName;
}

const config = {
  paths: {
    dataDir: DATA_DIR,
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
    ytdlpBin: resolveYtDlpBinary(),
    zotifyBin: resolveZotifyBinary()
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
