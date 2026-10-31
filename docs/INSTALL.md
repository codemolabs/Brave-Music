# Installation and Setup Guide: Brave Music

This guide covers all installation methods for Brave Music on Linux systems, including binary package installation, building from source, and distribution package generation.

---

## 1. System Requirements and Dependencies

Before installing, ensure your host system satisfies these prerequisites:

- **Operating System**: Linux 64-bit (`x86_64` / `amd64`)
  - Tested on: Ubuntu 22.04 LTS / 24.04 LTS, Debian 12 (Bookworm), Linux Mint 21+, Pop!_OS 22.04+, Fedora 39+, Arch Linux
- **Audio Output**: Active PipeWire, PulseAudio, or ALSA daemon
- **Hardware Acceleration**: OpenGL 2.0+ compatible GPU or software rendering fallback

### Required System Binaries
Install `yt-dlp` (for high-bitrate offline audio extraction) and `curl`:

**Ubuntu / Debian / Linux Mint / Pop!_OS**:
```bash
sudo apt update
sudo apt install -y curl yt-dlp
```

**Fedora / RHEL**:
```bash
sudo dnf install -y curl yt-dlp
```

**Arch Linux / Manjaro**:
```bash
sudo pacman -S curl yt-dlp
```

---

## 2. Method A: Installing the Debian Package (Recommended)

The easiest method for Ubuntu, Debian, and Debian-based distributions is using the pre-built `.deb` package.

### Step 1: Obtain the Package
If you cloned the repository or have the built package locally:
```bash
# Verify the deb package exists
ls -lh brave-music_1.0.0_amd64.deb
```
Or build a fresh package locally:
```bash
npm run build:deb
```

### Step 2: Install via APT
Using `apt` automatically resolves any missing runtime dependencies:
```bash
sudo apt install ./brave-music_1.0.0_amd64.deb
```

### Step 3: Launch Brave Music
You can launch Brave Music in two ways:
- **Desktop Application Launcher**: Open your application menu and search for **Brave Music**.
- **Terminal Command**:
  ```bash
  brave-music
  ```

### What Gets Installed
The Debian package installs the following system paths:
- `/opt/brave-music/`: Complete application bundle, backend services, and embedded Musikcube engine.
- `/usr/bin/brave-music`: System execution symlink script.
- `/usr/share/applications/brave-music.desktop`: Desktop menu entry with category and metadata.
- `/usr/share/icons/hicolor/scalable/apps/brave-music.svg`: High-resolution application icon.

---

## 3. Method B: Running from Source (Developer Installation)

If you prefer to run the application directly from source without installing it system-wide:

### Step 1: Install Node.js
Ensure Node.js v18 or v20 is installed on your machine:
```bash
node -v # Should report v18.x or v20.x
npm -v
```

### Step 2: Clone the Repository
```bash
git clone git@github.com:codemoteams/Brave-Music.git
cd Brave-Music
```

### Step 3: Install NPM Dependencies
This installs CastLabs Electron with verified Widevine CDM support:
```bash
npm install
```

### Step 4: Run the Application
Start the desktop application in development mode:
```bash
npm start
```
Or run the launcher script directly:
```bash
./run.sh
```

---

## 4. Building the Standalone Debian Package

If you modify source code and want to package a new release:

```bash
npm run build:deb
```
The packaging script (`build-deb.sh`) handles:
1. Creating Debian control metadata (`DEBIAN/control`).
2. Packaging application files into `/opt/brave-music`.
3. Provisioning Widevine CDM binaries if available on the host.
4. Setting executable permissions on the native `musikcubed` daemon.
5. Invoking `dpkg-deb --build` to output `brave-music_1.0.0_amd64.deb`.

---

## 5. Uninstallation

To remove Brave Music from your system:

```bash
sudo apt remove brave-music
```

To purge application configuration and cached offline tracks:
```bash
sudo apt purge brave-music
rm -rf ~/.config/brave-music
rm -rf ~/.config/musikcube
```

---

## 6. Troubleshooting Installation Issues

### 1. Missing Widevine CDM / Protected Content Error
If Spotify indicates that protected content cannot be played:
- Verify that CastLabs Electron is installed:
  ```bash
  node test-widevine-ready.js
  ```
- If you have Google Chrome installed, CastLabs can borrow the host Widevine CDM from `/opt/google/chrome/WidevineCdm`.

### 2. Sandbox Permission Errors on Linux
If you are running in an unprivileged container, LXC, or WSL2 environment:
```bash
./run.sh --no-sandbox
```

### 3. Audio Playback Muted or Stalled
- Check whether your sound server is active:
  ```bash
  pactl info || wpctl status
  ```
- Make sure ALSA or PulseAudio sink is unmuted in `alsamixer` or system sound settings.
