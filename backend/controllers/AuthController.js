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

  // Unified Service Login (YouTube Music or Spotify via authentic browser CDP)
  async startServiceLogin(event, { service, browser } = {}) {
    try {
      return await ytmDevtoolsAuthService.startCdpLogin(service || 'youtube', browser || 'auto');
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  cancelServiceLogin() {
    ytmDevtoolsAuthService.cancelCdpLogin();
    return { success: true };
  }

  // Import cookies from JSON string or object
  async importCookiesJson(event, { service, cookies } = {}) {
    try {
      return await ytmDevtoolsAuthService.importCookiesJson(service || 'youtube', cookies);
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // Status check for all services
  async getAuthStatus() {
    const serviceStatus = await ytmDevtoolsAuthService.getServiceAuthStatus();
    const oauthStatus = oauthPKCEService.getAuthStatus();
    const savedAccounts = ytmDevtoolsAuthService.getSavedAccounts();
    return {
      youtube: {
        ...serviceStatus.youtube,
        account: savedAccounts.youtube || null
      },
      ytmusic: {
        ...serviceStatus.youtube,
        account: savedAccounts.youtube || null
      },
      spotify: {
        authenticated: serviceStatus.spotify.authenticated || oauthStatus.spotify.authenticated,
        account: savedAccounts.spotify || null,
        user: oauthStatus.spotify.user || (serviceStatus.spotify.authenticated ? { display_name: savedAccounts.spotify?.name || 'Spotify User' } : null)
      },
      google: oauthStatus.google,
      accounts: savedAccounts
    };
  }

  // Save / Update user account profile
  saveUserAccount(event, { service, accountData } = {}) {
    return ytmDevtoolsAuthService.saveUserAccount(service, accountData);
  }

  // Get all saved user accounts
  getSavedAccounts() {
    return ytmDevtoolsAuthService.getSavedAccounts();
  }

  async logoutProvider(event, { provider } = {}) {
    if (provider === 'spotify' || provider === 'all') {
      oauthPKCEService.clearTokens('spotify');
      await ytmDevtoolsAuthService.logoutService('spotify');
    }
    if (provider === 'youtube' || provider === 'ytmusic' || provider === 'all') {
      oauthPKCEService.clearTokens('google');
      await ytmDevtoolsAuthService.logoutService('youtube');
    }
    return { success: true, provider };
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

  // YouTube Music Controlled CDP Login (Backwards Compatibility)
  async startYtmCdpLogin(event, { browser } = {}) {
    return this.startServiceLogin(event, { service: 'youtube', browser });
  }

  cancelYtmCdpLogin() {
    return this.cancelServiceLogin();
  }

  // Guided cookies.txt Import Fallback (Backwards Compatibility)
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
