const { app, components, BrowserWindow, ipcMain, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const backend = require('./backend');

// Standard Google Chrome User-Agent matching underlying Chromium runtime version
const CHROME_FULL_VERSION = (process.versions && process.versions.chrome) ? process.versions.chrome : '148.0.7778.280';
const CHROME_MAJOR_VERSION = CHROME_FULL_VERSION.split('.')[0] || '148';
const CHROME_USER_AGENT = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_FULL_VERSION} Safari/537.36`;
const FIREFOX_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64; rv:136.0) Gecko/20100101 Firefox/136.0';
const SHARED_PARTITION = 'persist:bravemusic';

function isGoogleAuthRequestUrl(targetUrl) {
  if (!targetUrl || typeof targetUrl !== 'string') return false;
  try {
    const host = new URL(targetUrl).hostname.toLowerCase();
    return (
      host === 'accounts.google.com' ||
      host.startsWith('accounts.google.') ||
      host === 'accounts.youtube.com' ||
      host.startsWith('myaccount.google.') ||
      host === 'consent.google.com'
    );
  } catch (e) {
    return false;
  }
}

// Enforce single instance lock: prevent opening duplicate separate app instances
if (app) {
  const gotSingleInstanceLock = app.requestSingleInstanceLock();
  if (!gotSingleInstanceLock) {
    console.log('[Main] Another instance of Brave Music is already running. Focusing existing instance and quitting.');
    app.quit();
    process.exit(0);
  }

  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // When clicked again in dock or launcher, focus existing window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Explicitly identify app name & desktop WMClass to group with installed .desktop launcher
  app.name = 'brave-music';
  if (typeof app.setName === 'function') {
    app.setName('brave-music');
  }
  if (typeof app.setAppUserModelId === 'function') {
    app.setAppUserModelId('brave-music');
  }
  app.userAgentFallback = CHROME_USER_AGENT;

  // Natively remove AutomationControlled flag so navigator.webdriver is false
  app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');
  app.commandLine.removeSwitch('enable-automation');
}

function isAuthUrl(targetUrl) {
  if (!targetUrl || typeof targetUrl !== 'string') return false;
  const lower = targetUrl.toLowerCase();
  return lower.includes('accounts.google.') ||
         lower.includes('accounts.youtube.') ||
         lower.includes('myaccount.google.') ||
         lower.includes('apis.google.') ||
         lower.includes('oauth2.googleapis.') ||
         lower.includes('identitytoolkit.googleapis.') ||
         lower.includes('securetoken.googleapis.') ||
         lower.includes('play.google.com') ||
         lower.includes('clients6.google.com') ||
         lower.includes('gstatic.com') ||
         lower.includes('google.com/recaptcha') ||
         lower.includes('recaptcha.net') ||
         lower.includes('consent.google.com') ||
         lower.includes('/servicelogin') ||
         lower.includes('/signin') ||
         lower.includes('/v3/signin') ||
         lower.includes('/identifier') ||
         lower.includes('/challenge') ||
         lower.includes('/oauth') ||
         lower.includes('/auth/') ||
         lower.includes('appleid.apple.com') ||
         (lower.includes('facebook.com') && lower.includes('login')) ||
         (lower.includes('spotify.com') && (lower.includes('/login') || lower.includes('/signup') || lower.includes('/authorize')));
}

// Capability-Based & Hardened In-App Sign-In Window Manager
let interactiveAuthWindow = null;

function closeInteractiveAuthWindow() {
  if (interactiveAuthWindow && !interactiveAuthWindow.isDestroyed()) {
    try { interactiveAuthWindow.close(); } catch (e) {}
  }
  interactiveAuthWindow = null;
}

function openInteractiveAuthWindow({ service = 'youtube', url = '', onClosed = null } = {}) {
  const normalizedService = (service || '').toLowerCase() === 'spotify' ? 'spotify' : 'youtube';
  const startUrl = url || (
    normalizedService === 'spotify'
      ? 'https://accounts.spotify.com/en/login?continue=https%3A%2F%2Fopen.spotify.com%2F'
      : 'https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fmusic.youtube.com%2F'
  );

  if (interactiveAuthWindow && !interactiveAuthWindow.isDestroyed()) {
    try {
      interactiveAuthWindow.show();
      interactiveAuthWindow.focus();
      interactiveAuthWindow.loadURL(startUrl);
    } catch (e) {}
    return interactiveAuthWindow;
  }

  const authWin = new BrowserWindow({
    title: `Brave Music — ${normalizedService === 'spotify' ? 'Spotify' : 'YouTube Music'} Sign In`,
    width: 540,
    height: 700,
    minWidth: 420,
    minHeight: 540,
    parent: (mainWindow && !mainWindow.isDestroyed()) ? mainWindow : undefined,
    autoHideMenuBar: true,
    backgroundColor: '#0b0d13',
    webPreferences: {
      partition: SHARED_PARTITION,
      preload: path.join(__dirname, 'src', 'js', 'auth-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    },
    icon: fs.existsSync(path.join(__dirname, 'src', 'assets', 'app-icon.png'))
      ? path.join(__dirname, 'src', 'assets', 'app-icon.png')
      : path.join(__dirname, 'src', 'assets', 'app-icon.svg')
  });

  interactiveAuthWindow = authWin;

  // Apply Firefox identity proactively for Google auth hosts and Chrome for streaming hosts
  const applyPerUrlUa = (targetUrl) => {
    try {
      if (isGoogleAuthRequestUrl(targetUrl)) {
        authWin.webContents.setUserAgent(FIREFOX_USER_AGENT);
      } else {
        authWin.webContents.setUserAgent(CHROME_USER_AGENT);
      }
    } catch (e) {}
  };

  authWin.webContents.on('did-start-navigation', (e, navUrl) => {
    applyPerUrlUa(navUrl);
  });

  authWin.webContents.on('did-finish-load', async () => {
    try {
      const current = authWin.webContents.getURL() || '';
      const ytmDevtoolsAuthService = require('./backend/services/YTMDevtoolsAuthService');
      const mem = await ytmDevtoolsAuthService.syncFromBrowserMemory(normalizedService);
      const isDone = normalizedService === 'spotify' ? mem.spotify : mem.ytm;
      const landedHome = normalizedService === 'spotify'
        ? current.startsWith('https://open.spotify.com')
        : (current.startsWith('https://music.youtube.com') || current.startsWith('https://www.youtube.com'));

      if (isDone && landedHome) {
        ytmDevtoolsAuthService.saveUserAccount(normalizedService, {
          name: normalizedService === 'spotify' ? 'Spotify Account' : 'YouTube Music Account',
          email: normalizedService === 'spotify' ? 'Active Spotify Session' : 'Active Google Session',
          authenticated: true,
          source: 'secure-window'
        });
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('auth-sync-completed', { service: normalizedService, count: normalizedService === 'spotify' ? mem.spotifyCount : mem.ytmCount });
        }
        setTimeout(() => {
          if (interactiveAuthWindow === authWin) closeInteractiveAuthWindow();
        }, 350);
      }
    } catch (e) {}
  });

  authWin.webContents.setWindowOpenHandler(({ url: popupUrl }) => {
    if (!popupUrl) return { action: 'deny' };
    if (isAuthUrl(popupUrl) || popupUrl.includes('youtube.com') || popupUrl.includes('spotify.com') || popupUrl.includes('google.')) {
      applyPerUrlUa(popupUrl);
      authWin.loadURL(popupUrl);
      return { action: 'deny' };
    }
    shell.openExternal(popupUrl);
    return { action: 'deny' };
  });

  authWin.on('closed', () => {
    if (interactiveAuthWindow === authWin) {
      interactiveAuthWindow = null;
    }
    if (typeof onClosed === 'function') {
      try { onClosed(); } catch (e) {}
    }
  });

  applyPerUrlUa(startUrl);
  authWin.loadURL(startUrl).catch((err) => {
    console.warn('[Main] Auth window load warning:', err.message);
  });

  return authWin;
}

function openLoginModal(authUrl, callerContents) {
  const service = (authUrl && authUrl.includes('spotify')) ? 'spotify' : 'youtube';

  // Notify frontend to display the capability Auth Modal
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('auth-browser-opened', {
      url: authUrl,
      service
    });
  }
}

// Self-Seed CastLabs Widevine CDM directory and pointer in app userData
function ensureWidevineCdm() {
  const homeDir = os.homedir();
  const cdmVersion = '4.10.3112.0';
  const cdmBinaryName = 'libwidevinecdm.so';
  const platformArch = 'linux_x64';

  const userDataDir = path.join(homeDir, '.config', 'brave-music');
  const targetCdmDir = path.join(userDataDir, 'WidevineCdm');
  const targetVerDir = path.join(targetCdmDir, cdmVersion);
  const targetPlatformDir = path.join(targetVerDir, '_platform_specific', platformArch);
  const targetPointerFile = path.join(targetCdmDir, 'latest-component-updated-widevine-cdm');

  const candidateSources = [
    path.join(__dirname, 'WidevineCdm'),
    '/opt/brave-music/WidevineCdm',
    '/opt/google/chrome/WidevineCdm',
    path.join(homeDir, '.config', 'Codex', 'WidevineCdm', cdmVersion),
    path.join(homeDir, '.config', 'google-chrome', 'WidevineCdm', cdmVersion),
    '/usr/lib/chromium-browser/WidevineCdm',
    '/usr/lib/chromium/WidevineCdm'
  ];

  let sourceDir = null;
  for (const src of candidateSources) {
    if (src && fs.existsSync(src)) {
      sourceDir = src;
      break;
    }
  }

  try {
    fs.mkdirSync(targetPlatformDir, { recursive: true });

    // Locate and copy CDM binary
    const libCandidates = [
      sourceDir ? path.join(sourceDir, '_platform_specific', platformArch, cdmBinaryName) : null,
      sourceDir ? path.join(sourceDir, cdmBinaryName) : null,
      '/opt/google/chrome/WidevineCdm/_platform_specific/linux_x64/libwidevinecdm.so',
      path.join(homeDir, '.config', 'Codex', 'WidevineCdm', cdmVersion, '_platform_specific', 'linux_x64', 'libwidevinecdm.so')
    ].filter(Boolean);

    for (const lib of libCandidates) {
      if (fs.existsSync(lib)) {
        const dest = path.join(targetPlatformDir, cdmBinaryName);
        if (!fs.existsSync(dest)) {
          fs.copyFileSync(lib, dest);
        }
        break;
      }
    }

    // Locate and copy manifest.json
    const manifestCandidates = [
      sourceDir ? path.join(sourceDir, 'manifest.json') : null,
      '/opt/google/chrome/WidevineCdm/manifest.json',
      path.join(homeDir, '.config', 'Codex', 'WidevineCdm', cdmVersion, 'manifest.json')
    ].filter(Boolean);

    for (const man of manifestCandidates) {
      if (fs.existsSync(man)) {
        const dest = path.join(targetVerDir, 'manifest.json');
        if (!fs.existsSync(dest)) {
          fs.copyFileSync(man, dest);
        }
        break;
      }
    }

    // Write latest-component-updated-widevine-cdm pointer
    const pointerContent = JSON.stringify({ Path: targetVerDir });
    fs.writeFileSync(targetPointerFile, pointerContent);

    const installedLib = path.join(targetPlatformDir, cdmBinaryName);
    if (fs.existsSync(installedLib)) {
      app.commandLine.appendSwitch('widevine-cdm-path', installedLib);
      app.commandLine.appendSwitch('widevine-cdm-version', cdmVersion);
      console.log('[Main] Widevine CDM provisioned at:', installedLib);
      return installedLib;
    }
  } catch (err) {
    console.warn('[Main] Widevine CDM provisioning notice:', err.message);
  }
  return null;
}

ensureWidevineCdm();

if (app) {
  // Flags for Widevine DRM, seamless autoplay and Linux Wayland/X11 webview stability
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('no-zygote');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
  app.commandLine.appendSwitch('enable-features', 'WidevineCdm');
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
}
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'Brave Music',
    width: 1360,
    height: 840,
    minWidth: 400,
    minHeight: 500,
    frame: false,
    backgroundColor: '#07080c',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      sandbox: false
    },
    icon: fs.existsSync(path.join(__dirname, 'src', 'assets', 'app-icon.png'))
      ? path.join(__dirname, 'src', 'assets', 'app-icon.png')
      : path.join(__dirname, 'src', 'assets', 'app-icon.svg')
  });

  // Initialize modular backend services & IPC
  backend.init({ mainWindow });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer Console] ${message} (${sourceId}:${line})`);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// Web Contents Creation Handler: intercept window.open in webviews and popup windows
app.on('web-contents-created', (event, contents) => {
  console.log('[App] web-contents-created:', contents.getType(), contents.id);
  const musicSession = session.fromPartition(SHARED_PARTITION);

  // Apply genuine Google Chrome desktop User-Agent to every webContents and login popup
  contents.setUserAgent(CHROME_USER_AGENT);

  if (contents.getType() === 'webview') {
    contents.on('console-message', (e, level, message) => {
      console.log(`[Webview Console] ${message}`);
    });
    contents.on('did-fail-load', (e, errorCode, errorDescription, validatedURL) => {
      console.log(`[Webview Fail Load] ${validatedURL}: ${errorDescription} (${errorCode})`);
    });
    contents.on('did-finish-load', () => {
      const currentUrl = contents.getURL() || '';
      console.log(`[Webview Finished Load] ${currentUrl}`);
      const lowerUrl = currentUrl.toLowerCase();
      if (lowerUrl.includes('accounts.google.') && (lowerUrl.includes('/signin/rejected') || lowerUrl.includes('/v3/signin/rejected'))) {
        console.log('[Main] Google rejected embedded webview sign-in. Recovering webview and opening hardened Sign-In window.');
        try {
          contents.loadURL('https://music.youtube.com');
        } catch (e) {}
        openInteractiveAuthWindow({ service: 'youtube' });
        return;
      }
      try {
        const ytmDevtoolsAuthService = require('./backend/services/YTMDevtoolsAuthService');
        if (typeof ytmDevtoolsAuthService.syncFromBrowserMemory === 'function') {
          ytmDevtoolsAuthService.syncFromBrowserMemory().catch(() => {});
        }
      } catch (e) {}
    });
    // Intercept window.open calls from inside Spotify or YouTube
    contents.setWindowOpenHandler(({ url }) => {
      try {
        if (!url || typeof url !== 'string') return { action: 'deny' };
        const lower = url.toLowerCase();

        // 1. Completely suppress Spotify desktop protocol, fallback getapp, and support redirections
        if (
          lower.startsWith('spotify:') ||
          lower.includes('support.spotify.com') ||
          lower.includes('fallback=getapp') ||
          lower.includes('app_open_trigger') ||
          lower.includes('spotify.com/redirect') ||
          lower.includes('spotify.com/download') ||
          lower.includes('spclient.wg.spotify.com')
        ) {
          console.log('[Main] Suppressed Spotify playback/app window.open:', url);
          return { action: 'deny' };
        }

        // 2. Intercept OAuth / authentication popups into our hardened top-level Sign-In window
        if (isAuthUrl(url)) {
          openInteractiveAuthWindow({
            service: lower.includes('spotify') ? 'spotify' : 'youtube',
            url
          });
          return { action: 'deny' };
        }

        const parsed = new URL(url);

        // 3. Keep in-app navigation for legitimate web player pages
        if (
          (parsed.hostname === 'open.spotify.com' || parsed.hostname === 'music.youtube.com') &&
          !url.includes('fallback=getapp') &&
          !url.includes('app_open_trigger')
        ) {
          contents.loadURL(url);
          return { action: 'deny' };
        }

        // 4. External links (e.g., terms, privacy policy, external artist links) open in default system browser
        if (!lower.includes('spotify.com') && !lower.includes('youtube.com')) {
          shell.openExternal(url);
        }
      } catch (e) {
        console.warn('[Main] Window open handler caught:', e.message);
      }
      return { action: 'deny' };
    });

    // Intercept in-place navigations inside webviews so Google/Spotify logins open cleanly in a top-level hardened window
    contents.on('will-navigate', (e, reqUrl) => {
      if (!reqUrl || typeof reqUrl !== 'string') return;
      const lower = reqUrl.toLowerCase();

      // Block desktop protocol and support/getapp redirects
      if (
        lower.startsWith('spotify:') ||
        lower.includes('support.spotify.com') ||
        lower.includes('fallback=getapp') ||
        lower.includes('app_open_trigger')
      ) {
        e.preventDefault();
        console.log('[Main] Blocked webview navigation to:', reqUrl);
        return;
      }

      // Route Google / Spotify account login navigations out of <webview> (prevents embedded browser rejection)
      if (
        !lower.includes('/logout') &&
        (isGoogleAuthRequestUrl(reqUrl) ||
          (lower.includes('accounts.spotify.com') && (lower.includes('/login') || lower.includes('/authorize'))))
      ) {
        e.preventDefault();
        const svc = lower.includes('spotify') ? 'spotify' : 'youtube';
        console.log(`[Main] Routing webview login navigation (${svc}) into hardened Sign-In window.`);
        openInteractiveAuthWindow({ service: svc, url: reqUrl });
      }
    });
  }
});

// Window control IPC
ipcMain.handle('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});

ipcMain.handle('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('open-external', (event, url) => {
  if (url && typeof url === 'string') {
    shell.openExternal(url);
    return { success: true };
  }
  return { success: false };
});

ipcMain.handle('get-platform-info', () => ({
  platform: process.platform,
  isLinux: process.platform === 'linux',
  isMac: process.platform === 'darwin'
}));

ipcMain.handle('set-taskbar-progress', (event, progress) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      const val = typeof progress === 'number' ? progress : -1;
      mainWindow.setProgressBar(val);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
  return { success: false };
});

// App lifecycle
app.whenReady().then(async () => {
  // Initialize CastLabs Widevine CDM components
  if (components && typeof components.whenReady === 'function') {
    try {
      await components.whenReady();
      console.log('[Main] CastLabs Widevine CDM components initialized:', components.status());
    } catch (err) {
      console.warn('[Main] CastLabs components note:', err.message);
    }
  }

  // Configure shared browser storage partition for both YouTube Music & Spotify
  try {
    const s = session.fromPartition(SHARED_PARTITION);
    s.setUserAgent(CHROME_USER_AGENT);

    // Register identity hardening + Brave Shields preloads across all frames in shared partition
    const authPreloadPath = path.join(__dirname, 'src', 'js', 'auth-preload.js');
    const shieldsPreloadPath = path.join(__dirname, 'src', 'js', 'webview-shields.js');
    if (typeof s.registerPreloadScript === 'function') {
      try {
        s.registerPreloadScript({ id: 'brave-identity-hardening', type: 'frame', filePath: authPreloadPath });
        s.registerPreloadScript({ id: 'brave-shields-preload', type: 'frame', filePath: shieldsPreloadPath });
        console.log('[Main] Registered identity hardening + Brave Shields session preloads');
      } catch (err) {
        console.warn('[Main] Fallback to setPreloads:', err.message);
        if (typeof s.setPreloads === 'function') {
          s.setPreloads([authPreloadPath, shieldsPreloadPath]);
        }
      }
    } else if (typeof s.setPreloads === 'function') {
      s.setPreloads([authPreloadPath, shieldsPreloadPath]);
    }

    // Sanitize headers consistently: Firefox desktop on Google Auth hosts, authentic Chrome on player hosts
    s.webRequest.onBeforeSendHeaders((details, callback) => {
      const headers = details.requestHeaders;

      // Always strip Electron markers
      delete headers['X-Electron'];
      delete headers['x-electron'];

      if (isGoogleAuthRequestUrl(details.url)) {
        headers['User-Agent'] = FIREFOX_USER_AGENT;
        delete headers['sec-ch-ua'];
        delete headers['sec-ch-ua-mobile'];
        delete headers['sec-ch-ua-platform'];
        delete headers['sec-ch-ua-platform-version'];
        delete headers['sec-ch-ua-arch'];
        delete headers['sec-ch-ua-bitness'];
        delete headers['sec-ch-ua-full-version-list'];
        delete headers['sec-ch-ua-model'];
      } else {
        headers['User-Agent'] = CHROME_USER_AGENT;
        headers['sec-ch-ua'] = `"Google Chrome";v="${CHROME_MAJOR_VERSION}", "Chromium";v="${CHROME_MAJOR_VERSION}", "Not?A_Brand";v="24"`;
        headers['sec-ch-ua-mobile'] = '?0';
        headers['sec-ch-ua-platform'] = '"Linux"';
        headers['sec-ch-ua-platform-version'] = '"6.8.0"';
        headers['sec-ch-ua-arch'] = '"x86"';
        headers['sec-ch-ua-bitness'] = '"64"';
        headers['sec-ch-ua-full-version-list'] = `"Google Chrome";v="${CHROME_FULL_VERSION}", "Chromium";v="${CHROME_FULL_VERSION}", "Not?A_Brand";v="24.0.0.0"`;
      }

      callback({ requestHeaders: headers });
    });

    // Auto-grant mediaKeySystem for Widevine DRM and audio/video playback
    s.setPermissionRequestHandler((webContents, permission, callback) => {
      const allowed = ['mediaKeySystem', 'media', 'audioCapture', 'notifications', 'pointerLock'];
      callback(allowed.includes(permission));
    });
  } catch (e) {
    console.warn('[Main] Session config warning for', SHARED_PARTITION, e.message);
  }

  // Restore persisted authentic YouTube Music session and bind hardened Sign-In window launcher
  try {
    const ytmDevtoolsAuthService = require('./backend/services/YTMDevtoolsAuthService');
    ytmDevtoolsAuthService.registerInteractiveAuthLauncher({
      open: openInteractiveAuthWindow,
      close: closeInteractiveAuthWindow
    });
    const restored = await ytmDevtoolsAuthService.loadPersistedSession();
    if (restored) {
      console.log('[Main] Restored active YouTube Music session into persist:bravemusic partition.');
    }
  } catch (err) {
    console.warn('[Main] Startup session restore notice:', err.message);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  backend.shutdown();
  if (process.platform !== 'darwin') app.quit();
});

process.on('SIGINT', () => {
  backend.shutdown();
  app.quit();
});

process.on('SIGTERM', () => {
  backend.shutdown();
  app.quit();
});
