const { app, components, BrowserWindow, ipcMain, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const backend = require('./backend');

// Standard Google Chrome Linux User-Agent matching underlying Chromium 146
const CHROME_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.7680.216 Safari/537.36';
const SHARED_PARTITION = 'persist:bravemusic';

// Set global fallback User-Agent so no internal Electron requests leak 'Electron'
app.userAgentFallback = CHROME_USER_AGENT;

// Natively remove AutomationControlled flag so navigator.webdriver is false
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');
app.commandLine.removeSwitch('enable-automation');

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

// Capability-Based System Browser Authentication Trigger
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
  const userDataDir = path.join(homeDir, '.config', 'brave-music');
  const targetCdmDir = path.join(userDataDir, 'WidevineCdm');
  const targetVerDir = path.join(targetCdmDir, cdmVersion);
  const targetPlatformDir = path.join(targetVerDir, '_platform_specific', 'linux_x64');
  const targetPointerFile = path.join(targetCdmDir, 'latest-component-updated-widevine-cdm');

  const candidateSources = [
    '/opt/brave-music/WidevineCdm',
    '/opt/google/chrome/WidevineCdm',
    path.join(homeDir, '.config', 'Codex', 'WidevineCdm', cdmVersion),
    path.join(homeDir, '.config', 'google-chrome', 'WidevineCdm', cdmVersion),
    '/usr/lib/chromium-browser/WidevineCdm',
    '/usr/lib/chromium/WidevineCdm'
  ];

  let sourceDir = null;
  for (const src of candidateSources) {
    if (fs.existsSync(src)) {
      sourceDir = src;
      break;
    }
  }

  try {
    fs.mkdirSync(targetPlatformDir, { recursive: true });

    // Locate and copy libwidevinecdm.so
    const libCandidates = [
      sourceDir ? path.join(sourceDir, '_platform_specific', 'linux_x64', 'libwidevinecdm.so') : null,
      sourceDir ? path.join(sourceDir, 'libwidevinecdm.so') : null,
      '/opt/google/chrome/WidevineCdm/_platform_specific/linux_x64/libwidevinecdm.so',
      path.join(homeDir, '.config', 'Codex', 'WidevineCdm', cdmVersion, '_platform_specific', 'linux_x64', 'libwidevinecdm.so')
    ].filter(Boolean);

    for (const lib of libCandidates) {
      if (fs.existsSync(lib)) {
        const dest = path.join(targetPlatformDir, 'libwidevinecdm.so');
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

    const installedLib = path.join(targetPlatformDir, 'libwidevinecdm.so');
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

// Flags for Widevine DRM, seamless autoplay and Wayland GPU stability
app.commandLine.appendSwitch('in-process-gpu');
app.commandLine.appendSwitch('enable-features', 'WidevineCdm');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
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
    icon: path.join(__dirname, 'src', 'assets', 'app-icon.svg')
  });

  // Initialize modular backend services & IPC
  backend.init({ mainWindow });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// Web Contents Creation Handler: intercept window.open in webviews and popup windows
app.on('web-contents-created', (event, contents) => {
  const musicSession = session.fromPartition(SHARED_PARTITION);

  // Apply genuine Google Chrome desktop User-Agent to every webContents and login popup
  contents.setUserAgent(CHROME_USER_AGENT);

  if (contents.getType() === 'webview') {
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

        // 2. System browser capability OAuth authentication
        if (isAuthUrl(url)) {
          openLoginModal(url, contents);
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

    // Intercept in-place navigations inside webviews (e.g. clicking 'Sign in')
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

      if (isAuthUrl(reqUrl)) {
        e.preventDefault();
        openLoginModal(reqUrl, contents);
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

    // Register Brave Shields proactive adblocker & glitch prevention preload
    const shieldsPreloadPath = path.join(__dirname, 'src', 'js', 'webview-shields.js');
    if (typeof s.registerPreloadScript === 'function') {
      try {
        s.registerPreloadScript({ type: 'frame', filePath: shieldsPreloadPath });
        console.log('[Main] Registered Brave Shields session preload script:', shieldsPreloadPath);
      } catch (err) {
        console.warn('[Main] Fallback to setPreloads:', err.message);
        if (typeof s.setPreloads === 'function') {
          s.setPreloads([shieldsPreloadPath]);
        }
      }
    } else if (typeof s.setPreloads === 'function') {
      s.setPreloads([shieldsPreloadPath]);
    }

    // Sanitize headers to look 100% like genuine Google Chrome on Linux
    s.webRequest.onBeforeSendHeaders((details, callback) => {
      const headers = details.requestHeaders;
      headers['User-Agent'] = CHROME_USER_AGENT;

      // Remove Electron identifier headers
      delete headers['X-Electron'];
      delete headers['x-electron'];

      // Google checks Client Hints (sec-ch-ua). Provide authentic Chrome 146 client hints
      headers['sec-ch-ua'] = '"Google Chrome";v="146", "Chromium";v="146", "Not?A_Brand";v="24"';
      headers['sec-ch-ua-mobile'] = '?0';
      headers['sec-ch-ua-platform'] = '"Linux"';
      headers['sec-ch-ua-platform-version'] = '"6.8.0"';
      headers['sec-ch-ua-arch'] = '"x86"';
      headers['sec-ch-ua-bitness'] = '"64"';
      headers['sec-ch-ua-full-version-list'] = '"Google Chrome";v="146.0.7680.216", "Chromium";v="146.0.7680.216", "Not?A_Brand";v="24.0.0.0"';

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

  // Restore persisted authentic YouTube Music session into persist:bravemusic
  try {
    const ytmDevtoolsAuthService = require('./backend/services/YTMDevtoolsAuthService');
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
