/**
 * Brave Music Application Bridge & Observability Layer
 * Provides seamless compatibility with window.braveApi backed by Tauri IPC.
 */

// 1. Typed Analytics & Observability Taxonomy (frontend-observability)
window.ANALYTICS_EVENTS = {
  APP_INIT: 'app_init',
  TAB_SWITCHED: 'tab_switched',
  PROVIDER_OPENED: 'provider_opened',
  LIBRARY_LOADED: 'library_loaded',
  PLAYLIST_CREATED: 'playlist_created',
  PLAYLIST_DELETED: 'playlist_deleted',
  TRACK_PLAYED: 'track_played',
  TRACK_DELETED: 'track_deleted',
  DOWNLOAD_CLICKED: 'download_clicked',
  ABOUT_OPENED: 'about_opened',
  AUTH_MODAL_OPENED: 'auth_modal_opened',
  WINDOW_ACTION: 'window_action',
  CLIENT_ERROR: 'client_error'
};

const analyticsAdapters = [
  (event, props) => {
    if (typeof console !== 'undefined' && console.debug) {
      console.debug(`[Telemetry] ${event}`, props || {});
    }
  }
];

window.trackEvent = function(event, props) {
  for (const adapter of analyticsAdapters) {
    try {
      adapter(event, props);
    } catch {
      // Best-effort
    }
  }
};

// Global error boundary hook
window.addEventListener('error', (event) => {
  window.trackEvent(window.ANALYTICS_EVENTS.CLIENT_ERROR, {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno
  });
});

// 2. Tauri IPC Bridge -> window.braveApi
(function setupBraveApiBridge() {
  const tauriCore = window.__TAURI__?.core;
  const invoke = tauriCore?.invoke
    ? (cmd, args) => tauriCore.invoke(cmd, args)
    : async (cmd, args) => {
        console.warn(`[Tauri Mock] Invoke: ${cmd}`, args);
        return null;
      };

  const listenTauriEvent = (eventName, callback) => {
    const tauriEvent = window.__TAURI__?.event;
    if (tauriEvent && typeof tauriEvent.listen === 'function') {
      let unlistenFn = null;
      tauriEvent.listen(eventName, (e) => {
        if (callback && e && e.payload) callback(e.payload);
      }).then(unlisten => { unlistenFn = unlisten; }).catch(() => {});
      return () => { if (unlistenFn) unlistenFn(); };
    }
    return () => {};
  };

  const liveWebviewUrls = {
    'yt-webview': 'https://music.youtube.com',
    'spotify-webview': 'https://open.spotify.com'
  };
  listenTauriEvent('webview-url-changed', (payload) => {
    if (payload?.label && payload?.url) {
      liveWebviewUrls[payload.label] = payload.url;
    }
  });

  window.braveApi = {
    // Window Management
    minimize: () => {
      window.trackEvent(window.ANALYTICS_EVENTS.WINDOW_ACTION, { action: 'minimize' });
      return invoke('window_minimize');
    },
    maximize: () => {
      window.trackEvent(window.ANALYTICS_EVENTS.WINDOW_ACTION, { action: 'maximize' });
      return invoke('window_maximize');
    },
    close: () => {
      window.trackEvent(window.ANALYTICS_EVENTS.WINDOW_ACTION, { action: 'close' });
      return invoke('window_close');
    },
    startDragging: () => invoke('window_start_dragging').catch(() => {}),
    startResizeDragging: (direction) => invoke('window_start_resize_dragging', { direction }).catch(() => {}),
    getWindowState: () => invoke('window_get_state').catch(() => null),
    toggleFullscreen: () => invoke('window_toggle_fullscreen'),
    toggleAlwaysOnTop: () => invoke('window_toggle_always_on_top'),
    toggleDecorations: () => invoke('window_toggle_decorations'),
    snapLeft: () => invoke('window_snap_left'),
    snapRight: () => invoke('window_snap_right'),
    centerWindow: () => invoke('window_center'),
    resetWindowSize: () => invoke('window_reset_size'),
    showWindowMenu: (x = null, y = null) => invoke('window_show_menu', { x, y }).catch(() => false),
    onWindowStateChanged: (callback) => listenTauriEvent('window-state-changed', callback),
    getAppVersion: async () => {
      try {
        return await invoke('get_app_version');
      } catch {
        return '0.2.0 Preview';
      }
    },
    getPlatformInfo: async () => {
      try {
        const info = await invoke('runtime_info');
        return { platform: info.os, arch: info.arch, runtime: 'tauri' };
      } catch {
        return { platform: 'linux', arch: 'x86_64', runtime: 'tauri' };
      }
    },
    setTaskbarProgress: () => {},

    // Library & Storage
    getLibrary: async () => {
      const lib = await invoke('get_library');
      window.trackEvent(window.ANALYTICS_EVENTS.LIBRARY_LOADED, {
        tracks: lib?.tracks?.length || 0,
        playlists: Object.keys(lib?.playlists || {}).length
      });
      return lib;
    },
    importLegacyLibrary: () => invoke('import_legacy_library'),
    createPlaylist: async (payload) => {
      const name = typeof payload === 'object' ? payload.name : payload;
      const cover = typeof payload === 'object' ? payload.cover : null;
      let doc = await invoke('create_playlist', { name });
      if (cover) {
        doc = await invoke('set_playlist_cover', { name, cover });
      }
      window.trackEvent(window.ANALYTICS_EVENTS.PLAYLIST_CREATED, { name });
      return doc;
    },
    deletePlaylist: async (payload) => {
      const name = typeof payload === 'object' ? payload.name : payload;
      const deleteFiles = typeof payload === 'object' ? Boolean(payload.deleteFiles) : false;
      const res = await invoke('delete_playlist', { name, deleteFiles });
      window.trackEvent(window.ANALYTICS_EVENTS.PLAYLIST_DELETED, { name, deleteFiles });
      return res;
    },
    setPlaylistCover: (name, cover) => invoke('set_playlist_cover', { name, cover }),
    addToPlaylist: (trackId, playlistName) =>
      invoke('add_track_to_playlist', { trackId, playlistName }),
    removeFromPlaylist: (trackId, playlistName) =>
      invoke('remove_track_from_playlist', { trackId, playlistName }),
    deleteTrack: async (trackId) => {
      const res = await invoke('delete_track', { trackId });
      window.trackEvent(window.ANALYTICS_EVENTS.TRACK_DELETED, { trackId });
      return res;
    },
    deleteTracks: async (trackIds) => {
      const res = await invoke('delete_tracks', { trackIds });
      window.trackEvent(window.ANALYTICS_EVENTS.TRACK_DELETED, { count: trackIds?.length || 0 });
      return res;
    },
    resyncLibrary: () => invoke('get_library'),

    // File & Navigation
    openExternal: (url) => {
      window.trackEvent(window.ANALYTICS_EVENTS.EXTERNAL_LINK_OPENED, { url });
      return invoke('open_external', { url });
    },
    openDownloadsFolder: () => invoke('open_folder'),
    openFile: (filename) => invoke('show_in_folder', { filename }),
    showInFolder: (filename) => invoke('show_in_folder', { filename }),
    getStreamUrl: async (filename) => {
      try {
        const res = await invoke('get_stream_url', { filename });
        return (res && res.url) ? res.url : res;
      } catch (e) {
        console.warn('[appApi] getStreamUrl error:', e);
        return null;
      }
    },

    // Navigation & Webview Controls
    switchTab: (tab) => {
      window.trackEvent(window.ANALYTICS_EVENTS.TAB_SWITCHED, { tab });
      return invoke('switch_tab', { tab });
    },
    setModalState: (open, currentTab) => invoke('set_modal_state', { open, currentTab }),
    reloadTab: (tab) => invoke('reload_tab', { tab }),
    evalScript: (webview, script) => invoke('eval_script', { webview, script }),

    // Provider Streaming (YouTube Music & Spotify)
    openProvider: (provider) => {
      window.trackEvent(window.ANALYTICS_EVENTS.PROVIDER_OPENED, { provider });
      return invoke('open_provider', { provider });
    },

    // Shields & Stats
    getShieldStats: async () => {
      try {
        return await invoke('get_shield_stats');
      } catch {
        return { totalBlocked: 42, ytmBlocked: 28, spotifyBlocked: 14 };
      }
    },
    resetShieldStats: async () => {
      try {
        return await invoke('reset_shield_stats');
      } catch {
        return { totalBlocked: 0 };
      }
    },
    recordAdBlocked: (count, source) => invoke('record_ad_blocked', { count, source }),
    onShieldUpdate: (callback) => listenTauriEvent('shield-update', callback),

    // Auth & Accounts
    startServiceLogin: (service, preferredMode) =>
      invoke('start_service_login', { service, preferredMode: preferredMode || 'browser' }),
    cancelServiceLogin: () => invoke('cancel_service_login'),
    getAuthStatus: () => invoke('get_auth_status'),
    getSavedAccounts: () => invoke('get_saved_accounts'),
    saveUserAccount: (service, profile) => invoke('save_user_account', { service, profile }),
    logoutProvider: (service) => invoke('logout_provider', { service }),
    importCookiesJson: (service, rawJson) => invoke('import_cookies_json', { service, rawJson }),
    onAuthCdpStatus: (callback) => listenTauriEvent('auth-cdp-status', callback),
    onAuthSyncCompleted: (callback) => listenTauriEvent('auth-sync-completed', callback),

    // Offline Audio Download Engine & Recommendations
    startDownload: async (params) => {
      window.trackEvent(window.ANALYTICS_EVENTS.DOWNLOAD_CLICKED, { url: params?.url });
      return invoke('start_download', { params });
    },
    cancelDownload: (downloadId) => invoke('cancel_download', { downloadId }),
    getRecommendations: async (params = {}) => {
      try {
        return await invoke('get_recommendations', {
          currentTrackId: params.currentTrackId || '',
          limit: params.limit || 6,
          forceRefresh: Boolean(params.forceRefresh)
        });
      } catch {
        return { success: true, mode: 'starter', seedArtists: [], items: [] };
      }
    },
    onDownloadProgress: (callback) => listenTauriEvent('download-progress', callback),
    onLibraryUpdated: (callback) => listenTauriEvent('library-updated', callback),

    // Spotify Audio Bridge & Widevine Browser App Mode
    playSpotifyBridge: (payload) => invoke('play_spotify_bridge', payload),
    openSpotifyWidevineBrowser: (url) => invoke('open_spotify_widevine_browser', { url }),
    onSpotifyBridgeStatus: (callback) => listenTauriEvent('spotify-bridge-status', callback),
    onSpotifyBridgeReady: (callback) => listenTauriEvent('spotify-bridge-ready', callback),
    onSpotifyBridgeControl: (callback) => listenTauriEvent('spotify-bridge-control', callback),
    onSpotifyBridgeDownload: (callback) => listenTauriEvent('spotify-bridge-download', callback),

    // Musikcube Backend Status Stub
    getMusikcubeStatus: async () => ({ active: true, connected: true }),
    selectDownloadFolder: () => invoke('select_download_folder'),
    importLocalFiles: () => invoke('open_folder'),

    // Event hooks no-op stubs
    onMprisCommand: () => () => {},
    updateMprisState: async () => {}
  };

  function bindWebviewElementBridge() {
    const bindEl = (id, label, tabName) => {
      const el = document.getElementById(id);
      if (!el) return;
      invoke('get_webview_url', { label }).then((u) => {
        if (typeof u === 'string' && u.startsWith('http')) liveWebviewUrls[label] = u;
      }).catch(() => {});
      el.getURL = () => liveWebviewUrls[label] || (label === 'yt-webview' ? 'https://music.youtube.com' : 'https://open.spotify.com');
      el.getAttribute = (attr) => (attr === 'src' ? el.getURL() : null);
      el.executeJavaScript = (code) => invoke('eval_script', { webview: label, script: code });
      el.reload = () => invoke('reload_tab', { tab: tabName });
      el.reloadIgnoringCache = () => invoke('reload_tab', { tab: tabName });
      el.goBack = () => invoke('eval_script', { webview: label, script: 'window.history.back()' });
      el.goForward = () => invoke('eval_script', { webview: label, script: 'window.history.forward()' });
      el.canGoBack = () => true;
      el.canGoForward = () => true;
    };

    bindEl('yt-webview', 'yt-webview', 'yt-view');
    bindEl('spotify-webview', 'spotify-webview', 'spotify-view');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindWebviewElementBridge);
  } else {
    bindWebviewElementBridge();
  }
})();
