# Installing Brave Music on Linux

This guide provides official instructions for installing, configuring, verifying, and updating Brave Music on supported Linux distributions.

---

## Supported Linux Distributions

Brave Music is tested and officially supported on 64-bit (`x86_64` / `amd64`) Linux distributions:

| Distribution | Minimum Version | Installation Package | Status |
| :--- | :--- | :--- | :--- |
| **Ubuntu** | 20.04 LTS, 22.04 LTS, 24.04 LTS | Debian Package (`.deb`) | Fully Supported |
| **Debian** | 11 (Bullseye), 12 (Bookworm) | Debian Package (`.deb`) | Fully Supported |
| **Linux Mint** | 20, 21, 22 | Debian Package (`.deb`) | Fully Supported |
| **Pop!_OS** | 22.04 LTS+ | Debian Package (`.deb`) | Fully Supported |
| **Fedora** | 38, 39, 40 | Source Build / Standalone | Supported via Source |
| **Arch Linux / Manjaro** | Rolling | Source Build / Standalone | Supported via Source |

---

## 1. System Dependencies and Prerequisites

Brave Music requires standard media extraction and sound playback utilities:

### Ubuntu / Debian / Linux Mint / Pop!_OS
```bash
sudo apt update
sudo apt install -y curl yt-dlp libnotify-bin
```

### Fedora / RHEL
```bash
sudo dnf install -y curl yt-dlp libnotify
```

### Arch Linux / Manjaro
```bash
sudo pacman -S --needed curl yt-dlp libnotify
```

---

## 2. Installing via Debian Package (`.deb`)

The official standalone Debian package installs Brave Music with all system menu entries, desktop shortcuts, native C++ audio shared libraries, and executable symlinks.

### Step 1: Download or Build the Package
Download the latest verified package directly from GitHub Releases:
```bash
wget https://github.com/codemoteams/Brave-Music/releases/download/v1.0.3/brave-music_1.0.3_amd64.deb
```

Direct binary download: [**brave-music_1.0.3_amd64.deb (120 MB)**](https://github.com/codemoteams/Brave-Music/releases/download/v1.0.3/brave-music_1.0.3_amd64.deb)

Or build it locally from source:
```bash
npm run build:deb
```

### Step 2: Verify Package Integrity (SHA-256)
Before installing, verify that the package hash matches the official release record:
```bash
sha256sum brave-music_1.0.3_amd64.deb
```
Expected output:
```text
fa4e43f52e8432946f52e25b72efe884bcda07aad330f26930318ecb56f191ae  brave-music_1.0.3_amd64.deb
```

### Step 3: Install Package via APT
Use `apt install` so that any missing distribution dependencies are automatically resolved:
```bash
sudo apt install ./brave-music_1.0.3_amd64.deb
```

### Step 4: Launch Brave Music
- **From Application Menu**: Search for **Brave Music** in your desktop launcher (GNOME, KDE Plasma, XFCE, Cinnamon).
- **From Terminal**:
  ```bash
  brave-music
  ```

---

## 3. Directory Layout and File System Placement

When installed via package, Brave Music adheres to Linux Filesystem Hierarchy Standards (FHS):

| Target Path | Function |
| :--- | :--- |
| `/opt/brave-music/` | Application root, main process, backend services, and embedded Musikcube binaries |
| `/opt/brave-music/run.sh` | Hardened startup script configuring library paths and runtime flags |
| `/usr/bin/brave-music` | System-wide execution symlink callable from any terminal |
| `/usr/share/applications/brave-music.desktop` | Desktop entry file registering audio categories and system integration |
| `/usr/share/icons/hicolor/scalable/apps/brave-music.svg` | Vector application icon |
| `~/.config/brave-music/` | User application profile, persistent login cookies, and cache partition |
| `~/.config/musikcube/` | Embedded C++ audio daemon database and library index files |

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
git clone git@github.com:codemoteams/Brave-Music.git
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

To update to a new release when a new package is published:
```bash
sudo apt update
sudo apt install --only-upgrade ./brave-music_<new_version>_amd64.deb
```

---

## 7. Uninstallation and System Cleanup

### Standard Removal
To remove the application while retaining your local offline music downloads and playlists:
```bash
sudo apt remove brave-music
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
| **Spotify displays "Enable Protected Content"** | Widevine CDM is uninitialized or missing | Run `node test-widevine-ready.js`. If Google Chrome is installed, CastLabs automatically borrows CDM from `/opt/google/chrome/WidevineCdm`. |
| **Offline download button does not start** | Missing `yt-dlp` or out-of-date binary | Run `sudo apt install yt-dlp` or update with `sudo yt-dlp -U`. |
| **No audio output from offline player** | Sound daemon sink muted or inactive | Verify sound server: `wpctl status` (PipeWire) or `pactl info` (PulseAudio). Ensure volume is above 0 in `alsamixer`. |
| **Application fails to open in container** | SUID sandbox restriction | Launch with `brave-music --no-sandbox`. |
