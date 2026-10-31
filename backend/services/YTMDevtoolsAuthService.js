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

    this.profileDir = path.join(this.userDataPath, 'ytm-auth-profile');
    this.savedSessionPath = path.join(this.userDataPath, 'ytmusic_session.json');

    this.activeProcess = null;
    this.activeWs = null;
    this.activePollInterval = null;
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

  // Detect installed browsers in priority order
  detectBrowsers() {
    const list = [];

    // Google Chrome
    const chromeCandidates = [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome-beta'
    ];
    for (const bin of chromeCandidates) {
      if (fs.existsSync(bin)) {
        list.push({ id: 'chrome', name: 'Google Chrome', path: bin });
        break;
      }
    }

    // Brave Browser
    const braveCandidates = [
      '/snap/bin/brave',
      '/usr/bin/brave-browser',
      '/usr/bin/brave',
      '/var/lib/snapd/snap/bin/brave'
    ];
    for (const bin of braveCandidates) {
      if (fs.existsSync(bin)) {
        list.push({ id: 'brave', name: 'Brave Browser', path: bin });
        break;
      }
    }

    // Chromium
    const chromiumCandidates = [
      '/snap/bin/chromium',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser'
    ];
    for (const bin of chromiumCandidates) {
      if (fs.existsSync(bin)) {
        list.push({ id: 'chromium', name: 'Chromium', path: bin });
        break;
      }
    }

    // Microsoft Edge
    if (fs.existsSync('/usr/bin/microsoft-edge')) {
      list.push({ id: 'edge', name: 'Microsoft Edge', path: '/usr/bin/microsoft-edge' });
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
  // CONTROLLED CDP (Chrome DevTools Protocol) AUTHENTICATION FLOW
  // =========================================================================

  async startCdpLogin(preferredBrowser = 'auto') {
    this.cancelCdpLogin();

    const browser = this.resolveBrowserBinary(preferredBrowser);
    const port = await this.getFreePort();

    if (!fs.existsSync(this.profileDir)) {
      try { fs.mkdirSync(this.profileDir, { recursive: true }); } catch (e) {}
    }

    this._notify('status', {
      state: 'launching',
      message: `Launching authentic ${browser.name} process on port ${port}...`
    });

    const args = [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${this.profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-sync',
      '--disable-background-networking',
      '--app=https://music.youtube.com'
    ];

    // Brave-specific flags to allow standard Google extension signin and unblock auth cookies
    if (browser.id === 'brave' || browser.path.includes('brave')) {
      args.push('--enable-features=AllowGoogleLoginForExtensions');
      args.push('--disable-brave-shields');
    }

    console.log(`[YTM-CDP] Spawning ${browser.name} with args:`, args.join(' '));

    const proc = spawn(browser.path, args, {
      detached: false,
      stdio: 'ignore'
    });

    this.activeProcess = proc;

    proc.on('exit', (code, signal) => {
      console.log(`[YTM-CDP] Browser process exited with code ${code}, signal ${signal}`);
      if (this.activeProcess === proc) {
        this.activeProcess = null;
      }
    });

    // Wait for CDP /json/list to become available
    const pageTarget = await this._waitForCdpTarget(port, 20000);
    if (!pageTarget) {
      throw new Error(`Browser did not respond to remote debugging protocol on port ${port}`);
    }

    this._notify('status', {
      state: 'waiting_login',
      message: `Browser opened at YouTube Music. Please click 'Sign in' and enter your Google account. Authenticating in real browser...`
    });

    // Connect WebSocket to page target
    return this._connectAndPollCookies(pageTarget.webSocketDebuggerUrl, port);
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

  _connectAndPollCookies(wsUrl, port) {
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
        console.log('[YTM-CDP] WebSocket connected to Chrome target:', wsUrl);
        // Enable Network agent
        ws.send(JSON.stringify({ id: msgId++, method: 'Network.enable' }));

        // Poll Network.getAllCookies every 1500ms
        this.activePollInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ id: 100, method: 'Network.getAllCookies' }));
          }
        }, 1500);
      });

      ws.on('message', async (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.id === 100 && msg.result && Array.isArray(msg.result.cookies)) {
            const cookies = msg.result.cookies;
            const hasSecure3PAPISID = cookies.some(c => c.name === '__Secure-3PAPISID');
            const hasLoginInfo = cookies.some(c => c.name === 'LOGIN_INFO');
            const hasSapisid = cookies.some(c => c.name === 'SAPISID');
            const hasSid = cookies.some(c => c.name === 'SID');

            const isAuthenticated = hasSecure3PAPISID || hasLoginInfo || (hasSapisid && hasSid);

            if (isAuthenticated && !isResolved) {
              isResolved = true;
              this._notify('status', {
                state: 'syncing',
                message: `Authentication detected (__Secure-3PAPISID / LOGIN_INFO)! Synchronizing session...`
              });

              const result = await this._injectCdpCookies(cookies);
              cleanup();

              this._notify('status', {
                state: 'complete',
                message: `Successfully synchronized ${result.count} cookies into Brave Music!`
              });

              resolve(result);
            }
          }
        } catch (e) {
          console.warn('[YTM-CDP] Error processing WebSocket message:', e.message);
        }
      });

      ws.on('error', (err) => {
        console.warn('[YTM-CDP] WebSocket error:', err.message);
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

  cancelCdpLogin() {
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
    this._notify('status', { state: 'cancelled', message: 'Sign-in cancelled.' });
  }

  // =========================================================================
  // COOKIE INJECTION & PERSISTENCE
  // =========================================================================

  async _injectCdpCookies(cdpCookies) {
    const relevantCookies = [];

    for (const c of cdpCookies) {
      const d = (c.domain || '').toLowerCase();
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

    const partitions = [
      session.fromPartition(SHARED_PARTITION),
      session.defaultSession
    ];

    let injectedCount = 0;

    for (const c of relevantCookies) {
      const isDomain = c.domain && c.domain.startsWith('.');
      const cleanDomain = isDomain ? c.domain.substring(1) : (c.domain || 'music.youtube.com');
      const isHostPrefix = c.name.startsWith('__Host-');
      const isSecurePrefix = c.name.startsWith('__Secure-');
      const isSecure = c.secure || isHostPrefix || isSecurePrefix;
      const protocol = isSecure ? 'https://' : 'http://';
      const cookieUrl = `${protocol}${cleanDomain}${c.path || '/'}`;

      const cookieObj = {
        url: cookieUrl,
        name: c.name,
        value: c.value,
        path: isHostPrefix ? '/' : (c.path || '/'),
        secure: isSecure,
        httpOnly: !!c.httpOnly,
        sameSite: c.sameSite === 'Strict' ? 'strict' : c.sameSite === 'Lax' ? 'lax' : 'no_restriction'
      };

      if (!isHostPrefix && isDomain) {
        cookieObj.domain = cleanDomain;
      }

      if (c.expires && c.expires > 0) {
        cookieObj.expirationDate = Math.min(Math.floor(c.expires), 2147483647);
      }

      for (const s of partitions) {
        try {
          await s.cookies.set(cookieObj);
        } catch (setErr) {
          if (cookieObj.domain) {
            try {
              const fallback = { ...cookieObj };
              delete fallback.domain;
              await s.cookies.set(fallback);
            } catch (e2) {}
          }
        }
      }
      injectedCount++;
    }

    // Save persistent backup snapshot for instant startup loading
    try {
      fs.writeFileSync(this.savedSessionPath, JSON.stringify(relevantCookies, null, 2), { mode: 0o600 });
    } catch (e) {
      console.warn('[YTM-CDP] Error saving session snapshot:', e.message);
    }

    return {
      success: true,
      count: injectedCount,
      hasLogin: true,
      message: `Successfully synchronized ${injectedCount} session cookies into Brave Music!`
    };
  }

  // Load saved session on application launch so user stays logged in
  async loadPersistedSession() {
    if (!fs.existsSync(this.savedSessionPath)) return false;
    try {
      const raw = fs.readFileSync(this.savedSessionPath, 'utf8');
      const cookies = JSON.parse(raw);
      if (Array.isArray(cookies) && cookies.length > 0) {
        await this._injectCdpCookies(cookies);
        console.log(`[YTM-CDP] Restored ${cookies.length} persisted session cookies on startup.`);
        return true;
      }
    } catch (e) {
      console.warn('[YTM-CDP] Error loading persisted session:', e.message);
    }
    return false;
  }

  // =========================================================================
  // GUIDED COOKIES.TXT IMPORT (FALLBACK)
  // =========================================================================

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
      // JSON format
      try {
        const json = JSON.parse(trimmed);
        parsed = Array.isArray(json) ? json : [json];
      } catch (e) {
        throw new Error('Invalid JSON cookie format: ' + e.message);
      }
    } else {
      // Netscape cookies.txt format
      parsed = this.parseNetscapeCookies(trimmed);
    }

    if (parsed.length === 0) {
      throw new Error('No valid cookies found in provided text. Make sure you paste Netscape or JSON format.');
    }

    const hasSecure3PAPISID = parsed.some(c => c.name === '__Secure-3PAPISID');
    const hasLoginInfo = parsed.some(c => c.name === 'LOGIN_INFO');
    const hasSapisid = parsed.some(c => c.name === 'SAPISID');

    if (!hasSecure3PAPISID && !hasLoginInfo && !hasSapisid) {
      console.warn('[YTM-CDP] Warning: cookies.txt did not contain __Secure-3PAPISID or LOGIN_INFO.');
    }

    return this._injectCdpCookies(parsed);
  }
}

module.exports = new YTMDevtoolsAuthService();
