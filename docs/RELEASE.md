# Release Notes and Version History: Brave Music

This document tracks official version releases, changelogs, binary checksums, and update schedules for Brave Music under Codemo Open Source Labs (Codemo OSL).

---

## Release Channels

Brave Music maintains two release tracks:

| Channel | Cadence | Stability | Target Audience |
| :--- | :--- | :--- | :--- |
| **Stable Channel** | Monthly / Milestone-driven | High (Tested production packages) | Everyday listeners and general users |
| **Nightly / Development** | Continuous (via `main` branch) | Experimental | Developers, contributors, and testers |

---

## Release Versioning Specification

All official releases follow [Semantic Versioning 2.0.0](https://semver.org/):
- **MAJOR (`x.0.0`)**: Incompatible API shifts, breaking UI redesigns, or new platform milestones (e.g., Android release).
- **MINOR (`1.x.0`)**: Backwards-compatible feature additions, new streaming service integrations, or engine optimizations.
- **PATCH (`1.0.x`)**: Security hotfixes, ad-block filter list updates, and bug fixes.

---

## Release History

### Release v1.0.1 (Playlist Downloader & Multi-Track Selection Fixes)
- **Release Date**: November 1, 2026
- **Release Tag**: `v1.0.1`
- **Target Architecture**: Linux `x86_64` / `amd64`
- **License**: GPL-3.0 (Codemo OSL)
- **Direct Download**: [**brave-music_1.0.1_amd64.deb (120 MB)**](https://github.com/codemoteams/Brave-Music/releases/download/v1.0.1/brave-music_1.0.1_amd64.deb)

#### Package Checksums (SHA-256)
```text
f14d6ad9f6e69771c1c9e97b09857a1ece292972a76f02c5110c21aa73debb20  brave-music_1.0.1_amd64.deb
```

#### Highlights and Fixes
- **Full Playlist Downloading**: YouTube Music and Spotify playlist URLs automatically batch-download all tracks and organize them into dedicated playlists.
- **Genuine Original Titles Preserved**: Track titles are strictly maintained without filename hashes, video IDs, or mangled strings inside the application or database.
- **Automatic Cover Art Assignment**: Extracts high-resolution playlist covers and track thumbnails from Spotify and YouTube streams.
- **Multi-Track Select Mode & Bulk Delete**: Added "Select" toolbar toggle, Selection Action Bar, Select All toggle, individual row checkboxes, item counter badge, and bulk delete with disk file and database purge.
- **Core Built-In Protection**: Built-in system tracks are guarded against accidental deletion or removal during bulk operations.

---

### Release v1.0.0 (Initial Stable Release)
- **Release Date**: October 31, 2026
- **Release Tag**: `v1.0.0`
- **Target Architecture**: Linux `x86_64` / `amd64`
- **License**: GPL-3.0 (Codemo OSL)
- **Direct Download**: [**brave-music_1.0.0_amd64.deb (120 MB)**](https://github.com/codemoteams/Brave-Music/releases/download/v1.0.0/brave-music_1.0.0_amd64.deb)

#### Package Checksums (SHA-256)
```text
2ded16a43683b093598c843acd2f758998e39f8b2478ac1b85ea198de90c7387  brave-music_1.0.0_amd64.deb
```

#### Highlights and Major Features
- **YouTube Music Streaming Integration**: Native full-screen webview running ad-free streaming with persistent session caching.
- **Spotify Web Player with Widevine DRM**: Powered by CastLabs Electron v42 runtime, enabling encrypted audio playback via EME.
- **Brave Shields Protection Engine**: Declarative network URL blocking and cosmetic CSS filter injection stripping banner, overlay, and pre-roll ad formats.
- **Built-in High-Bitrate Offline Downloader**: Direct integration with `yt-dlp` to extract and convert audio streams up to 320kbps into local storage.
- **Embedded C++ Musikcube Engine**: Local playback, tag indexing, and local streaming powered by an embedded `musikcubed` daemon and shared libraries (`libmusikcore.so`, `libtag.so.2`).
- **Capability-Based System Browser Authentication**: Avoids embedded browser login blocks by redirecting OAuth challenges to the user's primary system browser.
- **Standalone Debian Packaging**: Automated build script (`build-deb.sh`) generating production-ready `.deb` packages for Ubuntu and Debian derivatives.

#### Security and Privacy Notes
- **Zero Telemetry Policy**: No tracking scripts, analytics beacons, or remote user profiling.
- **Context Isolation**: Renderer execution isolated from Node.js runtime internals (`contextIsolation: true`, `nodeIntegration: false`).
- **Scoped Permissions**: System tray hooks and media keys mapped without privileged daemon requirements.

---

## Upcoming Releases and Roadmap

### Release v1.1.0 (Android Mobile Milestone)
- **Target Timeline**: Q1 2027
- **Target Platform**: Android 10+ (`arm64-v8a`, `armeabi-v7a`)
- **Planned Additions**:
  - Native Android shell with Material 3 bottom navigation.
  - Background playback audio service with lock-screen media notification controls.
  - Mobile storage synchronization with local Musikcube library.

---

## Release Procedure for Maintainers

Official releases must follow this process:

1. **Verify Clean Build**:
   ```bash
   npm test
   node test-widevine-ready.js
   node test-castlabs-eme.js
   ```

2. **Package Release Binary**:
   ```bash
   ./build-deb.sh
   ```

3. **Generate SHA-256 Checksums**:
   ```bash
   sha256sum brave-music_*.deb > SHA256SUMS.txt
   ```

4. **Tag Git Release**:
   ```bash
   git tag -a v1.0.0 -m "Release v1.0.0: Initial stable release"
   git push origin v1.0.0
   ```

5. **Publish to GitHub Releases**:
   Upload `brave-music_1.0.0_amd64.deb` along with `SHA256SUMS.txt` and changelog notes.
