const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('braveApi', {
  // Window controls
  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  close: () => ipcRenderer.invoke('window-close'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Library & Storage
  getLibrary: () => ipcRenderer.invoke('get-library'),
  deleteTrack: (trackId) => ipcRenderer.invoke('delete-track', trackId),
  deleteTracks: (trackIds) => ipcRenderer.invoke('delete-tracks', trackIds),
  createPlaylist: (payload) => ipcRenderer.invoke('create-playlist', payload),
  deletePlaylist: (name, deleteFiles = false) => {
    if (typeof name === 'object' && name !== null) {
      return ipcRenderer.invoke('delete-playlist', name);
    }
    return ipcRenderer.invoke('delete-playlist', { name, deleteFiles });
  },
  setPlaylistCover: (name, cover) => ipcRenderer.invoke('set-playlist-cover', { name, cover }),
  addToPlaylist: (trackId, playlistName) => ipcRenderer.invoke('add-to-playlist', { trackId, playlistName }),
  removeFromPlaylist: (trackId, playlistName) => ipcRenderer.invoke('remove-from-playlist', { trackId, playlistName }),
  resyncLibrary: () => ipcRenderer.invoke('resync-library'),
  selectDownloadFolder: () => ipcRenderer.invoke('select-download-folder'),
  importLocalFiles: () => ipcRenderer.invoke('import-local-files'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Native File & Media Operations
  getStreamUrl: async (filename) => {
    const res = await ipcRenderer.invoke('get-stream-url', filename);
    return (res && res.url) ? res.url : res;
  },
  openFile: (filename) => ipcRenderer.invoke('open-file', filename),
  showInFolder: (filename) => ipcRenderer.invoke('show-in-folder', filename),
  openDownloadsFolder: () => ipcRenderer.invoke('open-folder'),

  // Offline Audio Download Engine
  startDownload: (params) => ipcRenderer.invoke('start-download', params),
  cancelDownload: (downloadId) => ipcRenderer.invoke('cancel-download', downloadId),
  onDownloadProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('download-progress', handler);
    return () => ipcRenderer.removeListener('download-progress', handler);
  },
  onLibraryUpdated: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('library-updated', handler);
    return () => ipcRenderer.removeListener('library-updated', handler);
  },

  // Brave Shields
  getShieldStats: () => ipcRenderer.invoke('get-shield-stats'),
  resetShieldStats: () => ipcRenderer.invoke('reset-shield-stats'),
  recordAdBlocked: (count, source) => ipcRenderer.invoke('record-ad-blocked', { count, source }),
  onShieldUpdate: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('shield-update', handler);
    return () => ipcRenderer.removeListener('shield-update', handler);
  },

  // Musikcube Audio Engine Backend
  getMusikcubeStatus: () => ipcRenderer.invoke('get-musikcube-status'),

  // Browser Auth & Session Synchronization (Capability-based)
  openBrowserLogin: (service, url) => ipcRenderer.invoke('auth-open-browser-login', { service, url }),
  syncBrowserCookies: (browser = 'auto', service = 'youtube') => ipcRenderer.invoke('auth-sync-browser-cookies', { browser, service }),
  getAvailableBrowsers: () => ipcRenderer.invoke('auth-get-available-browsers'),
  
  // OAuth 2.0 PKCE Loopback
  startSpotifyPkce: (clientId) => ipcRenderer.invoke('auth-start-spotify-pkce', { clientId }),
  startGooglePkce: (clientId) => ipcRenderer.invoke('auth-start-google-pkce', { clientId }),
  refreshOAuthToken: (provider) => ipcRenderer.invoke('auth-refresh-oauth-token', { provider }),
  getAuthStatus: () => ipcRenderer.invoke('auth-get-status'),
  logoutProvider: (provider) => ipcRenderer.invoke('auth-logout-provider', { provider }),

  // YouTube Music Controlled CDP Login & cookies.txt
  startYtmCdpLogin: (browser = 'auto') => ipcRenderer.invoke('auth-start-ytm-cdp', { browser }),
  cancelYtmCdpLogin: () => ipcRenderer.invoke('auth-cancel-ytm-cdp'),
  importCookiesText: (text) => ipcRenderer.invoke('auth-import-cookies-text', { text }),

  // Auth Event Listeners
  onAuthBrowserOpened: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('auth-browser-opened', handler);
    return () => ipcRenderer.removeListener('auth-browser-opened', handler);
  },
  onAuthSyncCompleted: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('auth-sync-completed', handler);
    return () => ipcRenderer.removeListener('auth-sync-completed', handler);
  },
  onAuthCdpStatus: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('auth-cdp-status', handler);
    return () => ipcRenderer.removeListener('auth-cdp-status', handler);
  }
});

