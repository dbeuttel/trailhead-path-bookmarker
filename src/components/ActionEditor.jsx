import React, { useState } from 'react';

// Curated icon dropdown — emoji + short text marks. Users can also type a
// custom 1–4 char icon via the override input next to the select.
const ICON_OPTIONS = [
  { value: '▶', label: '▶ Play' },
  { value: '🚀', label: '🚀 Rocket' },
  { value: '⚡', label: '⚡ Lightning' },
  { value: '🔧', label: '🔧 Wrench' },
  { value: '🛠', label: '🛠 Tools' },
  { value: '📦', label: '📦 Package' },
  { value: '🐳', label: '🐳 Docker' },
  { value: '💻', label: '💻 Laptop' },
  { value: '⚙', label: '⚙ Gear' },
  { value: '🧪', label: '🧪 Test tube' },
  { value: '📝', label: '📝 Pencil' },
  { value: '🌐', label: '🌐 Globe' },
  { value: '🏗', label: '🏗 Build' },
  { value: '🔍', label: '🔍 Search' },
  { value: '🐛', label: '🐛 Bug' },
  { value: '💾', label: '💾 Save' },
  { value: '🔥', label: '🔥 Fire' },
  { value: '✨', label: '✨ Sparkles' },
  { value: '📊', label: '📊 Chart' },
  { value: 'C', label: 'C — letter' },
  { value: 'VS', label: 'VS — letters' },
  { value: 'VC', label: 'VC — letters' },
];

// Preset templates that pre-fill the form when the user picks one. Convert
// the previously-hardcoded buttons into one-click choices, plus a couple of
// common dev-environment IDEs.
const PRESETS = [
  {
    name: 'Claude',
    template: {
      label: 'Claude', icon: 'C', kind: 'terminal',
      command: 'claude', requiresCommand: 'claude', hideOnNetwork: true,
    },
  },
  {
    name: 'Visual Studio',
    template: {
      label: 'Visual Studio', icon: 'VS', kind: 'open',
      requiresFile: '*.sln', hideOnNetwork: true,
    },
  },
  {
    name: 'VS Code',
    template: {
      label: 'VS Code', icon: 'VC', kind: 'terminal',
      command: 'code .', requiresCommand: 'code', hideOnNetwork: true,
    },
  },
  {
    name: 'Cursor',
    template: {
      label: 'Cursor', icon: '✨', kind: 'terminal',
      command: 'cursor .', requiresCommand: 'cursor', hideOnNetwork: true,
    },
  },
  {
    name: 'Run 1ReDeploy.bat',
    template: {
      label: 'Run 1ReDeploy.bat', icon: '▶', kind: 'detached',
      requiresFile: '1ReDeploy.bat', keepOpen: true,
    },
  },
  {
    name: 'Commit & Push',
    template: {
      label: 'Commit & Push',
      icon: '🚀',
      kind: 'terminal',
      // Stage everything, show status for sanity, prompt for the message via
      // Read-Host (PowerShell), commit + push. Empty message aborts the commit.
      command: "git add -A; git status; $m = Read-Host 'Commit message'; if ($m) { git commit -m $m; git push } else { Write-Host 'Aborted (empty message)' }",
      requiresCommand: 'git',
      hideOnNetwork: true,
    },
  },
];

// Modal editor for the configurable action button list. Edits a working copy
// in local state; nothing is persisted until the user clicks Save.
export default function ActionEditor({ actions, onSave, onClose }) {
  const [draft, setDraft] = useState(() => actions.map((a) => ({ ...a })));
  const [editingId, setEditingId] = useState(null);
  const [adding, setAdding] = useState(false);

  const editing = editingId ? draft.find((a) => a.id === editingId) : null;

  const updateOne = (id, patch) => {
    setDraft((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  };

  const removeOne = (id) => {
    setDraft((prev) => prev.filter((a) => a.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const move = (id, delta) => {
    setDraft((prev) => {
      const idx = prev.findIndex((a) => a.id === id);
      const target = idx + delta;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const next = prev.slice();
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const addNew = (action) => {
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setDraft((prev) => [...prev, { ...action, id }]);
    setAdding(false);
  };

  const handleSave = () => {
    onSave(draft);
    onClose();
  };

  return (
    <div className="confirm-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="action-editor">
        <div className="action-editor-head">
          <h2>Action Buttons</h2>
          <button className="icon-button" onClick={onClose} title="Close">×</button>
        </div>

        <p className="action-editor-help">
          Per-bookmark buttons. <strong>Terminal</strong> opens Windows Terminal in
          the folder and runs the command. <strong>Detached</strong> launches
          a command in a new cmd window.
        </p>

        <ul className="action-editor-list">
          {draft.length === 0 && (
            <li className="empty-state">No action buttons. Click “Add” to create one.</li>
          )}
          {draft.map((a, idx) => (
            <li key={a.id} className="action-editor-row">
              <span className="action-editor-icon" title={a.kind}>{a.icon || '?'}</span>
              <span className="action-editor-label">{a.label || '(unnamed)'}</span>
              <div className="action-editor-row-buttons">
                <button
                  className="icon-button"
                  title="Move up"
                  disabled={idx === 0}
                  onClick={() => move(a.id, -1)}
                >▲</button>
                <button
                  className="icon-button"
                  title="Move down"
                  disabled={idx === draft.length - 1}
                  onClick={() => move(a.id, 1)}
                >▼</button>
                <button
                  className="icon-button"
                  title="Edit"
                  onClick={() => { setAdding(false); setEditingId(a.id); }}
                >✎</button>
                <button
                  className="icon-button"
                  title="Delete"
                  onClick={() => {
                    if (window.confirm(`Delete action "${a.label}"?`)) removeOne(a.id);
                  }}
                >×</button>
              </div>
            </li>
          ))}
        </ul>

        {!adding && !editing && (
          <button
            className="add-bookmark-trigger"
            type="button"
            onClick={() => { setEditingId(null); setAdding(true); }}
          >+ Add action</button>
        )}

        {adding && (
          <ActionForm
            initial={blankAction()}
            mode="add"
            onCancel={() => setAdding(false)}
            onSubmit={addNew}
          />
        )}

        {editing && (
          <ActionForm
            initial={editing}
            mode="edit"
            onCancel={() => setEditingId(null)}
            onSubmit={(patch) => { updateOne(editing.id, patch); setEditingId(null); }}
          />
        )}

        <div className="action-editor-footer">
          <button className="primary" onClick={handleSave}>Save</button>
          <button className="secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function blankAction() {
  return {
    label: '',
    icon: '',
    kind: 'terminal',
    command: '',
    args: [],
    requiresFile: '',
    requiresCommand: '',
    hideOnNetwork: false,
    keepOpen: false,
  };
}

function ActionForm({ initial, mode, onCancel, onSubmit }) {
  const [label, setLabel] = useState(initial.label || '');
  const [icon, setIcon] = useState(initial.icon || '');
  const [kind, setKind] = useState(initial.kind || 'terminal');
  const [command, setCommand] = useState(initial.command || '');
  const [argsText, setArgsText] = useState(
    Array.isArray(initial.args) ? initial.args.join('\n') : '',
  );
  const [requiresFile, setRequiresFile] = useState(initial.requiresFile || '');
  const [requiresCommand, setRequiresCommand] = useState(initial.requiresCommand || '');
  const [hideOnNetwork, setHideOnNetwork] = useState(!!initial.hideOnNetwork);
  const [keepOpen, setKeepOpen] = useState(!!initial.keepOpen);

  const applyPreset = (name) => {
    const preset = PRESETS.find((p) => p.name === name);
    if (!preset) return;
    const t = preset.template;
    setLabel(t.label || '');
    setIcon(t.icon || '');
    setKind(t.kind || 'terminal');
    setCommand(t.command || '');
    setArgsText(Array.isArray(t.args) ? t.args.join('\n') : '');
    setRequiresFile(t.requiresFile || '');
    setRequiresCommand(t.requiresCommand || '');
    setHideOnNetwork(!!t.hideOnNetwork);
    setKeepOpen(!!t.keepOpen);
  };

  const trimmedLabel = label.trim();
  const trimmedIcon = icon.trim();
  // For kind='open', requiresFile is what gets opened — required.
  const canSubmit = trimmedLabel.length > 0
    && trimmedIcon.length > 0
    && (kind !== 'open' || requiresFile.trim().length > 0);

  const handleSubmit = () => {
    if (!canSubmit) return;
    const args = argsText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    onSubmit({
      label: trimmedLabel,
      icon: trimmedIcon.slice(0, 4),
      kind,
      command: command.trim(),
      args,
      requiresFile: requiresFile.trim(),
      requiresCommand: requiresCommand.trim(),
      hideOnNetwork,
      keepOpen,
    });
  };

  // Match the current icon string against the curated dropdown. If it isn't
  // in the list (or is empty), the dropdown shows "Custom…" and the override
  // input takes responsibility for the actual value.
  const iconInList = ICON_OPTIONS.some((o) => o.value === icon);

  return (
    <div className="action-form">
      <div className="action-form-title">{mode === 'add' ? 'New action' : 'Edit action'}</div>

      {mode === 'add' && (
        <>
          <label className="edit-label">Start from preset</label>
          <select
            className="api-key-input small"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) applyPreset(e.target.value);
              e.target.value = '';
            }}
          >
            <option value="">Custom (blank)</option>
            {PRESETS.map((p) => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
        </>
      )}

      <label className="edit-label">Label</label>
      <input
        className="api-key-input small"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="e.g. Run dev server"
      />

      <label className="edit-label">Icon</label>
      <div className="icon-pick-row">
        <select
          className="api-key-input small"
          value={iconInList ? icon : '__custom'}
          onChange={(e) => {
            if (e.target.value !== '__custom') setIcon(e.target.value);
          }}
        >
          {ICON_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
          <option value="__custom">Custom…</option>
        </select>
        <input
          className="api-key-input small action-form-icon"
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          placeholder="custom"
          maxLength={4}
          title="Override the dropdown with your own 1–4 character icon"
        />
      </div>

      <label className="edit-label">Kind</label>
      <div className="action-form-kind">
        <label>
          <input
            type="radio"
            name="kind"
            value="terminal"
            checked={kind === 'terminal'}
            onChange={() => setKind('terminal')}
          />
          <span>Terminal (opens Windows Terminal in folder)</span>
        </label>
        <label>
          <input
            type="radio"
            name="kind"
            value="detached"
            checked={kind === 'detached'}
            onChange={() => setKind('detached')}
          />
          <span>Detached (spawns command in new cmd window)</span>
        </label>
        <label>
          <input
            type="radio"
            name="kind"
            value="open"
            checked={kind === 'open'}
            onChange={() => setKind('open')}
          />
          <span>Open (launch matched file via Windows shell — e.g. .sln in VS)</span>
        </label>
      </div>

      {kind !== 'open' && (
        <>
          <label className="edit-label">
            Command {kind === 'detached' && requiresFile ? '(optional — leave blank to run the matched file directly)' : ''}
          </label>
          <input
            className="api-key-input small"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder={kind === 'terminal' ? 'claude' : 'npm'}
          />
        </>
      )}

      {kind === 'detached' && (
        <>
          <label className="edit-label">Extra args (one per line, optional)</label>
          <textarea
            className="api-key-input small action-form-args"
            value={argsText}
            onChange={(e) => setArgsText(e.target.value)}
            placeholder="install"
            rows={3}
          />
        </>
      )}

      <label className="edit-label">
        Required file in folder {kind === 'open' ? '(required — supports * wildcards)' : '(optional — supports * wildcards)'}
      </label>
      <input
        className="api-key-input small"
        value={requiresFile}
        onChange={(e) => setRequiresFile(e.target.value)}
        placeholder={kind === 'open' ? '*.sln' : 'e.g. package.json or *.csproj'}
      />

      {kind !== 'open' && (
        <>
          <label className="edit-label">Required CLI on PATH (optional)</label>
          <input
            className="api-key-input small"
            value={requiresCommand}
            onChange={(e) => setRequiresCommand(e.target.value)}
            placeholder="e.g. claude"
          />
        </>
      )}

      <label className="edit-toggle">
        <input
          type="checkbox"
          checked={hideOnNetwork}
          onChange={(e) => setHideOnNetwork(e.target.checked)}
        />
        <span>Hide on network shares</span>
      </label>

      {kind === 'detached' && (
        <label className="edit-toggle">
          <input
            type="checkbox"
            checked={keepOpen}
            onChange={(e) => setKeepOpen(e.target.checked)}
          />
          <span>Keep cmd window open after exit</span>
        </label>
      )}

      <div className="edit-actions">
        <button className="primary" onClick={handleSubmit} disabled={!canSubmit}>
          {mode === 'add' ? 'Add' : 'Update'}
        </button>
        <button className="secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
