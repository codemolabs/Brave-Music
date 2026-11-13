# Installing Brave Music (Linux)

This guide provides official instructions for installing, configuring, verifying, and updating Brave Music on supported Linux environments.

---

## Supported Operating Systems

Brave Music is tested and officially supported on 64-bit (`x86_64` / `amd64`) Linux distributions:

| Platform | Minimum Version | Official Installation Package | Status |
| :--- | :--- | :--- | :--- |
| **Ubuntu** | 20.04 LTS, 22.04 LTS, 24.04 LTS | **Ubuntu Snap (`snap`)** / Debian (`.deb`) / npm | Fully Supported |
| **Debian** | 11 (Bullseye), 12 (Bookworm) | **Ubuntu Snap (`snap`)** / Debian (`.deb`) / npm | Fully Supported |
| **Linux Mint** | 20, 21, 22 | **Ubuntu Snap (`snap`)** / Debian (`.deb`) / npm | Fully Supported |
| **Pop!_OS** | 22.04 LTS+ | **Ubuntu Snap (`snap`)** / Debian (`.deb`) / npm | Fully Supported |
| **Fedora** | 38, 39, 40+ | **Ubuntu Snap (`snap`)** / npm | Fully Supported |
| **Arch Linux / Manjaro** | Rolling | **Ubuntu Snap (`snap`)** / npm | Fully Supported |

---

## 1. Installing on Linux via npm (GitHub Packages)

Brave Music is published to GitHub Packages as [**`@codemolabs/brave-music`**](https://github.com/orgs/codemolabs/packages/npm/package/brave-music).

> [!NOTE]
> The npm package is currently scoped for Linux distributions (`x86_64` / `arm64`).

### Step 1: Configure npm Registry
Configure npm to route the `@codemolabs` scope to GitHub Packages:
```bash
npm config set @codemolabs:registry https://npm.pkg.github.com
```

### Step 2: Authenticate with GitHub Packages
GitHub Packages requires an authenticated token for package requests. You will need a GitHub Personal Access Token (classic) with `read:packages` scope:

**Method A: npm config set (Recommended)**
```bash
npm config set //npm.pkg.github.com/:_authToken YOUR_GITHUB_PAT
```

**Method B: Interactive npm login**
```bash
npm login --registry=https://npm.pkg.github.com --scope=@codemolabs
# Username: <your-github-username>
# Password: <your-personal-access-token-with-read:packages>
```

**Method C: User .npmrc file**
Append the following line to `~/.npmrc`:
```bash
echo "//npm.pkg.github.com/:_authToken=YOUR_GITHUB_PAT" >> ~/.npmrc
```

### Step 3: Install Globally or Run via npx
Install globally:
```bash
npm install -g @codemolabs/brave-music
brave-music
```

Or run directly with npx without installing globally:
```bash
npx @codemolabs/brave-music
```

---

## 2. Installing on Linux via Debian Package (`.deb`)

The official standalone Debian package installs Brave Music with all system menu entries, desktop shortcuts, native C++ audio shared libraries, and executable symlinks.

### Step 1: Download or Build the Package
Download the latest verified package directly from GitHub Releases:
```bash
wget https://github.com/codemolabs/Brave-Music/releases/latest/download/brave-music_1.0.19-r_amd64.deb
```

Direct binary download: [**brave-music_1.0.19-r_amd64.deb**](https://github.com/codemolabs/Brave-Music/releases/latest/download/brave-music_1.0.19-r_amd64.deb)

Or build it locally from source:
```bash
npm run build:deb
```

### Step 2: Verify Package Integrity (SHA-256)
Before installing, verify that the package hash matches the official release record:
```bash
sha256sum brave-music_1.0.19-r_amd64.deb
```

### Step 3: Install Package via APT
Use `apt install` so that any missing distribution dependencies are automatically resolved:
```bash
sudo apt install ./brave-music_1.0.19-r_amd64.deb
```

### Step 4: Launch Brave Music
- **From Application Menu**: Search for **Brave Music** in your desktop launcher (GNOME, KDE Plasma, XFCE, Cinnamon).
- **From Terminal**:
  ```bash
  brave-music
  ```

---

## 2B. Installing on Linux via Ubuntu Snap (`.snap`)

Brave Music provides an official Snapcraft configuration (`snap/snapcraft.yaml`) and standalone `.snap` package for Ubuntu and all `snapd`-enabled Linux distributions.

### Step 1: Download or Build the Snap Package
Download the latest `.snap` package from GitHub Releases:
```bash
wget https://github.com/codemolabs/Brave-Music/releases/latest/download/brave-music_1.0.19-r_amd64.snap
```
Or build it locally from source:
```bash
npm run build:snap
```

### Step 2: Install the Snap Package
Install the standalone `.snap` archive:
```bash
sudo snap install --dangerous ./brave-music_1.0.19-r_amd64.snap
```
Once published on the Ubuntu Snap Store, install directly via:
```bash
sudo snap install brave-music
```

### Step 3: Launch Brave Music (Snap)
```bash
snap run brave-music
# or simply:
brave-music
```

### Publishing to Ubuntu Snap Store (Maintainers)
Following the [Official Snapcraft Publishing Guide](https://ubuntu.com/docs/snapcraft/latest/how-to/publishing/authenticate-and-upload-a-snap/):
```bash
# 1. Authenticate with your Ubuntu One developer account
snapcraft login

# 2. Register the snap name (one-time)
snapcraft register brave-music

# 3.Upload and release to the stable channel
snapcraft upload --release=stable Install/Linux/brave-music_1.0.19-r_amd64.snap
```

---

## 3. Directory Layout and File System Placement

When installed via package, Brave Music adheres to Linux Filesystem Hierarchy Standards (FHS):

| Target Path | Function |
| :--- | :--- |
| `/opt/brave-music/` | Application root, main process, backend services, and bundled binaries (`backend/bin/`) |
| `/opt/brave-music/backend/bin/` | Self-contained `yt-dlp` (`yt_dlp_ejs`), `node` JS runtime wrapper, `ffmpeg`, `ffprobe`, and shared audio libraries |
| `/opt/brave-music/run.sh` | Hardened startup script configuring library paths and runtime flags |
| `/usr/bin/brave-music` | System-wide execution symlink callable from any terminal (or `/snap/bin/brave-music` for Snap) |
| `/usr/share/applications/brave-music.desktop` | Desktop entry file registering audio categories and `StartupWMClass=brave-music` grouping |
| `/usr/share/pixmaps/brave-music.png` | System pixmap application icon |
| `/usr/share/icons/hicolor/<size>/apps/brave-music.png` | Multi-resolution bitmap icons (16x16 up to 512x512) |
| `/usr/share/icons/hicolor/scalable/apps/brave-music.svg` | Scalable vector application icon |
| `~/.config/brave-music/` | User application profile, `persist:bravemusic` browser memory, Widevine CDM, and session data |
| `~/.local/share/brave-music/` | Offline `library.json`, settings, and downloaded media collections (default `$HOME/Music` or Downloads dir) |

---

## 4. Running from Source (Developer Installation)

If you are developing or testing without system installation:

### Step 1: Install Node.js
Ensure Node.js v18+ or v20+ is active:
```bash
node -v
npm -v
```

### Step 2: Clone Repository
```bash
git clone git@github.com:codemolabs/Brave-Music.git
cd Brave-Music
```

### Step 3: Install Dependencies
```bash
npm install
```

### Step 4: Start Desktop Client
```bash
npm start
```
Or execute the local launcher:
```bash
./run.sh
```

---

## 5. Command-Line Options and Execution Flags

The `brave-music` launcher accepts Chromium and Electron runtime flags:

| Flag | Purpose | Usage Example |
| :--- | :--- | :--- |
| `--no-sandbox` | Disables Chromium sandbox (required in unprivileged Docker/LXC/WSL2) | `brave-music --no-sandbox` |
| `--in-process-gpu` | Runs GPU process in main process thread for low-end graphics cards | `brave-music --in-process-gpu` |
| `--disable-gpu` | Disables hardware acceleration if encountering visual tearing | `brave-music --disable-gpu` |

---

## 6. Updating Brave Music

If installed via the official Ubuntu Snap Store:
```bash
sudo snap refresh brave-music
```

If installed via Debian package (`.deb`):
```bash
sudo apt update
sudo apt install --only-upgrade ./brave-music_<new_version>_amd64.deb
```
Or if installed via npm:
```bash
npm update -g @codemolabs/brave-music
```

---

## 7. Uninstallation and System Cleanup

### Standard Removal
To remove the application via Snap:
```bash
sudo snap remove brave-music
```
To remove via APT while retaining your local offline music downloads and playlists:
```bash
sudo apt remove brave-music
```
Or if installed via npm:
```bash
npm uninstall -g @codemolabs/brave-music
```

### Complete Purge
To completely purge application files, configuration, and cache:
```bash
sudo apt purge brave-music
rm -rf ~/.config/brave-music
rm -rf ~/.config/musikcube
```

---

## 8. Troubleshooting Matrix

| Issue | Root Cause | Resolution |
| :--- | :--- | :--- |
| **Spotify displays "Enable Protected Content"** | Widevine CDM is uninitialized or missing | Run `node test-widevine-ready.js`. CastLabs Electron provisions Widevine automatically (or links `/opt/google/chrome/WidevineCdm` when present). |
| **Google blocks in-app login ("browser or app may not be secure")** | Google restricts embedded Chromium webview OAuth flows or Snap confinement blocks host browser cookie sync | Click the **Profile Sign-In button** (or **Use Built-In Secure Sign-In Window Directly**). Brave Music opens a hardened Sign-In Window with Firefox/Client Hints identity on `accounts.google.com` and automatically persists & refreshes `persist:bravemusic` tabs (or use **Emergency Fallback: Import Cookies (`.json`)**). |
| **Personalized Spotify Mix fails to extract tracks** | Private/personalized Mix (`Daily Mix`, `Blend`, `Daylist`) requires Spotify session auth | Sign in to Spotify via the Profile modal or Inside App Spotify tab so `sp_dc` session memory authenticates Spotify Pathfinder resolution. |
| **Offline download fails or stops cleanly** | Temporary CDN/YouTube client block or low disk space | Brave Music bundles self-contained `yt-dlp`, `node` EJS solver, and `ffmpeg` under `backend/bin/` (no system `yt-dlp` needed). Retry or update Brave Music (`sudo snap refresh brave-music`). |
| **No audio output from offline player** | Sound daemon sink muted or inactive | Verify sound server: `wpctl status` (PipeWire) or `pactl info` (PulseAudio). Ensure volume is above 0 in `alsamixer`. |
| **Application fails to open in container** | SUID sandbox restriction | Launch with `brave-music --no-sandbox`. |
