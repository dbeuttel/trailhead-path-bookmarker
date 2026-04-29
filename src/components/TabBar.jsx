import React, { useEffect, useRef, useState } from 'react';

export default function TabBar({
  tabs,
  activeTabId,
  columns,
  stripRef,
  onSelect,
  onAdd,
  onRename,
  onRemove,
  onReorder,
  onRequestConfirm,
}) {
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState('');

  const submitNew = async () => {
    const name = draftName.trim();
    if (!name) { setCreating(false); setDraftName(''); return; }
    await onAdd(name);
    setCreating(false);
    setDraftName('');
  };

  const moveTab = (id, delta) => {
    const ids = tabs.map((t) => t.id);
    const idx = ids.indexOf(id);
    const target = idx + delta;
    if (idx < 0 || target < 0 || target >= ids.length) return;
    const next = ids.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    onReorder(next);
  };

  return (
    <div className="tab-bar">
      <div className="tab-strip" ref={stripRef}>
        {tabs.map((t, idx) => (
          <Tab
            key={t.id}
            tab={t}
            active={t.id === activeTabId}
            columnCount={columns.filter((c) => c.tabId === t.id).length}
            tabs={tabs}
            canMoveLeft={idx > 0}
            canMoveRight={idx < tabs.length - 1}
            onSelect={() => onSelect(t.id)}
            onRename={(name) => onRename(t.id, name)}
            onRemove={(reassignTo) => onRemove(t.id, reassignTo)}
            onMoveLeft={() => moveTab(t.id, -1)}
            onMoveRight={() => moveTab(t.id, 1)}
            onRequestConfirm={onRequestConfirm}
          />
        ))}
        {creating ? (
          <div className="tab-add-input">
            <input
              autoFocus
              className="api-key-input small"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Tab name"
              onBlur={submitNew}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitNew();
                else if (e.key === 'Escape') { setCreating(false); setDraftName(''); }
              }}
            />
          </div>
        ) : (
          <button
            type="button"
            className="tab-add-trigger"
            title="Add a new tab"
            onClick={() => setCreating(true)}
          >+</button>
        )}
      </div>
    </div>
  );
}

function Tab({ tab, active, columnCount, tabs, canMoveLeft, canMoveRight, onSelect, onRename, onRemove, onMoveLeft, onMoveRight, onRequestConfirm }) {
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(tab.name);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => { setDraftName(tab.name); }, [tab.name]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const submitRename = async () => {
    const name = draftName.trim();
    if (!name || name === tab.name) { setRenaming(false); setDraftName(tab.name); return; }
    await onRename(name);
    setRenaming(false);
  };

  const handleDelete = () => {
    setMenuOpen(false);
    const otherTabs = tabs.filter((t) => t.id !== tab.id);
    if (columnCount === 0) {
      onRequestConfirm({
        title: `Delete tab "${tab.name}"?`,
        message: 'This tab has no columns. It will be removed.',
        confirmLabel: 'Delete tab',
        confirmKind: 'danger',
        onConfirm: () => onRemove(null),
      });
      return;
    }
    if (otherTabs.length === 0) {
      const colWord = columnCount === 1 ? 'column' : 'columns';
      onRequestConfirm({
        title: `Delete tab "${tab.name}"?`,
        message: `This will permanently delete ${columnCount} ${colWord} and every bookmark inside.`,
        confirmLabel: 'Delete everything',
        confirmKind: 'danger',
        onConfirm: () => onRemove(null),
      });
      return;
    }
    const target = otherTabs[0];
    const colWord = columnCount === 1 ? 'column' : 'columns';
    onRequestConfirm({
      title: `Delete tab "${tab.name}"?`,
      message: `This tab has ${columnCount} ${colWord}. Move them to "${target.name}", or delete everything?`,
      confirmLabel: `Move to "${target.name}"`,
      confirmKind: 'primary',
      extraActions: [
        {
          label: 'Delete with bookmarks',
          kind: 'danger',
          onClick: () => onRemove(null),
        },
      ],
      onConfirm: () => onRemove(target.id),
    });
  };

  if (renaming) {
    return (
      <div className={`tab${active ? ' active' : ''} renaming`}>
        <input
          autoFocus
          className="api-key-input small tab-rename-input"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={submitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitRename();
            else if (e.key === 'Escape') { setRenaming(false); setDraftName(tab.name); }
          }}
        />
      </div>
    );
  }

  return (
    <div className={`tab${active ? ' active' : ''}`}>
      <button
        type="button"
        className="tab-label"
        title={`Switch to "${tab.name}"`}
        onClick={onSelect}
        onDoubleClick={() => setRenaming(true)}
      >{tab.name}</button>
      <span className="tab-overflow" ref={menuRef}>
        <button
          type="button"
          className="tab-rename-btn"
          title="Rename tab"
          onClick={(e) => { e.stopPropagation(); setRenaming(true); }}
        >✎</button>
        <button
          type="button"
          className="tab-close-btn"
          title="Delete tab"
          onClick={(e) => { e.stopPropagation(); handleDelete(); }}
        >×</button>
        <button
          type="button"
          className="tab-menu-trigger"
          title="More options"
          onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
        >⋯</button>
        {menuOpen && (
          <div className="bookmark-menu tab-menu">
            <button onClick={() => { setMenuOpen(false); setRenaming(true); }}>Rename</button>
            <button onClick={() => { setMenuOpen(false); onMoveLeft(); }} disabled={!canMoveLeft}>Move left</button>
            <button onClick={() => { setMenuOpen(false); onMoveRight(); }} disabled={!canMoveRight}>Move right</button>
            <button className="danger" onClick={handleDelete}>Delete tab</button>
          </div>
        )}
      </span>
    </div>
  );
}
