# Release Notes and Version History: Brave Music

This document tracks official version releases, changelogs, binary checksums, and update schedules for Brave Music under Codemo Open Source Labs (Codemo OSL).

### Release v1.0.18

- **Release Tag**: `v1.0.18`
- **Windows Native Release & Suite (.exe / .zip)**: Complete Windows x64 release package with native Windows libraries, bundled `yt-dlp.exe`, CastLabs Widevine CDM DRM support, and Microsoft UI XAML (WinUI 3) design language.
- **Windows Suite "Shows Downloading" UI**: Dedicated Windows native download and onboarding suite with real-time progress bar, throughput metrics, ETA, and Windows 11 taskbar integration.
- **WinUI 3 & Windows App SDK Architecture**: Full C# WinUI 3 suite project in `Install/Windows/BraveMusic.Installer/` implementing `PackageDeploymentManager.AddPackageByUriAsync` and `ContentDialog` (with critical `dialog.XamlRoot = this.Content.XamlRoot` visual tree association).
- **New Multi-Platform Release Folder Scheme**: Structured under `Install/` with `Install/Linux/`, `Install/Windows/`, `Install/MacOS/`, and `Install/Android/`.
- **Zero Telemetry & Local Execution**: 100% on-device processing with zero data collection, no telemetry, and no forced installation. Developed and governed by Codemo Open Source Labs (COSL).
- **Debian Package (Linux)**: `Install/Linux/brave-music_1.0.18_amd64.deb`
- **Linux SHA-256**: `f198ef99d80d1eb61cff82d4f3b5667cd89b0182c82d66fc7fb7ee9b65d2b41b`
- **Windows Setup Executable**: `Install/Windows/BraveMusic-Setup-1.0.18.exe`
- **Windows Setup SHA-256**: `cc85d9e8e5964ad3cc011ed62fb24642b485a9f14a71c417585e73adf6b42d20`
- **Windows Portable Suite**: `Install/Windows/brave-music_1.0.18_win64.zip`
- **Windows Portable SHA-256**: `f333261575c64abd6d72588360ee33b416d74927f9724f1694b04c863a5b10d4`

### Release v1.0.17

- **Release Tag**: `v1.0.17`
- **Scoped Playback & Source Isolation**: Ensured Previous and Next controls are strictly bounded to the active player context (YouTube Music, Spotify, or Local Music) without cross-contaminating or switching to other sources.
- **Tab-Scoped Controls**: All playback controls operate strictly under the currently active tab.
- **Information Dialog Clean Version**: Streamlined version display in the Information dialog to clean version string.
- **Debian Package**: `brave-music_1.0.17_amd64.deb`
- **SHA-256**: `6f9737ac33659147793c32e98d2c64d539c56da0f9f7a05c376162d984ea3ea2`

### Release v1.0.16 (Linux Built-in Player MPRIS Controls)

- **Release Tag**: `v1.0.16`
- **Linux Built-in Media Player Integration (MPRIS2)**: Integrated native `org.mpris.MediaPlayer2.bravemusic` D-Bus service, allowing the Linux desktop (GNOME Shell, notification center, top panel, lock screen, sound applet) to show the media controller widget with playback buttons (Play, Pause, Next, Previous).
- **Desktop Entry Association**: Linked MPRIS service to `brave-music.desktop` and `/usr/share/icons/hicolor/scalable/apps/brave-music.svg` for seamless app identity and icon rendering in the Linux shell.
- **Hardware Media Key Handling**: Full support for multimedia keyboard and headset hardware keys (Play/Pause, Next, Prev, Stop).
- **Bidirectional State Sync**: Real-time position tracking, volume syncing, shuffle, repeat, track title, artist, and album art synchronization between the built-in offline player and the Linux OS.
- **Webview Playback Relay**: Seamless fallback bridging for YouTube Music and Spotify webview playback controls and metadata when Our Player is idle.
- **Debian Package**: `brave-music_1.0.16_amd64.deb`
- **SHA-256**: `2b6b9c824adbeeb7f187aacd7eef4f4edc42c2db2bcd37007fa45f841630e753`

### Release v1.0.15 (Header Profile Icon & Clean Sign-In)

- **Release Tag**: `v1.0.15`
- **Header Profile Button**: Restored the simple, clean empty profile icon button (`btn-auth-sync`) in the top navigation header without tube/pill text wrappers, dot indicators, or avatar replacements.
- **Untouched Sign-In Popup**: Preserved the full redesigned dark theme sign-in popup, native brand styles, tab switching, and bounded feedback containers.
- **Information Dialog**: Updated release version indicators to v1.0.15 across dialog and runtime listeners.
- **Debian Package**: `brave-music_1.0.15_amd64.deb`
- **SHA-256**: `77be87d73c8350a14fdd35024d04c9498123af7da69af1ed88f00b513322bff6`

### Release v1.0.14 (Clean Sign-In & Session Sync)

- **Release Tag**: `v1.0.14`
- **Sign-In Redesign**: Modern dark theme sign-in modal matching design guide tokens, removed dashed dividers and borders, added segmented navigation pill bar, and native YouTube Music (`#ff0033`) and Spotify (`#1ed760`) brand styles.
- **Container Overflow Fix**: Strictly bounded and responsive live status feedback card preventing layout stretch or container override.
- **Animation & Lifecycle Sync**: Added attempt tracking and lifecycle guards in CDP auth to prevent late status ticks from overwriting completed logins, instant spinner removal on cancellation, and safe sign-out progress handling.
- **Information Dialog**: Synchronized version indicator in About dialog with dynamic release tracking.
- **Debian Package**: `brave-music_1.0.14_amd64.deb`
- **SHA-256**: `d924a3a0ec87ca6fdc3a82d8358bfbfda0f3170609bf5694f17dc1733bd15bb1`

### Release v1.0.13 (Account Feedback & Performance)

- **Release Tag**: `v1.0.13`
- **Account Feedback**: Replace the remaining blue loading box with compact dark-theme feedback and consistent loading, success, and error states.
- **Performance**: Coalesce overlapping account refreshes, inspect each music page once after loading, skip unchanged profile writes, and reload only the service being signed in.
- **Debian Package**: `brave-music_1.0.13_amd64.deb`
- **SHA-256**: `25c0444fc3d72e8fb42eb79952657d4acaea3cd423bd92915cac997ffe613d6e`

### Release v1.0.12 (Service-Aware Account Dialog)

- **Release Tag**: `v1.0.12`
- **Account UI**: Match the account dialog to Brave Music's dark theme, show the active service's original icon and name, and keep sign-in/sign-out compact with clear loading and success states.
- **Account State**: Display the signed-in view when a service reports an active session, even when profile metadata is unavailable.
- **Debian Package**: `brave-music_1.0.12_amd64.deb`
- **SHA-256**: `4cf8418f4f779680f204be26fd08893d641017ec361acf6b137f325dd0b9a346`

### Release v1.0.11 (Domain-Scoped Browser Cookies)

- **Release Tag**: `v1.0.11`
- **Sign-in**: Preserve domain-wide browser cookie scope when applying cookies to the shared session, so YouTube and Spotify subdomains receive the service login cookies.
- **Migration**: Replace stale host-only cookie entries from earlier sync attempts before setting domain-wide cookies.
- **Debian Package**: `brave-music_1.0.11_amd64.deb`

### Release v1.0.10 (Default Browser Authentication)

- **Release Tag**: `v1.0.10`
- **Sign-in**: Opens the system default browser for Google or Spotify authentication, then securely imports only the selected service's cookies into the shared embedded session.
- **Session Handling**: Cookie export files use mode `0600` and are removed after import; both music tabs refresh when sign-in completes.
- **Debian Package**: `brave-music_1.0.10_amd64.deb`

### Release v1.0.9 (Final Account Sheet Polish)

- **Release Tag**: `v1.0.9`
- **Account UI**: Reduced the sign-in dialog to a plain account state and one action, with the provider picker and cookie import controls removed from the visible dialog.
- **Debian Package**: `brave-music_1.0.9_amd64.deb`

### Release v1.0.8 (Account Dialog & Shared Sign-In Fixes)

- **Release Tag**: `v1.0.8`
- **Account UI**: Separated the account dialog from the About dialog and simplified the person icon and sign-in sheet.
- **Sign-in**: Wait for the YouTube sign-in redirect to finish before closing the shared-session window. Refresh both music tabs after sign-in or cookie import.
- **Session Persistence**: Avoid restoring legacy cookie snapshots over an existing live browser session.
- **Debian Package**: `brave-music_1.0.8_amd64.deb`

### Release v1.0.7 (Shared Persistent Sign-In & Minimal Account UI)

- **Release Tag**: `v1.0.7`
- **Sign-in**: Authentication now runs in a Brave Music window attached to the same persistent browser session used by both music tabs. Google and supported service sessions are kept on-device and reused across tabs and app restarts.
- **Account UI**: Replaced the labeled account pill with a person icon and simplified the sign-in sheet.
- **Debian Package**: `brave-music_1.0.7_amd64.deb`

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

### Release v1.0.6 (Dedicated Header Account Pill, Saved User Account Profiles & Unambiguous Login Logic)
- **Release Date**: November 1, 2026
- **Release Tag**: `v1.0.6`
- **Target Architecture**: Linux `x86_64` / `amd64`
- **License**: GPL-3.0 (Codemo OSL)
- **Direct Download**: [**brave-music_1.0.6_amd64.deb**](https://github.com/codemoteams/Brave-Music/releases/download/v1.0.6/brave-music_1.0.6_amd64.deb)

#### Package Checksums (SHA-256)
```text
711b3a8c8533ce7c1f0a1d4fd2bf81bd85e7e07fb1bbbeb8850a87af43596a77  brave-music_1.0.6_amd64.deb
```

#### Highlights and Fixes
- **Dedicated Header Account Pill Button (`#btn-auth-sync`)**:
  - Transformed the header user person button into an unmistakable pill with avatar/icon, dynamic user name label ("Sign In" when logged out, user's name when logged in), and emerald active dot.
  - Added `-webkit-app-region: no-drag !important` and `pointer-events: none` on inner elements to ensure reliable click handling without window drag interference.
  - Completely isolated from the Information icon (`#btn-about`), eliminating any UX confusion between Login and About.
- **Persistent Saved User Accounts (`user_accounts.json`)**:
  - Automatically records and persists user profile metadata (`name`, `email`, `avatar`, `authenticated`, `lastLogin`) to `user_accounts.json`.
  - Automatically backfills existing session cookie caches on startup.
- **Saved User Account Cards**:
  - Displays a clean profile card inside the login modal showing avatar image/initials, full name, email, "Saved & Active" badge, "Refresh Player", and "Sign Out" actions.
- **Dynamic Webview User Profile Syncing**:
  - Proactively extracts logged-in Google / YouTube Music and Spotify usernames and avatars directly from active webview sessions.

---

### Release v1.0.5 (Minimal White Login UI, One-Click Auto-Sync & JSON Cookie File Import)
- **Release Date**: November 1, 2026
- **Release Tag**: `v1.0.5`
- **Target Architecture**: Linux `x86_64` / `amd64`
- **License**: GPL-3.0 (Codemo OSL)
- **Direct Download**: [**brave-music_1.0.5_amd64.deb**](https://github.com/codemoteams/Brave-Music/releases/download/v1.0.5/brave-music_1.0.5_amd64.deb)

#### Package Checksums (SHA-256)
```text
bd6a1f084797fa6005ad9c0644d26c716b4b17dfe28e158aa7bda346215471dc  brave-music_1.0.5_amd64.deb
```

#### Highlights and Fixes
- **Minimal Professional White Login Modal**:
  - Replaced technical-heavy modal with a sleek, minimalist white card design.
  - Simple 2-tab layout for YouTube Music and Spotify with status indicators.
- **Top Header Person Icon Integration**:
  - Integrated header Person icon with real-time status indicator dot (`.connected`).
  - Automatically opens the relevant login tab based on active view.
- **One-Click Real-Time Auto Detection**:
  - YouTube Music & Spotify browser login with real-time cookie polling (`sp_dc`, `__Secure-3PAPISID`, `LOGIN_INFO`).
  - Injects cookies immediately into player partition and triggers in-place refresh without closing or restarting the app.
- **JSON File Cookie Import**:
  - Added clean JSON file picker (`.json`) for manual cookie imports from extensions like Cookie-Editor / EditThisCookie, replacing raw text pasting.

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
