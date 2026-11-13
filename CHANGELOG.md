# Changelog

All notable changes to the **Brave Music** project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.19-r] - 2026-11-13

### Added
- **Official Brand Mascot Icon**: Replaced legacy organizational network nodes logo with the authentic official Brave Music brand icon (vibrant orange lion wearing headphones) across multi-resolution `.ico` (`16x16` up to `256x256`), master 512x512 transparent PNG, and clean SVG.
- **Full Linux Desktop Icon Suite**: Debian package automatically installs standard hicolor icons (`16x16`, `24x24`, `32x32`, `48x48`, `64x64`, `128x128`, `256x256`, `512x512`) into `/usr/share/icons/hicolor/` and `/usr/share/pixmaps/brave-music.png`.
- **Single-Instance Application Lock**: Implemented `app.requestSingleInstanceLock()` to prevent multiple overlapping app instances; re-launching from desktop or terminal automatically restores and focuses the existing window.
- **Dock Integration Flags**: Configured `StartupWMClass=brave-music`, `StartupNotify=true`, and `--class=brave-music --name=brave-music` flags ensuring running windows group directly under the clicked desktop launcher icon in GNOME Shell and the Ubuntu Dock.
- **Modern Cross-Platform Native Stack (Rust + Native Webviews)**: Introduced the modular, memory-efficient cross-platform stack under `crates/brave-music-core` and `tauri-preview/src-tauri` with `./run.sh --new-stack` launcher.
- **Streamlined About Modal Actions**: Added minimal action buttons in the Info modal: `Email us`, `Update`, and `Report Issues`.

### Fixed
- **Webview Black Screen Layout Flaw**: Removed faulty `.stream-view-active` CSS display override that was hiding `<main class="app-main">` during streaming tab switches, restoring instant, smooth rendering for both YouTube Music and Spotify webviews.
- **Zero-Jank Ultra-Smooth Scrolling**: Eliminated conflicting `scroll-behavior: smooth !important` rules from YouTube Music and Spotify, removing kinetic friction and rubber-banding conflicts with Spotify's momentum scrolling engine.
- **Throttled Shields Scanner**: Debounced DOM mutation scans with a 350ms window and relaxed monitoring to 1500ms, eliminating main-thread blocking during rapid scrolling.
- **Typography & Border Sharpness**: Replaced fractional `scale()` transforms with GPU pixel-aligned translations (`translateY`) to prevent font fuzziness and border blurring.
- **High-Fidelity Audio Streaming**: Built-in HTTP Range server with full support for 206 Partial Content, instant seeking, and CORS support for local audio files.

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
