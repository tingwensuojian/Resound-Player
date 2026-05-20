# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Dev server (web only, requires API)
npm run dev:web:full    # Full stack: API + unblock + Vite on port 5173

# Dev server (web only, no API)
npm run dev:web         # Vite dev server only

# Desktop (electron)
npm run dev:desktop     # Vite + Electron
npm run build:desktop   # Build for desktop
npm run build:web       # Build web version only

# Unblock music sources
npm run dev:unblock         # Run unblock server on port 38762
npm run dev:unblock-match   # Run match server on port 38763
```

## Project Architecture

### Tech Stack
- **Frontend**: Vue 3 `<script setup lang="ts">` SFCs, Vite
- **Styling**: Plain CSS (no preprocessor), scoped styles per component, global styles in `src/styles/`
- **State**: Vue `reactive()` singletons (no Pinia)
- **API**: NeteaseCloudMusicApi enhanced backend

### Source Structure
```
src/
  stores/          # Reactive state singletons
    player.ts      # Core player state (currentTrack, isPlaying, playlist, seek, volume)
    lyricsSettings.ts  # Lyrics display settings (persisted to localStorage)
    user.ts        # User/auth state
    ui.ts          # UI state (sidebar, theme)
    unblock-cache.ts  # Unblock source cache (Map + localStorage, 200 max, 10min TTL)
  composables/     # Vue composables
    useLyrics.ts   # Lyric parsing (LRC/YRC), timeline tracking, scroll anchoring
    useAmllAdapter.ts  # AMLL lyric format adapter
    useIridescence.ts / useThreeScene.ts / usePaperShaders.ts / etc. # Background effects
  components/
    PlayerBar.vue          # Bottom mini player bar
    PlayerExpanded.vue     # Full-screen expanded player (cover/record/fullscreen modes)
    LyricsPanel.vue        # Lyrics display (custom + AMLL renderer switching)
    LyricsSettingsPanel.vue # Lyrics settings popover
    ui/                    # Reusable UI components (FancySwitch, StepSliderRow, RadioRow, etc.)
  styles/
    theme.css         # Design tokens, light/dark theme, glass system (~1186 lines)
    animations.css    # Entrance animations, hover-scale system, cover keyframes
    detail-page.css   # Detail page layout
  api/
    music.ts          # Music API calls (lyric, song detail, playlist, etc.)
    auth.ts           # Authentication
    client.ts         # Axios instance with proxy
```

### Stores
All stores are module-level `reactive()` singletons, not Pinia stores. They are imported directly:
```ts
import { playerStore } from '../stores/player';
import { lyricsSettings } from '../stores/lyricsSettings';
```

### Display Modes (PlayerExpanded.vue)
Three cover display modes controlled by `lyricsSettings.displayMode`:
- `cover` — Rectangular album cover on left, lyrics on right (2-column grid)
- `record` — Vinyl record with spinning disc + tonearm on left, lyrics on right
- `fullscreen` — Cover as full-height background layer on left 60vw, lyrics full-width

Key settings affecting layout:
- `showCover` — Show/hide the left zone (cover/record)
- `showLyrics` — Show/hide the lyrics panel
- `showMiniBar` — Use floating bottom control bar vs controls in left zone
- `centerAlign` — Toggle lyrics text alignment (centered vs left-aligned)
- `contentWidth` — Left/right column ratio (30-70%)

### Lyrics Rendering
Two renderers coexist, toggled by `useAmllRenderer`:
1. **Custom renderer** — DOM-based, scrollable `.lyric-box` with `overflow-y: auto`
2. **AMLL renderer** — `@applemusic-like-lyrics/vue` LyricPlayer component (canvas/DOM hybrid)

Both are layered in `.renderer-stack` with `v-show` to keep both mounted.

### Lyric Scroll Behavior
- `isHovering` — Mouse enters lyrics area → removes blur on all lines
- `isUserScrolling` — Scroll/wheel/touch on lyrics → pauses auto-follow for 3s, then scrolls to current line
- `seekToLine` — Clicking a line seeks audio and resets scrolling state

### API Server
Requires `@neteasecloudmusicapienhanced` running on port 38761. Development proxy via `VITE_API_PROXY_TARGET`. Unblock music sources run on ports 38762 (unblock server) and 38763 (match server).

### Local Music (Desktop Only)
- **Storage**: SQLite file (`local-music.sqlite`) via `sql.js` WASM engine — zero native dependencies
- **Scanner** (`electron/services/scanner/NodeMusicScanner.js`):
  - Recursively collects supported audio files (mp3/flac/wav/ogg/m4a/aac/wma/ape/dsf/opus/aiff/alac)
  - Reports progress during file collection phase (important for 10k+ file directories)
  - Parallel parsing with `music-metadata`, batches of 20 tracks per IPC yield
- **Playback**: Local files are read via IPC (`local:read-file`) and converted to blob URLs, avoiding `local://` protocol CORS issues
- **Song List** (`src/components/VirtualSongList.vue`):
  - Custom virtual scroll implementation (no external library), fixed row height 68px
  - Container height measured via `ResizeObserver`, visible range calculated from `scrollTop`
  - 15-row overscan for smooth scrolling
  - Supports selection mode, context menu, sort-by columns
  - 3-column layout matching PlaylistDetailPage (idx/play-pause, 52px cover, meta)
  - Inline PlayPause with index display, play/pause SVG, and 3-bar wave animation
- **IPC Handlers** (`electron/services/ipc/localMusicIpc.js`): scan, CRUD tracks, playlist management, file I/O (lyric/cover/read)

## Key Patterns

### CSS Variables for Covers
All cover hover scales use `--image-hover-scale` from `animations.css`. Never define cover hover values in component scoped CSS. Never use `[class*='cover']` wildcard selectors.

### Persisted Settings
`lyricsSettings` is persisted to localStorage key `gm_lyrics_settings_v1`. The reactive object has a `.save()` method. Defaults are applied on first load or when fields are missing.

### Palette Extraction
`PlayerExpanded.vue` extracts a 4-color palette from the current track's cover art using a 56x56 canvas. The palette drives the background gradient (`c1`–`c4`) and accent color (`c3`).

### Unblock Music Source Matching
- `server/unblock-match-server.mjs` uses `Promise.any` to race multiple sources
- `src/stores/unblock-cache.ts` caches results in Map + localStorage
- `src/config/musicSources.ts` registers sources with metadata
