import React, { useEffect, useRef, useState, useCallback } from 'react';
import BookmarkRow from './BookmarkRow.jsx';
import AddBookmarkForm from './AddBookmarkForm.jsx';

export default function Column({
  column,
  columns,
  tabs,
  bookmarks,
  claudeAvailable,
  inspectRevision,
  recentColors,
  buttonVisibility,
  canMoveLeft,
  canMoveRight,
  onAdd,
  onEdit,
  onRemove,
  onMoveBookmark,
  onRenameColumn,
  onRemoveColumn,
  onMoveColumnToTab,
  onMoveLeft,
  onMoveRight,
  onRequestConfirm,
}) {
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(column.name);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moveTabOpen, setMoveTabOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const menuRef = useRef(null);

  const handleAddSubmitted = useCallback(async (payload) => {
    await onAdd(payload);
    setAddOpen(false);
  }, [onAdd]);

  useEffect(() => { setDraftName(column.name); }, [column.name]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
        setMoveTabOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const submitRename = async () => {
    const name = draftName.trim();
    if (!name || name === column.name) { setRenaming(false); setDraftName(column.name); return; }
    await onRenameColumn(column.id, name);
    setRenaming(false);
  };

  const handleDelete = () => {
    setMenuOpen(false);
    const count = bookmarks.length;
    const otherCols = columns.filter((c) => c.id !== column.id);
    const ask = onRequestConfirm || ((opts) => { if (window.confirm(`${opts.title}\n\n${opts.message || ''}`)) opts.onConfirm(); });
    if (count === 0) {
      ask({
        title: `Delete column "${column.name}"?`,
        message: 'This column has no bookmarks. It will be removed.',
        confirmLabel: 'Delete column',
        confirmKind: 'danger',
        onConfirm: () => onRemoveColumn(column.id),
      });
      return;
    }
    if (otherCols.length === 0) {
      const word = count === 1 ? 'bookmark' : 'bookmarks';
      ask({
        title: `Delete column "${column.name}"?`,
        message: `This will permanently delete ${count} ${word}.`,
        confirmLabel: 'Delete everything',
        confirmKind: 'danger',
        onConfirm: () => onRemoveColumn(column.id),
      });
      return;
    }
    const target = otherCols[0];
    const word = count === 1 ? 'bookmark' : 'bookmarks';
    ask({
      title: `Delete column "${column.name}"?`,
      message: `This column has ${count} ${word}. Move them to "${target.name}", or delete everything?`,
      confirmLabel: `Move to "${target.name}"`,
      confirmKind: 'primary',
      extraActions: [
        {
          label: 'Delete with bookmarks',
          kind: 'danger',
          onClick: () => onRemoveColumn(column.id),
        },
      ],
      onConfirm: () => onRemoveColumn(column.id, target.id),
    });
  };

  const otherTabs = (tabs || []).filter((t) => t.id !== column.tabId);

  return (
    <section className="column">
      <header className="column-header">
        {!renaming ? (
          <h2
            className="column-title"
            title="Click to rename"
            onClick={() => setRenaming(true)}
          >{column.name}</h2>
        ) : (
          <input
            autoFocus
            className="api-key-input small column-rename-input"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={submitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitRename();
              else if (e.key === 'Escape') { setRenaming(false); setDraftName(column.name); }
            }}
          />
        )}
        <div className="column-overflow" ref={menuRef}>
          <button
            className="icon-button"
            title="Column options"
            onClick={() => { setMenuOpen((v) => !v); setMoveTabOpen(false); }}
          >⋯</button>
          {menuOpen && (
            <div className="bookmark-menu">
              <button onClick={() => { setMenuOpen(false); setRenaming(true); }}>Rename</button>
              <button
                onClick={() => { setMenuOpen(false); onMoveLeft(); }}
                disabled={!canMoveLeft}
              >Move left</button>
              <button
                onClick={() => { setMenuOpen(false); onMoveRight(); }}
                disabled={!canMoveRight}
              >Move right</button>
              {otherTabs.length > 0 && onMoveColumnToTab && (
                moveTabOpen ? (
                  <div className="bookmark-submenu">
                    <div className="bookmark-submenu-label">Move to tab</div>
                    {otherTabs.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          setMoveTabOpen(false);
                          setMenuOpen(false);
                          onMoveColumnToTab(column.id, t.id);
                        }}
                      >{t.name}</button>
                    ))}
                    <button
                      className="submenu-back"
                      onClick={() => setMoveTabOpen(false)}
                    >← Back</button>
                  </div>
                ) : (
                  <button onClick={() => setMoveTabOpen(true)}>Move to tab ▸</button>
                )
              )}
              <button className="danger" onClick={handleDelete}>Delete column</button>
            </div>
          )}
        </div>
      </header>

      {bookmarks.length === 0 ? (
        <div className="empty-state column-empty">No bookmarks here yet.</div>
      ) : (
        <ul className="bookmark-list">
          {bookmarks.map((b, idx) => (
            <BookmarkRow
              key={b.id}
              bookmark={b}
              columns={columns}
              claudeAvailable={claudeAvailable}
              inspectRevision={inspectRevision}
              recentColors={recentColors}
              buttonVisibility={buttonVisibility}
              canMoveUp={idx > 0}
              canMoveDown={idx < bookmarks.length - 1}
              onEdit={onEdit}
              onRemove={onRemove}
              onMoveUp={() => onMoveBookmark(b.id, -1)}
              onMoveDown={() => onMoveBookmark(b.id, 1)}
            />
          ))}
        </ul>
      )}

      {addOpen ? (
        <AddBookmarkForm
          columnId={column.id}
          recentColors={recentColors}
          onAdd={handleAddSubmitted}
          onCancel={() => setAddOpen(false)}
        />
      ) : (
        <button
          type="button"
          className="add-bookmark-trigger"
          title="Add bookmark"
          onClick={() => setAddOpen(true)}
        >+</button>
      )}
    </section>
  );
}
