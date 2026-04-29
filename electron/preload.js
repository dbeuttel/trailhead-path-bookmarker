const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bookmarks', {
  // Config
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (patch) => ipcRenderer.invoke('set-config', patch),

  // Bookmarks CRUD
  addBookmark: ({ id, alias, path, color, columnId, hideDeploy }) =>
    ipcRenderer.invoke('add-bookmark', { id, alias, path, color, columnId, hideDeploy }),
  removeBookmark: (id) => ipcRenderer.invoke('remove-bookmark', id),
  reorderBookmarks: (ids) => ipcRenderer.invoke('reorder-bookmarks', ids),

  // Columns CRUD
  addColumn: (name, tabId) => ipcRenderer.invoke('add-column', { name, tabId }),
  renameColumn: (id, name) => ipcRenderer.invoke('rename-column', { id, name }),
  removeColumn: (id, reassignTo) => ipcRenderer.invoke('remove-column', { id, reassignTo }),
  reorderColumns: (ids) => ipcRenderer.invoke('reorder-columns', ids),
  moveColumnToTab: (columnId, tabId) => ipcRenderer.invoke('move-column-to-tab', { columnId, tabId }),

  // Tabs CRUD
  addTab: (name) => ipcRenderer.invoke('add-tab', { name }),
  renameTab: (id, name) => ipcRenderer.invoke('rename-tab', { id, name }),
  removeTab: (id, reassignTo) => ipcRenderer.invoke('remove-tab', { id, reassignTo }),
  reorderTabs: (ids) => ipcRenderer.invoke('reorder-tabs', ids),
  setActiveTab: (id) => ipcRenderer.invoke('set-active-tab', id),

  // Folder picking + inspection
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  inspectFolder: (path, actionFiles) => ipcRenderer.invoke('inspect-folder', path, actionFiles),

  // Launchers
  openInExplorer: (path) => ipcRenderer.invoke('open-in-explorer', path),
  openTerminal: (payload) => ipcRenderer.invoke('open-terminal', payload),
  openClaude: (payload) => ipcRenderer.invoke('open-claude', payload),
  openVisualStudio: (path) => ipcRenderer.invoke('open-visual-studio', path),
  runRedeploy: (path) => ipcRenderer.invoke('run-redeploy', path),
  copyPath: (text) => ipcRenderer.invoke('copy-path', text),
  isClaudeAvailable: () => ipcRenderer.invoke('is-claude-available'),
  isCommandAvailable: (name) => ipcRenderer.invoke('is-command-available', name),
  runAction: (payload) => ipcRenderer.invoke('run-action', payload),

  // Window
  setPinned: (value) => ipcRenderer.invoke('set-pinned', value),
  setMinimized: (value) => ipcRenderer.invoke('set-minimized', value),
  setPopupHeight: (height) => ipcRenderer.invoke('set-popup-height', height),
  setPopupWidth: (width) => ipcRenderer.invoke('set-popup-width', width),

  // Settings
  setButtonVisibility: (payload) => ipcRenderer.invoke('set-button-visibility', payload),
  setAutoStart: (value) => ipcRenderer.invoke('set-auto-start', value),
  setActions: (list) => ipcRenderer.invoke('set-actions', list),

  // Events from main → renderer
  onConfigUpdated: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on('config-updated', handler);
    return () => ipcRenderer.removeListener('config-updated', handler);
  },
  onPopupShown: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('popup-shown', handler);
    return () => ipcRenderer.removeListener('popup-shown', handler);
  },
});
