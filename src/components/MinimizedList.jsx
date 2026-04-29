import React, { useEffect, useMemo, useState } from 'react';

// Flat list of every bookmark, ordered tab → column → card. Used when the
// popup is minimized: the column grid collapses to one row per bookmark with
// the action buttons inlined to the right of the alias.
export default function MinimizedList({
  tabs,
  columns,
  bookmarks,
  actions,
  commandAvailability,
  inspectRevision,
  buttonVisibility,
}) {
  // Group by column, walking tabs in order so cross-tab ordering is stable.
  // Empty columns are skipped — the minimized view is for quick access, not
  // for browsing the structure.
  const groups = useMemo(() => {
    const result = [];
    for (const tab of tabs) {
      const tabCols = columns.filter((c) => c.tabId === tab.id);
      for (const col of tabCols) {
        const cards = bookmarks.filter((b) => b.columnId === col.id);
        if (cards.length === 0) continue;
        result.push({ id: col.id, name: col.name, cards });
      }
    }
    return result;
  }, [tabs, columns, bookmarks]);

  if (groups.length === 0) {
    return <div className="empty-state">No bookmarks yet.</div>;
  }

  return (
    <div className="mini-groups">
      {groups.map((g) => (
        <section key={g.id} className="mini-group">
          <h3 className="mini-group-header">{g.name}</h3>
          <ul className="mini-list">
            {g.cards.map((b) => (
              <MinimizedRow
                key={b.id}
                bookmark={b}
                actions={actions}
                commandAvailability={commandAvailability}
                inspectRevision={inspectRevision}
                buttonVisibility={buttonVisibility}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function MinimizedRow({ bookmark, actions, commandAvailability, inspectRevision, buttonVisibility }) {
  const showTerminal = !buttonVisibility || buttonVisibility.terminal !== false;
  const [inspect, setInspect] = useState({
    checked: false,
    slnPath: null,
    redeployPath: null,
    isNetwork: false,
    actionMatches: {},
  });
  const [status, setStatus] = useState(null);

  const actionFiles = (actions || [])
    .map((a) => a && a.requiresFile)
    .filter(Boolean);
  const actionFilesKey = actionFiles.join('|');

  useEffect(() => {
    let cancelled = false;
    setInspect({ checked: false, slnPath: null, redeployPath: null, isNetwork: false, actionMatches: {} });
    window.bookmarks.inspectFolder(bookmark.path, actionFiles).then((res) => {
      if (cancelled) return;
      setInspect({
        checked: true,
        slnPath: res ? res.slnPath : null,
        redeployPath: res ? res.redeployPath : null,
        isNetwork: !!(res && res.isNetwork),
        actionMatches: (res && res.actionMatches) || {},
      });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookmark.path, inspectRevision, actionFilesKey]);

  const flash = (kind, text) => {
    setStatus({ kind, text });
    setTimeout(() => setStatus(null), 2000);
  };

  const runPathAction = async (fn, label) => {
    const res = await fn(bookmark.path);
    if (res && res.ok === false) flash('error', `${label}: ${res.error || 'failed'}`);
    else flash('info', `${label} ✓`);
  };

  const runTabAction = async (fn, label) => {
    const res = await fn({
      targetPath: bookmark.path,
      alias: bookmark.alias,
      color: bookmark.color,
    });
    if (res && res.ok === false) flash('error', `${label}: ${res.error || 'failed'}`);
    else if (res && res.focused) flash('info', `${label}: focused`);
    else flash('info', `${label}: opened`);
  };

  const runConfiguredAction = async (action) => {
    const res = await window.bookmarks.runAction({
      actionId: action.id,
      targetPath: bookmark.path,
      alias: bookmark.alias,
      color: bookmark.color,
    });
    const label = action.label || 'Action';
    if (res && res.ok === false) flash('error', `${label}: ${res.error || 'failed'}`);
    else if (res && res.focused) flash('info', `${label}: focused`);
    else flash('info', `${label} ✓`);
  };

  const stripeStyle = bookmark.color ? { borderLeftColor: bookmark.color } : undefined;

  return (
    <li
      className={`mini-row${bookmark.color ? ' has-color' : ''}`}
      style={stripeStyle}
      title={bookmark.path}
    >
      <span className="mini-alias">{bookmark.alias}</span>
      <div className="mini-actions">
        <button
          className="icon-button mini-btn"
          title={inspect.isNetwork ? 'Open share in Explorer' : 'Open in Explorer'}
          onClick={() => runPathAction(window.bookmarks.openInExplorer, 'Explorer')}
        >📁</button>
        {showTerminal && (
          <button
            className="icon-button mini-btn"
            title={`Terminal: ${bookmark.alias}`}
            onClick={() => runTabAction(window.bookmarks.openTerminal, 'Terminal')}
          >&gt;_</button>
        )}
        {(actions || []).map((action) => {
          if (!action || !action.id) return null;
          if (action.hideOnNetwork && inspect.isNetwork) return null;
          if (action.requiresFile) {
            const matched = inspect.actionMatches && inspect.actionMatches[action.requiresFile];
            if (!matched) return null;
            if (action.requiresFile === '1ReDeploy.bat' && bookmark.hideDeploy) return null;
          }
          const cmdMissing = action.requiresCommand
            && commandAvailability
            && commandAvailability[action.requiresCommand] === false;
          return (
            <button
              key={action.id}
              className="icon-button mini-btn"
              title={cmdMissing ? `${action.requiresCommand} not found on PATH` : `${action.label}: ${bookmark.alias}`}
              disabled={cmdMissing}
              onClick={() => runConfiguredAction(action)}
            >{action.icon || '?'}</button>
          );
        })}
      </div>
      {status && (
        <div className={`mini-status ${status.kind === 'error' ? 'error' : 'info'}`}>
          {status.text}
        </div>
      )}
    </li>
  );
}
