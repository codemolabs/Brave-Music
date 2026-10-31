# Developer Guide: Brave Music Architecture and Setup

This document provides technical instructions for setting up the local development environment, understanding the application architecture, and building production distribution packages.

---

## 1. System Requirements

Ensure your development environment meets the following specifications:

- **Operating System**: Linux (Ubuntu 22.04+, Debian 12+, Fedora 38+, Arch Linux)
- **Node.js**: v18.x or v20.x
- **Package Manager**: npm v9+
- **System Binaries**:
  - `yt-dlp` (required for offline media extraction)
  - `curl` (used for audio fetching and health checks)
  - `dpkg-deb` (required for Debian package builds)

Install system dependencies on Ubuntu/Debian:
```bash
sudo apt update
sudo apt install -y nodejs npm yt-dlp curl dpkg
```

---

## 2. Architecture Overview

Brave Music operates across three synchronized architectural layers:

```
[ Electron Main Process (main.js) ]
         │ (IPC Bridge via preload.js)
         ▼
[ HTML5 / CSS / Webview Frontend (src/) ]
         │ (HTTP / WebSocket)
         ▼
[ Node.js Backend Services (backend/) ]
         │ (Daemon Control & Stream Proxy)
         ▼
[ Embedded C++ Audio Engine (backend/engine/musikcube) ]
```

### 1. Electron Main Process (`main.js`)
- Boots CastLabs Electron runtime with verified Widevine CDM support.
- Configures Chrome User-Agent masquerading and removes `AutomationControlled` flags to prevent bot detection.
- Manages authenticated webviews (`persist:bravemusic` partition) for YouTube Music and Spotify.
- Controls window lifecycle, system tray hooks, and external browser authentication modals.

### 2. Preload and IPC Bridge (`preload.js`)
- Uses `contextBridge.exposeInMainWorld('electronAPI', ...)` to expose strictly typed, safe methods to the frontend renderer.
- Prevents renderer script access to Node.js internals (`contextIsolation: true`, `nodeIntegration: false`).

### 3. Backend Services (`backend/`)
- **ShieldsController & AdBlockService**: Evaluates network URLs against declarative Brave Shields ad and tracker lists.
- **YTMDevtoolsAuthService & AuthSyncService**: Manages session cookies and headers for music services.
- **DownloadService**: Coordinates `yt-dlp` background processes to fetch audio tracks at 320kbps into local storage.
- **MusikcubeService & StreamServer**: Manages `musikcubed` lifecycle and local HTTP audio streams.

### 4. Native Engine (`backend/engine/musikcube/`)
- Contains precompiled shared objects (`libmusikcore.so`, `libtag.so.2`, `libavcodec-musikcube.so.62`) and daemon binary `musikcubed`.
- Provides lightweight local indexing, tag extraction, and audio output via ALSA, PulseAudio, or PipeWire.

---

## 3. Local Installation and Setup

### Clone Repository
```bash
git clone git@github.com:codemoteams/Brave-Music.git
cd Brave-Music
```

### Install NPM Dependencies
The project uses CastLabs Electron releases for Widevine DRM capabilities:
```bash
npm install
```

### Run Application in Development Mode
```bash
npm start
```
Alternatively, execute the launch script directly:
```bash
./run.sh
```

---

## 4. CastLabs Widevine Verification

To verify that CastLabs Electron is correctly configured and detects the Widevine CDM runtime on your machine:

```bash
node test-widevine-ready.js
```
Expected output:
```
App ready, waiting for widevine-ready or widevine-error...
>>> CastLabs Widevine is ready! Version: 4.10.2830.0
```

To test EME audio playback support:
```bash
node test-castlabs-eme.js
```

---

## 5. Building the Debian Package

The build pipeline bundles the application into a standalone Debian `.deb` package installed into `/opt/brave-music`:

```bash
npm run build:deb
```
Or run the script:
```bash
./build-deb.sh
```

The script outputs `brave-music_1.0.0_amd64.deb` at the project root. Install and test the package with:
```bash
sudo apt install ./brave-music_1.0.0_amd64.deb
```

---

## 6. Common Troubleshooting

### Issue: Spotify Web player reports "Protected Content Not Enabled"
- **Cause**: Missing or uninitialized Widevine CDM.
- **Solution**: Ensure CastLabs Electron is installed from the repository package.json dependencies. Run `node test-widevine-ready.js` to trigger automatic CDM provisioning into your user data directory.

### Issue: Offline download fails
- **Cause**: Outdated `yt-dlp` binary.
- **Solution**: Update `yt-dlp` to the latest release using `sudo yt-dlp -U` or install the latest binary from GitHub releases.

### Issue: No audio output from local engine
- **Cause**: Audio daemon lacks active output sink.
- **Solution**: Verify PipeWire or PulseAudio is running:
  ```bash
  systemctl --user status pipewire pulse
  ```
