import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Column from './Column.jsx';
import TabBar from './TabBar.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';

const COLUMN_WIDTH = 216;
// Padding budget so the popup doesn't clip the tab strip: popup-inner has
// 14px each side and the tab-bar adds 2px breathing room on either side.
const TAB_STRIP_PADDING = 32;

export default function Popup({
  tabs,
  activeTabId,
  columns,
  bookmarks,
  pinned,
  claudeAvailable,
  inspectRevision,
  recentColors,
  buttonVisibility,
  onSetButtonVisibility,
  autoStart,
  onSetAutoStart,
  onTogglePin,
  onAdd,
  onEdit,
  onRemove,
  onMoveBookmark,
  onAddColumn,
  onRenameColumn,
  onRemoveColumn,
  onReorderColumns,
  onMoveColumnToTab,
  onAddTab,
  onRenameTab,
  onRemoveTab,
  onReorderTabs,
  onSelectTab,
}) {
  const rootRef = useRef(null);
  const heightDebounceRef = useRef(null);
  const settingsRef = useRef(null);
  const tabStripRef = useRef(null);
  const [creatingColumn, setCreatingColumn] = useState(false);
  const [draftColumnName, setDraftColumnName] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmRequest, setConfirmRequest] = useState(null);
  const [tabStripScrollWidth, setTabStripScrollWidth] = useState(0);

  const requestConfirm = useCallback((opts) => {
    setConfirmRequest(opts);
  }, []);

  useEffect(() => {
    if (!settingsOpen) return undefined;
    const onClick = (e) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) setSettingsOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [settingsOpen]);

  // Columns belonging to the active tab. Keep stable order from the global
  // columns array so cross-tab moves don't shuffle siblings.
  const visibleColumns = useMemo(
    () => columns.filter((c) => c.tabId === activeTabId),
    [columns, activeTabId],
  );

  // Auto-fit window height to inner content (capped in main).
  useEffect(() => {
    if (!rootRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.target.offsetHeight;
        if (heightDebounceRef.current) clearTimeout(heightDebounceRef.current);
        heightDebounceRef.current = setTimeout(() => {
          window.bookmarks.setPopupHeight(h);
        }, 100);
      }
    });
    observer.observe(rootRef.current);
    return () => {
      observer.disconnect();
      if (heightDebounceRef.current) clearTimeout(heightDebounceRef.current);
    };
  }, []);

  // Watch the tab strip's scrollWidth so renames or new tabs widen the popup.
  // ResizeObserver picks up both layout changes (window width changes) and
  // content changes (a tab rename growing the strip).
  useEffect(() => {
    if (!tabStripRef.current) return undefined;
    const update = () => {
      const el = tabStripRef.current;
      if (!el) return;
      setTabStripScrollWidth(el.scrollWidth);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(tabStripRef.current);
    // Re-measure after children mutate (tabs added / renamed) so growth shows
    // up even when the strip element itself hasn't resized yet.
    const mutation = new MutationObserver(update);
    mutation.observe(tabStripRef.current, { childList: true, subtree: true, characterData: true });
    return () => { observer.disconnect(); mutation.disconnect(); };
  }, []);

  // Resize window width to max(columns-required, tabs-required). Main clamps
  // to the screen's work area, so wide tab strips either fit (most monitors)
  // or scroll horizontally inside the popup once they would push it off-screen.
  useEffect(() => {
    const colsWidth = Math.max(1, visibleColumns.length || 1) * COLUMN_WIDTH;
    const tabsWidth = tabStripScrollWidth > 0 ? tabStripScrollWidth + TAB_STRIP_PADDING : 0;
    window.bookmarks.setPopupWidth(Math.max(colsWidth, tabsWidth));
  }, [visibleColumns.length, tabStripScrollWidth]);

  const submitNewColumn = async () => {
    const name = draftColumnName.trim();
    if (!name) { setCreatingColumn(false); setDraftColumnName(''); return; }
    await onAddColumn(name);
    setCreatingColumn(false);
    setDraftColumnName('');
  };

  const moveColumn = (id, delta) => {
    // Reorder within the active tab only — convert local delta into a global
    // ids array that preserves all other tabs' columns in place.
    const visibleIds = visibleColumns.map((c) => c.id);
    const idx = visibleIds.indexOf(id);
    const target = idx + delta;
    if (idx < 0 || target < 0 || target >= visibleIds.length) return;
    const swappedVisible = visibleIds.slice();
    [swappedVisible[idx], swappedVisible[target]] = [swappedVisible[target], swappedVisible[idx]];
    const visibleSet = new Set(visibleIds);
    let visiblePtr = 0;
    const next = columns.map((c) => {
      if (visibleSet.has(c.id)) {
        const replacementId = swappedVisible[visiblePtr++];
        return replacementId;
      }
      return c.id;
    });
    onReorderColumns(next);
  };

  const hasNoTabs = tabs.length === 0;
  const hasNoColumns = !hasNoTabs && visibleColumns.length === 0;
  const canAddColumn = !hasNoTabs && !!activeTabId;

  return (
    <div className="popup">
      <div className="popup-inner" ref={rootRef}>
        <div className="popup-header drag-region">
          <h1>Folder Bookmarks</h1>
          <div className="header-actions">
            {!creatingColumn ? (
              <button
                className="icon-button"
                onClick={() => setCreatingColumn(true)}
                title={canAddColumn ? 'Add a new column to this tab' : 'Add a tab first'}
                disabled={!canAddColumn}
              >+</button>
            ) : (
              <div className="header-add-column">
                <input
                  autoFocus
                  className="api-key-input small"
                  value={draftColumnName}
                  onChange={(e) => setDraftColumnName(e.target.value)}
                  placeholder="Column name"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitNewColumn();
                    else if (e.key === 'Escape') {
                      setCreatingColumn(false);
                      setDraftColumnName('');
                    }
                  }}
                />
                <button className="icon-button" onClick={submitNewColumn} title="Add">✓</button>
                <button
                  className="icon-button"
                  onClick={() => { setCreatingColumn(false); setDraftColumnName(''); }}
                  title="Cancel"
                >×</button>
              </div>
            )}
            <div className="popup-settings" ref={settingsRef}>
              <button
                className={`icon-button ${settingsOpen ? 'active' : ''}`}
                onClick={() => setSettingsOpen((v) => !v)}
                title="Display settings"
              >⚙</button>
              {settingsOpen && (
                <div className="settings-panel">
                  <div className="settings-panel-label">Row buttons</div>
                  <label className="edit-toggle">
                    <input
                      type="checkbox"
                      checked={buttonVisibility.claude !== false}
                      onChange={(e) => onSetButtonVisibility({ claude: e.target.checked })}
                    />
                    <span>Show Claude button</span>
                  </label>
                  <label className="edit-toggle">
                    <input
                      type="checkbox"
                      checked={buttonVisibility.terminal !== false}
                      onChange={(e) => onSetButtonVisibility({ terminal: e.target.checked })}
                    />
                    <span>Show Terminal button</span>
                  </label>
                  <label className="edit-toggle">
                    <input
                      type="checkbox"
                      checked={buttonVisibility.redeploy !== false}
                      onChange={(e) => onSetButtonVisibility({ redeploy: e.target.checked })}
                    />
                    <span>Quick Run Redeploy</span>
                  </label>
                  <div className="settings-panel-label">Startup</div>
                  <label className="edit-toggle">
                    <input
                      type="checkbox"
                      checked={autoStart !== false}
                      onChange={(e) => onSetAutoStart(e.target.checked)}
                    />
                    <span>Start with Windows</span>
                  </label>
                </div>
              )}
            </div>
            <button
              className={`icon-button ${pinned ? 'active' : ''}`}
              onClick={onTogglePin}
              title={pinned ? 'Unpin (close on focus loss)' : 'Pin (keep open)'}
            >
              {pinned ? '📌' : '📍'}
            </button>
          </div>
        </div>

        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          columns={columns}
          stripRef={tabStripRef}
          onSelect={onSelectTab}
          onAdd={onAddTab}
          onRename={onRenameTab}
          onRemove={onRemoveTab}
          onReorder={onReorderTabs}
          onRequestConfirm={requestConfirm}
        />

        {hasNoTabs ? (
          <div className="empty-state">
            No tabs yet — click <strong>+</strong> in the tab bar to create your first.
          </div>
        ) : hasNoColumns ? (
          <div className="empty-state">
            No columns in this tab — click <strong>+</strong> in the header to add one.
          </div>
        ) : (
          <div className="columns-row">
            {visibleColumns.map((col, idx) => (
              <Column
                key={col.id}
                column={col}
                columns={visibleColumns}
                tabs={tabs}
                index={idx}
                bookmarks={bookmarks.filter((b) => b.columnId === col.id)}
                claudeAvailable={claudeAvailable}
                inspectRevision={inspectRevision}
                recentColors={recentColors}
                buttonVisibility={buttonVisibility}
                canMoveLeft={idx > 0}
                canMoveRight={idx < visibleColumns.length - 1}
                onAdd={onAdd}
                onEdit={onEdit}
                onRemove={onRemove}
                onMoveBookmark={onMoveBookmark}
                onRenameColumn={onRenameColumn}
                onRemoveColumn={onRemoveColumn}
                onMoveColumnToTab={onMoveColumnToTab}
                onMoveLeft={() => moveColumn(col.id, -1)}
                onMoveRight={() => moveColumn(col.id, 1)}
                onRequestConfirm={requestConfirm}
              />
            ))}
          </div>
        )}
      </div>
      {confirmRequest && (
        <ConfirmDialog
          {...confirmRequest}
          onCancel={() => setConfirmRequest(null)}
          onConfirm={() => {
            const fn = confirmRequest.onConfirm;
            setConfirmRequest(null);
            if (typeof fn === 'function') fn();
          }}
        />
      )}
    </div>
  );
}
