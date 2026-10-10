import { useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';

// "Mark as Done" for an admin, with the confirmation the action deserves. On
// confirm the server writes status -> Done and Case Stage -> "8. Support &
// Next Steps" to Monday in one go; the caller then sees the case under Past
// cases. Used on the incident page and on the In progress list.
export function MarkDoneButton({ mondayItemId, incidentName, onDone, className = 'staff-btn' }: {
  mondayItemId: string;
  incidentName?: string;
  onDone: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const close = () => { if (!busy) { setOpen(false); setError(''); } };

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/staff/monday-incidents/${mondayItemId}/complete`, { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (j.success) {
        setOpen(false);
        onDone();
      } else {
        setError(j.message || "Couldn't mark this incident as done. Please try again.");
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>Mark as Done</button>
      {open && (
        <ConfirmDialog
          title="Are you sure this incident is done?"
          confirmLabel="Yes, mark as done"
          busy={busy}
          error={error}
          onConfirm={confirm}
          onCancel={close}
        >
          {incidentName && <p className="staff-dialog-name">{incidentName}</p>}
          <p>
            It will be marked <strong>Done</strong> on Monday and its Case Stage set to{' '}
            <strong>8. Support &amp; Next Steps</strong>. The caller will see it under Past cases, and it
            will leave the In progress list.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
