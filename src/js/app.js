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
      lockedPlaylist: null // When set, restricts next/prev track cycling to this playlist only
    }
  };

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

  document.getElementById('win-min')?.addEventListener('click', () => {
    window.braveApi?.minimize();
  });

  document.getElementById('win-max')?.addEventListener('click', () => {
    window.braveApi?.maximize();
  });

  document.getElementById('win-close')?.addEventListener('click', () => {
    window.braveApi?.close();
  });

  // Reliable Reload Function for Webviews & Views
  const btnReload = document.getElementById('btn-reload');

  function reloadActiveWebview(webview, providerName) {
    if (!webview) return;
    showToast(`Reloading ${providerName}…`);

    try {
      if (typeof webview.reload === 'function') {
        webview.reload();
        return;
      }
    } catch (e) {}

    try {
      if (typeof webview.reloadIgnoringCache === 'function') {
        webview.reloadIgnoringCache();
        return;
      }
    } catch (e) {}

    try {
      webview.executeJavaScript('window.location.reload();').catch(() => {
        const src = webview.getAttribute('src');
        if (src) webview.src = src;
      });
    } catch (e) {
      const src = webview.getAttribute('src');
      if (src) webview.src = src;
    }
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

  async function openAboutModal() {
    if (aboutModal) {
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
            versionEl.textContent = `Version v${v} (Codemo Stable Release)`;
          }
        }
      } catch (e) {}
      aboutModal.style.display = 'flex';
      btnCloseAbout?.focus();
    }
  }

  function closeAboutModal() {
    if (aboutModal) {
      aboutModal.style.display = 'none';
    }
  }

  // Pre-fetch version on load
  if (window.braveApi?.getAppVersion) {
    window.braveApi.getAppVersion().then(v => {
      const versionEl = document.getElementById('about-app-version');
      if (versionEl) {
        versionEl.textContent = `Version v${v} (Codemo Stable Release)`;
      }
    }).catch(() => {});
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
    } catch (e) {}
    showToast('Donation contact email copied: cosl@codemoteams.org');
  });

  const btnReportIssue = document.getElementById('btn-report-issue');
  btnReportIssue?.addEventListener('click', async () => {
    let appVer = '1.0.1';
    try {
      if (window.braveApi?.getAppVersion) {
        appVer = await window.braveApi.getAppVersion();
      }
    } catch (e) {}
    const subject = encodeURIComponent(`Brave Music v${appVer} Issue Report`);
    const bodyText = `[Brave Music Issue Report]
App Version: v${appVer} Stable (Codemo Release)
Platform: Linux x86_64
Timestamp: ${new Date().toISOString()}

Issue Summary:
[Please describe the issue or bug encountered]

Steps to Reproduce:
1.
2.
3.

Expected Behavior:
[What should have happened]

Observed Behavior:
[What actually happened]`;

    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=cosl@codemoteams.org&su=${subject}&body=${encodeURIComponent(bodyText)}`;
    const mailtoUrl = `mailto:cosl@codemoteams.org?subject=${subject}&body=${encodeURIComponent(bodyText)}`;

    // Try opening Gmail web compose or standard mailto client
    window.braveApi?.openExternal(gmailUrl);
    try {
      navigator.clipboard?.writeText(bodyText);
    } catch (e) {}
    showToast('Report template copied & Gmail composer opened for cosl@codemoteams.org');
  });

  // ==========================================================================
  // ==========================================================================
  // CAPABILITY-BASED AUTHENTICATION & SESSION MANAGEMENT
  // ==========================================================================
  const btnAuthSync = document.getElementById('btn-auth-sync');
  const authSyncModal = document.getElementById('auth-sync-modal');
  const btnCloseAuthSync = document.getElementById('btn-close-auth-sync');
  const btnCancelAuthSync = document.getElementById('btn-cancel-auth-sync');

  // Tabs
  const authTabBtns = document.querySelectorAll('.auth-tab-btn');
  const authTabContents = {
    ytm: document.getElementById('auth-tab-ytm'),
    spotify: document.getElementById('auth-tab-spotify'),
    google: document.getElementById('auth-tab-google')
  };

  // YouTube Music Elements
  const selectYtmBrowser = document.getElementById('select-ytm-browser');
  const btnStartYtmCdp = document.getElementById('btn-start-ytm-cdp');
  const btnCancelYtmCdp = document.getElementById('btn-cancel-ytm-cdp');
  const btnYtmCdpLabel = document.getElementById('btn-ytm-cdp-label');
  const ytmCdpStatus = document.getElementById('ytm-cdp-status');
  const btnToggleCookiesImport = document.getElementById('btn-toggle-cookies-import');
  const labelToggleCookies = document.getElementById('label-toggle-cookies');
  const cookiesImportSection = document.getElementById('cookies-import-section');
  const textareaCookiesImport = document.getElementById('textarea-cookies-import');
  const btnSubmitCookiesText = document.getElementById('btn-submit-cookies-text');

  // Spotify Elements
  const spotifyStatusDot = document.getElementById('spotify-status-dot');
  const spotifyStatusLabel = document.getElementById('spotify-status-label');
  const btnSpotifyPkceConnect = document.getElementById('btn-spotify-pkce-connect');
  const btnSpotifyPkceDisconnect = document.getElementById('btn-spotify-pkce-disconnect');
  const spotifyPkceStatus = document.getElementById('spotify-pkce-status');

  // Google Elements
  const googleStatusDot = document.getElementById('google-status-dot');
  const googleStatusLabel = document.getElementById('google-status-label');
  const btnGooglePkceConnect = document.getElementById('btn-google-pkce-connect');
  const btnGooglePkceDisconnect = document.getElementById('btn-google-pkce-disconnect');
  const googlePkceStatus = document.getElementById('google-pkce-status');

  let activeAuthTab = 'ytm';

  function switchAuthTab(tabId) {
    activeAuthTab = tabId;
    authTabBtns.forEach(b => {
      if (b.dataset.tab === tabId) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });

    Object.keys(authTabContents).forEach(key => {
      const panel = authTabContents[key];
      if (panel) {
        if (key === tabId) {
          panel.style.display = 'block';
          panel.classList.add('active');
        } else {
          panel.style.display = 'none';
          panel.classList.remove('active');
        }
      }
    });
  }

  authTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      switchAuthTab(btn.dataset.tab);
    });
  });

  async function populateDetectedBrowsers() {
    if (!selectYtmBrowser || !window.braveApi?.getAvailableBrowsers) return;
    try {
      const browsers = await window.braveApi.getAvailableBrowsers();
      if (Array.isArray(browsers) && browsers.length > 0) {
        selectYtmBrowser.innerHTML = '<option value="auto">★ Auto-Detect (Recommended)</option>';
        browsers.forEach(b => {
          const opt = document.createElement('option');
          opt.value = b.id;
          opt.textContent = `${b.name} (${b.path})`;
          selectYtmBrowser.appendChild(opt);
        });
      }
    } catch (e) {
      console.warn('[Auth] Error querying available browsers:', e);
    }
  }

  async function refreshAuthStatusUI() {
    if (!window.braveApi?.getAuthStatus) return;
    try {
      const status = await window.braveApi.getAuthStatus();

      // Spotify Status
      if (status.spotify?.authenticated) {
        spotifyStatusDot.className = 'status-dot connected';
        const name = status.spotify.user?.display_name || 'Spotify User';
        spotifyStatusLabel.textContent = `Connected as ${name}`;
        if (btnSpotifyPkceDisconnect) btnSpotifyPkceDisconnect.style.display = 'inline-flex';
      } else {
        spotifyStatusDot.className = 'status-dot disconnected';
        spotifyStatusLabel.textContent = 'Not Connected';
        if (btnSpotifyPkceDisconnect) btnSpotifyPkceDisconnect.style.display = 'none';
      }

      // Google Status
      if (status.google?.authenticated) {
        googleStatusDot.className = 'status-dot connected';
        const email = status.google.user?.email || status.google.user?.name || 'Google Account';
        googleStatusLabel.textContent = `Connected as ${email}`;
        if (btnGooglePkceDisconnect) btnGooglePkceDisconnect.style.display = 'inline-flex';
      } else {
        googleStatusDot.className = 'status-dot disconnected';
        googleStatusLabel.textContent = 'Not Connected';
        if (btnGooglePkceDisconnect) btnGooglePkceDisconnect.style.display = 'none';
      }
    } catch (e) {
      console.warn('[Auth] Error refreshing auth status:', e);
    }
  }

  function openAuthSyncModal(initialTab = 'ytm') {
    if (authSyncModal) {
      authSyncModal.style.display = 'flex';
      switchAuthTab(initialTab);
      populateDetectedBrowsers();
      refreshAuthStatusUI();
      btnCloseAuthSync?.focus();
    }
  }

  function closeAuthSyncModal() {
    if (authSyncModal) {
      authSyncModal.style.display = 'none';
    }
  }

  btnAuthSync?.addEventListener('click', () => {
    const defaultTab = state.currentTab === 'spotify-view' ? 'spotify' : 'ytm';
    openAuthSyncModal(defaultTab);
  });

  btnCloseAuthSync?.addEventListener('click', closeAuthSyncModal);
  btnCancelAuthSync?.addEventListener('click', closeAuthSyncModal);
  authSyncModal?.addEventListener('click', (e) => {
    if (e.target === authSyncModal) closeAuthSyncModal();
  });

  // =========================================================================
  // TAB 1: YOUTUBE MUSIC (CDP & COOKIES.TXT)
  // =========================================================================
  btnStartYtmCdp?.addEventListener('click', async () => {
    const selectedBrowser = selectYtmBrowser?.value || 'auto';
    btnStartYtmCdp.disabled = true;
    if (btnYtmCdpLabel) btnYtmCdpLabel.textContent = 'Browser Running...';
    if (btnCancelYtmCdp) btnCancelYtmCdp.style.display = 'inline-flex';

    if (ytmCdpStatus) {
      ytmCdpStatus.className = 'sync-status-msg loading';
      ytmCdpStatus.style.display = 'block';
      ytmCdpStatus.innerHTML = 'Launching browser at <strong>music.youtube.com</strong> with remote debugging...';
    }

    try {
      const res = await window.braveApi.startYtmCdpLogin(selectedBrowser);
      if (res && res.success) {
        if (ytmCdpStatus) {
          ytmCdpStatus.className = 'sync-status-msg success';
          ytmCdpStatus.style.display = 'block';
          ytmCdpStatus.textContent = `✓ ${res.message}`;
        }
        showToast('YouTube Music session synced! Reloading player...');
        reloadActiveWebview(ytWebview, 'YouTube Music');
        setTimeout(() => closeAuthSyncModal(), 1800);
      } else {
        if (ytmCdpStatus) {
          ytmCdpStatus.className = 'sync-status-msg error';
          ytmCdpStatus.style.display = 'block';
          ytmCdpStatus.textContent = `⚠ ${res.error || 'Failed to complete sign-in.'}`;
        }
      }
    } catch (err) {
      if (ytmCdpStatus) {
        ytmCdpStatus.className = 'sync-status-msg error';
        ytmCdpStatus.style.display = 'block';
        ytmCdpStatus.textContent = `⚠ Sign-in error: ${err.message}`;
      }
    } finally {
      btnStartYtmCdp.disabled = false;
      if (btnYtmCdpLabel) btnYtmCdpLabel.textContent = 'Launch Dedicated Browser Sign-In';
      if (btnCancelYtmCdp) btnCancelYtmCdp.style.display = 'none';
    }
  });

  btnCancelYtmCdp?.addEventListener('click', async () => {
    try {
      await window.braveApi.cancelYtmCdpLogin();
      btnStartYtmCdp.disabled = false;
      if (btnYtmCdpLabel) btnYtmCdpLabel.textContent = 'Launch Dedicated Browser Sign-In';
      if (btnCancelYtmCdp) btnCancelYtmCdp.style.display = 'none';
      if (ytmCdpStatus) {
        ytmCdpStatus.className = 'sync-status-msg';
        ytmCdpStatus.textContent = 'Sign-in cancelled.';
      }
    } catch (e) {}
  });

  // Live CDP status callback
  window.braveApi?.onAuthCdpStatus?.((status) => {
    if (!ytmCdpStatus) return;
    ytmCdpStatus.style.display = 'block';
    if (status.state === 'complete') {
      ytmCdpStatus.className = 'sync-status-msg success';
      ytmCdpStatus.textContent = `✓ ${status.message}`;
    } else if (status.state === 'error' || status.state === 'cancelled') {
      ytmCdpStatus.className = 'sync-status-msg error';
      ytmCdpStatus.textContent = status.message;
    } else {
      ytmCdpStatus.className = 'sync-status-msg loading';
      ytmCdpStatus.textContent = status.message;
    }
  });

  // Fallback cookies.txt accordion toggle
  btnToggleCookiesImport?.addEventListener('click', () => {
    if (cookiesImportSection) {
      const isHidden = cookiesImportSection.style.display === 'none';
      cookiesImportSection.style.display = isHidden ? 'block' : 'none';
      if (labelToggleCookies) {
        labelToggleCookies.textContent = isHidden 
          ? '▾ Hide Alternative: Guided cookies.txt Import Fallback'
          : '▸ Alternative: Guided cookies.txt Import Fallback';
      }
    }
  });

  // cookies.txt import submission
  btnSubmitCookiesText?.addEventListener('click', async () => {
    const text = textareaCookiesImport?.value?.trim();
    if (!text) {
      showToast('Please paste your cookies text first.');
      return;
    }

    btnSubmitCookiesText.disabled = true;
    if (ytmCdpStatus) {
      ytmCdpStatus.className = 'sync-status-msg loading';
      ytmCdpStatus.style.display = 'block';
      ytmCdpStatus.textContent = 'Parsing and injecting cookies...';
    }

    try {
      const res = await window.braveApi.importCookiesText(text);
      if (res && res.success) {
        if (ytmCdpStatus) {
          ytmCdpStatus.className = 'sync-status-msg success';
          ytmCdpStatus.style.display = 'block';
          ytmCdpStatus.textContent = `✓ ${res.message}`;
        }
        showToast('Cookies applied! Reloading YouTube Music...');
        reloadActiveWebview(ytWebview, 'YouTube Music');
        if (textareaCookiesImport) textareaCookiesImport.value = '';
        setTimeout(() => closeAuthSyncModal(), 1800);
      } else {
        if (ytmCdpStatus) {
          ytmCdpStatus.className = 'sync-status-msg error';
          ytmCdpStatus.style.display = 'block';
          ytmCdpStatus.textContent = `⚠ ${res.error || 'Failed to import cookies.'}`;
        }
      }
    } catch (err) {
      if (ytmCdpStatus) {
        ytmCdpStatus.className = 'sync-status-msg error';
        ytmCdpStatus.style.display = 'block';
        ytmCdpStatus.textContent = `⚠ Import error: ${err.message}`;
      }
    } finally {
      btnSubmitCookiesText.disabled = false;
    }
  });

  // =========================================================================
  // TAB 2: SPOTIFY (OAuth 2.0 PKCE Loopback)
  // =========================================================================
  btnSpotifyPkceConnect?.addEventListener('click', async () => {
    btnSpotifyPkceConnect.disabled = true;
    if (spotifyPkceStatus) {
      spotifyPkceStatus.className = 'sync-status-msg loading';
      spotifyPkceStatus.style.display = 'block';
      spotifyPkceStatus.innerHTML = 'Starting loopback server on <strong>127.0.0.1</strong> and opening Spotify in your default browser...';
    }

    try {
      const res = await window.braveApi.startSpotifyPkce();
      if (res && res.success) {
        if (spotifyPkceStatus) {
          spotifyPkceStatus.className = 'sync-status-msg success';
          spotifyPkceStatus.style.display = 'block';
          spotifyPkceStatus.textContent = `✓ Connected to Spotify as ${res.user?.display_name || 'User'}!`;
        }
        showToast('Spotify authorization complete! Reloading...');
        refreshAuthStatusUI();
        reloadActiveWebview(spotifyWebview, 'Spotify');
        setTimeout(() => closeAuthSyncModal(), 1800);
      } else {
        if (spotifyPkceStatus) {
          spotifyPkceStatus.className = 'sync-status-msg error';
          spotifyPkceStatus.style.display = 'block';
          spotifyPkceStatus.textContent = `⚠ ${res.error || 'Spotify authorization cancelled.'}`;
        }
      }
    } catch (err) {
      if (spotifyPkceStatus) {
        spotifyPkceStatus.className = 'sync-status-msg error';
        spotifyPkceStatus.style.display = 'block';
        spotifyPkceStatus.textContent = `⚠ Spotify error: ${err.message}`;
      }
    } finally {
      btnSpotifyPkceConnect.disabled = false;
    }
  });

  btnSpotifyPkceDisconnect?.addEventListener('click', async () => {
    try {
      await window.braveApi.logoutProvider('spotify');
      showToast('Disconnected Spotify account.');
      refreshAuthStatusUI();
      if (spotifyPkceStatus) {
        spotifyPkceStatus.className = 'sync-status-msg';
        spotifyPkceStatus.style.display = 'block';
        spotifyPkceStatus.textContent = 'Account disconnected.';
      }
      reloadActiveWebview(spotifyWebview, 'Spotify');
    } catch (err) {
      showToast('Error disconnecting: ' + err.message);
    }
  });

  // =========================================================================
  // TAB 3: GOOGLE APP (OAuth 2.0 PKCE Loopback)
  // =========================================================================
  btnGooglePkceConnect?.addEventListener('click', async () => {
    btnGooglePkceConnect.disabled = true;
    if (googlePkceStatus) {
      googlePkceStatus.className = 'sync-status-msg loading';
      googlePkceStatus.style.display = 'block';
      googlePkceStatus.innerHTML = 'Starting loopback server on <strong>127.0.0.1</strong> and opening Google in your default browser...';
    }

    try {
      const res = await window.braveApi.startGooglePkce();
      if (res && res.success) {
        if (googlePkceStatus) {
          googlePkceStatus.className = 'sync-status-msg success';
          googlePkceStatus.style.display = 'block';
          googlePkceStatus.textContent = `✓ Connected to Google as ${res.user?.email || res.user?.name || 'User'}!`;
        }
        showToast('Google account connected!');
        refreshAuthStatusUI();
        setTimeout(() => closeAuthSyncModal(), 1800);
      } else {
        if (googlePkceStatus) {
          googlePkceStatus.className = 'sync-status-msg error';
          googlePkceStatus.style.display = 'block';
          googlePkceStatus.textContent = `⚠ ${res.error || 'Google authorization cancelled.'}`;
        }
      }
    } catch (err) {
      if (googlePkceStatus) {
        googlePkceStatus.className = 'sync-status-msg error';
        googlePkceStatus.style.display = 'block';
        googlePkceStatus.textContent = `⚠ Google error: ${err.message}`;
      }
    } finally {
      btnGooglePkceConnect.disabled = false;
    }
  });

  btnGooglePkceDisconnect?.addEventListener('click', async () => {
    try {
      await window.braveApi.logoutProvider('google');
      showToast('Disconnected Google account.');
      refreshAuthStatusUI();
      if (googlePkceStatus) {
        googlePkceStatus.className = 'sync-status-msg';
        googlePkceStatus.style.display = 'block';
        googlePkceStatus.textContent = 'Account disconnected.';
      }
    } catch (err) {
      showToast('Error disconnecting: ' + err.message);
    }
  });

  // Intercepted webview login click handler
  window.braveApi?.onAuthBrowserOpened?.((data) => {
    const service = data?.service;
    const targetTab = service === 'spotify' ? 'spotify' : 'ytm';
    openAuthSyncModal(targetTab);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
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
      loadLibrary();
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
    } catch (e) {}
  }

  syncShieldStats();
  setInterval(syncShieldStats, 3000);

  if (window.braveApi?.onShieldUpdate) {
    window.braveApi.onShieldUpdate((data) => {
      if (shieldCountLabel && typeof data?.count === 'number') {
        shieldCountLabel.textContent = `${data.count} ads blocked`;
        shieldCountLabel.classList.add('pulse-counter');
        setTimeout(() => shieldCountLabel.classList.remove('pulse-counter'), 450);
      }
    });
  }

  // Proactive webview shield listener & fallback engine
  function setupWebviewShields(webview, providerName) {
    if (!webview) return;

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
        `).catch(() => {});
      } catch (e) {}
    };

    webview.addEventListener('did-navigate', verifyShields);
    webview.addEventListener('did-navigate-in-page', verifyShields);
    webview.addEventListener('dom-ready', verifyShields);
  }

  setupWebviewShields(ytWebview, 'YouTube Music');
  setupWebviewShields(spotifyWebview, 'Spotify');

  // ==========================================================================
  // DOWNLOAD CONTROLS (OFFLINE AUDIO ENGINE)
  // ==========================================================================

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
    inputDownloadUrl.placeholder = 'Paste YouTube / Spotify playlist URL…';
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
    progressFillBar.style.width = '0%';
    progressPercentVal.textContent = '0%';
    progressSpeed.textContent = '0.0 MB/s';
    const isPlaylistUrl = /[?&]list=[a-zA-Z0-9_-]+/i.test(url) || /\/playlist\/[a-zA-Z0-9_-]+/i.test(url) || /\/album\/[a-zA-Z0-9_-]+/i.test(url);
    const shouldDownloadAsPlaylist = state.downloadType === 'playlist' || isPlaylistUrl;

    progressStatusLabel.textContent = isVideo
      ? (shouldDownloadAsPlaylist ? 'Resolving & downloading video playlist…' : 'Resolving & downloading music video…')
      : (shouldDownloadAsPlaylist ? 'Fetching playlist information…' : 'Resolving audio stream…');

    btnExecuteDownload.disabled = true;

    try {
      const result = await window.braveApi.startDownload({
        url,
        isPlaylist: shouldDownloadAsPlaylist,
        playlistName: '', // Let yt-dlp automatically extract and name genuine playlist title
        format
      });

      if (result.success) {
        showToast(shouldDownloadAsPlaylist
          ? `Downloaded ${result.count || ''} songs into playlist & library`
          : (isVideo ? 'Music video downloaded to offline storage' : 'Song downloaded to offline storage'));
        inputDownloadUrl.value = '';
        await loadLibrary();
      } else {
        const errorMsg = result.error || 'Check URL';
        if (progressStatusLabel) {
          progressStatusLabel.textContent = errorMsg;
          progressStatusLabel.style.color = '#f87171';
        }
        showToast(`Download failed: ${errorMsg}`);
      }
    } catch (err) {
      if (progressStatusLabel) {
        progressStatusLabel.textContent = `Error: ${err.message}`;
        progressStatusLabel.style.color = '#f87171';
      }
      showToast(`Download error: ${err.message}`);
    } finally {
      btnExecuteDownload.disabled = false;
      setTimeout(() => {
        downloadProgressBox.style.display = 'none';
        if (progressStatusLabel) progressStatusLabel.style.color = '';
      }, 2500);
    }
  }

  if (window.braveApi?.onDownloadProgress) {
    window.braveApi.onDownloadProgress((data) => {
      if (typeof data.percent === 'number') {
        const pct = Math.max(0, Math.min(100, Math.round(data.percent)));
        progressFillBar.style.width = `${pct}%`;
        progressPercentVal.textContent = (data.itemTotal && data.itemIndex)
          ? `${pct}% (${data.itemIndex}/${data.itemTotal})`
          : `${pct}%`;
      }
      if (progressStatusLabel) {
        if (data.status) {
          progressStatusLabel.textContent = data.status;
        } else if (data.size) {
          progressStatusLabel.textContent = `Downloading (${data.size})${data.eta ? ' • ETA ' + data.eta : ''}…`;
        }
      }
      if (data.speed) {
        progressSpeed.textContent = data.speed;
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

    if (btnToggleSelectMode) {
      btnToggleSelectMode.classList.toggle('active', state.selectionMode);
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

    updateSelectionUI();
    renderTracksTable();
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
  }

  function openPlaylistDetail(playlistName) {
    if (!playlistName) return;
    activeDetailPlaylist = playlistName;
    if (playlistDetailTitle) playlistDetailTitle.textContent = playlistName;

    const playlists = state.library.playlists || {};
    const playlistCovers = state.library.playlistCovers || {};
    const trackIds = playlists[playlistName] || [];
    const allTracks = state.library.tracks || [];

    // Filter tracks belonging to this playlist, strictly excluding built-in music
    const playlistTracks = allTracks.filter(t => trackIds.includes(t.id) && !isBuiltInTrack(t));

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
      const isVideoFile = /\.(mp4|webm|mkv|m4v)$/i.test(track.filename || '');
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
            ${isVideoFile ? '<span class="badge-video-tag" title="Video file plays as audio in built-in player"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>VIDEO</span>' : ''}
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
    const playlistTracks = allTracks.filter(t => playlistTrackIds.includes(t.id) && !isBuiltInTrack(t));
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
    const playlistTracks = allTracks.filter(t => playlistTrackIds.includes(t.id) && !isBuiltInTrack(t));
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
    const playlistTracks = allTracks.filter(t => playlistTrackIds.includes(t.id) && !isBuiltInTrack(t));
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
      tracks = tracks.filter(t => playlistTrackIds.includes(t.id) && !isBuiltInTrack(t));
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

  // Web Audio API Hardware Audio Pipeline & Gain Node
  let audioCtx = null;
  let gainNode = null;

  function ensureAudioGraph() {
    if (audioCtx) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
        const source = audioCtx.createMediaElementSource(runtimeAudio);
        gainNode = audioCtx.createGain();
        gainNode.gain.value = state.player.isMuted ? 0 : state.player.volume;
        source.connect(gainNode);
        gainNode.connect(audioCtx.destination);
      }
    } catch (e) {
      console.warn('[Player] AudioGraph notice:', e.message);
    }
  }

  // Initialize runtime audio volume defaults immediately
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

      state.player.currentTrack = track;
      state.player.currentIndex = index;
      state.player.isPlaying = true;

      // Unlock Web Audio API context on user playback
      ensureAudioGraph();
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }

      runtimeAudio.src = streamUrl;
      runtimeAudio.volume = state.player.volume;
      if (gainNode) gainNode.gain.value = state.player.isMuted ? 0 : state.player.volume;
      runtimeAudio.muted = state.player.isMuted;

      runtimeAudio.play().catch(e => {
        console.warn('[Player] Playback error:', e);
        state.player.isPlaying = false;
        playerPlayIcon.style.display = 'block';
        playerPauseIcon.style.display = 'none';
        if (playerWaves) playerWaves.style.display = 'none';
        renderTracksTable();
        showToast('Playback interrupted or format unsupported');
      });

      // Update runtime bar metadata
      playerTitle.textContent = track.title || 'Unknown Title';
      playerArtist.textContent = track.artist || 'Offline Library';
      playerArtImg.src = getTrackThumbnail(track);
      playerArtImg.onerror = function() { this.src = EMPTY_MUSIC_THUMBNAIL; };
      if (playerWaves) playerWaves.style.display = 'inline-flex';
      playerPlayIcon.style.display = 'none';
      playerPauseIcon.style.display = 'block';

      renderTracksTable();
      showToast(`Playing "${track.title}"`);
    } catch (e) {
      showToast(`Player error: ${e.message}`);
    }
  }

  function togglePlayPause() {
    const tracks = getSortedAndFilteredTracks();
    if (tracks.length === 0) {
      showToast('No downloaded music in library yet. Paste a link above to download.');
      return;
    }

    if (!state.player.currentTrack) {
      playTrack(tracks[0], 0);
      return;
    }

    ensureAudioGraph();
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    if (state.player.isPlaying) {
      runtimeAudio.pause();
      state.player.isPlaying = false;
      playerPlayIcon.style.display = 'block';
      playerPauseIcon.style.display = 'none';
      if (playerWaves) playerWaves.style.display = 'none';
    } else {
      runtimeAudio.play().catch(() => {});
      state.player.isPlaying = true;
      playerPlayIcon.style.display = 'none';
      playerPauseIcon.style.display = 'block';
      if (playerWaves) playerWaves.style.display = 'inline-flex';
    }

    renderTracksTable();
  }

  function playNextTrack() {
    const tracks = getSortedAndFilteredTracks();
    if (tracks.length === 0) return;

    let nextIndex;
    if (state.player.isShuffle && tracks.length > 1) {
      do {
        nextIndex = Math.floor(Math.random() * tracks.length);
      } while (nextIndex === state.player.currentIndex && tracks.length > 1);
    } else {
      nextIndex = (state.player.currentIndex + 1) % tracks.length;
    }

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
  runtimeAudio.addEventListener('timeupdate', () => {
    playerCurrentTime.textContent = formatDuration(runtimeAudio.currentTime);

    if (!state.player.isDraggingSeek && runtimeAudio.duration) {
      const pct = (runtimeAudio.currentTime / runtimeAudio.duration) * 100;
      playerSeekSlider.value = pct;
      playerSeekFill.style.width = `${pct}%`;
    }
  });

  runtimeAudio.addEventListener('loadedmetadata', () => {
    playerTotalTime.textContent = formatDuration(runtimeAudio.duration);
  });

  runtimeAudio.addEventListener('ended', () => {
    if (state.player.isRepeat) {
      runtimeAudio.currentTime = 0;
      runtimeAudio.play().catch(() => {});
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
    renderTracksTable();
    showToast('Playback error: unable to decode or read audio stream');
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
    }
  });

  // Player controls click events
  playerPlayPauseBtn.addEventListener('click', togglePlayPause);
  playerNextBtn.addEventListener('click', playNextTrack);
  playerPrevBtn.addEventListener('click', playPrevTrack);

  playerShuffleBtn.addEventListener('click', () => {
    state.player.isShuffle = !state.player.isShuffle;
    playerShuffleBtn.classList.toggle('active', state.player.isShuffle);
    showToast(state.player.isShuffle ? 'Shuffle enabled' : 'Shuffle disabled');
  });

  playerRepeatBtn.addEventListener('click', () => {
    state.player.isRepeat = !state.player.isRepeat;
    playerRepeatBtn.classList.toggle('active', state.player.isRepeat);
    showToast(state.player.isRepeat ? 'Repeat track enabled' : 'Repeat disabled');
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
    ensureAudioGraph();
    if (gainNode) {
      gainNode.gain.value = state.player.isMuted ? 0 : clamped;
    }
    if (clamped > 0 && runtimeAudio.muted) {
      runtimeAudio.muted = false;
      state.player.isMuted = false;
    }
    const pct = Math.round(clamped * 100);
    if (playerVolPercent) playerVolPercent.textContent = `${pct}%`;
    if (playerVolumeFill) playerVolumeFill.style.height = `${pct}%`;
    updateVolumeIcon();
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
    ensureAudioGraph();
    if (gainNode) {
      gainNode.gain.value = runtimeAudio.muted ? 0 : state.player.volume;
    }
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
  // OFFLINE LIBRARY DATA & RENDERING
  // ==========================================================================

  async function loadLibrary() {
    if (!window.braveApi?.getLibrary) return;
    try {
      const data = await window.braveApi.getLibrary();
      state.library = data || { tracks: [], playlists: {} };

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

      // Refresh dedicated playlist detail view if open
      if (playlistDetailModal && playlistDetailModal.style.display !== 'none' && activeDetailPlaylist) {
        openPlaylistDetail(activeDetailPlaylist);
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

    visibleTracks.forEach((track, idx) => {
      const isCurrentlyPlayingThis = state.player.currentTrack && state.player.currentTrack.id === track.id;
      const isVideoFile = /\.(mp4|webm|mkv|m4v)$/i.test(track.filename || '');
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
            ${isVideoFile ? '<span class="badge-video-tag" title="Video file plays as audio in built-in player"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>VIDEO</span>' : ''}
          </div>
        </td>
        <td class="col-artist" title="${escapeHtml(track.artist || 'Unknown Artist')}">${escapeHtml(track.artist || 'Unknown Artist')}</td>
        <td class="col-album" title="${escapeHtml(albumDisplay)}">${escapeHtml(albumDisplay)}</td>
        <td class="col-duration">${formatDuration(track.duration)}</td>
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
        if (e.target.checked) {
          state.selectedTrackIds.add(track.id);
        } else {
          state.selectedTrackIds.delete(track.id);
        }
        renderTracksTable();
        updateSelectionUI();
      });

      // Selection mode row click toggle
      tr.addEventListener('click', (e) => {
        if (state.selectionMode) {
          if (e.target.closest('.row-actions-group') || e.target.closest('button')) return;
          if (isBuiltIn) {
            showToast('Built-in track is protected and cannot be deleted');
            return;
          }
          if (state.selectedTrackIds.has(track.id)) {
            state.selectedTrackIds.delete(track.id);
          } else {
            state.selectedTrackIds.add(track.id);
          }
          renderTracksTable();
          updateSelectionUI();
        }
      });

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

      tracksTableBody.appendChild(tr);
    });
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
      const trackIds = playlists[name] || [];
      const count = trackIds.length;
      const firstTrack = (state.library.tracks || []).find(t => trackIds.includes(t.id));
      const customCover = playlistCovers[name];

      let artHtml = '';
      if (customCover && customCover.startsWith('linear-gradient')) {
        artHtml = `<div class="playlist-card-art custom-art-grad" style="background: ${customCover}; display: flex; align-items: center; justify-content: center;">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
        </div>`;
      } else if (customCover && (customCover.startsWith('http://') || customCover.startsWith('https://') || customCover.startsWith('data:'))) {
        artHtml = `<div class="playlist-card-art">
          <img src="${customCover}" alt="" onerror="this.src='${EMPTY_MUSIC_THUMBNAIL}'">
        </div>`;
      } else if (customCover && customCover.startsWith('url(')) {
        artHtml = `<div class="playlist-card-art custom-art-img" style="background: ${customCover};"></div>`;
      } else {
        const thumb = getTrackThumbnail(firstTrack);
        artHtml = `<div class="playlist-card-art">
          <img src="${thumb}" alt="" onerror="this.src='${EMPTY_MUSIC_THUMBNAIL}'">
        </div>`;
      }

      const card = document.createElement('div');
      card.className = 'playlist-card';
      card.innerHTML = `
        ${artHtml}
        <div class="playlist-card-info">
          <h3>${escapeHtml(name)}</h3>
          <p>${count} ${count === 1 ? 'Track' : 'Tracks'} • Offline Library</p>
        </div>
        <div style="display: flex; gap: 8px; margin-top: 10px;">
          <button class="ghost-btn play-playlist-btn" style="flex: 1; height: 32px; font-size: 0.74rem; justify-content: center;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            <span>Play All</span>
          </button>
          <button class="ghost-btn delete-playlist-btn" style="height: 32px; width: 32px; padding: 0; justify-content: center;" title="Delete Playlist">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      `;

      // Open separate dedicated Playlist View & Music List on cover or card click
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        openPlaylistDetail(name);
      });

      // Play all tracks in playlist & open detail
      card.querySelector('.play-playlist-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        openPlaylistDetail(name);
        const playlistTrackIds = (state.library.playlists || {})[name] || [];
        const playlistTracks = (state.library.tracks || []).filter(t => playlistTrackIds.includes(t.id) && !isBuiltInTrack(t));
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

  // Initial setup & data load
  setupCustomDropdowns();
  loadLibrary();
});
