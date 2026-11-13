const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const http = require('http');
const WebSocket = require('ws');
let session = null;
let app = null;
try {
  const electron = require('electron');
  session = electron.session;
  app = electron.app;
} catch (e) {}

const SHARED_PARTITION = 'persist:bravemusic';

class YTMDevtoolsAuthService {
  constructor() {
    this.userDataPath = app 
      ? app.getPath('userData') 
      : path.join(process.env.HOME || os.homedir(), '.config', 'brave-music');
    
    if (!fs.existsSync(this.userDataPath)) {
      try { fs.mkdirSync(this.userDataPath, { recursive: true }); } catch (e) {}
    }

    this.ytmProfileDir = path.join(this.userDataPath, 'ytm-auth-profile');
    this.spotifyProfileDir = path.join(this.userDataPath, 'spotify-auth-profile');
    this.ytmSessionPath = path.join(this.userDataPath, 'ytmusic_session.json');
    this.spotifySessionPath = path.join(this.userDataPath, 'spotify_session.json');
    this.accountsPath = path.join(this.userDataPath, 'user_accounts.json');
    this.savedSessionPath = this.ytmSessionPath; // Backwards-compatible alias

    this.activeProcess = null;
    this.activeWs = null;
    this.activePollInterval = null;
    this.loginAttemptId = 0;
    this.statusListeners = new Set();
  }

  onStatus(callback) {
    this.statusListeners.add(callback);
    return () => this.statusListeners.delete(callback);
  }

  _notify(type, data) {
    for (const cb of this.statusListeners) {
      try { cb({ type, ...data }); } catch (e) {}
    }
  }

  // Find an available free TCP port
  async getFreePort() {
    return new Promise((resolve, reject) => {
      const srv = net.createServer();
      srv.listen(0, '127.0.0.1', () => {
        const port = srv.address().port;
        srv.close(() => resolve(port));
      });
      srv.on('error', reject);
    });
  }

  // Detect installed browsers in priority order (cross-platform Windows & Linux)
  detectBrowsers() {
    const list = [];
    const isWin = process.platform === 'win32';
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const progFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const progFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    // Google Chrome
    const chromeCandidates = isWin ? [
      path.join(progFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(progFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe')
    ] : [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome-beta'
    ];
    for (const bin of chromeCandidates) {
      if (bin && fs.existsSync(bin)) {
        list.push({ id: 'chrome', name: 'Google Chrome', path: bin });
        break;
      }
    }

    // Brave Browser
    const braveCandidates = isWin ? [
      path.join(progFiles, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
      path.join(progFilesX86, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
      path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe')
    ] : [
      '/snap/bin/brave',
      '/usr/bin/brave-browser',
      '/usr/bin/brave',
      '/var/lib/snapd/snap/bin/brave'
    ];
    for (const bin of braveCandidates) {
      if (bin && fs.existsSync(bin)) {
        list.push({ id: 'brave', name: 'Brave Browser', path: bin });
        break;
      }
    }

    // Microsoft Edge
    const edgeCandidates = isWin ? [
      path.join(progFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(progFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    ] : [
      '/usr/bin/microsoft-edge',
      '/usr/bin/microsoft-edge-stable'
    ];
    for (const bin of edgeCandidates) {
      if (bin && fs.existsSync(bin)) {
        list.push({ id: 'edge', name: 'Microsoft Edge', path: bin });
        break;
      }
    }

    // Chromium
    const chromiumCandidates = isWin ? [
      path.join(localAppData, 'Chromium', 'Application', 'chrome.exe'),
      path.join(progFiles, 'Chromium', 'Application', 'chrome.exe')
    ] : [
      '/snap/bin/chromium',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser'
    ];
    for (const bin of chromiumCandidates) {
      if (bin && fs.existsSync(bin)) {
        list.push({ id: 'chromium', name: 'Chromium', path: bin });
        break;
      }
    }

    return list;
  }

  resolveBrowserBinary(preferredId = 'auto') {
    const detected = this.detectBrowsers();
    if (detected.length === 0) {
      throw new Error('No compatible browser (Google Chrome, Brave, Chromium) found installed on your system.');
    }

    if (preferredId && preferredId !== 'auto') {
      const match = detected.find(b => b.id === preferredId || b.id.includes(preferredId));
      if (match) return match;
    }

    // Default to Google Chrome or Brave
    return detected[0];
  }

  // =========================================================================
  // IN-BROWSER SESSION MEMORY & AUTHENTICATION FLOW
  // =========================================================================

  async syncFromBrowserMemory(targetService = 'all') {
    if (!session) return { ytm: false, spotify: false, ytmCount: 0, spotifyCount: 0 };
    const s = session.fromPartition(SHARED_PARTITION);
    if (!s) return { ytm: false, spotify: false, ytmCount: 0, spotifyCount: 0 };

    let allCookies = [];
    try {
      allCookies = await s.cookies.get({});
    } catch (e) {
      return { ytm: false, spotify: false, ytmCount: 0, spotifyCount: 0 };
    }

    const ytmCookies = allCookies.filter((c) => {
      const d = (c.domain || '').toLowerCase();
      return (
        d.includes('youtube.com') ||
        d.includes('google.com') ||
        d.includes('googleusercontent.com') ||
        d.includes('gstatic.com')
      );
    });

    const spotifyCookies = allCookies.filter((c) => {
      const d = (c.domain || '').toLowerCase();
      return (
        d.includes('spotify.com') ||
        d.includes('spotifycdn.com') ||
        d.includes('scdn.co')
      );
    });

    const hasYtmLogin =
      ytmCookies.some((c) => c.name === 'LOGIN_INFO' || c.name === '__Secure-3PAPISID') ||
      (ytmCookies.some((c) => c.name === 'SAPISID') && ytmCookies.some((c) => c.name === 'SID'));

    const hasSpotifyLogin =
      spotifyCookies.some((c) => c.name === 'sp_dc') ||
      (spotifyCookies.some((c) => c.name === 'sp_key') && spotifyCookies.some((c) => c.name === 'sp_t'));

    const checkYtm = targetService === 'all' || targetService === 'youtube' || targetService === 'ytmusic';
    const checkSpotify = targetService === 'all' || targetService === 'spotify';

    if ((checkYtm && hasYtmLogin) || (checkSpotify && hasSpotifyLogin)) {
      try {
        if (typeof s.cookies.flushStore === 'function') {
          await s.cookies.flushStore();
        }
      } catch (e) {}
    }

    const accounts = this.getSavedAccounts();

    if (checkYtm && hasYtmLogin && ytmCookies.length > 0) {
      try {
        fs.writeFileSync(this.ytmSessionPath, JSON.stringify(ytmCookies, null, 2), { mode: 0o600 });
      } catch (e) {}
      if (!accounts.youtube || !accounts.youtube.authenticated) {
        this.saveUserAccount('youtube', {
          name: accounts.youtube?.name || 'YouTube Music Account',
          email: accounts.youtube?.email || 'Active Google Session',
          avatar: accounts.youtube?.avatar || '',
          authenticated: true,
          source: 'browser-memory'
        });
      }
    }

    if (checkSpotify && hasSpotifyLogin && spotifyCookies.length > 0) {
      try {
        fs.writeFileSync(this.spotifySessionPath, JSON.stringify(spotifyCookies, null, 2), { mode: 0o600 });
      } catch (e) {}
      if (!accounts.spotify || !accounts.spotify.authenticated) {
        this.saveUserAccount('spotify', {
          name: accounts.spotify?.name || 'Spotify Account',
          email: accounts.spotify?.email || 'Active Spotify Session',
          avatar: accounts.spotify?.avatar || '',
          authenticated: true,
          source: 'browser-memory'
        });
      }
    }

    return {
      ytm: hasYtmLogin,
      spotify: hasSpotifyLogin,
      ytmCount: ytmCookies.length,
      spotifyCount: spotifyCookies.length
    };
  }

  async startCdpLogin(service = 'youtube', preferredBrowser = 'auto') {
    this.cancelCdpLogin();
    const attemptId = this.loginAttemptId;
    const normalizedService = (service || 'youtube').toLowerCase() === 'spotify' ? 'spotify' : 'youtube';
    this.activeLoginService = normalizedService;
    const isSpotify = normalizedService === 'spotify';
    const useInAppOnly = preferredBrowser === 'in-app';

    const authSyncService = require('./AuthSyncService');
    const targetUrl = isSpotify
      ? 'https://accounts.spotify.com/en/login?continue=https%3A%2F%2Fopen.spotify.com%2F'
      : 'https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fmusic.youtube.com%2F';

    let browserLabel = 'default browser';
    if (!useInAppOnly) {
      try {
        const rawTarget = authSyncService.getDefaultBrowserTarget() || 'browser';
        browserLabel = rawTarget.split(':')[0] || 'default browser';
      } catch (e) {}

      const opened = await authSyncService.openInDefaultBrowser(targetUrl);
      if (!opened.success) {
        console.warn('[Auth] openInDefaultBrowser notice:', opened.error);
      }

      this._notify('status', {
        service: normalizedService,
        state: 'waiting_login',
        message: `Opened your ${browserLabel} browser for sign-in. Brave Music will automatically sync your session into browser memory.`
      });
    } else {
      this._notify('status', {
        service: normalizedService,
        state: 'waiting_login',
        message: `Sign in directly inside Brave Music (${isSpotify ? 'Spotify' : 'YouTube Music'} tab). Session will be saved in browser memory.`
      });
    }

    const deadline = Date.now() + 300000;
    let lastError = '';

    while (Date.now() < deadline && attemptId === this.loginAttemptId) {
      // 1. When triggered from Brave Music Sign-In modal, extract from Default Browser & sync into browser memory
      if (!useInAppOnly) {
        try {
          const result = await authSyncService.extractDefaultBrowserCookies(normalizedService);
          if (result && result.success && Array.isArray(result.cookies) && result.cookies.length > 0) {
            const cookies = result.cookies;
            const hasServiceLogin = isSpotify
              ? cookies.some((c) => c.name === 'sp_dc') ||
                (cookies.some((c) => c.name === 'sp_key') && cookies.some((c) => c.name === 'sp_t'))
              : cookies.some((c) => c.name === 'LOGIN_INFO' || c.name === '__Secure-3PAPISID') ||
                (cookies.some((c) => c.name === 'SAPISID') && cookies.some((c) => c.name === 'SID'));

            if (hasServiceLogin && attemptId === this.loginAttemptId) {
              const applied = await this._injectCdpCookies(cookies, normalizedService);
              if (applied && applied.success) {
                const account = this.saveUserAccount(normalizedService, {
                  name: isSpotify ? 'Spotify Account' : 'Google Account',
                  email: isSpotify ? 'Active Spotify Session' : 'Active Google Session',
                  authenticated: true,
                  source: 'default-browser'
                });
                this._notify('status', {
                  service: normalizedService,
                  state: 'complete',
                  count: applied.count,
                  message: 'Sign-in complete! Default browser session synced into Brave Music browser memory.'
                });
                return { ...applied, account: account.account };
              }
            }
          } else if (result && result.error) {
            lastError = result.error;
          }
        } catch (err) {
          lastError = err.message || String(err);
        }
      }

      // 2. Also check in-app browser session memory (if user signed in inside webview or imported cookies)
      const memState = await this.syncFromBrowserMemory(normalizedService);
      const isLoggedIn = isSpotify ? memState.spotify : memState.ytm;
      const cookieCount = isSpotify ? memState.spotifyCount : memState.ytmCount;

      if (isLoggedIn && attemptId === this.loginAttemptId) {
        const account = this.saveUserAccount(normalizedService, {
          name: isSpotify ? 'Spotify Account' : 'YouTube Music Account',
          email: isSpotify ? 'Active Spotify Session' : 'Active Google Session',
          authenticated: true,
          source: 'browser-memory'
        });
        this._notify('status', {
          service: normalizedService,
          state: 'complete',
          count: cookieCount,
          message: 'Sign-in complete! Session saved in Brave Music browser memory.'
        });
        return {
          success: true,
          service: normalizedService,
          count: cookieCount,
          hasLogin: true,
          account: account.account
        };
      }

      if (attemptId !== this.loginAttemptId) break;
      if (!useInAppOnly) {
        this._notify('status', {
          service: normalizedService,
          state: 'waiting_login',
          message: 'Waiting for sign-in in your default browser…'
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    if (attemptId !== this.loginAttemptId) throw new Error('Sign-in cancelled.');
    throw new Error(
      lastError
        ? `Sign-in timed out. Could not read default browser session (${lastError}). You can also use Emergency Cookies (.json) import.`
        : 'Sign-in timed out. Sign in via your default browser and try again, or import cookies.json.'
    );
  }

  async _waitForCdpTarget(port, timeoutMs = 20000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      if (!this.activeProcess) return null;
      try {
        const targets = await new Promise((resolve, reject) => {
          const req = http.get(`http://127.0.0.1:${port}/json/list`, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
              try { resolve(JSON.parse(data)); } catch (e) { resolve([]); }
            });
          });
          req.on('error', reject);
          req.setTimeout(1500, () => { req.destroy(); reject(new Error('timeout')); });
        });

        if (Array.isArray(targets) && targets.length > 0) {
          const page = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl) || targets[0];
          if (page && page.webSocketDebuggerUrl) {
            return page;
          }
        }
      } catch (e) {
        // Wait and retry
      }
      await new Promise(r => setTimeout(r, 600));
    }
    return null;
  }

  _connectAndPollCookies(wsUrl, port, service = 'youtube') {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      this.activeWs = ws;
      let msgId = 1;
      let isResolved = false;

      const cleanup = () => {
        if (this.activePollInterval) {
          clearInterval(this.activePollInterval);
          this.activePollInterval = null;
        }
        try { ws.close(); } catch (e) {}
        if (this.activeWs === ws) this.activeWs = null;
        if (this.activeProcess) {
          try { this.activeProcess.kill('SIGTERM'); } catch (e) {}
          this.activeProcess = null;
        }
      };

      ws.on('open', () => {
        console.log(`[CDP-Auth] WebSocket connected for ${service}:`, wsUrl);
        // Enable Network agent
        ws.send(JSON.stringify({ id: msgId++, method: 'Network.enable' }));

        // Poll Network.getAllCookies every 1200ms
        this.activePollInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ id: 100, method: 'Network.getAllCookies' }));
          }
        }, 1200);
      });

      ws.on('message', async (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.id === 100 && msg.result && Array.isArray(msg.result.cookies)) {
            const cookies = msg.result.cookies;
            let isAuthenticated = false;

            if (service === 'spotify') {
              const hasSpDc = cookies.some(c => c.name === 'sp_dc');
              const hasSpKey = cookies.some(c => c.name === 'sp_key');
              const hasSpT = cookies.some(c => c.name === 'sp_t');
              isAuthenticated = hasSpDc || (hasSpKey && hasSpT);
            } else {
              // YouTube Music
              const hasSecure3PAPISID = cookies.some(c => c.name === '__Secure-3PAPISID');
              const hasLoginInfo = cookies.some(c => c.name === 'LOGIN_INFO');
              const hasSapisid = cookies.some(c => c.name === 'SAPISID');
              const hasSid = cookies.some(c => c.name === 'SID');
              isAuthenticated = hasSecure3PAPISID || hasLoginInfo || (hasSapisid && hasSid);
            }

            if (isAuthenticated && !isResolved) {
              isResolved = true;
              this._notify('status', {
                service,
                state: 'syncing',
                message: `Authentication detected! Applying session...`
              });

              const result = await this._injectCdpCookies(cookies, service);
              cleanup();

              this._notify('status', {
                service,
                state: 'complete',
                count: result.count,
                message: `✓ Sign-in complete! Session applied.`
              });

              resolve(result);
            }
          }
        } catch (e) {
          console.warn('[CDP-Auth] Error processing WebSocket message:', e.message);
        }
      });

      ws.on('error', (err) => {
        console.warn('[CDP-Auth] WebSocket error:', err.message);
        if (!isResolved) {
          cleanup();
          reject(err);
        }
      });

      // 5-minute safety timeout
      setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          reject(new Error('Authentication timed out after 5 minutes.'));
        }
      }, 300000);
    });
  }

  cancelCdpLogin(service) {
    this.loginAttemptId++;
    const targetService = service || this.activeLoginService || 'youtube';
    if (this.activePollInterval) {
      clearInterval(this.activePollInterval);
      this.activePollInterval = null;
    }
    if (this.activeWs) {
      try { this.activeWs.close(); } catch (e) {}
      this.activeWs = null;
    }
    if (this.activeProcess) {
      try { this.activeProcess.kill('SIGKILL'); } catch (e) {}
      this.activeProcess = null;
    }
    this._notify('status', { service: targetService, state: 'cancelled', message: 'Sign-in cancelled.' });
    this.activeLoginService = null;
  }

  // =========================================================================
  // COOKIE INJECTION & PERSISTENCE
  // =========================================================================

  _extractCookieHost(c) {
    if (c && c.domain) {
      return String(c.domain).toLowerCase().replace(/^\./, '');
    }
    if (c && c.url) {
      try {
        return new URL(c.url).hostname.toLowerCase();
      } catch (e) {}
    }
    return '';
  }

  async _injectCdpCookies(cdpCookies, targetService = 'youtube') {
    let service = targetService;
    // Auto-detect service from cookies if not clearly specified
    const hasSpotifyCookies = cdpCookies.some(c => {
      const d = this._extractCookieHost(c);
      return d.includes('spotify.com') || c.name === 'sp_dc';
    });
    if (hasSpotifyCookies && (!targetService || targetService === 'spotify')) {
      service = 'spotify';
    }

    const isSpotify = service === 'spotify';
    const relevantCookies = [];

    for (const c of cdpCookies) {
      const d = this._extractCookieHost(c);
      if (isSpotify) {
        if (
          d.includes('spotify.com') ||
          d.includes('spotifycdn.com') ||
          d.includes('scdn.co')
        ) {
          relevantCookies.push(c);
        }
      } else {
        if (
          d.includes('youtube.com') ||
          d.includes('google.com') ||
          d.includes('googleusercontent.com') ||
          d.includes('gstatic.com') ||
          d.includes('doubleclick.net')
        ) {
          relevantCookies.push(c);
        }
      }
    }

    const partitions = [];
    if (session) {
      partitions.push(session.fromPartition(SHARED_PARTITION));
      if (session.defaultSession) partitions.push(session.defaultSession);
    }

    let injectedCount = 0;

    for (const c of relevantCookies) {
      const rawDomain = (c.domain || '').toLowerCase();
      const hostFromUrl = this._extractCookieHost(c);
      const domainCookieRoots = ['youtube.com', 'google.com', 'googleusercontent.com', 'gstatic.com', 'spotify.com', 'spotifycdn.com', 'scdn.co'];
      const isHostPrefix = c.name && c.name.startsWith('__Host-');
      const isDomain = !isHostPrefix && (rawDomain.startsWith('.') || domainCookieRoots.includes(rawDomain));
      const cleanDomain = isDomain 
        ? (rawDomain.startsWith('.') ? rawDomain.substring(1) : rawDomain)
        : (hostFromUrl || c.domain || (isSpotify ? 'open.spotify.com' : 'music.youtube.com'));
      const isSecurePrefix = c.name && c.name.startsWith('__Secure-');
      const isSecure = c.secure || isHostPrefix || isSecurePrefix;
      const protocol = isSecure ? 'https://' : 'http://';
      const cookieUrl = c.url || `${protocol}${cleanDomain}${c.path || '/'}`;

      let sameSite = 'unspecified';
      const rawSameSite = (c.sameSite || '').toLowerCase();
      if (rawSameSite === 'strict') sameSite = 'strict';
      else if (rawSameSite === 'lax') sameSite = 'lax';
      else if (rawSameSite === 'no_restriction' || rawSameSite === 'none') {
        sameSite = isSecure ? 'no_restriction' : 'unspecified';
      }

      const cookieObj = {
        url: cookieUrl,
        name: c.name,
        value: c.value,
        path: isHostPrefix ? '/' : (c.path || '/'),
        secure: isSecure,
        httpOnly: !!c.httpOnly,
        sameSite: sameSite
      };

      if (!isHostPrefix && isDomain) {
        cookieObj.domain = `.${cleanDomain}`;
      }

      if (c.expires && c.expires > 0) {
        cookieObj.expirationDate = Math.min(Math.floor(c.expires), 2147483647);
      } else if (c.expirationDate && c.expirationDate > 0) {
        cookieObj.expirationDate = Math.min(Math.floor(c.expirationDate), 2147483647);
      }

      for (const s of partitions) {
        try {
          if (isDomain) {
            await s.cookies.remove(cookieUrl, c.name).catch(() => {});
          }
          await s.cookies.set(cookieObj);
        } catch (setErr) {
          if (isDomain) {
            throw new Error(`Could not apply domain cookie ${c.name}: ${setErr.message}`);
          }
          try {
            const fallback = {
              url: cookieUrl,
              name: c.name,
              value: c.value,
              path: c.path || '/',
              secure: isSecure
            };
            await s.cookies.set(fallback);
          } catch (e2) {}
        }
      }
      injectedCount++;
    }

    for (const s of partitions) {
      try {
        if (typeof s.cookies.flushStore === 'function') {
          await s.cookies.flushStore();
        }
      } catch (e) {}
    }

    // Save persistent backup snapshot for instant startup loading
    const sessionFilePath = isSpotify ? this.spotifySessionPath : this.ytmSessionPath;
    try {
      fs.writeFileSync(sessionFilePath, JSON.stringify(relevantCookies, null, 2), { mode: 0o600 });
      console.log(`[CDP-Auth] Saved ${relevantCookies.length} cookies snapshot to ${sessionFilePath}`);
    } catch (e) {
      console.warn('[CDP-Auth] Error saving session snapshot:', e.message);
    }

    // Automatically record and persist the saved user account
    try {
      this.saveUserAccount(service, {
        name: isSpotify ? 'Spotify Account' : 'YouTube Music Account',
        email: isSpotify ? 'Active Spotify Session' : 'Active Google Session',
        authenticated: true,
        source: 'cdp'
      });
    } catch (e) {}

    return {
      success: true,
      service,
      count: injectedCount,
      hasLogin: true,
      message: `Successfully applied ${injectedCount} session cookies!`
    };
  }

  // Get all saved user accounts (with automatic session cookie backfill)
  getSavedAccounts() {
    let accounts = {};
    try {
      if (fs.existsSync(this.accountsPath)) {
        accounts = JSON.parse(fs.readFileSync(this.accountsPath, 'utf8')) || {};
      }
    } catch (e) {
      console.warn('[CDP-Auth] Error reading user_accounts.json:', e.message);
      accounts = {};
    }

    // Auto-detect and synthesize saved accounts if session cookies exist but no account record was written
    let needsSave = false;
    const hasYtmSession = fs.existsSync(this.ytmSessionPath);
    if (hasYtmSession && (!accounts.youtube || !accounts.youtube.authenticated)) {
      accounts.youtube = {
        service: 'youtube',
        name: accounts.youtube?.name || 'YouTube Music Account',
        email: accounts.youtube?.email || 'Active Google Session',
        avatar: accounts.youtube?.avatar || '',
        authenticated: true,
        lastLogin: accounts.youtube?.lastLogin || Date.now(),
        source: 'session'
      };
      needsSave = true;
    }

    const hasSpotifySession = fs.existsSync(this.spotifySessionPath);
    if (hasSpotifySession && (!accounts.spotify || !accounts.spotify.authenticated)) {
      accounts.spotify = {
        service: 'spotify',
        name: accounts.spotify?.name || 'Spotify Account',
        email: accounts.spotify?.email || 'Active Spotify Session',
        avatar: accounts.spotify?.avatar || '',
        authenticated: true,
        lastLogin: accounts.spotify?.lastLogin || Date.now(),
        source: 'session'
      };
      needsSave = true;
    }

    if (needsSave) {
      try {
        fs.writeFileSync(this.accountsPath, JSON.stringify(accounts, null, 2), { mode: 0o600 });
      } catch (e) {}
    }

    return accounts;
  }

  // Save / Update a user account record persistently
  saveUserAccount(service, data = {}) {
    if (!service) return { success: false, error: 'No service specified' };
    const svc = (service === 'ytmusic' || service === 'youtube') ? 'youtube' : 'spotify';
    const accounts = this.getSavedAccounts();

    const current = accounts[svc] || {};
    accounts[svc] = {
      ...current,
      service: svc,
      name: (data.name && data.name.trim()) ? data.name.trim() : (current.name || (svc === 'youtube' ? 'YouTube Music Account' : 'Spotify Account')),
      email: (data.email && data.email.trim()) ? data.email.trim() : (current.email || (svc === 'youtube' ? 'Active Google Session' : 'Active Spotify Session')),
      avatar: (data.avatar && data.avatar.trim()) ? data.avatar.trim() : (current.avatar || ''),
      authenticated: data.authenticated !== undefined ? !!data.authenticated : true,
      lastLogin: Date.now(),
      source: data.source || current.source || 'user'
    };

    try {
      fs.writeFileSync(this.accountsPath, JSON.stringify(accounts, null, 2), { mode: 0o600 });
      console.log(`[CDP-Auth] Successfully saved account record for ${svc} to ${this.accountsPath}`);
      this._notify('account-saved', { service: svc, account: accounts[svc] });
      return { success: true, service: svc, account: accounts[svc] };
    } catch (e) {
      console.warn('[CDP-Auth] Failed to write user_accounts.json:', e.message);
      return { success: false, error: e.message };
    }
  }

  // Remove a saved user account on signout
  removeUserAccount(service = 'all') {
    const accounts = this.getSavedAccounts();
    if (service === 'all') {
      accounts.youtube = { authenticated: false };
      accounts.spotify = { authenticated: false };
    } else {
      const svc = (service === 'ytmusic' || service === 'youtube') ? 'youtube' : 'spotify';
      accounts[svc] = { authenticated: false };
    }

    try {
      fs.writeFileSync(this.accountsPath, JSON.stringify(accounts, null, 2), { mode: 0o600 });
      console.log(`[CDP-Auth] Cleared saved account for ${service}`);
    } catch (e) {}
    return { success: true, service };
  }

  // Load saved session on application launch so user stays logged in
  async loadPersistedSession() {
    let ytmRestored = false;
    let spotifyRestored = false;

    const sharedSession = session ? session.fromPartition(SHARED_PARTITION) : null;
    const hasLiveCookies = async (domain, names) => {
      if (!sharedSession) return false;
      try {
        const cookies = await sharedSession.cookies.get({ domain });
        return cookies.some((cookie) => names.includes(cookie.name));
      } catch (error) {
        return false;
      }
    };

    // 1. YouTube Music
    if (fs.existsSync(this.ytmSessionPath)) {
      try {
        const alreadyAuthenticated = await hasLiveCookies('youtube.com', ['LOGIN_INFO']);
        if (alreadyAuthenticated) {
          ytmRestored = true;
        } else {
          const raw = fs.readFileSync(this.ytmSessionPath, 'utf8');
          const cookies = JSON.parse(raw);
          if (Array.isArray(cookies) && cookies.length > 0) {
            await this._injectCdpCookies(cookies, 'youtube');
            console.log(`[CDP-Auth] Restored ${cookies.length} persisted YouTube Music cookies on startup.`);
            ytmRestored = true;
          }
        }
      } catch (e) {
        console.warn('[CDP-Auth] Error restoring YouTube session:', e.message);
      }
    }

    // 2. Spotify
    if (fs.existsSync(this.spotifySessionPath)) {
      try {
        const alreadyAuthenticated = await hasLiveCookies('spotify.com', ['sp_dc']);
        if (alreadyAuthenticated) {
          spotifyRestored = true;
        } else {
          const raw = fs.readFileSync(this.spotifySessionPath, 'utf8');
          const cookies = JSON.parse(raw);
          if (Array.isArray(cookies) && cookies.length > 0) {
            await this._injectCdpCookies(cookies, 'spotify');
            console.log(`[CDP-Auth] Restored ${cookies.length} persisted Spotify cookies on startup.`);
            spotifyRestored = true;
          }
        }
      } catch (e) {
        console.warn('[CDP-Auth] Error restoring Spotify session:', e.message);
      }
    }

    // Ensure user_accounts.json is consistent
    this.getSavedAccounts();

    return { ytm: ytmRestored, spotify: spotifyRestored };
  }

  // Check live cookie authentication status for both services
  async getServiceAuthStatus() {
    let hasYtm = false;
    let hasSpotify = false;

    try {
      const memState = await this.syncFromBrowserMemory('all');
      hasYtm = !!memState.ytm;
      hasSpotify = !!memState.spotify;
    } catch (e) {}

    const savedAccounts = this.getSavedAccounts();
    if (!hasYtm && savedAccounts.youtube?.authenticated && fs.existsSync(this.ytmSessionPath)) {
      hasYtm = true;
    }
    if (!hasSpotify && savedAccounts.spotify?.authenticated && fs.existsSync(this.spotifySessionPath)) {
      hasSpotify = true;
    }

    return {
      youtube: { authenticated: hasYtm, account: savedAccounts.youtube },
      ytmusic: { authenticated: hasYtm, account: savedAccounts.youtube },
      spotify: { authenticated: hasSpotify, account: savedAccounts.spotify }
    };
  }

  // Logout / clear session
  async logoutService(service = 'all') {
    const s = session ? session.fromPartition(SHARED_PARTITION) : null;

    if (service === 'youtube' || service === 'ytmusic' || service === 'all') {
      try {
        if (fs.existsSync(this.ytmSessionPath)) fs.unlinkSync(this.ytmSessionPath);
        this.removeUserAccount('youtube');
        if (s) {
          const cookies = await s.cookies.get({});
          for (const c of cookies) {
            const d = (c.domain || '').toLowerCase();
            if (d.includes('youtube.com') || d.includes('google.com')) {
              const url = `${c.secure ? 'https://' : 'http://'}${c.domain.startsWith('.') ? c.domain.slice(1) : c.domain}${c.path || '/'}`;
              await s.cookies.remove(url, c.name).catch(() => {});
            }
          }
        }
      } catch (e) {}
    }

    if (service === 'spotify' || service === 'all') {
      try {
        if (fs.existsSync(this.spotifySessionPath)) fs.unlinkSync(this.spotifySessionPath);
        this.removeUserAccount('spotify');
        if (s) {
          const cookies = await s.cookies.get({});
          for (const c of cookies) {
            const d = (c.domain || '').toLowerCase();
            if (d.includes('spotify.com') || d.includes('scdn.co') || d.includes('spotifycdn.com')) {
              const url = `${c.secure ? 'https://' : 'http://'}${c.domain.startsWith('.') ? c.domain.slice(1) : c.domain}${c.path || '/'}`;
              await s.cookies.remove(url, c.name).catch(() => {});
            }
          }
        }
      } catch (e) {}
    }

    if (s && typeof s.cookies.flushStore === 'function') {
      try { await s.cookies.flushStore(); } catch (e) {}
    }

    return { success: true, service };
  }

  // =========================================================================
  // JSON COOKIES IMPORT (CLEAN FILE IMPORT)
  // =========================================================================

  async importCookiesJson(service = 'youtube', rawInput) {
    if (!rawInput) {
      throw new Error('Please select a valid cookies.json file.');
    }

    let parsed = [];
    if (typeof rawInput === 'string') {
      try {
        const json = JSON.parse(rawInput);
        parsed = Array.isArray(json) ? json : (json.cookies || [json]);
      } catch (e) {
        throw new Error('Could not parse JSON cookies file: ' + e.message);
      }
    } else if (Array.isArray(rawInput)) {
      parsed = rawInput;
    } else if (rawInput && Array.isArray(rawInput.cookies)) {
      parsed = rawInput.cookies;
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('No cookie items found in the selected JSON file.');
    }

    return this._injectCdpCookies(parsed, service);
  }

  // Backwards-compatible Netscape format parser
  parseNetscapeCookies(content) {
    const lines = content.split('\n');
    const cookies = [];

    for (const line of lines) {
      let trimmed = line.trim();
      if (!trimmed) continue;

      let isHttpOnly = false;
      if (trimmed.startsWith('#HttpOnly_')) {
        isHttpOnly = true;
        trimmed = trimmed.replace('#HttpOnly_', '');
      } else if (trimmed.startsWith('#')) {
        continue;
      }

      const parts = trimmed.split('\t');
      if (parts.length < 7) continue;

      const [domain, flag, cookiePath, secure, expiry, name, value] = parts;
      if (!name || value === undefined) continue;

      cookies.push({
        domain,
        path: cookiePath,
        secure: secure.toUpperCase() === 'TRUE',
        expires: parseInt(expiry, 10),
        name: name.trim(),
        value: value.trim(),
        httpOnly: isHttpOnly
      });
    }
    return cookies;
  }

  async importCookiesText(rawText) {
    if (!rawText || typeof rawText !== 'string') {
      throw new Error('Please provide cookie content to import.');
    }

    let parsed = [];
    const trimmed = rawText.trim();

    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      return this.importCookiesJson('youtube', trimmed);
    }

    parsed = this.parseNetscapeCookies(trimmed);
    if (parsed.length === 0) {
      throw new Error('No valid cookies found in provided text.');
    }

    return this._injectCdpCookies(parsed, 'youtube');
  }
}

module.exports = new YTMDevtoolsAuthService();
