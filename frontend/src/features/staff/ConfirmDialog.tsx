import { useEffect, useId, useRef, type ReactNode } from 'react';

// A small modal "are you sure?" for actions that are hard to take back. Focus
// starts on Cancel (the safe choice), Tab stays inside the dialog, Escape and
// a click outside cancel, and none of it can be dismissed mid-request.
export function ConfirmDialog({ title, children, confirmLabel, cancelLabel = 'Cancel', busy = false, error = '', onConfirm, onCancel }: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const bodyId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const cancelFn = useRef(onCancel);
  cancelFn.current = onCancel;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const scrollBefore = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyRef.current) { cancelFn.current(); return; }
      if (e.key !== 'Tab') return;
      const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
      if (buttons.length === 0) return;
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = scrollBefore;
      opener?.focus?.();
    };
  }, []);

  return (
    <div className="staff-dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <div ref={dialogRef} className="staff-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId}>
        <h2 id={titleId} className="staff-dialog-title">{title}</h2>
        <div id={bodyId} className="staff-dialog-body">{children}</div>
        {error && <div className="staff-error" role="alert" style={{ margin: '14px 0 0' }}>{error}</div>}
        <div className="staff-dialog-actions">
          <button ref={cancelRef} type="button" className="staff-btn" disabled={busy} onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className="staff-btn staff-btn--primary" disabled={busy} onClick={onConfirm}>
            {busy ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
