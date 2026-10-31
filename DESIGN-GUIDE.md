# Design System and UI/UX Guidelines: Brave Music

This guide defines the visual language, design tokens, typography, and component specifications for Brave Music desktop and future mobile targets.

---

## 1. Visual Philosophy

Brave Music delivers a distraction-free, privacy-first audio experience. The visual language adheres to three principles:

- **Ultra-Dark Depth**: Low-emission dark backgrounds that prioritize media artwork and reduce eye strain.
- **Service Neutrality**: Balanced styling that harmonizes YouTube Music, Spotify Web, and local library interfaces under a cohesive shell.
- **Unobtrusive Utility**: Controls, indicators, and status badges remain visible without competing with active media playback.

---

## 2. Color Palette and Design Tokens

All styles must use the standardized color tokens defined below:

| Token Name | Value | Purpose |
| :--- | :--- | :--- |
| `--bg-base` | `#0a0b0e` | Window background and outer frame |
| `--bg-surface` | `#121318` | Navigation bars, cards, and bottom player |
| `--bg-elevated` | `#1a1c23` | Modals, drawers, and active hover states |
| `--border-subtle` | `rgba(255, 255, 255, 0.08)` | Container borders, dividers |
| `--text-primary` | `#ffffff` | Primary headings, active track title |
| `--text-secondary` | `#a0a5b5` | Artist names, subtitles, secondary labels |
| `--text-muted` | `#686d7e` | Timestamps, inactive tabs, captions |
| `--accent-brave` | `#fb542b` | Primary action buttons, shields badge |
| `--accent-spotify` | `#1db954` | Spotify service indicators |
| `--accent-ytm` | `#ff0000` | YouTube Music service indicators |

---

## 3. Typography Standards

The typography balances distinct branding with optimal screen legibility:

### Brand Typography
- **Font Family**: `Ananda Black`
- **Location**: `src/assets/fonts/AnandaBlack.ttf`
- **Usage**: Application logo, main hero banners, and official release headers.

### Interface Typography
- **Font Family**: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, Helvetica, Arial, sans-serif`
- **Hierarchy**:
  - Heading 1: 24px, Bold, letter-spacing -0.5px
  - Heading 2: 18px, Semi-Bold, letter-spacing -0.3px
  - Body Text: 14px, Regular, line-height 1.5
  - Captions / Meta: 12px, Medium, letter-spacing 0.2px

---

## 4. UI Components and Layout

### 1. Top Navigation Bar
- Height: 52px.
- Background: `--bg-surface` with a 1px solid bottom border (`--border-subtle`).
- Contains:
  - App brand mark (`src/assets/app-icon.svg`) and typography.
  - Tab switchers: YouTube Music, Spotify, Local Offline Library, Downloads.
  - Brave Shields status pill (displaying real-time blocked item counter).

### 2. Embedded Service Webviews
- Webviews render in absolute layout filling available viewport height below the navigation header.
- Injected scripts (`src/js/webview-shields.js`) strip banner ads and video overlays without breaking web player media controls.

### 3. Bottom Player Bar
- Height: 72px.
- Sticky position pinned to the bottom of the viewport.
- Left zone: 48x48px track thumbnail, track title (`--text-primary`), artist name (`--text-secondary`).
- Center zone: Play/pause toggle, previous/next buttons, continuous timeline scrubber with duration labels.
- Right zone: Volume slider, download button, repeat/shuffle toggles.

---

## 5. Mobile and Android UI Requirements

As contributors prepare the codebase for the Android milestone, ensure all mobile interfaces follow these conventions:

1. **Bottom Navigation**: Move top tabs to a persistent bottom navigation bar adhering to Android Material 3 specs.
2. **Touch Targets**: All interactive elements must maintain a minimum bounding box of 48x48dp.
3. **Safe Areas**: Provide dynamic padding for device notches, camera punch-holes, and gesture navigation bars.
4. **Offline Indicators**: Distinguish downloaded tracks clearly with an offline badge icon.
