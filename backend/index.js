let ipcMain, session;
try {
  const electron = require('electron');
  ipcMain = electron.ipcMain;
  session = electron.session;
} catch (e) {
  ipcMain = { handle: () => {} };
  session = { defaultSession: null, fromPartition: () => null };
}
const streamServer = require('./services/StreamServer');
const musikcubeService = require('./services/MusikcubeService');
const adBlockService = require('./services/AdBlockService');
const downloadController = require('./controllers/DownloadController');
const libraryController = require('./controllers/LibraryController');
const mediaController = require('./controllers/MediaController');
const shieldsController = require('./controllers/ShieldsController');
const authController = require('./controllers/AuthController');

class Backend {
  constructor() {
    this.mainWindow = null;
    this.isInitialized = false;
  }

  async init({ mainWindow }) {
    if (this.isInitialized) return;
    this.mainWindow = mainWindow;

    // 1. Launch local stream server & musikcube audio engine daemon
    try {
      await streamServer.start();
    } catch (e) {
      console.warn('[Backend] StreamServer launch warning:', e.message);
    }

    try {
      musikcubeService.start();
    } catch (e) {
      console.warn('[Backend] MusikcubeService start notice:', e.message);
    }

    // 2. Attach Brave Shields to default session and webview partitions
    adBlockService.attachToSession(session.defaultSession);
    try {
      const braveSession = session.fromPartition('persist:bravemusic');
      const ytSession = session.fromPartition('persist:ytmusic');
      const spotifySession = session.fromPartition('persist:spotify');
      if (braveSession) adBlockService.attachToSession(braveSession);
      if (ytSession) adBlockService.attachToSession(ytSession);
      if (spotifySession) adBlockService.attachToSession(spotifySession);
    } catch (e) {
      console.warn('[Backend] Partition attachment warning:', e.message);
    }

    // 3. Broadcast shield counter updates to main window
    adBlockService.onUpdate((data) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('shield-update', data);
      }
    });

    // 4. Register IPC Handlers
    this.registerIpc();

    this.isInitialized = true;
    console.log('[Backend] Brave Music backend initialized successfully');
  }

  registerIpc() {
    // Downloads
    ipcMain.handle('start-download', (event, payload) => downloadController.startDownload(event, payload));
    ipcMain.handle('cancel-download', (event, downloadId) => downloadController.cancelDownload(event, downloadId));

    // Library & Storage
    ipcMain.handle('get-library', () => libraryController.getLibrary());
    ipcMain.handle('delete-track', (event, trackId) => libraryController.deleteTrack(event, trackId));
    ipcMain.handle('delete-tracks', (event, trackIds) => libraryController.deleteTracks(event, trackIds));
    ipcMain.handle('create-playlist', (event, payload) => libraryController.createPlaylist(event, payload));
    ipcMain.handle('delete-playlist', (event, payload) => libraryController.deletePlaylist(event, payload));
    ipcMain.handle('set-playlist-cover', (event, payload) => libraryController.setPlaylistCover(event, payload));
    ipcMain.handle('add-to-playlist', (event, payload) => libraryController.addTrackToPlaylist(event, payload));
    ipcMain.handle('remove-from-playlist', (event, payload) => libraryController.removeTrackFromPlaylist(event, payload));
    ipcMain.handle('resync-library', () => libraryController.resyncDisk());
    ipcMain.handle('select-download-folder', () => libraryController.selectDownloadFolder());
    ipcMain.handle('import-local-files', () => libraryController.importLocalFiles());

    // Native Media & Shell & Streaming
    ipcMain.handle('get-stream-url', (event, filename) => mediaController.getStreamUrl(event, filename));
    ipcMain.handle('open-file', (event, filename) => mediaController.openFile(event, filename));
    ipcMain.handle('show-in-folder', (event, filename) => mediaController.showInFolder(event, filename));
    ipcMain.handle('open-folder', () => mediaController.openFolder());

    // Brave Shields
    ipcMain.handle('get-shield-stats', () => shieldsController.getStats());
    ipcMain.handle('reset-shield-stats', () => shieldsController.resetStats());
    ipcMain.handle('record-ad-blocked', (event, payload) => shieldsController.recordAdBlocked(event, payload));

    // Musikcube Audio Engine
    ipcMain.handle('get-musikcube-status', () => musikcubeService.getStatus());

    // Browser Auth & Session Sync (Capability-based)
    const ytmDevtoolsAuthService = require('./services/YTMDevtoolsAuthService');
    ytmDevtoolsAuthService.onStatus((statusData) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('auth-cdp-status', statusData);
      }
    });

    ipcMain.handle('auth-open-browser-login', (event, payload) => authController.openBrowserLogin(event, payload));
    ipcMain.handle('auth-sync-browser-cookies', (event, payload) => authController.syncBrowserCookies(event, payload));
    ipcMain.handle('auth-get-available-browsers', () => authController.getAvailableBrowsers());

    // OAuth 2.0 PKCE Loopback handlers (Google & Spotify)
    ipcMain.handle('auth-start-spotify-pkce', (event, payload) => authController.startSpotifyPkce(event, payload));
    ipcMain.handle('auth-start-google-pkce', (event, payload) => authController.startGooglePkce(event, payload));
    ipcMain.handle('auth-refresh-oauth-token', (event, payload) => authController.refreshOAuthToken(event, payload));
    ipcMain.handle('auth-get-status', () => authController.getAuthStatus());
    ipcMain.handle('auth-logout-provider', (event, payload) => authController.logoutProvider(event, payload));

    // YouTube Music Controlled CDP handlers
    ipcMain.handle('auth-start-ytm-cdp', (event, payload) => authController.startYtmCdpLogin(event, payload));
    ipcMain.handle('auth-cancel-ytm-cdp', () => authController.cancelYtmCdpLogin());
    ipcMain.handle('auth-import-cookies-text', (event, payload) => authController.importCookiesText(event, payload));
  }

  shutdown() {
    streamServer.stop();
    musikcubeService.stop();
  }
}

module.exports = new Backend();
