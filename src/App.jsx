import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Popup from './components/Popup.jsx';

export default function App() {
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [columns, setColumns] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [pinned, setPinned] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [claudeAvailable, setClaudeAvailable] = useState(true);
  const [buttonVisibility, setButtonVisibility] = useState({ claude: true, terminal: true, redeploy: true });
  const [autoStart, setAutoStart] = useState(true);
  // Bumped on each popup show so BookmarkRow re-runs its folder inspect.
  // Rows stay mounted across hide/show cycles, so without a revision tick
  // they'd never notice newly-added .sln or 1ReDeploy.bat files.
  const [inspectRevision, setInspectRevision] = useState(0);

  const loadConfig = useCallback(async () => {
    const [cfg, hasClaude] = await Promise.all([
      window.bookmarks.getConfig(),
      window.bookmarks.isClaudeAvailable(),
    ]);
    setTabs(Array.isArray(cfg.tabs) ? cfg.tabs : []);
    setActiveTabId(cfg.activeTabId || null);
    setColumns(Array.isArray(cfg.columns) ? cfg.columns : []);
    setBookmarks(Array.isArray(cfg.bookmarks) ? cfg.bookmarks : []);
    setPinned(!!cfg.pinned);
    setMinimized(!!cfg.minimized);
    setClaudeAvailable(!!hasClaude);
    if (cfg.buttonVisibility) {
      setButtonVisibility({
        claude: cfg.buttonVisibility.claude !== false,
        terminal: cfg.buttonVisibility.terminal !== false,
        redeploy: cfg.buttonVisibility.redeploy !== false,
      });
    }
    setAutoStart(cfg.autoStart !== false);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadConfig();
    const offConfig = window.bookmarks.onConfigUpdated((payload) => {
      if (!payload) return;
      if (Array.isArray(payload.tabs)) setTabs(payload.tabs);
      if (Array.isArray(payload.columns)) setColumns(payload.columns);
      if (Array.isArray(payload.bookmarks)) setBookmarks(payload.bookmarks);
      if (typeof payload.activeTabId === 'string' || payload.activeTabId === null) {
        setActiveTabId(payload.activeTabId);
      }
      if (payload.buttonVisibility) {
        setButtonVisibility({
          claude: payload.buttonVisibility.claude !== false,
          terminal: payload.buttonVisibility.terminal !== false,
          redeploy: payload.buttonVisibility.redeploy !== false,
        });
      }
      if (typeof payload.autoStart === 'boolean') setAutoStart(payload.autoStart);
      if (typeof payload.minimized === 'boolean') setMinimized(payload.minimized);
    });
    const offShown = window.bookmarks.onPopupShown(() => {
      setInspectRevision((r) => r + 1);
    });
    return () => { offConfig(); offShown(); };
  }, [loadConfig]);

  const handleAdd = useCallback(async ({ alias, path, color, columnId }) => {
    const next = await window.bookmarks.addBookmark({ alias, path, color, columnId });
    setBookmarks(next || []);
  }, []);

  const handleEdit = useCallback(async ({ id, alias, path, color, columnId, hideDeploy }) => {
    const next = await window.bookmarks.addBookmark({ id, alias, path, color, columnId, hideDeploy });
    setBookmarks(next || []);
  }, []);

  const handleRemove = useCallback(async (id) => {
    const next = await window.bookmarks.removeBookmark(id);
    setBookmarks(next || []);
  }, []);

  const handleMoveBookmark = useCallback(async (id, delta) => {
    const target = bookmarks.find((b) => b.id === id);
    if (!target) return;
    const colMates = bookmarks.filter((b) => b.columnId === target.columnId);
    const idx = colMates.findIndex((b) => b.id === id);
    const swapIdx = idx + delta;
    if (idx < 0 || swapIdx < 0 || swapIdx >= colMates.length) return;
    const aId = colMates[idx].id;
    const bId = colMates[swapIdx].id;
    const newIds = bookmarks.map((b) => {
      if (b.id === aId) return bId;
      if (b.id === bId) return aId;
      return b.id;
    });
    const next = await window.bookmarks.reorderBookmarks(newIds);
    setBookmarks(next || []);
  }, [bookmarks]);

  const handleAddColumn = useCallback(async (name) => {
    const next = await window.bookmarks.addColumn(name, activeTabId);
    setColumns(next || []);
  }, [activeTabId]);

  const handleRenameColumn = useCallback(async (id, name) => {
    const next = await window.bookmarks.renameColumn(id, name);
    setColumns(next || []);
  }, []);

  const handleRemoveColumn = useCallback(async (id, reassignTo) => {
    const res = await window.bookmarks.removeColumn(id, reassignTo);
    if (res && Array.isArray(res.columns)) setColumns(res.columns);
    if (res && Array.isArray(res.bookmarks)) setBookmarks(res.bookmarks);
  }, []);

  const handleReorderColumns = useCallback(async (ids) => {
    const next = await window.bookmarks.reorderColumns(ids);
    setColumns(next || []);
  }, []);

  const handleMoveColumnToTab = useCallback(async (columnId, tabId) => {
    const res = await window.bookmarks.moveColumnToTab(columnId, tabId);
    if (res && Array.isArray(res.columns)) setColumns(res.columns);
    if (res && Array.isArray(res.tabs)) setTabs(res.tabs);
  }, []);

  const handleAddTab = useCallback(async (name) => {
    const res = await window.bookmarks.addTab(name);
    if (res && Array.isArray(res.tabs)) setTabs(res.tabs);
    if (res && res.activeTabId) setActiveTabId(res.activeTabId);
  }, []);

  const handleRenameTab = useCallback(async (id, name) => {
    const next = await window.bookmarks.renameTab(id, name);
    setTabs(next || []);
  }, []);

  const handleRemoveTab = useCallback(async (id, reassignTo) => {
    const res = await window.bookmarks.removeTab(id, reassignTo);
    if (res && Array.isArray(res.tabs)) setTabs(res.tabs);
    if (res && Array.isArray(res.columns)) setColumns(res.columns);
    if (res && Array.isArray(res.bookmarks)) setBookmarks(res.bookmarks);
    if (res && (typeof res.activeTabId === 'string' || res.activeTabId === null)) {
      setActiveTabId(res.activeTabId);
    }
  }, []);

  const handleReorderTabs = useCallback(async (ids) => {
    const next = await window.bookmarks.reorderTabs(ids);
    setTabs(next || []);
  }, []);

  const handleSelectTab = useCallback(async (id) => {
    setActiveTabId(id);
    await window.bookmarks.setActiveTab(id);
  }, []);

  const handleTogglePin = useCallback(async () => {
    const next = await window.bookmarks.setPinned(!pinned);
    setPinned(!!next);
  }, [pinned]);

  const handleToggleMinimized = useCallback(async () => {
    setMinimized((prev) => !prev);
    const next = await window.bookmarks.setMinimized(!minimized);
    if (typeof next === 'boolean') setMinimized(next);
  }, [minimized]);

  const handleSetButtonVisibility = useCallback(async (patch) => {
    // Optimistic update so the checkbox flips immediately even before main responds.
    setButtonVisibility((prev) => ({ ...prev, ...patch }));
    const next = await window.bookmarks.setButtonVisibility(patch);
    if (next) setButtonVisibility({
      claude: next.claude !== false,
      terminal: next.terminal !== false,
      redeploy: next.redeploy !== false,
    });
  }, []);

  const handleSetAutoStart = useCallback(async (value) => {
    setAutoStart(value);
    const next = await window.bookmarks.setAutoStart(value);
    if (typeof next === 'boolean') setAutoStart(next);
  }, []);

  const recentColors = useMemo(() => {
    const seen = new Set();
    const ordered = [];
    for (const b of bookmarks) {
      if (b && typeof b.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(b.color)) {
        const c = b.color.toLowerCase();
        if (!seen.has(c)) { seen.add(c); ordered.push(c); }
      }
    }
    return ordered;
  }, [bookmarks]);

  if (loading) {
    return (
      <div className="app loading">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="app">
      <Popup
        tabs={tabs}
        activeTabId={activeTabId}
        columns={columns}
        bookmarks={bookmarks}
        pinned={pinned}
        claudeAvailable={claudeAvailable}
        inspectRevision={inspectRevision}
        recentColors={recentColors}
        buttonVisibility={buttonVisibility}
        onSetButtonVisibility={handleSetButtonVisibility}
        autoStart={autoStart}
        onSetAutoStart={handleSetAutoStart}
        minimized={minimized}
        onToggleMinimized={handleToggleMinimized}
        onTogglePin={handleTogglePin}
        onAdd={handleAdd}
        onEdit={handleEdit}
        onRemove={handleRemove}
        onMoveBookmark={handleMoveBookmark}
        onAddColumn={handleAddColumn}
        onRenameColumn={handleRenameColumn}
        onRemoveColumn={handleRemoveColumn}
        onReorderColumns={handleReorderColumns}
        onMoveColumnToTab={handleMoveColumnToTab}
        onAddTab={handleAddTab}
        onRenameTab={handleRenameTab}
        onRemoveTab={handleRemoveTab}
        onReorderTabs={handleReorderTabs}
        onSelectTab={handleSelectTab}
      />
    </div>
  );
}
