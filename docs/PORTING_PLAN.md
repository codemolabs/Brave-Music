# Brave Music Rust and Cross-Platform Porting Plan

**Status:** Updated per user directive: Preserving the complete installed Debian package (`/opt/brave-music/`) frontend UI, features, in-app embedded streaming views, and offline engine, while migrating away from Electron to a modern cross-platform stack (Rust core + native multi-platform webviews) supporting Linux, Windows, and Android.

**Scope:** Linux desktop (deb/rpm), Windows desktop (msi/exe), and Android (apk).

**Plan owner:** Brave Music maintainers.

**Current baseline:** Installed Debian package v1.0.18 (`/opt/brave-music/`).

## 1. Executive decision

Retain 100% of the current HTML, CSS, and JavaScript interface, visual tokens (dark theme, 58px header, 54px bottom player bar), and offline features as established in the installed release. Replace the Electron shell with a cross-platform stack:
1. **Shared Rust Core (`brave-music-core`):** High-performance domain engine managing library JSON persistence, download orchestration, audio stream serving, and platform adapters.
2. **Embedded In-App WebViews with Full Page View Navigation:** Streaming providers (YouTube Music and Spotify) run INSIDE the application window using platform-native webviews (Windows WebView2, Android System WebView, Linux WebKitGTK/embedded engine) with complete Back (`<`) and Forward (`>`) page view navigation, reload logic, and responsive view switching.
3. **Universal API Bridge (`appApi.js`):** A unified JavaScript bridge exposing `window.braveApi` to decouple the frontend from Electron IPC, mapping calls to the active native runtime.

**Decision record (2026-11-12):** Implement a unified cross-platform stack supporting Linux, Windows, and Android. Maintain embedded provider playback and complete in-app page viewing inside the client. Do not discard in-app streaming or eject the user to external browsers. Preserve all user library data, downloads, and playback capabilities across migrations.

## 2. Goals and non-goals

### Goals

- Produce installable and supportable Linux, Windows, and Android builds from a shared application core.
- Reuse the current UI where practical and replace the Electron-only bridge behind a stable app API.
- Preserve the local library, playlists, downloads, and settings across upgrade from the current Linux release.
- Give each OS the native media, storage, packaging, signing, and lifecycle behavior it requires.
- Improve the security boundary around remote web content, native commands, downloaded media, and credentials.
- Add repeatable automated and manual verification for every published target and architecture.

### Non-goals for the first migration

- Rewriting the interface in Rust or replacing the current UI design.
- Promising every Linux distribution, CPU architecture, Android vendor image, or Windows release without a defined support matrix.
- Guaranteeing identical web-player behavior where the underlying OS webviews differ.
- Reimplementing a licensed DRM system or bypassing provider security controls.
- Replacing Musikcube before a separately measured compatibility and maintenance decision.

## 3. Current-state analysis

The repository has a coherent separation between UI, Electron main/preload, backend services, and the Musikcube engine, but the boundary is Electron-specific rather than platform-neutral.

| Current area | Evidence | Porting implication |
|---|---|---|
| Packaging | `package.json` declares `os: ["linux"]`, and only `build:deb` exists. `Install/Linux/build-deb.sh` builds amd64 only, copies the full `node_modules`, seeds Widevine from `/opt/google/chrome` when present, and creates a launcher using `--no-sandbox`. | Add target-specific build, signing, packaging, and release jobs; review CDM redistribution; do not advertise unbuilt targets. |
| Shell and UI bridge | `main.js` uses Electron `BrowserWindow`, session partitions, IPC, and Electron webContents; `preload.js` exposes `window.braveApi`. | Introduce a documented `appApi` and Rust/Tauri adapter. Migrate UI calls through that API while preserving the Electron adapter for rollback. |
| Remote streaming | `src/index.html` embeds YouTube Music and Spotify in Electron `<webview>` tags. | Provide native in-app WebViews across platforms (WebView2 on Windows, Android System WebView on Android, native WebKitGTK/embedded engine on Linux). Preserve in-app streaming with Back/Forward navigation. |
| Browser assumptions | The main process forces a Linux desktop user agent, patches Client Hints, and disables `AutomationControlled`. | Remove platform spoofing and automation-flag manipulation. Use each runtime's normal identity and test real provider behavior. |
| Widevine | `main.js` searches for Linux `libwidevinecdm.so` at Linux-specific paths and passes Electron-specific CDM switches. The dependency is a CastLabs Electron build. | Remove CDM discovery and bundling from the replacement. Verify that playback works in the selected external browser; do not copy a CDM or browser profile. |
| Native audio | Musikcube is checked in as Linux binaries and `.so` files; its service sets `LD_LIBRARY_PATH`, uses Linux paths, and launches a daemon. | Keep it only on supported desktop targets until native builds and runtime behavior are proven. Android requires a mobile audio lifecycle design. |
| Downloads and storage | `DownloadService` spawns external binaries; `appConfig.js` uses Linux home paths and resolves tools from Linux paths. | Add per-platform binary resolution and packaging, Android scoped-storage handling, process cancellation, and a data migration. |
| OS integration | MPRIS is implemented through D-Bus; file pickers, taskbar progress, and folders are routed through Electron. | Define Linux, Windows, and Android implementations behind common interfaces. |
| Security posture | `BrowserWindow` specifies `sandbox: false`; `npm start` and the Debian launcher use `--no-sandbox`. Remote sites are embedded in the app. | Tauri hosts only local app UI; providers open externally. Remove spoofing and cookie import, validate all app commands, and ship no production `--no-sandbox` setting. |
| Architecture claims | The npm metadata lists Linux x64 and ARM64, while the committed desktop package is amd64 and includes Linux-native engine files. | Establish and test each exact OS/CPU package combination before marking it supported. |

## 4. Target architecture

```text
Existing HTML/CSS/JS UI (Identical to installed DEB baseline)
        │
        ├── Unified app API adapter (appApi.js)
        ├── In-App WebViews: YouTube Music & Spotify (In-App Page Views)
        ├── Built-in Audio Player Bar (54px) & Offline Library View
        └── In-App Navigation Bar (< Back, > Forward, Reload)

Cross-Platform Native Shells
  ├── Windows: WebView2 (Chromium with native Widevine DRM & hardware acceleration)
  ├── Android: Android System WebView + Foreground MediaSessionService (Media3)
  └── Linux: WebKitGTK / Wry / Embedded Chromium

Shared Rust Core (brave-music-core)
  ├── Library & playlist engine (atomic JSON, backward compatible)
  ├── Download job coordinator (yt-dlp stream extraction, multi-format)
  ├── Local stream server / audio output
  └── Platform adapters (MPRIS / SMTC / Android MediaSession)
```

### In-App Streaming & Page View Architecture
1. **In-App Streaming Guaranteed:** YouTube Music (`https://music.youtube.com`) and Spotify (`https://open.spotify.com`) run directly INSIDE the application viewports.
2. **Page View Navigation Logic:** The app header contains Back (`<`) and Forward (`>`) buttons alongside reload controls. When deep-browsing inside YouTube Music or Spotify, the app maintains the guest navigation history stack, enabling full traversal with enabled/disabled button states and keyboard shortcuts (`Alt+Left`, `Alt+Right`).
3. **DRM & Streaming Parity:**
   - On Windows, WebView2 provides hardware DRM and Widevine support out of the box.
   - On Android, Android System WebView provides native hardware-backed Widevine L3/L1 DRM for full Spotify web playback.
   - On Linux, embedded webview runtimes or dedicated CDM paths are maintained.

Tauri's opener plugin lists Linux, Windows, and Android support; on mobile it opens the URL using the system default browser unless the optional in-app-browser mode is explicitly selected. Keep external browser mode as the default. Android's `ACTION_VIEW` resolves through the system to a browser or registered app and reports when no handler exists. See [Tauri opener](https://v2.tauri.app/plugin/opener/), [Android web intents](https://developer.android.com/guide/components/intents-common#Browser), and [Android browser handoff guidance](https://developer.android.com/training/package-visibility/use-cases#open-urls-in-a-browser).

#### Brave source review (not selected for implementation)

Brave's public source remains useful for technical reference, but a fork is not part of this implementation. The Linux host does not meet Chromium's minimum source-build disk requirement, and a Brave fork would still require a separate Widevine authorization path and ongoing security releases. Do not provision or build Brave/Chromium unless the user explicitly reopens that decision.

If the fork option is reconsidered, use this source-review sequence before writing patches:

1. Start at the [`brave-browser` project README](https://github.com/brave/brave-browser). It says this repository is the project/wiki/release entry point, not the browser source checkout; browser code and contributions live in [`brave-core`](https://github.com/brave/brave-core).
2. Read the current [Linux development guide](https://github.com/brave/brave-browser/wiki/Linux-Development-Environment) and [build configuration guide](https://github.com/brave/brave-browser/wiki/Build-configuration). Confirm that host RAM, disk, OS, and tool versions satisfy the current instructions before cloning. Current guidance uses Git 2.41+, Node.js 24+, package-manager initialization, and Chromium's Debian/Ubuntu dependency installer; do not copy a stale command list from an old wiki revision.
3. Pin a Brave release/tag and record the corresponding Chromium and Brave Core commits from the checked-out dependency metadata. Do not build floating `master` for a release. Preserve an upstream-only baseline before any local patch.
4. Follow Brave's orchestrated repository workflow: install its pinned JavaScript dependencies, run its initialization/sync command to fetch Chromium and `brave-core`, install Chromium's platform dependencies, then run the documented build and package commands. The [Linux package guide](https://github.com/brave/brave-browser/wiki/Linux-packages) documents `pnpm run create_dist Release`; record all revisions, flags, outputs, and checksums.
5. For Android, use the Brave Android-specific init/build target and Android SDK/NDK requirements from the current Brave and Chromium guides. Build and test Android separately; a desktop CEF or Linux Widevine result does not establish Android support.
6. Compare required `.env` configuration with Brave's [public build-configuration list](https://github.com/brave/brave-browser/wiki/Build-configuration). Do not reuse Brave service secrets, signing keys, updater endpoints, or branding credentials. Determine which product features fail without those services.
7. Review the [Widevine integration code](https://github.com/brave/brave-core/blob/master/browser/widevine/widevine_utils.cc) only to understand the component update boundary. It does not grant rights to redistribute Widevine. Obtain explicit authorization and a supported CDM delivery arrangement; never copy a browser profile or CDM binary.
8. Before shipping, complete license/notice review, patch tests, SBOM, signature/provenance, and a security-update rebuild drill for every target. A fork requires an owner for upstream Chromium/Brave merges and emergency updates.

The current alternative avoids these build and maintenance costs. Reference sources: [Brave Core README](https://github.com/brave/brave-core/blob/master/README.md), [Chromium Linux build requirements](https://chromium.googlesource.com/chromium/src/+/main/docs/linux/build_instructions.md), [Brave Linux package guide](https://github.com/brave/brave-browser/wiki/Linux-packages), and [Brave Widevine integration](https://github.com/brave/brave-core/blob/master/browser/widevine/widevine_utils.cc).

## 5. Implementation sequence and gates

### Phase 0 — Baseline and support contract

1. Record current Linux behavior and versions: login/logout, saved sessions, streaming, local playback, library operations, downloads, import/export, MPRIS, settings, and install/upgrade behavior.
2. Inventory all persisted files, cookies, tokens, user profile metadata, downloaded files, binary dependencies, and their current locations. Identify which data is sensitive and which is user-created content.
3. Define the initial support matrix: exact Linux distributions and CPU architectures, minimum Windows version and CPU architecture, Android minimum API level and CPU ABIs, and whether ARM Linux is a release target.
4. Capture reproducible Linux smoke-test fixtures and sample library/settings data with synthetic accounts and no real credentials.
5. Update support claims only after a target has passed its release acceptance criteria.

Host-specific migration inventory already confirmed:

- `~/.local/share/brave-music` is the app data root used by `backend/config/appConfig.js`; it contains `library.json`, `settings.json`, thumbnails, and downloads. The saved `downloadsDir` may point outside this root, so migration must honor that path and never move the user's media without consent.
- `~/.config/brave-music` is used for browser/CDM state and auth services. Code paths include `auth_vault.enc`, `user_accounts.json`, YouTube/Spotify session metadata, separate auth profiles, and the persistent webview partition. Keep this legacy profile intact; do not merge its Chromium databases into a different browser version.
- The installed Debian package has no dpkg `prerm` or `postrm` script, so normal package removal should leave home-directory data. Verify this behavior in a disposable upgrade test before cutover.
- The repository manifest is `@codemolabs/brave-music`, while the installed global npm package is `@codemoteams/brave-music` 1.0.18. Confirm package identity in the cutover record before removing that global package.

**Gate 0:** maintainers sign off on supported target versions, feature parity expectations, provider feature fallbacks, and a baseline Linux regression checklist.

### Phase 1 — External browser handoff and security proof

Build the Tauri local UI and a fixed-provider opener. Test the handoff on Linux first, then Windows and Android. The Tauri webview must load only app-owned local content. Verify:

- `youtube` opens only `https://music.youtube.com/`; `spotify` opens only `https://open.spotify.com/`.
- Requests for arbitrary URLs, unknown providers, `file:`, `javascript:`, and custom schemes are rejected.
- The OS uses the user's expected browser or registered provider app; missing handlers show a useful error and copy-link fallback.
- The provider browser retains its own sign-in/session across browser restarts. The app neither reads nor imports that profile.
- Actual provider playback, including protected content where required, works in the chosen browser. The app reports the handoff and does not claim playback state it cannot observe.
- The local Tauri UI cannot be navigated to remote origins and remote provider pages cannot access Tauri commands or local files.
- On Android, compare external `ACTION_VIEW` handoff with Tauri's Custom Tabs option on physical devices; use whichever preserves provider playback/login and return-to-app behavior.

**Gate 1:** approve a target when the local shell is secure and the provider URL opens in a supported browser with real playback. Browser playback is an external-browser capability, not an embedded app feature. If no supported browser is available, mark provider playback unavailable and leave the local library usable.

### Phase 2 — Platform-neutral API and data contracts

1. Document the operations now exposed by `preload.js`: app/window info, library, playlist, media, downloads, shields, auth, events, and OS integration.
2. Define request/response/event schemas, error codes, cancellation semantics, and versioning. Create typed frontend wrappers while preserving current UI behavior.
3. Separate domain logic and data models from Electron, `process.platform`, filesystem paths, and OS process calls.
4. Add contract tests for every operation and event. Keep Electron as the production Linux app until Tauri local-app parity and browser handoff are demonstrated.

**Gate 2:** the Tauri UI and Rust adapter pass API contract checks for local-library operations. Provider buttons open only the two approved external URLs, and the intentional change from embedded to browser-owned playback is documented in the UI. Contract tests pass.

### Phase 3 — Rust core and persistence migration

Port in small modules, in this order:

1. Shared models, validation, settings, and path resolution.
2. Library and playlist read/write operations, including atomic writes and corruption recovery.
3. Download job state, progress events, cancellation, and metadata normalization.
4. Media/file abstractions, thumbnail handling, import/export, and local stream access.
5. Do not port provider cookie, CDP, or browser-session synchronization. Keep app-owned OAuth only if a remaining app feature requires it and after a separate threat review.

Use OS application-data directories and OS credential storage where supported. Keep media files in user-selected locations. Make migration idempotent, preserve the source until the new data is verified, and create a recoverable backup before changing formats. Never log credentials or copy them into test fixtures.

**Gate 3:** migration tests prove current Linux library/settings data is preserved, and the Rust services pass unit, integration, and contract tests.

### Phase 4 — Platform adapters and native media

- **Linux:** replace MPRIS implementation behind a platform interface; build packages for each declared architecture; verify dependencies on clean systems. Decide whether to retain Musikcube or build/replace it only after validating its native dependencies and audio outputs.
- **Windows:** build the Tauri app and installer with the pinned Windows toolchain; use WebView2 only for the local UI and open providers in the default browser. Provide file dialogs, paths, taskbar/media controls, audio output, uninstall/upgrade, and signing.
- **Android:** implement a mobile layout and native storage/file picking. Move local background playback into an Android media service, using Media3/MediaSessionService where appropriate; Android requires an app lifecycle-aware service and media-playback foreground-service configuration. See [Android background playback](https://developer.android.com/media/media3/session/background-playback). Test app pause, process death, screen lock, audio focus, Bluetooth controls, and battery restrictions.
- **Downloads:** choose an explicit strategy per platform: bundled/managed downloader executable, user-installed dependency where appropriate, or no downloader on restricted targets. Verify architecture, updates, executable permissions, cancellation, and licensing. Do not assume a Linux binary or PATH lookup works on Windows/Android.

**Gate 4:** every platform adapter passes its native integration tests on a clean install and upgrade install.

### Phase 5 — Packaging, CI, signing, and release

1. Add target-specific CI workflows with pinned Rust, Node, Tauri, Android SDK/NDK, and native build tool versions.
2. Build on native runners where toolchain or signing requirements demand it. Produce artifacts only for the declared support matrix.
3. Create Linux packages (initially `.deb`; add AppImage/Flatpak/RPM only when maintainers commit to their dependencies and support), Windows installer(s), and signed Android APK/AAB artifacts.
4. Generate checksums, SBOM/dependency reports, license notices, provenance, and release notes for each artifact.
5. Test install, launch, update, uninstall, and user-data preservation from a clean VM/device before publishing.
6. Use staged releases and retain the known-good Electron Linux package as rollback during the migration window.

**Gate 5:** release manager signs off on artifact signatures, checksums, install/upgrade results, support documentation, and rollback instructions.

### Phase 6 — Cutover and Electron retirement

1. Run the Tauri app in preview/beta with opt-in testers; collect only privacy-respecting, user-consented failure reports.
2. Compare Linux migration results and performance against the Electron baseline.
3. Promote only the platforms that passed all release gates; mark incomplete features accurately.
4. Retire the Electron shell only after Linux parity, migration safety, and rollback coverage are established.

## 6. Risk register

Likelihood and impact are initial planning estimates: **H** high, **M** medium, **L** low. Re-score after Linux and mobile handoff prototypes.

| ID | Risk | Likelihood / impact | Mitigation and required evidence | Owner / gate |
|---|---|---|---|---|
| R1 | A device has no suitable HTTPS browser/handler or routes links to an unexpected app. | M / High | Use the Tauri opener with fixed provider URLs; show handler errors and copy-link fallback; verify Linux MIME handlers, Windows defaults, and Android intents. | Platform owner / Gate 1 |
| R2 | External handoff loses embedded playback controls and unified session state. | H / High | Make the UX explicit; let the browser own provider media controls; keep app media controls scoped to local files; test returning to the app. | Product owner / Gate 1 |
| R3 | Provider page or query data reaches arbitrary opener targets via injection. | M / Critical | Accept a provider enum only; map it to constant HTTPS URLs in Rust; keep general opener commands unavailable to UI; negative-test schemes, hosts, redirects, and malformed payloads. | Security reviewer / Gate 1 |
| R4 | Users expect Electron cookies/auth profiles to migrate into the browser. | H / High | Never copy cookies or browser databases; explain that provider sign-in is owned by the browser; preserve legacy profile until user confirms cutover. | Product/data owner / Gate 3 |
| R5 | Provider behavior, DRM policy, or browser support changes. | M / High | Test supported browser releases periodically; do not bypass DRM; provide clear unavailable status and keep the local library working. | Browser compatibility owner / ongoing |
| R6 | Local Tauri UI accidentally navigates to remote content or exposes native commands. | L-M / Critical | Bundle local UI; deny remote navigation; use narrowly scoped capabilities and validated commands; run negative-origin and command-invocation tests. | Security reviewer / Gate 2 |
| R7 | Data loss or settings/download path breakage during migration. | M / Critical | Inventory first; versioned/idempotent migration; create and verify a backup; honor external downloadsDir; preserve the legacy source until acceptance. | Data owner / Gate 3 |
| R8 | Musikcube and Linux-only binaries block Windows/Android local playback. | H / High | Isolate the engine interface; validate native audio per target; disable unsupported features rather than shipping mismatched binaries. | Media owner / Gate 4 |
| R9 | `yt-dlp` or other helper binaries are missing, incompatible, blocked, or incorrectly licensed. | H / High | Define per-target strategy; pin and verify dependencies; test offline install, update, cancellation, process cleanup, ABI, and licensing. | Downloads owner / Gate 4 |
| R10 | Android storage, lifecycle, background execution, or audio focus differs from desktop. | H / High | Use scoped storage and system pickers; use Media3 for local background playback; test process death, screen lock, focus, notification controls, and battery restrictions on physical devices. | Android owner / Gate 4 |
| R11 | Linux paths, MPRIS, environment variables, shell scripts, or process assumptions leak into shared Rust code. | H / Medium | Keep OS adapters separate; audit path/process assumptions; test clean hosts without optional packages. | Core owner / Gates 2, 4 |
| R12 | Declared OS/CPU support does not match built artifacts. | M / High | Keep an explicit artifact matrix; inspect binary format/architecture; build and run on native OS/ABI; derive release metadata from actual outputs. | Release owner / Gate 5 |
| R13 | Tauri native toolchains and CI hide runtime defects. | M / Medium | Pin toolchains; use native runners/devices; separate compile success from runtime acceptance; test packaged builds. | Build owner / Gate 5 |
| R14 | Provider auth, downloads, or ad filtering create policy/store risk. | M / High | Remove cookie import and CDP login from the replacement; review provider terms and store rules; do not rely on stealth or DRM circumvention. | Product/legal owner / Gates 1, 5 |
| R15 | Secrets or personal media leak through logs, backups, or overbroad commands. | M / Critical | Minimize retained secrets; use OS credential facilities; validate paths; redact logs; test backup/restore and permission denial. | Security reviewer / Gates 2, 3 |
| R16 | GPL and third-party source/binary obligations are missed. | M / High | Track licenses/notices for Rust crates, Tauri plugins, Musikcube, FFmpeg, downloaders, and bundled assets; verify redistribution rights before packaging. | Release owner / Gate 5 |
| R17 | Signing or dependency compromise ships an untrusted artifact. | L-M / Critical | Protect release workflow; pin actions/toolchains; sign artifacts; generate checksums, dependency audit, SBOM, provenance, and release notes. | Release/security owner / Gate 5 |
| R18 | App becomes too large or slow from media dependencies or webview runtime. | M / Medium | Measure install size, startup, memory, and local playback CPU; set budgets and choose WebView2 deployment mode deliberately. | Performance owner / Gates 1, 5 |
| R19 | UI does not work on touch screens or small windows. | M / High | Test phone/tablet dimensions, touch targets, keyboard, rotation, scaling, and accessibility. | UI owner / Gate 4 |
| R20 | Wrong legacy package identity is removed during cutover. | M / High | Record Debian `brave-music` and global npm scope/version; remove only the confirmed packages after replacement acceptance; verify home data remains. | Release owner / Gate 5 |
| R21 | A future proposal reintroduces Chromium/Brave fork cost without DRM authorization or security staffing. | L / High | Treat browser forking as a separate decision; do not provision or build it under this plan. | Project owner / scope control |
| R22 | Local audio asset handling exposes arbitrary user files to the app webview. | M / Critical | Use a narrow media-file allowlist or Rust-validated streaming command; never grant broad home-directory scope; test that an unlisted file and path-traversal payload cannot be loaded. | Security reviewer / Gates 2, 4 |
| R23 | The legacy Electron app writes `library.json` during migration, leaving the new copy behind the source. | M / High | Ask the user to close the old app; parse and back up one captured byte snapshot; use no-clobber target creation; keep the old source intact and compare the new library to its verified backup. | Data owner / Gate 3 |
| R24 | Two Rust app instances can load the same library and overwrite each other's playlist changes with stale snapshots. | M / Medium | Add a cross-platform single-instance or library lock before enabling mutating commands; serialize mutations and test concurrent create/delete operations against one library path. | Core owner / Gate 2 |

## 7. Test and acceptance plan

Tests in this section are required before implementation phases are considered complete. “Pass” means recorded results on the stated target, not merely successful compilation.

### Test levels

| Level | Required coverage | Pass criteria |
|---|---|---|
| Unit | Rust models, URL/path validation, metadata normalization, library CRUD, playlist ordering, settings, downloader state transitions, error mapping. | Deterministic tests pass; invalid inputs fail safely; no writes escape the app/media directories. |
| Contract | Frontend adapter calls, Rust command schemas, event payloads, progress/cancel behavior, error codes. | Existing UI receives the documented response shapes; no raw platform-specific errors leak through the API. |
| Integration | Temporary data directories; import/export; interrupted/cancelled downloads; child process cleanup; media streaming/range requests; settings and library migration; old and corrupt files. | No lost user data, orphan processes, hangs, or partial writes reported as success. |
| Security | Remote content attempts native command invocation, local-file access, arbitrary URL/scheme opening, path traversal, malformed payloads, unauthorized navigation, asset-protocol scope bypass, and credential/log inspection. | All unauthorized access is denied; secrets are absent from logs and test artifacts; only intended app commands are callable from trusted UI, and unlisted local files cannot be streamed. |
| UI/E2E | First launch, provider navigation, sign-in/logout, play/pause, local library, playlist, download, import, folder selection, app restart, and error/empty states. | All supported flows pass using packaged builds, not only dev mode. |
| External browser handoff | Provider ID to fixed URL mapping, default-handler launch, missing-handler error, return to app, sign-in/session, normal and protected playback in the browser. | Only approved fixed HTTPS URLs open; the app does not read browser profiles or claim playback state; provider playback is recorded per supported browser/OS. |
| Platform integration | Linux MPRIS and clean packages; Windows install/update/uninstall, file picker, media controls; Android SAF, MediaSession, notification, audio focus, background playback. | Native controls and lifecycle behavior work on declared OS versions and hardware. |
| Release | Signatures, checksums, dependency/license reports, clean install/upgrade/uninstall, first launch, rollback, artifact architecture. | Artifacts install on clean systems, signatures validate, data survives upgrade, and rollback is documented and exercised. |

### Minimum test matrix

Before public release, test at least:

- **Linux:** each declared distribution family and CPU architecture; Wayland and X11 if both are claimed; clean install and upgrade; MPRIS with at least one desktop environment.
- **Windows:** each declared CPU architecture and minimum supported Windows version; standard user install/update/uninstall; default-browser handoff and return to the local app.
- **Android:** emulator plus physical device; at least two Android API levels within declared support; ARM64 at minimum; one device with a different WebView provider/version if available; background playback and scoped-storage denial/approval.
- **All targets:** fresh profile, existing library migration (including a legacy write racing the copy), no network at first launch, interrupted network, unavailable provider, missing/wrong browser handler, denied filesystem permission, app restart, and app upgrade. Verify the local library remains usable when streaming is unavailable and the old source remains recoverable.
- **External handoff acceptance:** test both allowlisted IDs and invalid IDs, arbitrary URL/scheme payloads, launch failure, browser login/session, protected playback where the browser supports it, and returning to the app. Confirm no browser profile or cookie access occurs.

### Phase 1 DRM and provider test record

#### Linux local results — 2026-11-12

| Candidate | Test | Result | Decision |
|---|---|---|---|
| Tauri 2.12.5 + WebKitGTK 2.52.6 | Open YouTube Music and Spotify; inspect `navigator.requestMediaKeySystemAccess`. | Both provider pages finished loading, but the EME function was unavailable. | **Fail** for embedded DRM playback on this Linux runtime. |
| Rust `cef-rs` + CEF 156.0.28 / Chromium 156.0.8078.88 | Build `cefsimple`; open a loopback-only test page; request `com.widevine.alpha` using empty, CENC-only, audio-only, and audio/video configurations. | Build succeeded after using a verified local CEF archive cache. The EME function existed, but all four requests rejected with `NotSupportedError`; no CDM binary appeared in the temporary profile. | **Fail / unresolved** for Widevine. No protected provider playback or real sign-in was attempted. |

CEF proof-of-concept limitations and setup findings:

- The probe used a temporary profile and a `127.0.0.1` page only; it did not open user browser profiles or modify app data.
- It was built with `--no-default-features`, which disables CEF's sandbox in this sample. This was only a local runtime probe; it is **not a production security configuration**.
- The CEF wrapper's automatic index download failed because the current official index response was 10,629,364 bytes and the wrapper's JSON reader rejected content above 10,485,760 bytes. Pinning and preloading the official archive with its SHA-1 verified allowed the Rust example to compile.
- The minimal CEF archive required explicit staging of `icudtl.dat`, `.pak` resources, locales, and `v8_context_snapshot.bin` before the sample launched. Packaging those resources correctly is additional integration work.
- The extracted Linux CEF cache occupied about 1.5 GB. This is not a final package-size measurement, but it shows the runtime-size and release-update costs need evaluation.
- The Rust CEF wrapper lists desktop targets only. A separate Android implementation and independent Android DRM proof remain necessary.

For every OS/runtime/device tuple, record:

1. OS version, CPU/ABI, default browser and version, app build identifier.
2. Provider identifier and the exact fixed destination opened.
3. Whether sign-in and normal/protected playback work in the external browser.
4. Whether returning to the app works and whether local library functions remain available.
5. Missing-handler and malformed-provider error behavior.
6. Security result: no arbitrary URL accepted, no provider page inside Tauri, no browser profile/cookie access.
7. Decision: supported, supported with limitation, or unsupported; owner and fallback.

Never put real passwords, cookies, OAuth tokens, or proprietary DRM binaries in test reports or fixtures.

## 8. Release acceptance criteria

A platform is ready for stable release only when all of the following are true:

- Its build is produced by CI from a tagged source revision and the artifact architecture is verified.
- Install, first launch, upgrade, data migration, uninstall, and rollback are documented and tested.
- All required unit, contract, integration, security, E2E, and platform tests pass; exceptions are written down and approved by maintainers.
- Provider and DRM support claims match the Phase 1 evidence. No feature is advertised as working on a platform where it has not passed.
- No production launch uses `--no-sandbox`; privileged APIs are unavailable to untrusted remote content.
- The package has signing/checksum information, dependency and license notices, release notes, and a support contact path.
- User data remains recoverable; downloads and credentials are not silently deleted or copied insecurely.
- Maintainers can roll back to the previous release without losing the user's library.

## 9. Remaining implementation backlog

Work through these ordered gates; the parenthesized status reflects this migration turn:

1. **Support matrix and behavior baseline** (in progress): document exact target versions and record Linux v1.0.18 critical-flow behavior.
2. **Credential/data inventory** (partially complete): Linux data roots and package identities are recorded; finish classifying every token, settings field, cache, and download location without copying browser state.
3. **Tauri handoff and local-library preview** (build/tests complete; runtime review pending): verify default-handler launch, missing-handler fallback, import UX, and playlist persistence in the packaged Linux preview.
4. **Provider/auth redesign** (preview implemented): remove embedded provider views and cookie/CDP login from the replacement; sign-in stays in the browser profile. Keep legacy Electron behavior only for rollback.
5. **Frontend bridge contract** (pending): specify and test the app API; preserve the Electron adapter until cutover.
6. **Rust workspace integration** (partial): connect the core crate to Tauri library/playlist commands, then add contract tests and remaining settings/media/download services.
7. **Linux parity migration** (partial): complete storage/settings migration, local playback/downloads/MPRIS, idempotent recovery, packaged install/upgrade, and rollback while preserving Electron.
8. **Native app targets** (pending): build Windows and Android Tauri artifacts on supported native toolchains; verify UI, browser handoff, storage, audio lifecycle, signing, and upgrades on each target.
9. **Platform adapters and release pipelines** (pending): implement Windows packaging/media controls and Android storage/Media3 lifecycle against the shared API; only claim features proven on devices.
10. **Release hardening and Electron retirement** (pending): complete security review, SBOM/licenses/signing, staged release, migration, backup and rollback exercise; after all acceptance gates, remove the confirmed legacy app packages while retaining user data.

## 10. Execution log

### 2026-11-12 — Rust core bootstrap

- Added `crates/brave-music-core`, a standalone Rust library foundation for the platform-neutral domain layer.
- Implemented explicit-path `library.json` loading, legacy playlist normalization, unknown-field preservation, opt-in atomic save, playlist mutations, built-in track protection, and deletion intents. Managed file resolution rejects traversal and symlinks escaping the downloads root. Missing data returns an empty document; malformed JSON is returned as an error and left unchanged. The crate does not discover or touch the user's home data.
- File deletion is not performed in the domain layer: it returns filenames for a future platform adapter to apply only after the updated library is saved.
- Added 13 unit tests covering load/round-trip, playlist operations, built-in protections, deletion intents, and safe path resolution. `cargo test --manifest-path crates/brave-music-core/Cargo.toml` passed all 13 tests.
- `cargo fmt --manifest-path crates/brave-music-core/Cargo.toml -- --check` and `cargo clippy --manifest-path crates/brave-music-core/Cargo.toml --all-targets -- -D warnings` passed. At bootstrap time the crate was standalone; it is now used by the Tauri preview commands.

### 2026-11-12 — Linux build and browser gate

- Host: Ubuntu 26.04.1 LTS, x86_64; Rust 1.99.0; Node 20.20.2.
- Installed the Tauri Linux development prerequisites from the official Tauri guide. No Ubuntu release upgrade was run.
- Added and successfully compiled the isolated Tauri 2.12.5 compatibility POC, now located at `tauri-preview/`.
- The POC opened both `https://music.youtube.com/` and `https://open.spotify.com/` as external Tauri webviews over WebKitGTK 2.52.6. Both navigation flows reached `Finished`.
- The runtime probe returned `navigator.requestMediaKeySystemAccess` unavailable in both provider webviews. This is a **Gate 1 failure for embedded Widevine/EME on this Linux Tauri runtime**. The POC is not a replacement build, and the Tauri-only provider-host route is not approved for the current feature set.
- Built the official `cef-rs` `cefsimple` example against CEF 156.0.28 / Chromium 156.0.8078.88 using a hash-verified temporary archive. On a loopback-only page, the EME API existed, but four Widevine key-system configurations all returned `NotSupportedError`; no CDM was installed in the disposable profile. The sample used `--no-default-features`, so it was not a sandbox/security acceptance test. This is **not a replacement build**.
- The CEF wrapper's default CDN-index read failed at 10 MiB; a local CEF archive cache was required. The extracted runtime occupied about 1.5 GB and its resources needed manual staging for the Rust example. The CEF wrapper's published targets do not include Android.
- This machine has Google Chrome and Brave installed, but their presence does not establish that Brave Music can safely control their profiles or redistribute their DRM components.
- Earlier fork feasibility review (superseded): the user briefly selected a Brave/Chromium fork, then rejected that route and requested an alternative. The workstation had 14 GB RAM and about 61 GB free root space versus Chromium's documented 100 GB basic checkout/build requirement. No fork checkout, worker, or Chromium sync was started. Brave source references remain for technical background only.
- Existing production installs remain: system Debian package `brave-music` 1.0.18 under `/opt/brave-music` and the user-level npm package. User data remains in `~/.local/share/brave-music` (~17 MB) and `~/.config/brave-music` (~676 MB, including browser/auth state). No production package or user data has been removed or migrated.

### 2026-11-12 — Alternative strategy and Linux migration preview

- After the user rejected the Brave fork route, selected Rust/Tauri for the trusted local application and the OS default browser for YouTube Music/Spotify. This intentionally leaves provider sign-in, DRM, playback, and provider controls with the browser.
- Reworked `tauri-preview/` from remote provider webviews and injected EME probing into a local-only Tauri preview. Rust maps only `youtube` and `spotify` to fixed HTTPS URLs; the UI has no general URL opener.
- Connected the preview to `brave-music-core` for library reads, playlist create/delete, cover updates, and playlist membership changes, with atomic library persistence.
- Added an explicit Linux library-import action. It rejects malformed input or an existing target, stages an exact backup atomically and verifies it byte-for-byte before writing the new library, and leaves the original library file untouched. It never copies browser auth data or downloaded audio files.
- Added six Tauri tests for fixed provider mapping, unsafe provider rejection, unknown-field preservation, verified legacy import/source preservation, malformed/already-migrated input, and a changed source with an old backup. `cargo test --manifest-path tauri-preview/src-tauri/Cargo.toml` passed all six; formatting, Clippy with warnings denied, debug/release builds, and `node --check tauri-preview/ui/app.js` passed. The core has 14 passing tests, including parsing from a single captured byte snapshot and no-clobber target creation.
- Hardened import against a concurrent legacy write: the backup and imported document now come from the exact same captured source bytes. New library creation uses no-clobber semantics; staged backups are verified byte-for-byte and use owner-only permissions on Linux.
- Configured a Linux `.deb` preview target under package identity `org.codemolabs.bravemusic.preview`, with a distinct app-data location so it can be installed alongside the production package for evaluation.
- The optimized x86_64 release binary is about 16 MB. Its timed 5-second launch stayed running without a startup error; opening a provider and using the migration UI still need interactive verification.
- Built and installed `brave-music-preview` 0.2.0 as a 4.11 MiB amd64 `.deb`; the package identity is separate from production `brave-music` 1.0.18. APT's install simulation predicted one new package and zero removals; both packages are installed. `desktop-file-validate` passed.
- Post-install checks passed: 14 core tests, 6 Tauri tests, frontend `node --check`, and the earlier Clippy run with warnings denied. The installed executable stayed alive through a 5-second launch smoke check. Default-browser opening and the import flow still need interactive verification.
- The preview is not feature-complete: local audio playback, downloads, settings migration, import/export, MPRIS, file dialogs, upgrade/rollback tests, Windows, and Android remain open. No production app or existing user data was altered.
- **UI Design & Native Multi-Webview Parity Milestone (2026-11-12):** Per explicit user requirement to match the exact visual design and feel of the Electron baseline without external browser landing cards or redirect prompts:
  - Replaced the temporary provider landing cards with native child webviews (`yt-webview` and `spotify-webview`) inside the application window at `(0, 58)` beneath the fixed 58px header.
  - Enabled Tauri's `"unstable"` multi-webview capability and configured `main.json` permissions for all windows and webviews.
  - Attached YouTube Music (`https://music.youtube.com`) and Spotify (`https://open.spotify.com`) with Brave Shields preloads (`src/js/webview-shields.js`) and Chrome UA strings directly inside the app.
  - Implemented `switch_tab`, `reload_tab`, and `eval_script` IPC commands to coordinate visibility and lifecycle between child webviews and the offline music library.
  - Synchronized `tauri-preview/ui/styles/main.css` byte-for-byte with `/opt/brave-music/src/styles/main.css`.
  - Rebuilt and verified release package (`Brave Music Preview_0.2.0_amd64.deb`) and placed the release binary in `/home/uzairserver/.cargo/bin/brave-music-linux-preview`, updating the local desktop entry.
- **Verification:** All 14 core tests and 6 preview tests pass; Clippy clean with `-D warnings`; release binary builds cleanly and verified with launch smoke test confirming both child webviews initialize on startup.
- Updated Ubuntu 26.04.1 LTS APT packages with the user's sudo authorization: Chrome `157.0.8103.50` → `157.0.8103.78`, `libmysqlclient24` `8.4.11` → `8.4.13`, `snapd` `2.77.1` → `2.78`, plus the four related distro/software-properties packages. APT simulation reports 0 pending upgrades; no reboot-required marker is present. Refreshed the available Snap app/runtime revisions (Chromium, VS Code, Firefox, GNOME runtime, snapd, and base runtimes). Brave Snap `1.99.55` → `1.99.56` is still pending because Snap refuses to replace the active application while its processes are running; no browser processes were terminated. No distribution release upgrade was performed.
- Production Linux app and both user data roots remain untouched. Do not remove legacy packages until local-library parity, backup/restore, browser handoff, packaged install/upgrade, and rollback pass.

**Next gate:** complete an interactive check for default-browser opening and first-launch library behavior in the installed preview. Refresh the pending Brave Snap after the user closes Brave. Then port local playback/downloads/settings and file dialogs, complete packaged upgrade, migration and rollback checks, and build Windows and Android adapters. Only after cutover acceptance should the old system and npm packages be removed.

## 11. External technical references

- [Tauri 2 overview and supported platforms](https://v2.tauri.app/)
- [Tauri 2 webview engines and version behavior](https://v2.tauri.app/reference/webview-versions/)
- [Tauri distribution](https://v2.tauri.app/distribute/)
- [Tauri opener plugin](https://v2.tauri.app/plugin/opener/)
- [Tauri Content Security Policy](https://v2.tauri.app/security/csp/)
- [Tauri asset protocol scope](https://v2.tauri.app/security/asset-protocol/)
- [Android browser URL intents](https://developer.android.com/guide/components/intents-common#Browser)
- [Tauri Windows WebView2 installer configuration](https://v2.tauri.app/distribute/windows-installer/)
- [Brave Browser source repository and project entry point (reference only; fork not selected)](https://github.com/brave/brave-browser)
- [Brave Linux development environment guide (reference only)](https://github.com/brave/brave-browser/wiki/Linux-Development-Environment)
- [Brave Linux package guide (reference only)](https://github.com/brave/brave-browser/wiki/Linux-packages)
- [Brave Core source and build README](https://github.com/brave/brave-core/blob/master/README.md)
- [Brave Browser build wiki](https://github.com/brave/brave-browser/wiki/)
- [Brave Chromium revision upgrade guidance](https://github.com/brave/brave-core/blob/master/docs/chromium_version_upgrade.md)
- [Brave Browser license](https://github.com/brave/brave-browser/blob/master/LICENSE)
- [Brave Core license](https://github.com/brave/brave-core/blob/master/LICENSE)
- [Rust CEF bindings (`cef-rs`)](https://github.com/tauri-apps/cef-rs)
- [CEF general usage and embedding model](https://github.com/chromiumembedded/cef/blob/master/docs/general_usage.md)
- [CEF Widevine failure report](https://github.com/chromiumembedded/cef/issues/3820)
- [Chromium Linux build requirements and checkout guide](https://chromium.googlesource.com/chromium/src/+/main/docs/linux/build_instructions.md)
- [Brave build internals and source/dependency footprint](https://github.com/brave/brave-browser/wiki/Brave-Browser-Build-Deconstructed-%E2%80%90-overview-of-the-underlying-tools)
- [Brave stable release listing](https://github.com/brave/brave-browser/releases)
- [Brave release schedule](https://github.com/brave/brave-browser/wiki/Brave-Release-Schedule)
- [Brave Widevine component integration](https://github.com/brave/brave-core/blob/master/browser/widevine/widevine_utils.cc)
- [Brave component update service and Widevine](https://github.com/brave/brave-browser/wiki/Brave-Components)
- [Brave build configuration](https://github.com/brave/brave-browser/wiki/Build-configuration)
- [Android DRM playback APIs](https://developer.android.com/media/platform/mediaplayer/drm)
- [Android Media3 background playback](https://developer.android.com/media/media3/session/background-playback)
- [Electron process sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox/)
- [Electron security recommendations](https://www.electronjs.org/docs/latest/tutorial/security/)
