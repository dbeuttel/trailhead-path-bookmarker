import React, { useEffect, useMemo, useState } from 'react';

// Flat list of every bookmark, ordered tab → column → card. Used when the
// popup is minimized: the column grid collapses to one row per bookmark with
// the action buttons inlined to the right of the alias.
export default function MinimizedList({
  tabs,
  columns,
  bookmarks,
  claudeAvailable,
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
                claudeAvailable={claudeAvailable}
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

function MinimizedRow({ bookmark, claudeAvailable, inspectRevision, buttonVisibility }) {
  const showClaude = !buttonVisibility || buttonVisibility.claude !== false;
  const showTerminal = !buttonVisibility || buttonVisibility.terminal !== false;
  const showRedeploy = !buttonVisibility || buttonVisibility.redeploy !== false;
  const [inspect, setInspect] = useState({
    checked: false,
    slnPath: null,
    redeployPath: null,
    isNetwork: false,
  });
  const [status, setStatus] = useState(null);

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
        {!inspect.isNetwork && showClaude && (
          <button
            className="icon-button mini-btn"
            title={claudeAvailable ? `Claude: ${bookmark.alias}` : 'Claude CLI not found'}
            disabled={!claudeAvailable}
            onClick={() => runTabAction(window.bookmarks.openClaude, 'Claude')}
          >C</button>
        )}
        {!inspect.isNetwork && (
          <button
            className="icon-button mini-btn"
            title={
              !inspect.checked ? 'Checking…'
                : inspect.slnPath ? `Open ${inspect.slnPath.split(/[\\/]/).pop()}`
                : 'No .sln found'
            }
            disabled={!inspect.checked || !inspect.slnPath}
            onClick={() => runPathAction(window.bookmarks.openVisualStudio, 'Visual Studio')}
          >VS</button>
        )}
        {showRedeploy && inspect.redeployPath && !bookmark.hideDeploy && (
          <button
            className="icon-button mini-btn"
            title={`Run ${inspect.redeployPath.split(/[\\/]/).pop()}`}
            onClick={() => runPathAction(window.bookmarks.runRedeploy, 'Deploy')}
          >▶</button>
        )}
      </div>
      {status && (
        <div className={`mini-status ${status.kind === 'error' ? 'error' : 'info'}`}>
          {status.text}
        </div>
      )}
    </li>
  );
}
