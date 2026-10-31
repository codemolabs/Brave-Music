# Codemo OSL Project Governance and Repository Rules

## 1. Product Ownership and Legal Authority

Brave Music is an open-source product initiated, governed, and managed by Codemo Open Source Labs (Codemo OSL). 

- All repository contents, codebase architecture, core design assets, releases, and distribution packages remain the intellectual property and exclusive product of Codemo OSL.
- The organization (Codemo OSL) retains sole authority to publish, license, re-license, redistribute, and monetize official releases on all application platforms and package repositories.
- Community contributions merged into this codebase grant Codemo OSL a permanent, irrevocable, royalty-free license to use, modify, package, and distribute the contributed code across desktop, mobile, and web targets.
- Forking this repository is permitted under the terms of the GNU General Public License v3.0 (GPL-3.0), provided all original copyright notices, contributor credits, and Codemo OSL ownership statements remain intact. All derivative works and distributed copies must remain open-source under GPL-3.0. Use of the official name "Brave Music" and official Codemo OSL trademarks for independent commercial releases requires prior written authorization.

## 2. Developer Standards and Compliance

Every contributor and core developer must adhere strictly to these non-negotiable standards:

1. **Design System Adherence**: All visual modifications, UI layouts, components, and styling must comply with `DESIGN-GUIDE.md`. Ad-hoc stylesheets and inconsistent component structures will be rejected.
2. **Security Integrity**: No code may disable Chromium sandboxing, bypass IPC isolation boundaries, or compromise Widevine DRM authentication. All changes must pass security reviews outlined in `SECURITY.md`.
3. **No Unsanctioned Telemetry**: The platform does not track personal user data, listening history, or search queries. Contributors must never introduce analytics or external data harvesting scripts.
4. **Clean Code and Maintainability**: All JavaScript, C++ engine hooks, and shell scripts must remain strictly documented, modular, and free of unnecessary bloat or unused dependencies.
5. **No Ad-Bypass Exploits**: Brave Shields rules must rely on declarative blocking and cosmetic DOM filters. No intrusive, unstable, or malicious exploitation methods are permitted.

## 3. Organizational Code of Conduct

Codemo OSL maintains a productive, focused, and professional open-source environment:

- **Constructive Communication**: Feedback in issues, pull requests, and discussions must be direct, technically grounded, and respectful.
- **Focus on Deliverables**: Discussions should center on technical architecture, performance benchmarks, and development milestones.
- **Rule Enforcement**: Submitting pull requests that deliberately ignore project rules, bypass security checklists, or introduce unapproved breaking changes will result in PR closure and potential repository bans.

## 4. Governance and Decision Authority

- Technical steering and architectural decisions are finalized by designated Codemo OSL Maintainers.
- Feature proposals and new target platforms (such as the Android mobile roadmap) require alignment with official roadmap specifications before work begins.
