/**
 * Brave Shields Proactive Ad & Glitch Prevention Engine
 * 
 * Runs at document_start in guest webviews (YouTube Music & Spotify).
 * Intercepts network traffic in-flight (window.fetch & XMLHttpRequest)
 * BEFORE player state machines can schedule ad breaks.
 * Provides 0ms instant skipping, zero sound leaks, and cosmetic filtering.
 */

function runShields() {
  if (window.__BRAVE_SHIELDS_INITIALIZED__) return;

  const hostname = (window.location.hostname || '').toLowerCase();
  const href = (window.location.href || '').toLowerCase();

  // 1. NEVER execute shields on ANY authentication, login, Google Account, or OAuth pages
  if (
    hostname.includes('accounts.google.') ||
    hostname.includes('accounts.youtube.') ||
    hostname.includes('myaccount.google.') ||
    hostname.includes('apis.google.') ||
    hostname.includes('oauth2.googleapis.') ||
    hostname.includes('identitytoolkit.') ||
    hostname.includes('securetoken.') ||
    hostname.includes('appleid.apple.') ||
    hostname.includes('gstatic.com') ||
    href.includes('/signin') ||
    href.includes('/servicelogin') ||
    href.includes('/v3/signin') ||
    href.includes('/identifier') ||
    href.includes('/challenge') ||
    href.includes('/oauth') ||
    (hostname.includes('spotify.com') && (href.includes('/login') || href.includes('/signup') || href.includes('/authorize')))
  ) {
    return;
  }

  // 2. Only run on streaming media players (music.youtube.com, youtube.com, open.spotify.com)
  const isYouTube = hostname.endsWith('youtube.com') && !hostname.startsWith('accounts.');
  const isSpotify = hostname.endsWith('spotify.com') && !href.includes('/login') && !href.includes('/signup') && !href.includes('/authorize');

  if (!isYouTube && !isSpotify) {
    return;
  }

  window.__BRAVE_SHIELDS_INITIALIZED__ = true;

  let pendingShieldPingTimer = null;
  let queuedShieldDetail = '';

  function notifyBlocked(detail) {
    try {
      window.__BRAVE_SHIELDS_BLOCKED_COUNT__ = (window.__BRAVE_SHIELDS_BLOCKED_COUNT__ || 0) + 1;
      queuedShieldDetail = detail || queuedShieldDetail || 'in-page';
      if (!pendingShieldPingTimer && typeof fetch === 'function') {
        pendingShieldPingTimer = setTimeout(() => {
          pendingShieldPingTimer = null;
          const payload = queuedShieldDetail || 'in-page';
          queuedShieldDetail = '';
          fetch('/__brave_shield_blocked__?t=' + Date.now() + '&source=' + encodeURIComponent(payload), {
            method: 'GET',
            cache: 'no-store',
            credentials: 'omit'
          }).catch(() => {});
        }, 350);
      }
      console.log('[BRAVE_SHIELD_BLOCKED]', detail);
    } catch (e) {}
  }

  // ========================================================================
  // 0. TELEMETRY & BEACON SHIELD (Prevents third-party tracking errors)
  // ========================================================================
  try {
    window.ga = window.ga || function() {};
    window.gtag = window.gtag || function() {};
    window.dataLayer = window.dataLayer || [];

    if (navigator && navigator.sendBeacon) {
      const origBeacon = navigator.sendBeacon;
      navigator.sendBeacon = function(url, data) {
        if (typeof url === 'string' && (
          url.includes('google-analytics') ||
          url.includes('analytics') ||
          url.includes('telemetry') ||
          url.includes('log_event') ||
          url.includes('doubleclick') ||
          url.includes('/stats/ads') ||
          url.includes('scorecardresearch')
        )) {
          return true;
        }
        return origBeacon.apply(this, arguments);
      };
    }

    // Gracefully absorb benign vendor hydration / telemetry notices
    window.addEventListener('error', (event) => {
      const msg = String(event && (event.message || (event.error && event.error.message)) || '');
      if (msg.includes('React error #421') || msg.includes('Google Analytics') || msg.includes('robustness level')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return true;
      }
    }, true);

    window.addEventListener('unhandledrejection', (event) => {
      const reason = String(event && (event.reason && (event.reason.message || event.reason)) || '');
      if (reason.includes('Google Analytics') || reason.includes('Analytics') || reason.includes('421')) {
        event.preventDefault();
      }
    }, true);
  } catch (e) {}

  // ========================================================================
  // POPUP & FALLBACK REDIRECT SHIELD (Prevents window spam on Play)
  // ========================================================================
  try {
    const origWindowOpen = window.open;
    window.open = function(url, target, features) {
      if (typeof url === 'string') {
        const lower = url.toLowerCase();
        if (
          lower.startsWith('spotify:') ||
          lower.includes('support.spotify.com') ||
          lower.includes('fallback=getapp') ||
          lower.includes('app_open_trigger') ||
          lower.includes('spotify.com/redirect') ||
          lower.includes('spotify.com/download')
        ) {
          notifyBlocked('Suppressed Spotify window.open: ' + url);
          return null;
        }
      }
      return origWindowOpen ? origWindowOpen.apply(this, arguments) : null;
    };

    // Block accidental link clicks or automatic redirects to spotify: or support
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a');
      if (a && a.href) {
        const lowerHref = a.href.toLowerCase();
        if (
          lowerHref.startsWith('spotify:') ||
          lowerHref.includes('support.spotify.com') ||
          lowerHref.includes('fallback=getapp')
        ) {
          e.preventDefault();
          e.stopPropagation();
          notifyBlocked('Blocked Spotify anchor redirect: ' + a.href);
        }
      }
    }, true);
  } catch (e) {}

  // ========================================================================
  // 1. GLOBAL COSMETIC STYLING (Injected at document_start)
  // ========================================================================
  function injectCosmetics() {
    let cssRules = '';
    if (isYouTube) {
      cssRules = [
        '.ytp-ad-overlay-container',
        '.ytp-ad-message-container',
        '.ytp-ad-progress-list',
        '.ytp-ad-preview-container',
        '.ytp-ad-player-overlay',
        '.ytp-ad-player-overlay-flyout-cta',
        '.ytp-ad-action-interstitial',
        '.ytp-ad-text-overlay',
        'ytd-promoted-sparkles-web-renderer',
        'ytd-banner-promo-renderer',
        'ytmusic-player-bar[is-ad]',
        'ytd-display-ad-renderer',
        'ytd-statement-banner-renderer',
        'ytd-in-feed-ad-layout-renderer',
        '#mealbar-promo-renderer',
        'ytmusic-upsell-dialog-renderer',
        'ytd-merch-shelf-renderer',
        'ytd-ad-slot-renderer'
      ].join(',\n') + ' { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }';
    } else if (isSpotify) {
      cssRules = [
        '.Root__globalNav [data-testid="upgrade-button"]',
        '[aria-label="Upgrade to Premium"]',
        '.main-leaderboardComponent-container',
        '.desktop-banner-wrapper',
        '[data-testid="banner-container"]',
        '[data-testid="ad-leaderboard"]',
        '.sponsor-container',
        '.main-leaderboard-container',
        '.Root__top-bar-ad',
        '.Root__ads-container',
        'div[data-testid="top-bar-ad"]',
        'div[data-testid="upgrade-button"]',
        'button[data-testid="upgrade-button"]',
        '[data-testid="upgrade-modal"]',
        '[data-testid="protected-content-banner"]',
        '[data-testid="get-app-modal"]',
        '[data-testid="download-cta"]'
      ].join(',\n') + ' { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }';
    }

    const smoothScrollRules = `
body {
  -webkit-font-smoothing: antialiased !important;
  -moz-osx-font-smoothing: grayscale !important;
}
::-webkit-scrollbar {
  width: 7px !important;
  height: 7px !important;
}
::-webkit-scrollbar-track {
  background: transparent !important;
}
::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.14) !important;
  border-radius: 6px !important;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.28) !important;
}
`;
    cssRules += '\n' + smoothScrollRules;

    const style = document.createElement('style');
    style.id = 'brave-shields-injected-cosmetics';
    style.textContent = cssRules;

    const target = document.head || document.documentElement;
    if (target) {
      target.appendChild(style);
    } else {
      const obs = new MutationObserver(() => {
        const t = document.head || document.documentElement;
        if (t) {
          t.appendChild(style);
          obs.disconnect();
        }
      });
      obs.observe(document, { childList: true });
    }
  }
  injectCosmetics();

  // ========================================================================
  // 2. YOUTUBE MUSIC IN-FLIGHT TRAFFIC INTERCEPTION
  // ========================================================================
  function purgeAdMetadata(data, origin) {
    if (!data || typeof data !== 'object') return data;
    let scrubbed = false;

    // Strip cue points and ad slots
    if (data.adPlacements) {
      delete data.adPlacements;
      scrubbed = true;
    }
    if (data.adSlots) {
      delete data.adSlots;
      scrubbed = true;
    }
    if (data.playerAds) {
      delete data.playerAds;
      scrubbed = true;
    }
    if (data.adBreakHeartbeatParams) {
      delete data.adBreakHeartbeatParams;
      scrubbed = true;
    }
    if (data.adBreakService) {
      delete data.adBreakService;
      scrubbed = true;
    }

    // Clean tracking pings for ad telemetry
    if (data.playbackTracking) {
      if (data.playbackTracking.ptrackingUrl) {
        delete data.playbackTracking.ptrackingUrl;
        scrubbed = true;
      }
      if (data.playbackTracking.qoeUrl) {
        delete data.playbackTracking.qoeUrl;
        scrubbed = true;
      }
    }

    // Clean next track payload ads
    if (Array.isArray(data.engagementPanels)) {
      const origLen = data.engagementPanels.length;
      data.engagementPanels = data.engagementPanels.filter(p => {
        const id = (p.panelIdentifier || '').toLowerCase();
        return !id.includes('ads') && !id.includes('ad_break') && !id.includes('sponsor');
      });
      if (data.engagementPanels.length !== origLen) scrubbed = true;
    }

    if (scrubbed) {
      notifyBlocked('YouTube in-flight ad payload sanitized (' + origin + ')');
    }
    return data;
  }

  if (isYouTube) {
    // Trap window.ytInitialPlayerResponse before YouTube scripts run
    let _ytInitialPlayerResponse = undefined;
    Object.defineProperty(window, 'ytInitialPlayerResponse', {
      get: () => _ytInitialPlayerResponse,
      set: (val) => {
        _ytInitialPlayerResponse = purgeAdMetadata(val, 'ytInitialPlayerResponse');
      },
      configurable: true,
      enumerable: true
    });

    // Trap window.ytplayer if available
    let _ytplayer = window.ytplayer;
    Object.defineProperty(window, 'ytplayer', {
      get: () => _ytplayer,
      set: (val) => {
        if (val && typeof val === 'object' && val.config && val.config.args) {
          if (val.config.args.raw_player_response) {
            val.config.args.raw_player_response = purgeAdMetadata(val.config.args.raw_player_response, 'ytplayer.raw_player_response');
          }
        }
        _ytplayer = val;
      },
      configurable: true,
      enumerable: true
    });
  }

  // ========================================================================
  // 3. FETCH & XHR PROACTIVE NETWORK TRAFFIC PROXIES
  // ========================================================================
  const rawFetch = window.fetch;
  window.fetch = async function(...args) {
    const input = args[0];
    const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');

    if (typeof url === 'string') {
      const lowerUrl = url.toLowerCase();
      // Pass-through all authentication and login requests immediately without cloning or inspection
      if (
        lowerUrl.includes('accounts.google.') ||
        lowerUrl.includes('accounts.youtube.') ||
        lowerUrl.includes('apis.google.') ||
        lowerUrl.includes('oauth2.googleapis.') ||
        lowerUrl.includes('/signin') ||
        lowerUrl.includes('/servicelogin') ||
        lowerUrl.includes('/v3/signin') ||
        lowerUrl.includes('/identifier') ||
        lowerUrl.includes('/challenge') ||
        lowerUrl.includes('/oauth')
      ) {
        return rawFetch.apply(this, args);
      }

      // A. YouTube: inspect /youtubei/v1/player responses ONLY (never alter /v1/next Up Next / Mix recommendations)
      if (isYouTube && url.includes('/youtubei/v1/player')) {
        try {
          const res = await rawFetch.apply(this, args);
          const clone = res.clone();
          const json = await clone.json();
          const cleaned = purgeAdMetadata(json, 'fetch:player');
          const newBody = JSON.stringify(cleaned);
          return new Response(newBody, {
            status: res.status,
            statusText: res.statusText,
            headers: res.headers
          });
        } catch (e) {
          return rawFetch.apply(this, args);
        }
      }

      // B. YouTube: Drop telemetry and ad beacon pings immediately
      if (isYouTube && (
        url.includes('/youtubei/v1/log_event') ||
        url.includes('/api/stats/ads') ||
        url.includes('/pagead/') ||
        url.includes('/ptracking')
      )) {
        notifyBlocked('YouTube ad telemetry ping blocked');
        return new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // C. Spotify: Intercept ad breaks and ad targeting queries
      if (isSpotify && (
        url.includes('/ad-logic/') ||
        url.includes('/ads/v1/') ||
        url.includes('/commercial-') ||
        url.includes('/melody/v1/check_preroll')
      )) {
        notifyBlocked('Spotify ad schedule query intercepted');
        return new Response(JSON.stringify({
          ads: [],
          ad_breaks: [],
          breaks: [],
          intervals: [],
          targeting: {},
          status: 'ok'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return rawFetch.apply(this, args);
  };

  // Proxy XMLHttpRequest
  const rawXhrOpen = XMLHttpRequest.prototype.open;
  const rawXhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    this._requestUrl = typeof url === 'string' ? url : '';
    return rawXhrOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function(body) {
    if (isYouTube && this._requestUrl && this._requestUrl.includes('/youtubei/v1/player')) {
      this.addEventListener('readystatechange', () => {
        if (this.readyState === 4 && this.status === 200) {
          try {
            const data = JSON.parse(this.responseText);
            const cleaned = purgeAdMetadata(data, 'xhr:player');
            const sanitizedText = JSON.stringify(cleaned);
            Object.defineProperty(this, 'responseText', { get: () => sanitizedText, configurable: true });
            Object.defineProperty(this, 'response', { get: () => sanitizedText, configurable: true });
          } catch (err) {}
        }
      });
    }
    return rawXhrSend.apply(this, arguments);
  };

  // ========================================================================
  // 4. HTMLMediaElement ZERO-LEAK GUARD
  // ========================================================================
  const rawPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function() {
    try {
      if (isYouTube) {
        const adContainer = document.querySelector('.ad-showing, .ad-interrupting, .html5-video-player.ad-showing');
        const isAdSrc = this.src && (this.src.includes('&adformat=') || this.src.includes('&oad='));
        if (adContainer || isAdSrc) {
          this.muted = true;
          this.playbackRate = 16.0;
          if (isFinite(this.duration) && this.duration > 0) {
            this.currentTime = this.duration + 0.2;
          }
          notifyBlocked('Accelerated ad media element');
        }
      } else if (isSpotify) {
        const isSpotifyAd = document.querySelector('[data-testid="track-info-advertiser"], [aria-label="Advertisement"]') ||
                            (document.querySelector('[data-testid="now-playing-widget"]')?.textContent?.includes('Advertisement'));
        if (isSpotifyAd) {
          this.muted = true;
          this.playbackRate = 16.0;
          if (isFinite(this.duration) && this.duration > 0) {
            this.currentTime = this.duration || 9999;
          }
          notifyBlocked('Muted Spotify ad audio');
        }
      }
    } catch (e) {}
    return rawPlay.apply(this, arguments);
  };

  // ========================================================================
  // 5. DOM MUTATION SCANNER & MICROTASK WATCHDOG
  // ========================================================================
  let lastYtSkip = 0;
  let lastSpotifySkip = 0;

  function runFastScan() {
    if (isYouTube) {
      // Auto-click skip button immediately
      const skipBtns = document.querySelectorAll(
        '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .videoAdUiSkipButton, button.ytp-ad-skip-button-modern, .ytp-skip-ad-button, [id^="skip-button"] button'
      );
      skipBtns.forEach(btn => {
        try {
          btn.click();
          notifyBlocked('YouTube skip button triggered');
        } catch (e) {}
      });

      // Speed-run ad video if active
      const adPlayer = document.querySelector('.ad-showing, .ad-interrupting, .html5-video-player.ad-showing');
      const video = document.querySelector('video');
      if (adPlayer && video) {
        video.muted = true;
        video.playbackRate = 16.0;
        if (isFinite(video.duration) && video.duration > 0) {
          video.currentTime = video.duration + 0.5;
        }
        const now = Date.now();
        if (now - lastYtSkip > 800) {
          lastYtSkip = now;
          notifyBlocked('YouTube video ad fast-forwarded');
        }
      }

      // Dismiss promotional dialogs
      const dismissBtns = document.querySelectorAll(
        'ytmusic-upsell-dialog-renderer #dismiss-button, #mealbar-promo-renderer #dismiss-button, ytmusic-popup-container #dismiss-button'
      );
      dismissBtns.forEach(btn => {
        try {
          btn.click();
          notifyBlocked('YouTube promo dismissed');
        } catch (e) {}
      });
    }

    if (isSpotify) {
      // Auto-close promotional upgrade dialogs safely
      try {
        const upgradeModals = document.querySelectorAll(
          '[data-testid="upgrade-modal"], [data-testid="dialog-container"], .GenericModal'
        );
        upgradeModals.forEach(modal => {
          if (
            modal.matches?.('[data-testid="upgrade-modal"]') ||
            modal.querySelector?.('[data-testid="upgrade-button"]')
          ) {
            const closeBtn = modal.querySelector('button[aria-label="Close"], button[data-testid="dialog-close-button"], [data-testid="modal-close-button"]');
            if (closeBtn) {
              try {
                closeBtn.click();
                notifyBlocked('Spotify promo closed');
              } catch (e) {}
            }
          }
        });
      } catch (e) {}

      // Detect Spotify audio ad break
      try {
        const nowPlayingWidget = document.querySelector('[data-testid="now-playing-widget"]');
        const adIndicator = document.querySelector('[data-testid="track-info-advertiser"], [aria-label="Advertisement"]');
        const isAdTrack = adIndicator || (nowPlayingWidget && nowPlayingWidget.textContent?.includes('Advertisement'));

        if (isAdTrack) {
          document.querySelectorAll('audio').forEach(a => {
            a.muted = true;
            a.playbackRate = 16.0;
            if (isFinite(a.duration) && a.duration > 0) {
              a.currentTime = a.duration || 9999;
            }
          });

          const nextBtn = document.querySelector('[data-testid="control-button-skip-forward"]');
          if (nextBtn) {
            const now = Date.now();
            if (now - lastSpotifySkip > 1000) {
              lastSpotifySkip = now;
              try {
                nextBtn.click();
                notifyBlocked('Spotify ad skipped forward');
              } catch (e) {}
            }
          }
        }
      } catch (e) {}
    }
  }

  // Throttled scan scheduler to protect main-thread frame budget during scrolling & hidden tabs
  let scanScheduled = false;
  let lastScanTime = 0;
  function scheduleScan() {
    if (document.hidden || window.__BRAVE_TAB_SUSPENDED__) return;
    if (scanScheduled) return;
    const now = Date.now();
    const delay = Math.max(0, 600 - (now - lastScanTime));
    scanScheduled = true;
    setTimeout(() => {
      scanScheduled = false;
      if (document.hidden || window.__BRAVE_TAB_SUSPENDED__) return;
      lastScanTime = Date.now();
      runFastScan();
    }, delay);
  }

  // Set up MutationObserver to react on DOM changes without flooding main thread during scrolling
  const observer = new MutationObserver(() => {
    scheduleScan();
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-testid']
    });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      if (document.documentElement) {
        observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'data-testid']
        });
      }
    });
  }

  // Low-overhead periodic monitoring loop when visible
  setInterval(scheduleScan, 4000);

  console.log('[Brave Shields] Proactive traffic & glitch prevention engine active on', hostname);
}

// Bootstrap execution via webFrame to ensure execution in main world (worldId 0)
try {
  const _host = (window.location && window.location.hostname || '').toLowerCase();
  const _href = (window.location && window.location.href || '').toLowerCase();
  const _isAuthPage =
    _host.includes('accounts.google.') ||
    _host.includes('accounts.youtube.') ||
    _host.includes('accounts.spotify.') ||
    _host.includes('myaccount.google.') ||
    _href.includes('/signin') ||
    _href.includes('/servicelogin') ||
    _href.includes('/v3/signin');

  if (!_isAuthPage) {
    let webFrameModule = null;
    try {
      webFrameModule = require('electron').webFrame;
    } catch (e) {}

    if (webFrameModule && typeof webFrameModule.executeJavaScript === 'function') {
      webFrameModule.executeJavaScript('(' + runShields.toString() + ')()');
    } else {
      runShields();
    }
  }
} catch (err) {
  try {
    runShields();
  } catch (e) {
    console.warn('[Brave Shields Preload] Error initializing:', e.message);
  }
}
