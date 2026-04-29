import React, { useEffect, useRef, useState } from 'react';

export default function BookmarkRow({
  bookmark,
  columns,
  claudeAvailable,
  inspectRevision,
  recentColors,
  buttonVisibility,
  canMoveUp,
  canMoveDown,
  onEdit,
  onRemove,
  onMoveUp,
  onMoveDown,
}) {
  const showClaude = !buttonVisibility || buttonVisibility.claude !== false;
  const showTerminal = !buttonVisibility || buttonVisibility.terminal !== false;
  const showRedeploy = !buttonVisibility || buttonVisibility.redeploy !== false;
  const [mode, setMode] = useState('view');
  const [menuOpen, setMenuOpen] = useState(false);
  const [inspect, setInspect] = useState({
    checked: false,
    slnPath: null,
    redeployPath: null,
    isNetwork: false,
  });
  const [status, setStatus] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setInspect({ checked: false, slnPath: null, redeployPath: null, isNetwork: false });
    window.bookmarks.inspectFolder(bookmark.path).then((res) => {
      if (cancelled) return;
      setInspect({
        checked: true,
        slnPath: res ? res.slnPath : null,
        redeployPath: res ? res.redeployPath : null,
        isNetwork: !!(res && res.isNetwork),
      });
    });
    return () => { cancelled = true; };
  }, [bookmark.path, inspectRevision]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const flash = (kind, text) => {
    setStatus({ kind, text });
    setTimeout(() => setStatus(null), 2200);
  };

  const runPathAction = async (fn, label) => {
    const res = await fn(bookmark.path);
    if (res && res.ok === false) {
      flash('error', `${label}: ${res.error || 'failed'}`);
    } else {
      flash('info', `${label} ✓`);
    }
  };

  const runTabAction = async (fn, label) => {
    const res = await fn({
      targetPath: bookmark.path,
      alias: bookmark.alias,
      color: bookmark.color,
    });
    if (res && res.ok === false) {
      flash('error', `${label}: ${res.error || 'failed'}`);
    } else if (res && res.focused) {
      flash('info', `${label}: focused existing tab`);
    } else {
      flash('info', `${label}: opened new tab`);
    }
  };

  const handleCopy = async () => {
    setMenuOpen(false);
    const res = await window.bookmarks.copyPath(bookmark.path);
    if (res && res.ok === false) flash('error', res.error || 'Copy failed');
    else flash('info', 'Path copied');
  };

  const handleRemove = () => {
    setMenuOpen(false);
    if (window.confirm(`Remove bookmark "${bookmark.alias}"?`)) onRemove(bookmark.id);
  };

  const startEdit = () => {
    setMenuOpen(false);
    setMode('edit');
  };

  if (mode === 'edit') {
    return (
      <EditForm
        bookmark={bookmark}
        columns={columns}
        recentColors={recentColors}
        redeployPath={inspect.redeployPath}
        onCancel={() => setMode('view')}
        onSave={async ({ alias, path, color, columnId, hideDeploy }) => {
          await onEdit({ id: bookmark.id, alias, path, color, columnId, hideDeploy });
          setMode('view');
        }}
      />
    );
  }

  const stripeStyle = bookmark.color ? { borderLeftColor: bookmark.color } : undefined;

  return (
    <li className={`bookmark-row${bookmark.color ? ' has-color' : ''}`} style={stripeStyle}>
      <div className="bookmark-row-head">
        <div className="bookmark-meta">
          <strong className="bookmark-alias">{bookmark.alias}</strong>
          <span className="bookmark-path" title={bookmark.path}>{bookmark.path}</span>
        </div>
        <div className="bookmark-overflow" ref={menuRef}>
          <button
            className="icon-button"
            title="More"
            onClick={() => setMenuOpen((v) => !v)}
          >⋯</button>
          {menuOpen && (
            <div className={`bookmark-menu${!canMoveDown ? ' drop-up' : ''}`}>
              <button
                onClick={() => { setMenuOpen(false); onMoveUp(); }}
                disabled={!canMoveUp}
              >Move up</button>
              <button
                onClick={() => { setMenuOpen(false); onMoveDown(); }}
                disabled={!canMoveDown}
              >Move down</button>
              <button onClick={handleCopy}>Copy path</button>
              <button onClick={startEdit}>Edit</button>
              <button className="danger" onClick={handleRemove}>Remove</button>
            </div>
          )}
        </div>
      </div>
      <div className="bookmark-actions">
        <button
          className="icon-button"
          title={inspect.isNetwork ? 'Open network share in Explorer' : 'Open in Explorer'}
          onClick={() => runPathAction(window.bookmarks.openInExplorer, 'Explorer')}
        >📁</button>
        {showTerminal && (
          <button
            className="icon-button"
            title={`Open Terminal for "${bookmark.alias}" (focuses existing tab if found)`}
            onClick={() => runTabAction(window.bookmarks.openTerminal, 'Terminal')}
          >&gt;_</button>
        )}
        {!inspect.isNetwork && (
          <>
            {showClaude && (
              <button
                className="icon-button"
                title={
                  claudeAvailable
                    ? `Open Claude for "${bookmark.alias}" (focuses existing tab if found)`
                    : 'Claude CLI not found on PATH — install @anthropic-ai/claude-code'
                }
                disabled={!claudeAvailable}
                onClick={() => runTabAction(window.bookmarks.openClaude, 'Claude')}
              >C</button>
            )}
            <button
              className="icon-button"
              title={
                !inspect.checked ? 'Checking for .sln…'
                  : inspect.slnPath ? `Open ${inspect.slnPath.split(/[\\/]/).pop()} in Visual Studio`
                  : 'No .sln found in this folder'
              }
              disabled={!inspect.checked || !inspect.slnPath}
              onClick={() => runPathAction(window.bookmarks.openVisualStudio, 'Visual Studio')}
            >VS</button>
          </>
        )}
        {showRedeploy && inspect.redeployPath && !bookmark.hideDeploy && (
          <button
            className="icon-button"
            title={`Run ${inspect.redeployPath.split(/[\\/]/).pop()}`}
            onClick={() => runPathAction(window.bookmarks.runRedeploy, 'Deploy')}
          >▶</button>
        )}
      </div>
      {status && (
        <div className={`row-status ${status.kind === 'error' ? 'error' : 'info'}`}>
          {status.text}
        </div>
      )}
    </li>
  );
}

function EditForm({ bookmark, columns, recentColors, redeployPath, onSave, onCancel }) {
  const [alias, setAlias] = useState(bookmark.alias);
  const [pathValue, setPathValue] = useState(bookmark.path);
  const [color, setColor] = useState(bookmark.color || '');
  const [columnId, setColumnId] = useState(bookmark.columnId || (columns[0] && columns[0].id) || '');
  const [hideDeploy, setHideDeploy] = useState(!!bookmark.hideDeploy);
  const [busy, setBusy] = useState(false);

  const handleBrowse = async () => {
    const picked = await window.bookmarks.pickFolder();
    if (picked) setPathValue(picked);
  };

  const handleSave = async () => {
    if (!alias.trim() || !pathValue.trim()) return;
    setBusy(true);
    try {
      await onSave({
        alias: alias.trim(),
        path: pathValue.trim(),
        color: color || null,
        columnId: columnId || null,
        hideDeploy,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="bookmark-row editing" style={color ? { borderLeftColor: color } : undefined}>
      <div className="bookmark-edit">
        <label className="edit-label">Alias</label>
        <input
          className="api-key-input small"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          placeholder="Display name (also used as terminal tab title)"
        />
        <label className="edit-label">Path</label>
        <div className="edit-path-row">
          <input
            className="api-key-input small"
            value={pathValue}
            onChange={(e) => setPathValue(e.target.value)}
            placeholder="C:\\path\\to\\folder"
          />
          <button className="secondary" onClick={handleBrowse}>Browse</button>
        </div>
        <ColorPicker value={color} onChange={setColor} recentColors={recentColors} />
        {columns.length > 1 && (
          <ColumnPicker columns={columns} value={columnId} onChange={setColumnId} />
        )}
        {redeployPath && (
          <label className="edit-toggle">
            <input
              type="checkbox"
              checked={hideDeploy}
              onChange={(e) => setHideDeploy(e.target.checked)}
            />
            <span>Hide deploy button</span>
          </label>
        )}
        <div className="edit-actions">
          <button
            className="primary"
            onClick={handleSave}
            disabled={busy || !alias.trim() || !pathValue.trim()}
          >Save</button>
          <button className="secondary" onClick={onCancel} disabled={busy}>Cancel</button>
        </div>
      </div>
    </li>
  );
}

function ColorPicker({ value, onChange, recentColors = [] }) {
  const valueLower = value ? value.toLowerCase() : '';
  return (
    <div className="color-picker-row">
      <label className="edit-label">Tab color</label>
      <div className="color-picker-controls">
        <input
          type="color"
          className="color-swatch"
          value={value || '#d97757'}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Pick tab color"
        />
        <span className="color-hex">{value || '(none)'}</span>
        {value && (
          <button className="link-button" type="button" onClick={() => onChange('')}>Clear</button>
        )}
      </div>
      {recentColors.length > 0 && (
        <div className="color-recent-row" role="listbox" aria-label="Previously used colors">
          {recentColors.map((c) => (
            <button
              key={c}
              type="button"
              className={`recent-swatch${valueLower === c ? ' active' : ''}`}
              style={{ background: c }}
              title={c}
              aria-label={`Use ${c}`}
              onClick={() => onChange(c)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ColumnPicker({ columns, value, onChange }) {
  return (
    <div className="column-picker-row">
      <label className="edit-label">Column</label>
      <select
        className="api-key-input small"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      >
        {columns.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </div>
  );
}

export { ColorPicker };
