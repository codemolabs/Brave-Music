const http = require('http');
const url = require('url');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
let shell = null;
let safeStorage = null;
let app = null;
try {
  const electron = require('electron');
  shell = electron.shell;
  safeStorage = electron.safeStorage;
  app = electron.app;
} catch (e) {}

class OAuthPKCEService {
  constructor() {
    this.userDataPath = app 
      ? app.getPath('userData') 
      : path.join(process.env.HOME || os.homedir(), '.config', 'brave-music');
    
    if (!fs.existsSync(this.userDataPath)) {
      try { fs.mkdirSync(this.userDataPath, { recursive: true }); } catch (e) {}
    }

    this.vaultPath = path.join(this.userDataPath, 'auth_vault.enc');
    this.activeLoopbackServer = null;
  }

  // =========================================================================
  // PKCE (RFC 7636) HELPERS
  // =========================================================================

  generateCodeVerifier() {
    // 64 bytes of cryptographically random data base64url encoded
    return crypto.randomBytes(48).toString('base64url');
  }

  generateCodeChallenge(verifier) {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
  }

  generateState() {
    return crypto.randomBytes(16).toString('hex');
  }

  // =========================================================================
  // SECURE TOKEN VAULT (safeStorage + AES-256-GCM fallback)
  // =========================================================================

  _getFallbackKey() {
    let machineId = '';
    try { machineId = fs.readFileSync('/etc/machine-id', 'utf8').trim(); } catch (e) {}
    if (!machineId) {
      try { machineId = fs.readFileSync('/var/lib/dbus/machine-id', 'utf8').trim(); } catch (e) {}
    }
    const seed = machineId || os.hostname() + '-' + os.userInfo().username;
    return crypto.createHash('sha256').update(seed + '-brave-music-key-2026').digest();
  }

  _encrypt(plainText) {
    if (safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()) {
      try {
        const encrypted = safeStorage.encryptString(plainText);
        return { mode: 'safeStorage', data: encrypted.toString('base64') };
      } catch (e) {
        console.warn('[OAuthPKCE] safeStorage encrypt failed, using fallback:', e.message);
      }
    }

    const key = this._getFallbackKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let enc = cipher.update(plainText, 'utf8', 'base64');
    enc += cipher.final('base64');
    const tag = cipher.getAuthTag();
    return {
      mode: 'aes-256-gcm',
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      data: enc
    };
  }

  _decrypt(obj) {
    if (!obj || !obj.data) return null;
    if (obj.mode === 'safeStorage') {
      try {
        const buf = Buffer.from(obj.data, 'base64');
        return safeStorage.decryptString(buf);
      } catch (e) {
        console.warn('[OAuthPKCE] safeStorage decrypt failed:', e.message);
        return null;
      }
    }
    if (obj.mode === 'aes-256-gcm') {
      try {
        const key = this._getFallbackKey();
        const iv = Buffer.from(obj.iv, 'base64');
        const tag = Buffer.from(obj.tag, 'base64');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        let dec = decipher.update(obj.data, 'base64', 'utf8');
        dec += decipher.final('utf8');
        return dec;
      } catch (e) {
        console.warn('[OAuthPKCE] AES-256-GCM decrypt failed:', e.message);
        return null;
      }
    }
    return null;
  }

  _loadVault() {
    if (!fs.existsSync(this.vaultPath)) return {};
    try {
      const raw = fs.readFileSync(this.vaultPath, 'utf8');
      const parsed = JSON.parse(raw);
      const decrypted = this._decrypt(parsed);
      return decrypted ? JSON.parse(decrypted) : {};
    } catch (e) {
      console.warn('[OAuthPKCE] Error loading token vault:', e.message);
      return {};
    }
  }

  _saveVault(data) {
    try {
      const plain = JSON.stringify(data);
      const enc = this._encrypt(plain);
      fs.writeFileSync(this.vaultPath, JSON.stringify(enc, null, 2), { mode: 0o600 });
      return true;
    } catch (e) {
      console.error('[OAuthPKCE] Error saving token vault:', e.message);
      return false;
    }
  }

  saveTokens(provider, tokens) {
    const vault = this._loadVault();
    vault[provider] = {
      ...tokens,
      updated_at: Date.now()
    };
    return this._saveVault(vault);
  }

  getTokens(provider) {
    const vault = this._loadVault();
    return vault[provider] || null;
  }

  clearTokens(provider) {
    const vault = this._loadVault();
    if (vault[provider]) {
      delete vault[provider];
      this._saveVault(vault);
      return true;
    }
    return false;
  }

  getAuthStatus() {
    const vault = this._loadVault();
    return {
      spotify: {
        authenticated: !!(vault.spotify && vault.spotify.access_token),
        user: vault.spotify?.user || null,
        expires_at: vault.spotify?.expires_at || 0
      },
      google: {
        authenticated: !!(vault.google && vault.google.access_token),
        user: vault.google?.user || null,
        expires_at: vault.google?.expires_at || 0
      }
    };
  }

  // =========================================================================
  // LOOPBACK REDIRECT SERVER (127.0.0.1:0)
  // =========================================================================

  async startLoopbackServer(timeoutMs = 180000) {
    if (this.activeLoopbackServer) {
      try { this.activeLoopbackServer.close(); } catch (e) {}
      this.activeLoopbackServer = null;
    }

    let callbackResolve;
    let callbackReject;
    const waitForCallback = new Promise((resolve, reject) => {
      callbackResolve = resolve;
      callbackReject = reject;
    });

    const server = http.createServer((req, res) => {
      const parsedUrl = url.parse(req.url, true);
      if (parsedUrl.pathname === '/callback') {
        const { code, state, error, error_description } = parsedUrl.query;

        const htmlResponse = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Brave Music - Authentication</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      background: #07080c;
      color: #f0f0f5;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    }
    .card {
      background: #12131a;
      border: 1px solid ${error ? '#ff3b30' : '#ff5500'};
      border-radius: 16px;
      padding: 36px 44px;
      text-align: center;
      max-width: 440px;
      box-shadow: 0 20px 48px rgba(0, 0, 0, 0.7);
    }
    .badge {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: ${error ? 'rgba(255, 59, 48, 0.15)' : 'rgba(255, 85, 0, 0.15)'};
      color: ${error ? '#ff3b30' : '#ff5500'};
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 26px;
      margin-bottom: 18px;
    }
    h2 {
      margin: 0 0 10px;
      font-size: 20px;
      font-weight: 700;
    }
    p {
      color: #999;
      font-size: 14px;
      line-height: 1.5;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">${error ? '✕' : '✓'}</div>
    <h2>${error ? 'Authentication Failed' : 'Sign-In Successful'}</h2>
    <p>${error ? (error_description || error) : 'You have signed in successfully. You can close this browser tab and return to <strong>Brave Music</strong>.'}</p>
  </div>
  <script>
    setTimeout(() => { try { window.close(); } catch(e){} }, 2500);
  </script>
</body>
</html>`;

        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Connection': 'close'
        });
        res.end(htmlResponse);

        // Gracefully shutdown loopback server
        setTimeout(() => {
          try { server.close(); } catch (e) {}
          if (this.activeLoopbackServer === server) {
            this.activeLoopbackServer = null;
          }
        }, 500);

        if (error) {
          callbackReject(new Error(`OAuth error: ${error} (${error_description || ''})`));
        } else {
          callbackResolve({ code, state });
        }
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });

    this.activeLoopbackServer = server;

    const assignedPort = await new Promise((resolve, reject) => {
      server.listen(0, '127.0.0.1', () => {
        resolve(server.address().port);
      });
      server.on('error', reject);
    });

    server._assignedPort = assignedPort;

    // Timeout safety
    setTimeout(() => {
      if (this.activeLoopbackServer === server) {
        try { server.close(); } catch (e) {}
        this.activeLoopbackServer = null;
        callbackReject(new Error('Authentication timed out waiting for browser callback.'));
      }
    }, timeoutMs);

    return {
      server,
      port: assignedPort,
      redirectUri: `http://127.0.0.1:${assignedPort}/callback`,
      waitForCallback
    };
  }

  // =========================================================================
  // SPOTIFY OAUTH 2.0 PKCE FLOW
  // =========================================================================

  async startSpotifyAuth(customClientId = '') {
    const clientId = (customClientId || '4c0de696d5e1438cae105e94b281b373').trim();
    const verifier = this.generateCodeVerifier();
    const challenge = this.generateCodeChallenge(verifier);
    const state = this.generateState();

    // Start loopback server
    const { port, redirectUri, waitForCallback } = await this.startLoopbackServer(180000);

    const scopes = [
      'user-read-private',
      'user-read-email',
      'user-library-read',
      'playlist-read-private',
      'playlist-read-collaborative',
      'streaming'
    ].join(' ');

    const authUrl = `https://accounts.spotify.com/authorize?` +
      `client_id=${encodeURIComponent(clientId)}&` +
      `response_type=code&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `code_challenge_method=S256&` +
      `code_challenge=${encodeURIComponent(challenge)}&` +
      `state=${encodeURIComponent(state)}&` +
      `scope=${encodeURIComponent(scopes)}`;

    // Open in user's default system browser
    if (shell && typeof shell.openExternal === 'function') {
      await shell.openExternal(authUrl);
    }

    // Wait for loopback callback
    const { code, state: returnedState } = await waitForCallback;
    if (returnedState !== state) {
      throw new Error('CSRF State mismatch in Spotify authorization.');
    }

    // Exchange code for tokens
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier
      })
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`Spotify token exchange failed (${tokenRes.status}): ${errText}`);
    }

    const tokenData = await tokenRes.json();
    tokenData.client_id = clientId;
    tokenData.expires_at = Date.now() + ((tokenData.expires_in || 3600) * 1000);

    // Fetch user profile
    try {
      const userRes = await fetch('https://api.spotify.com/v1/me', {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
      });
      if (userRes.ok) {
        tokenData.user = await userRes.json();
      }
    } catch (e) {}

    this.saveTokens('spotify', tokenData);
    return {
      success: true,
      provider: 'spotify',
      user: tokenData.user || { display_name: 'Spotify User' }
    };
  }

  async refreshSpotifyToken() {
    const existing = this.getTokens('spotify');
    if (!existing || !existing.refresh_token) {
      throw new Error('No Spotify refresh token found.');
    }

    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: existing.client_id || '4c0de696d5e1438cae105e94b281b373',
        grant_type: 'refresh_token',
        refresh_token: existing.refresh_token
      })
    });

    if (!tokenRes.ok) {
      throw new Error(`Spotify token refresh failed: ${tokenRes.status}`);
    }

    const updated = await tokenRes.json();
    existing.access_token = updated.access_token;
    if (updated.refresh_token) existing.refresh_token = updated.refresh_token;
    existing.expires_at = Date.now() + ((updated.expires_in || 3600) * 1000);

    this.saveTokens('spotify', existing);
    return existing;
  }

  // =========================================================================
  // GOOGLE APP OAUTH 2.0 PKCE FLOW
  // =========================================================================

  async startGoogleAuth(customClientId = '') {
    // Official Google Desktop App OAuth with loopback redirect
    const clientId = (customClientId || '457591605380-4j8100pckck8p349s2vhki3sl6q8m89e.apps.googleusercontent.com').trim();
    const verifier = this.generateCodeVerifier();
    const challenge = this.generateCodeChallenge(verifier);
    const state = this.generateState();

    const { port, redirectUri, waitForCallback } = await this.startLoopbackServer(180000);

    const scopes = [
      'openid',
      'email',
      'profile'
    ].join(' ');

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(clientId)}&` +
      `response_type=code&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `code_challenge_method=S256&` +
      `code_challenge=${encodeURIComponent(challenge)}&` +
      `state=${encodeURIComponent(state)}&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `access_type=offline&` +
      `prompt=consent`;

    if (shell && typeof shell.openExternal === 'function') {
      await shell.openExternal(authUrl);
    }

    const { code, state: returnedState } = await waitForCallback;
    if (returnedState !== state) {
      throw new Error('CSRF State mismatch in Google authorization.');
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier
      })
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`Google token exchange failed (${tokenRes.status}): ${errText}`);
    }

    const tokenData = await tokenRes.json();
    tokenData.client_id = clientId;
    tokenData.expires_at = Date.now() + ((tokenData.expires_in || 3600) * 1000);

    // Fetch user info
    try {
      const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
      });
      if (infoRes.ok) {
        tokenData.user = await infoRes.json();
      }
    } catch (e) {}

    this.saveTokens('google', tokenData);
    return {
      success: true,
      provider: 'google',
      user: tokenData.user || { name: 'Google Account' }
    };
  }

  async refreshGoogleToken() {
    const existing = this.getTokens('google');
    if (!existing || !existing.refresh_token) {
      throw new Error('No Google refresh token found.');
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: existing.client_id,
        grant_type: 'refresh_token',
        refresh_token: existing.refresh_token
      })
    });

    if (!tokenRes.ok) {
      throw new Error(`Google token refresh failed: ${tokenRes.status}`);
    }

    const updated = await tokenRes.json();
    existing.access_token = updated.access_token;
    existing.expires_at = Date.now() + ((updated.expires_in || 3600) * 1000);

    this.saveTokens('google', existing);
    return existing;
  }
}

module.exports = new OAuthPKCEService();
