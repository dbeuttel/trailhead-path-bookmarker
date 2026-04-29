# Trailhead Path Bookmarker

A Windows system-tray app for bookmarking folder paths with quick-action buttons (Explorer, Terminal, Claude, Visual Studio).

Personal utility, Windows-only.

> **Template repo.** This is also the canonical pattern used to bootstrap any new Windows tray app I build. Scaffold a new one via the Claude Code skill `/new-tray-app` (clones this repo, renames everything, optionally reskins, and pushes a fresh GitHub repo). The reusable scaffolding lives in `electron/`, `src/components/{Popup,ConfirmDialog,TabBar}.jsx`, `scripts/generate-icon.js`, and the dark CSS tokens in `src/styles/index.css`. The bookmark/tab/column domain model in `src/components/{Column,BookmarkRow,AddBookmarkForm}.jsx` is Trailhead-specific — strip it when starting a new app.

## Screenshots

_TBD — drop popup + context-menu screenshots in `assets/` and link them here._

## Install / dev / build

```sh
npm install            # also runs `npm run icon` to generate the tray PNG
npm run dev            # Vite (5173) + Electron, hot reload
npm run build          # vite build → dist/
npm run start          # run Electron against built dist/
npm run dist           # build + electron-builder NSIS installer → build/
npm run icon           # regenerate assets/tray-icon.png
```

## Usage

- **Left-click** the tray icon → popup with the bookmark list. Each row shows alias + path + four action buttons and a `⋯` overflow menu (Copy path / Edit / Remove).
- **Right-click** the tray icon → native context menu. Each bookmark is a submenu with the same actions, plus **Browse for folder…** (quick-add via folder picker) and **Manage…** (opens the popup).
- **Pin toggle** in the popup header keeps it open after focus loss; pinned position is persisted across runs.
- **Auto-fitting popup**: width is fixed at 360px; height grows with content from 180px up to a 600px cap, then scrolls internally.

## Action buttons

| Button | Behavior |
|---|---|
| 📁 Explorer | `shell.openPath(path)` |
| `>_` Terminal | `wt.exe -d <path>` (Windows Terminal); falls back to `cmd.exe` on `ENOENT` |
| `C` Claude | `cmd.exe /c start "" /D <path> cmd.exe /K claude` (detached, ignored stdio, unref'd) |
| `VS` Visual Studio | Finds the first `*.sln` in the folder and opens it via shell association — uses whichever VS the user has registered for `.sln`. Disabled with a tooltip when no `.sln` is present. |
| Copy path | `clipboard.writeText(path)` |

## Config file

Persisted to `app.getPath('userData')/config.json`. On Windows that's:

```
%APPDATA%\Trailhead Path Bookmarker\config.json
```

Schema:

```ts
{
  bookmarks: [
    { id: "uuid", alias: "string", path: "string", createdAt: "ISO8601" }
  ],
  pinned: false,
  pinnedBounds?: { x, y },   // remembered drag position when pinned
  popupHeight?: number       // last auto-fit height, clamped 180..600
}
```

## Layout

```
electron/
  main.js          tray + popup window + IPC handlers + context menu
  preload.js       contextBridge → window.bookmarks
  launchers.js     Explorer / Terminal / Claude / Visual Studio / clipboard / folder inspect
src/
  main.jsx, App.jsx
  components/
    Popup.jsx              ResizeObserver auto-fits Electron window height
    BookmarkList.jsx
    BookmarkRow.jsx        view + inline edit, ⋯ menu, VS-disabled-when-no-sln
    AddBookmarkForm.jsx
  styles/index.css
scripts/generate-icon.js   produces assets/tray-icon.png at install time
assets/tray-icon.png       orange folder pictogram, 32×32
```

## Stack

Electron 33, React 18, Vite 5. NSIS installer via `electron-builder` (`appId: com.dbeuttel.trailhead-path-bookmarker`). No native deps.

## Roadmap

Tracked future work, no committed timeline:

- **macOS support** — second-class until I'm dual-booting. Will need a different tray icon (template image / monochrome), `wt.exe` → Terminal.app, `code` path resolution, NSIS → DMG/PKG, `setLoginItemSettings` already cross-platform.
- **Minifier / uglifier on the Electron-side bundle** — Vite already minifies the renderer; the main + preload scripts ship as-is inside the asar. Add a Terser pass (or `javascript-obfuscator`) over `electron/**/*.js` as part of `npm run dist` so the source isn't trivially readable from the install dir.

## Non-goals

- Linux support
- Cloud sync of bookmarks
- Drag-to-reorder
- Tagging or folder grouping

## Why this exists

Sibling utility to [`claude-usage-tray`](../ClaudeTracker) — same window chrome, same dark-theme tokens, same `userData/config.json` persistence pattern, same tray-anchored popup behavior. Where ClaudeTracker is a usage dashboard with a saved-paths side feature, this app makes folder bookmarks the whole point: a fast keyboard-free way to jump from the tray into Explorer, a terminal, Claude, or Visual Studio at a known directory.
