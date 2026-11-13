use std::borrow::Cow;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU16, AtomicU64, Ordering};
use std::sync::{Arc, LazyLock, Mutex, OnceLock};

use brave_music_core::library::LibraryDocument;
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, Window};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

#[cfg(target_os = "linux")]
use gtk::prelude::*;

static BLOCKED_ADS_COUNT: AtomicU64 = AtomicU64::new(42);
static YTM_BLOCKED_COUNT: AtomicU64 = AtomicU64::new(28);
static SPOTIFY_BLOCKED_COUNT: AtomicU64 = AtomicU64::new(14);
static STREAM_SERVER_PORT: AtomicU16 = AtomicU16::new(0);
static AUTH_LOGIN_CANCELED: AtomicBool = AtomicBool::new(false);
static APP_SHUTTING_DOWN: AtomicBool = AtomicBool::new(false);
static SPOTIFY_WEBVIEW_CREATING: AtomicBool = AtomicBool::new(false);
static YT_AUTH_COOKIE_HINT: AtomicBool = AtomicBool::new(false);
static SP_AUTH_COOKIE_HINT: AtomicBool = AtomicBool::new(false);
static WINDOW_ALWAYS_ON_TOP: AtomicBool = AtomicBool::new(false);
static WINDOW_DECORATED: AtomicBool = AtomicBool::new(false);
#[cfg(target_os = "linux")]
thread_local! {
    static ACTIVE_WINDOW_MENU: std::cell::RefCell<Option<gtk::Menu>> = const { std::cell::RefCell::new(None) };
}
static AUTH_ACTIVE_SERVICE: LazyLock<Mutex<Option<String>>> = LazyLock::new(|| Mutex::new(None));
static CURRENT_YT_URL: LazyLock<Mutex<String>> = LazyLock::new(|| Mutex::new("https://music.youtube.com/".to_string()));
static CURRENT_SPOTIFY_URL: LazyLock<Mutex<String>> = LazyLock::new(|| Mutex::new("https://open.spotify.com/".to_string()));
static LAST_SPOTIFY_BRIDGE_TRIGGER: LazyLock<Mutex<(String, u64)>> = LazyLock::new(|| Mutex::new((String::new(), 0)));
static ACTIVE_CHILD_PIDS: LazyLock<Mutex<HashSet<u32>>> = LazyLock::new(|| Mutex::new(HashSet::new()));
static CACHED_JS_RUNTIME: OnceLock<Option<String>> = OnceLock::new();
static CACHED_FFMPEG_DIR: OnceLock<Option<PathBuf>> = OnceLock::new();
static RECOMMENDATIONS_CACHE: LazyLock<Mutex<Option<(String, std::time::Instant, Value)>>> =
    LazyLock::new(|| Mutex::new(None));

struct ActiveDownloadProcess {
    pid: u32,
    canceled: Arc<AtomicBool>,
}

static ACTIVE_DOWNLOADS: LazyLock<Mutex<HashMap<String, ActiveDownloadProcess>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn register_child_pid(pid: u32) {
    if let Ok(mut set) = ACTIVE_CHILD_PIDS.lock() {
        set.insert(pid);
    }
}

fn unregister_child_pid(pid: u32) {
    if let Ok(mut set) = ACTIVE_CHILD_PIDS.lock() {
        set.remove(&pid);
    }
}

fn terminate_pid_immediate(pid: u32) {
    #[cfg(unix)]
    {
        let _ = std::process::Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .status();
        let _ = std::process::Command::new("kill")
            .args(["-KILL", &pid.to_string()])
            .status();
    }
    #[cfg(not(unix))]
    {
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F"])
            .status();
    }
}

fn cleanup_background_processes(app: &AppHandle) {
    if APP_SHUTTING_DOWN.swap(true, Ordering::SeqCst) {
        return;
    }
    AUTH_LOGIN_CANCELED.store(true, Ordering::SeqCst);

    if let Ok(mut map) = ACTIVE_DOWNLOADS.lock() {
        for (_, proc_info) in map.drain() {
            proc_info.canceled.store(true, Ordering::SeqCst);
            terminate_pid_immediate(proc_info.pid);
        }
    }
    if let Ok(mut pids) = ACTIVE_CHILD_PIDS.lock() {
        for pid in pids.drain() {
            terminate_pid_immediate(pid);
        }
    }
    if let Some(aw) = app.get_webview_window("auth-window") {
        let _ = aw.destroy();
    }
}

const EMPTY_1PX_GIF: [u8; 43] = [
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00,
    0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00,
    0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
    0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
];

const CHROME_USER_AGENT: &str =
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const SHIELDS_SCRIPT: &str = include_str!("../../../src/js/webview-shields.js");

const WINDOW_CHROME_POLYFILL_SCRIPT: &str = r#"
(() => {
  try {
    const h = (window.location && window.location.hostname || '').toLowerCase();
    const p = (window.location && window.location.pathname || '').toLowerCase();
    if (
      h.includes('accounts.google.') ||
      h.includes('accounts.youtube.') ||
      h.includes('myaccount.google.') ||
      h.includes('consent.google.') ||
      h === 'accounts.spotify.com' ||
      p.includes('/servicelogin') ||
      p.includes('/v3/signin')
    ) {
      return;
    }
  } catch (_) {}
  if (!window.chrome) {
    window.chrome = {
      app: {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }
      },
      runtime: {
        id: '',
        OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' },
        connect: function() { return { onDisconnect: { addListener: function() {} }, onMessage: { addListener: function() {} }, postMessage: function() {} }; },
        sendMessage: function() {}
      }
    };
  }
})();
"#;

const GUEST_ERROR_CAPTURE_SCRIPT: &str = r#"
(() => {
  window.addEventListener('error', (e) => {
    try {
      var msg = encodeURIComponent('[Guest Page Error: ' + (e.message || '') + ' at ' + (e.filename || '') + ':' + (e.lineno || 0) + ']');
      fetch('/__brave_shield_blocked__?log_error=1&msg=' + msg).catch(() => {});
    } catch(_) {}
  }, true);

  window.addEventListener('unhandledrejection', (e) => {
    try {
      var reason = e.reason ? (e.reason.stack || e.reason.message || String(e.reason)) : 'unknown';
      var msg = encodeURIComponent('[Guest Page Unhandled Rejection: ' + reason + ']');
      fetch('/__brave_shield_blocked__?log_error=1&msg=' + msg).catch(() => {});
    } catch(_) {}
  }, true);

  // Sync SPA navigation URLs to host so header Download & Open Browser always know the active track/playlist
  let lastReportedHref = '';
  const reportHref = () => {
    try {
      const href = String(window.location && window.location.href || '');
      if (!href || href === lastReportedHref || href.startsWith('about:')) return;
      lastReportedHref = href;
      fetch('/__brave_shield_blocked__?url_sync=1&u=' + encodeURIComponent(href)).catch(() => {});
    } catch (_) {}
  };
  try {
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    if (typeof origPush === 'function') {
      history.pushState = function() {
        const res = origPush.apply(this, arguments);
        setTimeout(reportHref, 20);
        return res;
      };
    }
    if (typeof origReplace === 'function') {
      history.replaceState = function() {
        const res = origReplace.apply(this, arguments);
        setTimeout(reportHref, 20);
        return res;
      };
    }
    window.addEventListener('popstate', () => setTimeout(reportHref, 20));
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', reportHref, { once: true });
    } else {
      reportHref();
    }
  } catch (_) {}
})();
"#;

const SPOTIFY_NAVBAR_FIX_SCRIPT: &str = r#"
(() => {
  if (window.__braveSpotifyBridgeBootstrapped) return;
  window.__braveSpotifyBridgeBootstrapped = true;

  // Detect Widevine unavailability automatically without waiting for UI banners
  try {
    if (navigator.requestMediaKeySystemAccess && !navigator.__braveEmeHooked) {
      navigator.__braveEmeHooked = true;
      const origEme = navigator.requestMediaKeySystemAccess.bind(navigator);
      navigator.requestMediaKeySystemAccess = function() {
        return origEme.apply(navigator, arguments).catch((err) => {
          window.__braveSpotifyDrmBlocked = true;
          scheduleSpotifyMaintenance();
          throw err;
        });
      };
    }
    if ('serviceWorker' in navigator && typeof navigator.serviceWorker.getRegistrations === 'function') {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const r of regs) {
          r.unregister().catch(() => {});
        }
      }).catch(() => {});
    }
  } catch (_) {}

  const ensureStyle = () => {
    try {
      if (document.getElementById('brave-music-spotify-fix')) return;
      const style = document.createElement('style');
      style.id = 'brave-music-spotify-fix';
      style.textContent = `
        [data-testid="left-sidebar"], nav[aria-label="Main"] {
          display: flex !important;
          visibility: visible !important;
        }
        [data-testid="protected-content-banner"] {
          display: none !important;
          visibility: hidden !important;
          height: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        #brave-spotify-bridge-bar {
          position: fixed;
          right: 16px;
          bottom: 16px;
          z-index: 2147483640;
          display: flex;
          align-items: center;
          gap: 8px;
          max-width: min(560px, calc(100vw - 32px));
          padding: 9px 13px;
          border-radius: 14px;
          background: rgba(15, 17, 26, 0.94);
          border: 1px solid rgba(255, 85, 0, 0.42);
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
          color: #f8fafc;
          font-family: Inter, system-ui, -apple-system, sans-serif;
          font-size: 13px;
          backdrop-filter: blur(12px);
        }
        #brave-spotify-bridge-bar.minimized {
          padding: 7px 11px;
          gap: 8px;
        }
        #brave-spotify-bridge-bar .bsb-meta {
          display: flex;
          flex-direction: column;
          min-width: 120px;
          max-width: 230px;
          overflow: hidden;
        }
        #brave-spotify-bridge-bar.minimized .bsb-meta,
        #brave-spotify-bridge-bar.minimized .bsb-secondary {
          display: none;
        }
        #brave-spotify-bridge-bar .bsb-title {
          font-weight: 600;
          color: #ffffff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 12.5px;
        }
        #brave-spotify-bridge-bar .bsb-sub {
          color: #94a3b8;
          font-size: 11px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        #brave-spotify-bridge-bar .bsb-badge {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #1db954;
          flex-shrink: 0;
        }
        #brave-spotify-bridge-bar .bsb-badge.resolving {
          background: #f59e0b;
        }
        #brave-spotify-bridge-bar .bsb-badge.error {
          background: #ef4444;
        }
        #brave-spotify-bridge-bar button {
          border: none;
          border-radius: 8px;
          padding: 6px 10px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
          transition: opacity 0.15s ease, transform 0.1s ease;
        }
        #brave-spotify-bridge-bar button:hover {
          opacity: 0.92;
        }
        #brave-spotify-bridge-bar .bsb-primary {
          background: linear-gradient(135deg, #ff5500, #ff7a1a);
          color: #fff;
        }
        #brave-spotify-bridge-bar .bsb-secondary {
          background: rgba(255, 255, 255, 0.1);
          color: #e2e8f0;
        }
        #brave-spotify-bridge-bar .bsb-icon {
          background: transparent;
          color: #94a3b8;
          padding: 4px 6px;
        }
      `;
      (document.head || document.documentElement).appendChild(style);
    } catch (_) {}
  };

  window.__braveSpotifyBridgeState = {
    status: 'ready',
    title: 'Spotify Player Ready',
    artist: 'Click any track or Play button',
    isPlaying: false
  };

  const renderBridgeBar = () => {
    try {
      ensureStyle();
      if (!document.body) return;
      let bar = document.getElementById('brave-spotify-bridge-bar');
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'brave-spotify-bridge-bar';
        bar.innerHTML = `
          <span class="bsb-badge" id="bsb-dot"></span>
          <div class="bsb-meta">
            <span class="bsb-title" id="bsb-title">Spotify Player Ready</span>
            <span class="bsb-sub" id="bsb-sub">Click any track or Play button</span>
          </div>
          <button type="button" class="bsb-primary" id="bsb-play-btn">Play</button>
          <button type="button" class="bsb-secondary" id="bsb-next-btn" title="Next track in queue" style="display:none;">Next</button>
          <button type="button" class="bsb-secondary" id="bsb-dl-btn" title="Download current Spotify track or playlist">Download</button>
          <button type="button" class="bsb-icon" id="bsb-min-btn" title="Minimize / Expand">_</button>
        `;
        document.body.appendChild(bar);

        document.getElementById('bsb-play-btn')?.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const st = window.__braveSpotifyBridgeState || {};
          if (st.active && (st.status === 'playing' || st.status === 'paused')) {
            fetch('/__brave_shield_blocked__?spotify_control=toggle', { cache: 'no-store' }).catch(() => {});
            return;
          }
          const ctx = extractPageContext();
          triggerBridgePlay(ctx);
        });

        document.getElementById('bsb-next-btn')?.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          fetch('/__brave_shield_blocked__?spotify_control=next', { cache: 'no-store' }).catch(() => {});
        });

        document.getElementById('bsb-dl-btn')?.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const activeUrl = (window.__braveSpotifyBridgeState?.trackUrl) || window.location.href;
          fetch('/__brave_shield_blocked__?spotify_download=1&url=' + encodeURIComponent(activeUrl), { cache: 'no-store' }).catch(() => {});
        });

        document.getElementById('bsb-min-btn')?.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          bar.classList.toggle('minimized');
        });
      }

      const st = window.__braveSpotifyBridgeState || {};
      const dot = document.getElementById('bsb-dot');
      const titleEl = document.getElementById('bsb-title');
      const subEl = document.getElementById('bsb-sub');
      const playBtn = document.getElementById('bsb-play-btn');
      const nextBtn = document.getElementById('bsb-next-btn');
      if (dot) {
        dot.className = 'bsb-badge'
          + (st.status === 'resolving' ? ' resolving' : (st.status === 'error' ? ' error' : ''));
      }
      if (titleEl) titleEl.textContent = st.title || 'Spotify Player Ready';
      if (subEl) subEl.textContent = st.artist || 'Click any track or Play button';
      if (playBtn) {
        if (st.status === 'resolving') playBtn.textContent = 'Loading...';
        else if (st.status === 'playing') playBtn.textContent = 'Pause';
        else if (st.status === 'paused') playBtn.textContent = 'Resume';
        else playBtn.textContent = 'Play';
      }
      if (nextBtn) {
        nextBtn.style.display = st.active ? 'inline-block' : 'none';
      }
    } catch (_) {}
  };

  window.__braveSpotifyBridgeSync = (next) => {
    try {
      window.__braveSpotifyBridgeState = Object.assign({}, window.__braveSpotifyBridgeState || {}, next || {});
      renderBridgeBar();
    } catch (_) {}
  };

  let spotifyDomCheckedAt = 0;
  let spotifyBannerTimer = null;

  const isDrmWarningText = (raw) => {
    const txt = (raw || '').toLowerCase();
    if (!txt || txt.length > 480) return false;
    return (
      txt.includes('protected content is not enabled') ||
      txt.includes('playback of protected content') ||
      txt.includes('enable playback in your browser') ||
      (txt.includes('spotify support') && txt.includes('playback'))
    );
  };

  const hideBannerNode = (node) => {
    if (!node || node.id === 'brave-spotify-bridge-bar' || node.closest('#brave-spotify-bridge-bar')) return;
    window.__braveSpotifyDrmBlocked = true;
    if (node.getAttribute('data-brave-drm-hidden') !== '1') {
      node.setAttribute('data-brave-drm-hidden', '1');
      node.style.setProperty('display', 'none', 'important');
      node.style.setProperty('height', '0', 'important');
      node.style.setProperty('margin', '0', 'important');
      node.style.setProperty('padding', '0', 'important');
    }
  };

  const suppressProtectedContentBanners = () => {
    try {
      const candidates = document.querySelectorAll(
        '[data-testid="message-bar"], [role="alert"], [role="status"], [data-testid="protected-content-banner"], [data-encore-id="banner"], [role="dialog"]'
      );
      for (const el of candidates) {
        if (isDrmWarningText(el.textContent)) {
          hideBannerNode(el);
        }
      }
      const supportLinks = document.querySelectorAll('a[href*="support.spotify.com"]');
      for (const link of supportLinks) {
        let cur = link;
        let target = null;
        for (let depth = 0; depth < 6 && cur && cur.parentElement; depth++) {
          cur = cur.parentElement;
          const tag = cur.tagName;
          if (tag === 'BODY' || tag === 'MAIN' || tag === 'HTML') break;
          if (cur.id === 'main' || cur.classList?.contains('Root__top-container') || cur.classList?.contains('main-view-container')) break;
          const rect = cur.getBoundingClientRect();
          if (rect.height > 0 && rect.height <= 180 && isDrmWarningText(cur.textContent)) {
            target = cur;
          }
        }
        if (target) {
          hideBannerNode(target);
        } else if (isDrmWarningText(link.parentElement?.textContent)) {
          hideBannerNode(link.parentElement);
        }
      }
    } catch (_) {}
  };

  const scheduleSpotifyMaintenance = () => {
    if (document.hidden || window.__BRAVE_TAB_SUSPENDED__) return;
    if (spotifyBannerTimer) return;
    const elapsed = Date.now() - spotifyDomCheckedAt;
    const waitMs = elapsed >= 450 ? 60 : (450 - elapsed);
    spotifyBannerTimer = setTimeout(() => {
      spotifyBannerTimer = null;
      if (document.hidden || window.__BRAVE_TAB_SUSPENDED__) return;
      spotifyDomCheckedAt = Date.now();
      suppressProtectedContentBanners();
      if (!document.getElementById('brave-spotify-bridge-bar')) renderBridgeBar();
    }, waitMs);
  };

  const parsePlayAriaLabel = (btn) => {
    const raw = (btn?.getAttribute?.('aria-label') || '').trim();
    if (!raw || !/^play\b/i.test(raw)) return { title: '', artist: '' };
    const rest = raw.replace(/^play\s+/i, '').trim();
    const byMatch = rest.match(/^(.+?)\s+by\s+(.+)$/i);
    if (byMatch) {
      return { title: byMatch[1].trim(), artist: byMatch[2].trim() };
    }
    return { title: rest, artist: '' };
  };

  const extractTrackFromElement = (target, playBtn) => {
    const container = target?.closest?.(
      '[data-testid="tracklist-row"], [role="row"], [data-testid="track-row"], [data-testid="card"], [data-encore-id="card"], [data-testid="now-playing-widget"], article'
    );
    let trackUrl = '';
    let title = '';
    let artist = '';
    let art = '';

    if (container) {
      const entityLink = container.querySelector('a[href*="/track/"], a[href*="/album/"], a[href*="/playlist/"], a[href*="/episode/"]');
      if (entityLink) {
        trackUrl = entityLink.href || '';
        const text = (entityLink.textContent || '').trim();
        if (text) title = text;
      }
      if (!title) {
        const tEl = container.querySelector('[data-testid="internal-track-link"] div, [data-testid="card-title"], [dir="auto"]');
        title = (tEl?.textContent || '').trim();
      }
      const artistLinks = Array.from(container.querySelectorAll('a[href*="/artist/"]'))
        .map((a) => (a.textContent || '').trim())
        .filter(Boolean);
      if (artistLinks.length > 0) artist = [...new Set(artistLinks)].join(', ');
      const img = container.querySelector('img');
      if (img && img.src) art = img.src;
    }

    if (playBtn) {
      const parsed = parsePlayAriaLabel(playBtn);
      if (parsed.title && (!title || title.length < 2)) title = parsed.title;
      if (parsed.artist && !artist) artist = parsed.artist;
    }

    if (!trackUrl) {
      const href = String(window.location.href || '');
      if (/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|playlist|artist|episode)\//i.test(href)) {
        trackUrl = href;
      } else {
        const pageTrack = document.querySelector('main a[href*="/track/"], main a[href*="/playlist/"], main a[href*="/album/"]');
        if (pageTrack?.href) trackUrl = pageTrack.href;
      }
    }
    if (!title) {
      const h1 = document.querySelector('[data-testid="entityTitle"] h1, main h1');
      if (h1) title = (h1.textContent || '').trim();
    }
    if (!artist) {
      const metaArtist = document.querySelector('[data-testid="creator-link"], [data-testid="entityTitle"] a[href*="/artist/"], main a[href*="/artist/"]');
      if (metaArtist) artist = (metaArtist.textContent || '').trim();
    }
    if (!art) {
      const coverImg = document.querySelector('main img[src*="i.scdn.co"], [data-testid="entity-image"] img');
      if (coverImg && coverImg.src) art = coverImg.src;
    }
    return { url: trackUrl || window.location.href, title, artist, art };
  };

  const extractPageContext = () => {
    const activePlay = document.querySelector('[data-testid="action-bar-row"] button[data-testid="play-button"], main button[data-testid="play-button"]');
    return extractTrackFromElement(activePlay || document.querySelector('main'), activePlay);
  };

  const triggerBridgePlay = (ctx) => {
    try {
      window.__braveSpotifyBridgeSync({
        active: true,
        status: 'resolving',
        title: ctx.title || 'Loading track...',
        artist: ctx.artist || 'Matching audio stream...',
        trackUrl: ctx.url || window.location.href
      });
      const q = new URLSearchParams({
        spotify_play: '1',
        url: ctx.url || window.location.href,
        title: ctx.title || '',
        artist: ctx.artist || '',
        art: ctx.art || ''
      });
      fetch('/__brave_shield_blocked__?' + q.toString(), { cache: 'no-store' }).catch(() => {});
    } catch (_) {}
  };

  document.addEventListener('click', (ev) => {
    try {
      if (ev.target?.closest?.('#brave-spotify-bridge-bar')) return;
      const btn = ev.target?.closest?.(
        'button[data-testid="play-button"], [data-testid="action-bar-row"] button[data-testid="play-button"], [data-testid="tracklist-row"] button, button[data-testid="control-button-playpause"], button[aria-label^="Play"]'
      );
      if (!btn) return;
      const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
      if (
        btn.closest('[data-testid="tracklist-row"]') &&
        aria &&
        !aria.startsWith('play') &&
        !aria.startsWith('pause') &&
        btn.getAttribute('data-testid') !== 'play-button'
      ) {
        return;
      }
      if (btn.getAttribute('data-testid') === 'control-button-playpause' && window.__braveSpotifyBridgeState?.active) {
        ev.preventDefault();
        ev.stopPropagation();
        fetch('/__brave_shield_blocked__?spotify_control=toggle', { cache: 'no-store' }).catch(() => {});
        return;
      }
      const ctx = extractTrackFromElement(btn, btn);
      if (!ctx.url && !ctx.title) return;
      if (window.__braveSpotifyDrmBlocked) {
        triggerBridgePlay(ctx);
      } else {
        setTimeout(() => {
          const audio = document.querySelector('audio');
          const nativePlaying = !!(audio && !audio.paused && audio.currentTime > 0);
          if (!nativePlaying) {
            triggerBridgePlay(ctx);
          }
        }, 350);
      }
    } catch (_) {}
  }, true);

  document.addEventListener('dblclick', (ev) => {
    try {
      const row = ev.target?.closest?.('[data-testid="tracklist-row"]');
      if (!row) return;
      const ctx = extractTrackFromElement(row, null);
      if (window.__braveSpotifyDrmBlocked) {
        triggerBridgePlay(ctx);
      } else {
        setTimeout(() => {
          const audio = document.querySelector('audio');
          if (!audio || audio.paused) triggerBridgePlay(ctx);
        }, 350);
      }
    } catch (_) {}
  }, true);

  const bootObserver = () => {
    suppressProtectedContentBanners();
    renderBridgeBar();
    const obs = new MutationObserver(() => {
      scheduleSpotifyMaintenance();
    });
    if (document.body) {
      obs.observe(document.body, { childList: true, subtree: true });
    }
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !window.__BRAVE_TAB_SUSPENDED__) {
        scheduleSpotifyMaintenance();
      }
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootObserver, { once: true });
  } else {
    bootObserver();
  }
})();
"#;

#[cfg(target_os = "linux")]
fn apply_webkit_platform_settings(platform_wv: tauri::webview::PlatformWebview, allow_popups: bool) {
    use webkit2gtk::{
        CacheModel, HardwareAccelerationPolicy, MediaKeySystemPermissionRequest,
        PermissionRequestExt, SettingsExt, WebContextExt, WebViewExt,
        WebsiteDataAccessPermissionRequest,
    };
    let inner = platform_wv.inner();
    if let Some(ctx) = WebViewExt::context(&inner) {
        ctx.set_cache_model(CacheModel::DocumentViewer);
    }
    if let Some(settings) = WebViewExt::settings(&inner) {
        settings.set_enable_javascript(true);
        settings.set_enable_webgl(true);
        settings.set_enable_webaudio(true);
        settings.set_enable_mediasource(true);
        settings.set_enable_media(true);
        settings.set_enable_media_capabilities(true);
        settings.set_enable_media_stream(true);
        settings.set_enable_encrypted_media(true);
        settings.set_enable_page_cache(false);
        settings.set_enable_dns_prefetching(false);
        settings.set_hardware_acceleration_policy(HardwareAccelerationPolicy::OnDemand);
        settings.set_media_playback_requires_user_gesture(false);
        settings.set_javascript_can_open_windows_automatically(allow_popups);
        settings.set_enable_write_console_messages_to_stdout(false);
    }
    inner.connect_permission_request(|_wv, request| {
        if request.is::<MediaKeySystemPermissionRequest>()
            || request.is::<WebsiteDataAccessPermissionRequest>()
        {
            request.allow();
            return true;
        }
        false
    });
}

#[cfg(target_os = "linux")]
fn configure_webkit_webview_settings(wv: &tauri::Webview, allow_popups: bool) {
    let _ = wv.with_webview(move |platform_wv| apply_webkit_platform_settings(platform_wv, allow_popups));
}

#[cfg(target_os = "linux")]
fn configure_webkit_window_settings(win: &tauri::WebviewWindow, allow_popups: bool) {
    let _ = win.with_webview(move |platform_wv| apply_webkit_platform_settings(platform_wv, allow_popups));
}

#[cfg(not(target_os = "linux"))]
fn configure_webkit_webview_settings(_wv: &tauri::Webview, _allow_popups: bool) {}

#[cfg(not(target_os = "linux"))]
fn configure_webkit_window_settings(_win: &tauri::WebviewWindow, _allow_popups: bool) {}

#[derive(Serialize)]
struct RuntimeInfo {
    tauri: &'static str,
    os: &'static str,
    arch: &'static str,
}

#[tauri::command]
fn runtime_info() -> RuntimeInfo {
    RuntimeInfo {
        tauri: "2.x",
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
    }
}

fn app_library_path(app: &AppHandle) -> Result<PathBuf, String> {
    #[cfg(target_os = "linux")]
    {
        if let Some(home) = std::env::var_os("HOME") {
            let legacy_path = PathBuf::from(home).join(".local/share/brave-music/library.json");
            if legacy_path.exists() {
                return Ok(legacy_path);
            }
        }
    }
    app.path()
        .app_data_dir()
        .map(|path| path.join("library.json"))
        .map_err(|error| error.to_string())
}

fn read_library(app: &AppHandle) -> Result<LibraryDocument, String> {
    let path = app_library_path(app)?;
    LibraryDocument::load(&path).map_err(|error| error.to_string())
}

fn write_library(app: &AppHandle, document: &LibraryDocument) -> Result<(), String> {
    let path = app_library_path(app)?;
    document
        .save_atomic(&path)
        .map_err(|error| error.to_string())
}

fn import_library_file(
    source: &std::path::Path,
    target: &std::path::Path,
    backup: &std::path::Path,
) -> Result<LibraryDocument, String> {
    if target.exists() {
        return Err("The new app already has a library; import was not run".to_owned());
    }

    let source_bytes =
        fs::read(source).map_err(|error| format!("Could not read legacy library: {error}"))?;
    let document =
        LibraryDocument::from_json_bytes(&source_bytes).map_err(|error| error.to_string())?;
    let backup_dir = backup
        .parent()
        .ok_or_else(|| "Could not determine migration backup directory".to_owned())?;
    fs::create_dir_all(backup_dir)
        .map_err(|error| format!("Could not create migration backup directory: {error}"))?;
    set_private_permissions(backup_dir, 0o700)
        .map_err(|error| format!("Could not secure migration backup directory: {error}"))?;

    if backup.exists() {
        let existing_backup = fs::read(backup)
            .map_err(|error| format!("Could not verify prior migration backup: {error}"))?;
        if existing_backup != source_bytes {
            return Err("A different migration backup already exists; import stopped".to_owned());
        }
    } else {
        let mut temporary_backup = tempfile::NamedTempFile::new_in(backup_dir)
            .map_err(|error| format!("Could not stage migration backup: {error}"))?;
        temporary_backup
            .write_all(&source_bytes)
            .and_then(|()| temporary_backup.as_file().sync_all())
            .map_err(|error| format!("Could not write staged migration backup: {error}"))?;
        if let Err(error) = temporary_backup.persist_noclobber(backup) {
            if error.error.kind() != std::io::ErrorKind::AlreadyExists {
                return Err(format!(
                    "Could not publish migration backup: {}",
                    error.error
                ));
            }
            let existing_backup = fs::read(backup).map_err(|error| {
                format!("Could not verify concurrent migration backup: {error}")
            })?;
            if existing_backup != source_bytes {
                return Err(
                    "A different migration backup already exists; import stopped".to_owned(),
                );
            }
        }
        set_private_permissions(backup, 0o600)
            .map_err(|error| format!("Could not secure migration backup: {error}"))?;
        let verified_backup = fs::read(backup)
            .map_err(|error| format!("Could not verify migration backup: {error}"))?;
        if verified_backup != source_bytes {
            return Err("Migration backup verification failed; import stopped".to_owned());
        }
    }
    set_private_permissions(backup, 0o600)
        .map_err(|error| format!("Could not secure migration backup: {error}"))?;

    document
        .save_new_atomic(target)
        .map_err(|error| format!("Could not write the new library: {error}"))?;
    Ok(document)
}

#[cfg(unix)]
fn set_private_permissions(path: &std::path::Path, mode: u32) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;

    let mut permissions = fs::metadata(path)?.permissions();
    permissions.set_mode(mode);
    fs::set_permissions(path, permissions)
}

#[cfg(not(unix))]
fn set_private_permissions(_path: &std::path::Path, _mode: u32) -> std::io::Result<()> {
    Ok(())
}

#[tauri::command]
async fn get_library(app: AppHandle) -> Result<LibraryDocument, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = app_library_path(&app)?;
        if !path.exists() {
            if let Ok(imported) = import_legacy_library(app.clone()) {
                return Ok(imported);
            }
        }
        read_library(&app)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn import_legacy_library(app: AppHandle) -> Result<LibraryDocument, String> {
    #[cfg(not(target_os = "linux"))]
    {
        let _ = app;
        return Err("Legacy Linux library import is only available on Linux".to_owned());
    }

    #[cfg(target_os = "linux")]
    {
        let home = std::env::var_os("HOME")
            .map(PathBuf::from)
            .ok_or_else(|| "Could not locate the current user's home directory".to_owned())?;
        let source = home.join(".local/share/brave-music/library.json");
        let target = app_library_path(&app)?;
        let data_dir = target
            .parent()
            .ok_or_else(|| "Could not determine the new app data directory".to_owned())?;
        let backup = data_dir.join("migration-backups/legacy-library.json");
        import_library_file(&source, &target, &backup)
    }
}

fn get_user_downloads_dir(app: &AppHandle) -> PathBuf {
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let legacy_data_dir = home.as_ref().map(|h| h.join(".local/share/brave-music"));

    // 1. Check legacy settings.json
    if let Some(ref dir) = legacy_data_dir {
        let settings_path = dir.join("settings.json");
        if let Ok(bytes) = fs::read(&settings_path) {
            if let Ok(val) = serde_json::from_slice::<Value>(&bytes) {
                if let Some(d) = val.get("downloadsDir").and_then(|v| v.as_str()) {
                    let pb = PathBuf::from(d);
                    if pb.exists() && pb.is_dir() {
                        return pb;
                    }
                }
            }
        }
    }

    // 2. Check preview settings.json
    if let Ok(app_dir) = app.path().app_data_dir() {
        let settings_path = app_dir.join("settings.json");
        if let Ok(bytes) = fs::read(&settings_path) {
            if let Ok(val) = serde_json::from_slice::<Value>(&bytes) {
                if let Some(d) = val.get("downloadsDir").and_then(|v| v.as_str()) {
                    let pb = PathBuf::from(d);
                    if pb.exists() && pb.is_dir() {
                        return pb;
                    }
                }
            }
        }
    }

    // 3. Fallback to legacy downloads dir
    if let Some(ref h) = home {
        let leg = h.join(".local/share/brave-music/downloads");
        if leg.exists() {
            return leg;
        }
    }

    // 4. Fallback to app_data_dir downloads
    app.path()
        .app_data_dir()
        .map(|p| p.join("downloads"))
        .unwrap_or_else(|_| PathBuf::from("downloads"))
}

fn spotify_bridge_cache_dir(app: &AppHandle) -> PathBuf {
    let base = app
        .path()
        .app_cache_dir()
        .ok()
        .or_else(|| app.path().app_data_dir().ok())
        .unwrap_or_else(std::env::temp_dir);
    let dir = base.join("spotify-bridge");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn resolve_audio_file(app: &AppHandle, filename: &str) -> Option<PathBuf> {
    if filename.contains('\\') || filename.contains("..") {
        return None;
    }

    if let Some(sub) = filename.strip_prefix("__bridge/") {
        if sub.is_empty() || sub.contains('/') {
            return None;
        }
        let bridged = spotify_bridge_cache_dir(app).join(sub);
        if bridged.exists() && bridged.is_file() {
            return Some(bridged);
        }
        return None;
    }

    if filename.contains('/') {
        return None;
    }

    let downloads_dir = get_user_downloads_dir(app);
    let primary = downloads_dir.join(filename);
    if primary.exists() && primary.is_file() {
        return Some(primary);
    }

    // Fallbacks
    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        let legacy = home.join(".local/share/brave-music/downloads").join(filename);
        if legacy.exists() && legacy.is_file() {
            return Some(legacy);
        }
    }

    if let Ok(app_dir) = app.path().app_data_dir() {
        let preview = app_dir.join("downloads").join(filename);
        if preview.exists() && preview.is_file() {
            return Some(preview);
        }
    }

    None
}

fn delete_file_from_downloads(app: &AppHandle, filename: &str) {
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return;
    }
    let downloads_dir = get_user_downloads_dir(app);
    let primary = downloads_dir.join(filename);
    if primary.exists() && primary.is_file() {
        let _ = fs::remove_file(primary);
    }
    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        let leg = home.join(".local/share/brave-music/downloads").join(filename);
        if leg.exists() && leg.is_file() {
            let _ = fs::remove_file(leg);
        }
    }
    if let Ok(app_dir) = app.path().app_data_dir() {
        let prev = app_dir.join("downloads").join(filename);
        if prev.exists() && prev.is_file() {
            let _ = fs::remove_file(prev);
        }
    }
}

#[tauri::command]
async fn create_playlist(app: AppHandle, name: String) -> Result<LibraryDocument, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut document = read_library(&app)?;
        document
            .create_playlist(&name, None)
            .map_err(|error| error.to_string())?;
        write_library(&app, &document)?;
        let _ = app.emit("library-updated", serde_json::json!({ "status": "playlist_created", "name": name }));
        Ok(document)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn delete_playlist(
    app: AppHandle,
    name: String,
    delete_files: Option<bool>,
) -> Result<LibraryDocument, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut document = read_library(&app)?;
        let should_delete_files = delete_files.unwrap_or(false);
        let filenames = document
            .delete_playlist(&name, should_delete_files)
            .map_err(|error| error.to_string())?;
        write_library(&app, &document)?;

        if should_delete_files {
            for filename in filenames {
                delete_file_from_downloads(&app, &filename);
            }
        }

        let _ = app.emit("library-updated", serde_json::json!({ "status": "playlist_deleted", "name": name }));
        Ok(document)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn set_playlist_cover(
    app: AppHandle,
    name: String,
    cover: Value,
) -> Result<LibraryDocument, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut document = read_library(&app)?;
        document
            .set_playlist_cover(&name, cover)
            .map_err(|error| error.to_string())?;
        write_library(&app, &document)?;
        let _ = app.emit("library-updated", serde_json::json!({ "status": "playlist_cover_updated", "name": name }));
        Ok(document)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn add_track_to_playlist(
    app: AppHandle,
    track_id: Value,
    playlist_name: String,
) -> Result<LibraryDocument, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut document = read_library(&app)?;
        document
            .add_track_to_playlist(&track_id, &playlist_name)
            .map_err(|error| error.to_string())?;
        write_library(&app, &document)?;
        let _ = app.emit("library-updated", serde_json::json!({ "status": "playlist_track_added", "playlist": playlist_name }));
        Ok(document)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn remove_track_from_playlist(
    app: AppHandle,
    track_id: Value,
    playlist_name: String,
) -> Result<LibraryDocument, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut document = read_library(&app)?;
        document
            .remove_track_from_playlist(&track_id, &playlist_name)
            .map_err(|error| error.to_string())?;
        write_library(&app, &document)?;
        let _ = app.emit("library-updated", serde_json::json!({ "status": "playlist_track_removed", "playlist": playlist_name }));
        Ok(document)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn delete_track(app: AppHandle, track_id: Value) -> Result<LibraryDocument, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut document = read_library(&app)?;
        let filename_opt = document
            .delete_track(&track_id)
            .map_err(|error| error.to_string())?;
        write_library(&app, &document)?;

        if let Some(filename) = filename_opt {
            delete_file_from_downloads(&app, &filename);
        }

        let _ = app.emit("library-updated", serde_json::json!({ "status": "track_deleted" }));
        Ok(document)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn delete_tracks(app: AppHandle, track_ids: Vec<Value>) -> Result<LibraryDocument, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut document = read_library(&app)?;
        let result = document
            .delete_tracks(&track_ids)
            .map_err(|error| error.to_string())?;
        write_library(&app, &document)?;

        for filename in result.filenames {
            delete_file_from_downloads(&app, &filename);
        }

        let _ = app.emit("library-updated", serde_json::json!({ "status": "tracks_deleted" }));
        Ok(document)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(target_os = "linux")]
static CURRENT_LINUX_TAB: LazyLock<Mutex<String>> = LazyLock::new(|| Mutex::new("yt-view".to_string()));
#[cfg(target_os = "linux")]
static IS_MODAL_ACTIVE: AtomicBool = AtomicBool::new(false);

fn sync_webview_suspended_flag(app: &AppHandle, tab: &str, modal_open: bool) {
    let yt_active = !modal_open && (tab == "yt-view" || tab == "yt");
    let sp_active = !modal_open && (tab == "spotify-view" || tab == "spotify");
    if let Some(yt) = app.get_webview("yt-webview") {
        let _ = yt.eval(if yt_active {
            "window.__BRAVE_TAB_SUSPENDED__ = false;"
        } else {
            "window.__BRAVE_TAB_SUSPENDED__ = true;"
        });
    }
    if let Some(sp) = app.get_webview("spotify-webview") {
        let _ = sp.eval(if sp_active {
            "window.__BRAVE_TAB_SUSPENDED__ = false;"
        } else {
            "window.__BRAVE_TAB_SUSPENDED__ = true;"
        });
    }
}

fn ensure_spotify_webview_on_main_thread(app: &AppHandle) {
    if app.get_webview("spotify-webview").is_some() {
        return;
    }
    if SPOTIFY_WEBVIEW_CREATING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }
    let Some(window) = app.get_window("main") else {
        SPOTIFY_WEBVIEW_CREATING.store(false, Ordering::SeqCst);
        return;
    };
    let Ok(spotify_url) = tauri::Url::parse("https://open.spotify.com/") else {
        SPOTIFY_WEBVIEW_CREATING.store(false, Ordering::SeqCst);
        return;
    };
    let size = window.inner_size().unwrap_or(tauri::PhysicalSize::new(1360, 840));
    let scale = window.scale_factor().unwrap_or(1.0);
    let child_w = size.width as f64 / scale;
    let child_h = ((size.height as f64 / scale) - 58.0).max(100.0);

    let app_handle_for_spotify = app.clone();
    let app_handle_for_spotify_nav = app.clone();
    let app_handle_for_spotify_popup = app.clone();
    let spotify_builder = tauri::WebviewBuilder::new("spotify-webview", tauri::WebviewUrl::External(spotify_url))
        .user_agent(CHROME_USER_AGENT)
        .initialization_script(WINDOW_CHROME_POLYFILL_SCRIPT)
        .initialization_script(GUEST_ERROR_CAPTURE_SCRIPT)
        .initialization_script(SHIELDS_SCRIPT)
        .initialization_script(SPOTIFY_NAVBAR_FIX_SCRIPT)
        .on_navigation(move |nav_url| {
            record_webview_url(&app_handle_for_spotify_nav, "spotify-webview", nav_url.as_str());
            true
        })
        .on_new_window(move |url, _features| {
            if is_auth_url(url.as_str()) {
                let app_clone = app_handle_for_spotify_popup.clone();
                let u = url.to_string();
                std::thread::spawn(move || {
                    let _ = open_auth_window(&app_clone, "spotify", Some(u));
                });
                return tauri::webview::NewWindowResponse::Deny;
            }
            tauri::webview::NewWindowResponse::Allow
        })
        .on_web_resource_request(move |request, response| {
            if let Some(ctype) = handle_shield_or_bridge_request(
                &app_handle_for_spotify,
                "spotify-webview",
                request.uri(),
                &SPOTIFY_BLOCKED_COUNT,
            ) {
                apply_shield_ok_response(response, ctype);
            }
        });

    let auth_dir = auth_config_dir(app);
    match window.add_child(
        spotify_builder,
        tauri::LogicalPosition::new(0.0, 58.0),
        tauri::LogicalSize::new(child_w, child_h),
    ) {
        Ok(sp_wv) => {
            eprintln!("[Tauri lazy] spotify-webview added on demand");
            configure_webkit_webview_settings(&sp_wv, true);
            if !webview_has_service_auth(&sp_wv, "spotify") {
                if let Ok(bytes) = fs::read(auth_dir.join("spotify_session.json")) {
                    if let Ok(records) = serde_json::from_slice::<Vec<Value>>(&bytes) {
                        if apply_cookie_values_to_webview(&sp_wv, &records) > 0 {
                            SP_AUTH_COOKIE_HINT.store(true, Ordering::Relaxed);
                        }
                    }
                }
            } else {
                SP_AUTH_COOKIE_HINT.store(true, Ordering::Relaxed);
            }
            #[cfg(target_os = "linux")]
            attach_pending_linux_overlay_children(&window);
        }
        Err(e) => {
            eprintln!("[Tauri lazy] Failed to add spotify-webview: {e:?}");
        }
    }
    SPOTIFY_WEBVIEW_CREATING.store(false, Ordering::SeqCst);
}

#[cfg(target_os = "linux")]
fn linux_overlay_edge_inset(window: &Window) -> i32 {
    let maximized = window.is_maximized().unwrap_or(false);
    let fullscreen = window.is_fullscreen().unwrap_or(false);
    let decorated = WINDOW_DECORATED.load(Ordering::Relaxed)
        || window.is_decorated().unwrap_or(false);
    if maximized || fullscreen || decorated {
        0
    } else {
        6
    }
}

#[cfg(target_os = "linux")]
fn apply_linux_overlay_child_margins(widget: &gtk::Widget, edge: i32) {
    widget.set_margin_top(58);
    widget.set_margin_start(edge);
    widget.set_margin_end(edge);
    widget.set_margin_bottom(edge);
}

#[cfg(target_os = "linux")]
fn sync_linux_overlay_margins(window: &Window) {
    let edge = linux_overlay_edge_inset(window);
    if let Ok(vbox) = window.default_vbox() {
        let children = vbox.children();
        if let Some(overlay_widget) = children.first() {
            if let Ok(overlay) = overlay_widget.clone().downcast::<gtk::Overlay>() {
                for child in overlay.children().into_iter().skip(1) {
                    apply_linux_overlay_child_margins(&child, edge);
                }
                overlay.queue_draw();
            }
        }
    }
}

#[cfg(target_os = "linux")]
fn setup_linux_overlay(window: &Window) {
    if let Ok(gtk_win) = window.gtk_window() {
        gtk_win.set_resizable(true);
    }
    let edge = linux_overlay_edge_inset(window);
    if let Ok(vbox) = window.default_vbox() {
        let children = vbox.children();
        if children.len() >= 2 {
            let main_ui = children[0].clone();
            let rest: Vec<_> = children[1..].to_vec();

            vbox.remove(&main_ui);
            for w in &rest {
                vbox.remove(w);
            }

            let overlay = gtk::Overlay::new();
            overlay.add(&main_ui);

            for w in rest {
                apply_linux_overlay_child_margins(&w, edge);
                overlay.add_overlay(&w);
            }

            vbox.pack_start(&overlay, true, true, 0);
            overlay.show_all();
        }
    }
}

#[cfg(target_os = "linux")]
fn attach_pending_linux_overlay_children(window: &Window) {
    let edge = linux_overlay_edge_inset(window);
    if let Ok(vbox) = window.default_vbox() {
        let children = vbox.children();
        if children.len() >= 2 {
            if let Ok(overlay) = children[0].clone().downcast::<gtk::Overlay>() {
                for extra in &children[1..] {
                    vbox.remove(extra);
                    apply_linux_overlay_child_margins(extra, edge);
                    overlay.add_overlay(extra);
                }
                overlay.queue_draw();
            }
        }
    }
}

#[cfg(target_os = "linux")]
fn update_linux_layout(window: &Window, tab: &str) {
    {
        let mut current = match CURRENT_LINUX_TAB.lock() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        *current = tab.to_string();
    }

    if IS_MODAL_ACTIVE.load(Ordering::SeqCst) {
        return;
    }

    if let Ok(vbox) = window.default_vbox() {
        let children = vbox.children();
        if let Some(overlay_widget) = children.first() {
            if let Ok(overlay) = overlay_widget.clone().downcast::<gtk::Overlay>() {
                let overlay_children = overlay.children();
                if overlay_children.len() >= 2 {
                    let yt_wv = &overlay_children[1];
                    let sp_wv_opt = overlay_children.get(2);
                    match tab {
                        "yt-view" | "yt" => {
                            yt_wv.show();
                            if let Some(sp_wv) = sp_wv_opt {
                                sp_wv.hide();
                            }
                        }
                        "spotify-view" | "spotify" => {
                            yt_wv.hide();
                            if let Some(sp_wv) = sp_wv_opt {
                                sp_wv.show();
                            }
                        }
                        "downloads-view" | "downloads" => {
                            yt_wv.hide();
                            if let Some(sp_wv) = sp_wv_opt {
                                sp_wv.hide();
                            }
                        }
                        _ => {}
                    }
                    overlay.queue_draw();
                }
            }
        }
    }
}

#[cfg(not(target_os = "linux"))]
fn update_cross_platform_layout(app: &AppHandle, tab: &str) {
    let yt = app.get_webview("yt-webview");
    let spotify = app.get_webview("spotify-webview");

    let (child_w, child_h) = if let Some(window) = app.get_window("main") {
        let size = window.inner_size().unwrap_or(tauri::PhysicalSize::new(1360, 840));
        let scale = window.scale_factor().unwrap_or(1.0);
        let w = size.width as f64 / scale;
        let h = ((size.height as f64 / scale) - 58.0).max(100.0);
        (w, h)
    } else {
        (1360.0, 782.0)
    };

    match tab {
        "yt-view" | "yt" => {
            if let Some(w) = yt {
                let _ = w.set_position(tauri::LogicalPosition::new(0.0, 58.0));
                let _ = w.set_size(tauri::LogicalSize::new(child_w, child_h));
                let _ = w.show();
            }
            if let Some(w) = spotify {
                let _ = w.hide();
            }
        }
        "spotify-view" | "spotify" => {
            if let Some(w) = yt {
                let _ = w.hide();
            }
            if let Some(w) = spotify {
                let _ = w.set_position(tauri::LogicalPosition::new(0.0, 58.0));
                let _ = w.set_size(tauri::LogicalSize::new(child_w, child_h));
                let _ = w.show();
            }
        }
        "downloads-view" | "downloads" => {
            if let Some(w) = yt {
                let _ = w.hide();
            }
            if let Some(w) = spotify {
                let _ = w.hide();
            }
        }
        _ => {}
    }
}

#[tauri::command]
fn switch_tab(app: AppHandle, tab: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        if let Some(window) = app.get_window("main") {
            let win = window.clone();
            let app_clone = app.clone();
            let tab_clone = tab.clone();
            let _ = app.run_on_main_thread(move || {
                if tab_clone == "spotify-view" || tab_clone == "spotify" {
                    ensure_spotify_webview_on_main_thread(&app_clone);
                }
                update_linux_layout(&win, &tab_clone);
                let modal_open = IS_MODAL_ACTIVE.load(Ordering::SeqCst);
                sync_webview_suspended_flag(&app_clone, &tab_clone, modal_open);
            });
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        if tab == "spotify-view" || tab == "spotify" {
            let app_clone = app.clone();
            let tab_clone = tab.clone();
            let _ = app.run_on_main_thread(move || {
                ensure_spotify_webview_on_main_thread(&app_clone);
                update_cross_platform_layout(&app_clone, &tab_clone);
                sync_webview_suspended_flag(&app_clone, &tab_clone, false);
            });
        } else {
            update_cross_platform_layout(&app, &tab);
            sync_webview_suspended_flag(&app, &tab, false);
        }
    }

    Ok(())
}

#[tauri::command]
fn set_modal_state(app: AppHandle, open: bool, current_tab: Option<String>) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let prev = IS_MODAL_ACTIVE.swap(open, Ordering::SeqCst);
        if prev == open {
            return Ok(());
        }

        if let Some(window) = app.get_window("main") {
            let win = window.clone();
            let app_clone = app.clone();
            let tab = current_tab.unwrap_or_else(|| {
                CURRENT_LINUX_TAB
                    .lock()
                    .map(|g| g.clone())
                    .unwrap_or_else(|p| p.into_inner().clone())
            });
            let _ = app.run_on_main_thread(move || {
                if let Ok(vbox) = win.default_vbox() {
                    let children = vbox.children();
                    if let Some(overlay_widget) = children.first() {
                        if let Ok(overlay) = overlay_widget.clone().downcast::<gtk::Overlay>() {
                            let overlay_children = overlay.children();
                            if overlay_children.len() >= 2 {
                                let yt_wv = &overlay_children[1];
                                let sp_wv_opt = overlay_children.get(2);
                                if open {
                                    yt_wv.hide();
                                    if let Some(sp_wv) = sp_wv_opt {
                                        sp_wv.hide();
                                    }
                                } else {
                                    match tab.as_str() {
                                        "yt-view" | "yt" => {
                                            yt_wv.show();
                                            if let Some(sp_wv) = sp_wv_opt {
                                                sp_wv.hide();
                                            }
                                        }
                                        "spotify-view" | "spotify" => {
                                            yt_wv.hide();
                                            if let Some(sp_wv) = sp_wv_opt {
                                                sp_wv.show();
                                            }
                                        }
                                        _ => {
                                            yt_wv.hide();
                                            if let Some(sp_wv) = sp_wv_opt {
                                                sp_wv.hide();
                                            }
                                        }
                                    }
                                }
                                overlay.queue_draw();
                            }
                        }
                    }
                }
                sync_webview_suspended_flag(&app_clone, &tab, open);
            });
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        let yt = app.get_webview("yt-webview");
        let spotify = app.get_webview("spotify-webview");
        let tab = current_tab.as_deref().unwrap_or("yt-view");
        if open {
            if let Some(w) = yt {
                let _ = w.hide();
            }
            if let Some(w) = spotify {
                let _ = w.hide();
            }
        } else {
            update_cross_platform_layout(&app, tab);
        }
        sync_webview_suspended_flag(&app, tab, open);
    }

    Ok(())
}

#[derive(Serialize)]
struct ShieldStats {
    #[serde(rename = "totalBlocked")]
    total_blocked: u64,
    #[serde(rename = "ytmBlocked")]
    ytm_blocked: u64,
    #[serde(rename = "spotifyBlocked")]
    spotify_blocked: u64,
}

#[tauri::command]
fn get_shield_stats() -> ShieldStats {
    ShieldStats {
        total_blocked: BLOCKED_ADS_COUNT.load(Ordering::Relaxed),
        ytm_blocked: YTM_BLOCKED_COUNT.load(Ordering::Relaxed),
        spotify_blocked: SPOTIFY_BLOCKED_COUNT.load(Ordering::Relaxed),
    }
}

#[tauri::command]
fn reset_shield_stats(app: AppHandle) -> ShieldStats {
    BLOCKED_ADS_COUNT.store(0, Ordering::Relaxed);
    YTM_BLOCKED_COUNT.store(0, Ordering::Relaxed);
    SPOTIFY_BLOCKED_COUNT.store(0, Ordering::Relaxed);
    let _ = app.emit("shield-update", serde_json::json!({ "count": 0 }));
    ShieldStats {
        total_blocked: 0,
        ytm_blocked: 0,
        spotify_blocked: 0,
    }
}

#[tauri::command]
fn record_ad_blocked(app: AppHandle, count: Option<u64>, source: Option<String>) -> Result<u64, String> {
    let inc = count.unwrap_or(1);
    let total = BLOCKED_ADS_COUNT.fetch_add(inc, Ordering::SeqCst) + inc;
    if let Some(src) = source {
        if src.contains("spotify") {
            SPOTIFY_BLOCKED_COUNT.fetch_add(inc, Ordering::Relaxed);
        } else {
            YTM_BLOCKED_COUNT.fetch_add(inc, Ordering::Relaxed);
        }
    } else {
        YTM_BLOCKED_COUNT.fetch_add(inc, Ordering::Relaxed);
    }
    let _ = app.emit("shield-update", serde_json::json!({ "count": total }));
    Ok(total)
}

fn is_ad_or_tracker_request(uri: &tauri::http::Uri) -> bool {
    let path_and_query = uri.path_and_query().map(|pq| pq.as_str()).unwrap_or("");
    let host = uri.host().unwrap_or("").to_lowercase();

    // Never block auth / account / Google login requests
    if host.contains("accounts.google.")
        || host.contains("accounts.youtube.")
        || host.contains("oauth")
        || (host.contains("spotify.com") && (path_and_query.contains("/login") || path_and_query.contains("/signup") || path_and_query.contains("/authorize")))
    {
        return false;
    }

    // Ping from webview-shields.js
    if host == "brave-shields.local" || path_and_query.starts_with("/__brave_shield_blocked__") {
        return true;
    }

    // Known ad & tracking networks
    host.contains("doubleclick.net")
        || host.contains("googleads")
        || host.contains("pagead")
        || host.contains("adnxs.com")
        || host.contains("scorecardresearch.com")
        || (host.contains("youtube.com") && (path_and_query.contains("/api/stats/ads") || path_and_query.contains("/pagead/")))
}

#[tauri::command]
fn eval_script(app: AppHandle, webview: String, script: String) -> Result<(), String> {
    if let Some(w) = app.get_webview(&webview) {
        let _ = w.eval(&script);
    }
    Ok(())
}

#[tauri::command]
fn reload_tab(app: AppHandle, tab: String) -> Result<(), String> {
    match tab.as_str() {
        "yt-view" | "yt" => {
            if let Some(yt) = app.get_webview("yt-webview") {
                let _ = yt.eval("window.location.reload()");
            }
        }
        "spotify-view" | "spotify" => {
            if let Some(sp) = app.get_webview("spotify-webview") {
                let _ = sp.eval("window.location.reload()");
            }
        }
        _ => {}
    }
    Ok(())
}

#[derive(serde::Deserialize)]
struct DownloadParams {
    url: String,
    #[serde(rename = "isPlaylist")]
    is_playlist: Option<bool>,
    #[serde(rename = "playlistName")]
    playlist_name: Option<String>,
    format: Option<String>,
}

#[derive(serde::Serialize, Clone)]
struct DownloadProgressData {
    #[serde(rename = "downloadId")]
    download_id: String,
    pct: u32,
    percent: u32,
    #[serde(rename = "itemIndex")]
    item_index: u32,
    #[serde(rename = "itemTotal")]
    item_total: u32,
    title: String,
    artist: String,
    speed: String,
    status: String,
    complete: bool,
    #[serde(rename = "trackSaved")]
    track_saved: Option<Value>,
}

fn parse_download_percentage(line: &str) -> Option<u32> {
    if let Some(idx) = line.find('%') {
        let before = &line[..idx];
        if let Some(space_idx) = before.rfind(|c: char| c.is_whitespace() || c == ']') {
            let num_str = before[space_idx + 1..].trim();
            if let Ok(f) = num_str.parse::<f32>() {
                return Some(f.round() as u32);
            }
        }
    }
    None
}

fn parse_download_speed(line: &str) -> Option<String> {
    if let Some(at_idx) = line.find(" at ") {
        let after_at = &line[at_idx + 4..];
        let parts: Vec<&str> = after_at.split_whitespace().collect();
        if let Some(speed_part) = parts.first() {
            return Some(speed_part.to_string());
        }
    }
    None
}

fn current_timestamp_str() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("{secs}")
}

fn clean_track_metadata(raw_title: &str, raw_artist: &str) -> (String, String) {
    let mut title = raw_title.trim().to_string();
    let mut artist = raw_artist.trim().to_string();

    artist = artist
        .replace(" - Topic", "")
        .replace("- Topic", "")
        .replace("VEVO", "")
        .trim()
        .to_string();

    let noise_patterns = [
        "(Official Music Video)", "[Official Music Video]",
        "(Official Video)", "[Official Video]",
        "(Official Audio)", "[Official Audio]",
        "(Lyric Video)", "[Lyric Video]",
        "(Lyrics Video)", "[Lyrics Video]",
        "(Lyrics)", "[Lyrics]",
        "(Audio)", "[Audio]",
        "(Visualizer)", "[Visualizer]",
        "(Video)", "[Video]",
        "(HD)", "[HD]",
        "(4K)", "[4K]",
        "(Remastered)", "[Remastered]",
        "(Explicit)", "[Explicit]",
    ];

    for pattern in &noise_patterns {
        let pattern_lower = pattern.to_lowercase();
        while let Some(idx) = title.to_lowercase().find(&pattern_lower) {
            let end_idx = idx + pattern.len();
            title.replace_range(idx..end_idx, "");
            title = title.trim().to_string();
        }
    }

    if let Some(pipe_pos) = title.find('|') {
        let after_pipe = title[pipe_pos..].to_lowercase();
        if after_pipe.contains("official") || after_pipe.contains("audio") || after_pipe.contains("lyric") {
            title = title[..pipe_pos].trim().to_string();
        }
    }

    if artist.is_empty() || artist.eq_ignore_ascii_case("unknown") || artist.eq_ignore_ascii_case("na") {
        if let Some(dash_pos) = title.find(" - ") {
            artist = title[..dash_pos].trim().to_string();
            title = title[dash_pos + 3..].trim().to_string();
        } else {
            artist = "Unknown Artist".to_string();
        }
    }

    (title, artist)
}

fn percent_encode(s: &str) -> String {
    let mut encoded = String::new();
    for b in s.bytes() {
        match b {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(b as char);
            }
            _ => {
                encoded.push_str(&format!("%{:02X}", b));
            }
        }
    }
    encoded
}

fn percent_decode(s: &str) -> Option<String> {
    let mut bytes = Vec::new();
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '%' {
            let h1 = chars.next()?;
            let h2 = chars.next()?;
            let byte = u8::from_str_radix(&format!("{h1}{h2}"), 16).ok()?;
            bytes.push(byte);
        } else if c == '+' {
            bytes.push(b' ');
        } else {
            let mut buf = [0u8; 4];
            let encoded = c.encode_utf8(&mut buf);
            bytes.extend_from_slice(encoded.as_bytes());
        }
    }
    String::from_utf8(bytes).ok()
}

fn start_local_streaming_server(app: AppHandle) {
    std::thread::spawn(move || {
        let listener = match std::net::TcpListener::bind("127.0.0.1:0") {
            Ok(l) => l,
            Err(e) => {
                eprintln!("[StreamServer] Failed to bind local streaming server: {e}");
                return;
            }
        };

        let port = match listener.local_addr() {
            Ok(addr) => addr.port(),
            Err(e) => {
                eprintln!("[StreamServer] Failed to get local addr: {e}");
                return;
            }
        };

        STREAM_SERVER_PORT.store(port, Ordering::SeqCst);
        println!("[StreamServer] Local audio streaming server listening on 127.0.0.1:{port}");

        for stream in listener.incoming() {
            let mut stream = match stream {
                Ok(s) => s,
                Err(_) => continue,
            };

            let app_clone = app.clone();
            std::thread::spawn(move || {
                handle_stream_client(&app_clone, &mut stream);
            });
        }
    });
}

fn handle_stream_client(app: &AppHandle, stream: &mut std::net::TcpStream) {
    use std::io::{BufRead, BufReader, Read, Seek, SeekFrom, Write};

    let clone = match stream.try_clone() {
        Ok(c) => c,
        Err(_) => return,
    };
    let mut reader = BufReader::new(clone);
    let mut request_line = String::new();
    if reader.read_line(&mut request_line).is_err() || request_line.is_empty() {
        return;
    }

    let mut range_header: Option<String> = None;
    let mut line = String::new();
    while reader.read_line(&mut line).is_ok() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            break;
        }
        if trimmed.to_ascii_lowercase().starts_with("range:") {
            range_header = Some(trimmed[6..].trim().to_string());
        }
        line.clear();
    }

    let parts: Vec<&str> = request_line.split_whitespace().collect();
    if parts.len() < 2 {
        let _ = stream.write_all(b"HTTP/1.1 400 Bad Request\r\n\r\n");
        return;
    }

    if parts[0] == "OPTIONS" {
        let _ = stream.write_all(
            b"HTTP/1.1 204 No Content\r\n\
              Access-Control-Allow-Origin: *\r\n\
              Access-Control-Allow-Methods: GET, OPTIONS\r\n\
              Access-Control-Allow-Headers: *\r\n\
              Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges\r\n\r\n",
        );
        return;
    }

    let is_head = parts[0] == "HEAD";
    if parts[0] != "GET" && !is_head {
        let _ = stream.write_all(b"HTTP/1.1 405 Method Not Allowed\r\n\r\n");
        return;
    }

    let raw_path = parts[1].trim_start_matches('/');
    let clean_path = raw_path.split('?').next().unwrap_or("");
    let filename = match percent_decode(clean_path) {
        Some(f) => f,
        None => clean_path.to_string(),
    };

    let file_path = match resolve_audio_file(app, &filename) {
        Some(p) => p,
        None => {
            let _ = stream.write_all(
                b"HTTP/1.1 404 Not Found\r\n\
                  Content-Type: text/plain\r\n\
                  Access-Control-Allow-Origin: *\r\n\
                  Access-Control-Allow-Headers: *\r\n\
                  Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges\r\n\r\n\
                  File Not Found",
            );
            return;
        }
    };

    let mut file = match fs::File::open(&file_path) {
        Ok(f) => f,
        Err(_) => {
            let _ = stream.write_all(
                b"HTTP/1.1 404 Not Found\r\n\
                  Content-Type: text/plain\r\n\
                  Access-Control-Allow-Origin: *\r\n\
                  Access-Control-Allow-Headers: *\r\n\
                  Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges\r\n\r\n\
                  File Not Found",
            );
            return;
        }
    };

    let total_len = match file.metadata() {
        Ok(m) => m.len(),
        Err(_) => return,
    };

    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let content_type = match ext.as_str() {
        "mp3" => "audio/mpeg",
        "flac" => "audio/flac",
        "m4a" | "aac" => "audio/mp4",
        "ogg" | "opus" => "audio/ogg",
        "wav" => "audio/wav",
        "mp4" | "m4v" => "video/mp4",
        "webm" => "audio/webm",
        _ => "application/octet-stream",
    };

    if let Some(range_str) = range_header {
        if let Some(bytes_spec) = range_str.strip_prefix("bytes=") {
            let range_parts: Vec<&str> = bytes_spec.split('-').collect();
            let start: u64 = range_parts[0].parse().unwrap_or(0);
            let end: u64 = if range_parts.len() > 1 && !range_parts[1].is_empty() {
                range_parts[1].parse().unwrap_or(total_len.saturating_sub(1))
            } else {
                total_len.saturating_sub(1)
            };

            if start >= total_len || end >= total_len || start > end {
                let header = format!(
                    "HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */{}\r\nAccess-Control-Allow-Origin: *\r\n\r\n",
                    total_len
                );
                let _ = stream.write_all(header.as_bytes());
                return;
            }

            let chunk_size = end - start + 1;
            let response_headers = format!(
                "HTTP/1.1 206 Partial Content\r\n\
                 Accept-Ranges: bytes\r\n\
                 Content-Range: bytes {}-{}/{}\r\n\
                 Content-Length: {}\r\n\
                 Content-Type: {}\r\n\
                 Access-Control-Allow-Origin: *\r\n\
                 Access-Control-Allow-Headers: *\r\n\
                 Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges\r\n\
                 Connection: close\r\n\r\n",
                start, end, total_len, chunk_size, content_type
            );

            if stream.write_all(response_headers.as_bytes()).is_err() {
                return;
            }

            if is_head {
                return;
            }

            if file.seek(SeekFrom::Start(start)).is_err() {
                return;
            }

            let mut remaining = chunk_size;
            let mut buf = [0u8; 64 * 1024];
            while remaining > 0 {
                let to_read = std::cmp::min(remaining as usize, buf.len());
                let n = match file.read(&mut buf[..to_read]) {
                    Ok(0) => break,
                    Ok(n) => n,
                    Err(_) => break,
                };
                if stream.write_all(&buf[..n]).is_err() {
                    break;
                }
                remaining -= n as u64;
            }
            return;
        }
    }

    // 200 OK
    let response_headers = format!(
        "HTTP/1.1 200 OK\r\n\
         Accept-Ranges: bytes\r\n\
         Content-Length: {}\r\n\
         Content-Type: {}\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Access-Control-Allow-Headers: *\r\n\
         Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges\r\n\
         Connection: close\r\n\r\n",
        total_len, content_type
    );

    if stream.write_all(response_headers.as_bytes()).is_err() {
        return;
    }

    if is_head {
        return;
    }

    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = match file.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => n,
            Err(_) => break,
        };
        if stream.write_all(&buf[..n]).is_err() {
            break;
        }
    }
}

fn resolve_bundled_bin(name: &str) -> Option<PathBuf> {
    if let Ok(snap) = std::env::var("SNAP") {
        let p1 = PathBuf::from(&snap).join("opt/brave-music/backend/bin").join(name);
        if p1.exists() {
            return Some(p1);
        }
        let p2 = PathBuf::from(&snap).join("bin").join(name);
        if p2.exists() {
            return Some(p2);
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let beside = dir.join("backend/bin").join(name);
            if beside.exists() {
                return Some(beside);
            }
        }
    }
    let candidates = [
        PathBuf::from("/opt/brave-music/backend/bin").join(name),
        PathBuf::from("/usr/lib/brave-music/backend/bin").join(name),
        PathBuf::from("/home/uzairserver/Workspace/Repositories/brave-music/backend/bin").join(name),
        std::env::var_os("HOME")
            .map(PathBuf::from)
            .unwrap_or_default()
            .join(".local/bin")
            .join(name),
        PathBuf::from("/usr/local/bin").join(name),
        PathBuf::from("/usr/bin").join(name),
        PathBuf::from("/bin").join(name),
    ];
    for c in candidates {
        if c.exists() {
            return Some(c);
        }
    }
    None
}

#[derive(serde::Deserialize, Debug)]
struct SpotifyEmbedTrack {
    title: String,
    artist: String,
    duration: u64,
    thumbnail: String,
}

#[derive(serde::Deserialize, Debug)]
struct SpotifyEmbedMetadata {
    kind: String,
    name: String,
    #[serde(rename = "coverUrl")]
    cover_url: String,
    tracks: Vec<SpotifyEmbedTrack>,
}

fn fetch_spotify_embed_metadata(url: &str) -> Option<SpotifyEmbedMetadata> {
    let py_script = r#"
import sys, re, json, os, urllib.request

HASH = 'b39f62e9b566aa849b1780927de1450f47e02c54abf1e66e513f96e849591e41'
BOOT_ID = '37i9dQZF1DXcBWIGoYBM5M'
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

raw_url = sys.argv[1].strip()
if re.match(r'^https?://spotify\.(link|app\.link)/', raw_url, re.I):
    try:
        req = urllib.request.Request(raw_url, headers={'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=8) as r:
            raw_url = r.geturl()
    except Exception:
        pass

m = re.search(r'open\.spotify\.com/(?:intl-[a-z-]+/)?(track|album|playlist|episode|artist)/([a-zA-Z0-9]+)', raw_url, re.I) or \
    re.search(r'spotify:(track|album|playlist|episode|artist):([a-zA-Z0-9]+)', raw_url, re.I)
if not m:
    sys.exit(1)

kind, sid = m.group(1).lower(), m.group(2)

sp_dc = ''
xdg_cfg = os.environ.get('XDG_CONFIG_HOME') or os.path.expanduser('~/.config')
sess_path = os.path.join(xdg_cfg, 'brave-music', 'spotify_session.json')
if not os.path.exists(sess_path):
    sess_path = os.path.expanduser('~/.config/brave-music/spotify_session.json')
if os.path.exists(sess_path):
    try:
        with open(sess_path, 'r', encoding='utf-8') as f:
            sdata = json.load(f)
        if isinstance(sdata, list):
            for c in sdata:
                if isinstance(c, dict) and c.get('name') == 'sp_dc' and c.get('value'):
                    sp_dc = c['value']
                    break
        elif isinstance(sdata, dict) and sdata.get('sp_dc'):
            sp_dc = sdata['sp_dc']
    except Exception:
        pass

def get_embed(t, i):
    hdrs = {'User-Agent': UA}
    if sp_dc:
        hdrs['Cookie'] = f'sp_dc={sp_dc}'
    try:
        req = urllib.request.Request(f'https://open.spotify.com/embed/{t}/{i}', headers=hdrs)
        html = urllib.request.urlopen(req, timeout=12).read().decode('utf-8', 'ignore')
        sm = re.search(r'<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)</script>', html)
        if not sm:
            return None, None
        st = json.loads(sm.group(1)).get('props', {}).get('pageProps', {}).get('state', {})
        return st.get('data', {}).get('entity'), st.get('settings', {}).get('session')
    except Exception:
        return None, None

entity, sess = get_embed(kind, sid)

if kind == 'playlist':
    token = (sess or {}).get('accessToken') or ''
    if not token and sp_dc:
        _, boot_sess = get_embed('playlist', BOOT_ID)
        token = (boot_sess or {}).get('accessToken') or ''
    if token:
        all_tracks = []
        pname = ''
        pcover = ''
        total = None
        for offset in range(0, 1000, 100):
            body = json.dumps({
                'variables': {'uri': f'spotify:playlist:{sid}', 'offset': offset, 'limit': 100, 'enableWatchFeedEntrypoint': False},
                'operationName': 'fetchPlaylist',
                'extensions': {'persistedQuery': {'version': 1, 'sha256Hash': HASH}},
            }).encode('utf-8')
            req = urllib.request.Request(
                'https://api-partner.spotify.com/pathfinder/v1/query',
                data=body,
                headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json', 'app-platform': 'WebPlayer', 'User-Agent': UA},
            )
            try:
                resp = json.loads(urllib.request.urlopen(req, timeout=12).read().decode('utf-8', 'ignore'))
            except Exception:
                break
            pl = (resp.get('data') or {}).get('playlistV2') or {}
            if not pl or pl.get('__typename') in ('NotFound', 'GenericError'):
                break
            if not pname and pl.get('name'):
                pname = pl['name'].strip()
            if not pcover:
                imgs = ((pl.get('images') or {}).get('items') or [{}])[0].get('sources') or []
                if imgs:
                    pcover = imgs[-1].get('url') or imgs[0].get('url') or ''
            content = pl.get('content') or {}
            items = content.get('items') or []
            if not items:
                break
            if isinstance(content.get('totalCount'), int):
                total = content['totalCount']
            for entry in items:
                td = ((entry or {}).get('itemV2') or {}).get('data') or {}
                tt = td.get('name') or td.get('title') or ''
                if not tt:
                    continue
                artists = [a.get('profile', {}).get('name', '') for a in ((td.get('artists') or {}).get('items') or [])]
                artists = [a for a in artists if a]
                asrcs = ((td.get('albumOfTrack') or {}).get('coverArt') or {}).get('sources') or []
                tthumb = (asrcs[-1].get('url') or asrcs[0].get('url')) if asrcs else pcover
                dur = int(round(((td.get('trackDuration') or {}).get('totalMilliseconds') or 0) / 1000))
                all_tracks.append({'title': tt, 'artist': ', '.join(artists) or 'Unknown Artist', 'duration': dur, 'thumbnail': tthumb or pcover})
            if len(items) < 100 or (total is not None and len(all_tracks) >= total):
                break
        if all_tracks:
            if not pcover and entity:
                pcover = ((entity.get('coverArt') or {}).get('sources') or [{}])[0].get('url') or ''
            print(json.dumps({'kind': 'playlist', 'name': pname or 'Spotify Playlist', 'coverUrl': pcover, 'tracks': all_tracks}))
            sys.exit(0)

if not entity:
    sys.exit(1)

name = (entity.get('name') or entity.get('title') or 'Spotify').strip()
cover = ((entity.get('coverArt') or {}).get('sources') or [{}])[0].get('url') or ((entity.get('visualIdentity') or {}).get('image') or [{}])[0].get('url') or ''
if kind in ('playlist', 'album', 'artist'):
    tracks = []
    for t in (entity.get('trackList') or []):
        t_title = t.get('title') or t.get('name') or ''
        t_artist = (t.get('subtitle') or ', '.join(a.get('name','') for a in (t.get('artists') or [])) or (name if kind == 'artist' else 'Unknown Artist')).replace('\u00a0', ' ').strip()
        t_dur = int(round((t.get('duration') or 0) / 1000))
        if t_title:
            tracks.append({'title': t_title, 'artist': t_artist, 'duration': t_dur, 'thumbnail': cover})
    print(json.dumps({'kind': 'playlist' if kind in ('playlist', 'artist') else 'album', 'name': name, 'coverUrl': cover, 'tracks': tracks}))
else:
    artist = (', '.join(a.get('name','') for a in (entity.get('artists') or [])) or entity.get('subtitle') or 'Unknown Artist').replace('\u00a0', ' ')
    dur = int(round((entity.get('duration') or 0) / 1000))
    print(json.dumps({'kind': 'track', 'name': name, 'coverUrl': cover, 'tracks': [{'title': name, 'artist': artist, 'duration': dur, 'thumbnail': cover}]}))
"#;
    let output = std::process::Command::new("python3")
        .arg("-c")
        .arg(py_script)
        .arg(url)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    serde_json::from_slice::<SpotifyEmbedMetadata>(&output.stdout).ok()
}

#[derive(Debug, Clone)]
struct SearchCandidate<'a> {
    id: &'a str,
    title: &'a str,
    uploader: &'a str,
    duration: i64,
    url: &'a str,
    is_live: bool,
}

fn score_yt_candidate(cand: &SearchCandidate, target_title: &str, target_artist: &str, target_duration: i64, is_video: bool) -> i32 {
    if cand.id.is_empty() || cand.is_live || cand.duration > 900 {
        return -500;
    }
    let cand_title = cand.title.to_lowercase();
    let cand_uploader = cand.uploader.to_lowercase();
    let t_title = target_title.to_lowercase();
    let primary_artist = target_artist
        .split(|c| c == ',' || c == ';' || c == '&')
        .next()
        .unwrap_or("")
        .trim()
        .to_lowercase();

    if cand.url.contains("/shorts/") || cand_title.contains("#shorts") {
        return -250;
    }

    let mut score: i32 = 0;
    if cand_uploader.ends_with("- topic") || cand_title.contains("provided to youtube") {
        score += if is_video { 15 } else { 42 };
    } else if cand_uploader.contains("vevo") {
        score += if is_video { 36 } else { 22 };
    }

    if !primary_artist.is_empty() && primary_artist != "unknown artist" && (cand_uploader.contains(&primary_artist) || cand_title.contains(&primary_artist)) {
        score += 24;
    }

    let tokens: Vec<String> = t_title
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.len() >= 2)
        .map(|w| w.to_string())
        .collect();
    if !tokens.is_empty() {
        let matched = tokens.iter().filter(|w| cand_title.contains(w.as_str())).count();
        score += ((matched as f32 / tokens.len() as f32) * 32.0).round() as i32;
    }

    if target_duration > 15 && cand.duration > 0 {
        let diff = (cand.duration - target_duration).abs();
        if diff <= 4 {
            score += 26;
        } else if diff <= 12 {
            score += 14;
        } else if diff <= 25 {
            score += 4;
        } else if diff > 60 {
            score -= 36;
        }
    }

    if is_video {
        if cand_title.contains("official music video") || cand_title.contains("official video") {
            score += 16;
        }
    } else if cand_title.contains("official audio") || cand_title.contains("audio") {
        score += 14;
    }

    for tag in [
        "slowed", "reverb", "nightcore", "8d ", "sped up", "karaoke",
        "instrumental", "cover", "reaction", "parody", "live at", "concert", "teaser", "trailer", "remix",
    ] {
        if cand_title.contains(tag) && !t_title.contains(tag.trim()) {
            score -= 45;
        }
    }

    score
}

fn run_command_output_tracked(cmd: &mut std::process::Command) -> std::io::Result<std::process::Output> {
    if APP_SHUTTING_DOWN.load(Ordering::SeqCst) {
        return Err(std::io::Error::new(std::io::ErrorKind::Interrupted, "Application shutting down"));
    }
    cmd.stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    let child = cmd.spawn()?;
    let pid = child.id();
    register_child_pid(pid);
    let output = child.wait_with_output();
    unregister_child_pid(pid);
    output
}

fn resolve_validated_js_runtime() -> Option<String> {
    CACHED_JS_RUNTIME
        .get_or_init(|| {
            if let Some(qb) = resolve_bundled_bin("qjs").filter(|p| {
                std::process::Command::new(p)
                    .args(["-e", "0"])
                    .output()
                    .map(|o| o.status.success())
                    .unwrap_or(false)
            }) {
                return Some(format!("quickjs:{}", qb.to_string_lossy()));
            }
            resolve_bundled_bin("node")
                .filter(|nb| {
                    std::process::Command::new(nb)
                        .arg("--version")
                        .output()
                        .map(|o| o.status.success())
                        .unwrap_or(false)
                })
                .map(|nb| format!("node:{}", nb.to_string_lossy()))
        })
        .clone()
}

fn resolve_ffmpeg_dir() -> Option<PathBuf> {
    CACHED_FFMPEG_DIR
        .get_or_init(|| {
            let ffmpeg_bin = resolve_bundled_bin("ffmpeg")?;
            let _ffprobe_bin = resolve_bundled_bin("ffprobe")?;
            ffmpeg_bin.parent().map(|p| p.to_path_buf())
        })
        .clone()
}

fn create_ytdlp_base_command(
    ytdlp_bin: &PathBuf,
    js_runtime: Option<&str>,
    ffmpeg_dir: Option<&PathBuf>,
) -> std::process::Command {
    let mut cmd = std::process::Command::new(ytdlp_bin);
    cmd.arg("--ignore-config")
        .arg("--no-update")
        .arg("--no-warnings")
        .arg("--extractor-args")
        .arg("youtube:player_client=web_embedded,tv_simply,android,web");
    if let Some(rt) = js_runtime {
        cmd.arg("--js-runtimes").arg(rt);
    }
    if let Some(fd) = ffmpeg_dir {
        cmd.arg("--ffmpeg-location")
            .arg(fd.to_string_lossy().as_ref());
    }
    cmd
}

fn resolve_best_spotify_youtube_url(ytdlp_bin: &PathBuf, title: &str, artist: &str, target_duration: i64, is_video: bool) -> String {
    let suffix = if is_video { "official music video" } else { "official audio" };
    let search_query = format!("ytsearch5:{} {} {}", title, artist, suffix);
    let js_runtime = resolve_validated_js_runtime();
    let mut cmd = create_ytdlp_base_command(ytdlp_bin, js_runtime.as_deref(), None);
    cmd.arg("--dump-single-json")
        .arg("--flat-playlist")
        .arg("--socket-timeout")
        .arg("10")
        .arg(&search_query);
    let output = run_command_output_tracked(&mut cmd);

    if let Ok(out) = output {
        if out.status.success() {
            if let Ok(val) = serde_json::from_slice::<Value>(&out.stdout) {
                if let Some(entries) = val.get("entries").and_then(|e| e.as_array()) {
                    let mut best_id = String::new();
                    let mut best_score = i32::MIN;
                    for entry in entries {
                        let id = entry.get("id").and_then(|v| v.as_str()).unwrap_or("");
                        let e_title = entry.get("title").and_then(|v| v.as_str()).unwrap_or("");
                        let uploader = entry.get("uploader").or_else(|| entry.get("channel")).and_then(|v| v.as_str()).unwrap_or("");
                        let dur = entry.get("duration").and_then(|v| v.as_f64()).map(|d| d.round() as i64).unwrap_or(0);
                        let e_url = entry.get("url").and_then(|v| v.as_str()).unwrap_or("");
                        let is_live = entry.get("live_status").and_then(|v| v.as_str()) == Some("is_live");
                        let s = score_yt_candidate(&SearchCandidate { id, title: e_title, uploader, duration: dur, url: e_url, is_live }, title, artist, target_duration, is_video);
                        if !id.is_empty() && s > best_score {
                            best_score = s;
                            best_id = id.to_string();
                        }
                    }
                    if !best_id.is_empty() && best_score > -100 {
                        return format!("https://www.youtube.com/watch?v={}", best_id);
                    }
                }
            }
        }
    }

    format!("ytsearch1:{} {} {}", title, artist, suffix)
}

#[tauri::command]
async fn get_recommendations(
    app_handle: tauri::AppHandle,
    current_track_id: Option<String>,
    limit: Option<usize>,
    force_refresh: Option<bool>,
) -> Result<Value, String> {
    let force = force_refresh.unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || compute_recommendations(&app_handle, current_track_id, limit, force))
        .await
        .map_err(|e| format!("Recommendations task failed: {e}"))?
}

fn compute_recommendations(
    app_handle: &tauri::AppHandle,
    current_track_id: Option<String>,
    limit: Option<usize>,
    force_refresh: bool,
) -> Result<Value, String> {
    let max_items = limit.unwrap_or(6).min(12);
    let doc = read_library(app_handle).unwrap_or_default();
    let cur_id = current_track_id.unwrap_or_default();

    let mut owned_titles = std::collections::HashSet::new();
    let mut owned_ids = std::collections::HashSet::new();
    let mut artist_counts: std::collections::HashMap<String, i32> = std::collections::HashMap::new();

    for t in &doc.tracks {
        let title = t.get("title").and_then(|v| v.as_str()).unwrap_or("");
        let lower_title = title.to_lowercase();
        if lower_title.contains("never gonna give you up") {
            continue;
        }
        owned_titles.insert(lower_title);
        if let Some(oid) = t.get("originalId").and_then(|v| v.as_str()) {
            owned_ids.insert(oid.to_string());
        }
        let artist = t.get("artist").and_then(|v| v.as_str()).unwrap_or("").split(|c| c == ',' || c == ';' || c == '&').next().unwrap_or("").trim();
        if !artist.is_empty() && !artist.eq_ignore_ascii_case("unknown artist") && !artist.eq_ignore_ascii_case("brave music") {
            let bonus = if t.get("id").and_then(|v| v.as_str()) == Some(cur_id.as_str()) { 5 } else { 1 };
            *artist_counts.entry(artist.to_string()).or_insert(0) += bonus;
        }
    }

    let mut ranked_artists: Vec<(String, i32)> = artist_counts.into_iter().collect();
    ranked_artists.sort_by(|a, b| b.1.cmp(&a.1));
    let seed_artists: Vec<String> = ranked_artists.into_iter().take(3).map(|(a, _)| a).collect();

    let cache_key = format!(
        "{}|{}|{}|{}",
        seed_artists.first().map(String::as_str).unwrap_or(""),
        cur_id,
        doc.tracks.len(),
        max_items
    );
    if !force_refresh {
        if let Ok(guard) = RECOMMENDATIONS_CACHE.lock() {
            if let Some((cached_key, cached_at, cached_val)) = guard.as_ref() {
                if cached_key == &cache_key && cached_at.elapsed() < std::time::Duration::from_secs(600) {
                    return Ok(cached_val.clone());
                }
            }
        }
    }

    let mut items: Vec<Value> = Vec::new();
    if let Some(seed_artist) = seed_artists.first() {
        if let Some(ytdlp_bin) = resolve_bundled_bin("yt-dlp") {
            let js_runtime = resolve_validated_js_runtime();
            let mut cmd = create_ytdlp_base_command(&ytdlp_bin, js_runtime.as_deref(), None);
            cmd.args(["--dump-single-json", "--flat-playlist", "--socket-timeout", "6", &format!("ytsearch6:{} official audio mix", seed_artist)]);
            if let Ok(out) = run_command_output_tracked(&mut cmd)
            {
                if out.status.success() {
                    if let Ok(val) = serde_json::from_slice::<Value>(&out.stdout) {
                        if let Some(entries) = val.get("entries").and_then(|e| e.as_array()) {
                            for entry in entries {
                                let id = entry.get("id").and_then(|v| v.as_str()).unwrap_or("");
                                let title = entry.get("title").and_then(|v| v.as_str()).unwrap_or("");
                                let dur = entry.get("duration").and_then(|v| v.as_f64()).map(|d| d.round() as i64).unwrap_or(0);
                                if id.is_empty() || title.is_empty() || owned_ids.contains(id) || owned_titles.contains(&title.to_lowercase()) || dur > 600 || (dur > 0 && dur < 70) {
                                    continue;
                                }
                                let uploader = entry.get("uploader").and_then(|v| v.as_str()).unwrap_or(seed_artist);
                                owned_ids.insert(id.to_string());
                                owned_titles.insert(title.to_lowercase());
                                items.push(serde_json::json!({
                                    "id": id,
                                    "title": title,
                                    "artist": uploader.replace(" - Topic", ""),
                                    "duration": dur,
                                    "thumbnail": format!("https://i.ytimg.com/vi/{}/hqdefault.jpg", id),
                                    "url": format!("https://www.youtube.com/watch?v={}", id),
                                    "reason": format!("Inspired by {}", seed_artist),
                                    "source": "youtube"
                                }));
                                if items.len() >= max_items {
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if items.is_empty() {
        let starters = [
            ("4NRXx6U8ABQ", "Blinding Lights", "The Weeknd", "Synth-Pop Classic"),
            ("dX3k_QDnzHE", "Midnight City", "M83", "Electronic Anthem"),
            ("TUVcZfQe-Kw", "Levitating", "Dua Lipa", "Upbeat Pop"),
            ("34Na4j8AVgA", "Starboy", "The Weeknd ft. Daft Punk", "Essential Mix"),
        ];
        for (id, title, artist, reason) in starters {
            if !owned_titles.contains(&title.to_lowercase()) {
                items.push(serde_json::json!({
                    "id": id,
                    "title": title,
                    "artist": artist,
                    "thumbnail": format!("https://i.ytimg.com/vi/{}/hqdefault.jpg", id),
                    "url": format!("https://www.youtube.com/watch?v={}", id),
                    "reason": reason,
                    "source": "youtube"
                }));
            }
        }
    }

    let result = serde_json::json!({
        "success": true,
        "mode": if seed_artists.is_empty() { "starter" } else { "personalized" },
        "seedArtists": seed_artists,
        "items": items
    });
    if let Ok(mut guard) = RECOMMENDATIONS_CACHE.lock() {
        *guard = Some((cache_key, std::time::Instant::now(), result.clone()));
    }
    Ok(result)
}

fn fetch_youtube_playlist_queue(ytdlp_bin: &PathBuf, url: &str) -> Option<(String, String, Vec<(String, Option<SpotifyEmbedTrack>)>)> {
    let trimmed = url.trim();
    let list_pos = trimmed.to_lowercase().find("list=")?;
    let rest = &trimmed[list_pos + 5..];
    let list_id: String = rest.chars().take_while(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-').collect();
    if list_id.is_empty() {
        return None;
    }
    let upper = list_id.to_uppercase();
    let is_dynamic_mix = upper.starts_with("RD") && !upper.starts_with("RDCLAK");
    let target_url = if is_dynamic_mix {
        trimmed.to_string()
    } else {
        format!("https://www.youtube.com/playlist?list={list_id}")
    };
    let item_limit = if is_dynamic_mix { "1:35" } else { "1:500" };

    let js_runtime = resolve_validated_js_runtime();
    let mut cmd = create_ytdlp_base_command(ytdlp_bin, js_runtime.as_deref(), None);
    cmd.args(["--flat-playlist", "--playlist-items", item_limit, "--dump-single-json", "--socket-timeout", "15", &target_url]);
    let out = run_command_output_tracked(&mut cmd)
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let parsed: Value = serde_json::from_slice(&out.stdout).ok()?;
    let title = parsed.get("title").and_then(|v| v.as_str()).unwrap_or("YouTube Playlist").trim().to_string();
    let cover = parsed.get("thumbnails")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.last())
        .and_then(|t| t.get("url"))
        .and_then(|u| u.as_str())
        .or_else(|| parsed.get("thumbnail").and_then(|v| v.as_str()))
        .unwrap_or("")
        .to_string();
    let entries = parsed.get("entries").and_then(|v| v.as_array())?;
    let mut items = Vec::new();
    for entry in entries {
        let vid = entry.get("id").and_then(|v| v.as_str()).unwrap_or("");
        let vtitle = entry.get("title").and_then(|v| v.as_str()).unwrap_or("");
        if vid.is_empty() || vtitle.is_empty() || vtitle == "[Deleted video]" || vtitle == "[Private video]" {
            continue;
        }
        let vurl = entry.get("url").and_then(|v| v.as_str()).map(|s| s.to_string()).unwrap_or_else(|| format!("https://www.youtube.com/watch?v={vid}"));
        items.push((vurl, None));
    }
    if items.is_empty() {
        return None;
    }
    Some((title, cover, items))
}

#[tauri::command]
async fn start_download(app: AppHandle, params: DownloadParams) -> Result<Value, String> {
    let url = params.url.trim().to_string();
    if url.is_empty() {
        return Err("Download URL is required".to_string());
    }

    let download_id = format!("dl-{}", uuid::Uuid::new_v4());
    let id_clone = download_id.clone();
    let is_playlist = params.is_playlist.unwrap_or(false);
    let requested_format = params.format.unwrap_or_else(|| "audio-mp3".to_string());
    let mut target_playlist = params.playlist_name.unwrap_or_default();

    let downloads_dir = get_user_downloads_dir(&app);
    let _ = fs::create_dir_all(&downloads_dir);

    let app_handle = app.clone();
    let canceled_flag = Arc::new(AtomicBool::new(false));
    let canceled_clone = canceled_flag.clone();

    let res = tauri::async_runtime::spawn_blocking(move || -> Result<Value, String> {
        let _ = app_handle.emit("download-progress", DownloadProgressData {
            download_id: id_clone.clone(),
            pct: 5,
            percent: 5,
            item_index: 1,
            item_total: 1,
            title: "Resolving stream & audio metadata...".to_string(),
            artist: "Brave Music Downloader".to_string(),
            speed: "".to_string(),
            status: "Fetching stream information via yt-dlp...".to_string(),
            complete: false,
            track_saved: None,
        });

        let ytdlp_bin = resolve_bundled_bin("yt-dlp").unwrap_or_else(|| PathBuf::from("yt-dlp"));
        let js_runtime = resolve_validated_js_runtime();
        let ffmpeg_dir = resolve_ffmpeg_dir();
        let has_ffmpeg = ffmpeg_dir.is_some();

        let lower_url = url.to_lowercase();
        let is_spotify = lower_url.contains("open.spotify.com/") || lower_url.starts_with("spotify:") || lower_url.contains("spotify.link/") || lower_url.contains("spotify.app.link/");
        let is_spotify_collection = is_spotify && (lower_url.contains("/playlist/") || lower_url.contains("/album/") || lower_url.contains("/artist/") || lower_url.contains("spotify:playlist:") || lower_url.contains("spotify:album:") || lower_url.contains("spotify:artist:"));
        let spotify_meta = if is_spotify {
            fetch_spotify_embed_metadata(&url)
        } else {
            None
        };

        // Build queue of items to download (supports Spotify playlists/mixes, single Spotify tracks, and YouTube playlists/mixes in exact order)
        let queue_items: Vec<(String, Option<SpotifyEmbedTrack>)> = if let Some(ref meta) = spotify_meta {
            if (meta.kind == "playlist" || meta.kind == "album") && !meta.tracks.is_empty() {
                if target_playlist.is_empty() {
                    target_playlist = meta.name.clone();
                }
                if let Ok(mut doc) = read_library(&app_handle) {
                    let cover_opt = if meta.cover_url.is_empty() { None } else { Some(Value::String(meta.cover_url.clone())) };
                    let _ = doc.create_playlist(&target_playlist, cover_opt.clone());
                    if let Some(c) = cover_opt {
                        let _ = doc.set_playlist_cover(&target_playlist, c);
                    }
                    let _ = write_library(&app_handle, &doc);
                    let _ = app_handle.emit("library-updated", serde_json::json!({ "status": "playlist_created", "name": target_playlist }));
                }
                let is_vid = requested_format.contains("video");
                meta.tracks
                    .iter()
                    .map(|t| {
                        (
                            resolve_best_spotify_youtube_url(&ytdlp_bin, &t.title, &t.artist, t.duration as i64, is_vid),
                            Some(SpotifyEmbedTrack {
                                title: t.title.clone(),
                                artist: t.artist.clone(),
                                duration: t.duration,
                                thumbnail: t.thumbnail.clone(),
                            }),
                        )
                    })
                    .collect()
            } else if is_spotify_collection {
                return Err("Could not extract tracks from this Spotify playlist or mix. For personalized mixes (Daily Mix, Blend, Daylist), sign in to Spotify in Brave Music first.".to_string());
            } else if let Some(first) = meta.tracks.first() {
                let is_vid = requested_format.contains("video");
                vec![(
                    resolve_best_spotify_youtube_url(&ytdlp_bin, &first.title, &first.artist, first.duration as i64, is_vid),
                    Some(SpotifyEmbedTrack {
                        title: first.title.clone(),
                        artist: first.artist.clone(),
                        duration: first.duration,
                        thumbnail: first.thumbnail.clone(),
                    }),
                )]
            } else {
                vec![(url.clone(), None)]
            }
        } else if is_spotify_collection {
            return Err("Could not extract tracks from this Spotify playlist or mix. For personalized mixes (Daily Mix, Blend, Daylist), sign in to Spotify in Brave Music first.".to_string());
        } else if !is_spotify && (is_playlist || lower_url.contains("list=")) {
            if let Some((yt_name, yt_cover, yt_items)) = fetch_youtube_playlist_queue(&ytdlp_bin, &url) {
                if target_playlist.is_empty() {
                    target_playlist = yt_name;
                }
                if let Ok(mut doc) = read_library(&app_handle) {
                    let cover_opt = if yt_cover.is_empty() { None } else { Some(Value::String(yt_cover)) };
                    let _ = doc.create_playlist(&target_playlist, cover_opt.clone());
                    if let Some(c) = cover_opt {
                        let _ = doc.set_playlist_cover(&target_playlist, c);
                    }
                    let _ = write_library(&app_handle, &doc);
                    let _ = app_handle.emit("library-updated", serde_json::json!({ "status": "playlist_created", "name": target_playlist }));
                }
                yt_items
            } else {
                vec![(url.clone(), None)]
            }
        } else {
            vec![(url.clone(), None)]
        };

        let mut downloaded_tracks = Vec::new();
        let mut stderr_lines = Vec::new();
        let total_queue = queue_items.len() as u32;

        for (q_idx, (effective_url, sp_override)) in queue_items.into_iter().enumerate() {
            let count_before_item = downloaded_tracks.len();
            for use_progressive_fallback in [false, true] {
                if canceled_clone.load(Ordering::SeqCst) {
                    break;
                }
                if use_progressive_fallback
                    && (downloaded_tracks.len() > count_before_item
                        || requested_format.contains("video")
                        || !has_ffmpeg)
                {
                    break;
                }

                let output_template = downloads_dir.join("%(title).100B [%(id)s].%(ext)s");
                let mut cmd = create_ytdlp_base_command(
                    &ytdlp_bin,
                    js_runtime.as_deref(),
                    ffmpeg_dir.as_ref(),
                );

                cmd.arg("--check-formats")
                   .arg("--concurrent-fragments")
                   .arg("4")
                   .arg("--newline")
                   .arg("--progress")
                   .arg("--continue");

                let audio_selector = if use_progressive_fallback {
                    "18/best[ext=mp4]/best"
                } else {
                    "bestaudio/best"
                };

                if requested_format.contains("video") {
                    cmd.arg("-f").arg("best[ext=mp4]/best");
                } else if has_ffmpeg && requested_format.contains("flac") {
                    cmd.arg("-f").arg(audio_selector).arg("-x").arg("--audio-format").arg("flac");
                } else if has_ffmpeg && requested_format.contains("m4a") {
                    let m4a_sel = if use_progressive_fallback { "18/best[ext=mp4]/best" } else { "bestaudio[ext=m4a]/bestaudio/best" };
                    cmd.arg("-f").arg(m4a_sel).arg("-x").arg("--audio-format").arg("m4a");
                } else if has_ffmpeg {
                    cmd.arg("-f").arg(audio_selector).arg("-x").arg("--audio-format").arg("mp3").arg("--audio-quality").arg("0").arg("--postprocessor-args").arg("ExtractAudio+ffmpeg:-b:a 320k");
                } else {
                    cmd.arg("-f").arg("bestaudio[ext=m4a]/bestaudio/best");
                }

                if is_playlist && sp_override.is_none() && total_queue == 1 {
                    cmd.arg("--yes-playlist");
                } else {
                    cmd.arg("--no-playlist");
                }

                cmd.arg("--output").arg(output_template.to_string_lossy().as_ref());
                cmd.arg("--print").arg("after_move:RECORD:%(filepath)s<DELIM>%(id)s<DELIM>%(title)s<DELIM>%(uploader)s<DELIM>%(duration)s<DELIM>%(thumbnail)s");
                cmd.arg(&effective_url);

                cmd.stdout(std::process::Stdio::piped());
                cmd.stderr(std::process::Stdio::piped());

                let mut child = match cmd.spawn() {
                    Ok(c) => c,
                    Err(e) => {
                        let err_msg = format!("Failed to launch yt-dlp: {e}");
                        let _ = app_handle.emit("download-progress", DownloadProgressData {
                            download_id: id_clone.clone(),
                            pct: 0,
                            percent: 0,
                            item_index: 1,
                            item_total: 1,
                            title: "Download Failed".to_string(),
                            artist: "".to_string(),
                            speed: "".to_string(),
                            status: err_msg.clone(),
                            complete: true,
                            track_saved: None,
                        });
                        return Ok(serde_json::json!({
                            "success": false,
                            "downloadId": id_clone,
                            "error": err_msg
                        }));
                    }
                };

                let child_pid = child.id();
                {
                    let mut map = ACTIVE_DOWNLOADS.lock().unwrap();
                    map.insert(id_clone.clone(), ActiveDownloadProcess {
                        pid: child_pid,
                        canceled: canceled_clone.clone(),
                    });
                }

                let stdout = child.stdout.take();
                let stderr = child.stderr.take();

                let stderr_thread = std::thread::spawn(move || {
                    let mut lines = Vec::new();
                    if let Some(err) = stderr {
                        use std::io::{BufRead, BufReader};
                        let reader = BufReader::new(err);
                        for line in reader.lines().map_while(Result::ok) {
                            if !line.trim().is_empty() {
                                lines.push(line);
                            }
                        }
                    }
                    lines
                });

                if let Some(out) = stdout {
                    use std::io::{BufRead, BufReader};
                    let reader = BufReader::new(out);
                    for line in reader.lines().map_while(Result::ok) {
                        if canceled_clone.load(Ordering::SeqCst) {
                            break;
                        }

                        if let Some(record) = line.strip_prefix("RECORD:") {
                            let parts: Vec<&str> = record.split("<DELIM>").collect();
                            if parts.len() >= 4 {
                                let filepath = parts[0];
                                let original_id = parts.get(1).unwrap_or(&"");
                                let raw_title = parts.get(2).unwrap_or(&"Downloaded Track");
                                let raw_artist = parts.get(3).unwrap_or(&"Unknown Artist");
                                let duration_sec: u64 = parts.get(4).and_then(|d| d.parse().ok()).unwrap_or(180);
                                let thumbnail = parts.get(5).unwrap_or(&"");

                                let (clean_title, clean_artist) = if let Some(ref sp) = sp_override {
                                    (sp.title.clone(), sp.artist.clone())
                                } else {
                                    clean_track_metadata(raw_title, raw_artist)
                                };
                                let final_duration = if let Some(ref sp) = sp_override {
                                    if sp.duration > 0 { sp.duration } else { duration_sec }
                                } else {
                                    duration_sec
                                };
                                let final_thumb = if let Some(ref sp) = sp_override {
                                    if !sp.thumbnail.is_empty() { sp.thumbnail.clone() } else { (*thumbnail).to_string() }
                                } else {
                                    (*thumbnail).to_string()
                                };

                                let path_obj = std::path::Path::new(filepath);
                                let filename = path_obj
                                    .file_name()
                                    .map(|f| f.to_string_lossy().to_string())
                                    .unwrap_or_else(|| "track.mp3".to_string());

                                let size_bytes: u64 = fs::metadata(path_obj).map(|m| m.len()).unwrap_or(0);

                                let track_uuid = format!(
                                    "track_{}_{}",
                                    &uuid::Uuid::new_v4().to_string()[..8],
                                    current_timestamp_str()
                                );

                                let format_label = path_obj
                                    .extension()
                                    .and_then(|e| e.to_str())
                                    .map(|s| s.to_uppercase())
                                    .unwrap_or_else(|| "MP3".to_string());

                                let new_track = serde_json::json!({
                                    "id": track_uuid,
                                    "originalId": original_id,
                                    "title": clean_title,
                                    "artist": clean_artist,
                                    "album": if target_playlist.is_empty() { "Downloads".to_string() } else { target_playlist.clone() },
                                    "duration": final_duration,
                                    "thumbnail": final_thumb,
                                    "filename": filename,
                                    "format": format_label,
                                    "source": if sp_override.is_some() { "spotify" } else { "youtube" },
                                    "trackNumber": q_idx + 1,
                                    "downloadUrl": url,
                                    "addedAt": current_timestamp_str(),
                                    "sizeBytes": size_bytes,
                                    "playlist": if target_playlist.is_empty() { Value::Null } else { Value::String(target_playlist.clone()) }
                                });

                                if let Ok(mut doc) = read_library(&app_handle) {
                                    doc.add_track(new_track.clone());
                                    if !target_playlist.is_empty() {
                                        let _ = doc.create_playlist(&target_playlist, None);
                                        let _ = doc.add_track_to_playlist(
                                            &serde_json::Value::String(track_uuid.clone()),
                                            &target_playlist,
                                        );
                                    }
                                    let _ = write_library(&app_handle, &doc);
                                }

                                downloaded_tracks.push(new_track.clone());

                                let _ = app_handle.emit("download-progress", DownloadProgressData {
                                    download_id: id_clone.clone(),
                                    pct: 95,
                                    percent: 95,
                                    item_index: (q_idx as u32) + 1,
                                    item_total: total_queue,
                                    title: clean_title,
                                    artist: clean_artist,
                                    speed: "".to_string(),
                                    status: "Saved to offline library".to_string(),
                                    complete: false,
                                    track_saved: Some(new_track),
                                });
                                let _ = app_handle.emit("library-updated", serde_json::json!({ "status": "updated" }));
                            }
                        } else if line.contains("[download]") && line.contains('%') {
                            let pct = parse_download_percentage(&line).unwrap_or(50);
                            let speed = parse_download_speed(&line).unwrap_or_default();
                            let _ = app_handle.emit("download-progress", DownloadProgressData {
                                download_id: id_clone.clone(),
                                pct,
                                percent: pct,
                                item_index: (q_idx as u32) + 1,
                                item_total: total_queue,
                                title: "Downloading...".to_string(),
                                artist: "".to_string(),
                                speed: speed.clone(),
                                status: if speed.is_empty() { format!("Downloading: {pct}%") } else { format!("Downloading: {pct}% • {speed}") },
                                complete: false,
                                track_saved: None,
                            });
                        }
                    }
                }

                let _ = child.wait();
                if let Ok(err_lines) = stderr_thread.join() {
                    stderr_lines.extend(err_lines);
                }
            }
        }

        let status: Result<std::process::ExitStatus, std::io::Error> = if !downloaded_tracks.is_empty() {
            use std::os::unix::process::ExitStatusExt;
            Ok(std::process::ExitStatus::from_raw(0))
        } else {
            use std::os::unix::process::ExitStatusExt;
            Ok(std::process::ExitStatus::from_raw(256))
        };

        {
            let mut map = ACTIVE_DOWNLOADS.lock().unwrap();
            map.remove(&id_clone);
        }

        if canceled_clone.load(Ordering::SeqCst) {
            let _ = app_handle.emit("download-progress", DownloadProgressData {
                download_id: id_clone.clone(),
                pct: 0,
                percent: 0,
                item_index: 1,
                item_total: 1,
                title: "Download Canceled".to_string(),
                artist: "".to_string(),
                speed: "".to_string(),
                status: "Download canceled by user".to_string(),
                complete: true,
                track_saved: None,
            });
            return Ok(serde_json::json!({
                "success": false,
                "downloadId": id_clone,
                "canceled": true,
                "error": "Download canceled by user"
            }));
        }

        let is_success = status.map(|s| s.success()).unwrap_or(false);
        if !is_success {
            let raw_err = stderr_lines.join(" ");
            let user_msg = if raw_err.contains("matches filter !is_live") {
                "Live streams cannot be downloaded".to_string()
            } else if raw_err.contains("No space left on device") {
                "Storage full: Device ran out of disk space".to_string()
            } else if raw_err.contains("HTTP Error 403") || raw_err.contains("Sign in to confirm") {
                "Provider restricted stream. Try another format or URL.".to_string()
            } else if raw_err.contains("timed out") {
                "Connection timed out while downloading stream".to_string()
            } else if raw_err.contains("Video unavailable") || raw_err.contains("Private video") {
                "This video or track is unavailable or private".to_string()
            } else if let Some(pos) = raw_err.find("ERROR:") {
                raw_err[pos..].lines().next().unwrap_or("Download failed").to_string()
            } else if !raw_err.is_empty() {
                raw_err.lines().next().unwrap_or("Download process exited with error").to_string()
            } else {
                "Download process exited with non-zero status".to_string()
            };

            let _ = app_handle.emit("download-progress", DownloadProgressData {
                download_id: id_clone.clone(),
                pct: 0,
                percent: 0,
                item_index: 1,
                item_total: 1,
                title: "Download Error".to_string(),
                artist: "".to_string(),
                speed: "".to_string(),
                status: user_msg.clone(),
                complete: true,
                track_saved: None,
            });

            return Ok(serde_json::json!({
                "success": false,
                "downloadId": id_clone,
                "error": user_msg
            }));
        }

        if downloaded_tracks.is_empty() {
            let user_msg = "No downloadable media found at the provided URL".to_string();
            let _ = app_handle.emit("download-progress", DownloadProgressData {
                download_id: id_clone.clone(),
                pct: 0,
                percent: 0,
                item_index: 1,
                item_total: 1,
                title: "No Media Found".to_string(),
                artist: "".to_string(),
                speed: "".to_string(),
                status: user_msg.clone(),
                complete: true,
                track_saved: None,
            });
            return Ok(serde_json::json!({
                "success": false,
                "downloadId": id_clone,
                "error": user_msg
            }));
        }

        let track_count = downloaded_tracks.len() as u32;
        let _ = app_handle.emit("download-progress", DownloadProgressData {
            download_id: id_clone.clone(),
            pct: 100,
            percent: 100,
            item_index: track_count,
            item_total: track_count,
            title: "Download Complete".to_string(),
            artist: "".to_string(),
            speed: "".to_string(),
            status: "All tracks saved to offline library".to_string(),
            complete: true,
            track_saved: downloaded_tracks.last().cloned(),
        });
        let _ = app_handle.emit(
            "library-updated",
            serde_json::json!({ "status": "updated", "count": track_count }),
        );

        Ok(serde_json::json!({
            "success": true,
            "downloadId": id_clone,
            "count": track_count,
            "tracks": downloaded_tracks
        }))
    }).await.map_err(|e| e.to_string())?;

    res
}

#[tauri::command]
fn cancel_download(app: AppHandle, download_id: String) -> Result<Value, String> {
    let mut map = ACTIVE_DOWNLOADS.lock().unwrap();
    if let Some(proc) = map.remove(&download_id) {
        proc.canceled.store(true, Ordering::SeqCst);
        let pid = proc.pid;
        let _ = std::process::Command::new("kill")
            .arg("-TERM")
            .arg(pid.to_string())
            .status();

        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(1200));
            let _ = std::process::Command::new("kill")
                .arg("-KILL")
                .arg(pid.to_string())
                .status();
        });

        let _ = app.emit("download-progress", DownloadProgressData {
            download_id: download_id.clone(),
            pct: 0,
            percent: 0,
            item_index: 1,
            item_total: 1,
            title: "Download Canceled".to_string(),
            artist: "".to_string(),
            speed: "".to_string(),
            status: "Download canceled by user".to_string(),
            complete: true,
            track_saved: None,
        });
    }
    Ok(serde_json::json!({ "success": true, "downloadId": download_id }))
}

#[tauri::command]
async fn open_provider(app: AppHandle, provider: String) -> Result<(), String> {
    let address = provider_url(&provider).map_err(str::to_owned)?;
    tauri::async_runtime::spawn_blocking(move || {
        app.opener()
            .open_url(address, None::<&str>)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    let trimmed = url.trim().to_string();
    if !trimmed.starts_with("https://") && !trimmed.starts_with("mailto:") {
        return Err("Only secure https:// and mailto: URLs may be opened".to_owned());
    }
    tauri::async_runtime::spawn_blocking(move || {
        app.opener()
            .open_url(&trimmed, None::<&str>)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn open_folder(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target = get_user_downloads_dir(&app);
        if !target.exists() {
            let _ = fs::create_dir_all(&target);
        }
        app.opener()
            .open_path(target.to_string_lossy().as_ref(), None::<&str>)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn show_in_folder(app: AppHandle, filename: String) -> Result<(), String> {
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return Err("Invalid filename".to_owned());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let target = if let Some(resolved) = resolve_audio_file(&app, &filename) {
            resolved
        } else {
            get_user_downloads_dir(&app).join(&filename)
        };
        app.opener()
            .open_path(target.to_string_lossy().as_ref(), None::<&str>)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn select_download_folder(app: AppHandle) -> Result<Value, String> {
    let folder = app.dialog().file().blocking_pick_folder();
    if let Some(path) = folder {
        let path_buf = path.into_path().map_err(|e| e.to_string())?;
        let path_str = path_buf.to_string_lossy().to_string();

        let home = std::env::var_os("HOME").map(PathBuf::from);
        if let Some(h) = home {
            let dir = h.join(".local/share/brave-music");
            let _ = fs::create_dir_all(&dir);
            let settings_path = dir.join("settings.json");
            let mut settings_json = if let Ok(bytes) = fs::read(&settings_path) {
                serde_json::from_slice::<Value>(&bytes).unwrap_or(serde_json::json!({}))
            } else {
                serde_json::json!({})
            };
            if let Some(obj) = settings_json.as_object_mut() {
                obj.insert("downloadsDir".to_string(), Value::String(path_str.clone()));
            }
            if let Ok(data) = serde_json::to_vec_pretty(&settings_json) {
                let _ = fs::write(&settings_path, data);
            }
        }

        Ok(serde_json::json!({
            "success": true,
            "downloadsDir": path_str
        }))
    } else {
        Ok(serde_json::json!({
            "success": false,
            "canceled": true
        }))
    }
}

fn parse_resize_direction(direction: &str) -> Option<tauri_runtime::ResizeDirection> {
    match direction.trim().to_ascii_lowercase().as_str() {
        "n" | "north" | "top" => Some(tauri_runtime::ResizeDirection::North),
        "s" | "south" | "bottom" => Some(tauri_runtime::ResizeDirection::South),
        "w" | "west" | "left" => Some(tauri_runtime::ResizeDirection::West),
        "e" | "east" | "right" => Some(tauri_runtime::ResizeDirection::East),
        "nw" | "northwest" | "top-left" => Some(tauri_runtime::ResizeDirection::NorthWest),
        "ne" | "northeast" | "top-right" => Some(tauri_runtime::ResizeDirection::NorthEast),
        "sw" | "southwest" | "bottom-left" => Some(tauri_runtime::ResizeDirection::SouthWest),
        "se" | "southeast" | "bottom-right" => Some(tauri_runtime::ResizeDirection::SouthEast),
        _ => None,
    }
}

fn window_state_payload(window: &Window) -> Value {
    let maximized = window.is_maximized().unwrap_or(false);
    let fullscreen = window.is_fullscreen().unwrap_or(false);
    let decorated = window
        .is_decorated()
        .unwrap_or_else(|_| WINDOW_DECORATED.load(Ordering::Relaxed));
    WINDOW_DECORATED.store(decorated, Ordering::Relaxed);
    let always_on_top = window
        .is_always_on_top()
        .unwrap_or_else(|_| WINDOW_ALWAYS_ON_TOP.load(Ordering::Relaxed));
    WINDOW_ALWAYS_ON_TOP.store(always_on_top, Ordering::Relaxed);
    let resizable = window.is_resizable().unwrap_or(true);
    serde_json::json!({
        "maximized": maximized,
        "fullscreen": fullscreen,
        "decorated": decorated,
        "alwaysOnTop": always_on_top,
        "resizable": resizable,
    })
}

fn sync_window_state_and_layout(app: &AppHandle, window: &Window) -> Value {
    #[cfg(target_os = "linux")]
    sync_linux_overlay_margins(window);
    let payload = window_state_payload(window);
    let _ = app.emit("window-state-changed", payload.clone());
    payload
}

fn snap_window_to_half(window: &Window, left: bool) -> Result<Value, String> {
    if window.is_fullscreen().unwrap_or(false) {
        let _ = window.set_fullscreen(false);
    }
    if window.is_maximized().unwrap_or(false) {
        let _ = window.unmaximize();
    }
    let _ = window.set_resizable(true);
    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .or_else(|| window.primary_monitor().ok().flatten())
        .ok_or_else(|| "No active monitor found".to_string())?;
    let area = monitor.work_area();
    let half_w = (area.size.width / 2).max(400);
    let full_h = area.size.height.max(500);
    let target_x = if left {
        area.position.x
    } else {
        area.position.x + (area.size.width as i32 - half_w as i32)
    };
    window
        .set_size(tauri::Size::Physical(tauri::PhysicalSize::new(
            half_w, full_h,
        )))
        .map_err(|e| e.to_string())?;
    window
        .set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(
            target_x,
            area.position.y,
        )))
        .map_err(|e| e.to_string())?;
    Ok(sync_window_state_and_layout(window.app_handle(), window))
}

#[tauri::command]
fn window_minimize(app: AppHandle, window: Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())?;
    let _ = sync_window_state_and_layout(&app, &window);
    Ok(())
}

#[tauri::command]
fn window_maximize(app: AppHandle, window: Window) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())?;
    } else {
        window.maximize().map_err(|e| e.to_string())?;
    }
    let _ = sync_window_state_and_layout(&app, &window);
    Ok(())
}

#[tauri::command]
fn window_close(app: AppHandle, window: Window) -> Result<(), String> {
    cleanup_background_processes(&app);
    let _ = window.close();
    app.exit(0);
    Ok(())
}

#[tauri::command]
fn window_start_dragging(window: Window) -> Result<(), String> {
    if window.is_fullscreen().unwrap_or(false) {
        return Ok(());
    }
    window.start_dragging().map_err(|e| e.to_string())
}

#[tauri::command]
fn window_start_resize_dragging(window: Window, direction: String) -> Result<(), String> {
    if window.is_fullscreen().unwrap_or(false) || window.is_maximized().unwrap_or(false) {
        return Ok(());
    }
    let dir = parse_resize_direction(&direction)
        .ok_or_else(|| format!("Unsupported resize direction: {direction}"))?;
    let _ = window.set_resizable(true);
    window.start_resize_dragging(dir).map_err(|e| e.to_string())
}

#[tauri::command]
fn window_get_state(window: Window) -> Result<Value, String> {
    Ok(window_state_payload(&window))
}

#[tauri::command]
fn window_toggle_fullscreen(app: AppHandle, window: Window) -> Result<Value, String> {
    let next = !window.is_fullscreen().unwrap_or(false);
    window.set_fullscreen(next).map_err(|e| e.to_string())?;
    Ok(sync_window_state_and_layout(&app, &window))
}

#[tauri::command]
fn window_toggle_always_on_top(app: AppHandle, window: Window) -> Result<Value, String> {
    let curr = window
        .is_always_on_top()
        .unwrap_or_else(|_| WINDOW_ALWAYS_ON_TOP.load(Ordering::Relaxed));
    let next = !curr;
    WINDOW_ALWAYS_ON_TOP.store(next, Ordering::Relaxed);
    window.set_always_on_top(next).map_err(|e| e.to_string())?;
    Ok(sync_window_state_and_layout(&app, &window))
}

#[tauri::command]
fn window_toggle_decorations(app: AppHandle, window: Window) -> Result<Value, String> {
    let curr = window
        .is_decorated()
        .unwrap_or_else(|_| WINDOW_DECORATED.load(Ordering::Relaxed));
    let next = !curr;
    WINDOW_DECORATED.store(next, Ordering::Relaxed);
    window.set_decorations(next).map_err(|e| e.to_string())?;
    let _ = window.set_resizable(true);
    Ok(sync_window_state_and_layout(&app, &window))
}

#[tauri::command]
fn window_center(app: AppHandle, window: Window) -> Result<Value, String> {
    if window.is_fullscreen().unwrap_or(false) {
        let _ = window.set_fullscreen(false);
    }
    if window.is_maximized().unwrap_or(false) {
        let _ = window.unmaximize();
    }
    window.center().map_err(|e| e.to_string())?;
    Ok(sync_window_state_and_layout(&app, &window))
}

#[tauri::command]
fn window_reset_size(app: AppHandle, window: Window) -> Result<Value, String> {
    if window.is_fullscreen().unwrap_or(false) {
        let _ = window.set_fullscreen(false);
    }
    if window.is_maximized().unwrap_or(false) {
        let _ = window.unmaximize();
    }
    let _ = window.set_resizable(true);
    window
        .set_size(tauri::Size::Logical(tauri::LogicalSize::new(1100.0, 700.0)))
        .map_err(|e| e.to_string())?;
    let _ = window.center();
    Ok(sync_window_state_and_layout(&app, &window))
}

#[tauri::command]
fn window_snap_left(window: Window) -> Result<Value, String> {
    snap_window_to_half(&window, true)
}

#[tauri::command]
fn window_snap_right(window: Window) -> Result<Value, String> {
    snap_window_to_half(&window, false)
}

#[cfg(target_os = "linux")]
fn popup_ubuntu_window_menu(app: &AppHandle, window: &Window, anchor_x: Option<f64>, anchor_y: Option<f64>) {
    let menu = gtk::Menu::new();
    let is_max = window.is_maximized().unwrap_or(false);
    let is_fs = window.is_fullscreen().unwrap_or(false);
    let is_top = window
        .is_always_on_top()
        .unwrap_or_else(|_| WINDOW_ALWAYS_ON_TOP.load(Ordering::Relaxed));
    let is_dec = window
        .is_decorated()
        .unwrap_or_else(|_| WINDOW_DECORATED.load(Ordering::Relaxed));

    let item_min = gtk::MenuItem::with_label("Minimize");
    {
        let w = window.clone();
        let a = app.clone();
        item_min.connect_activate(move |_| {
            let _ = w.minimize();
            let _ = sync_window_state_and_layout(&a, &w);
        });
    }
    menu.append(&item_min);

    let item_max = gtk::MenuItem::with_label(if is_max { "Unmaximize" } else { "Maximize" });
    {
        let w = window.clone();
        let a = app.clone();
        item_max.connect_activate(move |_| {
            if w.is_maximized().unwrap_or(false) {
                let _ = w.unmaximize();
            } else {
                let _ = w.maximize();
            }
            let _ = sync_window_state_and_layout(&a, &w);
        });
    }
    menu.append(&item_max);

    let item_move = gtk::MenuItem::with_label("Move");
    {
        let w = window.clone();
        let a = app.clone();
        item_move.connect_activate(move |_| {
            let win = w.clone();
            let app_h = a.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(75));
                let _ = app_h.run_on_main_thread(move || {
                    let _ = win.start_dragging();
                });
            });
        });
    }
    menu.append(&item_move);

    let item_resize = gtk::MenuItem::with_label("Resize (Bottom-Right)");
    if is_max || is_fs {
        item_resize.set_sensitive(false);
    }
    {
        let w = window.clone();
        let a = app.clone();
        item_resize.connect_activate(move |_| {
            let win = w.clone();
            let app_h = a.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(75));
                let _ = app_h.run_on_main_thread(move || {
                    let _ = win.set_resizable(true);
                    let _ = win.start_resize_dragging(tauri_runtime::ResizeDirection::SouthEast);
                });
            });
        });
    }
    menu.append(&item_resize);

    menu.append(&gtk::SeparatorMenuItem::new());

    let item_left = gtk::MenuItem::with_label("Tile Left Half");
    {
        let w = window.clone();
        item_left.connect_activate(move |_| {
            let _ = snap_window_to_half(&w, true);
        });
    }
    menu.append(&item_left);

    let item_right = gtk::MenuItem::with_label("Tile Right Half");
    {
        let w = window.clone();
        item_right.connect_activate(move |_| {
            let _ = snap_window_to_half(&w, false);
        });
    }
    menu.append(&item_right);

    let item_center = gtk::MenuItem::with_label("Center on Screen");
    {
        let w = window.clone();
        let a = app.clone();
        item_center.connect_activate(move |_| {
            if w.is_fullscreen().unwrap_or(false) {
                let _ = w.set_fullscreen(false);
            }
            if w.is_maximized().unwrap_or(false) {
                let _ = w.unmaximize();
            }
            let _ = w.center();
            let _ = sync_window_state_and_layout(&a, &w);
        });
    }
    menu.append(&item_center);

    let item_reset = gtk::MenuItem::with_label("Reset Window Size (1100×700)");
    {
        let w = window.clone();
        let a = app.clone();
        item_reset.connect_activate(move |_| {
            let _ = window_reset_size(a.clone(), w.clone());
        });
    }
    menu.append(&item_reset);

    menu.append(&gtk::SeparatorMenuItem::new());

    let item_top = gtk::CheckMenuItem::with_label("Always on Top");
    item_top.set_active(is_top);
    {
        let w = window.clone();
        let a = app.clone();
        item_top.connect_toggled(move |mi| {
            let next = mi.is_active();
            WINDOW_ALWAYS_ON_TOP.store(next, Ordering::Relaxed);
            let _ = w.set_always_on_top(next);
            let _ = sync_window_state_and_layout(&a, &w);
        });
    }
    menu.append(&item_top);

    let item_fs = gtk::CheckMenuItem::with_label("Fullscreen (F11)");
    item_fs.set_active(is_fs);
    {
        let w = window.clone();
        let a = app.clone();
        item_fs.connect_toggled(move |mi| {
            let _ = w.set_fullscreen(mi.is_active());
            let _ = sync_window_state_and_layout(&a, &w);
        });
    }
    menu.append(&item_fs);

    let item_dec = gtk::CheckMenuItem::with_label("System Window Frame (Ubuntu Borders)");
    item_dec.set_active(is_dec);
    {
        let w = window.clone();
        let a = app.clone();
        item_dec.connect_toggled(move |mi| {
            let next = mi.is_active();
            WINDOW_DECORATED.store(next, Ordering::Relaxed);
            let _ = w.set_decorations(next);
            let _ = w.set_resizable(true);
            let _ = sync_window_state_and_layout(&a, &w);
        });
    }
    menu.append(&item_dec);

    menu.append(&gtk::SeparatorMenuItem::new());

    let item_close = gtk::MenuItem::with_label("Close (Alt+F4)");
    {
        let w = window.clone();
        let a = app.clone();
        item_close.connect_activate(move |_| {
            cleanup_background_processes(&a);
            let _ = w.close();
            a.exit(0);
        });
    }
    menu.append(&item_close);

    menu.connect_deactivate(|_| {
        ACTIVE_WINDOW_MENU.with(|slot| {
            *slot.borrow_mut() = None;
        });
    });

    menu.show_all();
    let mut popped = false;
    if let Ok(gtk_win) = window.gtk_window() {
        if let Some(gdk_win) = gtk_win.window() {
            let alloc = gtk_win.allocation();
            let ax = anchor_x
                .map(|v| v.round() as i32)
                .unwrap_or_else(|| (alloc.width() - 108).max(40));
            let ay = anchor_y.map(|v| v.round() as i32).unwrap_or(54);
            let rect = gtk::gdk::Rectangle::new(ax.max(0), ay.max(0), 2, 2);
            let gravity = if ax > (alloc.width() - 240) {
                gtk::gdk::Gravity::NorthEast
            } else {
                gtk::gdk::Gravity::NorthWest
            };
            menu.popup_at_rect(
                &gdk_win,
                &rect,
                gtk::gdk::Gravity::SouthEast,
                gravity,
                None,
            );
            popped = true;
        }
    }
    if !popped {
        menu.popup_easy(0, gtk::current_event_time());
    }
    ACTIVE_WINDOW_MENU.with(|slot| {
        *slot.borrow_mut() = Some(menu);
    });
}

#[tauri::command]
fn window_show_menu(
    app: AppHandle,
    window: Window,
    x: Option<f64>,
    y: Option<f64>,
) -> Result<bool, String> {
    #[cfg(target_os = "linux")]
    {
        let app_clone = app.clone();
        let win_clone = window.clone();
        let _ = app.run_on_main_thread(move || {
            popup_ubuntu_window_menu(&app_clone, &win_clone, x, y);
        });
        Ok(true)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (app, window, x, y);
        Ok(false)
    }
}

fn normalize_auth_service(service: &str) -> &'static str {
    if service.to_ascii_lowercase().contains("spotify") {
        "spotify"
    } else {
        "youtube"
    }
}

fn is_auth_url(raw_url: &str) -> bool {
    let lower = raw_url.trim().to_ascii_lowercase();
    lower.contains("accounts.google.")
        || lower.contains("accounts.youtube.")
        || lower.contains("myaccount.google.")
        || lower.contains("consent.google.")
        || lower.contains("accounts.spotify.com")
        || lower.contains("appleid.apple.com")
        || lower.contains("login.live.com")
        || lower.contains("/servicelogin")
        || lower.contains("/v3/signin")
}

fn is_service_landing_url(service: &str, raw_url: &str) -> bool {
    if is_auth_url(raw_url) {
        return false;
    }
    let Ok(parsed) = tauri::Url::parse(raw_url) else {
        return false;
    };
    let Some(host) = parsed.host_str().map(|h| h.to_ascii_lowercase()) else {
        return false;
    };
    if normalize_auth_service(service) == "spotify" {
        (host == "open.spotify.com" || host == "www.spotify.com")
            && !parsed.path().to_ascii_lowercase().contains("/login")
    } else {
        host == "music.youtube.com"
    }
}

fn is_snap_confined() -> bool {
    std::env::var_os("SNAP").is_some()
}

fn auth_config_dir(app: &AppHandle) -> PathBuf {
    if let Some(xdg) = std::env::var_os("XDG_CONFIG_HOME") {
        if !xdg.is_empty() {
            return PathBuf::from(xdg).join("brave-music");
        }
    }
    if let Some(home) = std::env::var_os("HOME") {
        return PathBuf::from(home).join(".config/brave-music");
    }
    app.path()
        .app_config_dir()
        .unwrap_or_else(|_| PathBuf::from(".brave-music-config"))
}

fn write_private_json_atomic(path: &std::path::Path, value: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed creating config dir: {e}"))?;
        let _ = set_private_permissions(parent, 0o700);
    }
    let dir = path
        .parent()
        .ok_or_else(|| "Invalid config path".to_string())?;
    let bytes = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
    let mut tmp = tempfile::NamedTempFile::new_in(dir).map_err(|e| e.to_string())?;
    tmp.write_all(&bytes)
        .and_then(|()| tmp.as_file().sync_all())
        .map_err(|e| e.to_string())?;
    tmp.persist(path).map_err(|e| e.error.to_string())?;
    let _ = set_private_permissions(path, 0o600);
    Ok(())
}

fn read_accounts_map(dir: &std::path::Path) -> serde_json::Map<String, Value> {
    let path = dir.join("user_accounts.json");
    if let Ok(bytes) = fs::read(&path) {
        if let Ok(Value::Object(map)) = serde_json::from_slice::<Value>(&bytes) {
            return map;
        }
    }
    serde_json::Map::new()
}

fn is_service_auth_cookie(service: &str, name: &str, domain: &str) -> bool {
    let d = domain.to_ascii_lowercase();
    if normalize_auth_service(service) == "spotify" {
        d.contains("spotify.com") && matches!(name, "sp_dc" | "sp_key")
    } else {
        (d.contains("google.") || d.contains("youtube.com"))
            && matches!(
                name,
                "SID"
                    | "SAPISID"
                    | "__Secure-3PSID"
                    | "__Secure-1PSID"
                    | "HSID"
                    | "SSID"
                    | "LOGIN_INFO"
            )
    }
}

fn cookie_belongs_to_service(service: &str, domain: &str) -> bool {
    let d = domain.to_ascii_lowercase();
    if normalize_auth_service(service) == "spotify" {
        d.contains("spotify.com")
    } else {
        d.contains("google.") || d.contains("youtube.com") || d.contains("youtu.be")
    }
}

fn cookies_to_json_values<'a>(
    service: &str,
    cookies: &[tauri::webview::Cookie<'a>],
) -> Vec<Value> {
    cookies
        .iter()
        .filter(|c| {
            let domain = c.domain().unwrap_or("");
            cookie_belongs_to_service(service, domain)
        })
        .map(|c| {
            serde_json::json!({
                "name": c.name(),
                "value": c.value(),
                "domain": c.domain().unwrap_or(""),
                "path": c.path().unwrap_or("/"),
                "secure": c.secure().unwrap_or(true),
                "httpOnly": c.http_only().unwrap_or(false)
            })
        })
        .collect()
}

fn webview_has_service_auth(wv: &tauri::Webview, service: &str) -> bool {
    let Ok(cookies) = wv.cookies() else {
        return false;
    };
    cookies.iter().any(|c| {
        let domain = c.domain().unwrap_or("");
        is_service_auth_cookie(service, c.name(), domain)
    })
}

fn apply_cookie_values_to_webview(wv: &tauri::Webview, records: &[Value]) -> usize {
    let mut applied = 0usize;
    for rec in records {
        let name = rec
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();
        let value = rec.get("value").and_then(|v| v.as_str()).unwrap_or("");
        if name.is_empty()
            || name.contains([';', '\r', '\n'])
            || value.contains(['\r', '\n'])
        {
            continue;
        }
        let mut builder = tauri::webview::Cookie::build((name.to_string(), value.to_string()));
        if !name.starts_with("__Host-") {
            if let Some(domain) = rec
                .get("domain")
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty())
            {
                builder = builder.domain(domain.to_string());
            }
        }
        let path = rec
            .get("path")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("/");
        builder = builder.path(path.to_string());
        if rec.get("secure").and_then(|v| v.as_bool()).unwrap_or(false) {
            builder = builder.secure(true);
        }
        if rec
            .get("httpOnly")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
        {
            builder = builder.http_only(true);
        }
        if wv.set_cookie(builder.build()).is_ok() {
            applied += 1;
        }
    }
    applied
}

fn parse_cookie_json_payload(raw_json: &str) -> Result<Vec<Value>, String> {
    let parsed: Value =
        serde_json::from_str(raw_json.trim()).map_err(|e| format!("Invalid JSON file: {e}"))?;
    let items = if let Some(arr) = parsed.as_array() {
        arr.clone()
    } else if let Some(arr) = parsed.get("cookies").and_then(|v| v.as_array()) {
        arr.clone()
    } else {
        return Err("Cookies JSON must be an array or an object with a cookies array".to_string());
    };
    let clean: Vec<Value> = items
        .into_iter()
        .filter(|item| {
            item.get("name")
                .and_then(|v| v.as_str())
                .map(|s| !s.trim().is_empty())
                .unwrap_or(false)
        })
        .collect();
    if clean.is_empty() {
        return Err("No valid cookie entries were found in the selected JSON file".to_string());
    }
    Ok(clean)
}

fn service_session_filename(service: &str) -> &'static str {
    if normalize_auth_service(service) == "spotify" {
        "spotify_session.json"
    } else {
        "ytmusic_session.json"
    }
}

fn persist_service_account(
    dir: &std::path::Path,
    service: &str,
    name: &str,
    email: &str,
    avatar: &str,
    source: &str,
) -> Result<(), String> {
    let svc = normalize_auth_service(service);
    let mut map = read_accounts_map(dir);
    let existing = map.get(svc).and_then(|v| v.as_object()).cloned();
    let final_name = if name.trim().is_empty() {
        existing
            .as_ref()
            .and_then(|o| o.get("name").and_then(|v| v.as_str()))
            .filter(|s| !s.trim().is_empty())
            .unwrap_or(if svc == "spotify" {
                "Spotify Account"
            } else {
                "YouTube Music Account"
            })
            .to_string()
    } else {
        name.trim().to_string()
    };
    let final_email = if email.trim().is_empty() {
        existing
            .as_ref()
            .and_then(|o| o.get("email").and_then(|v| v.as_str()))
            .filter(|s| !s.trim().is_empty())
            .unwrap_or(if svc == "spotify" {
                "Active Spotify Session"
            } else {
                "Active Google Session"
            })
            .to_string()
    } else {
        email.trim().to_string()
    };
    let final_avatar = if avatar.trim().is_empty() {
        existing
            .as_ref()
            .and_then(|o| o.get("avatar").and_then(|v| v.as_str()))
            .unwrap_or("")
            .to_string()
    } else {
        avatar.trim().to_string()
    };

    map.insert(
        svc.to_string(),
        serde_json::json!({
            "service": svc,
            "name": final_name,
            "email": final_email,
            "avatar": final_avatar,
            "authenticated": true,
            "lastLogin": current_timestamp_str(),
            "source": source
        }),
    );
    write_private_json_atomic(&dir.join("user_accounts.json"), &Value::Object(map))
}

fn build_auth_status_payload(app: &AppHandle) -> Value {
    let dir = auth_config_dir(app);
    let mut accounts = read_accounts_map(&dir);

    let ytm_wv_auth = YT_AUTH_COOKIE_HINT.load(Ordering::Relaxed);
    let sp_wv_auth = SP_AUTH_COOKIE_HINT.load(Ordering::Relaxed);

    let ytm_file_auth = fs::read(dir.join("ytmusic_session.json"))
        .ok()
        .and_then(|b| serde_json::from_slice::<Vec<Value>>(&b).ok())
        .map(|arr| {
            arr.iter().any(|c| {
                is_service_auth_cookie(
                    "youtube",
                    c.get("name").and_then(|v| v.as_str()).unwrap_or(""),
                    c.get("domain").and_then(|v| v.as_str()).unwrap_or(""),
                )
            })
        })
        .unwrap_or(false);
    let sp_file_auth = fs::read(dir.join("spotify_session.json"))
        .ok()
        .and_then(|b| serde_json::from_slice::<Vec<Value>>(&b).ok())
        .map(|arr| !arr.is_empty())
        .unwrap_or(false);

    if ytm_file_auth {
        YT_AUTH_COOKIE_HINT.store(true, Ordering::Relaxed);
    }
    if sp_file_auth {
        SP_AUTH_COOKIE_HINT.store(true, Ordering::Relaxed);
    }

    let ytm_saved = accounts
        .get("youtube")
        .and_then(|v| v.get("authenticated"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let sp_saved = accounts
        .get("spotify")
        .and_then(|v| v.get("authenticated"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let is_ytm_auth = ytm_saved || ytm_wv_auth || ytm_file_auth;
    let is_sp_auth = sp_saved || sp_wv_auth || sp_file_auth;

    if is_ytm_auth && !accounts.contains_key("youtube") {
        accounts.insert(
            "youtube".to_string(),
            serde_json::json!({
                "service": "youtube",
                "name": "YouTube Music Account",
                "email": "Active Google Session",
                "avatar": "",
                "authenticated": true,
                "source": "session"
            }),
        );
    }
    if is_sp_auth && !accounts.contains_key("spotify") {
        accounts.insert(
            "spotify".to_string(),
            serde_json::json!({
                "service": "spotify",
                "name": "Spotify Account",
                "email": "Active Spotify Session",
                "avatar": "",
                "authenticated": true,
                "source": "session"
            }),
        );
    }

    let sp_name = accounts
        .get("spotify")
        .and_then(|v| v.get("name"))
        .and_then(|v| v.as_str())
        .unwrap_or("Spotify Account");

    serde_json::json!({
        "authenticated": is_ytm_auth || is_sp_auth,
        "youtube": { "authenticated": is_ytm_auth },
        "spotify": {
            "authenticated": is_sp_auth,
            "user": if is_sp_auth { serde_json::json!({ "display_name": sp_name }) } else { Value::Null }
        },
        "accounts": Value::Object(accounts),
        "capabilities": {
            "hostSyncAvailable": !is_snap_confined(),
            "inAppWindowAvailable": true
        }
    })
}

fn emit_auth_status(app: &AppHandle, service: &str, state: &str, message: &str) {
    let _ = app.emit(
        "auth-cdp-status",
        serde_json::json!({
            "service": normalize_auth_service(service),
            "state": state,
            "message": message
        }),
    );
}

fn finalize_auth_cookies(
    app: &AppHandle,
    service: &str,
    records: &[Value],
    source: &str,
    close_auth_window: bool,
) -> Result<usize, String> {
    let svc = normalize_auth_service(service);
    let dir = auth_config_dir(app);
    let session_path = dir.join(service_session_filename(svc));
    write_private_json_atomic(&session_path, &Value::Array(records.to_vec()))?;

    if !records.is_empty() {
        if svc == "spotify" {
            SP_AUTH_COOKIE_HINT.store(true, Ordering::Relaxed);
        } else {
            YT_AUTH_COOKIE_HINT.store(true, Ordering::Relaxed);
        }
    }

    let target_label = if svc == "spotify" {
        "spotify-webview"
    } else {
        "yt-webview"
    };
    let mut applied = 0usize;
    if let Some(wv) = app.get_webview(target_label) {
        applied = apply_cookie_values_to_webview(&wv, records);
        let _ = wv.eval("window.location.reload()");
    }
    persist_service_account(&dir, svc, "", "", "", source)?;
    let _ = app.emit("auth-sync-completed", serde_json::json!({ "service": svc }));
    emit_auth_status(
        app,
        svc,
        "complete",
        &format!(
            "Sign-in complete ({} session cookies synced). Refreshing player…",
            records.len().max(applied)
        ),
    );
    if close_auth_window {
        if let Some(win) = app.get_webview_window("auth-window") {
            let _ = win.close();
        }
    }
    Ok(records.len())
}

fn extract_host_browser_cookies(service: &str) -> Option<Vec<Value>> {
    let svc = normalize_auth_service(service);
    let script = r#"
import glob, json, os, shutil, sqlite3, sys, tempfile

svc = sys.argv[1]
domains = ['spotify.com'] if svc == 'spotify' else ['google.com', 'youtube.com']
required = {'sp_dc', 'sp_key'} if svc == 'spotify' else {'SID', 'SAPISID', '__Secure-3PSID', '__Secure-1PSID'}

def match_domain(host):
    h = (host or '').lower().lstrip('.')
    return any(h == d or h.endswith('.' + d) for d in domains)

collected = []
seen = set()

def add_cookie(name, value, domain, path='/', secure=True, http_only=True):
    if not name or not value or any(ord(ch) < 32 for ch in value):
        return
    key = (name, domain, path)
    if key in seen:
        return
    seen.add(key)
    collected.append({
        'name': name,
        'value': value,
        'domain': domain,
        'path': path or '/',
        'secure': bool(secure),
        'httpOnly': bool(http_only),
    })

home = os.path.expanduser('~')
ff_patterns = [
    os.path.join(home, '.mozilla/firefox/*/cookies.sqlite'),
    os.path.join(home, 'snap/firefox/common/.mozilla/firefox/*/cookies.sqlite'),
    os.path.join(home, '.var/app/org.mozilla.firefox/.mozilla/firefox/*/cookies.sqlite'),
]
for pattern in ff_patterns:
    for db_path in glob.glob(pattern):
        if not os.path.isfile(db_path):
            continue
        tmp_dir = tempfile.mkdtemp(prefix='bm-ff-')
        try:
            tmp_db = os.path.join(tmp_dir, 'cookies.sqlite')
            shutil.copy2(db_path, tmp_db)
            for suffix in ('-wal', '-shm'):
                if os.path.isfile(db_path + suffix):
                    shutil.copy2(db_path + suffix, tmp_db + suffix)
            conn = sqlite3.connect(tmp_db)
            for name, value, host, path, is_secure, is_http_only in conn.execute(
                'SELECT name, value, host, path, isSecure, isHttpOnly FROM moz_cookies'
            ):
                if match_domain(host):
                    add_cookie(name, value, host, path, is_secure, is_http_only)
            conn.close()
        except Exception:
            pass
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

chr_patterns = [
    os.path.join(home, '.config/google-chrome/*/Cookies'),
    os.path.join(home, '.config/chromium/*/Cookies'),
    os.path.join(home, '.config/BraveSoftware/Brave-Browser/*/Cookies'),
]
for pattern in chr_patterns:
    for db_path in glob.glob(pattern):
        if not os.path.isfile(db_path):
            continue
        tmp_dir = tempfile.mkdtemp(prefix='bm-chr-')
        try:
            tmp_db = os.path.join(tmp_dir, 'Cookies')
            shutil.copy2(db_path, tmp_db)
            conn = sqlite3.connect(tmp_db)
            for name, value, host, path, is_secure, is_httponly in conn.execute(
                'SELECT name, value, host_key, path, is_secure, is_httponly FROM cookies'
            ):
                if match_domain(host) and value:
                    add_cookie(name, value, host, path, is_secure, is_httponly)
            conn.close()
        except Exception:
            pass
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

has_req = any(c['name'] in required for c in collected)
print(json.dumps({'ok': has_req, 'cookies': collected}))
"#;

    let out = std::process::Command::new("python3")
        .args(["-c", script, svc])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let parsed: Value = serde_json::from_slice(&out.stdout).ok()?;
    if parsed.get("ok").and_then(|v| v.as_bool()) == Some(true) {
        parsed
            .get("cookies")
            .and_then(|v| v.as_array())
            .cloned()
    } else {
        None
    }
}

fn open_auth_window(app: &AppHandle, service: &str, custom_url: Option<String>) -> Result<(), String> {
    let svc = normalize_auth_service(service).to_string();
    let default_url = if svc == "spotify" {
        "https://accounts.spotify.com/en/login?continue=https%3A%2F%2Fopen.spotify.com%2F"
    } else {
        "https://accounts.google.com/ServiceLogin?service=youtube&uilel=3&passive=true&continue=https%3A%2F%2Fmusic.youtube.com%2F"
    };
    let target_str = custom_url.unwrap_or_else(|| default_url.to_string());
    let parsed_url = tauri::Url::parse(&target_str)
        .map_err(|e| format!("Invalid sign-in URL: {e}"))?;

    if let Some(existing) = app.get_webview_window("auth-window") {
        let _ = existing.close();
    }

    let completed = Arc::new(AtomicBool::new(false));
    let completed_for_nav = completed.clone();
    let completed_for_poll = completed.clone();
    let completed_for_close = completed.clone();

    let app_for_nav = app.clone();
    let svc_for_nav = svc.clone();

    let title = if svc == "spotify" {
        "Brave Music — Spotify Sign In"
    } else {
        "Brave Music — Google / YouTube Sign In"
    };

    // Native WebKitGTK UA + NO window.chrome polyfill avoids blinking & Google "browser may not be secure"
    let auth_win = tauri::WebviewWindowBuilder::new(
        app,
        "auth-window",
        tauri::WebviewUrl::External(parsed_url),
    )
    .title(title)
    .inner_size(520.0, 720.0)
    .resizable(true)
    .center()
    .on_navigation(move |nav_url| {
        if completed_for_nav.load(Ordering::SeqCst) {
            return true;
        }
        if is_service_landing_url(&svc_for_nav, nav_url.as_str()) {
            let app_clone = app_for_nav.clone();
            let svc_clone = svc_for_nav.clone();
            let flag = completed_for_nav.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(650));
                if flag.load(Ordering::SeqCst) {
                    return;
                }
                if let Some(aw) = app_clone.get_webview_window("auth-window") {
                    if let Ok(cookies) = aw.cookies() {
                        let has_auth = cookies.iter().any(|c| {
                            is_service_auth_cookie(&svc_clone, c.name(), c.domain().unwrap_or(""))
                        });
                        if has_auth && flag.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_ok() {
                            let records = cookies_to_json_values(&svc_clone, &cookies);
                            let _ = finalize_auth_cookies(&app_clone, &svc_clone, &records, "in-app-webview", true);
                        }
                    }
                }
            });
        }
        true
    })
    .build()
    .map_err(|e| format!("Failed opening sign-in window: {e}"))?;

    configure_webkit_window_settings(&auth_win, true);
    let _ = auth_win.set_focus();

    let app_for_close = app.clone();
    let svc_for_close = svc.clone();
    auth_win.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            if !completed_for_close.load(Ordering::SeqCst) {
                emit_auth_status(&app_for_close, &svc_for_close, "cancelled", "Sign-in window closed.");
            }
        }
    });

    // Background completion monitor catches SPA redirects where on_navigation fires before cookie flush
    let app_for_poll = app.clone();
    let svc_for_poll = svc;
    std::thread::spawn(move || {
        for _ in 0..240 {
            if completed_for_poll.load(Ordering::SeqCst) || AUTH_LOGIN_CANCELED.load(Ordering::SeqCst) {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(1500));
            let Some(aw) = app_for_poll.get_webview_window("auth-window") else {
                break;
            };
            let on_landing = aw
                .url()
                .ok()
                .map(|u| is_service_landing_url(&svc_for_poll, u.as_str()))
                .unwrap_or(false);
            if !on_landing {
                continue;
            }
            if let Ok(cookies) = aw.cookies() {
                let has_auth = cookies.iter().any(|c| {
                    is_service_auth_cookie(&svc_for_poll, c.name(), c.domain().unwrap_or(""))
                });
                if has_auth
                    && completed_for_poll
                        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
                        .is_ok()
                {
                    let records = cookies_to_json_values(&svc_for_poll, &cookies);
                    let _ = finalize_auth_cookies(&app_for_poll, &svc_for_poll, &records, "in-app-webview", true);
                    break;
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
async fn get_auth_status(app: AppHandle) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || build_auth_status_payload(&app))
        .await
        .map_err(|e| format!("Failed checking auth status: {e}"))
}

#[tauri::command]
async fn get_saved_accounts(app: AppHandle) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = auth_config_dir(&app);
        Value::Object(read_accounts_map(&dir))
    })
    .await
    .map_err(|e| format!("Failed reading saved accounts: {e}"))
}

#[tauri::command]
async fn save_user_account(app: AppHandle, service: String, profile: Value) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = auth_config_dir(&app);
        let svc = normalize_auth_service(&service);
        let name = profile.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let email = profile.get("email").and_then(|v| v.as_str()).unwrap_or("");
        let avatar = profile.get("avatar").and_then(|v| v.as_str()).unwrap_or("");
        let source = profile
            .get("source")
            .and_then(|v| v.as_str())
            .unwrap_or("webview");
        persist_service_account(&dir, svc, name, email, avatar, source)?;
        Ok(serde_json::json!({ "success": true, "service": svc }))
    })
    .await
    .map_err(|e| format!("Failed saving account: {e}"))?
}

#[tauri::command]
async fn logout_provider(app: AppHandle, service: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let svc = normalize_auth_service(&service);
        let dir = auth_config_dir(&app);

        if svc == "spotify" {
            SP_AUTH_COOKIE_HINT.store(false, Ordering::Relaxed);
        } else {
            YT_AUTH_COOKIE_HINT.store(false, Ordering::Relaxed);
        }

        let mut accounts = read_accounts_map(&dir);
        accounts.remove(svc);
        write_private_json_atomic(&dir.join("user_accounts.json"), &Value::Object(accounts))?;

        let _ = fs::remove_file(dir.join(service_session_filename(svc)));
        let _ = fs::remove_file(dir.join(format!("imported_cookies_{svc}.json")));

        let target_label = if svc == "spotify" {
            "spotify-webview"
        } else {
            "yt-webview"
        };
        if let Some(wv) = app.get_webview(target_label) {
            if let Ok(cookies) = wv.cookies() {
                for c in cookies {
                    let d = c.domain().unwrap_or("");
                    if cookie_belongs_to_service(svc, d) {
                        let _ = wv.delete_cookie(c);
                    }
                }
            }
            let _ = wv.eval("window.location.reload()");
        }
        Ok(serde_json::json!({ "success": true, "service": svc }))
    })
    .await
    .map_err(|e| format!("Failed logging out: {e}"))?
}

#[tauri::command]
async fn import_cookies_json(app: AppHandle, service: String, raw_json: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let svc = normalize_auth_service(&service);
        let records = match parse_cookie_json_payload(&raw_json) {
            Ok(r) => r,
            Err(err) => return Ok(serde_json::json!({ "success": false, "error": err })),
        };

        let dir = auth_config_dir(&app);
        let _ = write_private_json_atomic(
            &dir.join(format!("imported_cookies_{svc}.json")),
            &Value::Array(records.clone()),
        );

        match finalize_auth_cookies(&app, svc, &records, "cookies-json", false) {
            Ok(count) => Ok(serde_json::json!({
                "success": true,
                "count": count,
                "message": format!("Imported {count} session cookies into Brave Music.")
            })),
            Err(err) => Ok(serde_json::json!({ "success": false, "error": err })),
        }
    })
    .await
    .map_err(|e| format!("Failed importing cookies: {e}"))?
}

#[tauri::command]
async fn start_service_login(
    app: AppHandle,
    service: String,
    preferred_mode: Option<String>,
) -> Result<Value, String> {
    let svc = normalize_auth_service(&service).to_string();
    let mode = preferred_mode
        .unwrap_or_else(|| "browser".to_string())
        .to_ascii_lowercase();

    AUTH_LOGIN_CANCELED.store(false, Ordering::SeqCst);
    if let Ok(mut guard) = AUTH_ACTIVE_SERVICE.lock() {
        *guard = Some(svc.clone());
    }

    if mode == "in-app" || mode == "inapp" || mode == "window" {
        emit_auth_status(
            &app,
            &svc,
            "loading",
            "Complete sign-in in the Brave Music sign-in window…",
        );
        open_auth_window(&app, &svc, None)?;
        return Ok(serde_json::json!({
            "success": false,
            "pending": true,
            "mode": "in-app"
        }));
    }

    // Option 1: Open OS Default Browser + sync host cookies when unconfined
    let login_url = if svc == "spotify" {
        "https://accounts.spotify.com/en/login?continue=https%3A%2F%2Fopen.spotify.com%2F"
    } else {
        "https://accounts.google.com/ServiceLogin?service=youtube&uilel=3&passive=true&continue=https%3A%2F%2Fmusic.youtube.com%2F"
    };
    if let Err(err) = app.opener().open_url(login_url, None::<&str>) {
        return Ok(serde_json::json!({
            "success": false,
            "error": format!("Could not open default browser: {err}. Try 'Use Built-In Secure Sign-In Window Directly' below.")
        }));
    }

    if is_snap_confined() {
        let msg = "Opened your default browser. Because Snap isolates external browser data, click 'Use Built-In Secure Sign-In Window Directly' below or import Cookies (.json) to finish linking.";
        emit_auth_status(&app, &svc, "error", msg);
        return Ok(serde_json::json!({
            "success": false,
            "snapConfined": true,
            "error": msg
        }));
    }

    emit_auth_status(
        &app,
        &svc,
        "loading",
        "Opened your default browser. Sign in there (syncing session automatically…)",
    );

    let app_clone = app.clone();
    let svc_clone = svc.clone();
    tauri::async_runtime::spawn_blocking(move || {
        // Give user 3s after browser opens, then poll host Firefox/Chromium DBs for up to 45s
        for step in 0..22 {
            if AUTH_LOGIN_CANCELED.load(Ordering::SeqCst) {
                return serde_json::json!({
                    "success": false,
                    "canceled": true,
                    "error": "Sign-in cancelled."
                });
            }
            std::thread::sleep(std::time::Duration::from_millis(if step == 0 { 3000 } else { 2000 }));
            if AUTH_LOGIN_CANCELED.load(Ordering::SeqCst) {
                return serde_json::json!({
                    "success": false,
                    "canceled": true,
                    "error": "Sign-in cancelled."
                });
            }
            if let Some(cookies) = extract_host_browser_cookies(&svc_clone) {
                match finalize_auth_cookies(&app_clone, &svc_clone, &cookies, "browser-sync", false) {
                    Ok(count) => {
                        return serde_json::json!({
                            "success": true,
                            "count": count,
                            "message": format!("Synced {count} cookies from your browser into Brave Music.")
                        });
                    }
                    Err(err) => {
                        return serde_json::json!({ "success": false, "error": err });
                    }
                }
            }
        }
        let timeout_msg = "Default browser opened, but host browser cookies are encrypted or not yet signed in. Try 'Use Built-In Secure Sign-In Window Directly' below or import Cookies (.json).";
        emit_auth_status(&app_clone, &svc_clone, "error", timeout_msg);
        serde_json::json!({
            "success": false,
            "error": timeout_msg
        })
    })
    .await
    .map_err(|e| format!("Sign-in sync task failed: {e}"))
}

#[tauri::command]
fn cancel_service_login(app: AppHandle) -> Result<(), String> {
    AUTH_LOGIN_CANCELED.store(true, Ordering::SeqCst);
    if let Some(win) = app.get_webview_window("auth-window") {
        let _ = win.close();
    }
    if let Ok(mut guard) = AUTH_ACTIVE_SERVICE.lock() {
        if let Some(svc) = guard.take() {
            emit_auth_status(&app, &svc, "cancelled", "Sign-in cancelled.");
        }
    }
    Ok(())
}

#[tauri::command]
fn get_app_version() -> &'static str {
    "1.0.19-r"
}

fn parse_query_params(path_and_query: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let Some((_, q)) = path_and_query.split_once('?') else {
        return map;
    };
    for pair in q.split('&') {
        if pair.is_empty() {
            continue;
        }
        let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
        let key = percent_decode(k).unwrap_or_else(|| k.to_string());
        let val = percent_decode(v).unwrap_or_else(|| v.to_string());
        map.insert(key, val);
    }
    map
}

fn record_webview_url(app: &AppHandle, label: &str, raw_url: &str) {
    let trimmed = raw_url.trim();
    if trimmed.is_empty()
        || trimmed.starts_with("about:")
        || trimmed.contains("brave-shields.local")
        || trimmed.contains("/__brave_shield_blocked__")
    {
        return;
    }
    if label == "yt-webview" {
        if let Ok(mut guard) = CURRENT_YT_URL.lock() {
            *guard = trimmed.to_string();
        }
    } else if label == "spotify-webview" {
        if let Ok(mut guard) = CURRENT_SPOTIFY_URL.lock() {
            *guard = trimmed.to_string();
        }
    }
    let _ = app.emit(
        "webview-url-changed",
        serde_json::json!({ "label": label, "url": trimmed }),
    );
}

#[tauri::command]
fn get_webview_url(label: String) -> String {
    if label == "spotify-webview" {
        CURRENT_SPOTIFY_URL
            .lock()
            .map(|g| g.clone())
            .unwrap_or_else(|_| "https://open.spotify.com/".to_string())
    } else {
        CURRENT_YT_URL
            .lock()
            .map(|g| g.clone())
            .unwrap_or_else(|_| "https://music.youtube.com/".to_string())
    }
}

fn stable_hash_hex(input: &str) -> String {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    input.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn prune_spotify_bridge_cache(cache_dir: &std::path::Path, max_files: usize) {
    let Ok(entries) = fs::read_dir(cache_dir) else {
        return;
    };
    let mut files: Vec<(std::time::SystemTime, PathBuf)> = entries
        .flatten()
        .filter_map(|e| {
            let p = e.path();
            if !p.is_file() {
                return None;
            }
            let modified = e
                .metadata()
                .and_then(|m| m.modified())
                .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
            Some((modified, p))
        })
        .collect();
    if files.len() <= max_files {
        return;
    }
    files.sort_by_key(|(t, _)| *t);
    let excess = files.len() - max_files;
    for (_, old_path) in files.into_iter().take(excess) {
        let _ = fs::remove_file(old_path);
    }
}

fn find_local_playable_match(app: &AppHandle, title: &str, artist: &str) -> Option<(String, String, String)> {
    let clean_t = title.trim().to_lowercase();
    if clean_t.len() < 2 {
        return None;
    }
    let clean_a = artist
        .split(|c| c == ',' || c == ';' || c == '&')
        .next()
        .unwrap_or("")
        .trim()
        .to_lowercase();
    let doc = read_library(app).ok()?;
    for t in &doc.tracks {
        let tt = t.get("title").and_then(|v| v.as_str()).unwrap_or("").trim();
        let ta = t.get("artist").and_then(|v| v.as_str()).unwrap_or("").trim();
        let tf = t.get("filename").and_then(|v| v.as_str()).unwrap_or("").trim();
        if tt.is_empty() || tf.is_empty() {
            continue;
        }
        let lower_t = tt.to_lowercase();
        let lower_a = ta.to_lowercase();
        let title_matches = lower_t == clean_t || lower_t.contains(&clean_t) || clean_t.contains(&lower_t);
        let artist_matches = clean_a.is_empty() || clean_a == "unknown artist" || lower_a.contains(&clean_a);
        if title_matches && artist_matches && resolve_audio_file(app, tf).is_some() {
            let thumb = t.get("thumbnail").and_then(|v| v.as_str()).unwrap_or("").to_string();
            return Some((tf.to_string(), tt.to_string(), if thumb.is_empty() { "".to_string() } else { thumb }));
        }
    }
    None
}

fn ensure_snap_playable_audio(app: &AppHandle, source_path: &std::path::Path) -> Option<String> {
    if !is_snap_confined() {
        return None;
    }
    let ext = source_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if ext != "m4a" && ext != "aac" {
        return None;
    }
    let cache_dir = spotify_bridge_cache_dir(app);
    let cached_name = format!("m4a_{}.mp3", stable_hash_hex(&source_path.to_string_lossy()));
    let cached_path = cache_dir.join(&cached_name);
    if cached_path.exists() && cached_path.metadata().map(|m| m.len() > 4096).unwrap_or(false) {
        return Some(format!("__bridge/{cached_name}"));
    }
    let ffmpeg_bin = resolve_bundled_bin("ffmpeg")?;
    let mut cmd = std::process::Command::new(ffmpeg_bin);
    cmd.args(["-y", "-loglevel", "error", "-i"])
        .arg(source_path)
        .args(["-vn", "-c:a", "libmp3lame", "-q:a", "2"])
        .arg(&cached_path);
    let output = run_command_output_tracked(&mut cmd).ok()?;
    if output.status.success() && cached_path.exists() {
        prune_spotify_bridge_cache(&cache_dir, 20);
        Some(format!("__bridge/{cached_name}"))
    } else {
        None
    }
}

fn is_webkit_native_audio_ext(ext: &str) -> bool {
    matches!(
        ext.to_ascii_lowercase().as_str(),
        "webm" | "opus" | "ogg" | "mp3" | "flac" | "wav"
    )
}

fn resolve_spotify_playable_stream(
    app: &AppHandle,
    track_url: &str,
    raw_title: &str,
    raw_artist: &str,
    raw_artwork: &str,
) -> Result<Value, String> {
    let port = STREAM_SERVER_PORT.load(Ordering::SeqCst);
    if port == 0 {
        return Err("Local audio streaming server not initialized".to_string());
    }

    let mut eff_title = raw_title.trim().to_string();
    let mut eff_artist = raw_artist.trim().to_string();
    let mut eff_artwork = raw_artwork.trim().to_string();
    let mut eff_duration: i64 = 0;
    let mut queue_payload: Vec<Value> = Vec::new();

    let meta_opt = if track_url.contains("open.spotify.com/")
        || track_url.starts_with("spotify:")
        || track_url.contains("spotify.link/")
    {
        fetch_spotify_embed_metadata(track_url)
    } else {
        None
    };

    if let Some(ref meta) = meta_opt {
        if !meta.tracks.is_empty() {
            let chosen = if !eff_title.is_empty() {
                let lower_req = eff_title.to_lowercase();
                meta.tracks
                    .iter()
                    .find(|t| t.title.to_lowercase() == lower_req)
                    .unwrap_or(&meta.tracks[0])
            } else {
                &meta.tracks[0]
            };
            eff_title = chosen.title.clone();
            eff_artist = chosen.artist.clone();
            eff_duration = chosen.duration as i64;
            if eff_artwork.is_empty() {
                eff_artwork = if chosen.thumbnail.is_empty() {
                    meta.cover_url.clone()
                } else {
                    chosen.thumbnail.clone()
                };
            }
            if meta.tracks.len() > 1 {
                for t in meta.tracks.iter().take(50) {
                    queue_payload.push(serde_json::json!({
                        "title": t.title,
                        "artist": t.artist,
                        "duration": t.duration,
                        "artwork": if t.thumbnail.is_empty() { &meta.cover_url } else { &t.thumbnail },
                        "url": track_url
                    }));
                }
            }
        }
    }

    let (clean_t, clean_a) = clean_track_metadata(&eff_title, &eff_artist);
    if clean_t.is_empty() || clean_t == "Unknown Title" {
        return Err("Open a Spotify track, album, or playlist to stream via Brave Music.".to_string());
    }
    let display_artist = if clean_a == "Brave Music" || clean_a.is_empty() {
        eff_artist.clone()
    } else {
        clean_a.clone()
    };

    if let Some((local_filename, _, local_thumb)) = find_local_playable_match(app, &clean_t, &display_artist) {
        let mut served = local_filename.clone();
        if let Some(full) = resolve_audio_file(app, &local_filename) {
            if let Some(transcoded) = ensure_snap_playable_audio(app, &full) {
                served = transcoded;
            }
        }
        let encoded = if let Some(sub) = served.strip_prefix("__bridge/") {
            format!("__bridge/{}", percent_encode(sub))
        } else {
            percent_encode(&served)
        };
        let art = if eff_artwork.is_empty() { local_thumb } else { eff_artwork };
        return Ok(serde_json::json!({
            "success": true,
            "streamUrl": format!("http://127.0.0.1:{port}/{encoded}"),
            "title": clean_t,
            "artist": if display_artist.is_empty() { "Spotify".to_string() } else { display_artist },
            "artwork": art,
            "trackUrl": track_url,
            "cached": true,
            "queue": queue_payload
        }));
    }

    let cache_dir = spotify_bridge_cache_dir(app);
    let stem = format!(
        "sp_{}",
        stable_hash_hex(&format!("{}|{}", clean_t.to_lowercase(), display_artist.to_lowercase()))
    );

    for ext in ["webm", "opus", "ogg", "mp3"] {
        let candidate_name = format!("{stem}.{ext}");
        let candidate = cache_dir.join(&candidate_name);
        if candidate.exists() && candidate.metadata().map(|m| m.len() > 8192).unwrap_or(false) {
            return Ok(serde_json::json!({
                "success": true,
                "streamUrl": format!("http://127.0.0.1:{port}/__bridge/{}", percent_encode(&candidate_name)),
                "title": clean_t,
                "artist": if display_artist.is_empty() { "Spotify".to_string() } else { display_artist },
                "artwork": eff_artwork,
                "trackUrl": track_url,
                "cached": true,
                "queue": queue_payload
            }));
        }
    }

    let ytdlp_bin = resolve_bundled_bin("yt-dlp").unwrap_or_else(|| PathBuf::from("yt-dlp"));
    let js_runtime = resolve_validated_js_runtime();
    let ffmpeg_dir = resolve_ffmpeg_dir();
    let matched_yt_url =
        resolve_best_spotify_youtube_url(&ytdlp_bin, &clean_t, &display_artist, eff_duration, false);

    let out_tpl = cache_dir.join(format!("{stem}.%(ext)s"));
    let mut cmd = create_ytdlp_base_command(&ytdlp_bin, js_runtime.as_deref(), ffmpeg_dir.as_ref());
    cmd.args([
        "--check-formats",
        "--concurrent-fragments",
        "4",
        "--no-playlist",
        "--socket-timeout",
        "10",
        "-f",
        "bestaudio[ext=webm][acodec=opus]/bestaudio[ext=ogg]/bestaudio[ext=mp3]/18/best[ext=mp4]/bestaudio/best",
        "-o",
    ])
    .arg(out_tpl.to_string_lossy().as_ref())
    .arg(&matched_yt_url);
    let out = run_command_output_tracked(&mut cmd);

    let mut chosen_file: Option<String> = None;
    if let Ok(res) = out {
        if res.status.success() {
            for ext in ["webm", "opus", "ogg", "mp3", "flac", "wav"] {
                let candidate_name = format!("{stem}.{ext}");
                let candidate = cache_dir.join(&candidate_name);
                if candidate.exists() && is_webkit_native_audio_ext(ext) {
                    chosen_file = Some(candidate_name);
                    break;
                }
            }
            if chosen_file.is_none() {
                if let Some(ffmpeg_bin) = resolve_bundled_bin("ffmpeg") {
                    for ext in ["mp4", "m4a", "aac", "mkv"] {
                        let raw_path = cache_dir.join(format!("{stem}.{ext}"));
                        if raw_path.exists() {
                            let mp3_name = format!("{stem}.mp3");
                            let mp3_path = cache_dir.join(&mp3_name);
                            let mut conv = std::process::Command::new(&ffmpeg_bin);
                            conv.args(["-y", "-loglevel", "error", "-i"])
                                .arg(&raw_path)
                                .args(["-vn", "-c:a", "libmp3lame", "-q:a", "2"])
                                .arg(&mp3_path);
                            let conv_ok = run_command_output_tracked(&mut conv)
                                .map(|o| o.status.success())
                                .unwrap_or(false);
                            let _ = fs::remove_file(&raw_path);
                            if conv_ok && mp3_path.exists() {
                                chosen_file = Some(mp3_name);
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    if chosen_file.is_none() && ffmpeg_dir.is_some() {
        let mut fb_cmd = create_ytdlp_base_command(&ytdlp_bin, js_runtime.as_deref(), ffmpeg_dir.as_ref());
        fb_cmd
            .args([
                "--check-formats",
                "--no-playlist",
                "--socket-timeout",
                "12",
                "-f",
                "18/best[ext=mp4]/bestaudio/best",
                "-x",
                "--audio-format",
                "mp3",
                "--audio-quality",
                "192K",
                "-o",
            ])
            .arg(out_tpl.to_string_lossy().as_ref())
            .arg(&matched_yt_url);
        let fb = run_command_output_tracked(&mut fb_cmd);
        if let Ok(res) = fb {
            let mp3_name = format!("{stem}.mp3");
            if res.status.success() && cache_dir.join(&mp3_name).exists() {
                chosen_file = Some(mp3_name);
            }
        }
    }

    let final_name = chosen_file.ok_or_else(|| {
        "Could not play this Spotify track yet. Check your connection and try again.".to_string()
    })?;
    prune_spotify_bridge_cache(&cache_dir, 15);

    Ok(serde_json::json!({
        "success": true,
        "streamUrl": format!("http://127.0.0.1:{port}/__bridge/{}", percent_encode(&final_name)),
        "title": clean_t,
        "artist": if display_artist.is_empty() { "Spotify".to_string() } else { display_artist },
        "artwork": eff_artwork,
        "trackUrl": track_url,
        "cached": false,
        "queue": queue_payload
    }))
}

fn spawn_spotify_bridge_play(
    app: AppHandle,
    track_url: String,
    title: String,
    artist: String,
    artwork: String,
) {
    let key = format!("{}|{}|{}", track_url.trim(), title.trim(), artist.trim());
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    {
        let mut guard = LAST_SPOTIFY_BRIDGE_TRIGGER
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        if guard.0 == key && now_ms.saturating_sub(guard.1) < 900 {
            return;
        }
        *guard = (key, now_ms);
    }

    let _ = app.emit(
        "spotify-bridge-status",
        serde_json::json!({
            "status": "resolving",
            "title": title,
            "artist": artist,
            "artwork": artwork,
            "trackUrl": track_url
        }),
    );

    std::thread::spawn(move || {
        match resolve_spotify_playable_stream(&app, &track_url, &title, &artist, &artwork) {
            Ok(payload) => {
                let _ = app.emit("spotify-bridge-ready", payload);
            }
            Err(err) => {
                let _ = app.emit(
                    "spotify-bridge-status",
                    serde_json::json!({
                        "status": "error",
                        "message": err
                    }),
                );
            }
        }
    });
}

#[tauri::command]
async fn play_spotify_bridge(
    app: AppHandle,
    url: String,
    title: Option<String>,
    artist: Option<String>,
    artwork: Option<String>,
) -> Result<Value, String> {
    let t = title.unwrap_or_default();
    let a = artist.unwrap_or_default();
    let art = artwork.unwrap_or_default();
    let app_clone = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        resolve_spotify_playable_stream(&app_clone, &url, &t, &a, &art)
    })
    .await
    .map_err(|e| format!("Spotify bridge task error: {e}"))?
}

#[tauri::command]
async fn open_spotify_widevine_browser(app: AppHandle, url: Option<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || open_spotify_widevine_browser_sync(&app, url))
        .await
        .map_err(|e| format!("Failed opening external browser: {e}"))?
}

fn open_spotify_widevine_browser_sync(app: &AppHandle, url: Option<String>) -> Result<(), String> {
    let fallback = get_webview_url("spotify-webview".to_string());
    let target = url
        .map(|u| u.trim().to_string())
        .filter(|u| u.starts_with("https://open.spotify.com"))
        .unwrap_or(fallback);

    if !is_snap_confined() {
        for bin in [
            "google-chrome",
            "google-chrome-stable",
            "brave-browser",
            "chromium",
            "chromium-browser",
            "microsoft-edge",
        ] {
            if std::process::Command::new(bin)
                .arg(format!("--app={target}"))
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .spawn()
                .is_ok()
            {
                return Ok(());
            }
        }
    }

    app.opener()
        .open_url(&target, None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_stream_url(app: AppHandle, filename: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
            return Err("Invalid filename".to_owned());
        }

        let file_path = resolve_audio_file(&app, &filename)
            .ok_or_else(|| format!("Audio file '{filename}' not found on disk in downloads folder"))?;

        let port = STREAM_SERVER_PORT.load(Ordering::SeqCst);
        if port == 0 {
            return Err("Streaming server not initialized".to_owned());
        }

        let served_rel = ensure_snap_playable_audio(&app, &file_path).unwrap_or(filename);
        let encoded = if let Some(sub) = served_rel.strip_prefix("__bridge/") {
            format!("__bridge/{}", percent_encode(sub))
        } else {
            percent_encode(&served_rel)
        };
        let url = format!("http://127.0.0.1:{port}/{encoded}");

        Ok(serde_json::json!({
            "success": true,
            "url": url,
            "port": port
        }))
    })
    .await
    .map_err(|e| format!("Stream URL task error: {e}"))?
}

fn provider_url(provider: &str) -> Result<&'static str, &'static str> {
    match provider {
        "youtube" => Ok("https://music.youtube.com/"),
        "spotify" => Ok("https://open.spotify.com/"),
        _ => Err("Unknown provider"),
    }
}

fn apply_shield_ok_response(
    response: &mut tauri::http::Response<Cow<'static, [u8]>>,
    content_type: &'static str,
) {
    *response.status_mut() = tauri::http::StatusCode::OK;
    let headers = response.headers_mut();
    headers.insert(
        tauri::http::header::CONTENT_TYPE,
        tauri::http::HeaderValue::from_static(content_type),
    );
    headers.insert(
        tauri::http::header::ACCESS_CONTROL_ALLOW_ORIGIN,
        tauri::http::HeaderValue::from_static("*"),
    );
    headers.insert(
        tauri::http::header::CACHE_CONTROL,
        tauri::http::HeaderValue::from_static("no-store"),
    );
    *response.body_mut() = match content_type {
        "application/json" => Cow::Borrowed(b"{\"ok\":true}"),
        "image/gif" => Cow::Borrowed(&EMPTY_1PX_GIF[..]),
        _ => Cow::Borrowed(b"/* blocked */"),
    };
}

fn handle_shield_or_bridge_request(
    app: &AppHandle,
    label: &str,
    uri: &tauri::http::Uri,
    provider_counter: &AtomicU64,
) -> Option<&'static str> {
    let path_and_query = uri.path_and_query().map(|pq| pq.as_str()).unwrap_or("");
    if uri.host() == Some("brave-shields.local") || path_and_query.starts_with("/__brave_shield_blocked__") {
        if path_and_query.contains("url_sync=1") {
            let params = parse_query_params(path_and_query);
            if let Some(u) = params.get("u") {
                record_webview_url(app, label, u);
            }
        } else if path_and_query.contains("spotify_play=1") {
            let params = parse_query_params(path_and_query);
            let track_url = params
                .get("url")
                .cloned()
                .unwrap_or_else(|| get_webview_url("spotify-webview".to_string()));
            let title = params.get("title").cloned().unwrap_or_default();
            let artist = params.get("artist").cloned().unwrap_or_default();
            let art = params.get("art").cloned().unwrap_or_default();
            spawn_spotify_bridge_play(app.clone(), track_url, title, artist, art);
        } else if path_and_query.contains("spotify_control=") {
            let params = parse_query_params(path_and_query);
            if let Some(action) = params.get("spotify_control") {
                let _ = app.emit("spotify-bridge-control", serde_json::json!({ "action": action }));
            }
        } else if path_and_query.contains("spotify_download=1") {
            let params = parse_query_params(path_and_query);
            let dl_url = params
                .get("url")
                .cloned()
                .unwrap_or_else(|| get_webview_url("spotify-webview".to_string()));
            let _ = app.emit("spotify-bridge-download", serde_json::json!({ "url": dl_url }));
        } else if path_and_query.contains("spotify_open_browser=1") {
            let params = parse_query_params(path_and_query);
            let target = params.get("url").cloned();
            let app_clone = app.clone();
            std::thread::spawn(move || {
                let _ = open_spotify_widevine_browser_sync(&app_clone, target);
            });
        } else if path_and_query.contains("log_error") {
            eprintln!(
                "[{label} Report] {}",
                percent_decode(path_and_query).unwrap_or_else(|| path_and_query.to_string())
            );
        } else {
            let total = BLOCKED_ADS_COUNT.fetch_add(1, Ordering::SeqCst) + 1;
            provider_counter.fetch_add(1, Ordering::Relaxed);
            let _ = app.emit("shield-update", serde_json::json!({ "count": total }));
        }
        return Some("application/json");
    }

    if is_ad_or_tracker_request(uri) {
        let total = BLOCKED_ADS_COUNT.fetch_add(1, Ordering::SeqCst) + 1;
        provider_counter.fetch_add(1, Ordering::Relaxed);
        let _ = app.emit("shield-update", serde_json::json!({ "count": total }));
        let path_lower = uri.path().to_ascii_lowercase();
        if path_lower.ends_with(".gif")
            || path_lower.ends_with(".png")
            || path_lower.ends_with(".jpg")
            || path_lower.ends_with(".jpeg")
            || path_lower.ends_with(".webp")
        {
            return Some("image/gif");
        }
        return Some("application/javascript");
    }

    None
}

fn main() {
    #[cfg(target_os = "linux")]
    {
        if std::env::var_os("NO_AT_BRIDGE").is_none() {
            std::env::set_var("NO_AT_BRIDGE", "1");
        }
        if std::env::var_os("SNAP").is_some() {
            if std::env::var_os("GIO_USE_PROXY_RESOLVER").is_none() {
                std::env::set_var("GIO_USE_PROXY_RESOLVER", "dummy");
            }
            if std::env::var_os("GIO_USE_NETWORK_MONITOR").is_none() {
                std::env::set_var("GIO_USE_NETWORK_MONITOR", "netlink");
            }
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .register_uri_scheme_protocol("brave-shields", move |ctx, _req| {
            let total = BLOCKED_ADS_COUNT.fetch_add(1, Ordering::SeqCst) + 1;
            let _ = ctx.app_handle().emit("shield-update", serde_json::json!({ "count": total }));
            tauri::http::Response::builder()
                .status(tauri::http::StatusCode::OK)
                .header("Content-Type", "image/gif")
                .header("Access-Control-Allow-Origin", "*")
                .body(Cow::Borrowed(&EMPTY_1PX_GIF[..]))
                .unwrap()
        })
        .setup(|app| {
            start_local_streaming_server(app.handle().clone());

            let window = match app.get_window("main") {
                Some(w) => w,
                None => return Ok(()),
            };

            let yt_url = match tauri::Url::parse("https://music.youtube.com/") {
                Ok(u) => u,
                Err(e) => {
                    eprintln!("[Tauri] Failed to parse YouTube Music URL: {e}");
                    return Ok(());
                }
            };

            let size = window.inner_size().unwrap_or(tauri::PhysicalSize::new(1360, 840));
            let scale = window.scale_factor().unwrap_or(1.0);
            let logical_w = size.width as f64 / scale;
            let logical_h = size.height as f64 / scale;
            let child_w = logical_w;
            let child_h = (logical_h - 58.0).max(100.0);

            let app_handle_for_yt = app.handle().clone();
            let app_handle_for_yt_nav = app.handle().clone();
            let app_handle_for_yt_popup = app.handle().clone();
            let yt_builder = tauri::WebviewBuilder::new("yt-webview", tauri::WebviewUrl::External(yt_url))
                .initialization_script(WINDOW_CHROME_POLYFILL_SCRIPT)
                .initialization_script(GUEST_ERROR_CAPTURE_SCRIPT)
                .initialization_script(SHIELDS_SCRIPT)
                .on_navigation(move |nav_url| {
                    record_webview_url(&app_handle_for_yt_nav, "yt-webview", nav_url.as_str());
                    true
                })
                .on_new_window(move |url, _features| {
                    if is_auth_url(url.as_str()) {
                        let app_clone = app_handle_for_yt_popup.clone();
                        let u = url.to_string();
                        std::thread::spawn(move || {
                            let _ = open_auth_window(&app_clone, "youtube", Some(u));
                        });
                        return tauri::webview::NewWindowResponse::Deny;
                    }
                    tauri::webview::NewWindowResponse::Allow
                })
                .on_web_resource_request(move |request, response| {
                    if let Some(ctype) = handle_shield_or_bridge_request(
                        &app_handle_for_yt,
                        "yt-webview",
                        request.uri(),
                        &YTM_BLOCKED_COUNT,
                    ) {
                        apply_shield_ok_response(response, ctype);
                    }
                });

            let auth_dir = auth_config_dir(app.handle());
            match window.add_child(
                yt_builder,
                tauri::LogicalPosition::new(0.0, 58.0),
                tauri::LogicalSize::new(child_w, child_h),
            ) {
                Ok(yt_wv) => {
                    eprintln!("[Tauri setup] yt-webview added successfully (spotify-webview deferred until selected)");
                    configure_webkit_webview_settings(&yt_wv, true);
                    if !webview_has_service_auth(&yt_wv, "youtube") {
                        if let Ok(bytes) = fs::read(auth_dir.join("ytmusic_session.json")) {
                            if let Ok(records) = serde_json::from_slice::<Vec<Value>>(&bytes) {
                                let applied = apply_cookie_values_to_webview(&yt_wv, &records);
                                if applied > 0 {
                                    YT_AUTH_COOKIE_HINT.store(true, Ordering::Relaxed);
                                    let _ = yt_wv.eval("window.location.reload()");
                                }
                            }
                        }
                    } else {
                        YT_AUTH_COOKIE_HINT.store(true, Ordering::Relaxed);
                    }
                    let _ = yt_wv.show();
                }
                Err(e) => {
                    eprintln!("[Tauri setup] Failed to add yt-webview: {e:?}");
                }
            }

            #[cfg(target_os = "linux")]
            {
                let win = window.clone();
                let _ = app.run_on_main_thread(move || {
                    setup_linux_overlay(&win);
                    update_linux_layout(&win, "yt-view");
                });
            }

            {
                let app_handle = window.app_handle().clone();
                window.on_window_event(move |event| match event {
                    tauri::WindowEvent::CloseRequested { .. } => {
                        cleanup_background_processes(&app_handle);
                        app_handle.exit(0);
                    }
                    #[cfg(target_os = "linux")]
                    tauri::WindowEvent::Resized(_) => {
                        if let Some(main_win) = app_handle.get_window("main") {
                            let _ = sync_window_state_and_layout(&app_handle, &main_win);
                        }
                    }
                    #[cfg(not(target_os = "linux"))]
                    tauri::WindowEvent::Resized(physical_size) => {
                        let scale = app_handle
                            .get_window("main")
                            .and_then(|w| w.scale_factor().ok())
                            .unwrap_or(1.0);
                        let child_w = physical_size.width as f64 / scale;
                        let child_h = ((physical_size.height as f64 / scale) - 58.0).max(100.0);
                        if let Some(yt) = app_handle.get_webview("yt-webview") {
                            let _ = yt.set_position(tauri::LogicalPosition::new(0.0, 58.0));
                            let _ = yt.set_size(tauri::LogicalSize::new(child_w, child_h));
                        }
                        if let Some(sp) = app_handle.get_webview("spotify-webview") {
                            let _ = sp.set_position(tauri::LogicalPosition::new(0.0, 58.0));
                            let _ = sp.set_size(tauri::LogicalSize::new(child_w, child_h));
                        }
                        if let Some(main_win) = app_handle.get_window("main") {
                            let _ = sync_window_state_and_layout(&app_handle, &main_win);
                        }
                    }
                    _ => {}
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            runtime_info,
            get_library,
            import_legacy_library,
            create_playlist,
            delete_playlist,
            set_playlist_cover,
            add_track_to_playlist,
            remove_track_from_playlist,
            delete_track,
            delete_tracks,
            switch_tab,
            set_modal_state,
            get_shield_stats,
            reset_shield_stats,
            record_ad_blocked,
            reload_tab,
            eval_script,
            start_download,
            cancel_download,
            get_recommendations,
            open_provider,
            open_external,
            open_folder,
            show_in_folder,
            select_download_folder,
            window_minimize,
            window_maximize,
            window_close,
            window_start_dragging,
            window_start_resize_dragging,
            window_get_state,
            window_toggle_fullscreen,
            window_toggle_always_on_top,
            window_toggle_decorations,
            window_center,
            window_reset_size,
            window_snap_left,
            window_snap_right,
            window_show_menu,
            get_app_version,
            get_webview_url,
            get_stream_url,
            play_spotify_bridge,
            open_spotify_widevine_browser,
            get_auth_status,
            get_saved_accounts,
            save_user_account,
            logout_provider,
            import_cookies_json,
            start_service_login,
            cancel_service_login
        ])
        .build(tauri::generate_context!())
        .expect("failed to build Brave Music Linux preview")
        .run(|app_handle, event| match event {
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
                cleanup_background_processes(app_handle);
            }
            _ => {}
        });
}

#[cfg(test)]
mod tests {
    use super::{
        apply_shield_ok_response, create_ytdlp_base_command, import_library_file, is_auth_url,
        is_service_auth_cookie, is_service_landing_url, is_webkit_native_audio_ext,
        parse_cookie_json_payload, parse_query_params, parse_resize_direction,
        persist_service_account, provider_url, prune_spotify_bridge_cache, read_accounts_map,
        register_child_pid, score_yt_candidate, stable_hash_hex, unregister_child_pid,
        SearchCandidate, ACTIVE_CHILD_PIDS,
    };
    use brave_music_core::library::LibraryDocument;
    use serde_json::json;
    use std::fs;

    #[test]
    fn maps_supported_providers_to_fixed_https_urls() {
        assert_eq!(provider_url("youtube"), Ok("https://music.youtube.com/"));
        assert_eq!(provider_url("spotify"), Ok("https://open.spotify.com/"));
    }

    #[test]
    fn rejects_arbitrary_urls_and_unknown_providers() {
        for input in [
            "https://attacker.example/",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "youtube?url=https://attacker.example/",
            "",
        ] {
            assert_eq!(provider_url(input), Err("Unknown provider"));
        }
    }

    #[test]
    fn core_library_model_keeps_unknown_legacy_fields() {
        let value = json!({
            "tracks": [{"id": "t1", "title": "Track", "pluginField": true}],
            "playlists": {"Mix": ["t1"]},
            "playlistCovers": {},
            "legacyFeature": {"enabled": true}
        });
        let mut document: LibraryDocument = serde_json::from_value(value.clone()).unwrap();
        document.create_playlist("New Mix", None).unwrap();
        let updated = serde_json::to_value(document).unwrap();

        assert_eq!(updated["tracks"][0]["pluginField"], true);
        assert_eq!(updated["legacyFeature"], value["legacyFeature"]);
        assert_eq!(updated["playlists"]["New Mix"], json!([]));
    }

    #[test]
    fn legacy_import_verifies_backup_and_leaves_source_unchanged() {
        let directory = tempfile::tempdir().unwrap();
        let source = directory.path().join("legacy/library.json");
        let target = directory.path().join("new-app/library.json");
        let backup = directory.path().join("backup/legacy-library.json");
        fs::create_dir_all(source.parent().unwrap()).unwrap();
        fs::write(
            &source,
            r#"{"tracks":[{"id":"t1","title":"Track"}],"playlists":{"Mix":["t1"]}}"#,
        )
        .unwrap();

        let imported = import_library_file(&source, &target, &backup).unwrap();
        assert_eq!(imported.tracks.len(), 1);
        assert_eq!(imported.tracks[0]["id"], "t1");
        assert!(target.exists());
        assert!(backup.exists());
        assert_eq!(
            fs::read_to_string(&source).unwrap(),
            fs::read_to_string(&backup).unwrap()
        );
    }

    #[test]
    fn scores_official_audio_higher_than_slowed_or_cover_variants() {
        let official = SearchCandidate {
            id: "abc123",
            title: "Blinding Lights",
            uploader: "The Weeknd - Topic",
            duration: 200,
            url: "https://www.youtube.com/watch?v=abc123",
            is_live: false,
        };
        let slowed_cover = SearchCandidate {
            id: "xyz999",
            title: "Blinding Lights (Slowed + Reverb Cover)",
            uploader: "Random Edits",
            duration: 245,
            url: "https://www.youtube.com/watch?v=xyz999",
            is_live: false,
        };
        let s_official = score_yt_candidate(&official, "Blinding Lights", "The Weeknd", 200, false);
        let s_bad = score_yt_candidate(&slowed_cover, "Blinding Lights", "The Weeknd", 200, false);
        assert!(s_official > s_bad + 50, "expected official ({}) >> variant ({})", s_official, s_bad);
    }

    #[test]
    fn detects_google_and_spotify_auth_urls_without_misclassifying_player_home() {
        assert!(is_auth_url("https://accounts.google.com/v3/signin/identifier"));
        assert!(is_auth_url("https://accounts.youtube.com/accounts/SetSID"));
        assert!(is_auth_url("https://accounts.spotify.com/en/login"));
        assert!(!is_auth_url("https://music.youtube.com/"));
        assert!(!is_auth_url("https://open.spotify.com/"));

        assert!(is_service_landing_url("youtube", "https://music.youtube.com/?hl=en"));
        assert!(!is_service_landing_url("youtube", "https://accounts.google.com/ServiceLogin"));
        assert!(is_service_landing_url("spotify", "https://open.spotify.com/collection/playlists"));
        assert!(!is_service_landing_url("spotify", "https://accounts.spotify.com/en/login"));
    }

    #[test]
    fn validates_cookie_json_and_persists_account_state_atomically() {
        let parsed = parse_cookie_json_payload(
            r#"[{"name":"SID","value":"abc","domain":".google.com"},{"name":"","value":"skip"}]"#,
        )
        .unwrap();
        assert_eq!(parsed.len(), 1);
        assert!(is_service_auth_cookie("youtube", "SID", ".google.com"));
        assert!(is_service_auth_cookie("spotify", "sp_dc", ".spotify.com"));
        assert!(!is_service_auth_cookie("spotify", "SID", ".spotify.com"));

        let dir = tempfile::tempdir().unwrap();
        persist_service_account(
            dir.path(),
            "youtube",
            "Tester",
            "tester@example.com",
            "",
            "in-app-webview",
        )
        .unwrap();
        let saved = read_accounts_map(dir.path());
        assert_eq!(saved["youtube"]["authenticated"], true);
        assert_eq!(saved["youtube"]["name"], "Tester");
        assert_eq!(saved["youtube"]["source"], "in-app-webview");
    }

    #[test]
    fn parses_bridge_query_params_and_validates_webkit_audio_codecs() {
        let params = parse_query_params(
            "/__brave_shield_blocked__?spotify_play=1&title=Starboy%20%26%20Friends&artist=The+Weeknd&url=https%3A%2F%2Fopen.spotify.com%2Ftrack%2F123",
        );
        assert_eq!(params.get("spotify_play").map(String::as_str), Some("1"));
        assert_eq!(params.get("title").map(String::as_str), Some("Starboy & Friends"));
        assert_eq!(params.get("artist").map(String::as_str), Some("The Weeknd"));
        assert_eq!(
            params.get("url").map(String::as_str),
            Some("https://open.spotify.com/track/123")
        );

        assert!(is_webkit_native_audio_ext("webm"));
        assert!(is_webkit_native_audio_ext("MP3"));
        assert!(is_webkit_native_audio_ext("opus"));
        assert!(is_webkit_native_audio_ext("flac"));
        assert!(!is_webkit_native_audio_ext("m4a"));
        assert!(!is_webkit_native_audio_ext("aac"));

        assert_eq!(stable_hash_hex("track|artist").len(), 16);

        let dir = tempfile::tempdir().unwrap();
        for i in 0..4 {
            fs::write(dir.path().join(format!("item_{i}.webm")), b"audio").unwrap();
            std::thread::sleep(std::time::Duration::from_millis(12));
        }
        prune_spotify_bridge_cache(dir.path(), 2);
        let remaining: Vec<_> = fs::read_dir(dir.path()).unwrap().collect();
        assert_eq!(remaining.len(), 2);
    }

    #[test]
    fn shield_ok_responses_include_valid_content_type_and_non_empty_body() {
        for (ctype, expected_prefix) in [
            ("application/json", b"{\"ok\":true}".as_slice()),
            ("application/javascript", b"/* blocked */".as_slice()),
        ] {
            let mut resp = tauri::http::Response::builder()
                .body(std::borrow::Cow::Borrowed(b"".as_slice()))
                .unwrap();
            apply_shield_ok_response(&mut resp, ctype);
            assert_eq!(resp.status(), tauri::http::StatusCode::OK);
            assert_eq!(
                resp.headers()
                    .get(tauri::http::header::CONTENT_TYPE)
                    .and_then(|v| v.to_str().ok()),
                Some(ctype)
            );
            assert_eq!(
                resp.headers()
                    .get(tauri::http::header::ACCESS_CONTROL_ALLOW_ORIGIN)
                    .and_then(|v| v.to_str().ok()),
                Some("*")
            );
            assert_eq!(resp.body().as_ref(), expected_prefix);
        }

        let mut gif_resp = tauri::http::Response::builder()
            .body(std::borrow::Cow::Borrowed(b"".as_slice()))
            .unwrap();
        apply_shield_ok_response(&mut gif_resp, "image/gif");
        assert_eq!(gif_resp.status(), tauri::http::StatusCode::OK);
        assert!(gif_resp.body().starts_with(b"GIF89a"));
    }

    #[test]
    fn child_pid_registry_tracks_and_unregisters_cleanly() {
        register_child_pid(999_991);
        assert!(ACTIVE_CHILD_PIDS.lock().unwrap().contains(&999_991));
        unregister_child_pid(999_991);
        assert!(!ACTIVE_CHILD_PIDS.lock().unwrap().contains(&999_991));
    }

    #[test]
    fn ytdlp_base_command_avoids_mweb_403_clients() {
        let bin = std::path::PathBuf::from("yt-dlp");
        let ff = std::path::PathBuf::from("/opt/brave-music/backend/bin");
        let cmd = create_ytdlp_base_command(&bin, Some("quickjs:/opt/qjs"), Some(&ff));
        let args: Vec<String> = cmd
            .get_args()
            .map(|a| a.to_string_lossy().into_owned())
            .collect();
        assert!(args.contains(&"youtube:player_client=web_embedded,tv_simply,android,web".to_string()));
        assert!(!args.iter().any(|a| a.contains("mweb")));
        assert!(args.contains(&"quickjs:/opt/qjs".to_string()));
    }

    #[test]
    fn parses_all_window_resize_directions() {
        assert_eq!(parse_resize_direction("n"), Some(tauri_runtime::ResizeDirection::North));
        assert_eq!(parse_resize_direction("S"), Some(tauri_runtime::ResizeDirection::South));
        assert_eq!(parse_resize_direction("w"), Some(tauri_runtime::ResizeDirection::West));
        assert_eq!(parse_resize_direction("e"), Some(tauri_runtime::ResizeDirection::East));
        assert_eq!(parse_resize_direction("nw"), Some(tauri_runtime::ResizeDirection::NorthWest));
        assert_eq!(parse_resize_direction("NE"), Some(tauri_runtime::ResizeDirection::NorthEast));
        assert_eq!(parse_resize_direction("sw"), Some(tauri_runtime::ResizeDirection::SouthWest));
        assert_eq!(parse_resize_direction("se"), Some(tauri_runtime::ResizeDirection::SouthEast));
        assert_eq!(parse_resize_direction("diagonal"), None);
    }
}
