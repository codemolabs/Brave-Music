<div align="center">

  <table border="0" style="border-collapse: collapse; border: none;" align="center">
    <tr style="border: none;">
      <td align="center" style="border: none;">
        <img src="src/assets/app-icon.svg" alt="Brave Music Icon" width="108" height="108" style="border-radius: 24px;" />
      </td>
    </tr>
  </table>

  # Brave Music
  
  <p style="font-size: 15px; line-height: 1.6; color: #a0a5b5; max-width: 820px; margin: 12px auto 20px auto;">
    A high-performance open-source music streaming platform combining ad-free YouTube Music and Spotify Web with an embedded C++ offline playback engine. Engineered for privacy, native Widevine DRM playback, and offline listening, Brave Music brings together the largest digital audio streaming libraries into a single unified desktop client free from commercial trackers, data harvesting, and intrusive interruptions. By pairing CastLabs Chromium media decryption with an embedded native Musikcube audio daemon, listeners enjoy instant lossless track indexing, automatic high-bitrate offline caching, and complete control over their local music collections.
  </p>

  <!-- Original Platform Logos -->
  <p align="center" style="margin-top: 14px; margin-bottom: 18px;">
    <a href="#install-portal" title="Linux Desktop Available">
      <img src="src/assets/icons/linux.svg" alt="Linux" width="30" height="30" />
    </a>
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
    <a href="#install-portal" title="Microsoft Windows Coming Soon">
      <img src="src/assets/icons/microsoft.svg" alt="Microsoft" width="26" height="26" />
    </a>
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
    <a href="#install-portal" title="Android Target Milestone">
      <img src="src/assets/icons/android.svg" alt="Android" width="30" height="30" />
    </a>
  </p>

  <!-- Metrics Bar -->
  <table align="center" style="margin-top: 12px; margin-bottom: 20px;">
    <tr>
      <td align="center" width="140">
        <strong>119 MB</strong><br />
        <span style="font-size: 11px; color: #7f8699;">Debian Package</span>
      </td>
      <td align="center" width="140">
        <strong>Zero Trackers</strong><br />
        <span style="font-size: 11px; color: #7f8699;">Brave Shields</span>
      </td>
      <td align="center" width="140">
        <strong>C++ Engine</strong><br />
        <span style="font-size: 11px; color: #7f8699;">Embedded Musikcube</span>
      </td>
      <td align="center" width="140">
        <strong>MIT License</strong><br />
        <span style="font-size: 11px; color: #7f8699;">Codemo OSL</span>
      </td>
    </tr>
  </table>

  <!-- Portal Action Links -->
  <p align="center">
    <a href="#install-portal"><strong>[ Install App (Linux .deb) ]</strong></a>
    &nbsp;&nbsp;&nbsp;&nbsp;
    <a href="#developer-portal"><strong>[ Developer Portal ]</strong></a>
    &nbsp;&nbsp;&nbsp;&nbsp;
    <a href="docs/RELEASE.md"><strong>[ Release Notes ]</strong></a>
    &nbsp;&nbsp;&nbsp;&nbsp;
    <a href="docs/CONTRIBUTION.md"><strong>[ Contribute ]</strong></a>
  </p>

</div>

---

## App Screenshots and Interface

<table width="100%">
  <tr>
    <th width="33%" align="center">YouTube Music Streaming</th>
    <th width="33%" align="center">Spotify Web Player</th>
    <th width="33%" align="center">Offline Downloads and Engine</th>
  </tr>
  <tr>
    <td>
      <a href="testimonials/yt-music.png">
        <img src="testimonials/yt-music.png" alt="YouTube Music Tab" width="100%" />
      </a>
    </td>
    <td>
      <a href="testimonials/spotify.png">
        <img src="testimonials/spotify.png" alt="Spotify Tab" width="100%" />
      </a>
    </td>
    <td>
      <a href="testimonials/downloads.png">
        <img src="testimonials/downloads.png" alt="Offline Downloads Tab" width="100%" />
      </a>
    </td>
  </tr>
  <tr>
    <td align="center"><small>Ad-free streaming with persistent session caching</small></td>
    <td align="center"><small>Widevine DRM-enabled Web Playback API</small></td>
    <td align="center"><small>Embedded 320kbps offline downloader via yt-dlp</small></td>
  </tr>
</table>

---

## Install Portal

### Standalone Debian Package (Linux x64)

Download and install the verified Debian package on Ubuntu, Debian, Linux Mint, or Pop!_OS:

```bash
# 1. Install package via APT
sudo apt install ./brave-music_1.0.0_amd64.deb

# 2. Launch from desktop application menu or terminal
brave-music
```

For complete installation steps, building from source, dependency management, and uninstallation, see [**docs/INSTALL.md**](docs/INSTALL.md).

### Supported Operating Systems Matrix

| Platform | Availability Status | Distribution Type | Details |
| :--- | :--- | :--- | :--- |
| **Linux (x64)** | **Available Now (v1.0.0)** | Debian Package (`.deb`) and Source Run | Full hardware acceleration, Widevine DRM, embedded audio daemon |
| **Android** | **Next Roadmap Milestone** | Native Android APK | Mobile port planned with background audio service and touch navigation |
| **Windows** | Coming Soon | Portable EXE and MSI Installer | Port in progress using Windows CastLabs runtime |
| **macOS** | Coming Soon | DMG Package | Universal binary for Apple Silicon and Intel |

---

## Developer Portal

Brave Music is an open-source collaboration maintained under Codemo Open Source Labs. Review the modular guides in the `docs/` directory before building or submitting code:

| Documentation | Primary Scope | Read When You Need To |
| :--- | :--- | :--- |
| [**docs/INSTALL.md**](docs/INSTALL.md) | Installation and Setup Guide | Install via deb package, compile from source, and configure system dependencies |
| [**docs/RELEASE.md**](docs/RELEASE.md) | Release Notes and Changelogs | Track version tags, changelog history, SHA-256 checksums, and roadmap |
| [**docs/RULES.md**](docs/RULES.md) | Legal Ownership and Governance | Understand Codemo OSL product ownership, legal rights, and developer rules |
| [**docs/CONTRIBUTION.md**](docs/CONTRIBUTION.md) | Contributor Workflow and Android Milestone | Learn the PR submission process, Android development goals, and Discord perks |
| [**docs/DEV-GUIDE.md**](docs/DEV-GUIDE.md) | Architecture Specs and Developer Guide | Complete project architecture, Mermaid diagrams, DRM checks, and build pipeline |
| [**docs/DESIGN-GUIDE.md**](docs/DESIGN-GUIDE.md) | UI/UX Specs and Design Tokens | Follow the dark color palette, Ananda Black typography, and mobile touch targets |
| [**docs/CREDITS.md**](docs/CREDITS.md) | Upstream Technologies and Authors | View acknowledgments for CastLabs, Musikcube, Brave, yt-dlp, and community devs |
| [**docs/SECURITY.md**](docs/SECURITY.md) | Security Policy and Disclosure | Report vulnerabilities responsibly and inspect IPC sandbox isolation boundaries |

---

### Brave Shields Protection in Action

<div align="center" style="margin-top: 14px; margin-bottom: 24px;">
  <img src="testimonials/Ads-Blocker.gif" alt="Brave Shields Protection Active" width="220" style="border-radius: 8px;" />
</div>

---

## Developer Motivation: The COSL Vision

For developers building across the Codemo OSL ecosystem, we follow a unified standard of creative engineering, educational growth, and open-source excellence:

```jsx
import TextLoop from './src/components/TextLoop';

<TextLoop
  text="CODEMO OSL ✦ UNITE SOLUTIONS ✦ CREATIVITY AND EDUCATION ✦ PRO DEVELOPER ECOSYSTEM ✦ OPEN SOURCE FREEDOM"
  shape="wave"
  speed={90}
  direction="forward"
  separator="✦"
  curviness={90}
  tilt={0}
  fontSize={46}
  fontWeight={800}
  letterSpacing={2}
  uppercase
  ribbon
  ribbonColor="#4E2E8D"
  ribbonWidth={86}
  edgeFade={0}
  cross={false}
  crossAngle={16}
  draggable={false}
  scrollBoost={0}
  outline={false}
  pauseOnHover
/>
```

---

## Organization and Governance

<div align="center">
  <img src="src/assets/cosl-logo.png" alt="Codemo Open Source Labs Logo" width="220" />
  <h3>Codemo Open Source Labs (Codemo OSL)</h3>
</div>

**Mission and Purpose**:
Codemo Open Source Labs builds united solutions, creativity, and technical education on a single platform. COSL helps developers learn Open Source software engineering and advance to PRO Developer capabilities by following official guides and contributing directly to official community projects.

### Community Channels and Contributor Perks
- **Official Platform**: Visit [codemoteams.org](https://codemoteams.org) to register your developer account.
- **Discord Community**: Join the **Codemo Teams Discord Server** to participate in architectural discussions, track milestones, and receive active contributor benefits.
- **Perk Eligibility**: To qualify for official contributor perks, rewards, and recognitions, developers must hold an active account on `codemoteams.org` and maintain regular participation in the Codemo Teams Discord.

---

## Legal Authority and Ownership Notice

- **App Version**: `v1.0.0`
- **Product Authority**: Brave Music is an official open-source product created and governed by **Codemo Open Source Labs**.
- **Intellectual Property**: Codemo OSL retains exclusive organizational ownership, trademark rights, and distribution governance over the Brave Music product name, official releases, and affiliated packages.
- **License**: The codebase is distributed under the terms of the [MIT License](LICENSE). Refer to [docs/RULES.md](docs/RULES.md) for complete organizational policies and contributor agreements.