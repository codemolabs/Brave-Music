<div align="center">

<img src="src/assets/app-icon.svg" alt="Brave Music Icon" width="100" height="100" />

# Brave Music
**Your Music. Your Privacy. Your Control.**
An open-source desktop music streaming and offline audio engine combining YouTube Music, Spotify Web, and local playback into a unified, privacy-focused experience.

<p align="center">
  <a href="docs/INSTALL.md"><img src="src/assets/buttons/install-app.svg" alt="Install" height="40"/></a>
</p>

<table align="center">
  <tr>
    <td align="center" width="130">
      <img src="https://api.iconify.design/logos/linux-tux.svg" width="36" height="36" alt="Linux" /><br/>
      <b>Linux</b>
    </td>
    <td align="center" width="130">
      <img src="https://api.iconify.design/simple-icons/windows11.svg?color=%230078D4" width="36" height="36" alt="Windows" /><br/>
      <b>Windows</b>
    </td>
    <td align="center" width="130">
      <img src="https://api.iconify.design/simple-icons/android.svg?color=%233DDC84" width="36" height="36" alt="Android" /><br/>
      <b>Android</b>
    </td>
  </tr>
</table>

</div>

## Overview

Brave Music brings together streaming services, DRM-protected playback, and a native C++ audio engine in a single, lightweight desktop client built for performance and privacy.

- **Unified Streaming**: Seamless YouTube Music and Spotify Web playback in one interface.
- **Embedded C++ Audio Engine**: Local playback powered by an integrated Musikcube daemon supporting high-fidelity formats.
- **Offline Media Extraction**: Built-in download manager leveraging `yt-dlp` for local music collections.
- **Native Brave Shields**: Blocks third-party trackers, telemetry, and intrusive web audio advertisements.
- **Zero Telemetry**: Completely self-contained and on-device. No telemetry, no activity tracking, and no required accounts.

## Application Showcase

<div align="center">

<img src="testimonials/yt-music.png" alt="YouTube Music Streaming Interface" width="90%"/>
<p><sub>Integrated music discovery and streaming via YouTube Music</sub></p>

<img src="testimonials/spotify.png" alt="Spotify Web Player Interface" width="90%"/>
<p><sub>DRM-compatible Spotify Web playback via CastLabs Widevine CDM</sub></p>

<img src="testimonials/downloads.png" alt="Offline Music Downloads and Local Library" width="90%"/>
<p><sub>Native C++ offline music management and download engine</sub></p>

<img src="testimonials/Ads-Blocker.gif" alt="Brave Shields Ad Protection" width="280"/>
<p><sub>Automated Brave Shields blocking tracking scripts and web advertisements</sub></p>

</div>

## Quick Installation

For full installation guides, source builds, and verification checksums, see **[docs/INSTALL.md](docs/INSTALL.md)**.

### Linux (npm / npx)

```bash
# 1. Route @codemolabs scope to GitHub Packages
npm config set @codemolabs:registry https://npm.pkg.github.com

# 2. Authenticate with GitHub Packages token (read:packages scope)
npm config set //npm.pkg.github.com/:_authToken YOUR_GITHUB_PAT

# 3. Launch directly with npx or install globally
npx @codemolabs/brave-music
# or: npm install -g @codemolabs/brave-music
```

### Linux (Debian Package)

```bash
wget https://github.com/codemolabs/Brave-Music/releases/download/v1.0.18/brave-music_1.0.18_amd64.deb
sudo apt install ./brave-music_1.0.18_amd64.deb
brave-music
```

### Windows (Setup Suite)

Download and run the self-contained installer:
- **Setup Installer (`.exe`)**: [**BraveMusic-Setup-1.0.18.exe**](https://github.com/codemolabs/Brave-Music/releases/download/v1.0.18/BraveMusic-Setup-1.0.18.exe) (139 MB)
- **Portable Suite (`.zip`)**: [**brave-music_1.0.18_win64.zip**](https://github.com/codemolabs/Brave-Music/releases/download/v1.0.18/brave-music_1.0.18_win64.zip) (194 MB)

## Technical Architecture

| Layer | Component | Implementation |
| :--- | :--- | :--- |
| **Runtime** | CastLabs Chromium Electron | Widevine CDM hardware-decoded streaming |
| **Audio Daemon** | Musikcube (C++) | Standalone background engine for low-latency offline playback |
| **Downloader** | yt-dlp Engine | Local media extraction with automatic metadata tagging |
| **Privacy** | Brave Shields Engine | Network request filtering and tracker suppression |
| **System Integration** | Linux MPRIS2 / Windows WinUI 3 | Native system media controls and taskbar progress synchronization |

## Documentation

| Document | Purpose |
| :--- | :--- |
| [**docs/INSTALL.md**](docs/INSTALL.md) | Complete installation instructions across Linux, Windows, and npm |
| [**docs/DEV-GUIDE.md**](docs/DEV-GUIDE.md) | Local development setup, component architecture, and build pipeline |
| [**docs/DESIGN-GUIDE.md**](docs/DESIGN-GUIDE.md) | UI tokens, dark themes, and Microsoft UI XAML Fluent Design specs |
| [**docs/CONTRIBUTION.md**](docs/CONTRIBUTION.md) | Pull request guidelines, branch conventions, and testing standards |
| [**docs/RELEASE.md**](docs/RELEASE.md) | Version changelogs, binary SHA-256 hashes, and roadmap |
| [**docs/SECURITY.md**](docs/SECURITY.md) | Security policy and coordinated vulnerability reporting |
| [**docs/RULES.md**](docs/RULES.md) | Project governance and intellectual property terms |
| [**docs/CREDITS.md**](docs/CREDITS.md) | Upstream acknowledgments and open-source licenses |

## Community & Governance

<div align="center">

<img src="src/assets/cosl-logo.png" alt="Codemo Open Source Labs Logo" width="200"/>

<p>
  <a href="https://discord.gg/wD9d5Er7a"><img src="https://raw.githubusercontent.com/codemolabs/.github/main/media/icons/discord.svg?v=cosl-purple" width="22" height="22" align="absmiddle" alt="Discord" /></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://github.com/codemolabs"><img src="https://raw.githubusercontent.com/codemolabs/.github/main/media/icons/github.svg?v=cosl-purple" width="22" height="22" align="absmiddle" alt="GitHub" /></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://cosl.codemoteams.org"><img src="https://raw.githubusercontent.com/codemolabs/.github/main/media/icons/website.svg?v=cosl-purple" width="22" height="22" align="absmiddle" alt="COSL Website" /></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="mailto:cosl@codemoteams.org"><img src="https://raw.githubusercontent.com/codemolabs/.github/main/media/icons/mail.svg?v=cosl-purple" width="22" height="22" align="absmiddle" alt="Email" /></a>
</p>

</div>

<br>

Brave Music is an official open-source product repository governed by **[Codemo Open Source Labs (COSL)](https://github.com/codemolabs)** within the **[Codemo Teams](https://codemoteams.org)** ecosystem.

- **Organization**: [Codemo Open Source Labs (@codemolabs)](https://github.com/codemolabs)
- **Discord Community**: [Join Discord](https://discord.gg/wD9d5Er7a)
- **Contact / Inquiries**: `cosl@codemoteams.org`
- **License**: [GNU General Public License v3.0 (GPL-3.0)](LICENSE)
