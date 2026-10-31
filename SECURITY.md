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

### Electron Sandboxing and Isolation
- The application runs with `contextIsolation: true` and `nodeIntegration: false`.
- Renderer scripts cannot access the Node.js runtime directly. All inter-process communication occurs over strictly validated channels defined in `preload.js`.

### Widevine Content Decryption Module (CDM)
- Brave Music utilizes CastLabs Electron releases for legal Widevine DRM negotiation.
- Proprietary DRM components are verified via CastLabs authenticated release channels. No modified or unauthorized binary blobs are shipped by this repository.

### Shields Filtering and Script Injection
- Injected cosmetic styles and network block rules in `src/js/webview-shields.js` are strictly scoped to ad and tracker patterns.
- No dynamic code evaluation (`eval()` or external script injection) is permitted inside webview partitions.

### Dependency Auditing
- Continuous automated vulnerability scanning is enforced on all npm packages and native engine shared libraries.
