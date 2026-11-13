# Security Policy

Codemo Open Source Labs (Codemo OSL) takes the security of Brave Music and our users seriously. This document outlines our vulnerability disclosure process and security posture.

---

## 1. Supported Versions

Security updates are applied to the active release stream:

| Version | Supported | Status |
| :--- | :--- | :--- |
| `1.0.x` | Yes | Active Release |
| `< 1.0` | No | Unsupported Development Builds |

---

## 2. Reporting a Vulnerability

If you discover a security vulnerability in Brave Music, please report it responsibly:

- **Email**: Send detailed disclosure reports to `security@codemoteams.org`.
- **Subject Line**: `[SECURITY VULNERABILITY] Brave Music - Component Name`
- **Report Contents**:
  - Clear description of the vulnerability.
  - Step-by-step reproduction instructions or proof of concept.
  - Impact assessment (e.g., remote code execution, IPC escape, data leak).
  - Any proposed remediations.

Do not open public GitHub issues for undisclosed security vulnerabilities. We will acknowledge receipt within 48 hours and work with you on a patch and responsible disclosure timeline.

---

## 3. Core Security Architecture

Brave Music enforces strict security boundaries:

### Native Rust / Tauri & WebKitGTK Isolation (Zero Electron)
- Brave Music runs purely on a compiled Rust backend (`tauri-preview` + `crates/brave-music-core`) and system WebKitGTK 4.1 (`libwebkit2gtk-4.1-0`), completely free of deprecated Electron / Chromium runtime dependencies.
- UI and webview communication uses explicit, typed Tauri IPC commands governed by capability ACLs (`tauri-preview/src-tauri/capabilities/main.json`).
- Network-level and cosmetic ad/tracker filtering in `src/js/webview-shields.js` runs strictly inside player webviews with no arbitrary remote code loading.

### Authentication & Cookie Storage
- Brave Music persists local session metadata (`user_accounts.json`) and imported/session cookies (`ytmusic_session.json`, `spotify_session.json`) in `~/.config/brave-music/` with strict private POSIX permissions (`0700` directory, `0600` files) and atomic writes.
- Under unconfined `.deb`/desktop installs, **Default Browser Sign-In** reads session cookies strictly locally (preferring plaintext Firefox SQLite without storing passwords); inside strict Ubuntu Snap confinement (`core24`), or whenever selected directly, Brave Music provides the isolated **Built-In Secure Sign-In Window** (`auth-window` on native WebKitGTK UA without polyfills) plus Emergency `.json` cookie import.
- All bundled download binaries (`backend/bin/yt-dlp`, `ffmpeg`, `ffprobe`, and optional `node` shim) execute locally inside the app / Snap `core24` sandbox with zero third-party telemetry.

### Dependency Auditing
- Continuous automated cargo & dependency auditing is enforced on all Rust crates and native runtime shared libraries.
