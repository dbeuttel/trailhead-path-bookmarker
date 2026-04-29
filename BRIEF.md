# Folder Bookmark Tray — initial brief

A Windows system tray app for **bookmarking folder paths** with **quick-action buttons**. Spawned as a sibling of `claude-usage-tray` (`E:\Personal Repo\PersonalProjects\ClaudeTracker`) and intended to look and feel similar.

## What it does

A persistent tray icon. Left-click → popup window listing the user's saved folders. Each saved folder is a row with:
- An **alias** (display name) + the underlying path
- A row of **quick-action buttons**, e.g.:
  - **Explorer** — open the folder in File Explorer
  - **Terminal** — open a new Windows Terminal / cmd in that directory
  - **VS Code** — `code <path>`
  - **Claude** — `cmd /K claude` started in that directory (mirrors `launchClaude` in ClaudeTracker)
  - **Copy path** — copy the path string to the clipboard
- An **edit/remove** affordance

Right-click tray menu mirrors the action set: each saved folder appears as a submenu with the same actions, plus "Browse for folder…" and "Manage…".

## Look and feel

Match `claude-usage-tray`:
- **Electron + React + Vite** stack (see its `package.json`, `electron/main.js`, `vite.config.mjs`)
- Frameless, non-resizable popup, tray-anchored (~360px wide), dark theme
- Pin-to-keep-open toggle that persists window position (see `popupWindow.on('moved', ...)` debounce in ClaudeTracker)
- Saved-paths persistence via `app.getPath('userData')/config.json` — same pattern ClaudeTracker uses for `savedPaths`
- IPC architecture: `contextBridge` in `preload.js` exposing `window.bookmarks` (or similar), main-process handlers for folder picker, launcher, clipboard, etc.
- NSIS installer via `electron-builder`

## Reference reading (do this before planning)

Skim these in `E:\Personal Repo\PersonalProjects\ClaudeTracker\` to match conventions:
- `README.md` — project layout summary
- `package.json` — scripts (`dev`, `build`, `dist`), electron-builder config
- `electron/main.js` — tray creation, popup window, context-menu structure, `launchClaude`, `pickFolder`, `add-saved-path` / `remove-saved-path` IPC handlers, config read/write helpers
- `electron/preload.js` — contextBridge surface
- `src/styles/index.css` — color tokens, popup chrome, button styles (dark theme baseline)
- `src/components/` — popup layout, list-row composition (especially how ChatList renders detail rows with action buttons)

## Non-goals (v1)

- macOS / Linux support
- Cloud sync of bookmarks
- Tagging / folder grouping
- Drag-to-reorder (nice-to-have, not required v1)

## What I want from you next

Produce a step-by-step plan that:
1. Confirms the directory layout (mirroring ClaudeTracker's structure)
2. Lists the IPC surface with handler signatures
3. Describes the config schema (saved bookmarks shape)
4. Outlines components and their props
5. Calls out anything you want to deviate from ClaudeTracker's patterns and why

Don't write code yet — plan first.
