const oauthPKCEService = require('../services/OAuthPKCEService');
const ytmDevtoolsAuthService = require('../services/YTMDevtoolsAuthService');
const authSyncService = require('../services/AuthSyncService');
let shell = null;
let session = null;
try {
  const electron = require('electron');
  shell = electron.shell;
  session = electron.session;
} catch (e) {}

class AuthController {
  getAvailableBrowsers() {
    return ytmDevtoolsAuthService.detectBrowsers();
  }

  openBrowserLogin(event, { service, url } = {}) {
    if (!url) {
      url = service === 'spotify' ? 'https://open.spotify.com' : 'https://music.youtube.com';
    }
    return authSyncService.openInDefaultBrowser(url);
  }

  // Capability 1: OAuth 2.0 PKCE with Loopback Redirect (Spotify)
  async startSpotifyPkce(event, { clientId } = {}) {
    try {
      return await oauthPKCEService.startSpotifyAuth(clientId);
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // Capability 1: OAuth 2.0 PKCE with Loopback Redirect (Google)
  async startGooglePkce(event, { clientId } = {}) {
    try {
      return await oauthPKCEService.startGoogleAuth(clientId);
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // Refresh OAuth Token on 401
  async refreshOAuthToken(event, { provider } = {}) {
    try {
      if (provider === 'spotify') {
        const tokens = await oauthPKCEService.refreshSpotifyToken();
        return { success: true, tokens };
      } else if (provider === 'google') {
        const tokens = await oauthPKCEService.refreshGoogleToken();
        return { success: true, tokens };
      }
      return { success: false, error: 'Unknown provider' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  getAuthStatus() {
    const oauthStatus = oauthPKCEService.getAuthStatus();
    return {
      ...oauthStatus,
      ytmusic: {
        authenticated: require('fs').existsSync(ytmDevtoolsAuthService.savedSessionPath)
      }
    };
  }

  async logoutProvider(event, { provider } = {}) {
    if (provider === 'spotify' || provider === 'google') {
      oauthPKCEService.clearTokens(provider);
    }
    if (provider === 'ytmusic' || provider === 'all') {
      try {
        const s = session.fromPartition('persist:bravemusic');
        await s.clearStorageData({ storages: ['cookies', 'localstorage'] });
        const fs = require('fs');
        if (fs.existsSync(ytmDevtoolsAuthService.savedSessionPath)) {
          fs.unlinkSync(ytmDevtoolsAuthService.savedSessionPath);
        }
      } catch (e) {}
    }
    return { success: true, provider };
  }

  // Capability 2: YouTube Music Controlled CDP Login
  async startYtmCdpLogin(event, { browser } = {}) {
    try {
      return await ytmDevtoolsAuthService.startCdpLogin(browser || 'auto');
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  cancelYtmCdpLogin() {
    ytmDevtoolsAuthService.cancelCdpLogin();
    return { success: true };
  }

  // Capability 2: Guided cookies.txt Import Fallback
  async importCookiesText(event, { text } = {}) {
    try {
      return await ytmDevtoolsAuthService.importCookiesText(text);
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // Legacy fallback compatibility
  syncBrowserCookies(event, { browser, service } = {}) {
    return authSyncService.extractAndImportCookies(browser, service);
  }
}

module.exports = new AuthController();
