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

All styles must use the standardized color tokens defined in `src/styles/main.css`:

| Token Name | Value | Purpose |
| :--- | :--- | :--- |
| `--bg-base` | `#07080c` | Window background and outer frame |
| `--bg-surface` | `#0e1017` | Navigation bars, cards, and bottom player |
| `--bg-surface-elevated` | `#151822` | Modals, drawers, and active surface elevation |
| `--bg-surface-hover` | `#1b1f2d` | Interactive hover surfaces |
| `--bg-card` | `#12141c` | Library & collection cards |
| `--border-subtle` | `rgba(255, 255, 255, 0.07)` | Container borders, dividers |
| `--text-main` | `#f0f2f7` | Primary headings, active track title |
| `--text-secondary` | `#8e97ab` | Artist names, subtitles, secondary labels |
| `--text-muted` | `#575f73` | Timestamps, inactive tabs, captions |
| `--accent-brave` | `#fb542b` | Primary action buttons, shields badge, MP3 badge accent |
| `--accent-spotify` | `#1ed760` | Spotify service indicators and collection source pills |
| `--accent-yt` | `#ff0033` | YouTube Music service indicators and collection source pills |

---

## 3. Typography Standards

The typography balances distinct branding with optimal screen legibility:

### Brand Typography
- **Font Family**: `AnandaBlack`
- **Location**: `src/assets/fonts/AnandaBlack.ttf`
- **Usage**: Center header brand pill (`Brave Music`), hero branding, and official release banners.

### Interface Typography
- **Font Family**: `'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` (14px root scale)
- **Hierarchy**:
  - Heading 1: 24px, Bold (`700`), letter-spacing `-0.5px`
  - Heading 2: 18px, Semi-Bold (`600`), letter-spacing `-0.3px`
  - Body Text: 14px, Regular (`400`), line-height `1.5`
  - Captions / Meta / Format Badges: 11–12px, Semi-Bold/Medium (`600`), tabular spacing

---

## 4. UI Components and Layout

### 1. Top Navigation Bar
- Height: `58px` (`--bg-surface` with `1px solid var(--border-subtle)` bottom divider).
- Left Zone: History back/forward/reload navigation buttons and dynamic expanding pill tabs (`YouTube Music`, `Spotify`, `Downloads & Library` with live track counter pill).
- Center Zone: Centered brand wordmark pill (`AnandaBlack`).
- Right Zone: Brave Shields blocker pill, Profile Account Sync button (`btn-auth-sync`), and Information modal trigger.

### 2. Embedded Service Webviews
- Webviews (`#yt-webview`, `#spotify-webview` or Tauri native overlays) fill available viewport height below the top header inside `.app-main`.
- Injected cosmetic scripts (`src/js/webview-shields.js`) use a 350ms debounced DOM scan (`scheduleScan()`) so native scrolling remains silky-smooth without frame drops.

### 3. Downloads, Music Library & Collections Presentation
- **Quick Download Bar**: URL input auto-detects Spotify playlists, Personalized Mixes, Albums, Artists, and YouTube Playlists/Mixes (`?list=`), automatically switching to `Full Playlist` mode with format selection (`Audio: MP3 (320k Best)` default, `FLAC`, `M4A`, `Video MP4/720p`).
- **Music Library Table**: Displays sequential track numbering, artwork thumbnail, audio format badge (`MP3`, `FLAC`, `M4A`, `VIDEO`) with bitrate/file-size tooltips, clickable collection links, selection batch-delete bar, and instant OneUI playback triggers.
- **Collections Bento Grid**: Responsive card grid (`minmax(220px, 1fr)`) displaying 2x2 collage artwork when collections have multiple unique track covers, provider source pill (`Spotify` / `YouTube` / `Collection`), total track count, duration, dominant format summary, and a **Playlist Detail Modal** preserving exact `1..N` provider track order.

### 4. Bottom Player Bar
- Height: `66px`, pinned persistently to the bottom of the viewport with zero heavy backdrop blur overhead.
- Left zone: Artwork thumbnail, track title (`--text-main`), artist subtitle (`--text-secondary`).
- Center zone: Play/pause, previous/next (strictly scoped to active player source), continuous seekbar, elapsed & total time labels.
- Right zone: Vertical volume popover, loop/repeat mode toggle, shuffle mode toggle.

---

## 5. Mobile and Android UI Requirements

As contributors prepare the codebase for the Android milestone, ensure all mobile interfaces follow these conventions:

1. **Bottom Navigation**: Move top tabs to a persistent bottom navigation bar adhering to Android Material 3 specs.
2. **Touch Targets**: All interactive elements must maintain a minimum bounding box of 48x48dp.
3. **Safe Areas**: Provide dynamic padding for device notches, camera punch-holes, and gesture navigation bars.
4. **Offline Indicators**: Distinguish downloaded tracks clearly with an offline badge icon.
