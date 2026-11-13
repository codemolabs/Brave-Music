# Changelog

All notable changes to the **Brave Music** project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.19-r] - 2026-11-13

### Added
- **Official Ubuntu Snap Store & Debian Packaging**: Added Snapcraft manifest (`snap/snapcraft.yaml`), automated builder (`Install/Linux/build-snap.sh`), self-contained `backend/bin/` binaries (`yt-dlp` with `yt_dlp_ejs`, `node` EJS shim, `ffmpeg`, `ffprobe`, and shared audio libs), alongside `brave-music_1.0.19-r_amd64.deb`.
- **Smart Dual-Mode Authentication**: Profile Sign-In modal uses Default Browser Auto-Sync (bypassing Google embedded browser blocks) into `persist:bravemusic` browser memory with Emergency `.json` cookie recovery, while inside-app webview navigation stays in-app.
- **Spotify Pathfinder & Sequential Playlist/Mix Engine**: Added paginated Pathfinder GraphQL (`fetchPlaylist`, >100 tracks), `/intl-xx/` localized Spotify URL normalization, Artist top tracks, Personalized Mix support via `sp_dc` session cookies, YouTube `RD` Mix seed preservation, relaxed Spotify-to-YouTube search fallback, and direct 320kbps MP3 + ID3v2 metadata embedding (`title`, `artist`, `album`, `track`).
- **Enhanced Collections & Library UI**: Added auto-detection for playlist/mix URLs on input, 2x2 collection collage covers, provider source pills (`Spotify` / `YouTube` / `Collection`), audio format badges (`MP3`, `FLAC`, `M4A`, `VIDEO`), clickable collection links, and `1..N` ordered `Play All`.
- **Official Brand Mascot Icon & Full Linux Desktop Integration**: Multi-resolution `.ico`, 512x512 PNG, SVG, hicolor icons, `app.requestSingleInstanceLock()`, and `StartupWMClass=brave-music` grouping.
- **Modern Cross-Platform Native Stack Preview (`--new-stack`)**: Modular Rust core (`crates/brave-music-core`) and `tauri-preview` with 206 Partial Content Range streaming.

### Fixed
- **Spotify Mixes/Playlists Downloading 1 Track Bug**: Fixed regexes that missed `/intl-xx/` & `/artist/` paths and prevented Spotify playlist/mix URLs from falling back to single-track oEmbed `ytsearch1:` while still saving as a playlist; fixed `yt-dlp` client flags (`web_embedded,web,default`) replacing broken `tv,web` reloads and fixed `Play All` track ordering so playlists always play in `1..N` provider sequence.
- **Webview Black Screen Layout & Zero-Jank Smooth Scrolling**: Fixed `.stream-view-active`, removed conflicting CSS scroll overrides, debounced Shields scans to 350ms, and eliminated fractional `scale()` font blur.

---

## [1.0.18] - 2026-10-24

### Added
- **npm GitHub Packages Scoping**: Published package under `@codemolabs/brave-music` with zero-install `npx @codemolabs/brave-music` support.
- **Multi-Platform Distribution Scheme**: Structured directory hierarchy under `Install/Linux/`, `Install/MacOS/`, and `Install/Android/`.
- **Zero-Telemetry Policy**: 100% on-device processing with no external telemetry or activity tracking.

---

## [1.0.17] - 2026-10-18

### Changed
- **Playback Context Scoping**: Strict boundary isolation ensuring playback controls (Previous/Next) operate strictly within the currently active service.
- **Information Dialog Clean Version**: Streamlined version display in user-facing information dialogs.

---

## [1.0.16] - 2026-10-12

### Added
- **Linux MPRIS2 Integration**: Native `org.mpris.MediaPlayer2.bravemusic` D-Bus service integration with system tray, lock screen, and top panel media controller widgets.
- **Hardware Media Keys**: System-wide multimedia keyboard key handling for Play, Pause, Next, and Previous.
- **Bidirectional Metadata Sync**: Real-time position, volume, shuffle, repeat, track title, artist, and album art synchronization.

---

For detailed release history and SHA-256 verification hashes, see [docs/RELEASE.md](docs/RELEASE.md).
