/**
 * Brave Music Browser Identity Hardening Preload
 *
 * Ensures JS navigator / Client Hints / window.chrome fingerprints match HTTP headers
 * identically across both Google auth (Firefox desktop identity, no Client Hints)
 * and Chrome desktop streaming webviews (YouTube Music & Spotify).
 */

function applyBrowserIdentityHardening(chromeFullVersion, chromeMajorVersion, firefoxUserAgent) {
  try {
    if (window.__BRAVE_IDENTITY_HARDENED__) return;
    window.__BRAVE_IDENTITY_HARDENED__ = true;

    const host = (window.location && window.location.hostname || '').toLowerCase();
    const isGoogleAuthHost =
      host === 'accounts.google.com' ||
      host.startsWith('accounts.google.') ||
      host === 'accounts.youtube.com' ||
      host.startsWith('myaccount.google.') ||
      host === 'consent.google.com';

    // Always report webdriver = false consistently
    try {
      const proto = Object.getPrototypeOf(navigator) || Navigator.prototype;
      Object.defineProperty(proto, 'webdriver', {
        get: () => false,
        configurable: true
      });
    } catch (e) {}

    if (isGoogleAuthHost) {
      // Match clean Firefox Linux desktop HTTP headers (sec-ch-ua* stripped by main process)
      try {
        const proto = Object.getPrototypeOf(navigator) || Navigator.prototype;
        Object.defineProperty(proto, 'userAgent', {
          get: () => firefoxUserAgent,
          configurable: true
        });
        Object.defineProperty(proto, 'appVersion', {
          get: () => '5.0 (X11)',
          configurable: true
        });
        Object.defineProperty(proto, 'vendor', {
          get: () => '',
          configurable: true
        });
        Object.defineProperty(proto, 'platform', {
          get: () => 'Linux x86_64',
          configurable: true
        });
        Object.defineProperty(proto, 'userAgentData', {
          get: () => undefined,
          configurable: true
        });
      } catch (e) {}

      try {
        if ('chrome' in window) {
          Object.defineProperty(window, 'chrome', {
            get: () => undefined,
            configurable: true
          });
        }
      } catch (e) {}
      return;
    }

    // Chromium streaming & Spotify contexts: align userAgentData & window.chrome with HTTP sec-ch-ua headers
    try {
      const brands = [
        { brand: 'Google Chrome', version: String(chromeMajorVersion) },
        { brand: 'Chromium', version: String(chromeMajorVersion) },
        { brand: 'Not?A_Brand', version: '24' }
      ];
      const fullVersionList = [
        { brand: 'Google Chrome', version: String(chromeFullVersion) },
        { brand: 'Chromium', version: String(chromeFullVersion) },
        { brand: 'Not?A_Brand', version: '24.0.0.0' }
      ];

      const spoofedUAData = {
        brands,
        mobile: false,
        platform: 'Linux',
        toJSON() {
          return { brands, mobile: false, platform: 'Linux' };
        },
        getHighEntropyValues(hints) {
          const all = {
            architecture: 'x86',
            bitness: '64',
            brands,
            fullVersionList,
            mobile: false,
            model: '',
            platform: 'Linux',
            platformVersion: '6.8.0',
            uaFullVersion: String(chromeFullVersion),
            wow64: false
          };
          const out = { brands, mobile: false, platform: 'Linux' };
          if (Array.isArray(hints)) {
            for (const key of hints) {
              if (key in all) out[key] = all[key];
            }
          }
          return Promise.resolve(out);
        }
      };

      const proto = Object.getPrototypeOf(navigator) || Navigator.prototype;
      Object.defineProperty(proto, 'userAgentData', {
        get: () => spoofedUAData,
        configurable: true
      });
    } catch (e) {}

    try {
      if (!window.chrome || !window.chrome.runtime) {
        const existingChrome = (typeof window.chrome === 'object' && window.chrome) ? window.chrome : {};
        const stubChrome = Object.assign({
          app: {
            isInstalled: false,
            InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
            RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }
          },
          runtime: { id: undefined, connect: () => {}, sendMessage: () => {} },
          csi: () => ({ pageT: Date.now(), startE: Date.now(), tran: 15 }),
          loadTimes: () => ({ requestTime: Date.now() / 1000, startLoadTime: Date.now() / 1000 })
        }, existingChrome);
        Object.defineProperty(window, 'chrome', {
          value: stubChrome,
          writable: true,
          configurable: true
        });
      }
    } catch (e) {}
  } catch (err) {
    // Silent guard to avoid disrupting host page scripts
  }
}

try {
  const chromeFull = (typeof process !== 'undefined' && process.versions && process.versions.chrome) ? process.versions.chrome : '148.0.7778.280';
  const chromeMajor = chromeFull.split('.')[0] || '148';
  const firefoxUa = 'Mozilla/5.0 (X11; Linux x86_64; rv:136.0) Gecko/20100101 Firefox/136.0';
  const callCode = `(${applyBrowserIdentityHardening.toString()})(${JSON.stringify(chromeFull)}, ${JSON.stringify(chromeMajor)}, ${JSON.stringify(firefoxUa)})`;

  let webFrameModule = null;
  try {
    webFrameModule = require('electron').webFrame;
  } catch (e) {}

  if (webFrameModule && typeof webFrameModule.executeJavaScript === 'function') {
    webFrameModule.executeJavaScript(callCode);
  } else if (typeof window !== 'undefined') {
    applyBrowserIdentityHardening(chromeFull, chromeMajor, firefoxUa);
  }
} catch (err) {}
