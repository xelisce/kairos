import { useEffect, type ReactNode } from 'react';

export function Modal({
  title,
  children,
  onClose,
  footer,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

/**
 * The usual dialog footer: Delete (when editing) on the left, Cancel and Save on the right.
 * `problem`: why it can't be saved yet ("Ends before it starts"); Save stays off and says so.
 */
export function DialogButtons({
  onDelete,
  onCancel,
  onSave,
  problem,
  extra,
}: {
  onDelete?: () => void;
  onCancel: () => void;
  onSave: () => void;
  problem?: string;
  /** Extra buttons before Save (e.g. "Save & add class"). */
  extra?: ReactNode;
}) {
  return (
    <>
      {onDelete && (
        <button className="btn danger" onClick={onDelete}>
          Delete
        </button>
      )}
      <span className="spacer" />
      {problem && <span className="save-problem">{problem}</span>}
      {extra}
      <button className="btn" onClick={onCancel}>
        Cancel
      </button>
      <button className="btn primary" onClick={onSave} disabled={!!problem} title={problem}>
        Save
      </button>
    </>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <div className="row">{children}</div>;
}
