# Brave Music

> **Brave Music OTT Platform** — Ad-free YouTube Music and Spotify streaming with a built-in offline music engine and Brave Shields ad-blocking.

---

## Overview

Brave Music is a desktop music client built with Electron and CastLabs Chromium/Widevine CDM. It integrates web music streaming services with local, high-fidelity playback powered by an embedded [Musikcube](https://musikcube.com/) audio engine.

### Key Features

- **Ad-Free Streaming**: Seamless YouTube Music and Spotify Web playback protected with Brave Shields network blocking and COSMETIC CSS filtering.
- **Native Widevine DRM Support**: Powered by CastLabs Electron releases to enable protected Spotify and YouTube Music EME audio playback.
- **Offline High-Bitrate Engine**: Download tracks locally via `yt-dlp` directly into your local library.
- **Embedded C++ Audio Engine**: Local playback and indexing handled by an embedded Musikcube daemon (`musikcubed`) streaming audio locally via HTTP.
- **System Browser Authentication**: Avoids embedded login blocks by triggering system browser OAuth workflows.
- **Debian Packaging**: Ready-to-install Debian package build script (`build-deb.sh`) for Ubuntu/Debian Linux distributions.

---

## Architecture

```
brave-music/
├── backend/
│   ├── config/          # Application configurations
│   ├── controllers/     # API and service controllers (Auth, Media, Library, Shields, Download)
│   ├── engine/          # Embedded Musikcube daemon and shared libraries
│   ├── services/        # Service layer (Brave Shields, YTM Devtools Auth, Stream Server, etc.)
│   └── index.js         # Backend server entry point
├── src/
│   ├── assets/          # Application icons, logos, and fonts
│   ├── js/              # Frontend UI controller and webview shields script
│   ├── styles/          # Responsive UI stylesheets
│   └── index.html       # Main application window
├── build-deb.sh         # Debian package (.deb) builder
├── main.js              # Electron main process
├── preload.js           # Electron preload script with secure IPC bridge
├── run.sh               # Desktop launcher script
└── package.json         # Project manifests and dependencies
```

---

## Getting Started

### Prerequisites

- **Node.js**: `v18+` or `v20+` recommended
- **Linux Packages**: `yt-dlp`, `curl`

```bash
sudo apt update
sudo apt install yt-dlp curl
```

### Installation

1. Clone the repository:
   ```bash
   git clone git@github.com:codemoteams/Brave-Music.git
   cd Brave-Music
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Running Locally

To launch the desktop application:
```bash
npm start
```
Or run directly:
```bash
./run.sh
```

---

## Building Debian (.deb) Package

To generate a standalone Debian package:
```bash
npm run build:deb
```
The output `.deb` package will be generated at `./brave-music_1.0.0_amd64.deb`.

Install on Ubuntu/Debian:
```bash
sudo apt install ./brave-music_1.0.0_amd64.deb
```

---

## License

This project is licensed under the [MIT License](LICENSE) - see the [LICENSE](LICENSE) file for details.