import React, { useEffect } from 'react';

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  confirmKind = 'primary',
  cancelLabel = 'Cancel',
  extraActions = [],
  onConfirm,
  onCancel,
}) {
  // Esc cancels; Enter confirms unless focus is on a different action.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onConfirm, onCancel]);

  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-title">{title}</div>
        {message && <div className="confirm-message">{message}</div>}
        <div className="confirm-actions">
          <button
            className="secondary"
            onClick={onCancel}
            type="button"
          >{cancelLabel}</button>
          {extraActions.map((a, idx) => (
            <button
              key={idx}
              className={a.kind === 'danger' ? 'primary danger-button' : 'secondary'}
              onClick={() => { a.onClick(); onCancel(); }}
              type="button"
            >{a.label}</button>
          ))}
          <button
            autoFocus
            className={confirmKind === 'danger' ? 'primary danger-button' : 'primary'}
            onClick={() => { onConfirm(); onCancel(); }}
            type="button"
          >{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
