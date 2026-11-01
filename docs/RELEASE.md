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

### Release v1.0.4 (YouTube & Spotify Playlist Auto-Creation, Audio-Only Streams, Clean Metadata & Live Auto-Update)
- **Release Date**: November 1, 2026
- **Release Tag**: `v1.0.4`
- **Target Architecture**: Linux `x86_64` / `amd64`
- **License**: GPL-3.0 (Codemo OSL)
- **Direct Download**: [**brave-music_1.0.4_amd64.deb (120 MB)**](https://github.com/codemoteams/Brave-Music/releases/download/v1.0.4/brave-music_1.0.4_amd64.deb)

#### Package Checksums (SHA-256)
```text
a97bbfad92d21c834fd08bbec79e0d95f8ce1ed2026615b4f3fa802c81b6f223  brave-music_1.0.4_amd64.deb
```

#### Highlights and Fixes
- **Automated Playlist Creation**:
  - Automatically fetches playlist title and cover artwork upfront for YouTube Music and Spotify playlist URLs before downloading.
  - Instantly initializes the playlist in the library so it appears in the sidebar and playlist cards immediately.
- **Ordered Track Indexing**:
  - Preserves exact playlist order (1, 2, 3, 4, 5...) in both the playlist view and playback sequence (Play All, Shuffle, Random).
  - All downloaded tracks are added to both their respective playlist and the unified "All Music" library tab.
- **Pure Audio-Only Stream Extraction**:
  - Configured `yt-dlp` with `-f bestaudio/best` and audio-only extraction flags.
  - Eliminates video stream / video mix audio downloads, ensuring pure audio fidelity and up to 10x faster downloads.
- **Intelligent Metadata Sanitization**:
  - Cleans title noise such as `(Official Music Video)`, `(Official Audio)`, `[Visualizer]`, `(Lyric Video)`, `(Audio Track)`, and `- Topic`.
  - Accurately splits and identifies artist vs song title even when tags are missing or reversed, without defaulting to "Brave Music".
- **Reactive Live UI Auto-Update**:
  - Dispatches real-time IPC events (`library-updated` and progress `trackSaved`) to the frontend as tracks finish downloading.
  - Eliminates the need to restart the application or switch views to see new tracks and playlists.

---

### Release v1.0.3 (Select Button Repositioning & Simple Selection UI/UX)
- **Release Date**: November 1, 2026
- **Release Tag**: `v1.0.3`
- **Target Architecture**: Linux `x86_64` / `amd64`
- **License**: GPL-3.0 (Codemo OSL)
- **Direct Download**: [**brave-music_1.0.3_amd64.deb (120 MB)**](https://github.com/codemoteams/Brave-Music/releases/download/v1.0.3/brave-music_1.0.3_amd64.deb)

#### Package Checksums (SHA-256)
```text
fa4e43f52e8432946f52e25b72efe884bcda07aad330f26930318ecb56f191ae  brave-music_1.0.3_amd64.deb
```

#### Highlights and Fixes
- **Toolbar Layout Repositioning**: Positioned the Select Button on the left side of the Sort dropdown button, and the Search Bar on the right side of the Sort dropdown button (`[Select] -> [Sort By] -> [Search Bar]`).
- **Simple Selection UI/UX**:
  - Entire track rows are single-click interactive in selection mode for simple and immediate selection toggling.
  - In-place reactive DOM updates without redrawing the table, providing a fluid 60fps experience.
  - Pressing `Escape` or clicking "Done" cleanly exits selection mode.
  - Custom checkbox styling with orange accent glow and soft row highlight.
  - Core built-in tracks are protected with a disabled lock state.

---

### Release v1.0.2 (Info Button Dynamic Version Sync & Stable Release)
- **Release Date**: November 1, 2026
- **Release Tag**: `v1.0.2`
- **Target Architecture**: Linux `x86_64` / `amd64`
- **License**: GPL-3.0 (Codemo OSL)
- **Direct Download**: [**brave-music_1.0.2_amd64.deb (120 MB)**](https://github.com/codemoteams/Brave-Music/releases/download/v1.0.2/brave-music_1.0.2_amd64.deb)

#### Package Checksums (SHA-256)
```text
b473bc8dd13d7f12fcf6de1a23f70e0a7c6c65f4f0d19ce6bd2ace23a49c4b59  brave-music_1.0.2_amd64.deb
```

#### Highlights and Fixes
- **Dynamic Info Button Version Sync**: Wired the Info modal and Issue Reporter to automatically fetch and display the live installed package version via IPC (`get-app-version`).
- **All v1.0.1 Playlist & Selection Capabilities**: Includes full playlist batch downloading for YouTube Music and Spotify, original title preservation, high-res covers, multi-track select mode, and bulk deletion.

---

### Release v1.0.1 (Playlist Downloader & Multi-Track Selection Fixes)
- **Release Date**: November 1, 2026
- **Release Tag**: `v1.0.1`
- **Target Architecture**: Linux `x86_64` / `amd64`
- **License**: GPL-3.0 (Codemo OSL)
- **Direct Download**: [**brave-music_1.0.1_amd64.deb (120 MB)**](https://github.com/codemoteams/Brave-Music/releases/download/v1.0.1/brave-music_1.0.1_amd64.deb)

#### Package Checksums (SHA-256)
```text
111ffbe15d36393ad5917f22065ebcb4acaa4f59b93a6e634154c500dc38afdc  brave-music_1.0.1_amd64.deb
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
