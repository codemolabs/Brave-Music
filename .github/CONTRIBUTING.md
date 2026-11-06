# Contributing to Brave Music

Welcome to the Brave Music developer community governed by **[Codemo Open Source Labs (COSL)](https://github.com/codemolabs)** within the **[Codemo Teams](https://codemoteams.org)** ecosystem.

Brave Music is an open-source, privacy-first desktop music client and native C++ audio engine. We welcome contributions of all sizes, including documentation improvements, bug fixes, automated tests, UI styling refinements, and cross-platform mobile milestone features.

---

## 1. Quick Links to Official Documentation

All comprehensive project guides and architectural specifications are located in the [`docs/`](../docs) folder:

| Guide | Description | Direct Link |
| :--- | :--- | :--- |
| **Contributor Workflow** | Contributor pathways, Android roadmap milestones, and PR standards | [**docs/CONTRIBUTION.md**](../docs/CONTRIBUTION.md) |
| **Developer Guide** | Environment setup, Electron runtime, native C++ audio daemon, and build pipeline | [**docs/DEV-GUIDE.md**](../docs/DEV-GUIDE.md) |
| **Design Specifications** | Fluent UI tokens, color palettes, dark theme specs, and typography | [**docs/DESIGN-GUIDE.md**](../docs/DESIGN-GUIDE.md) |
| **Project Rules & Legal** | Governance, product ownership, licensing terms, and IP compliance | [**docs/RULES.md**](../docs/RULES.md) |
| **Installation & Setup** | Installation via npm, Debian package, and source builds | [**docs/INSTALL.md**](../docs/INSTALL.md) |
| **Changelog & Roadmap** | Release changelogs, binary SHA-256 checksums, and release process | [**docs/RELEASE.md**](../docs/RELEASE.md) |
| **Security Policy** | Vulnerability disclosure channels, sandboxing, and response timelines | [**docs/SECURITY.md**](../docs/SECURITY.md) |
| **Credits & Licenses** | Upstream technologies, dependencies, and core acknowledgments | [**docs/CREDITS.md**](../docs/CREDITS.md) |

---

## 2. Contribution Principles

All contributions must adhere to the three foundational pillars defined in [docs/CONTRIBUTION.md](../docs/CONTRIBUTION.md):

1. **Product Ownership & Authority**: Brave Music is governed by Codemo Open Source Labs (COSL). Contributions are submitted under our project terms where organizational ownership remains with COSL. See [docs/RULES.md](../docs/RULES.md).
2. **Design System Compliance**: All visual changes must match the UI design tokens and Fluent dark styling detailed in [docs/DESIGN-GUIDE.md](../docs/DESIGN-GUIDE.md).
3. **Security & Sandboxing**: Code modifications must preserve Electron process sandboxing, IPC isolation, and CastLabs Widevine CDM integrity as defined in [docs/SECURITY.md](../docs/SECURITY.md).

---

## 3. Contribution Workflow

1. **Check Issues & Discussions**: Before starting major work, check existing [GitHub Issues](https://github.com/codemolabs/Brave-Music/issues) or open a [Discussion](https://github.com/codemolabs/Brave-Music/discussions) to align on scope.
2. **Fork & Branch**: Create a focused feature branch (`feat/your-feature` or `fix/issue-description`).
3. **Develop & Test**: Verify your changes locally using `npm start` and run build tests. See [docs/DEV-GUIDE.md](../docs/DEV-GUIDE.md).
4. **Submit Pull Request**: Open a pull request against the `main` branch. Complete the [Pull Request Template](pull_request_template.md).

---

## 4. Community & Support

- **Discord Server**: [Join COSL Discord](https://discord.gg/wD9d5Er7a)
- **Support Guide**: [SUPPORT.md](SUPPORT.md)
- **Code of Conduct**: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- **Contact**: `cosl@codemoteams.org`
