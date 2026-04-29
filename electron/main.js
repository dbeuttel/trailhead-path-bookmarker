const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const launchers = require('./launchers');

// 60% of the original 360px slot, rounded to a clean number.
const POPUP_COLUMN_WIDTH = 216;
const POPUP_MIN_WIDTH = POPUP_COLUMN_WIDTH;
const POPUP_MIN_HEIGHT = 180;
const POPUP_MAX_HEIGHT = 600;
const POPUP_DEFAULT_HEIGHT = 360;
const DEV_URL = 'http://localhost:5174';
const isDev = !app.isPackaged;

let tray = null;
let popupWindow = null;
let configCache = null;
let pinned = false;
let saveBoundsDebounce = null;

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function readConfig() {
  if (configCache) return configCache;
  try {
    configCache = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch {
    configCache = {};
  }
  return configCache;
}

function writeConfig(patch) {
  const next = { ...readConfig(), ...patch };
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(next, null, 2));
  configCache = next;
  return next;
}

function getIconPath() {
  return path.join(__dirname, '..', 'assets', 'tray-icon.png');
}

function getTabs() {
  const cfg = readConfig();
  return Array.isArray(cfg.tabs) ? cfg.tabs.filter((t) => t && t.id && t.name) : [];
}

function getColumns() {
  const cfg = readConfig();
  return Array.isArray(cfg.columns) ? cfg.columns.filter((c) => c && c.id && c.name) : [];
}

function getBookmarks() {
  const cfg = readConfig();
  return Array.isArray(cfg.bookmarks) ? cfg.bookmarks.filter((b) => b && b.id && b.alias && b.path) : [];
}

function getActiveTabId() {
  const cfg = readConfig();
  const tabs = getTabs();
  if (!tabs.length) return null;
  const stored = cfg.activeTabId;
  if (stored && tabs.find((t) => t.id === stored)) return stored;
  return tabs[0].id;
}

// Per-button visibility for the row action bar. Defaults to true so existing
// installs see no behavior change.
function getButtonVisibility() {
  const cfg = readConfig();
  const v = cfg.buttonVisibility || {};
  return {
    claude: v.claude !== false,
    terminal: v.terminal !== false,
    redeploy: v.redeploy !== false,
  };
}

// Default-on autostart. Honor an explicit `false` so users can opt out.
function getAutoStart() {
  const cfg = readConfig();
  return cfg.autoStart !== false;
}

// Sync the OS login-item state to config. Skipped in dev so the running
// devtools/electron build never gets registered against Windows logon.
function applyAutoStart() {
  if (process.platform !== 'win32') return;
  if (isDev) return;
  try {
    app.setLoginItemSettings({
      openAtLogin: getAutoStart(),
      // Hide the popup window on auto-launch — the app is tray-resident.
      args: ['--hidden'],
    });
  } catch {
    // Setting login items can fail under restricted policies; ignore so the
    // app still launches even if startup registration is blocked.
  }
}

// One-time migration when loading older configs:
// 1. Ensure `columns` and `tabs` are arrays.
// 2. If bookmarks exist but no columns, create a default "Bookmarks" column
//    and assign every existing bookmark to it.
// 3. Reassign any orphan bookmarks (referencing a missing columnId) to the
//    first column.
// 4. If columns exist but no tabs, create a default "Main" tab and assign
//    every existing column to it.
// 5. Reassign any orphan columns (referencing a missing tabId) to the first
//    tab.
function migrateConfigIfNeeded() {
  const cfg = readConfig();
  let mutated = false;
  let columns = Array.isArray(cfg.columns) ? cfg.columns.slice() : [];
  let bookmarks = Array.isArray(cfg.bookmarks) ? cfg.bookmarks.slice() : [];
  let tabs = Array.isArray(cfg.tabs) ? cfg.tabs.slice() : [];
  let activeTabId = cfg.activeTabId;

  if (!Array.isArray(cfg.columns)) mutated = true;
  if (!Array.isArray(cfg.tabs)) mutated = true;

  if (bookmarks.length > 0 && columns.length === 0) {
    const defaultCol = { id: crypto.randomUUID(), name: 'Bookmarks' };
    columns = [defaultCol];
    bookmarks = bookmarks.map((b) => (b && !b.columnId ? { ...b, columnId: defaultCol.id } : b));
    mutated = true;
  } else if (bookmarks.length > 0 && columns.length > 0) {
    const validIds = new Set(columns.map((c) => c.id));
    const firstId = columns[0].id;
    bookmarks = bookmarks.map((b) => {
      if (!b) return b;
      if (!b.columnId || !validIds.has(b.columnId)) {
        mutated = true;
        return { ...b, columnId: firstId };
      }
      return b;
    });
  }

  if (columns.length > 0 && tabs.length === 0) {
    const defaultTab = { id: crypto.randomUUID(), name: 'Main' };
    tabs = [defaultTab];
    columns = columns.map((c) => (c && !c.tabId ? { ...c, tabId: defaultTab.id } : c));
    activeTabId = defaultTab.id;
    mutated = true;
  } else if (columns.length > 0 && tabs.length > 0) {
    const validTabIds = new Set(tabs.map((t) => t.id));
    const firstTabId = tabs[0].id;
    columns = columns.map((c) => {
      if (!c) return c;
      if (!c.tabId || !validTabIds.has(c.tabId)) {
        mutated = true;
        return { ...c, tabId: firstTabId };
      }
      return c;
    });
    if (!activeTabId || !validTabIds.has(activeTabId)) {
      activeTabId = firstTabId;
      mutated = true;
    }
  }

  if (mutated) writeConfig({ columns, bookmarks, tabs, activeTabId });
}

function getCurrentHeight() {
  const cfg = readConfig();
  const stored = Number(cfg.popupHeight);
  if (Number.isFinite(stored) && stored > 0) {
    return Math.max(POPUP_MIN_HEIGHT, Math.min(POPUP_MAX_HEIGHT, stored));
  }
  return POPUP_DEFAULT_HEIGHT;
}

// Cap the popup width at the screen's work area minus a small margin so it
// never overflows. With many columns the user gets internal horizontal
// scroll instead of the window pushing off-screen.
function getMaxWidth() {
  try {
    return Math.max(POPUP_MIN_WIDTH, screen.getPrimaryDisplay().workArea.width - 8);
  } catch {
    return POPUP_MIN_WIDTH * 6;
  }
}

function getCurrentWidth() {
  const cfg = readConfig();
  const stored = Number(cfg.popupWidth);
  const max = getMaxWidth();
  if (Number.isFinite(stored) && stored > 0) {
    return Math.max(POPUP_MIN_WIDTH, Math.min(max, stored));
  }
  return POPUP_COLUMN_WIDTH;
}

function createPopupWindow() {
  popupWindow = new BrowserWindow({
    width: getCurrentWidth(),
    height: getCurrentHeight(),
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    popupWindow.loadURL(DEV_URL);
  } else {
    popupWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  popupWindow.on('blur', () => {
    if (pinned) return;
    if (!popupWindow.webContents.isDevToolsOpened()) popupWindow.hide();
  });

  popupWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      popupWindow.hide();
    }
  });

  // Persist drag position only when pinned. 300ms debounce because Electron
  // fires 'moved' on every pixel during a drag — writing config that often
  // would thrash the disk and produce a stale position if the drag is
  // interrupted mid-flight.
  popupWindow.on('moved', () => {
    if (!pinned) return;
    if (saveBoundsDebounce) clearTimeout(saveBoundsDebounce);
    saveBoundsDebounce = setTimeout(() => {
      const b = popupWindow.getBounds();
      writeConfig({ pinnedBounds: { x: b.x, y: b.y } });
    }, 300);
  });
}

function positionPopup() {
  const trayBounds = tray.getBounds();
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
  const workArea = display.workArea;
  const width = getCurrentWidth();
  const height = getCurrentHeight();
  let x = Math.round(trayBounds.x + trayBounds.width / 2 - width / 2);
  let y = Math.round(trayBounds.y - height - 8);
  x = Math.max(workArea.x + 4, Math.min(x, workArea.x + workArea.width - width - 4));
  if (y < workArea.y + 4) y = trayBounds.y + trayBounds.height + 4;
  popupWindow.setBounds({ x, y, width, height });
}

function togglePopup() {
  if (!popupWindow) return;
  if (popupWindow.isVisible()) {
    popupWindow.hide();
  } else {
    if (pinned) {
      const saved = readConfig().pinnedBounds;
      const width = getCurrentWidth();
      const height = getCurrentHeight();
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
        popupWindow.setBounds({ x: saved.x, y: saved.y, width, height });
      } else {
        positionPopup();
      }
    } else {
      positionPopup();
    }
    popupWindow.show();
    popupWindow.focus();
    // Tell the renderer to re-inspect folders. Rows mount once and stay
    // mounted while the window is hidden, so without this the redeploy/sln
    // detection won't notice files added between popup opens.
    if (popupWindow.webContents) popupWindow.webContents.send('popup-shown');
  }
}

function truncatePath(p) {
  if (!p) return '';
  if (p.length <= 38) return p;
  return p.slice(0, 18) + '…' + p.slice(-18);
}

function broadcastConfig() {
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.webContents.send('config-updated', {
      tabs: getTabs(),
      columns: getColumns(),
      bookmarks: getBookmarks(),
      activeTabId: getActiveTabId(),
      buttonVisibility: getButtonVisibility(),
      autoStart: getAutoStart(),
    });
  }
}

function buildContextMenu() {
  const bookmarks = getBookmarks();
  const items = [
    { label: 'Open', click: togglePopup },
    { type: 'separator' },
  ];

  if (bookmarks.length === 0) {
    items.push({ label: 'No bookmarks yet', enabled: false });
  } else {
    for (const b of bookmarks) {
      const inspected = launchers.inspectFolder(b.path);
      const submenu = [
        { label: 'Open in Explorer', click: () => launchers.openInExplorer(b.path) },
        {
          label: 'Open Terminal here',
          click: () => launchers.openTerminal({ targetPath: b.path, alias: b.alias, color: b.color }),
        },
      ];
      // Network shares hide Claude / VS — neither is meaningful there.
      if (!inspected.isNetwork) {
        submenu.push({
          label: 'Open Claude here',
          click: () => launchers.openClaude({ targetPath: b.path, alias: b.alias, color: b.color }),
        });
        submenu.push({
          label: inspected.slnPath ? 'Open in Visual Studio' : 'Open in Visual Studio (no .sln)',
          enabled: !!inspected.slnPath,
          click: () => launchers.openVisualStudio(b.path),
        });
      }
      if (inspected.redeployPath && !b.hideDeploy) {
        submenu.push({
          label: 'Run 1ReDeploy.bat',
          click: () => launchers.runRedeploy(b.path),
        });
      }
      submenu.push({ type: 'separator' });
      submenu.push({ label: 'Copy path', click: () => launchers.copyPath(b.path) });
      items.push({
        label: `${b.alias}  —  ${truncatePath(b.path)}`,
        submenu,
      });
    }
  }

  items.push({ type: 'separator' });
  items.push({
    label: 'Browse for folder…',
    click: async () => {
      const picked = await launchers.pickFolder();
      if (!picked) return;
      const alias = lastSegment(picked);
      addBookmarkInternal({ alias, path: picked });
    },
  });
  items.push({
    label: 'Manage…',
    click: () => {
      if (!popupWindow.isVisible()) togglePopup();
    },
  });
  items.push({ type: 'separator' });
  items.push({
    label: 'Quit',
    click: () => {
      app.isQuitting = true;
      app.quit();
    },
  });

  return Menu.buildFromTemplate(items);
}

function rebuildContextMenu() {
  if (tray) tray.setContextMenu(buildContextMenu());
}

function lastSegment(p) {
  if (!p) return '';
  const parts = p.replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || p;
}

// Internal helper used by both the tray "Browse for folder…" item and the
// add-bookmark IPC handler so they share creation logic.
function addBookmarkInternal({ id, alias, path: pathValue, color, columnId, hideDeploy }) {
  if (!alias || !pathValue) return getBookmarks();
  const cleanColor = (typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)) ? color : null;
  // Treat undefined as "don't touch" (so add-without-flag preserves prior value
  // on edit). Only true / false explicitly modify the field.
  const cleanHideDeploy = typeof hideDeploy === 'boolean' ? hideDeploy : undefined;
  const cfg = readConfig();
  const cols = Array.isArray(cfg.columns) ? cfg.columns : [];
  const tabs = Array.isArray(cfg.tabs) ? cfg.tabs : [];
  let firstColId = cols.length > 0 ? cols[0].id : null;

  // Auto-create a "Main" tab + "Bookmarks" column if none exist yet so new
  // entries always have somewhere to live.
  let columnsToWrite = null;
  let tabsToWrite = null;
  let activeTabIdToWrite = null;
  let firstTabId = tabs.length > 0 ? tabs[0].id : null;
  if (!firstTabId) {
    const defaultTab = { id: crypto.randomUUID(), name: 'Main' };
    tabsToWrite = [defaultTab];
    firstTabId = defaultTab.id;
    activeTabIdToWrite = defaultTab.id;
  }
  if (!firstColId) {
    const defaultCol = { id: crypto.randomUUID(), name: 'Bookmarks', tabId: firstTabId };
    columnsToWrite = [defaultCol];
    firstColId = defaultCol.id;
  }

  const finalColId = columnId && cols.find((c) => c.id === columnId) ? columnId : firstColId;
  const list = Array.isArray(cfg.bookmarks) ? cfg.bookmarks.slice() : [];

  if (id) {
    const idx = list.findIndex((b) => b && b.id === id);
    if (idx >= 0) {
      const merged = { ...list[idx], alias, path: pathValue };
      if (cleanColor) merged.color = cleanColor; else delete merged.color;
      // Only overwrite columnId when the caller explicitly supplied one.
      if (columnId !== undefined) merged.columnId = finalColId;
      if (cleanHideDeploy === true) merged.hideDeploy = true;
      else if (cleanHideDeploy === false) delete merged.hideDeploy;
      list[idx] = merged;
    } else {
      const entry = {
        id, alias, path: pathValue,
        createdAt: new Date().toISOString(),
        columnId: finalColId,
      };
      if (cleanColor) entry.color = cleanColor;
      if (cleanHideDeploy === true) entry.hideDeploy = true;
      list.push(entry);
    }
  } else {
    const entry = {
      id: crypto.randomUUID(),
      alias,
      path: pathValue,
      createdAt: new Date().toISOString(),
      columnId: finalColId,
    };
    if (cleanColor) entry.color = cleanColor;
    if (cleanHideDeploy === true) entry.hideDeploy = true;
    list.push(entry);
  }

  const patch = { bookmarks: list };
  if (columnsToWrite) patch.columns = columnsToWrite;
  if (tabsToWrite) patch.tabs = tabsToWrite;
  if (activeTabIdToWrite) patch.activeTabId = activeTabIdToWrite;
  writeConfig(patch);
  rebuildContextMenu();
  broadcastConfig();
  return getBookmarks();
}

function createTray() {
  const image = nativeImage.createFromPath(getIconPath());
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip('Trailhead Path Bookmarker');
  tray.setContextMenu(buildContextMenu());
  tray.on('click', togglePopup);
}

// ---- IPC handlers ----

ipcMain.handle('get-config', () => {
  const cfg = readConfig();
  return {
    ...cfg,
    tabs: getTabs(),
    columns: getColumns(),
    bookmarks: getBookmarks(),
    activeTabId: getActiveTabId(),
    buttonVisibility: getButtonVisibility(),
    autoStart: getAutoStart(),
  };
});

ipcMain.handle('set-auto-start', (_event, value) => {
  const next = !!value;
  writeConfig({ autoStart: next });
  applyAutoStart();
  broadcastConfig();
  return getAutoStart();
});

ipcMain.handle('set-button-visibility', (_event, payload) => {
  if (!payload || typeof payload !== 'object') return getButtonVisibility();
  const current = getButtonVisibility();
  const next = {
    claude: typeof payload.claude === 'boolean' ? payload.claude : current.claude,
    terminal: typeof payload.terminal === 'boolean' ? payload.terminal : current.terminal,
    redeploy: typeof payload.redeploy === 'boolean' ? payload.redeploy : current.redeploy,
  };
  writeConfig({ buttonVisibility: next });
  broadcastConfig();
  return getButtonVisibility();
});

ipcMain.handle('set-config', (_event, patch) => {
  return writeConfig(patch || {});
});

ipcMain.handle('add-bookmark', (_event, payload) => {
  if (!payload) return getBookmarks();
  return addBookmarkInternal(payload);
});

ipcMain.handle('remove-bookmark', (_event, id) => {
  const cfg = readConfig();
  const list = (cfg.bookmarks || []).filter((b) => b && b.id !== id);
  writeConfig({ bookmarks: list });
  rebuildContextMenu();
  broadcastConfig();
  return getBookmarks();
});

ipcMain.handle('reorder-bookmarks', (_event, ids) => {
  if (!Array.isArray(ids)) return getBookmarks();
  const current = getBookmarks();
  const byId = new Map(current.map((b) => [b.id, b]));
  const reordered = ids.map((id) => byId.get(id)).filter(Boolean);
  for (const b of current) if (!ids.includes(b.id)) reordered.push(b);
  writeConfig({ bookmarks: reordered });
  rebuildContextMenu();
  broadcastConfig();
  return getBookmarks();
});

ipcMain.handle('add-column', (_event, payload) => {
  const name = payload && typeof payload.name === 'string' ? payload.name.trim() : '';
  if (!name) return getColumns();
  const cfg = readConfig();
  const cols = Array.isArray(cfg.columns) ? cfg.columns.slice() : [];
  const tabs = Array.isArray(cfg.tabs) ? cfg.tabs.slice() : [];
  const patch = {};
  // Auto-create a tab if none exists yet so the new column has a parent.
  let tabId = payload && typeof payload.tabId === 'string' ? payload.tabId : null;
  if (!tabId || !tabs.find((t) => t.id === tabId)) tabId = getActiveTabId();
  if (!tabId) {
    const defaultTab = { id: crypto.randomUUID(), name: 'Main' };
    tabs.push(defaultTab);
    tabId = defaultTab.id;
    patch.tabs = tabs;
    patch.activeTabId = defaultTab.id;
  }
  cols.push({ id: crypto.randomUUID(), name, tabId });
  patch.columns = cols;
  writeConfig(patch);
  rebuildContextMenu();
  broadcastConfig();
  return getColumns();
});

ipcMain.handle('rename-column', (_event, payload) => {
  const id = payload && payload.id;
  const name = payload && typeof payload.name === 'string' ? payload.name.trim() : '';
  if (!id || !name) return getColumns();
  const cfg = readConfig();
  const cols = (cfg.columns || []).map((c) => (c.id === id ? { ...c, name } : c));
  writeConfig({ columns: cols });
  rebuildContextMenu();
  broadcastConfig();
  return getColumns();
});

ipcMain.handle('remove-column', (_event, payload) => {
  const id = payload && payload.id;
  const reassignTo = payload && payload.reassignTo;
  if (!id) return { columns: getColumns(), bookmarks: getBookmarks() };
  const cfg = readConfig();
  const cols = (cfg.columns || []).filter((c) => c.id !== id);
  let bookmarks = cfg.bookmarks || [];
  if (reassignTo && cols.find((c) => c.id === reassignTo)) {
    bookmarks = bookmarks.map((b) => (b && b.columnId === id ? { ...b, columnId: reassignTo } : b));
  } else {
    bookmarks = bookmarks.filter((b) => b && b.columnId !== id);
  }
  writeConfig({ columns: cols, bookmarks });
  rebuildContextMenu();
  broadcastConfig();
  return { columns: getColumns(), bookmarks: getBookmarks() };
});

ipcMain.handle('reorder-columns', (_event, ids) => {
  if (!Array.isArray(ids)) return getColumns();
  const cfg = readConfig();
  const byId = new Map((cfg.columns || []).map((c) => [c.id, c]));
  const reordered = ids.map((id) => byId.get(id)).filter(Boolean);
  for (const c of (cfg.columns || [])) if (!ids.includes(c.id)) reordered.push(c);
  writeConfig({ columns: reordered });
  rebuildContextMenu();
  broadcastConfig();
  return getColumns();
});

ipcMain.handle('move-column-to-tab', (_event, payload) => {
  const columnId = payload && payload.columnId;
  const tabId = payload && payload.tabId;
  if (!columnId || !tabId) return { tabs: getTabs(), columns: getColumns(), activeTabId: getActiveTabId() };
  const cfg = readConfig();
  const tabs = Array.isArray(cfg.tabs) ? cfg.tabs : [];
  if (!tabs.find((t) => t.id === tabId)) {
    return { tabs: getTabs(), columns: getColumns(), activeTabId: getActiveTabId() };
  }
  const cols = (cfg.columns || []).map((c) => (c && c.id === columnId ? { ...c, tabId } : c));
  writeConfig({ columns: cols });
  rebuildContextMenu();
  broadcastConfig();
  return { tabs: getTabs(), columns: getColumns(), activeTabId: getActiveTabId() };
});

ipcMain.handle('add-tab', (_event, payload) => {
  const name = payload && typeof payload.name === 'string' ? payload.name.trim() : '';
  if (!name) return { tabs: getTabs(), activeTabId: getActiveTabId() };
  const cfg = readConfig();
  const tabs = Array.isArray(cfg.tabs) ? cfg.tabs.slice() : [];
  const newTab = { id: crypto.randomUUID(), name };
  tabs.push(newTab);
  // Switch to the freshly-created tab so the user sees their new (empty) workspace.
  writeConfig({ tabs, activeTabId: newTab.id });
  rebuildContextMenu();
  broadcastConfig();
  return { tabs: getTabs(), activeTabId: getActiveTabId() };
});

ipcMain.handle('rename-tab', (_event, payload) => {
  const id = payload && payload.id;
  const name = payload && typeof payload.name === 'string' ? payload.name.trim() : '';
  if (!id || !name) return getTabs();
  const cfg = readConfig();
  const tabs = (cfg.tabs || []).map((t) => (t.id === id ? { ...t, name } : t));
  writeConfig({ tabs });
  rebuildContextMenu();
  broadcastConfig();
  return getTabs();
});

ipcMain.handle('remove-tab', (_event, payload) => {
  const id = payload && payload.id;
  const reassignTo = payload && payload.reassignTo;
  if (!id) return { tabs: getTabs(), columns: getColumns(), bookmarks: getBookmarks(), activeTabId: getActiveTabId() };
  const cfg = readConfig();
  const remainingTabs = (cfg.tabs || []).filter((t) => t.id !== id);
  let columns = cfg.columns || [];
  let bookmarks = cfg.bookmarks || [];
  if (reassignTo && remainingTabs.find((t) => t.id === reassignTo)) {
    columns = columns.map((c) => (c && c.tabId === id ? { ...c, tabId: reassignTo } : c));
  } else {
    // Cascade: drop columns assigned to this tab, then drop bookmarks orphaned by that.
    const droppedColIds = new Set(columns.filter((c) => c && c.tabId === id).map((c) => c.id));
    columns = columns.filter((c) => c && c.tabId !== id);
    bookmarks = bookmarks.filter((b) => b && !droppedColIds.has(b.columnId));
  }
  let activeTabId = cfg.activeTabId === id
    ? (remainingTabs[0] && remainingTabs[0].id) || null
    : cfg.activeTabId;
  writeConfig({ tabs: remainingTabs, columns, bookmarks, activeTabId });
  rebuildContextMenu();
  broadcastConfig();
  return { tabs: getTabs(), columns: getColumns(), bookmarks: getBookmarks(), activeTabId: getActiveTabId() };
});

ipcMain.handle('reorder-tabs', (_event, ids) => {
  if (!Array.isArray(ids)) return getTabs();
  const cfg = readConfig();
  const byId = new Map((cfg.tabs || []).map((t) => [t.id, t]));
  const reordered = ids.map((id) => byId.get(id)).filter(Boolean);
  for (const t of (cfg.tabs || [])) if (!ids.includes(t.id)) reordered.push(t);
  writeConfig({ tabs: reordered });
  rebuildContextMenu();
  broadcastConfig();
  return getTabs();
});

ipcMain.handle('set-active-tab', (_event, id) => {
  const tabs = getTabs();
  if (!id || !tabs.find((t) => t.id === id)) return getActiveTabId();
  writeConfig({ activeTabId: id });
  return getActiveTabId();
});

ipcMain.handle('pick-folder', () => launchers.pickFolder());
ipcMain.handle('inspect-folder', (_event, p) => launchers.inspectFolder(p));

ipcMain.handle('open-in-explorer', (_event, p) => launchers.openInExplorer(p));
ipcMain.handle('open-terminal', (_event, payload) => {
  if (typeof payload === 'string') return launchers.openTerminal({ targetPath: payload });
  return launchers.openTerminal(payload || {});
});
ipcMain.handle('open-claude', (_event, payload) => {
  if (typeof payload === 'string') return launchers.openClaude({ targetPath: payload });
  return launchers.openClaude(payload || {});
});
ipcMain.handle('open-visual-studio', (_event, p) => launchers.openVisualStudio(p));
ipcMain.handle('run-redeploy', (_event, p) => launchers.runRedeploy(p));
ipcMain.handle('copy-path', (_event, text) => launchers.copyPath(text));
ipcMain.handle('is-claude-available', () => launchers.isClaudeAvailable());

ipcMain.handle('set-pinned', (_event, value) => {
  pinned = !!value;
  writeConfig({ pinned });
  if (pinned && popupWindow && popupWindow.isVisible()) {
    popupWindow.focus();
  }
  return pinned;
});

ipcMain.handle('set-popup-height', (_event, h) => {
  if (!popupWindow || popupWindow.isDestroyed()) return null;
  const target = Math.max(POPUP_MIN_HEIGHT, Math.min(POPUP_MAX_HEIGHT, Math.round(Number(h) || 0)));
  if (!Number.isFinite(target) || target <= 0) return null;
  const bounds = popupWindow.getBounds();
  popupWindow.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: target });
  writeConfig({ popupHeight: target });
  return target;
});

ipcMain.handle('set-popup-width', (_event, w) => {
  if (!popupWindow || popupWindow.isDestroyed()) return null;
  const bounds = popupWindow.getBounds();
  const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
  const workArea = display.workArea;
  const maxWidth = Math.max(POPUP_MIN_WIDTH, workArea.width - 8);
  const target = Math.max(POPUP_MIN_WIDTH, Math.min(maxWidth, Math.round(Number(w) || 0)));
  if (!Number.isFinite(target) || target <= 0) return null;
  // Re-clamp x against the work area so a wider popup doesn't fall off-screen.
  let x = bounds.x;
  if (x + target > workArea.x + workArea.width - 4) x = workArea.x + workArea.width - target - 4;
  if (x < workArea.x + 4) x = workArea.x + 4;
  popupWindow.setBounds({ x, y: bounds.y, width: target, height: bounds.height });
  writeConfig({ popupWidth: target });
  return target;
});

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.dbeuttel.folder-bookmark-tray');
  }
  migrateConfigIfNeeded();
  pinned = !!readConfig().pinned;
  applyAutoStart();
  createTray();
  createPopupWindow();
});

app.on('window-all-closed', (e) => e.preventDefault());
app.on('before-quit', () => {
  app.isQuitting = true;
});
