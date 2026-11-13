const { execFile, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { shell, session } = require('electron');
const config = require('../config/appConfig');

const SHARED_PARTITION = 'persist:bravemusic';

class AuthSyncService {
  constructor() {
    this.tempCookieFile = path.join(os.tmpdir(), `brave_music_sync_${process.pid}.txt`);
  }

  getRealHomeDir() {
    if (process.env.SNAP_REAL_HOME && fs.existsSync(process.env.SNAP_REAL_HOME)) {
      return process.env.SNAP_REAL_HOME;
    }
    try {
      const infoHome = os.userInfo().homedir;
      if (infoHome && !infoHome.includes('/snap/brave-music/') && fs.existsSync(infoHome)) {
        return infoHome;
      }
    } catch (e) {}
    return process.env.HOME || os.homedir();
  }

  getSnapBravePath() {
    return path.join(this.getRealHomeDir(), 'snap/brave/current/.config/BraveSoftware/Brave-Browser');
  }

  getDefaultDesktopBrowserFamily() {
    let desktopId = '';
    for (const [command, args] of [
      ['xdg-settings', ['get', 'default-web-browser']],
      ['xdg-mime', ['query', 'default', 'x-scheme-handler/https']]
    ]) {
      try {
        desktopId = execFileSync(command, args, { encoding: 'utf8', timeout: 3000 }).trim();
        if (desktopId) break;
      } catch (error) {}
    }
    const id = desktopId.toLowerCase();
    if (id.includes('brave')) return 'brave';
    if (id.includes('chrome') || id.includes('google-chrome')) return 'chrome';
    if (id.includes('chromium')) return 'chromium';
    if (id.includes('firefox')) return 'firefox';
    if (id.includes('microsoft-edge') || id.includes('edge')) return 'edge';
    return '';
  }

  discoverBrowserProfiles() {
    const home = this.getRealHomeDir();
    const defaultFamily = this.getDefaultDesktopBrowserFamily();
    const roots = [
      { browser: 'brave', dir: path.join(home, 'snap/brave/current/.config/BraveSoftware/Brave-Browser') },
      { browser: 'brave', dir: path.join(home, '.config/BraveSoftware/Brave-Browser') },
      { browser: 'chrome', dir: path.join(home, '.config/google-chrome') },
      { browser: 'chromium', dir: path.join(home, '.config/chromium') },
      { browser: 'chromium', dir: path.join(home, 'snap/chromium/current/.config/chromium') },
      { browser: 'edge', dir: path.join(home, '.config/microsoft-edge') }
    ];

    const profiles = [];

    for (const root of roots) {
      if (!fs.existsSync(root.dir)) continue;
      let entries = [];
      try {
        entries = fs.readdirSync(root.dir);
      } catch (e) {
        continue;
      }

      for (const entry of entries) {
        if (entry === 'Default' || entry.startsWith('Profile ')) {
          const profDir = path.join(root.dir, entry);
          const c1 = path.join(profDir, 'Network', 'Cookies');
          const c2 = path.join(profDir, 'Cookies');
          const cookieFile = fs.existsSync(c1) ? c1 : (fs.existsSync(c2) ? c2 : null);
          if (!cookieFile) continue;

          try {
            fs.accessSync(cookieFile, fs.constants.R_OK);
          } catch (e) {
            continue;
          }

          let mtimeMs = 0;
          try {
            mtimeMs = fs.statSync(cookieFile).mtimeMs || 0;
          } catch (e) {}

          profiles.push({
            browser: root.browser,
            profilePath: profDir,
            targetArg: `${root.browser}:${profDir}`,
            isDefaultFamily: root.browser === defaultFamily,
            mtimeMs
          });
        }
      }
    }

    // Sort: Default browser family's most recently modified profile first, then all others by mtimeMs
    profiles.sort((a, b) => {
      if (a.isDefaultFamily !== b.isDefaultFamily) {
        return a.isDefaultFamily ? -1 : 1;
      }
      return b.mtimeMs - a.mtimeMs;
    });

    // Also append firefox fallback only if its profile folder is actually readable
    for (const ffDir of [path.join(home, '.mozilla/firefox'), path.join(home, 'snap/firefox/common/.mozilla/firefox')]) {
      try {
        if (fs.existsSync(ffDir)) {
          fs.accessSync(ffDir, fs.constants.R_OK | fs.constants.X_OK);
          const ffEntries = fs.readdirSync(ffDir);
          if (ffEntries.length > 0) {
            profiles.push({
              browser: 'firefox',
              profilePath: null,
              targetArg: 'firefox',
              isDefaultFamily: defaultFamily === 'firefox',
              mtimeMs: 0
            });
            break;
          }
        }
      } catch (e) {}
    }

    return profiles;
  }

  isSnapConfined() {
    return Boolean(process.env.SNAP);
  }

  hasAccessibleHostBrowsers() {
    if (process.platform === 'win32' || process.platform === 'darwin') {
      return { accessible: true, isSnap: false, profiles: this.discoverBrowserProfiles() };
    }
    const profiles = this.discoverBrowserProfiles();
    return {
      accessible: profiles.length > 0,
      isSnap: this.isSnapConfined(),
      profiles
    };
  }

  getAuthCapabilities() {
    const hostInfo = this.hasAccessibleHostBrowsers();
    return {
      isSnap: hostInfo.isSnap,
      hostSyncAvailable: hostInfo.accessible,
      accessibleProfileCount: hostInfo.profiles.length,
      defaultBrowserFamily: this.getDefaultDesktopBrowserFamily() || ''
    };
  }

  getDefaultBrowserTarget() {
    const profiles = this.discoverBrowserProfiles();
    if (profiles.length > 0) {
      return profiles[0].targetArg;
    }
    const family = this.getDefaultDesktopBrowserFamily();
    return family || 'brave';
  }

  getAvailableBrowsers() {
    const available = [];
    available.push({ id: 'auto', name: '★ Auto-Detect & Sync All Active Logins (Recommended)' });
    const isWin = process.platform === 'win32';
    const home = process.env.HOME || os.homedir();
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');

    // 1. Brave Browser (Snap, Standard & Windows)
    const snapBrave = this.getSnapBravePath();
    const stdBrave = isWin
      ? path.join(localAppData, 'BraveSoftware/Brave-Browser/User Data')
      : path.join(home, '.config/BraveSoftware/Brave-Browser');
    if (snapBrave && fs.existsSync(snapBrave)) {
      available.push({ id: 'brave:snap', name: 'Brave Browser (Snap - Active Session)' });
    } else if (fs.existsSync(stdBrave)) {
      available.push({ id: 'brave', name: 'Brave Browser' });
    }

    // 2. Google Chrome Profiles
    const chromeDir = isWin
      ? path.join(localAppData, 'Google/Chrome/User Data')
      : path.join(home, '.config/google-chrome');
    if (fs.existsSync(chromeDir)) {
      try {
        const entries = fs.readdirSync(chromeDir);
        for (const entry of entries) {
          if (entry === 'Default' || entry.startsWith('Profile ')) {
            const prefPath = path.join(chromeDir, entry, 'Preferences');
            let label = `Google Chrome (${entry})`;
            if (fs.existsSync(prefPath)) {
              try {
                const pref = JSON.parse(fs.readFileSync(prefPath, 'utf8'));
                const emails = (pref.account_info || []).map(a => a.email).filter(Boolean);
                const profileName = pref.profile?.name;
                if (emails.length > 0) {
                  label = `Google Chrome - ${emails.join(', ')}`;
                } else if (profileName) {
                  label = `Google Chrome - ${profileName}`;
                }
              } catch (e) {}
            }
            available.push({ id: `chrome:${entry}`, name: label });
          }
        }
      } catch (e) {}
    }

    // 3. Microsoft Edge Profiles
    const edgeDir = isWin
      ? path.join(localAppData, 'Microsoft/Edge/User Data')
      : path.join(home, '.config/microsoft-edge');
    if (fs.existsSync(edgeDir)) {
      available.push({ id: 'edge', name: 'Microsoft Edge' });
    }

    // 4. Mozilla Firefox
    if (!isWin && (fs.existsSync('/usr/bin/firefox') || fs.existsSync('/snap/bin/firefox'))) {
      available.push({ id: 'firefox', name: 'Mozilla Firefox' });
    }

    // 5. Chromium
    if (!isWin && (fs.existsSync('/usr/bin/chromium') || fs.existsSync('/usr/bin/chromium-browser'))) {
      available.push({ id: 'chromium', name: 'Chromium' });
    }

    return available;
  }

  async openInDefaultBrowser(url) {
    if (!url) {
      url = 'https://music.youtube.com';
    }
    try {
      await shell.openExternal(url);
      return { success: true, url };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  parseNetscapeCookies(filePath) {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8');
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

      const isDomain = flag.toUpperCase() === 'TRUE' || domain.startsWith('.');
      const cleanDomain = domain.startsWith('.') ? domain.substring(1) : domain;
      const isHostPrefix = name.startsWith('__Host-');
      const isSecurePrefix = name.startsWith('__Secure-');
      const isSecure = secure.toUpperCase() === 'TRUE' || isHostPrefix || isSecurePrefix;
      const protocol = isSecure ? 'https://' : 'http://';
      const cookieUrl = `${protocol}${cleanDomain}${cookiePath}`;

      const expiryNum = parseInt(expiry, 10);

      const cookieObj = {
        url: cookieUrl,
        name: name.trim(),
        value: value.trim(),
        path: isHostPrefix ? '/' : (cookiePath || '/'),
        secure: isSecure,
        httpOnly: isHttpOnly,
        expirationDate: expiryNum > 0 ? Math.min(expiryNum, 2147483647) : undefined
      };

      // RFC 6265bis: __Host- cookies must NOT have domain set (must be host-only)
      if (!isHostPrefix && isDomain) {
        cookieObj.domain = `.${cleanDomain}`;
      }

      cookies.push(cookieObj);
    }
    return cookies;
  }

  resolveTargetArg(browserId) {
    const snapBrave = this.getSnapBravePath();
    const lower = (browserId || '').toLowerCase();

    if (browserId === 'brave:snap' || (lower.includes('brave') && fs.existsSync(snapBrave))) {
      return `brave:${snapBrave}`;
    }
    if (browserId.startsWith('chrome:')) {
      return browserId;
    }
    if (lower.includes('firefox')) return 'firefox';
    if (lower.includes('chromium')) return 'chromium';
    if (lower.includes('brave')) return 'brave';
    return 'chrome';
  }

  async extractCookiesDirect(browserName, profilePath) {
    const pyScript = `
import sys, json
sys.path.insert(0, sys.argv[1])
from yt_dlp.cookies import extract_cookies_from_browser
browser = sys.argv[2]
profile = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else None
jar = extract_cookies_from_browser(browser, profile)
out = []
for c in jar:
    dom = (c.domain or "").strip()
    if not dom:
        continue
    is_domain = bool(c.domain_specified or dom.startswith("."))
    clean_dom = dom.lstrip(".")
    is_host = c.name.startswith("__Host-")
    is_sec = bool(c.secure or is_host or c.name.startswith("__Secure-"))
    proto = "https://" if is_sec else "http://"
    c_path = "/" if is_host else (c.path or "/")
    url = f"{proto}{clean_dom}{c_path}"
    rest_keys = {str(k).lower() for k in getattr(c, "_rest", {}).keys()}
    http_only = "httponly" in rest_keys
    item = {
        "url": url,
        "name": c.name,
        "value": c.value,
        "path": c_path,
        "secure": is_sec,
        "httpOnly": http_only
    }
    if not is_host and is_domain:
        item["domain"] = "." + clean_dom
    if c.expires and c.expires > 0:
        item["expirationDate"] = min(int(c.expires), 2147483647)
    out.append(item)
print(json.dumps(out))
`;
    return new Promise((resolve) => {
      execFile('python3', [
        '-c',
        pyScript,
        config.paths.ytdlpBin,
        browserName,
        profilePath || ''
      ], {
        timeout: 12000,
        maxBuffer: 10 * 1024 * 1024,
        env: {
          ...process.env,
          HOME: this.getRealHomeDir(),
          PATH: `${config.paths.bundledBinDir}:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ''}`
        }
      }, (error, stdout, stderr) => {
        if (!error && stdout) {
          try {
            const cookies = JSON.parse(stdout.trim());
            if (Array.isArray(cookies)) {
              return resolve({ success: cookies.length > 0, cookies, error: '' });
            }
          } catch (e) {}
        }
        resolve({ success: false, cookies: [], error: error ? error.message : (stderr || 'Failed to extract cookies') });
      });
    });
  }

  async runYtDlpExtraction(targetArg, targetUrl) {
    const colonIdx = targetArg.indexOf(':');
    const browserName = colonIdx > 0 ? targetArg.slice(0, colonIdx) : targetArg;
    const profilePath = colonIdx > 0 ? targetArg.slice(colonIdx + 1) : '';

    // 1. Try direct zero-network Python extraction first (~1.2s, no temporary file)
    const directRes = await this.extractCookiesDirect(browserName, profilePath);
    if (directRes.success && directRes.cookies.length > 0) {
      return directRes;
    }

    // 2. Fallback to CLI extraction
    const tempFile = path.join(os.tmpdir(), `ytdlp_sync_${Date.now()}_${Math.random().toString(36).substring(7)}.txt`);
    try {
      fs.writeFileSync(tempFile, '# Netscape HTTP Cookie File\n', { flag: 'wx', mode: 0o600 });
    } catch (error) {
      return { success: false, cookies: [], error: error.message };
    }

    return new Promise((resolve) => {
      execFile(config.paths.ytdlpBin, [
        '--no-update',
        '--cookies-from-browser', targetArg,
        '--cookies', tempFile,
        '--playlist-items', '0',
        '--skip-download',
        targetUrl
      ], {
        timeout: 20000,
        env: {
          ...process.env,
          HOME: this.getRealHomeDir(),
          PATH: `${config.paths.bundledBinDir}:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ''}`
        }
      }, (error, stdout, stderr) => {
        if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 0) {
          const cookies = this.parseNetscapeCookies(tempFile);
          try { fs.unlinkSync(tempFile); } catch (e) {}
          resolve({ success: cookies.length > 0, cookies, error: error ? error.message : stderr });
        } else {
          try { fs.unlinkSync(tempFile); } catch (e) {}
          resolve({ success: false, cookies: [], error: error ? error.message : stderr });
        }
      });
    });
  }

  async extractDefaultBrowserCookies(serviceTarget = 'youtube') {
    const isSpotify = (serviceTarget || '').toLowerCase() === 'spotify';
    const allowedDomains = isSpotify
      ? ['spotify.com', 'spotifycdn.com', 'scdn.co']
      : ['youtube.com', 'google.com', 'googleusercontent.com', 'gstatic.com'];

    const profiles = this.discoverBrowserProfiles();
    const candidates = profiles.length > 0
      ? profiles.map(p => p.targetArg)
      : [this.getDefaultBrowserTarget()];

    let fallbackCookies = [];
    let primaryTarget = candidates[0] || 'brave';
    let lastError = '';

    for (const targetArg of candidates) {
      const result = await this.runYtDlpExtraction(targetArg, 'https://www.youtube.com');
      if (!result.success) {
        lastError = result.error || lastError;
        continue;
      }

      const cookies = (result.cookies || []).filter((cookie) => {
        const domain = (cookie.domain || (cookie.url ? new URL(cookie.url).hostname : '')).toLowerCase().replace(/^\./, '');
        return allowedDomains.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
      });

      const hasServiceLogin = isSpotify
        ? cookies.some((c) => c.name === 'sp_dc') ||
          (cookies.some((c) => c.name === 'sp_key') && cookies.some((c) => c.name === 'sp_t'))
        : cookies.some((c) => c.name === 'LOGIN_INFO' || c.name === '__Secure-3PAPISID') ||
          (cookies.some((c) => c.name === 'SAPISID') && cookies.some((c) => c.name === 'SID'));

      if (hasServiceLogin) {
        return { success: true, browserTarget: targetArg, cookies };
      }

      if (cookies.length > fallbackCookies.length) {
        fallbackCookies = cookies;
        primaryTarget = targetArg;
      }
    }

    if (fallbackCookies.length > 0) {
      return { success: true, browserTarget: primaryTarget, cookies: fallbackCookies };
    }

    return { success: false, browserTarget: primaryTarget, cookies: [], error: lastError };
  }

  async extractAndImportCookies(browserId = 'auto', serviceTarget = 'youtube') {
    const targetUrl = serviceTarget === 'spotify' 
      ? 'https://open.spotify.com' 
      : 'https://www.youtube.com';

    let candidates = [];
    if (browserId === 'auto') {
      const snapBrave = this.getSnapBravePath();
      if (fs.existsSync(snapBrave)) candidates.push(`brave:${snapBrave}`);
      
      const chromeDir = path.join(process.env.HOME || os.homedir(), '.config/google-chrome');
      if (fs.existsSync(chromeDir)) {
        try {
          const entries = fs.readdirSync(chromeDir);
          for (const entry of entries) {
            if (entry === 'Default' || entry.startsWith('Profile ')) {
              candidates.push(`chrome:${entry}`);
            }
          }
        } catch (e) {}
      }
      candidates.push('firefox');
      candidates.push('chromium');
    } else {
      candidates.push(this.resolveTargetArg(browserId));
    }

    let allExtractedCookies = [];
    let loggedInTarget = '';

    for (const target of candidates) {
      const res = await this.runYtDlpExtraction(target, targetUrl);
      if (res.success && res.cookies.length > 0) {
        const hasLoginInfo = res.cookies.some(c => c.name === 'LOGIN_INFO');
        allExtractedCookies = allExtractedCookies.concat(res.cookies);
        if (hasLoginInfo && !loggedInTarget) {
          loggedInTarget = target;
          if (browserId === 'auto') break; // Active logged-in session found
        }
      }
    }

    if (allExtractedCookies.length === 0) {
      return {
        success: false,
        message: 'Could not extract session from browser. Make sure you are signed into your browser and try again.'
      };
    }

    try {
      const partitions = [session.fromPartition(SHARED_PARTITION), session.defaultSession];
      let importedCount = 0;

      for (const c of allExtractedCookies) {
        const u = c.url.toLowerCase();
        const isTargetDomain = 
          u.includes('youtube.com') || 
          u.includes('google.com') || 
          u.includes('spotify.com') || 
          u.includes('gstatic.com') ||
          u.includes('doubleclick.net');

        if (isTargetDomain) {
          for (const s of partitions) {
            try {
              await s.cookies.set(c);
            } catch (setErr) {
              if (c.domain) {
                try {
                  const fallback = { ...c };
                  delete fallback.domain;
                  await s.cookies.set(fallback);
                } catch (fErr) {}
              }
            }
          }
          importedCount++;
        }
      }

      const hasLogin = allExtractedCookies.some(c => c.name === 'LOGIN_INFO');

      return {
        success: true,
        count: importedCount,
        hasLogin,
        message: hasLogin
          ? `Successfully synchronized ${importedCount} session cookies! Active logged-in YouTube Music session applied.`
          : `Synchronized ${importedCount} session cookies. Note: If you still see 'Sign in', open YouTube Music in your browser, click 'Sign in' once there, and sync again.`
      };
    } catch (err) {
      return {
        success: false,
        message: `Error importing cookies: ${err.message}`
      };
    }
  }
}

module.exports = new AuthSyncService();
