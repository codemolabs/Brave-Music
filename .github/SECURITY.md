# Security Policy

Codemo Open Source Labs (COSL) takes security, user privacy, and system safety seriously. We appreciate the responsible disclosure of security vulnerabilities by researchers and contributors.

---

## 1. Supported Versions

Security updates are actively applied to the current release stream of Brave Music:

| Version | Supported | Status |
| :--- | :---: | :--- |
| `1.0.x` | :white_check_mark: Yes | Active Release |
| `< 1.0` | :x: No | Unsupported Development Builds |

---

## 2. Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues or public discussions.**

If you discover a security vulnerability in Brave Music:

1. **Email:** Send a detailed report to **[security@codemoteams.org](mailto:security@codemoteams.org)** and CC **[cosl@codemoteams.org](mailto:cosl@codemoteams.org)**.
2. **Subject line:** Use the format `[SECURITY] Brave Music - <Brief Description>`.
3. **Report contents:**
   - Affected version, commit hash, and operating system (Linux / Windows).
   - Clear description of the vulnerability and its potential impact.
   - Step-by-step reproduction instructions or a minimal proof of concept (PoC).
   - Any suggested mitigations or remediation steps, if known.

---

## 3. Vulnerability Response Timeline

- **Initial Acknowledgment:** Within **48 hours** of receiving your report.
- **Triage & Assessment:** Within **5 business days**, validating the issue and determining severity.
- **Resolution & Release:** We aim to release a patch and coordinated advisory typically within **30 days** depending on complexity.

We ask reporters to maintain confidentiality until a patch has been released and coordinated public disclosure is agreed upon.

---

## 4. Architectural Security Guidelines

Brave Music enforces strict security boundaries including Electron process sandboxing, IPC isolation, CastLabs Widevine CDM verification, and declarative Shields ad-blocking filters.

For detailed architectural security specifications and technical implementation guidelines, see:
- [**docs/SECURITY.md**](../docs/SECURITY.md)
- [**Full Security Architecture on GitHub**](https://github.com/codemolabs/Brave-Music/blob/main/docs/SECURITY.md)

---

## 5. Educational & Safe Harbor Principles

COSL operates under safe harbor principles: we will not pursue legal action against researchers who discover and report vulnerabilities in good faith in compliance with this policy and without causing disruption, service outages, or data loss.
