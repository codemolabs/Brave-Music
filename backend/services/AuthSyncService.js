const { execFile, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { shell, session } = require('electron');

const SHARED_PARTITION = 'persist:bravemusic';

class AuthSyncService {
  constructor() {
    this.tempCookieFile = path.join(os.tmpdir(), `brave_music_sync_${process.pid}.txt`);
  }

  getSnapBravePath() {
    return path.join(process.env.HOME || os.homedir(), 'snap/brave/current/.config/BraveSoftware/Brave-Browser');
  }

  getDefaultBrowserTarget() {
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
    const home = process.env.HOME || os.homedir();
    if (id.includes('brave')) {
      const snapProfile = this.getSnapBravePath();
      const standardProfile = path.join(home, '.config/BraveSoftware/Brave-Browser');
      if (fs.existsSync(snapProfile)) return `brave:${snapProfile}`;
      if (fs.existsSync(standardProfile)) return `brave:${standardProfile}`;
      return 'brave';
    }
    if (id.includes('chrome') || id.includes('google-chrome')) return 'chrome:Default';
    if (id.includes('chromium')) return 'chromium';
    if (id.includes('firefox')) return 'firefox';
    if (id.includes('microsoft-edge') || id.includes('edge')) return 'edge';
    throw new Error(`Could not identify the default browser (${desktopId || 'no desktop handler configured'}).`);
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

  async runYtDlpExtraction(targetArg, targetUrl) {
    const tempFile = path.join(os.tmpdir(), `ytdlp_sync_${Date.now()}_${Math.random().toString(36).substring(7)}.txt`);
    try {
      fs.writeFileSync(tempFile, '# Netscape HTTP Cookie File\n', { flag: 'wx', mode: 0o600 });
    } catch (error) {
      return { success: false, cookies: [], error: error.message };
    }

    return new Promise((resolve) => {
      execFile('yt-dlp', [
        '--cookies-from-browser', targetArg,
        '--cookies', tempFile,
        '--playlist-items', '0',
        '--skip-download',
        targetUrl
      ], { timeout: 20000 }, (error, stdout, stderr) => {
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
    const browserTarget = this.getDefaultBrowserTarget();
    const result = await this.runYtDlpExtraction(browserTarget, 'https://www.youtube.com');
    if (!result.success) return { ...result, browserTarget };

    const allowedDomains = serviceTarget === 'spotify'
      ? ['spotify.com', 'spotifycdn.com', 'scdn.co']
      : ['youtube.com', 'google.com', 'googleusercontent.com', 'gstatic.com'];
    const cookies = result.cookies.filter((cookie) => {
      const domain = (cookie.domain || '').toLowerCase().replace(/^\./, '');
      return allowedDomains.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
    });
    return { success: true, browserTarget, cookies };
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
