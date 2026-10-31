const config = require('../config/appConfig');
const braveShieldsRules = require('./BraveShieldsRules');

class AdBlockService {
  constructor() {
    this.blockedCount = 0;
    this.blockedDomains = new Map();
    this.shieldUpdateListeners = new Set();
  }

  // Register listener for shield counter updates
  onUpdate(callback) {
    this.shieldUpdateListeners.add(callback);
    return () => this.shieldUpdateListeners.delete(callback);
  }

  broadcast(details) {
    for (const listener of this.shieldUpdateListeners) {
      try {
        listener(details);
      } catch (e) {
        console.error('[AdBlockService] Listener error:', e.message);
      }
    }
  }

  isAuthUrl(targetUrl) {
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
           lower.includes('clients4.google.com') ||
           lower.includes('clients2.google.com') ||
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

  // Attach webRequest interceptors to an Electron session using official Brave rules
  attachToSession(targetSession) {
    if (!targetSession || !targetSession.webRequest) return;

    // Block advertising and tracking URLs using official Brave Shields rules
    targetSession.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
      // 1. NEVER block, cancel, or inspect any authentication or login flows
      if (this.isAuthUrl(details.url)) {
        return callback({ cancel: false });
      }

      if (braveShieldsRules.isUrlBlocked(details.url)) {
        this.blockedCount++;

        try {
          const parsedUrl = new URL(details.url);
          const host = parsedUrl.hostname;
          this.blockedDomains.set(host, (this.blockedDomains.get(host) || 0) + 1);
        } catch (e) {}

        this.broadcast({
          count: this.blockedCount,
          url: details.url
        });

        return callback({ cancel: true });
      }

      callback({ cancel: false });
    });

    // Strip restrictive CSP, Report-Only policies & X-Frame-Options to allow fluid OTT provider embedding
    targetSession.webRequest.onHeadersReceived((details, callback) => {
      // 2. NEVER modify or strip CSP / security headers on authentication or login flows
      if (this.isAuthUrl(details.url)) {
        return callback({ responseHeaders: details.responseHeaders });
      }

      const responseHeaders = { ...details.responseHeaders };
      delete responseHeaders['x-frame-options'];
      delete responseHeaders['X-Frame-Options'];

      delete responseHeaders['content-security-policy'];
      delete responseHeaders['Content-Security-Policy'];
      delete responseHeaders['content-security-policy-report-only'];
      delete responseHeaders['Content-Security-Policy-Report-Only'];

      callback({ responseHeaders });
    });
  }

  recordAdBlocked(count = 1, source = 'in-page') {
    const inc = typeof count === 'number' && count > 0 ? count : 1;
    this.blockedCount += inc;
    const domainKey = String(source || 'in-page');
    this.blockedDomains.set(domainKey, (this.blockedDomains.get(domainKey) || 0) + inc);
    this.broadcast({
      count: this.blockedCount,
      url: domainKey
    });
    return this.getStats();
  }

  getStats() {
    return {
      totalBlocked: this.blockedCount,
      domains: Object.fromEntries(this.blockedDomains)
    };
  }

  resetStats() {
    this.blockedCount = 0;
    this.blockedDomains.clear();
    this.broadcast({ count: 0, url: '' });
    return { success: true };
  }
}

module.exports = new AdBlockService();
