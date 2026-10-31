# Contributing to Brave Music

Welcome to the Brave Music developer community under Codemo Open Source Labs (Codemo OSL). We build high-performance, ad-free streaming software with local music capabilities for users worldwide.

---

## 1. Project Roadmap: Android and Multi-Platform Target

The current version of Brave Music is stable on Linux desktop. **Our primary engineering target and next milestone is porting and developing Brave Music for Android and other mobile operating systems.**

Developers are encouraged to:
- Build mobile prototypes and native Android shells (using Kotlin, React Native, or Capacitor/Chromium wrappers).
- Adapt the local audio engine (`musikcube`) and background playback services for mobile runtime constraints.
- Optimize touch navigation, background battery drain, and offline caching for mobile devices.

Before initiating major cross-platform architecture changes, open a Discussion or RFC issue to coordinate with Codemo OSL maintainers.

---

## 2. Core Contribution Principles

All contributions must respect three pillars:

1. **Product Ownership**: Brave Music is owned and directed by Codemo OSL. Contributions are submitted under our project rules where organizational ownership and trademark rights stay with Codemo OSL. See `RULES.md` for complete legal definitions.
2. **Design Compliance**: Every interface modification must match the aesthetic standards detailed in `DESIGN-GUIDE.md`. Inconsistent visual styling will not be merged.
3. **Security Standards**: All network requests, DRM hooks, and IPC messages must pass the requirements in `SECURITY.md`. Never introduce unvetted third-party libraries or bypass security sandboxing.
4. **Follow Project Rules**: Always stay focused on the project guidelines. Pull requests that bypass established workflows or fail to adhere to `RULES.md` will be closed.

---

## 3. Contributor Perks and Community Benefits

Active contributors who deliver quality code, resolve issues, or help build the Android target receive exclusive organizational perks:

- **Perks Announcement**: Official perks and rewards for active contributors will be announced inside the **Codemo Teams Discord Server**.
- **Mandatory Requirements to Qualify**:
  1. You must have a registered account on [codemoteams.org](https://codemoteams.org).
  2. You must be an active member in our Discord community. Activity, technical assistance to peers, and code contribution records are tracked to award perks.
- Perks include verified contributor roles, early access to new releases, organization swag, mentorship opportunities from senior engineers, and contributor credentials within the Codemo ecosystem.

---

## 4. Development Workflow and Pull Request Process

Follow these steps to submit contributions:

### Step 1: Fork and Clone
```bash
git clone git@github.com:codemoteams/Brave-Music.git
cd Brave-Music
```

### Step 2: Create a Feature Branch
Use explicit naming conventions:
- `feat/android-audio-service`
- `fix/widevine-playback-linux`
- `refactor/ipc-channels`
- `docs/setup-guide`

```bash
git checkout -b feat/your-feature-name
```

### Step 3: Implement and Test Locally
- Run tests: Verify your code does not break local streaming or offline downloads.
- Check formatting: Ensure clean indentation, zero dead code, and descriptive variable names.
- Verify security: Ensure no tokens, keys, or unsafe flags are added.

### Step 4: Commit with Conventional Format
```bash
git commit -m "feat(android): implement initial background audio interface"
```

### Step 5: Submit Pull Request
Open a PR against the `main` branch of `codemoteams/Brave-Music`. Your PR description must include:
- A clear summary of the changes.
- Which issue it closes or resolves.
- Confirmation that you tested the code locally.
- Confirmation that you reviewed and followed `RULES.md`, `DESIGN-GUIDE.md`, and `SECURITY.md`.
