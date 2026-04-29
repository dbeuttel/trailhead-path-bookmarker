import React, { useState } from 'react';
import { ColorPicker } from './BookmarkRow.jsx';

export default function AddBookmarkForm({ columnId, recentColors, onAdd, onCancel }) {
  const [alias, setAlias] = useState('');
  const [pathValue, setPathValue] = useState('');
  const [color, setColor] = useState('');
  const [busy, setBusy] = useState(false);

  const handleBrowse = async () => {
    const picked = await window.bookmarks.pickFolder();
    if (!picked) return;
    setPathValue(picked);
    if (!alias.trim()) {
      const parts = picked.replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean);
      setAlias(parts[parts.length - 1] || picked);
    }
  };

  const handleAdd = async () => {
    if (!alias.trim() || !pathValue.trim()) return;
    setBusy(true);
    try {
      await onAdd({
        alias: alias.trim(),
        path: pathValue.trim(),
        color: color || null,
        columnId,
      });
      setAlias('');
      setPathValue('');
      setColor('');
    } finally {
      setBusy(false);
    }
  };

  const canAdd = alias.trim() && pathValue.trim() && !busy;

  return (
    <div className="add-bookmark">
      <div className="add-bookmark-label">Add bookmark</div>
      <input
        className="api-key-input small"
        value={alias}
        onChange={(e) => setAlias(e.target.value)}
        placeholder="Alias (also used as terminal tab title)"
      />
      <div className="add-path-row">
        <input
          className="api-key-input small"
          value={pathValue}
          onChange={(e) => setPathValue(e.target.value)}
          placeholder="Folder path"
        />
        <button className="secondary" onClick={handleBrowse} disabled={busy}>Browse</button>
      </div>
      <ColorPicker value={color} onChange={setColor} recentColors={recentColors} />
      <div className="add-actions">
        <button className="primary" onClick={handleAdd} disabled={!canAdd}>Add</button>
        {onCancel && (
          <button className="secondary" onClick={onCancel} disabled={busy}>Cancel</button>
        )}
      </div>
    </div>
  );
}
