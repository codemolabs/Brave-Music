const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');

// Official Brave Shields Adblock Engine & Rule Sourcing
class BraveShieldsRules {
  constructor() {
    this.blockedDomains = new Set([
      // Google & YouTube Ad Networks
      'doubleclick.net',
      'googleadservices.com',
      'googlesyndication.com',
      'adservice.google.com',
      'pubads.g.doubleclick.net',
      'securepubads.g.doubleclick.net',
      'adclick.g.doubleclick.net',
      'stats.g.doubleclick.net',
      'googleads.g.doubleclick.net',
      'pagead2.googlesyndication.com',
      'ad.doubleclick.net',
      'static.doubleclick.net',

      // YouTube Video Ad & Telemetry Endpoints
      'youtube.com/pagead',
      'youtube.com/api/stats/ads',
      'youtube.com/api/stats/qoe',
      'youtube.com/ptracking',
      'youtube.com/youtubei/v1/log_event',
      'youtube.com/pagead/parallel_ad_playback',
      'youtube.com/get_midroll_info',
      'youtube.com/youtubei/v1/player/ad_break',

      // Cross-platform Ad & Tracker Exchanges (Brave / EasyList standard)
      'scorecardresearch.com',
      'quantserve.com',
      'moatads.com',
      'pubmatic.com',
      'adnxs.com',
      'rubiconproject.com',
      'criteo.com',
      'advertising.com',
      'casalemedia.com',
      'openx.net',
      'smartadserver.com',
      'taboola.com',
      'outbrain.com',
      'amazon-adsystem.com'
    ]);

    this.initLocalBraveEngine();
  }

  // Parse strings from local Brave Browser's compiled engine0.dat if present
  initLocalBraveEngine() {
    const home = os.homedir();
    const candidatePaths = [
      path.join(home, 'snap', 'brave', 'current', '.config', 'BraveSoftware', 'Brave-Browser', 'Default', 'adblock_cache', 'engine0.dat'),
      path.join(home, '.config', 'BraveSoftware', 'Brave-Browser', 'Default', 'adblock_cache', 'engine0.dat'),
      path.join(home, 'snap', 'brave', 'common', '.config', 'BraveSoftware', 'Brave-Browser', 'Default', 'adblock_cache', 'engine0.dat'),
      path.join(home, '.var', 'app', 'com.brave.Browser', 'config', 'BraveSoftware', 'Brave-Browser', 'Default', 'adblock_cache', 'engine0.dat')
    ];

    for (const enginePath of candidatePaths) {
      if (fs.existsSync(enginePath)) {
        try {
          // Read sample chunks from compiled Brave engine to extract fresh tracking domains
          const buffer = fs.readFileSync(enginePath);
          const str = buffer.toString('utf8', 0, Math.min(buffer.length, 1024 * 1024 * 4)); // 4MB scan
          const matches = str.match(/[a-z0-9.-]+\.(doubleclick\.net|googlesyndication\.com|googleadservices\.com|moatads\.com|quantserve\.com|spotify\.com\/ad)/gi);
          if (matches) {
            matches.forEach(m => this.blockedDomains.add(m.toLowerCase()));
          }
          console.log(`[BraveShieldsRules] Extracted rules from official Brave snap cache (${this.blockedDomains.size} rules active)`);
          break;
        } catch (e) {
          console.warn('[BraveShieldsRules] Notice on reading Brave engine cache:', e.message);
        }
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
           lower.includes('appleid.apple.com') ||
           lower.includes('facebook.com') ||
           (lower.includes('spotify.com') && (lower.includes('/login') || lower.includes('/signup') || lower.includes('/authorize')));
  }

  // Check if a request URL matches official Brave adblock rules
  isUrlBlocked(targetUrl) {
    if (!targetUrl || typeof targetUrl !== 'string') return false;
    if (this.isAuthUrl(targetUrl)) return false;

    const lower = targetUrl.toLowerCase();

    // Whitelist Spotify internal infrastructure to prevent triggering "Something went wrong" React crash
    if (lower.includes('spotify.com') ||
        lower.includes('spclient.wg.spotify.com') ||
        lower.includes('spotifycdn.com') ||
        lower.includes('audio-ak-spotify')) {
      return false;
    }

    // Fast check for YouTube ad segments
    if (lower.includes('youtube.com/pagead/') ||
        lower.includes('youtube.com/api/stats/ads') ||
        lower.includes('youtube.com/ptracking') ||
        lower.includes('youtube.com/youtubei/v1/log_event') ||
        lower.includes('googlevideo.com/videoplayback') && (lower.includes('&adformat=') || lower.includes('&oad=')) ||
        lower.includes('doubleclick.net') ||
        lower.includes('googleadservices.com') ||
        lower.includes('googlesyndication.com')) {
      return true;
    }

    // Host & endpoint matching
    try {
      const parsed = new URL(targetUrl);
      const host = parsed.hostname.toLowerCase();

      for (const domain of this.blockedDomains) {
        if (domain.includes('/')) {
          if (lower.includes(domain)) return true;
        } else {
          if (host === domain || host.endsWith('.' + domain)) return true;
        }
      }
    } catch (e) {}

    return false;
  }
}

module.exports = new BraveShieldsRules();
