// Brave Music Desktop Client Application Logic
document.addEventListener('DOMContentLoaded', () => {
  // Application State
  const state = {
    currentTab: 'yt-view',
    library: { tracks: [], playlists: {} },
    downloadType: 'song', // 'song' | 'playlist'
    activeView: 'all',    // 'all' | 'playlists'
    searchQuery: '',
    sortMode: 'recent',   // 'recent' | 'title-asc' | 'title-desc' | 'artist-asc' | 'duration-desc' | 'duration-asc'
    selectedPlaylist: null, // filter by specific playlist name if chosen
    selectionMode: false, // multi-track selection mode
    selectedTrackIds: new Set(), // set of selected track IDs
    player: {
      currentTrack: null,
      currentIndex: -1,
      isPlaying: false,
      isShuffle: false,
      isRepeat: false,
      volume: 0.85,
      isMuted: false,
      isDraggingSeek: false,
      lockedPlaylist: null, // When set, restricts next/prev track cycling to this playlist only
      recentTrackIds: []
    }
  };

  // Initial layout state: active streaming tab
  if (state.currentTab !== 'downloads-view') {
    document.body.classList.add('stream-view-active');
  }

  // DOM Elements - Header & Navigation
  const tabs = document.querySelectorAll('.nav-tab');
  const viewPanels = document.querySelectorAll('.view-panel');
  const shieldCountLabel = document.getElementById('shield-count-label');
  const libraryCountBadge = document.getElementById('library-count-badge');
  const badgeAllMusic = document.getElementById('badge-all-music');
  const badgePlaylists = document.getElementById('badge-playlists');

  // Webviews
  const ytWebview = document.getElementById('yt-webview');
  const spotifyWebview = document.getElementById('spotify-webview');

  // Offline Downloads & Library Controls
  const inputDownloadUrl = document.getElementById('input-download-url');
  const toggleSong = document.getElementById('toggle-song');
  const togglePlaylist = document.getElementById('toggle-playlist');
  const btnExecuteDownload = document.getElementById('btn-execute-download');
  const selectDownloadFormat = document.getElementById('select-download-format');
  const btnOpenFolder = document.getElementById('btn-open-folder');
  const btnCreatePlaylist = document.getElementById('btn-create-playlist');
  const downloadProgressBox = document.getElementById('download-progress-box');
  const progressFillBar = document.getElementById('progress-fill-bar');
  const progressPercentVal = document.getElementById('progress-percent-val');
  const progressSpeed = document.getElementById('progress-speed');
  const progressStatusLabel = document.getElementById('progress-status-label');
  const filterAllMusic = document.getElementById('filter-all-music');
  const filterPlaylists = document.getElementById('filter-playlists');
  const sortTracksSelect = document.getElementById('sort-tracks-select');
  const searchInput = document.getElementById('search-local-library');
  const tracksTableBody = document.getElementById('tracks-table-body');
  const playlistsGrid = document.getElementById('playlists-grid');
  const emptyStateBox = document.getElementById('empty-state-box');
  const viewAllMusic = document.getElementById('view-all-music');
  const viewPlaylists = document.getElementById('view-playlists');

  // Multi-Selection Controls
  const btnToggleSelectMode = document.getElementById('btn-toggle-select-mode');
  const btnSelectModeText = document.getElementById('btn-select-mode-text');
  const selectionActionBar = document.getElementById('selection-action-bar');
  const checkboxSelectAll = document.getElementById('checkbox-select-all');
  const selectionCountBadge = document.getElementById('selection-count-badge');
  const btnDeleteSelected = document.getElementById('btn-delete-selected');
  const btnDeleteSelectedText = document.getElementById('btn-delete-selected-text');
  const btnCancelSelection = document.getElementById('btn-cancel-selection');
  const thNumLabel = document.getElementById('th-num-label');
  const thCheckboxWrap = document.getElementById('th-checkbox-wrap');
  const thSelectAllCheckbox = document.getElementById('th-select-all-checkbox');

  // Built-in Runtime Player Bar Elements
  const runtimeAudio = document.getElementById('runtime-audio-element');
  const playerBar = document.getElementById('runtime-player-bar');
  const playerArtImg = document.getElementById('player-art-img');
  const playerWaves = document.getElementById('player-playing-waves');
  const playerTitle = document.getElementById('player-track-title');
  const playerArtist = document.getElementById('player-track-artist');
  const playerShuffleBtn = document.getElementById('player-shuffle-btn');
  const playerPrevBtn = document.getElementById('player-prev-btn');
  const playerPlayPauseBtn = document.getElementById('player-play-pause-btn');
  const playerPlayIcon = document.getElementById('player-play-icon');
  const playerPauseIcon = document.getElementById('player-pause-icon');
  const playerNextBtn = document.getElementById('player-next-btn');
  const playerRepeatBtn = document.getElementById('player-repeat-btn');
  const playerCurrentTime = document.getElementById('player-current-time');
  const playerTotalTime = document.getElementById('player-total-time');
  const playerSeekSlider = document.getElementById('player-seek-slider');
  const playerSeekFill = document.getElementById('player-seek-fill');
  const playerMuteBtn = document.getElementById('player-mute-btn');
  const playerVolIcon = document.getElementById('player-vol-icon');
  const playerVolSlider = document.getElementById('player-volume-slider');
  const volumeControlWrap = document.getElementById('volume-control-wrap');
  const playerVolumePopover = document.getElementById('player-volume-popover');
  const playerVolPercent = document.getElementById('player-vol-percent');
  const playerVolumeFill = document.getElementById('player-volume-fill');
  const volumeVerticalTrackWrap = document.getElementById('volume-vertical-track-wrap');
  const btnQuickMute = document.getElementById('btn-quick-mute');

  // Toolbar & Playlist Controls
  const btnFolderSettings = document.getElementById('btn-folder-settings');
  const btnImportMusic = document.getElementById('btn-import-music');
  const btnCreatePlaylistBanner = document.getElementById('btn-create-playlist-banner');

  // Playlist Modals & Custom Cover State
  const createPlaylistModal = document.getElementById('create-playlist-modal');
  const btnCloseCreatePlaylist = document.getElementById('btn-close-create-playlist');
  const btnCancelCreatePlaylist = document.getElementById('btn-cancel-create-playlist');
  const btnSubmitCreatePlaylist = document.getElementById('btn-submit-create-playlist');
  const inputPlaylistName = document.getElementById('input-playlist-name');
  const playlistCoverPreview = document.getElementById('playlist-cover-preview');
  const coverPresetChips = document.querySelectorAll('.preset-cover-chip');
  const btnUploadCover = document.getElementById('btn-upload-cover');
  const inputCoverFile = document.getElementById('input-cover-file');
  let selectedPlaylistCover = 'linear-gradient(135deg, #fb542b 0%, #ff8243 100%)';

  // Delete Playlist Modal
  const deletePlaylistModal = document.getElementById('delete-playlist-modal');
  const deletePlaylistTargetName = document.getElementById('delete-playlist-target-name');
  const btnDeletePlaylistOnly = document.getElementById('btn-delete-playlist-only');
  const btnDeletePlaylistAndFiles = document.getElementById('btn-delete-playlist-and-files');
  const btnCancelDeletePlaylist = document.getElementById('btn-cancel-delete-playlist');
  const btnCloseDeletePlaylist = document.getElementById('btn-close-delete-playlist');
  let targetPlaylistToDelete = null;

  const addToPlaylistModal = document.getElementById('add-to-playlist-modal');
  const btnCloseAddPlaylist = document.getElementById('btn-close-add-playlist');
  const btnDoneAddPlaylist = document.getElementById('btn-done-add-playlist');
  const playlistsChecklist = document.getElementById('playlists-checklist');
  const addPlaylistTrackName = document.getElementById('add-playlist-track-name');
  let currentTrackForPlaylist = null;

  // Dedicated Playlist Detail & Music List Modal
  const playlistDetailModal = document.getElementById('playlist-detail-modal');
  const btnClosePlaylistDetail = document.getElementById('btn-close-playlist-detail');
  const playlistDetailCover = document.getElementById('playlist-detail-cover');
  const playlistDetailTitle = document.getElementById('playlist-detail-title');
  const playlistDetailCount = document.getElementById('playlist-detail-count');
  const playlistDetailDuration = document.getElementById('playlist-detail-duration');
  const btnPlaylistPlayAll = document.getElementById('btn-playlist-play-all');
  const btnPlaylistShuffle = document.getElementById('btn-playlist-shuffle');
  const btnPlaylistRandom = document.getElementById('btn-playlist-random');
  const btnPlaylistPlayerOnly = document.getElementById('btn-playlist-player-only');
  const labelPlayerOnlyMode = document.getElementById('label-player-only-mode');
  const btnPlaylistDeleteFromDetail = document.getElementById('btn-playlist-delete-from-detail');
  const playlistDetailTracksBody = document.getElementById('playlist-detail-tracks-body');
  const playlistDetailEmpty = document.getElementById('playlist-detail-empty');
  let activeDetailPlaylist = null;

  // ==========================================================================
  // WINDOW CONTROLS & HEADER ACTIONS
  // ==========================================================================

  const winMaxBtn = document.getElementById('win-max');
  const appHeaderEl = document.getElementById('app-header') || document.querySelector('.app-header');

  function applyWindowStateToUI(winState) {
    if (!winState || typeof winState !== 'object') return;
    document.body.classList.toggle('win-maximized', !!winState.maximized);
    document.body.classList.toggle('win-fullscreen', !!winState.fullscreen);
    document.body.classList.toggle('win-decorated', !!winState.decorated);
    document.body.classList.toggle('win-always-on-top', !!winState.alwaysOnTop);

    if (winMaxBtn) {
      const isMax = !!winState.maximized;
      winMaxBtn.classList.toggle('is-maximized', isMax);
      winMaxBtn.title = isMax ? 'Restore Down' : 'Maximize';
      const maxIcon = winMaxBtn.querySelector('.icon-win-maximize');
      const restoreIcon = winMaxBtn.querySelector('.icon-win-restore');
      if (maxIcon) maxIcon.style.display = isMax ? 'none' : '';
      if (restoreIcon) restoreIcon.style.display = isMax ? '' : 'none';
    }
  }

  document.getElementById('win-menu')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const rect = e.currentTarget?.getBoundingClientRect?.();
    if (rect) {
      window.braveApi?.showWindowMenu?.(rect.right, rect.bottom + 4);
    } else {
      window.braveApi?.showWindowMenu?.();
    }
  });

  document.getElementById('win-min')?.addEventListener('click', () => {
    window.braveApi?.minimize();
  });

  winMaxBtn?.addEventListener('click', () => {
    window.braveApi?.maximize();
  });

  document.getElementById('win-close')?.addEventListener('click', () => {
    window.braveApi?.close();
  });

  // Explicit single-path window move (drag), double-click maximize, and Ubuntu window context menu
  if (appHeaderEl) {
    appHeaderEl.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('button, a, input, select, textarea, .nav-tab, .win-btn, .window-resize-handle')) {
        return;
      }
      e.preventDefault();
      window.braveApi?.startDragging?.();
    });

    appHeaderEl.addEventListener('dblclick', (e) => {
      if (e.target.closest('button, a, input, select, textarea, .nav-tab, .win-btn, .window-resize-handle')) {
        return;
      }
      window.braveApi?.maximize?.();
    });

    appHeaderEl.addEventListener('contextmenu', (e) => {
      if (e.target.closest('button, a, input, select, textarea')) {
        return;
      }
      e.preventDefault();
      window.braveApi?.showWindowMenu?.(e.clientX, e.clientY);
    });
  }

  // 8-direction perimeter resize handles (n, s, w, e, nw, ne, sw, se)
  document.querySelectorAll('.window-resize-handle[data-resize-dir]').forEach((handle) => {
    handle.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const dir = handle.getAttribute('data-resize-dir');
      if (dir) {
        e.preventDefault();
        e.stopPropagation();
        window.braveApi?.startResizeDragging?.(dir);
      }
    });
  });

  // Ubuntu standard keyboard window shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F11') {
      e.preventDefault();
      window.braveApi?.toggleFullscreen?.().then(applyWindowStateToUI).catch(() => { });
    } else if (e.altKey && e.key === 'F10') {
      e.preventDefault();
      window.braveApi?.maximize?.();
    } else if (e.altKey && e.key === ' ') {
      e.preventDefault();
      window.braveApi?.showWindowMenu?.();
    }
  });

  window.braveApi?.onWindowStateChanged?.(applyWindowStateToUI);
  window.braveApi?.getWindowState?.().then(applyWindowStateToUI).catch(() => { });

  // ==========================================================================
  // IN-APP HISTORY & PAGE VIEW NAVIGATION (< BACK, > FORWARD)
  // ==========================================================================
  const btnNavBack = document.getElementById('btn-nav-back');
  const btnNavForward = document.getElementById('btn-nav-forward');

  function updateNavHistoryState() {
    let canBack = false;
    let canForward = false;

    if (state.currentTab === 'yt-view') {
      canBack = true;
      canForward = true;
    } else if (state.currentTab === 'spotify-view') {
      canBack = true;
      canForward = true;
    } else if (state.currentTab === 'downloads-view') {
      if (playlistDetailModal && playlistDetailModal.style.display !== 'none') {
        canBack = true;
      }
    }

    if (btnNavBack) btnNavBack.disabled = !canBack;
    if (btnNavForward) btnNavForward.disabled = !canForward;
  }

  function handleNavigateBack() {
    if (state.currentTab === 'yt-view' && ytWebview) {
      if (typeof ytWebview.canGoBack === 'function' && ytWebview.canGoBack()) {
        ytWebview.goBack();
      }
    } else if (state.currentTab === 'spotify-view' && spotifyWebview) {
      if (typeof spotifyWebview.canGoBack === 'function' && spotifyWebview.canGoBack()) {
        spotifyWebview.goBack();
      }
    } else if (state.currentTab === 'downloads-view') {
      if (playlistDetailModal && playlistDetailModal.style.display !== 'none') {
        closePlaylistDetail();
      }
    }
    setTimeout(updateNavHistoryState, 200);
  }

  function handleNavigateForward() {
    if (state.currentTab === 'yt-view' && ytWebview) {
      if (typeof ytWebview.canGoForward === 'function' && ytWebview.canGoForward()) {
        ytWebview.goForward();
      }
    } else if (state.currentTab === 'spotify-view' && spotifyWebview) {
      if (typeof spotifyWebview.canGoForward === 'function' && spotifyWebview.canGoForward()) {
        spotifyWebview.goForward();
      }
    }
    setTimeout(updateNavHistoryState, 200);
  }

  btnNavBack?.addEventListener('click', handleNavigateBack);
  btnNavForward?.addEventListener('click', handleNavigateForward);

  // Global Keyboard shortcuts: Alt+Left for Back, Alt+Right for Forward
  window.addEventListener('keydown', (e) => {
    if (e.altKey && e.key === 'ArrowLeft') {
      e.preventDefault();
      handleNavigateBack();
    } else if (e.altKey && e.key === 'ArrowRight') {
      e.preventDefault();
      handleNavigateForward();
    }
  });

  // Track webview navigation events
  [ytWebview, spotifyWebview].forEach(wv => {
    if (!wv) return;
    wv.addEventListener('did-navigate', updateNavHistoryState);
    wv.addEventListener('did-navigate-in-page', updateNavHistoryState);
    wv.addEventListener('did-finish-load', updateNavHistoryState);
    wv.addEventListener('dom-ready', updateNavHistoryState);
  });

  // Reliable Reload Function for Webviews & Views
  const btnReload = document.getElementById('btn-reload');

  function reloadActiveWebview(webview, providerName) {
    if (!webview && !providerName) return;
    showToast(`Reloading ${providerName || 'view'}…`);

    const targetTab = providerName === 'Spotify' ? 'spotify-view' : 'yt-view';
    if (window.braveApi && typeof window.braveApi.reloadTab === 'function') {
      window.braveApi.reloadTab(targetTab);
      return;
    }

    const defaultUrl = providerName === 'Spotify' ? 'https://open.spotify.com' : 'https://music.youtube.com';
    let currentUrl = '';
    try {
      if (typeof webview.getURL === 'function') {
        currentUrl = webview.getURL();
      }
    } catch (e) { }

    if (!currentUrl || currentUrl === 'about:blank') {
      webview.src = defaultUrl;
      return;
    }

    try {
      if (typeof webview.reload === 'function') {
        webview.reload();
        return;
      }
    } catch (e) { }

    try {
      if (typeof webview.reloadIgnoringCache === 'function') {
        webview.reloadIgnoringCache();
        return;
      }
    } catch (e) { }

    try {
      webview.executeJavaScript('window.location.reload();').catch(() => {
        const src = webview.getAttribute('src') || defaultUrl;
        if (src) webview.src = src;
      });
    } catch (e) {
      const src = webview.getAttribute('src') || defaultUrl;
      if (src) webview.src = src;
    }
  }

  function refreshMusicTabsAfterSignIn(service, forceReload = false) {
    const normalized = service === 'spotify' ? 'spotify' : 'youtube';
    const webview = normalized === 'spotify' ? spotifyWebview : ytWebview;
    const expectedHost = normalized === 'spotify' ? 'open.spotify.com' : 'music.youtube.com';
    const homeUrl = normalized === 'spotify' ? 'https://open.spotify.com' : 'https://music.youtube.com';
    const label = normalized === 'spotify' ? 'Spotify' : 'YouTube Music';

    if (webview) {
      let currentUrl = '';
      try {
        if (typeof webview.getURL === 'function') {
          currentUrl = webview.getURL() || '';
        } else {
          currentUrl = webview.getAttribute('src') || '';
        }
      } catch (e) { }

      const lowerUrl = currentUrl.toLowerCase();
      const stuckOnAuthOrBlank =
        !lowerUrl ||
        lowerUrl === 'about:blank' ||
        !lowerUrl.includes(expectedHost) ||
        lowerUrl.includes('accounts.google.') ||
        lowerUrl.includes('accounts.spotify.') ||
        lowerUrl.includes('/signin') ||
        lowerUrl.includes('/login');

      const onPostSignInLoad = () => {
        try { webview.removeEventListener?.('did-finish-load', onPostSignInLoad); } catch (e) { }
        setTimeout(() => {
          inspectAndSaveWebviewUser(normalized);
          refreshAuthStatusUI();
        }, 700);
      };
      try { webview.addEventListener?.('did-finish-load', onPostSignInLoad); } catch (e) { }

      if (stuckOnAuthOrBlank) {
        try {
          if (typeof webview.loadURL === 'function') {
            webview.loadURL(homeUrl);
          } else {
            webview.src = homeUrl;
          }
        } catch (err) {
          webview.src = homeUrl;
        }
      } else if (forceReload) {
        try {
          if (typeof webview.reloadIgnoringCache === 'function') {
            webview.reloadIgnoringCache();
          } else if (typeof webview.reload === 'function') {
            webview.reload();
          } else {
            webview.src = homeUrl;
          }
        } catch (error) {
          try { webview.src = homeUrl; } catch (e2) { }
        }
      }
    }

    showToast(`${label} sign-in saved in browser memory.`);
  }

  btnReload?.addEventListener('click', () => {
    btnReload.classList.add('spinning');
    setTimeout(() => btnReload.classList.remove('spinning'), 600);

    if (state.currentTab === 'yt-view') {
      reloadActiveWebview(ytWebview, 'YouTube Music');
    } else if (state.currentTab === 'spotify-view') {
      reloadActiveWebview(spotifyWebview, 'Spotify');
    } else if (state.currentTab === 'downloads-view') {
      loadLibrary();
      showToast('Library refreshed');
    }
  });

  // About Developer & Credits Modal
  const btnAbout = document.getElementById('btn-about');
  const aboutModal = document.getElementById('about-modal');
  const btnCloseAbout = document.getElementById('btn-close-about');
  const btnAboutOk = document.getElementById('btn-about-ok');

  // Centralized Modal Layout & View State Manager
  function setModalOpenState(isOpen) {
    if (isOpen) {
      document.body.classList.add('modal-open');
      if (window.braveApi?.setModalState) {
        window.braveApi.setModalState(true, state.currentTab);
      }
    } else {
      document.body.classList.remove('modal-open');
      if (window.braveApi?.setModalState) {
        window.braveApi.setModalState(false, state.currentTab);
      }
    }
  }

  async function openAboutModal() {
    if (aboutModal) {
      setModalOpenState(true);
      // Dynamic avatar reload to ensure fresh GitHub profile picture
      const devAvatar = document.getElementById('about-dev-avatar');
      if (devAvatar) {
        devAvatar.src = `https://github.com/uzairshahidgithub.png?t=${Date.now()}`;
      }
      try {
        if (window.braveApi?.getAppVersion) {
          const v = await window.braveApi.getAppVersion();
          const versionEl = document.getElementById('about-app-version');
          if (versionEl) {
            versionEl.textContent = `Version v${v}`;
          }
        }
      } catch (e) { }
      aboutModal.style.display = 'flex';
      btnCloseAbout?.focus();
    }
  }

  function closeAboutModal() {
    if (aboutModal) {
      aboutModal.style.display = 'none';
      setModalOpenState(false);
    }
  }

  // Pre-fetch version on load
  if (window.braveApi?.getAppVersion) {
    window.braveApi.getAppVersion().then(v => {
      const versionEl = document.getElementById('about-app-version');
      if (versionEl) {
        versionEl.textContent = `Version v${v}`;
      }
    }).catch(() => { });
  }

  btnAbout?.addEventListener('click', openAboutModal);
  btnCloseAbout?.addEventListener('click', closeAboutModal);
  btnAboutOk?.addEventListener('click', closeAboutModal);
  aboutModal?.addEventListener('click', (e) => {
    if (e.target === aboutModal) closeAboutModal();
  });

  const linkDevGithub = document.getElementById('link-dev-github');
  linkDevGithub?.addEventListener('click', (e) => {
    e.preventDefault();
    window.braveApi?.openExternal('https://github.com/uzairshahidgithub');
  });

  const btnEmailDonation = document.getElementById('btn-email-donation');
  btnEmailDonation?.addEventListener('click', () => {
    window.braveApi?.openExternal('mailto:cosl@codemoteams.org');
    try {
      navigator.clipboard?.writeText('cosl@codemoteams.org');
    } catch (e) { }
    showToast('Contact email copied: cosl@codemoteams.org');
  });

  const btnCheckUpdate = document.getElementById('btn-check-update');
  btnCheckUpdate?.addEventListener('click', () => {
    const releaseUrl = 'https://github.com/codemolabs/Brave-Music/releases';
    window.braveApi?.openExternal(releaseUrl)?.catch?.(() => { });
    showToast('Opening releases page...');
  });

  const btnReportIssue = document.getElementById('btn-report-issue');
  btnReportIssue?.addEventListener('click', () => {
    const issuesUrl = 'https://github.com/codemolabs/Brave-Music/issues';
    window.braveApi?.openExternal(issuesUrl)?.catch?.(() => { });
    showToast('Opening issues page...');
  });

  // ==========================================================================
  // ==========================================================================
  // AUTHENTICATION & SESSION MANAGEMENT
  // ==========================================================================
  const btnAuthSync = document.getElementById('btn-auth-sync');
  const authSyncModal = document.getElementById('auth-sync-modal');
  const authModalSubtitle = authSyncModal?.querySelector('.login-modal-subtitle');
  const authModalTitle = document.getElementById('auth-title');
  const authServiceIcon = document.getElementById('auth-service-icon');
  const btnCloseAuthSync = document.getElementById('btn-close-auth-sync');
  const btnCancelAuthSync = document.getElementById('btn-cancel-auth-sync');

  // Navigation Tabs
  const loginTabPills = document.querySelectorAll('.login-tab-pill');
  const loginTabPanels = {
    ytm: document.getElementById('auth-tab-ytm'),
    spotify: document.getElementById('auth-tab-spotify')
  };

  // YouTube Music Elements
  const ytmSavedAccountCard = document.getElementById('ytm-saved-account-card');
  const ytmAccountAvatar = document.getElementById('ytm-account-avatar');
  const ytmAccountInitials = document.getElementById('ytm-account-initials');
  const ytmAccountName = document.getElementById('ytm-account-name');
  const ytmAccountEmail = document.getElementById('ytm-account-email');
  const ytmAccountTime = document.getElementById('ytm-account-time');
  const btnYtmResync = document.getElementById('btn-ytm-resync');
  const btnYtmSignoutCard = document.getElementById('btn-ytm-signout-card');
  const ytmSigninHeader = document.getElementById('ytm-signin-header');
  const ytmStatusRow = document.getElementById('ytm-status-row');
  const ytmStatusChip = document.getElementById('ytm-status-chip');
  const ytmStatusDot = document.getElementById('ytm-status-dot');
  const ytmStatusLabel = document.getElementById('ytm-status-label');
  const btnYtmSignout = document.getElementById('btn-ytm-signout');
  const btnStartYtmCdp = document.getElementById('btn-start-ytm-cdp');
  const btnYtmCdpLabel = document.getElementById('btn-ytm-cdp-label');
  const ytmCdpStatus = document.getElementById('ytm-cdp-status');
  const btnCancelYtmCdp = document.getElementById('btn-cancel-ytm-cdp');
  const btnYtmInAppSignin = document.getElementById('btn-ytm-inapp-signin');
  const inputYtmCookiesFile = document.getElementById('input-ytm-cookies-file');
  const ytmFileName = document.getElementById('ytm-file-name');

  // Spotify Elements
  const spotifySavedAccountCard = document.getElementById('spotify-saved-account-card');
  const spotifyAccountAvatar = document.getElementById('spotify-account-avatar');
  const spotifyAccountInitials = document.getElementById('spotify-account-initials');
  const spotifyAccountName = document.getElementById('spotify-account-name');
  const spotifyAccountEmail = document.getElementById('spotify-account-email');
  const spotifyAccountTime = document.getElementById('spotify-account-time');
  const btnSpotifyResync = document.getElementById('btn-spotify-resync');
  const btnSpotifySignoutCard = document.getElementById('btn-spotify-signout-card');
  const spotifySigninHeader = document.getElementById('spotify-signin-header');
  const spotifyStatusRow = document.getElementById('spotify-status-row');
  const spotifyStatusChip = document.getElementById('spotify-status-chip');
  const spotifyStatusDot = document.getElementById('spotify-status-dot');
  const spotifyStatusLabel = document.getElementById('spotify-status-label');
  const btnSpotifySignout = document.getElementById('btn-spotify-signout');
  const btnStartSpotifyLogin = document.getElementById('btn-start-spotify-login');
  const btnSpotifyLoginLabel = document.getElementById('btn-spotify-login-label');
  const spotifyLoginStatus = document.getElementById('spotify-login-status');
  const btnCancelSpotifyLogin = document.getElementById('btn-cancel-spotify-login');
  const btnSpotifyInAppSignin = document.getElementById('btn-spotify-inapp-signin');
  const inputSpotifyCookiesFile = document.getElementById('input-spotify-cookies-file');
  const spotifyFileName = document.getElementById('spotify-file-name');

  let activeAuthTab = 'ytm';
  let authStatusRefreshPromise = null;
  let authStatusRefreshQueued = false;

  const authSessionTracker = {
    youtube: { state: 'idle', closeTimer: null },
    spotify: { state: 'idle', closeTimer: null }
  };

  function switchAuthTab(tabId) {
    activeAuthTab = tabId;
    const isSpotify = tabId === 'spotify';
    const serviceName = isSpotify ? 'Spotify' : 'YouTube Music';
    const serviceIcon = isSpotify ? 'assets/icons/spotify.svg' : 'assets/icons/yt-music.svg';

    if (authModalTitle) authModalTitle.textContent = serviceName;
    if (authServiceIcon) {
      authServiceIcon.src = serviceIcon;
      authServiceIcon.alt = serviceName;
    }
    if (btnYtmCdpLabel) btnYtmCdpLabel.textContent = 'Sign in to YouTube Music';
    if (btnSpotifyLoginLabel) btnSpotifyLoginLabel.textContent = 'Sign in to Spotify';

    loginTabPills.forEach(pill => {
      pill.classList.toggle('active', pill.dataset.tab === tabId);
    });

    Object.keys(loginTabPanels).forEach(key => {
      const panel = loginTabPanels[key];
      if (panel) {
        if (key === tabId) {
          panel.style.display = 'flex';
          panel.classList.add('active');
        } else {
          panel.style.display = 'none';
          panel.classList.remove('active');
        }
      }
    });
  }

  loginTabPills.forEach(pill => {
    pill.addEventListener('click', () => {
      switchAuthTab(pill.dataset.tab);
    });
  });

  function refreshAuthStatusUI() {
    if (authStatusRefreshPromise) {
      authStatusRefreshQueued = true;
      return authStatusRefreshPromise;
    }

    authStatusRefreshPromise = (async () => {
      do {
        authStatusRefreshQueued = false;
        await refreshAuthStatusUIOnce();
      } while (authStatusRefreshQueued);
    })().finally(() => {
      authStatusRefreshPromise = null;
    });
    return authStatusRefreshPromise;
  }

  async function refreshAuthStatusUIOnce() {
    if (!window.braveApi?.getAuthStatus) return;
    try {
      const status = await window.braveApi.getAuthStatus();
      const accounts = status.accounts || (window.braveApi.getSavedAccounts ? await window.braveApi.getSavedAccounts() : {});

      // YouTube Music Status & Saved Account Card
      const isYtmAuth = !!(status.youtube?.authenticated || status.ytmusic?.authenticated);
      const ytmAcc = accounts.youtube || status.youtube?.account;
      const isSpotifyAuth = !!status.spotify?.authenticated;
      const spotifyAcc = accounts.spotify || status.spotify?.account;
      const currentServiceAuth = activeAuthTab === 'spotify' ? isSpotifyAuth : isYtmAuth;
      if (authModalSubtitle) {
        authModalSubtitle.textContent = currentServiceAuth ? 'Signed in on this device' : 'Sign in to continue';
      }

      if (isYtmAuth && ytmAcc?.authenticated !== false) {
        const activeYtmAcc = ytmAcc || {};
        if (ytmStatusChip) ytmStatusChip.classList.add('connected');
        if (ytmStatusLabel) ytmStatusLabel.textContent = 'Connected on this device';
        if (btnYtmSignout) btnYtmSignout.style.display = 'inline-flex';

        // Populate Saved Account Card
        if (ytmSavedAccountCard) {
          ytmSavedAccountCard.style.display = 'block';
          if (ytmAccountName) ytmAccountName.textContent = 'Account';
          if (ytmAccountEmail) ytmAccountEmail.textContent = activeYtmAcc.email || 'Active Google Session';
          if (ytmAccountTime) {
            const dateStr = activeYtmAcc.lastLogin ? new Date(activeYtmAcc.lastLogin).toLocaleDateString() : '';
            ytmAccountTime.textContent = dateStr ? `Session • ${dateStr}` : `Active session`;
          }
          if (activeYtmAcc.avatar && ytmAccountAvatar) {
            ytmAccountAvatar.src = activeYtmAcc.avatar;
            ytmAccountAvatar.style.display = 'block';
            if (ytmAccountInitials) ytmAccountInitials.style.display = 'none';
          } else {
            if (ytmAccountAvatar) ytmAccountAvatar.style.display = 'none';
            if (ytmAccountInitials) {
              ytmAccountInitials.style.display = 'flex';
              const initial = (activeYtmAcc.name || 'Y').charAt(0).toUpperCase();
              ytmAccountInitials.textContent = initial || 'YM';
            }
          }
        }
        if (ytmSigninHeader) ytmSigninHeader.style.display = 'flex';
        const actionCard = document.getElementById('ytm-login-action-card');
        if (actionCard) actionCard.style.display = 'none';
      } else {
        if (ytmStatusChip) ytmStatusChip.classList.remove('connected');
        if (ytmStatusLabel) ytmStatusLabel.textContent = 'Not logged in';
        if (btnYtmSignout) btnYtmSignout.style.display = 'none';
        if (ytmSavedAccountCard) ytmSavedAccountCard.style.display = 'none';
        if (ytmSigninHeader) ytmSigninHeader.style.display = 'none';
        const actionCard = document.getElementById('ytm-login-action-card');
        if (actionCard) actionCard.style.display = 'flex';
      }

      // Spotify Status & Saved Account Card
      if (isSpotifyAuth && spotifyAcc?.authenticated !== false) {
        const activeSpotifyAcc = spotifyAcc || {};
        if (spotifyStatusChip) spotifyStatusChip.classList.add('connected');
        const spName = activeSpotifyAcc.name || status.spotify.user?.display_name || 'Spotify User';
        if (spotifyStatusLabel) spotifyStatusLabel.textContent = 'Connected on this device';
        if (btnSpotifySignout) btnSpotifySignout.style.display = 'inline-flex';

        // Populate Saved Account Card
        if (spotifySavedAccountCard) {
          spotifySavedAccountCard.style.display = 'block';
          if (spotifyAccountName) spotifyAccountName.textContent = 'Account';
          if (spotifyAccountEmail) spotifyAccountEmail.textContent = activeSpotifyAcc.email || 'Active Spotify Session';
          if (spotifyAccountTime) {
            const dateStr = activeSpotifyAcc.lastLogin ? new Date(activeSpotifyAcc.lastLogin).toLocaleDateString() : '';
            spotifyAccountTime.textContent = dateStr ? `Session • ${dateStr}` : `Active session`;
          }
          if (activeSpotifyAcc.avatar && spotifyAccountAvatar) {
            spotifyAccountAvatar.src = activeSpotifyAcc.avatar;
            spotifyAccountAvatar.style.display = 'block';
            if (spotifyAccountInitials) spotifyAccountInitials.style.display = 'none';
          } else {
            if (spotifyAccountAvatar) spotifyAccountAvatar.style.display = 'none';
            if (spotifyAccountInitials) {
              spotifyAccountInitials.style.display = 'flex';
              const initial = (spName || 'S').charAt(0).toUpperCase();
              spotifyAccountInitials.textContent = initial || 'SP';
            }
          }
        }
        if (spotifySigninHeader) spotifySigninHeader.style.display = 'flex';
        const actionCard = document.getElementById('spotify-login-action-card');
        if (actionCard) actionCard.style.display = 'none';
      } else {
        if (spotifyStatusChip) spotifyStatusChip.classList.remove('connected');
        if (spotifyStatusLabel) spotifyStatusLabel.textContent = 'Not logged in';
        if (btnSpotifySignout) btnSpotifySignout.style.display = 'none';
        if (spotifySavedAccountCard) spotifySavedAccountCard.style.display = 'none';
        if (spotifySigninHeader) spotifySigninHeader.style.display = 'none';
        const actionCard = document.getElementById('spotify-login-action-card');
        if (actionCard) actionCard.style.display = 'flex';
      }

      // Header profile button status (Simple Empty Profile Icon)
      const isAnyAuth = isYtmAuth || isSpotifyAuth;
      if (btnAuthSync) {
        btnAuthSync.classList.toggle('connected', isAnyAuth);
        btnAuthSync.title = isAnyAuth ? 'Sign In & Account (Connected)' : 'Sign In & Account';
      }

      // Always show both Default Browser sign-in and Built-In Secure Sign-In Window options
      if (btnYtmInAppSignin) btnYtmInAppSignin.style.display = 'block';
      if (btnSpotifyInAppSignin) btnSpotifyInAppSignin.style.display = 'block';
    } catch (e) {
      console.warn('[Auth] Error querying auth status:', e);
    }
  }

  // Avoid repeat storage writes when navigation events report the same profile.
  const savedProfileSignatures = new Map();

  // Background Webview User Profile Extractor
  async function inspectAndSaveWebviewUser(service = 'youtube') {
    if (!window.braveApi?.saveUserAccount) return;
    try {
      if (service === 'youtube' && ytWebview) {
        const data = await ytWebview.executeJavaScript(`
          (() => {
            try {
              const cfg = window.ytcfg;
              const name = (cfg && cfg.get && cfg.get('USER_NAME')) || 
                           document.querySelector('ytmusic-settings-button img')?.getAttribute('alt') ||
                           document.querySelector('button#avatar-btn img')?.getAttribute('alt') || '';
              const email = (cfg && cfg.get && cfg.get('USER_EMAIL')) || '';
              const avatar = document.querySelector('button#avatar-btn img, ytmusic-settings-button img, img.ytmusic-settings-button, #avatar img')?.src || '';
              const loggedIn = !!(cfg && cfg.get && cfg.get('LOGGED_IN')) || !!name || !!email || !!avatar;
              return { name, email, avatar, loggedIn };
            } catch (e) {
              return null;
            }
          })()
        `);
        if (data && (data.loggedIn || data.name || data.email)) {
          const signature = JSON.stringify([data.name || '', data.email || '', data.avatar || '']);
          if (savedProfileSignatures.get(service) === signature) return;
          await window.braveApi.saveUserAccount('youtube', {
            name: data.name || 'YouTube Music Account',
            email: data.email || 'Active Google Session',
            avatar: data.avatar || '',
            authenticated: true,
            source: 'webview'
          });
          savedProfileSignatures.set(service, signature);
          refreshAuthStatusUI();
        }
      } else if (service === 'spotify' && spotifyWebview) {
        const data = await spotifyWebview.executeJavaScript(`
          (() => {
            try {
              const nameEl = document.querySelector('[data-testid="user-widget-link"] span, button[data-testid="user-widget-link"] span, [data-testid="username-first-letter"]');
              const imgEl = document.querySelector('button[data-testid="user-widget-link"] img, [data-testid="user-widget-avatar"] img, figure[data-testid="user-widget-avatar"] img');
              const name = nameEl?.textContent?.trim() || '';
              const avatar = imgEl?.src || '';
              const loggedIn = !!name || !!avatar;
              return { name, avatar, loggedIn };
            } catch (e) {
              return null;
            }
          })()
        `);
        if (data && (data.loggedIn || data.name)) {
          const signature = JSON.stringify([data.name || '', '', data.avatar || '']);
          if (savedProfileSignatures.get(service) === signature) return;
          await window.braveApi.saveUserAccount('spotify', {
            name: data.name || 'Spotify Account',
            email: 'Active Spotify Session',
            avatar: data.avatar || '',
            authenticated: true,
            source: 'webview'
          });
          savedProfileSignatures.set(service, signature);
          refreshAuthStatusUI();
        }
      }
    } catch (e) {
      // Non-critical background inspection
    }
  }

  function openAuthSyncModal(initialTab = 'ytm') {
    if (authSyncModal) {
      setModalOpenState(true);
      authSyncModal.style.display = 'flex';
      switchAuthTab(initialTab);
      // Clean up stale status feedback when opening if idle
      if (authSessionTracker.youtube.state !== 'loading' && ytmCdpStatus) {
        ytmCdpStatus.style.display = 'none';
        ytmCdpStatus.textContent = '';
        btnStartYtmCdp?.classList.remove('is-loading');
        if (btnStartYtmCdp) btnStartYtmCdp.disabled = false;
        if (btnCancelYtmCdp) btnCancelYtmCdp.style.display = 'none';
      }
      if (authSessionTracker.spotify.state !== 'loading' && spotifyLoginStatus) {
        spotifyLoginStatus.style.display = 'none';
        spotifyLoginStatus.textContent = '';
        btnStartSpotifyLogin?.classList.remove('is-loading');
        if (btnStartSpotifyLogin) btnStartSpotifyLogin.disabled = false;
        if (btnCancelSpotifyLogin) btnCancelSpotifyLogin.style.display = 'none';
      }
      refreshAuthStatusUI();
      btnCloseAuthSync?.focus();
    }
  }

  function closeAuthSyncModal() {
    if (authSyncModal) {
      authSyncModal.style.display = 'none';
      setModalOpenState(false);
    }
  }

  // Bulletproof click handler for Top User Person Button
  btnAuthSync?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const defaultTab = state.currentTab === 'spotify-view' ? 'spotify' : 'ytm';
    openAuthSyncModal(defaultTab);
  });

  // Saved Account Card Action Buttons
  btnYtmResync?.addEventListener('click', () => {
    showToast('Refreshing YouTube Music player...');
    reloadActiveWebview(ytWebview, 'YouTube Music');
    setTimeout(() => inspectAndSaveWebviewUser('youtube'), 2500);
  });

  btnYtmSignoutCard?.addEventListener('click', async () => {
    const label = btnYtmSignoutCard.querySelector('span');
    btnYtmSignoutCard.disabled = true;
    btnYtmSignoutCard.classList.add('is-loading');
    if (label) label.textContent = 'Signing out…';
    try {
      await window.braveApi.logoutProvider('youtube');
      showToast('Signed out of YouTube Music.');
      await refreshAuthStatusUI();
      reloadActiveWebview(ytWebview, 'YouTube Music');
      if (ytmCdpStatus) {
        ytmCdpStatus.className = 'login-live-feedback info';
        ytmCdpStatus.style.display = 'flex';
        ytmCdpStatus.textContent = 'Signed out. Saved session removed from this device.';
      }
    } catch (err) {
      showToast('Error signing out: ' + err.message);
    } finally {
      btnYtmSignoutCard.disabled = false;
      btnYtmSignoutCard.classList.remove('is-loading');
      if (label) label.textContent = 'Sign Out';
    }
  });

  btnSpotifyResync?.addEventListener('click', () => {
    showToast('Refreshing Spotify player...');
    reloadActiveWebview(spotifyWebview, 'Spotify');
    setTimeout(() => inspectAndSaveWebviewUser('spotify'), 2500);
  });

  btnSpotifySignoutCard?.addEventListener('click', async () => {
    const label = btnSpotifySignoutCard.querySelector('span');
    btnSpotifySignoutCard.disabled = true;
    btnSpotifySignoutCard.classList.add('is-loading');
    if (label) label.textContent = 'Signing out…';
    try {
      await window.braveApi.logoutProvider('spotify');
      showToast('Signed out of Spotify.');
      await refreshAuthStatusUI();
      reloadActiveWebview(spotifyWebview, 'Spotify');
      if (spotifyLoginStatus) {
        spotifyLoginStatus.className = 'login-live-feedback info';
        spotifyLoginStatus.style.display = 'flex';
        spotifyLoginStatus.textContent = 'Signed out. Saved session removed from this device.';
      }
    } catch (err) {
      showToast('Error signing out: ' + err.message);
    } finally {
      btnSpotifySignoutCard.disabled = false;
      btnSpotifySignoutCard.classList.remove('is-loading');
      if (label) label.textContent = 'Sign Out';
    }
  });

  btnCloseAuthSync?.addEventListener('click', closeAuthSyncModal);
  btnCancelAuthSync?.addEventListener('click', closeAuthSyncModal);
  authSyncModal?.addEventListener('click', (e) => {
    if (e.target === authSyncModal) closeAuthSyncModal();
  });

  // =========================================================================
  // 1 & 2. UNIFIED SERVICE SIGN-IN FLOW (YOUTUBE MUSIC & SPOTIFY)
  // =========================================================================

  function getAuthUiConfig(serviceKey) {
    const isSpotify = serviceKey === 'spotify';
    return {
      isSpotify,
      serviceKey,
      displayName: isSpotify ? 'Spotify' : 'YouTube Music',
      defaultBtnText: 'Sign in via Default Browser',
      btn: isSpotify ? btnStartSpotifyLogin : btnStartYtmCdp,
      secondaryBtn: isSpotify ? btnSpotifyInAppSignin : btnYtmInAppSignin,
      btnLabel: isSpotify ? btnSpotifyLoginLabel : btnYtmCdpLabel,
      cancelBtn: isSpotify ? btnCancelSpotifyLogin : btnCancelYtmCdp,
      statusEl: isSpotify ? spotifyLoginStatus : ytmCdpStatus,
      tracker: authSessionTracker[serviceKey]
    };
  }

  async function startServiceSignInFlow(serviceKey, preferredMode = 'auto') {
    const cfg = getAuthUiConfig(serviceKey);
    if (!cfg.btn) return;

    cfg.tracker.state = 'loading';
    if (cfg.tracker.closeTimer) clearTimeout(cfg.tracker.closeTimer);
    cfg.btn.disabled = true;
    cfg.btn.classList.add('is-loading');
    if (cfg.secondaryBtn) cfg.secondaryBtn.disabled = true;
    if (cfg.btnLabel) {
      cfg.btnLabel.textContent = preferredMode === 'in-app'
        ? 'Signing in inside Brave Music…'
        : 'Completing Sign-In…';
    }
    if (cfg.cancelBtn) cfg.cancelBtn.style.display = 'inline-flex';
    if (cfg.statusEl) {
      cfg.statusEl.className = 'login-live-feedback loading';
      cfg.statusEl.style.display = 'flex';
      cfg.statusEl.textContent = `Opening secure ${cfg.displayName} sign-in…`;
    }

    try {
      const res = await window.braveApi.startServiceLogin(serviceKey, preferredMode);
      if (res && res.success) {
        cfg.tracker.state = 'complete';
        cfg.btn.disabled = false;
        cfg.btn.classList.remove('is-loading');
        if (cfg.secondaryBtn) cfg.secondaryBtn.disabled = false;
        if (cfg.btnLabel) cfg.btnLabel.textContent = cfg.defaultBtnText;
        if (cfg.cancelBtn) cfg.cancelBtn.style.display = 'none';
        if (cfg.statusEl) {
          cfg.statusEl.className = 'login-live-feedback success';
          cfg.statusEl.style.display = 'flex';
          cfg.statusEl.textContent = res.message || 'Sign-in complete! Session synced to browser memory.';
        }
        refreshAuthStatusUI();
        refreshMusicTabsAfterSignIn(serviceKey, true);
        cfg.tracker.closeTimer = setTimeout(() => {
          closeAuthSyncModal();
          cfg.tracker.state = 'idle';
        }, 1200);
      } else if (res && res.error && cfg.tracker.state !== 'cancelled') {
        cfg.tracker.state = 'error';
        cfg.btn.disabled = false;
        cfg.btn.classList.remove('is-loading');
        if (cfg.secondaryBtn) cfg.secondaryBtn.disabled = false;
        if (cfg.btnLabel) cfg.btnLabel.textContent = cfg.defaultBtnText;
        if (cfg.cancelBtn) cfg.cancelBtn.style.display = 'none';
        if (cfg.statusEl) {
          cfg.statusEl.className = 'login-live-feedback error';
          cfg.statusEl.style.display = 'flex';
          cfg.statusEl.textContent = res.error;
        }
      }
    } catch (e) {
      cfg.btn.disabled = false;
      cfg.btn.classList.remove('is-loading');
      if (cfg.secondaryBtn) cfg.secondaryBtn.disabled = false;
      if (cfg.btnLabel) cfg.btnLabel.textContent = cfg.defaultBtnText;
      if (cfg.cancelBtn) cfg.cancelBtn.style.display = 'none';
      if (cfg.statusEl && cfg.tracker.state !== 'cancelled') {
        cfg.tracker.state = 'error';
        cfg.statusEl.className = 'login-live-feedback error';
        cfg.statusEl.style.display = 'flex';
        cfg.statusEl.textContent = e?.message ? String(e.message) : 'Error opening sign-in';
      }
    }
  }

  async function cancelServiceSignInFlow(serviceKey) {
    const cfg = getAuthUiConfig(serviceKey);
    try {
      cfg.tracker.state = 'cancelled';
      if (cfg.tracker.closeTimer) clearTimeout(cfg.tracker.closeTimer);
      if (cfg.btn) {
        cfg.btn.disabled = false;
        cfg.btn.classList.remove('is-loading');
      }
      if (cfg.secondaryBtn) cfg.secondaryBtn.disabled = false;
      if (cfg.btnLabel) cfg.btnLabel.textContent = cfg.defaultBtnText;
      if (cfg.cancelBtn) cfg.cancelBtn.style.display = 'none';
      if (cfg.statusEl) {
        cfg.statusEl.className = 'login-live-feedback info';
        cfg.statusEl.style.display = 'flex';
        cfg.statusEl.textContent = 'Sign-in cancelled.';
      }
      await window.braveApi.cancelServiceLogin();
    } catch (e) { }
  }

  btnStartYtmCdp?.addEventListener('click', () => startServiceSignInFlow('youtube', 'browser'));
  btnYtmInAppSignin?.addEventListener('click', () => startServiceSignInFlow('youtube', 'in-app'));
  btnCancelYtmCdp?.addEventListener('click', () => cancelServiceSignInFlow('youtube'));

  // YouTube Music JSON Cookies File Import
  inputYtmCookiesFile?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (ytmFileName) ytmFileName.textContent = file.name;

    if (ytmCdpStatus) {
      ytmCdpStatus.className = 'login-live-feedback loading';
      ytmCdpStatus.style.display = 'block';
      ytmCdpStatus.textContent = `Reading ${file.name} and importing cookies...`;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target.result;
        const res = await window.braveApi.importCookiesJson('youtube', content);
        if (res && res.success) {
          if (ytmCdpStatus) {
            ytmCdpStatus.className = 'login-live-feedback success';
            ytmCdpStatus.style.display = 'block';
            ytmCdpStatus.textContent = `Session imported${res.count ? ` (${res.count} cookies)` : ''}. Refreshing music…`;
          }
          showToast('Sign-in cookies applied. Refreshing music tabs…');
          refreshAuthStatusUI();
          refreshMusicTabsAfterSignIn('youtube', true);
          setTimeout(() => closeAuthSyncModal(), 2200);
        } else {
          if (ytmCdpStatus) {
            ytmCdpStatus.className = 'login-live-feedback error';
            ytmCdpStatus.style.display = 'block';
            ytmCdpStatus.textContent = res?.error || 'Could not import the cookies file.';
          }
        }
      } catch (err) {
        if (ytmCdpStatus) {
          ytmCdpStatus.className = 'login-live-feedback error';
          ytmCdpStatus.style.display = 'block';
          ytmCdpStatus.textContent = `Import error: ${err.message}`;
        }
      } finally {
        event.target.value = '';
      }
    };
    reader.onerror = () => {
      if (ytmCdpStatus) {
        ytmCdpStatus.className = 'login-live-feedback error';
        ytmCdpStatus.textContent = 'Failed to read selected file.';
      }
    };
    reader.readAsText(file);
  });

  // YouTube Music Sign Out
  btnYtmSignout?.addEventListener('click', async () => {
    try {
      await window.braveApi.logoutProvider('youtube');
      showToast('Signed out of YouTube Music.');
      refreshAuthStatusUI();
      reloadActiveWebview(ytWebview, 'YouTube Music');
      if (ytmCdpStatus) {
        ytmCdpStatus.className = 'login-live-feedback';
        ytmCdpStatus.style.display = 'block';
        ytmCdpStatus.textContent = 'Signed out. This app’s saved session was removed.';
      }
    } catch (err) {
      showToast('Error signing out: ' + err.message);
    }
  });

  // =========================================================================
  // 2. SPOTIFY SIGN-IN & JSON COOKIE FILE IMPORT
  // =========================================================================

  btnStartSpotifyLogin?.addEventListener('click', () => startServiceSignInFlow('spotify', 'browser'));
  btnSpotifyInAppSignin?.addEventListener('click', () => startServiceSignInFlow('spotify', 'in-app'));
  btnCancelSpotifyLogin?.addEventListener('click', () => cancelServiceSignInFlow('spotify'));

  // Spotify JSON Cookies File Import
  inputSpotifyCookiesFile?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (spotifyFileName) spotifyFileName.textContent = file.name;

    if (spotifyLoginStatus) {
      spotifyLoginStatus.className = 'login-live-feedback loading';
      spotifyLoginStatus.style.display = 'flex';
      spotifyLoginStatus.textContent = `Reading ${file.name} and importing cookies…`;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target.result;
        const res = await window.braveApi.importCookiesJson('spotify', content);
        if (res && res.success) {
          if (spotifyLoginStatus) {
            spotifyLoginStatus.className = 'login-live-feedback success';
            spotifyLoginStatus.style.display = 'flex';
            spotifyLoginStatus.textContent = `Session imported${res.count ? ` (${res.count} cookies)` : ''}. Refreshing music…`;
          }
          showToast('Sign-in cookies applied. Refreshing music tabs…');
          refreshAuthStatusUI();
          refreshMusicTabsAfterSignIn('spotify', true);
          setTimeout(() => closeAuthSyncModal(), 2200);
        } else {
          if (spotifyLoginStatus) {
            spotifyLoginStatus.className = 'login-live-feedback error';
            spotifyLoginStatus.style.display = 'flex';
            spotifyLoginStatus.textContent = res?.error || 'Could not import the cookies file.';
          }
        }
      } catch (err) {
        if (spotifyLoginStatus) {
          spotifyLoginStatus.className = 'login-live-feedback error';
          spotifyLoginStatus.style.display = 'flex';
          spotifyLoginStatus.textContent = `Import error: ${err.message}`;
        }
      } finally {
        event.target.value = '';
      }
    };
    reader.onerror = () => {
      if (spotifyLoginStatus) {
        spotifyLoginStatus.className = 'login-live-feedback error';
        spotifyLoginStatus.textContent = 'Failed to read selected file.';
      }
    };
    reader.readAsText(file);
  });

  // Spotify Sign Out
  btnSpotifySignout?.addEventListener('click', async () => {
    try {
      await window.braveApi.logoutProvider('spotify');
      showToast('Signed out of Spotify.');
      refreshAuthStatusUI();
      reloadActiveWebview(spotifyWebview, 'Spotify');
      if (spotifyLoginStatus) {
        spotifyLoginStatus.className = 'login-live-feedback info';
        spotifyLoginStatus.style.display = 'flex';
        spotifyLoginStatus.textContent = 'Signed out. Saved session removed from this device.';
      }
    } catch (err) {
      showToast('Error signing out: ' + err.message);
    }
  });

  // Real-time CDP status listener from backend
  window.braveApi?.onAuthCdpStatus?.((status) => {
    const serviceKey = (status.service || (activeAuthTab === 'spotify' ? 'spotify' : 'youtube')).toLowerCase() === 'spotify' ? 'spotify' : 'youtube';
    const cfg = getAuthUiConfig(serviceKey);
    const targetStatusEl = cfg.statusEl;
    if (!targetStatusEl) return;

    // GUARD: If action is already complete, ignore late waiting ticks
    if (cfg.tracker.state === 'complete' && status.state !== 'complete') {
      return;
    }

    targetStatusEl.style.display = 'flex';

    const resetButtons = () => {
      cfg.btn?.classList.remove('is-loading');
      if (cfg.btn) cfg.btn.disabled = false;
      if (cfg.secondaryBtn) cfg.secondaryBtn.disabled = false;
      if (cfg.btnLabel) cfg.btnLabel.textContent = cfg.defaultBtnText;
      if (cfg.cancelBtn) cfg.cancelBtn.style.display = 'none';
    };

    if (status.state === 'complete') {
      cfg.tracker.state = 'complete';
      resetButtons();
      targetStatusEl.className = 'login-live-feedback success';
      targetStatusEl.textContent = status.message || 'Sign-in complete! Session applied.';
      refreshMusicTabsAfterSignIn(serviceKey, true);
      refreshAuthStatusUI();
      if (cfg.tracker.closeTimer) clearTimeout(cfg.tracker.closeTimer);
      cfg.tracker.closeTimer = setTimeout(() => {
        closeAuthSyncModal();
        cfg.tracker.state = 'idle';
      }, 1400);
    } else if (status.state === 'error') {
      cfg.tracker.state = 'error';
      resetButtons();
      targetStatusEl.className = 'login-live-feedback error';
      targetStatusEl.textContent = status.message || 'Sign-in failed.';
    } else if (status.state === 'cancelled') {
      cfg.tracker.state = 'cancelled';
      resetButtons();
      targetStatusEl.className = 'login-live-feedback info';
      targetStatusEl.textContent = status.message || 'Sign-in cancelled.';
    } else {
      cfg.tracker.state = 'loading';
      targetStatusEl.className = 'login-live-feedback loading';
      targetStatusEl.textContent = status.message || `Completing ${cfg.displayName} sign-in…`;
    }
  });

  // Sync completed directly via hardened popup window (triggered from webview Sign-In button or modal)
  window.braveApi?.onAuthSyncCompleted?.((data) => {
    const svc = data?.service === 'spotify' ? 'spotify' : 'youtube';
    const cfg = getAuthUiConfig(svc);
    cfg.tracker.state = 'complete';
    cfg.btn?.classList.remove('is-loading');
    if (cfg.btn) cfg.btn.disabled = false;
    if (cfg.secondaryBtn) cfg.secondaryBtn.disabled = false;
    if (cfg.btnLabel) cfg.btnLabel.textContent = cfg.defaultBtnText;
    if (cfg.cancelBtn) cfg.cancelBtn.style.display = 'none';
    refreshAuthStatusUI();
    refreshMusicTabsAfterSignIn(svc, true);
    if (authSyncModal && authSyncModal.style.display !== 'none') {
      setTimeout(() => {
        closeAuthSyncModal();
        cfg.tracker.state = 'idle';
      }, 900);
    }
  });

  // Intercepted webview login click handler (fallback notice if needed)
  window.braveApi?.onAuthBrowserOpened?.((data) => {
    const service = data?.service;
    const targetTab = service === 'spotify' ? 'spotify' : 'ytm';
    openAuthSyncModal(targetTab);
    if (targetTab === 'ytm' && ytmCdpStatus) {
      ytmCdpStatus.className = 'login-live-feedback info';
      ytmCdpStatus.style.display = 'flex';
      ytmCdpStatus.textContent = 'Sign in using Brave Music’s secure Sign-In window above.';
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (state.selectionMode) {
        toggleSelectMode(false);
        return;
      }
      if (authSyncModal && authSyncModal.style.display !== 'none') closeAuthSyncModal();
      if (aboutModal && aboutModal.style.display !== 'none') closeAboutModal();
      if (createPlaylistModal && createPlaylistModal.style.display !== 'none') createPlaylistModal.style.display = 'none';
      if (deletePlaylistModal && deletePlaylistModal.style.display !== 'none') closeDeletePlaylistModal();
      if (addToPlaylistModal && addToPlaylistModal.style.display !== 'none') addToPlaylistModal.style.display = 'none';
      if (playlistDetailModal && playlistDetailModal.style.display !== 'none') closePlaylistDetail();
      if (playerVolumePopover && playerVolumePopover.style.display !== 'none') {
        playerVolumePopover.style.display = 'none';
        playerMuteBtn?.classList.remove('active');
      }
    }
  });

  // ==========================================================================
  // TAB NAVIGATION
  // ==========================================================================

  let libraryLoadedOnce = false;
  let lastAuthRefreshAt = 0;

  function switchTab(targetId) {
    state.currentTab = targetId;

    tabs.forEach(tab => {
      const isTarget = tab.dataset.target === targetId;
      tab.classList.toggle('active', isTarget);
      tab.setAttribute('aria-selected', isTarget ? 'true' : 'false');
    });

    viewPanels.forEach(panel => {
      panel.classList.toggle('active', panel.id === `panel-${targetId}`);
    });

    if (targetId === 'downloads-view') {
      document.body.classList.remove('stream-view-active');
      if (!libraryLoadedOnce) {
        loadLibrary();
      } else {
        loadRecommendations(false);
      }
    } else {
      document.body.classList.add('stream-view-active');
    }

    try {
      window.braveApi?.switchTab?.(targetId);
    } catch (e) { }

    if (typeof updateNavHistoryState === 'function') {
      updateNavHistoryState();
    }

    const now = Date.now();
    if (now - lastAuthRefreshAt > 12000) {
      lastAuthRefreshAt = now;
      refreshAuthStatusUI();
    }
    if (typeof syncPlaybackLoop === 'function') {
      syncPlaybackLoop();
    }
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      if (tab.dataset.target) {
        switchTab(tab.dataset.target);
      }
    });
  });

  // ==========================================================================
  // BRAVE SHIELDS & WEBVIEWS INTEGRATION
  // ==========================================================================

  async function syncShieldStats() {
    try {
      const stats = await window.braveApi?.getShieldStats();
      if (shieldCountLabel && stats && typeof stats.totalBlocked === 'number') {
        shieldCountLabel.textContent = `${stats.totalBlocked} ads blocked`;
      }
    } catch (e) { }
  }

  syncShieldStats();

  if (window.braveApi?.onShieldUpdate) {
    window.braveApi.onShieldUpdate((data) => {
      if (shieldCountLabel && typeof data?.count === 'number') {
        shieldCountLabel.textContent = `${data.count} ads blocked`;
        shieldCountLabel.classList.remove('pulse-counter');
        void shieldCountLabel.offsetWidth;
        shieldCountLabel.classList.add('pulse-counter');
        setTimeout(() => shieldCountLabel.classList.remove('pulse-counter'), 500);
      }
    });
  }

  shieldCountLabel?.addEventListener('click', () => {
    showToast(`Brave Shields Protection Active: ${shieldCountLabel.textContent}`);
  });

  // Proactive webview shield listener & fallback engine
  function setupWebviewShields(webview, providerName) {
    if (!webview || window.__TAURI__) return;

    // Listen for shield event pings from proactive webview-shields preload
    webview.addEventListener('console-message', (e) => {
      if (e.message && e.message.includes('[BRAVE_SHIELD_BLOCKED]')) {
        window.braveApi?.recordAdBlocked(1, providerName);
      }
    });

    // Verification check on navigation to guarantee active shields
    const verifyShields = () => {
      try {
        webview.executeJavaScript(`
          if (!window.__BRAVE_SHIELDS_INITIALIZED__) {
            console.warn('[Brave Shields] Re-verifying proactive engine on navigation');
          }
        `).catch(() => { });
      } catch (e) { }
    };

    webview.addEventListener('did-navigate', verifyShields);
    webview.addEventListener('did-navigate-in-page', verifyShields);
    webview.addEventListener('dom-ready', verifyShields);
  }

  setupWebviewShields(ytWebview, 'YouTube Music');
  setupWebviewShields(spotifyWebview, 'Spotify');

  // Automatically inspect and sync signed-in user profiles & browser session memory
  ytWebview?.addEventListener('did-stop-loading', () => {
    inspectAndSaveWebviewUser('youtube');
    refreshAuthStatusUI();
  });
  spotifyWebview?.addEventListener('did-stop-loading', () => {
    inspectAndSaveWebviewUser('spotify');
    refreshAuthStatusUI();
  });

  // ==========================================================================
  // DOWNLOAD CONTROLS (OFFLINE AUDIO ENGINE)
  // ==========================================================================

  function isCollectionUrl(rawUrl) {
    const u = String(rawUrl || '').trim();
    if (!u) return false;
    return /[?&]list=[a-zA-Z0-9_-]+/i.test(u) ||
      /open\.spotify\.com\/(?:intl-[a-z-]+\/)?(playlist|album|artist)\/[a-zA-Z0-9]+/i.test(u) ||
      /spotify:(playlist|album|artist):[a-zA-Z0-9]+/i.test(u) ||
      /\/playlist\?list=/i.test(u);
  }

  function getTrackFormatMeta(track) {
    const extMatch = String(track?.filename || '').match(/\.([a-z0-9]+)$/i);
    const rawExt = (track?.format || (extMatch ? extMatch[1] : 'MP3')).toUpperCase();
    const isVideo = /\.(mp4|webm|mkv|m4v)$/i.test(track?.filename || '');
    const sizeBytes = Number(track?.sizeBytes || 0);
    const sizeLabel = sizeBytes > 0
      ? (sizeBytes >= 1024 * 1024 ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(sizeBytes / 1024)} KB`)
      : '';

    let badgeClass = 'badge-format-tag';
    if (isVideo) badgeClass = 'badge-video-tag';
    else if (rawExt === 'MP3') badgeClass = 'badge-format-tag fmt-mp3';
    else if (rawExt === 'FLAC') badgeClass = 'badge-format-tag fmt-flac';
    else if (rawExt === 'M4A' || rawExt === 'AAC') badgeClass = 'badge-format-tag fmt-m4a';

    const label = isVideo ? 'VIDEO' : rawExt;
    const tooltip = [rawExt, track?.bitrate, sizeLabel].filter(Boolean).join(' • ');
    return { label, rawExt, badgeClass, isVideo, sizeLabel, tooltip };
  }

  function getOrderedPlaylistTracks(playlistName) {
    const trackIds = (state.library.playlists || {})[playlistName] || [];
    const trackMap = new Map((state.library.tracks || []).map(t => [t.id, t]));
    return trackIds.map(id => trackMap.get(id)).filter(t => t && !isBuiltInTrack(t));
  }

  function resolvePlaylistSourceBadge(tracks, customCover) {
    const firstWithSource = tracks.find(t => t && (t.source || t.downloadUrl));
    const urlStr = String(firstWithSource?.downloadUrl || customCover || '').toLowerCase();
    const src = String(firstWithSource?.source || '').toLowerCase();
    if (src === 'spotify' || urlStr.includes('spotify.com') || urlStr.includes('scdn.co')) {
      return { label: 'Spotify', badgeClass: 'source-spotify' };
    }
    if (src === 'youtube' || urlStr.includes('youtube.com') || urlStr.includes('youtu.be') || urlStr.includes('ytimg.com')) {
      return { label: 'YouTube', badgeClass: 'source-youtube' };
    }
    return { label: 'Collection', badgeClass: 'source-custom' };
  }

  toggleSong?.addEventListener('click', () => {
    state.downloadType = 'song';
    toggleSong.classList.add('active');
    togglePlaylist.classList.remove('active');
    inputDownloadUrl.placeholder = 'Paste YouTube / Spotify song URL…';
  });

  togglePlaylist?.addEventListener('click', () => {
    state.downloadType = 'playlist';
    togglePlaylist.classList.add('active');
    toggleSong.classList.remove('active');
    inputDownloadUrl.placeholder = 'Paste YouTube / Spotify playlist or mix URL…';
  });

  inputDownloadUrl?.addEventListener('input', () => {
    const val = inputDownloadUrl.value.trim();
    if (isCollectionUrl(val) && state.downloadType !== 'playlist') {
      state.downloadType = 'playlist';
      togglePlaylist?.classList.add('active');
      toggleSong?.classList.remove('active');
      inputDownloadUrl.placeholder = 'Paste YouTube / Spotify playlist or mix URL…';
    }
  });

  btnExecuteDownload?.addEventListener('click', executeDownload);
  inputDownloadUrl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') executeDownload();
  });

  async function executeDownload() {
    const url = inputDownloadUrl.value.trim();
    if (!url) {
      showToast('Please paste a song or playlist link first');
      inputDownloadUrl.focus();
      return;
    }

    const format = selectDownloadFormat ? selectDownloadFormat.value : 'audio-mp3';
    const isVideo = format.startsWith('video');

    downloadProgressBox.style.display = 'flex';
    progressFillBar.style.width = '4%';
    progressPercentVal.textContent = '4%';
    progressSpeed.textContent = isVideo ? 'Video Engine' : '320k MP3 Engine';
    if (progressStatusLabel) progressStatusLabel.style.color = '';

    const isPlaylistUrl = isCollectionUrl(url);
    const shouldDownloadAsPlaylist = state.downloadType === 'playlist' || isPlaylistUrl;
    if (isPlaylistUrl && state.downloadType !== 'playlist') {
      state.downloadType = 'playlist';
      if (togglePlaylist && toggleSong) {
        togglePlaylist.classList.add('active');
        toggleSong.classList.remove('active');
        inputDownloadUrl.placeholder = 'Paste YouTube / Spotify playlist or mix URL…';
      }
    }

    progressStatusLabel.textContent = isVideo
      ? (shouldDownloadAsPlaylist ? 'Resolving & downloading video playlist…' : 'Resolving & downloading music video…')
      : (shouldDownloadAsPlaylist ? 'Fetching playlist/mix tracklist & cover art…' : 'Resolving high-quality audio stream…');

    btnExecuteDownload.disabled = true;

    try {
      const result = await window.braveApi.startDownload({
        url,
        isPlaylist: shouldDownloadAsPlaylist,
        playlistName: '', // Let backend extract genuine playlist title & cover
        format
      });

      if (result && result.success) {
        currentActiveDownloadId = null;
        if (progressFillBar) progressFillBar.style.width = '100%';
        if (progressPercentVal) progressPercentVal.textContent = '100%';
        const countLabel = result.count || 1;
        if (progressStatusLabel) {
          progressStatusLabel.textContent = shouldDownloadAsPlaylist
            ? `Saved ${countLabel} tracks in sequence to "${result.playlist || 'Playlist'}"`
            : 'Saved track to offline library';
        }
        showToast(shouldDownloadAsPlaylist
          ? `Downloaded ${countLabel} songs into "${result.playlist || 'Playlist'}" & library`
          : (isVideo ? 'Music video downloaded to offline storage' : 'Song downloaded cleanly to offline storage'));
        inputDownloadUrl.value = '';
        await loadLibrary();
        setTimeout(() => {
          if (!currentActiveDownloadId && downloadProgressBox) {
            downloadProgressBox.style.display = 'none';
          }
        }, 2800);
      } else if (result && result.canceled) {
        currentActiveDownloadId = null;
        showToast('Download canceled by user');
      } else {
        currentActiveDownloadId = null;
        const errorMsg = (result && result.error) ? result.error : 'Download failed';
        if (progressStatusLabel) {
          progressStatusLabel.textContent = errorMsg;
          progressStatusLabel.style.color = '#f87171';
        }
        showToast(`Download failed: ${errorMsg}`);
      }
    } catch (err) {
      currentActiveDownloadId = null;
      if (progressStatusLabel) {
        progressStatusLabel.textContent = `Error: ${err.message}`;
        progressStatusLabel.style.color = '#f87171';
      }
      showToast(`Download error: ${err.message}`);
    } finally {
      btnExecuteDownload.disabled = false;
    }
  }

  let currentActiveDownloadId = null;
  const btnCancelDownload = document.getElementById('btn-cancel-download');
  btnCancelDownload?.addEventListener('click', async () => {
    if (currentActiveDownloadId && window.braveApi?.cancelDownload) {
      await window.braveApi.cancelDownload(currentActiveDownloadId);
      showToast('Canceling download…');
      if (progressStatusLabel) {
        progressStatusLabel.textContent = 'Canceling download…';
        progressStatusLabel.style.color = '#f87171';
      }
    }
  });

  if (window.braveApi?.onDownloadProgress) {
    window.braveApi.onDownloadProgress((data) => {
      if (!data) return;
      if (data.download_id || data.downloadId) {
        currentActiveDownloadId = data.download_id || data.downloadId;
      }
      if (downloadProgressBox && downloadProgressBox.style.display === 'none') {
        downloadProgressBox.style.display = 'flex';
      }
      const rawPct = typeof data.percent === 'number' ? data.percent : (typeof data.pct === 'number' ? data.pct : null);
      if (rawPct !== null) {
        const pct = Math.max(0, Math.min(100, Math.round(rawPct)));
        progressFillBar.style.width = `${pct}%`;
        progressPercentVal.textContent = (data.itemTotal && data.itemIndex)
          ? `${pct}% (${data.itemIndex}/${data.itemTotal})`
          : `${pct}%`;
        window.braveApi?.setTaskbarProgress(pct / 100);
      }
      if (data.complete) {
        currentActiveDownloadId = null;
        setTimeout(() => {
          downloadProgressBox.style.display = 'none';
          if (progressStatusLabel) progressStatusLabel.style.color = '';
        }, 3000);
      }
      if (progressStatusLabel) {
        if (data.status) {
          progressStatusLabel.textContent = data.status;
          if (data.error) {
            progressStatusLabel.style.color = '#f87171';
          }
        } else if (data.size) {
          progressStatusLabel.textContent = `Downloading (${data.size})${data.eta ? ' • ETA ' + data.eta : ''}…`;
        }
      }
      if (data.speed) {
        progressSpeed.textContent = data.speed;
      }
      // Reactive auto-update as tracks finish
      if (data.trackSaved || data.playlistCreated) {
        loadLibrary();
      }
    });
  }

  // Real-time backend library update event listener (no app reopening needed)
  if (window.braveApi?.onLibraryUpdated) {
    window.braveApi.onLibraryUpdated(async (data) => {
      await loadLibrary();
      if (activeDetailPlaylist) {
        if (!state.library.playlists || !state.library.playlists[activeDetailPlaylist]) {
          closePlaylistDetail();
        } else {
          const pName = typeof data?.playlist === 'object' ? data.playlist?.name : data?.playlist;
          if (!pName || pName === activeDetailPlaylist) {
            openPlaylistDetail(activeDetailPlaylist);
          }
        }
      }
    });
  }

  btnOpenFolder?.addEventListener('click', () => {
    window.braveApi?.openDownloadsFolder();
  });

  // Folder Settings to customize download path
  btnFolderSettings?.addEventListener('click', async () => {
    try {
      const res = await window.braveApi.selectDownloadFolder();
      if (res && res.success) {
        showToast(`Download location updated: ${res.downloadsDir || 'Saved'}`);
        await loadLibrary();
      } else if (res && !res.canceled) {
        showToast(res?.error || 'Could not change download folder');
      }
    } catch (err) {
      showToast(`Error: ${err.message}`);
    }
  });

  // Add Music from Our Files to Music Library
  btnImportMusic?.addEventListener('click', async () => {
    try {
      const res = await window.braveApi.importLocalFiles();
      if (res && res.success) {
        showToast(`Imported ${res.imported} track(s) into your library!`);
        await loadLibrary();
      } else if (res && !res.canceled) {
        showToast(res?.error || 'No audio files imported');
      }
    } catch (err) {
      showToast(`Import error: ${err.message}`);
    }
  });

  // Filter Segmented Control: "All Music" vs "Playlists"
  filterAllMusic?.addEventListener('click', () => {
    state.activeView = 'all';
    state.selectedPlaylist = null;
    filterAllMusic.classList.add('active');
    filterPlaylists.classList.remove('active');
    viewAllMusic.style.display = 'block';
    viewPlaylists.style.display = 'none';
    renderTracksTable();
  });

  filterPlaylists?.addEventListener('click', () => {
    if (state.selectionMode) toggleSelectMode(false);
    state.activeView = 'playlists';
    filterPlaylists.classList.add('active');
    filterAllMusic.classList.remove('active');
    viewAllMusic.style.display = 'none';
    viewPlaylists.style.display = 'block';
  });

  // Multi-Selection Logic & Event Handlers
  function toggleSelectMode(enable) {
    if (typeof enable === 'boolean') {
      state.selectionMode = enable;
    } else {
      state.selectionMode = !state.selectionMode;
    }

    if (!state.selectionMode) {
      state.selectedTrackIds.clear();
    }

    const tracksTable = document.getElementById('tracks-table');
    if (tracksTable) {
      tracksTable.classList.toggle('select-mode-active', state.selectionMode);
    }

    if (btnToggleSelectMode) {
      btnToggleSelectMode.classList.toggle('active', state.selectionMode);
      btnToggleSelectMode.title = state.selectionMode ? 'Finish selection (Esc)' : 'Select multiple tracks to manage or delete';
    }
    if (btnSelectModeText) {
      btnSelectModeText.textContent = state.selectionMode ? 'Done' : 'Select';
    }
    if (selectionActionBar) {
      selectionActionBar.style.display = state.selectionMode ? 'flex' : 'none';
    }
    if (thNumLabel) {
      thNumLabel.style.display = state.selectionMode ? 'none' : 'inline';
    }
    if (thCheckboxWrap) {
      thCheckboxWrap.style.display = state.selectionMode ? 'inline-flex' : 'none';
    }

    updateSelectionUI();
    renderTracksTable();
  }

  function handleRowSelect(trackId, tr, explicitChecked) {
    const shouldSelect = typeof explicitChecked === 'boolean'
      ? explicitChecked
      : !state.selectedTrackIds.has(trackId);

    if (shouldSelect) {
      state.selectedTrackIds.add(trackId);
      if (tr) tr.classList.add('row-selected');
    } else {
      state.selectedTrackIds.delete(trackId);
      if (tr) tr.classList.remove('row-selected');
    }

    if (tr) {
      const cb = tr.querySelector('.row-select-checkbox');
      if (cb && cb.checked !== shouldSelect) {
        cb.checked = shouldSelect;
      }
    }

    updateSelectionUI();
  }

  function updateSelectionUI() {
    const visibleTracks = getSortedAndFilteredTracks().filter(t => !isBuiltInTrack(t));
    const count = state.selectedTrackIds.size;

    if (selectionCountBadge) {
      selectionCountBadge.textContent = count;
    }
    if (btnDeleteSelected) {
      btnDeleteSelected.disabled = count === 0;
    }
    if (btnDeleteSelectedText) {
      btnDeleteSelectedText.textContent = count > 0 ? `Delete (${count})` : 'Delete Selected';
    }

    const allSelected = visibleTracks.length > 0 && visibleTracks.every(t => state.selectedTrackIds.has(t.id));
    const someSelected = count > 0 && !allSelected;

    if (checkboxSelectAll) {
      checkboxSelectAll.checked = allSelected;
      checkboxSelectAll.indeterminate = someSelected;
    }
    if (thSelectAllCheckbox) {
      thSelectAllCheckbox.checked = allSelected;
      thSelectAllCheckbox.indeterminate = someSelected;
    }
  }

  function toggleSelectAll() {
    const visibleTracks = getSortedAndFilteredTracks().filter(t => !isBuiltInTrack(t));
    if (visibleTracks.length === 0) return;

    const allSelected = visibleTracks.every(t => state.selectedTrackIds.has(t.id));
    if (allSelected) {
      visibleTracks.forEach(t => state.selectedTrackIds.delete(t.id));
    } else {
      visibleTracks.forEach(t => state.selectedTrackIds.add(t.id));
    }

    // In-place reactive update of rendered table rows without tearing down DOM
    const rows = tracksTableBody.querySelectorAll('tr');
    rows.forEach(tr => {
      const cb = tr.querySelector('.row-select-checkbox');
      if (cb && !cb.disabled) {
        const tId = cb.getAttribute('data-track-id');
        const shouldBeChecked = state.selectedTrackIds.has(tId);
        cb.checked = shouldBeChecked;
        tr.classList.toggle('row-selected', shouldBeChecked);
      }
    });

    updateSelectionUI();
  }

  btnToggleSelectMode?.addEventListener('click', () => toggleSelectMode());
  checkboxSelectAll?.addEventListener('change', () => toggleSelectAll());
  thSelectAllCheckbox?.addEventListener('change', () => toggleSelectAll());
  btnCancelSelection?.addEventListener('click', () => toggleSelectMode(false));

  btnDeleteSelected?.addEventListener('click', async () => {
    const count = state.selectedTrackIds.size;
    if (count === 0) return;

    const confirmMsg = count === 1
      ? 'Delete 1 selected track from offline storage? This will remove the file from your computer and library.'
      : `Delete ${count} selected tracks from offline storage? This will remove the files from your computer and library.`;

    if (confirm(confirmMsg)) {
      const idsToDelete = Array.from(state.selectedTrackIds);

      // Stop & reset player if playing one of the tracks being deleted
      if (state.player.currentTrack && idsToDelete.includes(state.player.currentTrack.id)) {
        runtimeAudio.pause();
        runtimeAudio.src = '';
        state.player.currentTrack = null;
        state.player.isPlaying = false;
        playerTitle.textContent = 'Select a track to play';
        playerArtist.textContent = 'Offline Library';
        playerArtImg.src = EMPTY_MUSIC_THUMBNAIL;
        if (playerWaves) playerWaves.style.display = 'none';
        playerPlayIcon.style.display = 'block';
        playerPauseIcon.style.display = 'none';
      }

      const res = await window.braveApi?.deleteTracks(idsToDelete);
      const deletedCount = res?.deletedCount || idsToDelete.length;
      showToast(`Deleted ${deletedCount} ${deletedCount === 1 ? 'track' : 'tracks'} from offline storage`);

      state.selectedTrackIds.clear();
      toggleSelectMode(false);
      await loadLibrary();
    }
  });

  // Sort dropdown handler
  sortTracksSelect?.addEventListener('change', (e) => {
    state.sortMode = e.target.value;
    renderTracksTable();
  });

  // Search input handler
  searchInput?.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.toLowerCase().trim();
    renderTracksTable();
  });

  // Sample quick test links
  document.querySelectorAll('.sample-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      inputDownloadUrl.value = tag.dataset.url;
      executeDownload();
    });
  });

  // ==========================================================================
  // CUSTOM PLAYLIST CREATION & MANAGEMENT
  // ==========================================================================

  function resetCreatePlaylistModal() {
    if (inputPlaylistName) inputPlaylistName.value = '';
    selectedPlaylistCover = 'linear-gradient(135deg, #fb542b 0%, #ff8243 100%)';
    if (playlistCoverPreview) playlistCoverPreview.style.background = selectedPlaylistCover;
    coverPresetChips.forEach(c => c.classList.remove('active'));
    if (coverPresetChips[0]) coverPresetChips[0].classList.add('active');
  }

  function openCreatePlaylistModal() {
    if (createPlaylistModal) {
      resetCreatePlaylistModal();
      createPlaylistModal.style.display = 'flex';
      setTimeout(() => inputPlaylistName?.focus(), 60);
    }
  }

  btnCreatePlaylist?.addEventListener('click', openCreatePlaylistModal);
  btnCreatePlaylistBanner?.addEventListener('click', openCreatePlaylistModal);

  btnCloseCreatePlaylist?.addEventListener('click', () => {
    createPlaylistModal.style.display = 'none';
  });

  btnCancelCreatePlaylist?.addEventListener('click', () => {
    createPlaylistModal.style.display = 'none';
  });

  createPlaylistModal?.addEventListener('click', (e) => {
    if (e.target === createPlaylistModal) createPlaylistModal.style.display = 'none';
  });

  // Preset Cover Chips
  coverPresetChips.forEach(chip => {
    chip.addEventListener('click', () => {
      coverPresetChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const bg = chip.style.background;
      selectedPlaylistCover = bg;
      if (playlistCoverPreview) {
        playlistCoverPreview.style.background = bg;
      }
    });
  });

  // Upload Custom Image File for Playlist Cover
  btnUploadCover?.addEventListener('click', () => {
    inputCoverFile?.click();
  });

  inputCoverFile?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      selectedPlaylistCover = `url('${dataUrl}') center/cover no-repeat`;
      if (playlistCoverPreview) {
        playlistCoverPreview.style.background = selectedPlaylistCover;
      }
      coverPresetChips.forEach(c => c.classList.remove('active'));
    };
    reader.readAsDataURL(file);
  });

  btnSubmitCreatePlaylist?.addEventListener('click', submitCreatePlaylist);
  inputPlaylistName?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitCreatePlaylist();
  });

  async function submitCreatePlaylist() {
    const name = inputPlaylistName.value.trim();
    if (!name) {
      showToast('Please enter a playlist name');
      inputPlaylistName.focus();
      return;
    }

    try {
      const res = await window.braveApi.createPlaylist({ name, cover: selectedPlaylistCover });
      if (res && res.success) {
        showToast(`Playlist "${name}" created!`);
        createPlaylistModal.style.display = 'none';
        await loadLibrary();
      } else {
        showToast(res?.error || 'Failed to create playlist');
      }
    } catch (e) {
      showToast(`Error: ${e.message}`);
    }
  }

  // ==========================================================================
  // PLAYLIST DELETION CONFIRMATION MODAL (POPUP WITH 2 OPTIONS)
  // ==========================================================================

  function openDeletePlaylistModal(playlistName) {
    targetPlaylistToDelete = playlistName;
    if (deletePlaylistTargetName) {
      deletePlaylistTargetName.textContent = `"${playlistName}"`;
    }
    if (deletePlaylistModal) {
      deletePlaylistModal.style.display = 'flex';
      btnCloseDeletePlaylist?.focus();
    }
  }

  function closeDeletePlaylistModal() {
    if (deletePlaylistModal) {
      deletePlaylistModal.style.display = 'none';
    }
    targetPlaylistToDelete = null;
  }

  btnCancelDeletePlaylist?.addEventListener('click', closeDeletePlaylistModal);
  btnCloseDeletePlaylist?.addEventListener('click', closeDeletePlaylistModal);
  deletePlaylistModal?.addEventListener('click', (e) => {
    if (e.target === deletePlaylistModal) closeDeletePlaylistModal();
  });

  // Option 1: Remove Only Playlist Without Music Files
  btnDeletePlaylistOnly?.addEventListener('click', async () => {
    if (!targetPlaylistToDelete) return;
    const name = targetPlaylistToDelete;
    closeDeletePlaylistModal();
    if (activeDetailPlaylist === name) {
      closePlaylistDetail();
    }
    try {
      await window.braveApi.deletePlaylist({ name, deleteFiles: false });
      showToast(`Playlist "${name}" deleted (music files kept in library)`);
      if (state.selectedPlaylist === name) state.selectedPlaylist = null;
      await loadLibrary();
    } catch (e) {
      showToast(`Error deleting playlist: ${e.message}`);
    }
  });

  // Option 2: Remove All (Playlist and Music Files)
  btnDeletePlaylistAndFiles?.addEventListener('click', async () => {
    if (!targetPlaylistToDelete) return;
    const name = targetPlaylistToDelete;
    closeDeletePlaylistModal();
    if (activeDetailPlaylist === name) {
      closePlaylistDetail();
    }
    try {
      await window.braveApi.deletePlaylist({ name, deleteFiles: true });
      showToast(`Playlist "${name}" and all music files removed permanently`);
      if (state.selectedPlaylist === name) state.selectedPlaylist = null;
      await loadLibrary();
    } catch (e) {
      showToast(`Error deleting playlist and files: ${e.message}`);
    }
  });

  // Built-in Music Exclusion Helper ("Never Gonna Give You Up")
  function isBuiltInTrack(track) {
    if (!track) return false;
    if (track.isBuiltIn === true) return true;
    const title = (track.title || '').toLowerCase();
    const artist = (track.artist || '').toLowerCase();
    const filename = (track.filename || '').toLowerCase();
    return title.includes('never gonna give you up') ||
      filename.includes('dqw4w9wgxcq') ||
      (artist.includes('rick astley') && title.includes('never gonna'));
  }

  const EMPTY_MUSIC_THUMBNAIL = 'assets/empty-music.svg';

  // Vector Empty Music Thumbnail Helper
  function getTrackThumbnail(track) {
    if (!track) return EMPTY_MUSIC_THUMBNAIL;
    // Built-in music must always have their cover icon as simple music vector empty thumbnail
    if (isBuiltInTrack(track)) return EMPTY_MUSIC_THUMBNAIL;
    if (!track.thumbnail || track.thumbnail === 'assets/app-icon.svg' || track.thumbnail === 'assets/Brave-Music.svg' || String(track.thumbnail).trim() === '') {
      return EMPTY_MUSIC_THUMBNAIL;
    }
    return track.thumbnail;
  }

  // Add Track to Playlist Modal
  btnCloseAddPlaylist?.addEventListener('click', () => {
    addToPlaylistModal.style.display = 'none';
  });
  btnDoneAddPlaylist?.addEventListener('click', () => {
    addToPlaylistModal.style.display = 'none';
  });
  addToPlaylistModal?.addEventListener('click', (e) => {
    if (e.target === addToPlaylistModal) addToPlaylistModal.style.display = 'none';
  });

  function openAddToPlaylistModal(track) {
    if (isBuiltInTrack(track)) {
      showToast('Built-in system music cannot be added to custom playlists');
      return;
    }

    currentTrackForPlaylist = track;
    addPlaylistTrackName.textContent = `Assign "${track.title}" to custom playlist:`;
    playlistsChecklist.innerHTML = '';

    const playlists = state.library.playlists || {};
    const playlistNames = Object.keys(playlists);

    if (playlistNames.length === 0) {
      playlistsChecklist.innerHTML = `
        <div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 0.84rem;">
          No custom playlists created yet.<br>Click "New Playlist" on the top right to create one first.
        </div>`;
      addToPlaylistModal.style.display = 'flex';
      return;
    }

    playlistNames.forEach(name => {
      const trackIds = playlists[name] || [];
      const isAlreadyIn = trackIds.includes(track.id);

      const item = document.createElement('div');
      item.className = 'playlist-selection-item';
      item.innerHTML = `
        <span class="playlist-selection-title">${escapeHtml(name)}</span>
        <span class="playlist-selection-badge">${isAlreadyIn ? '✓ In Playlist' : '+ Add'}</span>
      `;

      item.addEventListener('click', async () => {
        try {
          if (isAlreadyIn) {
            await window.braveApi.removeFromPlaylist(track.id, name);
            showToast(`Removed from "${name}"`);
          } else {
            await window.braveApi.addToPlaylist(track.id, name);
            showToast(`Added to "${name}"`);
          }
          await loadLibrary();
          openAddToPlaylistModal(track);
        } catch (e) {
          showToast(`Error: ${e.message}`);
        }
      });

      playlistsChecklist.appendChild(item);
    });

    addToPlaylistModal.style.display = 'flex';
  }

  // ==========================================================================
  // DEDICATED PLAYLIST DETAIL & MUSIC LIST VIEW
  // ==========================================================================

  function closePlaylistDetail() {
    if (playlistDetailModal) playlistDetailModal.style.display = 'none';
    activeDetailPlaylist = null;
    if (typeof updateNavHistoryState === 'function') {
      updateNavHistoryState();
    }
  }

  function openPlaylistDetail(playlistName) {
    if (!playlistName) return;
    activeDetailPlaylist = playlistName;
    if (typeof updateNavHistoryState === 'function') {
      updateNavHistoryState();
    }
    if (playlistDetailTitle) playlistDetailTitle.textContent = playlistName;

    const playlists = state.library.playlists || {};
    const playlistCovers = state.library.playlistCovers || {};
    const trackIds = playlists[playlistName] || [];
    const allTracks = state.library.tracks || [];
    const trackMap = new Map(allTracks.map(t => [t.id, t]));

    // Strictly preserve playlist insertion order: 1, 2, 3, 4, 5...
    const playlistTracks = trackIds
      .map(id => trackMap.get(id))
      .filter(t => t && !isBuiltInTrack(t));

    // Cover art setup
    const customCover = playlistCovers[playlistName];
    const firstTrack = playlistTracks[0];
    if (playlistDetailCover) {
      playlistDetailCover.innerHTML = '';
      if (customCover && customCover.startsWith('linear-gradient')) {
        playlistDetailCover.style.background = customCover;
        playlistDetailCover.style.backgroundImage = customCover;
        playlistDetailCover.innerHTML = `
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="2">
            <path d="M9 18V5l12-2v13"></path>
            <circle cx="6" cy="18" r="3"></circle>
            <circle cx="18" cy="16" r="3"></circle>
          </svg>`;
      } else if (customCover && customCover.startsWith('url(')) {
        playlistDetailCover.style.background = customCover;
        playlistDetailCover.style.backgroundSize = 'cover';
        playlistDetailCover.style.backgroundPosition = 'center';
      } else if (customCover && (customCover.startsWith('http://') || customCover.startsWith('https://') || customCover.startsWith('data:'))) {
        playlistDetailCover.style.background = 'var(--bg-surface-card)';
        playlistDetailCover.innerHTML = `<img src="${customCover}" alt="" onerror="this.src='${EMPTY_MUSIC_THUMBNAIL}'" style="width: 100%; height: 100%; object-fit: cover;">`;
      } else {
        const thumb = getTrackThumbnail(firstTrack);
        playlistDetailCover.style.background = 'var(--bg-surface-card)';
        playlistDetailCover.innerHTML = `<img src="${thumb}" alt="" onerror="this.src='${EMPTY_MUSIC_THUMBNAIL}'" style="width: 100%; height: 100%; object-fit: cover;">`;
      }
    }

    // Duration & Count
    const totalDurationSec = playlistTracks.reduce((acc, t) => acc + (t.duration || 0), 0);
    if (playlistDetailCount) playlistDetailCount.textContent = `${playlistTracks.length} ${playlistTracks.length === 1 ? 'track' : 'tracks'}`;
    if (playlistDetailDuration) playlistDetailDuration.textContent = formatDuration(totalDurationSec);

    // Sync "Player Only" button state
    if (btnPlaylistPlayerOnly && labelPlayerOnlyMode) {
      if (state.player.lockedPlaylist === playlistName) {
        btnPlaylistPlayerOnly.classList.add('active');
        labelPlayerOnlyMode.textContent = 'Player Only: ON';
      } else {
        btnPlaylistPlayerOnly.classList.remove('active');
        labelPlayerOnlyMode.textContent = 'Player Only';
      }
    }

    renderPlaylistDetailTracks(playlistName, playlistTracks);
    if (playlistDetailModal) playlistDetailModal.style.display = 'flex';
  }

  function renderPlaylistDetailTracks(playlistName, tracks) {
    if (!playlistDetailTracksBody) return;
    playlistDetailTracksBody.innerHTML = '';

    if (!tracks || tracks.length === 0) {
      if (playlistDetailEmpty) playlistDetailEmpty.style.display = 'flex';
      return;
    }

    if (playlistDetailEmpty) playlistDetailEmpty.style.display = 'none';

    tracks.forEach((track, idx) => {
      const isCurrentlyPlayingThis = state.player.currentTrack && state.player.currentTrack.id === track.id;
      const fmt = getTrackFormatMeta(track);
      const tr = document.createElement('tr');
      if (isCurrentlyPlayingThis) {
        tr.classList.add('playing-row');
      }

      tr.innerHTML = `
        <td class="col-num" style="width: 44px; text-align: center;">
          ${isCurrentlyPlayingThis && state.player.isPlaying
          ? '<div class="playing-num-eq"><span></span><span></span><span></span></div>'
          : (idx + 1)}
        </td>
        <td class="col-title">
          <div class="track-meta-cell">
            <img class="track-thumb" src="${getTrackThumbnail(track)}" alt="" onerror="this.src='${EMPTY_MUSIC_THUMBNAIL}'">
            <span class="track-title-text" title="${escapeHtml(track.title)}">${escapeHtml(track.title)}</span>
            <span class="${fmt.badgeClass}" title="${escapeHtml(fmt.tooltip || fmt.label)}">${escapeHtml(fmt.label)}</span>
          </div>
        </td>
        <td class="col-artist" title="${escapeHtml(track.artist || 'Unknown Artist')}">${escapeHtml(track.artist || 'Unknown Artist')}</td>
        <td class="col-duration" style="width: 80px;">${formatDuration(track.duration)}</td>
        <td class="col-actions" style="width: 140px; text-align: right;">
          <div class="row-actions-group" style="justify-content: flex-end;">
            <button class="row-action-btn play-detail-track-btn" title="Play directly in built-in player">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            </button>
            <button class="row-action-btn remove-detail-track-btn" title="Remove from this playlist">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <button class="row-action-btn folder-detail-track-btn" title="Locate file in folder">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
            </button>
          </div>
        </td>
      `;

      // Play track from detail row
      tr.querySelector('.play-detail-track-btn')?.addEventListener('click', () => {
        state.selectedPlaylist = playlistName;
        playTrack(track, idx);
      });

      // Double-click row to play
      tr.addEventListener('dblclick', () => {
        state.selectedPlaylist = playlistName;
        playTrack(track, idx);
      });

      // Remove from playlist
      tr.querySelector('.remove-detail-track-btn')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await window.braveApi.removeFromPlaylist(track.id, playlistName);
          showToast(`Removed "${track.title}" from "${playlistName}"`);
          await loadLibrary();
          openPlaylistDetail(playlistName);
        } catch (err) {
          showToast(`Error removing track: ${err.message}`);
        }
      });

      // Locate in folder
      tr.querySelector('.folder-detail-track-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (track.filename && window.braveApi?.showInFolder) {
          window.braveApi.showInFolder(track.filename);
        } else {
          window.braveApi?.openDownloadsFolder();
        }
      });

      playlistDetailTracksBody.appendChild(tr);
    });
  }

  // Playlist Detail Toolbar Button Listeners
  btnPlaylistPlayAll?.addEventListener('click', () => {
    if (!activeDetailPlaylist) return;
    const playlistTrackIds = (state.library.playlists || {})[activeDetailPlaylist] || [];
    const allTracks = state.library.tracks || [];
    const trackMap = new Map(allTracks.map(t => [t.id, t]));
    const playlistTracks = playlistTrackIds
      .map(id => trackMap.get(id))
      .filter(t => t && !isBuiltInTrack(t));
    if (playlistTracks.length === 0) {
      showToast('This playlist has no songs yet');
      return;
    }
    state.selectedPlaylist = activeDetailPlaylist;
    state.player.isShuffle = false;
    if (playerShuffleBtn) playerShuffleBtn.classList.remove('active');
    playTrack(playlistTracks[0], 0);
    showToast(`Playing "${activeDetailPlaylist}" from start`);
  });

  btnPlaylistShuffle?.addEventListener('click', () => {
    if (!activeDetailPlaylist) return;
    const playlistTrackIds = (state.library.playlists || {})[activeDetailPlaylist] || [];
    const allTracks = state.library.tracks || [];
    const trackMap = new Map(allTracks.map(t => [t.id, t]));
    const playlistTracks = playlistTrackIds
      .map(id => trackMap.get(id))
      .filter(t => t && !isBuiltInTrack(t));
    if (playlistTracks.length === 0) {
      showToast('This playlist has no songs yet');
      return;
    }
    state.selectedPlaylist = activeDetailPlaylist;
    state.player.isShuffle = true;
    if (playerShuffleBtn) playerShuffleBtn.classList.add('active');
    const randIdx = Math.floor(Math.random() * playlistTracks.length);
    playTrack(playlistTracks[randIdx], randIdx);
    showToast(`Shuffle play active for "${activeDetailPlaylist}"`);
  });

  btnPlaylistRandom?.addEventListener('click', () => {
    if (!activeDetailPlaylist) return;
    const playlistTrackIds = (state.library.playlists || {})[activeDetailPlaylist] || [];
    const allTracks = state.library.tracks || [];
    const trackMap = new Map(allTracks.map(t => [t.id, t]));
    const playlistTracks = playlistTrackIds
      .map(id => trackMap.get(id))
      .filter(t => t && !isBuiltInTrack(t));
    if (playlistTracks.length === 0) {
      showToast('This playlist has no songs yet');
      return;
    }
    state.selectedPlaylist = activeDetailPlaylist;
    const randIdx = Math.floor(Math.random() * playlistTracks.length);
    playTrack(playlistTracks[randIdx], randIdx);
    showToast(`Playing random song: "${playlistTracks[randIdx].title}"`);
  });

  btnPlaylistPlayerOnly?.addEventListener('click', () => {
    if (!activeDetailPlaylist) return;
    if (state.player.lockedPlaylist === activeDetailPlaylist) {
      state.player.lockedPlaylist = null;
      btnPlaylistPlayerOnly.classList.remove('active');
      labelPlayerOnlyMode.textContent = 'Player Only';
      showToast('Player unlocked to full library');
    } else {
      state.player.lockedPlaylist = activeDetailPlaylist;
      state.selectedPlaylist = activeDetailPlaylist;
      btnPlaylistPlayerOnly.classList.add('active');
      labelPlayerOnlyMode.textContent = 'Player Only: ON';
      showToast(`Player locked strictly to "${activeDetailPlaylist}"`);
    }
  });

  btnPlaylistDeleteFromDetail?.addEventListener('click', () => {
    if (!activeDetailPlaylist) return;
    const name = activeDetailPlaylist;
    closePlaylistDetail();
    openDeletePlaylistModal(name);
  });

  btnClosePlaylistDetail?.addEventListener('click', closePlaylistDetail);
  playlistDetailModal?.addEventListener('click', (e) => {
    if (e.target === playlistDetailModal) closePlaylistDetail();
  });

  // ==========================================================================
  // BUILT-IN RUNTIME AUDIO PLAYER ENGINE
  // ==========================================================================

  function getSortedAndFilteredTracks() {
    let tracks = state.library.tracks || [];

    // Filter by locked playlist or selected playlist if active
    const activePlaylist = state.player.lockedPlaylist || state.selectedPlaylist;
    if (activePlaylist) {
      const playlistTrackIds = (state.library.playlists || {})[activePlaylist] || [];
      const trackMap = new Map(tracks.map(t => [t.id, t]));
      tracks = playlistTrackIds
        .map(id => trackMap.get(id))
        .filter(t => t && !isBuiltInTrack(t));
    }

    // Filter by search query
    if (state.searchQuery) {
      tracks = tracks.filter(t => {
        const titleMatch = t.title && t.title.toLowerCase().includes(state.searchQuery);
        const artistMatch = t.artist && t.artist.toLowerCase().includes(state.searchQuery);
        const albumMatch = t.album && t.album.toLowerCase().includes(state.searchQuery);
        return titleMatch || artistMatch || albumMatch;
      });
    }

    // Sort tracks
    const sorted = [...tracks];
    switch (state.sortMode) {
      case 'title-asc':
        sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        break;
      case 'title-desc':
        sorted.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
        break;
      case 'artist-asc':
        sorted.sort((a, b) => (a.artist || '').localeCompare(b.artist || ''));
        break;
      case 'duration-desc':
        sorted.sort((a, b) => (b.duration || 0) - (a.duration || 0));
        break;
      case 'duration-asc':
        sorted.sort((a, b) => (a.duration || 0) - (b.duration || 0));
        break;
      case 'recent':
      default:
        // Keep order of addition
        break;
    }

    return sorted;
  }

  // Native Audio Engine Hardware Configuration
  runtimeAudio.crossOrigin = 'anonymous';
  runtimeAudio.volume = state.player.volume;
  runtimeAudio.muted = false;
  if (playerVolumeFill) playerVolumeFill.style.height = `${Math.round(state.player.volume * 100)}%`;
  if (playerVolPercent) playerVolPercent.textContent = `${Math.round(state.player.volume * 100)}%`;

  async function playTrack(track, index) {
    if (!track || !track.filename) return;

    try {
      const res = await window.braveApi.getStreamUrl(track.filename);
      const streamUrl = (res && res.url) ? res.url : (typeof res === 'string' ? res : null);
      if (!streamUrl) {
        showToast('Error streaming audio file');
        return;
      }

      // Immediately pause OTT webviews so local music is exclusive
      pauseYouTube();
      pauseSpotify();
      state.activeAudioSource = 'local';

      state.player.currentTrack = track;
      state.player.currentIndex = index;
      state.player.isPlaying = true;
      if (track.id) {
        const recent = (state.player.recentTrackIds || []).filter((id) => id !== track.id);
        recent.unshift(track.id);
        state.player.recentTrackIds = recent.slice(0, 10);
      }

      runtimeAudio.src = streamUrl;
      runtimeAudio.volume = state.player.volume;
      runtimeAudio.muted = state.player.isMuted;

      runtimeAudio.play().catch(e => {
        console.warn('[Player] Playback error:', e);
        state.player.isPlaying = false;
        playerPlayIcon.style.display = 'block';
        playerPauseIcon.style.display = 'none';
        if (playerWaves) playerWaves.style.display = 'none';
        renderTracksTable();
        showToast('Playback interrupted or format unsupported');
        syncPlayerToMprisAndMediaSession({ isPlaying: false, isStopped: true });
      });

      // Update runtime bar metadata
      playerTitle.textContent = track.title || 'Unknown Title';
      playerArtist.textContent = track.artist || 'Offline Library';
      playerArtImg.src = getTrackThumbnail(track);
      playerArtImg.onerror = function () { this.src = EMPTY_MUSIC_THUMBNAIL; };
      if (playerWaves) playerWaves.style.display = 'inline-flex';
      playerPlayIcon.style.display = 'none';
      playerPauseIcon.style.display = 'block';

      renderTracksTable();
      showToast(`Playing "${track.title}"`);
      syncPlayerToMprisAndMediaSession({ isPlaying: true });
    } catch (e) {
      showToast(`Player error: ${e.message}`);
    }
  }

  function togglePlayPause() {
    if (state.player.currentTrack) {
      if (state.player.isPlaying) {
        runtimeAudio.pause();
        state.player.isPlaying = false;
        playerPlayIcon.style.display = 'block';
        playerPauseIcon.style.display = 'none';
        if (playerWaves) playerWaves.style.display = 'none';
        syncPlayerToMprisAndMediaSession({ isPlaying: false, isPaused: true });
      } else {
        pauseYouTube();
        if (!state.player.currentTrack.isSpotifyBridge) pauseSpotify();
        state.activeAudioSource = state.player.currentTrack.isSpotifyBridge ? 'spotify-bridge' : 'local';
        runtimeAudio.play().catch(() => { });
        state.player.isPlaying = true;
        playerPlayIcon.style.display = 'none';
        playerPauseIcon.style.display = 'block';
        if (playerWaves) playerWaves.style.display = 'inline-flex';
        syncPlayerToMprisAndMediaSession({ isPlaying: true, isPaused: false });
      }
      renderTracksTable();
      return;
    }

    const tracks = getSortedAndFilteredTracks();
    if (tracks.length === 0) {
      showToast('No downloaded music in library yet. Paste a link above to download.');
      return;
    }

    playTrack(tracks[0], 0);
  }

  function pickSmartNextTrackIndex(tracks) {
    if (!Array.isArray(tracks) || tracks.length <= 1) return 0;
    const current = state.player.currentTrack;
    const currentIndex = state.player.currentIndex;
    const recent = state.player.recentTrackIds || [];
    const curArtist = String(current?.artist || '').toLowerCase().split(/[,;&]/)[0]?.trim() || '';
    const curAlbum = String(current?.album || current?.playlist || '').toLowerCase().trim();
    const curDuration = Number(current?.duration) || 0;

    const scored = [];
    for (let i = 0; i < tracks.length; i++) {
      if (i === currentIndex) continue;
      const cand = tracks[i];
      let score = 20;

      const candArtist = String(cand?.artist || '').toLowerCase().split(/[,;&]/)[0]?.trim() || '';
      const candAlbum = String(cand?.album || cand?.playlist || '').toLowerCase().trim();
      const candDuration = Number(cand?.duration) || 0;

      // Affinity: same artist or collaborator, shared album/playlist, similar tempo/length
      if (curArtist && candArtist && (candArtist.includes(curArtist) || curArtist.includes(candArtist))) {
        score += 38;
      }
      if (curAlbum && candAlbum && candAlbum !== 'single' && curAlbum === candAlbum) {
        score += 24;
      }
      if (current?.source && cand?.source && current.source === cand.source) {
        score += 10;
      }
      if (curDuration > 0 && candDuration > 0 && Math.abs(curDuration - candDuration) <= 45) {
        score += 10;
      }

      // Recency avoidance so recently played songs do not repeat
      const recencyPos = recent.indexOf(cand.id);
      if (recencyPos !== -1) {
        score -= recencyPos < 3 ? 90 : 40;
      }

      // Organic variety jitter
      score += Math.random() * 14;
      scored.push({ index: i, score });
    }

    if (scored.length === 0) return (currentIndex + 1) % tracks.length;
    scored.sort((a, b) => b.score - a.score);
    const poolSize = Math.min(3, scored.length);
    const pick = scored[Math.floor(Math.random() * poolSize)];
    return pick.index;
  }

  function playNextTrack() {
    const tracks = getSortedAndFilteredTracks();
    if (tracks.length === 0) return;

    const nextIndex = (state.player.isShuffle && tracks.length > 1)
      ? pickSmartNextTrackIndex(tracks)
      : (state.player.currentIndex + 1) % tracks.length;

    playTrack(tracks[nextIndex], nextIndex);
  }

  function playPrevTrack() {
    const tracks = getSortedAndFilteredTracks();
    if (tracks.length === 0) return;

    // If more than 3 seconds in, restart track
    if (runtimeAudio.currentTime > 3) {
      runtimeAudio.currentTime = 0;
      return;
    }

    const prevIndex = (state.player.currentIndex - 1 + tracks.length) % tracks.length;
    playTrack(tracks[prevIndex], prevIndex);
  }

  // Audio Event Listeners
  let lastMprisPositionSync = 0;
  runtimeAudio.addEventListener('timeupdate', () => {
    playerCurrentTime.textContent = formatDuration(runtimeAudio.currentTime);

    if (!state.player.isDraggingSeek && runtimeAudio.duration) {
      const pct = (runtimeAudio.currentTime / runtimeAudio.duration) * 100;
      playerSeekSlider.value = pct;
      playerSeekFill.style.width = `${pct}%`;
    }

    const now = Date.now();
    if (now - lastMprisPositionSync > 2500) {
      lastMprisPositionSync = now;
      if (window.braveApi?.updateMprisState && state.player.isPlaying) {
        window.braveApi.updateMprisState({
          position: runtimeAudio.currentTime || 0,
          duration: runtimeAudio.duration || 0,
          isPlaying: true
        }).catch(() => { });
      }
    }
  });

  runtimeAudio.addEventListener('loadedmetadata', () => {
    playerTotalTime.textContent = formatDuration(runtimeAudio.duration);
    syncPlayerToMprisAndMediaSession();
  });

  function syncSpotifyBridgeOverlay(statusPayload) {
    if (!spotifyWebview || typeof spotifyWebview.executeJavaScript !== 'function') return;
    try {
      spotifyWebview.executeJavaScript(
        `window.__braveSpotifyBridgeSync?.(${JSON.stringify(statusPayload)});`
      ).catch(() => { });
    } catch (_) { }
  }

  function startSpotifyBridgePlaybackPayload(payload) {
    if (!payload || !payload.streamUrl) return;
    pauseYouTube();
    state.activeAudioSource = 'spotify-bridge';
    if (Array.isArray(payload.queue) && payload.queue.length > 0) {
      state.spotifyBridgeQueue = payload.queue;
      const idx = payload.queue.findIndex(
        (item) => (item?.title || '').toLowerCase() === (payload.title || '').toLowerCase()
      );
      state.spotifyBridgeIndex = idx >= 0 ? idx : 0;
    }
    state.player.currentTrack = {
      id: `spotify_bridge_${Date.now()}`,
      title: payload.title || 'Spotify Track',
      artist: payload.artist || 'Spotify',
      thumbnail: payload.artwork || EMPTY_MUSIC_THUMBNAIL,
      trackUrl: payload.trackUrl || '',
      isSpotifyBridge: true
    };
    state.player.isPlaying = true;

    runtimeAudio.src = payload.streamUrl;
    runtimeAudio.volume = state.player.volume;
    runtimeAudio.muted = state.player.isMuted;
    runtimeAudio.play().catch((err) => {
      console.warn('[SpotifyBridge] Audio play failed:', err);
      showToast('Spotify audio stream failed to start; please retry.');
      syncSpotifyBridgeOverlay({
        active: false,
        status: 'error',
        title: 'Spotify Playback Failed',
        artist: 'Click any track to retry'
      });
    });

    playerTitle.textContent = state.player.currentTrack.title;
    playerArtist.textContent = state.player.currentTrack.artist;
    playerArtImg.src = state.player.currentTrack.thumbnail || EMPTY_MUSIC_THUMBNAIL;
    playerArtImg.onerror = function () { this.src = EMPTY_MUSIC_THUMBNAIL; };
    if (playerWaves) playerWaves.style.display = 'inline-flex';
    playerPlayIcon.style.display = 'none';
    playerPauseIcon.style.display = 'block';
    syncSpotifyBridgeOverlay({
      active: true,
      status: 'playing',
      title: state.player.currentTrack.title,
      artist: state.player.currentTrack.artist
    });
    syncPlayerToMprisAndMediaSession({ isPlaying: true });
    showToast(`Playing "${state.player.currentTrack.title}" in Brave Music`);
  }

  async function stepSpotifyBridgeQueue(delta) {
    const queue = Array.isArray(state.spotifyBridgeQueue) ? state.spotifyBridgeQueue : [];
    if (queue.length === 0) return false;
    const nextIdx = (state.spotifyBridgeIndex + delta + queue.length) % queue.length;
    state.spotifyBridgeIndex = nextIdx;
    const target = queue[nextIdx];
    if (!target || !window.braveApi?.playSpotifyBridge) return false;
    syncSpotifyBridgeOverlay({
      active: true,
      status: 'resolving',
      title: target.title || 'Loading track...',
      artist: target.artist || 'Spotify'
    });
    try {
      const res = await window.braveApi.playSpotifyBridge({
        url: target.url || 'https://open.spotify.com/',
        title: target.title || '',
        artist: target.artist || '',
        artwork: target.artwork || ''
      });
      if (res && res.streamUrl) {
        startSpotifyBridgePlaybackPayload(res);
        return true;
      }
    } catch (e) {
      showToast(`Spotify queue error: ${e.message || e}`);
    }
    return false;
  }

  window.braveApi?.onSpotifyBridgeStatus?.((st) => {
    if (!st) return;
    if (st.status === 'resolving') {
      showToast(`Loading Spotify track: ${st.title || 'Track'}…`);
      syncSpotifyBridgeOverlay({
        active: true,
        status: 'resolving',
        title: st.title || 'Loading Spotify track...',
        artist: st.artist || 'Resolving audio stream...'
      });
    } else if (st.status === 'error') {
      showToast(st.message || 'Could not play Spotify track');
      syncSpotifyBridgeOverlay({
        active: false,
        status: 'error',
        title: 'Spotify Playback',
        artist: st.message || 'Select a track to play'
      });
    }
  });

  window.braveApi?.onSpotifyBridgeReady?.((payload) => {
    startSpotifyBridgePlaybackPayload(payload);
  });

  window.braveApi?.onSpotifyBridgeControl?.((ctrl) => {
    if (!ctrl || !state.player.currentTrack?.isSpotifyBridge) return;
    if (ctrl.action === 'toggle') {
      togglePlayPause();
    } else if (ctrl.action === 'pause' && state.player.isPlaying) {
      togglePlayPause();
    } else if (ctrl.action === 'play' && !state.player.isPlaying) {
      togglePlayPause();
    } else if (ctrl.action === 'next') {
      stepSpotifyBridgeQueue(1);
    } else if (ctrl.action === 'prev') {
      stepSpotifyBridgeQueue(-1);
    }
  });

  window.braveApi?.onSpotifyBridgeDownload?.((payload) => {
    if (!payload?.url) return;
    switchTab('downloads-view');
    if (inputDownloadUrl) {
      inputDownloadUrl.value = payload.url;
      executeDownload();
    }
  });

  runtimeAudio.addEventListener('play', () => {
    state.player.isPlaying = true;
    playerPlayIcon.style.display = 'none';
    playerPauseIcon.style.display = 'block';
    if (playerWaves) playerWaves.style.display = 'inline-flex';
    if (state.player.currentTrack?.isSpotifyBridge) {
      syncSpotifyBridgeOverlay({
        active: true,
        status: 'playing',
        title: state.player.currentTrack.title,
        artist: state.player.currentTrack.artist
      });
    }
    renderTracksTable();
    syncPlayerToMprisAndMediaSession({ isPlaying: true });
  });

  runtimeAudio.addEventListener('pause', () => {
    if (state.player.isPlaying) {
      state.player.isPlaying = false;
      playerPlayIcon.style.display = 'block';
      playerPauseIcon.style.display = 'none';
      if (playerWaves) playerWaves.style.display = 'none';
      if (state.player.currentTrack?.isSpotifyBridge) {
        syncSpotifyBridgeOverlay({
          active: true,
          status: 'paused',
          title: state.player.currentTrack.title,
          artist: state.player.currentTrack.artist
        });
      }
      renderTracksTable();
      syncPlayerToMprisAndMediaSession({ isPlaying: false, isPaused: true });
    }
  });

  runtimeAudio.addEventListener('ended', () => {
    if (state.player.isRepeat) {
      runtimeAudio.currentTime = 0;
      runtimeAudio.play().catch(() => { });
      syncPlayerToMprisAndMediaSession({ isPlaying: true });
    } else if (state.player.currentTrack?.isSpotifyBridge && Array.isArray(state.spotifyBridgeQueue) && state.spotifyBridgeQueue.length > 1) {
      stepSpotifyBridgeQueue(1);
    } else {
      playNextTrack();
    }
  });

  runtimeAudio.addEventListener('error', (e) => {
    console.warn('[Player] Audio runtime error:', e);
    state.player.isPlaying = false;
    playerPlayIcon.style.display = 'block';
    playerPauseIcon.style.display = 'none';
    if (playerWaves) playerWaves.style.display = 'none';
    if (state.player.currentTrack?.isSpotifyBridge) {
      syncSpotifyBridgeOverlay({
        active: false,
        status: 'error',
        title: 'Playback Error',
        artist: 'Click a track to retry'
      });
    }
    renderTracksTable();
    showToast('Playback error: unable to decode or read audio stream');
    syncPlayerToMprisAndMediaSession({ isPlaying: false, isStopped: true });
  });

  // OneUI Seek bar scrubbing
  playerSeekSlider.addEventListener('input', (e) => {
    state.player.isDraggingSeek = true;
    playerSeekFill.style.width = `${e.target.value}%`;
    if (runtimeAudio.duration) {
      playerCurrentTime.textContent = formatDuration((e.target.value / 100) * runtimeAudio.duration);
    }
  });

  playerSeekSlider.addEventListener('change', (e) => {
    state.player.isDraggingSeek = false;
    if (runtimeAudio.duration) {
      runtimeAudio.currentTime = (e.target.value / 100) * runtimeAudio.duration;
      syncPlayerToMprisAndMediaSession();
    }
  });

  // Player controls click events
  playerPlayPauseBtn.addEventListener('click', () => handlePlayPause('playpause'));
  playerNextBtn.addEventListener('click', handleNextTrack);
  playerPrevBtn.addEventListener('click', handlePrevTrack);

  playerShuffleBtn.addEventListener('click', () => {
    state.player.isShuffle = !state.player.isShuffle;
    playerShuffleBtn.classList.toggle('active', state.player.isShuffle);
    showToast(state.player.isShuffle ? 'Shuffle enabled' : 'Shuffle disabled');
    syncPlayerToMprisAndMediaSession();
  });

  playerRepeatBtn.addEventListener('click', () => {
    state.player.isRepeat = !state.player.isRepeat;
    playerRepeatBtn.classList.toggle('active', state.player.isRepeat);
    showToast(state.player.isRepeat ? 'Repeat track enabled' : 'Repeat disabled');
    syncPlayerToMprisAndMediaSession();
  });

  // Volume icon click toggles floating OneUI popover bar
  playerMuteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!playerVolumePopover) return;
    const isVisible = playerVolumePopover.style.display !== 'none';
    playerVolumePopover.style.display = isVisible ? 'none' : 'flex';
    playerMuteBtn.classList.toggle('active', !isVisible);
    playerMuteBtn.setAttribute('aria-expanded', !isVisible);
  });

  // Vertical OneUI Volume bar interaction
  function setPlayerVolume(ratio) {
    const clamped = Math.max(0, Math.min(1, ratio));
    state.player.volume = clamped;
    runtimeAudio.volume = clamped;
    if (clamped > 0 && runtimeAudio.muted) {
      runtimeAudio.muted = false;
      state.player.isMuted = false;
    }
    const pct = Math.round(clamped * 100);
    if (playerVolPercent) playerVolPercent.textContent = `${pct}%`;
    if (playerVolumeFill) playerVolumeFill.style.height = `${pct}%`;
    updateVolumeIcon();
    if (window.braveApi?.updateMprisState) {
      window.braveApi.updateMprisState({ volume: state.player.isMuted ? 0 : clamped }).catch(() => { });
    }
  }

  let isDraggingVerticalVolume = false;

  function handleVerticalVolumePointer(e) {
    if (!volumeVerticalTrackWrap) return;
    const rect = volumeVerticalTrackWrap.getBoundingClientRect();
    const clientY = (e.touches && e.touches.length > 0) ? e.touches[0].clientY : e.clientY;
    // Bottom is 0%, Top is 100%
    const ratio = (rect.bottom - clientY) / rect.height;
    setPlayerVolume(ratio);
  }

  volumeVerticalTrackWrap?.addEventListener('mousedown', (e) => {
    isDraggingVerticalVolume = true;
    handleVerticalVolumePointer(e);
  });

  window.addEventListener('mousemove', (e) => {
    if (isDraggingVerticalVolume) {
      handleVerticalVolumePointer(e);
    }
  });

  window.addEventListener('mouseup', () => {
    if (isDraggingVerticalVolume) {
      isDraggingVerticalVolume = false;
    }
  });

  // Touch device support for vertical volume
  volumeVerticalTrackWrap?.addEventListener('touchstart', (e) => {
    isDraggingVerticalVolume = true;
    handleVerticalVolumePointer(e);
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (isDraggingVerticalVolume) {
      handleVerticalVolumePointer(e);
    }
  }, { passive: true });

  window.addEventListener('touchend', () => {
    if (isDraggingVerticalVolume) {
      isDraggingVerticalVolume = false;
    }
  });

  btnQuickMute?.addEventListener('click', (e) => {
    e.stopPropagation();
    runtimeAudio.muted = !runtimeAudio.muted;
    state.player.isMuted = runtimeAudio.muted;
    updateVolumeIcon();
    if (runtimeAudio.muted) {
      if (playerVolPercent) playerVolPercent.textContent = 'Muted';
      if (playerVolumeFill) playerVolumeFill.style.height = '0%';
    } else {
      const pct = Math.round(state.player.volume * 100);
      if (playerVolPercent) playerVolPercent.textContent = `${pct}%`;
      if (playerVolumeFill) playerVolumeFill.style.height = `${pct}%`;
    }
  });

  document.addEventListener('click', (e) => {
    if (volumeControlWrap && !volumeControlWrap.contains(e.target)) {
      if (playerVolumePopover) playerVolumePopover.style.display = 'none';
      playerMuteBtn?.classList.remove('active');
      playerMuteBtn?.setAttribute('aria-expanded', 'false');
    }
  });

  function updateVolumeIcon() {
    if (runtimeAudio.muted || runtimeAudio.volume === 0) {
      playerVolIcon.innerHTML = `
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
        <line x1="23" y1="9" x2="17" y2="15"></line>
        <line x1="17" y1="9" x2="23" y2="15"></line>
      `;
    } else if (runtimeAudio.volume < 0.45) {
      playerVolIcon.innerHTML = `
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
      `;
    } else {
      playerVolIcon.innerHTML = `
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
      `;
    }
  }

  // ==========================================================================
  // LINUX MPRIS2 & WEB MEDIA SESSION INTEGRATION
  // ==========================================================================

  // Global cache of last known playback states
  let isYtPlayingActive = false;
  let isSpotifyPlayingActive = false;

  // Determine active playback context strictly bounded to the active tab / source:
  // "make it like if I play 1 OTT or even a local music they don't go back to any other OTT and local music and all buttons work under the tab of OTT where we play music."
  function getEffectivePlaybackContext() {
    // 1. Actively playing sources have absolute highest priority
    if (state.player.isPlaying) {
      return 'local';
    }
    if (isSpotifyPlayingActive) {
      return 'spotify';
    }
    if (isYtPlayingActive) {
      return 'youtube';
    }

    // 2. When idle / paused, prioritize current tab user is viewing
    if (state.currentTab === 'yt-view') {
      return 'youtube';
    }
    if (state.currentTab === 'spotify-view') {
      return 'spotify';
    }
    if (state.currentTab === 'downloads-view') {
      return 'local';
    }

    // 3. Fallback to active source
    if (state.activeAudioSource === 'spotify') {
      return 'spotify';
    }
    if (state.activeAudioSource === 'local') {
      return 'local';
    }

    return 'youtube';
  }

  // Pause YouTube Music webview
  function pauseYouTube() {
    if (!ytWebview) return;
    try {
      ytWebview.executeJavaScript(`
        (() => {
          try {
            const video = document.querySelector('video');
            if (video && !video.paused) video.pause();
          } catch (e) {}
        })()
      `).catch(() => { });
    } catch (e) { }
  }

  // Pause Spotify webview
  function pauseSpotify() {
    if (!spotifyWebview) return;
    try {
      spotifyWebview.executeJavaScript(`
        (() => {
          try {
            const playBtn = document.querySelector('[data-testid="control-button-playpause"]');
            const ariaLabel = playBtn?.getAttribute('aria-label')?.toLowerCase() || '';
            if (ariaLabel.includes('pause') && playBtn) playBtn.click();
          } catch (e) {}
        })()
      `).catch(() => { });
    } catch (e) { }
  }

  // Pause Local Music
  function pauseLocalAudio() {
    if (state.player.isPlaying) {
      runtimeAudio.pause();
      state.player.isPlaying = false;
      playerPlayIcon.style.display = 'block';
      playerPauseIcon.style.display = 'none';
      if (playerWaves) playerWaves.style.display = 'none';
      renderTracksTable();
      syncPlayerToMprisAndMediaSession({ isPlaying: false, isPaused: true });
    }
  }

  // Control YouTube Music OTT
  function controlYouTube(action) {
    if (!ytWebview) return;
    try {
      if (action === 'playpause' || action === 'play' || action === 'pause') {
        ytWebview.executeJavaScript(`
          (() => {
            try {
              const playPauseBtn = document.querySelector('ytmusic-player-bar #play-pause-button') ||
                                   document.querySelector('#play-pause-button') ||
                                   document.querySelector('.play-pause-button');
              const video = document.querySelector('video');
              const req = '${action}';
              if (req === 'play') {
                if (video && video.paused) {
                  if (playPauseBtn) playPauseBtn.click(); else video.play();
                }
              } else if (req === 'pause') {
                if (video && !video.paused) {
                  if (playPauseBtn) playPauseBtn.click(); else video.pause();
                }
              } else {
                if (playPauseBtn) {
                  playPauseBtn.click();
                } else if (video) {
                  if (video.paused) video.play(); else video.pause();
                }
              }
            } catch (e) {}
          })()
        `).catch(() => { });
      } else if (action === 'next') {
        ytWebview.executeJavaScript(`
          (() => {
            try {
              const nextBtn = document.querySelector('ytmusic-player-bar .next-button') ||
                              document.querySelector('.next-button') ||
                              document.querySelector('#next-button') ||
                              document.querySelector('tp-yt-paper-icon-button.next-button') ||
                              document.querySelector('[aria-label="Next song"]') ||
                              document.querySelector('[aria-label="Next"]');
              if (nextBtn) {
                nextBtn.click();
              } else {
                window.dispatchEvent(new KeyboardEvent('keydown', { key: 'N', code: 'KeyN', shiftKey: true, bubbles: true }));
              }
            } catch (e) {}
          })()
        `).catch(() => { });
      } else if (action === 'previous') {
        ytWebview.executeJavaScript(`
          (() => {
            try {
              const prevBtn = document.querySelector('ytmusic-player-bar .previous-button') ||
                              document.querySelector('.previous-button') ||
                              document.querySelector('#previous-button') ||
                              document.querySelector('tp-yt-paper-icon-button.previous-button') ||
                              document.querySelector('[aria-label="Previous song"]') ||
                              document.querySelector('[aria-label="Previous"]');
              if (prevBtn) {
                prevBtn.click();
              } else {
                window.dispatchEvent(new KeyboardEvent('keydown', { key: 'P', code: 'KeyP', shiftKey: true, bubbles: true }));
              }
            } catch (e) {}
          })()
        `).catch(() => { });
      }
    } catch (e) {
      console.warn('[YTMControl] Notice:', e.message);
    }
  }

  // Control Spotify OTT
  function controlSpotify(action) {
    if (!spotifyWebview) return;
    try {
      if (action === 'playpause' || action === 'play' || action === 'pause') {
        spotifyWebview.executeJavaScript(`
          (() => {
            try {
              const playPauseBtn = document.querySelector('[data-testid="control-button-playpause"]') ||
                                   document.querySelector('button[aria-label="Play"]') ||
                                   document.querySelector('button[aria-label="Pause"]');
              const aria = playPauseBtn?.getAttribute('aria-label')?.toLowerCase() || '';
              const isPlaying = aria.includes('pause');
              const req = '${action}';
              if (req === 'play') {
                if (!isPlaying && playPauseBtn) playPauseBtn.click();
              } else if (req === 'pause') {
                if (isPlaying && playPauseBtn) playPauseBtn.click();
              } else {
                if (playPauseBtn) playPauseBtn.click();
              }
            } catch (e) {}
          })()
        `).catch(() => { });
      } else if (action === 'next') {
        spotifyWebview.executeJavaScript(`
          (() => {
            try {
              const nextBtn = document.querySelector('[data-testid="control-button-skip-forward"]') ||
                              document.querySelector('button[aria-label="Next"]') ||
                              document.querySelector('button[aria-label="Next track"]');
              if (nextBtn) nextBtn.click();
            } catch (e) {}
          })()
        `).catch(() => { });
      } else if (action === 'previous') {
        spotifyWebview.executeJavaScript(`
          (() => {
            try {
              const prevBtn = document.querySelector('[data-testid="control-button-skip-back"]') ||
                              document.querySelector('button[aria-label="Previous"]') ||
                              document.querySelector('button[aria-label="Previous track"]');
              if (prevBtn) prevBtn.click();
            } catch (e) {}
          })()
        `).catch(() => { });
      }
    } catch (e) {
      console.warn('[SpotifyControl] Notice:', e.message);
    }
  }

  // Unified Previous Track Handler - Scoped to the active context, never cross-contaminates
  function handlePrevTrack() {
    if (state.player.currentTrack?.isSpotifyBridge && state.player.isPlaying && Array.isArray(state.spotifyBridgeQueue) && state.spotifyBridgeQueue.length > 1) {
      stepSpotifyBridgeQueue(-1);
      return;
    }
    const context = getEffectivePlaybackContext();
    if (context === 'youtube') {
      controlYouTube('previous');
    } else if (context === 'spotify') {
      if (!state.player.currentTrack?.isSpotifyBridge || !Array.isArray(state.spotifyBridgeQueue) || state.spotifyBridgeQueue.length <= 1) {
        controlSpotify('previous');
      } else {
        stepSpotifyBridgeQueue(-1);
      }
    } else {
      playPrevTrack();
    }
  }

  // Unified Next Track Handler - Scoped to the active context, never cross-contaminates
  function handleNextTrack() {
    if (state.player.currentTrack?.isSpotifyBridge && state.player.isPlaying && Array.isArray(state.spotifyBridgeQueue) && state.spotifyBridgeQueue.length > 1) {
      stepSpotifyBridgeQueue(1);
      return;
    }
    const context = getEffectivePlaybackContext();
    if (context === 'youtube') {
      controlYouTube('next');
    } else if (context === 'spotify') {
      if (!state.player.currentTrack?.isSpotifyBridge || !Array.isArray(state.spotifyBridgeQueue) || state.spotifyBridgeQueue.length <= 1) {
        controlSpotify('next');
      } else {
        stepSpotifyBridgeQueue(1);
      }
    } else {
      playNextTrack();
    }
  }

  // Unified Play/Pause Handler
  function handlePlayPause(requestedAction = 'playpause') {
    const context = getEffectivePlaybackContext();
    if (context === 'youtube') {
      controlYouTube(requestedAction);
    } else if (context === 'spotify') {
      controlSpotify(requestedAction);
    } else {
      if (requestedAction === 'play') {
        if (!state.player.isPlaying) togglePlayPause();
      } else if (requestedAction === 'pause') {
        if (state.player.isPlaying) togglePlayPause();
      } else {
        togglePlayPause();
      }
    }
  }

  // Unified Stop Handler
  function handleStop() {
    const context = getEffectivePlaybackContext();
    if (context === 'youtube') {
      controlYouTube('pause');
    } else if (context === 'spotify') {
      controlSpotify('pause');
    } else {
      pauseLocalAudio();
      runtimeAudio.currentTime = 0;
    }
  }

  // Synchronize player bar in-app UI across local, YouTube Music, and Spotify
  function updatePlayerBarUI(info = {}) {
    const { title, artist, artworkUrl, isPlaying, duration, position } = info;
    if (playerTitle && title !== undefined) {
      playerTitle.textContent = title || 'Select a track to play';
      playerTitle.title = title || '';
    }
    if (playerArtist && artist !== undefined) {
      playerArtist.textContent = artist || 'Offline Library';
      playerArtist.title = artist || '';
    }
    if (playerArtImg && artworkUrl !== undefined) {
      const targetSrc = artworkUrl || EMPTY_MUSIC_THUMBNAIL;
      if (playerArtImg.src !== targetSrc) {
        playerArtImg.src = targetSrc;
      }
    }
    if (playerPlayIcon && playerPauseIcon && isPlaying !== undefined) {
      playerPlayIcon.style.display = isPlaying ? 'none' : 'block';
      playerPauseIcon.style.display = isPlaying ? 'block' : 'none';
    }
    if (playerWaves && isPlaying !== undefined) {
      playerWaves.style.display = isPlaying ? 'inline-flex' : 'none';
    }
    if (typeof position === 'number' && typeof duration === 'number' && duration > 0) {
      if (playerCurrentTime && !state.player.isDraggingSeek) {
        playerCurrentTime.textContent = formatDuration(position);
      }
      if (playerTotalTime) {
        playerTotalTime.textContent = formatDuration(duration);
      }
      if (playerSeekFill && playerSeekSlider && !state.player.isDraggingSeek) {
        const pct = Math.min(100, Math.max(0, (position / duration) * 100));
        playerSeekFill.style.width = `${pct}%`;
        playerSeekSlider.value = pct;
      }
    }
  }

  // Synchronize Brave Music state to Linux MPRIS2 (org.mpris.MediaPlayer2) & Web MediaSession
  function syncPlayerToMprisAndMediaSession(overrides = {}) {
    if (!state.player.currentTrack) return;
    const track = state.player.currentTrack;
    const thumb = getTrackThumbnail(track);
    const duration = runtimeAudio.duration || (track.duration ? parseFloat(track.duration) : 0) || 0;
    const position = runtimeAudio.currentTime || 0;
    const isPlaying = overrides.isPlaying !== undefined ? overrides.isPlaying : state.player.isPlaying;
    const isPaused = overrides.isPaused !== undefined ? overrides.isPaused : (!isPlaying && !!state.player.currentTrack);
    const isStopped = overrides.isStopped || false;

    const mprisPayload = {
      title: track.title || 'Unknown Title',
      artist: track.artist || 'Offline Library',
      album: track.album || (state.selectedPlaylist || 'Downloaded Music'),
      duration: duration,
      position: position,
      artworkUrl: thumb,
      isPlaying: isPlaying,
      isPaused: isPaused,
      isStopped: isStopped,
      volume: state.player.isMuted ? 0 : state.player.volume,
      canGoNext: true,
      canGoPrevious: true,
      shuffle: state.player.isShuffle,
      loopStatus: state.player.isRepeat ? 'Track' : 'None',
      trackId: track.id || track.filename || track.title
    };

    if (window.braveApi?.updateMprisState) {
      window.braveApi.updateMprisState(mprisPayload).catch(() => { });
    }

    updateMediaSession({
      title: track.title || 'Unknown Title',
      artist: track.artist || 'Offline Library',
      album: track.album || (state.selectedPlaylist || 'Downloaded Music'),
      artworkUrl: thumb,
      isPlaying,
      isPaused
    });

    updatePlayerBarUI({
      title: track.title || 'Unknown Title',
      artist: track.artist || 'Offline Library',
      artworkUrl: thumb,
      isPlaying,
      duration,
      position
    });
  }

  function updateMediaSession(meta) {
    if (!('mediaSession' in navigator)) return;
    try {
      if (meta.isPlaying) {
        navigator.mediaSession.playbackState = 'playing';
      } else if (meta.isPaused) {
        navigator.mediaSession.playbackState = 'paused';
      } else {
        navigator.mediaSession.playbackState = 'none';
      }

      const artwork = [];
      if (meta.artworkUrl && (meta.artworkUrl.startsWith('http://') || meta.artworkUrl.startsWith('https://'))) {
        artwork.push({ src: meta.artworkUrl, sizes: '512x512', type: 'image/jpeg' });
      }
      navigator.mediaSession.metadata = new MediaMetadata({
        title: meta.title || 'Brave Music',
        artist: meta.artist || 'Brave Music',
        album: meta.album || 'Brave Music',
        artwork
      });
    } catch (e) { }
  }

  // Handle incoming remote MPRIS commands from Linux desktop (panel buttons, notification controls, media keys)
  if (window.braveApi?.onMprisCommand) {
    window.braveApi.onMprisCommand((cmd) => {
      const action = cmd?.action;
      if (!action) return;

      if (action === 'play') {
        handlePlayPause('play');
      } else if (action === 'pause') {
        handlePlayPause('pause');
      } else if (action === 'playpause') {
        handlePlayPause('playpause');
      } else if (action === 'next') {
        handleNextTrack();
      } else if (action === 'previous') {
        handlePrevTrack();
      } else if (action === 'stop') {
        handleStop();
      } else if (action === 'seek') {
        const context = getEffectivePlaybackContext();
        if (context === 'local' && runtimeAudio.duration && typeof cmd.offset === 'number') {
          runtimeAudio.currentTime = Math.max(0, Math.min(runtimeAudio.duration, runtimeAudio.currentTime + cmd.offset));
          syncPlayerToMprisAndMediaSession();
        }
      } else if (action === 'setposition') {
        const context = getEffectivePlaybackContext();
        if (context === 'local' && runtimeAudio.duration && typeof cmd.position === 'number') {
          runtimeAudio.currentTime = Math.max(0, Math.min(runtimeAudio.duration, cmd.position));
          syncPlayerToMprisAndMediaSession();
        }
      } else if (action === 'setvolume') {
        if (typeof cmd.volume === 'number') {
          setPlayerVolume(cmd.volume);
        }
      } else if (action === 'shuffle') {
        state.player.isShuffle = (cmd.shuffle !== undefined) ? !!cmd.shuffle : !state.player.isShuffle;
        playerShuffleBtn?.classList.toggle('active', state.player.isShuffle);
        syncPlayerToMprisAndMediaSession();
      } else if (action === 'loopstatus') {
        state.player.isRepeat = (cmd.loopStatus === 'Track');
        playerRepeatBtn?.classList.toggle('active', state.player.isRepeat);
        syncPlayerToMprisAndMediaSession();
      }
    });
  }

  // Setup Standard Web MediaSession handlers
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.setActionHandler('play', () => handlePlayPause('play'));
      navigator.mediaSession.setActionHandler('pause', () => handlePlayPause('pause'));
      navigator.mediaSession.setActionHandler('previoustrack', () => handlePrevTrack());
      navigator.mediaSession.setActionHandler('nexttrack', () => handleNextTrack());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        const context = getEffectivePlaybackContext();
        if (context === 'local' && details.seekTime !== undefined && runtimeAudio.duration) {
          runtimeAudio.currentTime = details.seekTime;
          syncPlayerToMprisAndMediaSession();
        }
      });
    } catch (e) {
      console.warn('[MediaSession] Setup notice:', e.message);
    }
  }

  // Webview Playback Inspector functions
  async function checkYouTubeState() {
    if (!ytWebview) return null;
    try {
      return await ytWebview.executeJavaScript(`
        (() => {
          try {
            const video = document.querySelector('video');
            const isVideoPlaying = !!(video && !video.paused && !video.ended && video.readyState >= 2);
            const mediaSessionPlaying = navigator.mediaSession?.playbackState === 'playing';
            const playPauseBtn = document.querySelector('ytmusic-player-bar #play-pause-button') ||
                                 document.querySelector('#play-pause-button');
            const ariaLabel = playPauseBtn?.getAttribute('aria-label')?.toLowerCase() || '';
            const isButtonPause = ariaLabel.includes('pause') || ariaLabel.includes('paus');
            const isPlaying = isVideoPlaying || mediaSessionPlaying || isButtonPause;

            // MediaSession metadata prioritized, then DOM queries
            const msTitle = navigator.mediaSession?.metadata?.title?.trim() || '';
            const titleEl = document.querySelector('ytmusic-player-bar .title') ||
                            document.querySelector('.ytmusic-player-bar.title') ||
                            document.querySelector('ytmusic-player-bar yt-formatted-string.title');
            const domTitle = titleEl?.textContent?.trim() || '';
            const title = msTitle || domTitle;

            const msArtist = navigator.mediaSession?.metadata?.artist?.trim() || '';
            const artistEl = document.querySelector('ytmusic-player-bar .byline a') ||
                             document.querySelector('ytmusic-player-bar .byline') ||
                             document.querySelector('.ytmusic-player-bar.byline');
            const domArtist = artistEl?.textContent?.trim() || '';
            const artist = msArtist || domArtist;

            const album = navigator.mediaSession?.metadata?.album?.trim() || 'YouTube Music';

            let artworkUrl = '';
            const msArtwork = navigator.mediaSession?.metadata?.artwork;
            if (Array.isArray(msArtwork) && msArtwork.length > 0) {
              artworkUrl = msArtwork[msArtwork.length - 1]?.src || msArtwork[0]?.src || '';
            }
            if (!artworkUrl) {
              const artEl = document.querySelector('ytmusic-player-bar img') ||
                            document.querySelector('.ytmusic-player-bar img');
              artworkUrl = artEl?.src || '';
            }

            const duration = (video && typeof video.duration === 'number' && !isNaN(video.duration)) ? video.duration : 0;
            const position = (video && typeof video.currentTime === 'number' && !isNaN(video.currentTime)) ? video.currentTime : 0;

            return {
              isPlaying,
              title,
              artist: artist || 'YouTube Music',
              album,
              duration,
              position,
              artworkUrl
            };
          } catch (e) { return null; }
        })()
      `);
    } catch (e) { return null; }
  }

  async function checkSpotifyState() {
    if (!spotifyWebview) return null;
    try {
      return await spotifyWebview.executeJavaScript(`
        (() => {
          try {
            const audio = document.querySelector('audio');
            const isAudioPlaying = !!(audio && !audio.paused && !audio.ended && audio.currentTime > 0);
            const mediaSessionPlaying = navigator.mediaSession?.playbackState === 'playing';
            const playBtn = document.querySelector('[data-testid="control-button-playpause"]') ||
                            document.querySelector('button[aria-label="Play"]') ||
                            document.querySelector('button[aria-label="Pause"]') ||
                            document.querySelector('button[aria-label*="Pause"]') ||
                            document.querySelector('button[aria-label*="Pausa"]') ||
                            document.querySelector('button[aria-label*="Pausieren"]');
            const ariaLabel = playBtn?.getAttribute('aria-label')?.toLowerCase() || '';
            const isButtonPause = ariaLabel.includes('pause') || ariaLabel.includes('paus');
            const isPlaying = isAudioPlaying || mediaSessionPlaying || isButtonPause;

            // MediaSession metadata prioritized, then DOM queries
            const msTitle = navigator.mediaSession?.metadata?.title?.trim() || '';
            const titleEl = document.querySelector('[data-testid="nowplaying-track-link"]') ||
                            document.querySelector('[data-testid="context-item-info-title"]') ||
                            document.querySelector('[data-testid="now-playing-widget"] [data-testid="context-item-info-title"]') ||
                            document.querySelector('[data-testid="now-playing-widget"] a[href*="/track/"]') ||
                            document.querySelector('[data-testid="context-item-link"]') ||
                            document.querySelector('.now-playing__song') ||
                            document.querySelector('.track-info__name');
            const domTitle = titleEl?.textContent?.trim() || '';
            const title = msTitle || domTitle;

            const msArtist = navigator.mediaSession?.metadata?.artist?.trim() || '';
            const artistEl = document.querySelector('[data-testid="context-item-info-subtitles"]') ||
                             document.querySelector('[data-testid="context-item-info-artist"]') ||
                             document.querySelector('[data-testid="now-playing-widget"] [data-testid="context-item-info-artist"]') ||
                             document.querySelector('[data-testid="now-playing-widget"] a[href*="/artist/"]') ||
                             document.querySelector('footer [data-testid="context-item-info-subtitles"] a') ||
                             document.querySelector('.now-playing__artist') ||
                             document.querySelector('.track-info__artists');
            const domArtist = artistEl?.textContent?.trim() || '';
            const artist = msArtist || domArtist;

            const album = navigator.mediaSession?.metadata?.album?.trim() || 'Spotify';

            let artworkUrl = '';
            const msArtwork = navigator.mediaSession?.metadata?.artwork;
            if (Array.isArray(msArtwork) && msArtwork.length > 0) {
              artworkUrl = msArtwork[msArtwork.length - 1]?.src || msArtwork[0]?.src || '';
            }
            if (!artworkUrl) {
              const artEl = document.querySelector('[data-testid="now-playing-widget"] img') ||
                            document.querySelector('[data-testid="cover-art-image"]') ||
                            document.querySelector('footer img[src*="image"]') ||
                            document.querySelector('footer img');
              artworkUrl = artEl?.src || '';
            }

            const duration = (audio && typeof audio.duration === 'number' && !isNaN(audio.duration)) ? audio.duration : 0;
            const position = (audio && typeof audio.currentTime === 'number' && !isNaN(audio.currentTime)) ? audio.currentTime : 0;

            return {
              isPlaying,
              title,
              artist: artist || 'Spotify',
              album,
              duration,
              position,
              artworkUrl
            };
          } catch (e) { return null; }
        })()
      `);
    } catch (e) { return null; }
  }

  // Webview MPRIS synchronization and single-source exclusivity engine
  let lastYtPlaying = false;
  let lastSpotifyPlaying = false;
  let lastLocalPlaying = false;

  async function syncPlaybackLoop() {
    try {
      const isTauri = !!window.__TAURI__;
      const ytInfo = isTauri ? null : await checkYouTubeState();
      const spotifyInfo = isTauri ? null : await checkSpotifyState();

      const isYtPlaying = !!(ytInfo && ytInfo.isPlaying);
      const isSpotifyPlaying = !!(spotifyInfo && spotifyInfo.isPlaying);
      const isLocalPlaying = !!state.player.isPlaying;

      isYtPlayingActive = isYtPlaying;
      isSpotifyPlayingActive = isSpotifyPlaying;

      // Enforce strict single-source exclusivity: playing one source pauses the others
      if (isYtPlaying && !lastYtPlaying) {
        if (isLocalPlaying) pauseLocalAudio();
        if (isSpotifyPlaying) pauseSpotify();
        state.activeAudioSource = 'youtube';
      } else if (isSpotifyPlaying && !lastSpotifyPlaying) {
        if (isLocalPlaying) pauseLocalAudio();
        if (isYtPlaying) pauseYouTube();
        state.activeAudioSource = 'spotify';
      } else if (isLocalPlaying && !lastLocalPlaying) {
        if (isYtPlaying) pauseYouTube();
        if (isSpotifyPlaying) pauseSpotify();
        state.activeAudioSource = 'local';
      }

      lastYtPlaying = isYtPlaying;
      lastSpotifyPlaying = isSpotifyPlaying;
      lastLocalPlaying = isLocalPlaying;

      const context = getEffectivePlaybackContext();

      if (context === 'youtube') {
        const title = ytInfo?.title || 'YouTube Music';
        const artist = ytInfo?.artist || 'YouTube Music';
        const album = ytInfo?.album || 'YouTube Music';
        const artworkUrl = ytInfo?.artworkUrl || '';
        const duration = ytInfo?.duration || 0;
        const position = ytInfo?.position || 0;

        window.braveApi?.updateMprisState({
          title,
          artist,
          album,
          duration,
          position,
          artworkUrl,
          isPlaying: isYtPlaying,
          isPaused: !isYtPlaying,
          canGoNext: true,
          canGoPrevious: true,
          trackId: 'ytm_' + title
        });

        updateMediaSession({
          title,
          artist,
          album,
          artworkUrl,
          isPlaying: isYtPlaying,
          isPaused: !isYtPlaying
        });

        updatePlayerBarUI({
          title: ytInfo?.title ? title : 'Select a track to play',
          artist: ytInfo?.title ? artist : 'YouTube Music',
          artworkUrl,
          isPlaying: isYtPlaying,
          duration,
          position
        });
      } else if (context === 'spotify') {
        const title = spotifyInfo?.title || 'Spotify';
        const artist = spotifyInfo?.artist || 'Spotify';
        const album = spotifyInfo?.album || 'Spotify';
        const artworkUrl = spotifyInfo?.artworkUrl || '';
        const duration = spotifyInfo?.duration || 0;
        const position = spotifyInfo?.position || 0;

        window.braveApi?.updateMprisState({
          title,
          artist,
          album,
          duration,
          position,
          artworkUrl,
          isPlaying: isSpotifyPlaying,
          isPaused: !isSpotifyPlaying,
          canGoNext: true,
          canGoPrevious: true,
          trackId: 'spotify_' + title
        });

        updateMediaSession({
          title,
          artist,
          album,
          artworkUrl,
          isPlaying: isSpotifyPlaying,
          isPaused: !isSpotifyPlaying
        });

        updatePlayerBarUI({
          title: spotifyInfo?.title ? title : 'Select a track to play',
          artist: spotifyInfo?.title ? artist : 'Spotify',
          artworkUrl,
          isPlaying: isSpotifyPlaying,
          duration,
          position
        });
      } else if (context === 'local') {
        if (state.player.currentTrack) {
          syncPlayerToMprisAndMediaSession();
          updatePlayerBarUI({
            title: state.player.currentTrack.title || 'Unknown Title',
            artist: state.player.currentTrack.artist || 'Offline Library',
            artworkUrl: getTrackThumbnail(state.player.currentTrack),
            isPlaying: isLocalPlaying,
            duration: runtimeAudio.duration || (state.player.currentTrack.duration ? parseFloat(state.player.currentTrack.duration) : 0) || 0,
            position: runtimeAudio.currentTime || 0
          });
        } else {
          updatePlayerBarUI({
            title: 'Select a track to play',
            artist: 'Offline Library',
            artworkUrl: EMPTY_MUSIC_THUMBNAIL,
            isPlaying: false,
            duration: 0,
            position: 0
          });
        }
      }
    } catch (e) { }
  }

  if (!window.__TAURI__) {
    setInterval(syncPlaybackLoop, 1200);
  } else {
    setInterval(() => {
      if (state.player.isPlaying) {
        syncPlaybackLoop();
      }
    }, 1500);
  }

  // ==========================================================================
  // OFFLINE LIBRARY DATA & RENDERING
  // ==========================================================================

  async function loadLibrary() {
    if (!window.braveApi?.getLibrary) return;
    try {
      const data = await window.braveApi.getLibrary();
      state.library = data || { tracks: [], playlists: {} };
      libraryLoadedOnce = true;

      const trackCount = (data.tracks || []).length;
      const playlistCount = Object.keys(data.playlists || {}).length;

      if (libraryCountBadge) libraryCountBadge.textContent = trackCount;
      if (badgeAllMusic) badgeAllMusic.textContent = trackCount;
      if (badgePlaylists) badgePlaylists.textContent = playlistCount;

      if (trackCount === 0 && !state.player.currentTrack) {
        playerTitle.textContent = 'No track selected';
        playerArtist.textContent = 'Offline Library';
        playerArtImg.src = EMPTY_MUSIC_THUMBNAIL;
        if (playerWaves) playerWaves.style.display = 'none';
        playerPlayIcon.style.display = 'block';
        playerPauseIcon.style.display = 'none';
        playerSeekFill.style.width = '0%';
        playerCurrentTime.textContent = '0:00';
        playerTotalTime.textContent = '0:00';
      }

      renderTracksTable();
      renderPlaylistsGrid();
      updateSmartMixControls();
      if (state.currentTab === 'downloads-view') {
        loadRecommendations(false);
      }

      // Refresh dedicated playlist detail view if open
      if (playlistDetailModal && playlistDetailModal.style.display !== 'none' && activeDetailPlaylist) {
        if (!data.playlists || !data.playlists[activeDetailPlaylist]) {
          closePlaylistDetail();
        } else {
          openPlaylistDetail(activeDetailPlaylist);
        }
      }
    } catch (e) {
      console.error('Failed to load library:', e);
    }
  }

  function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  function renderTracksTable() {
    const visibleTracks = getSortedAndFilteredTracks();
    tracksTableBody.innerHTML = '';

    if (visibleTracks.length === 0) {
      emptyStateBox.style.display = 'flex';
      return;
    }

    emptyStateBox.style.display = 'none';
    const fragment = document.createDocumentFragment();

    visibleTracks.forEach((track, idx) => {
      const isCurrentlyPlayingThis = state.player.currentTrack && state.player.currentTrack.id === track.id;
      const fmt = getTrackFormatMeta(track);
      const isBuiltIn = isBuiltInTrack(track);
      const isSelected = state.selectedTrackIds.has(track.id);

      // Dynamically compute active playlist membership
      const assignedPlaylists = Object.keys(state.library.playlists || {}).filter(pName =>
        Array.isArray(state.library.playlists[pName]) && state.library.playlists[pName].includes(track.id)
      );

      let albumDisplay = 'Single';
      if (assignedPlaylists.length > 0) {
        albumDisplay = assignedPlaylists.join(', ');
      } else if (track.album &&
        track.album !== 'Downloaded Playlist' &&
        track.album !== 'Downloaded Album' &&
        track.album !== track.playlist &&
        !Object.keys(state.library.playlists || {}).includes(track.album)) {
        albumDisplay = track.album;
      } else {
        albumDisplay = 'Single';
      }

      const tr = document.createElement('tr');
      if (isCurrentlyPlayingThis) {
        tr.classList.add('playing-row');
      }
      if (state.selectionMode && isSelected) {
        tr.classList.add('row-selected');
      }
      if (state.selectionMode && isBuiltIn) {
        tr.classList.add('row-builtin-protected');
      }

      let colNumHtml = '';
      if (state.selectionMode) {
        if (isBuiltIn) {
          colNumHtml = `
            <label class="custom-checkbox-wrap" style="justify-content: center; margin: 0;" title="Built-in core track is protected from deletion">
              <input type="checkbox" class="custom-checkbox" disabled>
              <span class="custom-checkbox-box"></span>
            </label>
          `;
        } else {
          colNumHtml = `
            <label class="custom-checkbox-wrap row-checkbox-label" style="justify-content: center; margin: 0;" onclick="event.stopPropagation();" title="Select track">
              <input type="checkbox" class="custom-checkbox row-select-checkbox" data-track-id="${track.id}" ${isSelected ? 'checked' : ''}>
              <span class="custom-checkbox-box"></span>
            </label>
          `;
        }
      } else {
        colNumHtml = (isCurrentlyPlayingThis && state.player.isPlaying)
          ? '<div class="playing-num-eq"><span></span><span></span><span></span></div>'
          : (idx + 1);
      }

      tr.innerHTML = `
        <td class="col-num">
          ${colNumHtml}
        </td>
        <td class="col-title">
          <div class="track-meta-cell">
            <img class="track-thumb" src="${getTrackThumbnail(track)}" alt="" onerror="this.src='${EMPTY_MUSIC_THUMBNAIL}'">
            <span class="track-title-text" title="${escapeHtml(track.title)}">${escapeHtml(track.title)}</span>
            ${isBuiltIn ? '<span class="badge-builtin-tag" title="Built-in core track (Excluded from custom playlists & protected from deletion)"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>BUILT-IN</span>' : ''}
            <span class="${fmt.badgeClass}" title="${escapeHtml(fmt.tooltip || fmt.label)}">${fmt.isVideo ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>' : ''}${escapeHtml(fmt.label)}</span>
          </div>
        </td>
        <td class="col-artist" title="${escapeHtml(track.artist || 'Unknown Artist')}">${escapeHtml(track.artist || 'Unknown Artist')}</td>
        <td class="col-album${assignedPlaylists.length > 0 ? ' col-album-link' : ''}" title="${assignedPlaylists.length > 0 ? `Open collection: ${escapeHtml(assignedPlaylists[0])}` : escapeHtml(albumDisplay)}">${escapeHtml(albumDisplay)}</td>
        <td class="col-duration" title="${escapeHtml(fmt.sizeLabel || '')}">${formatDuration(track.duration)}</td>
        <td class="col-actions">
          <div class="row-actions-group">
            <button class="row-action-btn play-track-btn" title="Play directly in built-in runtime player">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            </button>
            ${isBuiltIn
          ? `<button class="row-action-btn built-in-locked-btn" disabled title="Built-in track cannot be added to custom playlists">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                </button>`
          : `<button class="row-action-btn add-playlist-btn" title="Add to custom playlist">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                </button>`
        }
            <button class="row-action-btn folder-track-btn" title="Locate file in folder">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
            </button>
            ${isBuiltIn
          ? `<button class="row-action-btn built-in-locked-btn" disabled title="Built-in track is protected from deletion">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                  </svg>
                </button>`
          : `<button class="row-action-btn delete-btn" title="Delete offline file from storage">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>`
        }
          </div>
        </td>
      `;

      // Checkbox listener
      tr.querySelector('.row-select-checkbox')?.addEventListener('change', (e) => {
        e.stopPropagation();
        handleRowSelect(track.id, tr, e.target.checked);
      });

      // Simple selection row click toggle
      tr.addEventListener('click', (e) => {
        if (state.selectionMode) {
          if (e.target.closest('.row-actions-group') || e.target.closest('button')) return;
          if (isBuiltIn) {
            showToast('Built-in core track is protected and cannot be deleted');
            return;
          }
          handleRowSelect(track.id, tr);
        }
      });

      // Open collection directly when clicking its playlist name in table
      if (assignedPlaylists.length > 0) {
        tr.querySelector('.col-album-link')?.addEventListener('click', (e) => {
          if (state.selectionMode) return;
          e.stopPropagation();
          openPlaylistDetail(assignedPlaylists[0]);
        });
      }

      // Play via built-in player
      tr.querySelector('.play-track-btn')?.addEventListener('click', () => {
        playTrack(track, idx);
      });

      // Double-click row to play (only when not in selection mode)
      tr.addEventListener('dblclick', () => {
        if (!state.selectionMode) {
          playTrack(track, idx);
        }
      });

      // Add to custom playlist (only for non-built-in tracks)
      if (!isBuiltIn) {
        tr.querySelector('.add-playlist-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          openAddToPlaylistModal(track);
        });
      }

      // Show in file manager
      tr.querySelector('.folder-track-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (track.filename && window.braveApi?.showInFolder) {
          window.braveApi.showInFolder(track.filename);
        } else {
          window.braveApi?.openDownloadsFolder();
        }
      });

      // Delete track
      tr.querySelector('.delete-btn')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`Remove "${track.title}" from downloaded offline music?`)) {
          // If deleting currently playing track, stop player
          if (state.player.currentTrack && state.player.currentTrack.id === track.id) {
            runtimeAudio.pause();
            runtimeAudio.src = '';
            state.player.currentTrack = null;
            state.player.isPlaying = false;
            playerTitle.textContent = 'Select a track to play';
            playerArtist.textContent = 'Offline Library';
            playerArtImg.src = EMPTY_MUSIC_THUMBNAIL;
            if (playerWaves) playerWaves.style.display = 'none';
            playerPlayIcon.style.display = 'block';
            playerPauseIcon.style.display = 'none';
          }

          await window.braveApi?.deleteTrack(track.id);
          showToast('Track deleted from offline storage');
          loadLibrary();
        }
      });

      fragment.appendChild(tr);
    });
    tracksTableBody.appendChild(fragment);
  }

  function renderPlaylistsGrid() {
    const playlists = state.library.playlists || {};
    const playlistCovers = state.library.playlistCovers || {};
    playlistsGrid.innerHTML = '';

    // Dedicated "+ New Playlist" interactive dashed card
    const newPlaylistCard = document.createElement('div');
    newPlaylistCard.className = 'playlist-card playlist-create-card';
    newPlaylistCard.innerHTML = `
      <div class="playlist-create-icon-wrap">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      </div>
      <div class="playlist-card-info" style="text-align: center;">
        <h3 style="font-size: 0.95rem; font-weight: 700; color: var(--text-main);">Create Playlist</h3>
        <p style="font-size: 0.76rem; color: var(--text-muted); margin-top: 4px;">Custom covers & offline mixes</p>
      </div>
    `;
    newPlaylistCard.addEventListener('click', openCreatePlaylistModal);
    playlistsGrid.appendChild(newPlaylistCard);

    const pNames = Object.keys(playlists);
    pNames.forEach(name => {
      const orderedTracks = getOrderedPlaylistTracks(name);
      const count = orderedTracks.length;
      const firstTrack = orderedTracks[0];
      const customCover = playlistCovers[name];
      const totalDurSec = orderedTracks.reduce((acc, t) => acc + (t.duration || 0), 0);
      const durLabel = totalDurSec > 0 ? formatDuration(totalDurSec) : null;
      const dominantFmt = orderedTracks.length > 0 ? getTrackFormatMeta(orderedTracks[0]).label : null;
      const srcBadge = resolvePlaylistSourceBadge(orderedTracks, customCover);

      // Unique thumbnails for 2x2 collage if playlist has no custom gradient/single cover
      const uniqueThumbs = [...new Set(
        orderedTracks.map(t => getTrackThumbnail(t)).filter(src => src && src !== EMPTY_MUSIC_THUMBNAIL)
      )].slice(0, 4);

      let artInnerHtml = '';
      if (customCover && customCover.startsWith('linear-gradient')) {
        artInnerHtml = `<div class="playlist-card-art custom-art-grad" style="background: ${customCover}; display: flex; align-items: center; justify-content: center;">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
          <span class="playlist-cover-badge ${srcBadge.badgeClass}">${srcBadge.label}</span>
        </div>`;
      } else if (customCover && (customCover.startsWith('http://') || customCover.startsWith('https://') || customCover.startsWith('data:'))) {
        artInnerHtml = `<div class="playlist-card-art">
          <img src="${customCover}" alt="" onerror="this.src='${EMPTY_MUSIC_THUMBNAIL}'">
          <span class="playlist-cover-badge ${srcBadge.badgeClass}">${srcBadge.label}</span>
        </div>`;
      } else if (customCover && customCover.startsWith('url(')) {
        artInnerHtml = `<div class="playlist-card-art custom-art-img" style="background: ${customCover};">
          <span class="playlist-cover-badge ${srcBadge.badgeClass}">${srcBadge.label}</span>
        </div>`;
      } else if (uniqueThumbs.length >= 4) {
        artInnerHtml = `<div class="playlist-card-art playlist-art-collage">
          ${uniqueThumbs.map(src => `<img src="${src}" alt="" onerror="this.src='${EMPTY_MUSIC_THUMBNAIL}'">`).join('')}
          <span class="playlist-cover-badge ${srcBadge.badgeClass}">${srcBadge.label}</span>
        </div>`;
      } else {
        const thumb = getTrackThumbnail(firstTrack);
        artInnerHtml = `<div class="playlist-card-art">
          <img src="${thumb}" alt="" onerror="this.src='${EMPTY_MUSIC_THUMBNAIL}'">
          <span class="playlist-cover-badge ${srcBadge.badgeClass}">${srcBadge.label}</span>
        </div>`;
      }

      const metaParts = [`${count} ${count === 1 ? 'Track' : 'Tracks'}`];
      if (durLabel) metaParts.push(durLabel);
      if (dominantFmt) metaParts.push(dominantFmt);

      const card = document.createElement('div');
      card.className = 'playlist-card';
      card.innerHTML = `
        ${artInnerHtml}
        <div class="playlist-card-info">
          <h3 title="${escapeHtml(name)}">${escapeHtml(name)}</h3>
          <p>${metaParts.join(' • ')}</p>
        </div>
        <div class="playlist-card-actions">
          <button class="ghost-btn play-playlist-btn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            <span>Play All</span>
          </button>
          <button class="ghost-btn delete-playlist-btn" title="Delete Playlist">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      `;

      // Open separate dedicated Playlist View & Music List on cover or card click
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        openPlaylistDetail(name);
      });

      // Play all tracks in exact provider sequence (1..N) & open detail
      card.querySelector('.play-playlist-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        openPlaylistDetail(name);
        const playlistTracks = getOrderedPlaylistTracks(name);
        if (playlistTracks.length > 0) {
          state.selectedPlaylist = name;
          playTrack(playlistTracks[0], 0);
        } else {
          showToast('This playlist has no songs yet');
        }
      });

      // Delete playlist via modal choice
      card.querySelector('.delete-playlist-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        openDeletePlaylistModal(name);
      });

      playlistsGrid.appendChild(card);
    });
  }

  // ==========================================================================
  // UTILITY HELPERS
  // ==========================================================================

  function showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      toast.style.transition = 'all 180ms ease';
      setTimeout(() => toast.remove(), 200);
    }, 3200);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ==========================================================================
  // CUSTOM DARK SELECT DROPDOWNS
  // ==========================================================================

  function setupCustomDropdowns() {
    // Format Dropdown
    const formatWrap = document.getElementById('format-select-wrapper');
    const formatTrigger = document.getElementById('format-trigger');
    const formatMenu = document.getElementById('format-dropdown-menu');
    const formatInput = document.getElementById('select-download-format');
    const formatActiveIcon = document.getElementById('format-active-icon');
    const formatActiveLabel = document.getElementById('format-active-label');

    if (formatTrigger && formatMenu) {
      formatTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllDropdowns(formatWrap);
        formatWrap.classList.toggle('open');
        formatTrigger.setAttribute('aria-expanded', formatWrap.classList.contains('open'));
      });

      formatMenu.querySelectorAll('.custom-select-option').forEach(opt => {
        opt.addEventListener('click', () => {
          const val = opt.getAttribute('data-value');
          const iconEl = opt.querySelector('.option-icon');
          const labelText = opt.querySelector('.option-text')?.textContent || '';

          if (formatInput) formatInput.value = val;
          if (formatActiveIcon && iconEl) formatActiveIcon.innerHTML = iconEl.outerHTML;
          if (formatActiveLabel) formatActiveLabel.textContent = labelText;

          formatMenu.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('selected'));
          opt.classList.add('selected');

          formatWrap.classList.remove('open');
          formatTrigger.setAttribute('aria-expanded', 'false');
        });
      });
    }

    // Sort Dropdown
    const sortWrap = document.getElementById('sort-select-wrapper');
    const sortTrigger = document.getElementById('sort-trigger');
    const sortMenu = document.getElementById('sort-dropdown-menu');
    const sortInput = document.getElementById('sort-tracks-select');
    const sortActiveLabel = document.getElementById('sort-active-label');

    if (sortTrigger && sortMenu) {
      sortTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllDropdowns(sortWrap);
        sortWrap.classList.toggle('open');
        sortTrigger.setAttribute('aria-expanded', sortWrap.classList.contains('open'));
      });

      sortMenu.querySelectorAll('.custom-select-option').forEach(opt => {
        opt.addEventListener('click', () => {
          const val = opt.getAttribute('data-value');
          const labelText = opt.querySelector('.option-text')?.textContent || '';

          if (sortInput) sortInput.value = val;
          if (sortActiveLabel) sortActiveLabel.textContent = labelText;

          sortMenu.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('selected'));
          opt.classList.add('selected');

          sortWrap.classList.remove('open');
          sortTrigger.setAttribute('aria-expanded', 'false');

          state.sortMode = val;
          renderTracksTable();
        });
      });
    }

    function closeAllDropdowns(exceptWrap) {
      document.querySelectorAll('.custom-select-wrapper').forEach(w => {
        if (w !== exceptWrap) {
          w.classList.remove('open');
          w.querySelector('.custom-select-trigger')?.setAttribute('aria-expanded', 'false');
        }
      });
    }

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.custom-select-wrapper')) {
        closeAllDropdowns();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeAllDropdowns();
        if (playerVolumePopover) {
          playerVolumePopover.style.display = 'none';
          playerMuteBtn?.classList.remove('active');
        }
      }
    });
  }

  // ==========================================================================
  // SMART RECOMMENDATIONS & MIX ENGINE UI
  // ==========================================================================
  const recGrid = document.getElementById('recommendations-grid');
  const recHeading = document.getElementById('rec-shelf-heading');
  const recSubtitle = document.getElementById('rec-shelf-subtitle');
  const btnRefreshRecs = document.getElementById('btn-refresh-recommendations');
  const btnPlaySmartMix = document.getElementById('btn-play-smart-mix');
  let lastRecSignature = '';
  let isFetchingRecs = false;

  const OFFLINE_STARTER_PICKS = [
    { id: '4NRXx6U8ABQ', title: 'Blinding Lights', artist: 'The Weeknd', thumbnail: 'https://i.ytimg.com/vi/4NRXx6U8ABQ/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=4NRXx6U8ABQ', reason: 'Synth-Pop Classic' },
    { id: 'dX3k_QDnzHE', title: 'Midnight City', artist: 'M83', thumbnail: 'https://i.ytimg.com/vi/dX3k_QDnzHE/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=dX3k_QDnzHE', reason: 'Electronic Anthem' },
    { id: 'TUVcZfQe-Kw', title: 'Levitating', artist: 'Dua Lipa', thumbnail: 'https://i.ytimg.com/vi/TUVcZfQe-Kw/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=TUVcZfQe-Kw', reason: 'Upbeat Pop' },
    { id: '34Na4j8AVgA', title: 'Starboy', artist: 'The Weeknd ft. Daft Punk', thumbnail: 'https://i.ytimg.com/vi/34Na4j8AVgA/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=34Na4j8AVgA', reason: 'Essential Mix' }
  ];

  function updateSmartMixControls() {
    const playable = (state.library?.tracks || []).filter((t) => !isBuiltInTrack(t));
    if (btnPlaySmartMix) {
      btnPlaySmartMix.style.display = playable.length >= 2 ? 'inline-flex' : 'none';
    }
  }

  function renderRecommendationsGrid(data) {
    if (!recGrid) return;
    const items = Array.isArray(data?.items) ? data.items : [];
    const seedArtists = Array.isArray(data?.seedArtists) ? data.seedArtists : [];

    if (recHeading) {
      recHeading.textContent = data?.mode === 'personalized' ? 'Recommended For You' : 'Starter Picks';
    }
    if (recSubtitle) {
      recSubtitle.textContent = (data?.mode === 'personalized' && seedArtists.length > 0)
        ? `Based on ${seedArtists.join(', ')}`
        : 'Curated tracks ready to download in one click';
    }

    recGrid.innerHTML = '';
    if (items.length === 0) {
      recGrid.innerHTML = '<div class="rec-empty-msg">No new suggestions right now. Click Refresh to check again.</div>';
      return;
    }

    items.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'rec-card';
      const thumb = item.thumbnail || EMPTY_MUSIC_THUMBNAIL;
      card.innerHTML = `
        <img class="rec-card-thumb" src="${escapeHtml(thumb)}" alt="" loading="lazy" onerror="this.src='${EMPTY_MUSIC_THUMBNAIL}'">
        <div class="rec-card-meta">
          <div class="rec-card-title" title="${escapeHtml(item.title || '')}">${escapeHtml(item.title || 'Unknown Track')}</div>
          <div class="rec-card-artist" title="${escapeHtml(item.artist || '')}">${escapeHtml(item.artist || 'YouTube Music')}</div>
          <div class="rec-card-reason">${escapeHtml(item.reason || 'Recommended')}</div>
        </div>
        <button class="rec-card-dl-btn" type="button" title="Download track into Offline Library" aria-label="Download ${escapeHtml(item.title || 'track')}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <path d="M12 3v12m0 0l-4-4m4 4l4-4"></path>
            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"></path>
          </svg>
        </button>
      `;

      const dlBtn = card.querySelector('.rec-card-dl-btn');
      dlBtn?.addEventListener('click', () => {
        if (!item.url) return;
        state.downloadType = 'song';
        toggleSong?.classList.add('active');
        togglePlaylist?.classList.remove('active');
        if (inputDownloadUrl) inputDownloadUrl.value = item.url;
        executeDownload();
      });

      recGrid.appendChild(card);
    });
  }

  async function loadRecommendations(forceRefresh = false) {
    if (!recGrid) return;
    const trackCount = (state.library?.tracks || []).length;
    const curId = state.player.currentTrack?.id || '';
    const sig = `${trackCount}:${curId}`;
    if (!forceRefresh && (isFetchingRecs || (lastRecSignature === sig && recGrid.children.length > 0))) {
      return;
    }

    isFetchingRecs = true;
    if (forceRefresh || recGrid.children.length === 0) {
      recGrid.innerHTML = '<div class="rec-empty-msg">Finding personalized music recommendations…</div>';
    }

    try {
      let data = null;
      if (window.braveApi?.getRecommendations) {
        data = await window.braveApi.getRecommendations({ currentTrackId: curId, limit: 6, forceRefresh });
      }
      if (!data || !Array.isArray(data.items) || data.items.length === 0) {
        const ownedTitles = new Set((state.library?.tracks || []).map((t) => String(t.title || '').toLowerCase().trim()));
        data = {
          mode: 'starter',
          seedArtists: [],
          items: OFFLINE_STARTER_PICKS.filter((p) => !ownedTitles.has(p.title.toLowerCase()))
        };
      }
      lastRecSignature = sig;
      renderRecommendationsGrid(data);
    } catch (e) {
      renderRecommendationsGrid({ mode: 'starter', seedArtists: [], items: OFFLINE_STARTER_PICKS });
    } finally {
      isFetchingRecs = false;
    }
  }

  btnRefreshRecs?.addEventListener('click', () => loadRecommendations(true));

  btnPlaySmartMix?.addEventListener('click', () => {
    const tracks = getSortedAndFilteredTracks();
    if (tracks.length === 0) {
      showToast('Download a couple of tracks first to launch Smart Mix.');
      return;
    }
    state.player.isShuffle = true;
    playerShuffleBtn?.classList.add('active');
    const nextIdx = state.player.currentTrack ? pickSmartNextTrackIndex(tracks) : 0;
    playTrack(tracks[nextIdx], nextIdx);
    showToast('Smart Mix started — queuing similar artists & playlists');
  });

  // Initial setup & data load
  setupCustomDropdowns();
  loadLibrary();
  refreshAuthStatusUI();
});
