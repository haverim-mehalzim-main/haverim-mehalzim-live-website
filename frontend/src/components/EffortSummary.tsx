import { useState } from 'react';
import './effort.css';

// The effort estimate the WhatsApp agent calculated for a finished case: how many
// people took part and how many hours of work they put in. It reaches this page
// only after an admin approved it, so a caller or family member never sees a number
// nobody checked.

export interface EffortSummaryData {
  id: number;
  monday_item_id: string;
  status: 'pending' | 'approved' | 'rejected';
  total_hours: number;
  supervisors_hours: number;
  case_managers_hours: number;
  command_center_hours: number;
  doctors_hours: number;
  mental_health_hours: number;
  field_operations_hours: number;
  other_hours: number;
  volunteers_count: number;
  submitted_at: string | null;
  reviewed_at: string | null;
}

const hours = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} h`;

// Rows with no hours are left out: "Doctors 0 h" on a case with no doctor reads as
// a gap in the care, not as "not involved".
function breakdownRows(s: EffortSummaryData): [string, number][] {
  const rows: [string, number][] = [
    ['Case managers', s.case_managers_hours],
    ['Supervisors', s.supervisors_hours],
    ['Command & control center', s.command_center_hours],
    ['Doctors', s.doctors_hours],
    ['Psychologists & mental health specialists', s.mental_health_hours],
    ['Field operations', s.field_operations_hours],
    ['Other volunteers (insurance specialists, volunteers on the field, etc.)', s.other_hours],
  ];
  return rows.filter(([, h]) => h > 0);
}

function Numbers({ summary, kv }: { summary: EffortSummaryData; kv?: boolean }) {
  const rows = breakdownRows(summary);
  return (
    <>
      <div className={kv ? 'effort-totals effort-totals--staff' : 'effort-totals'}>
        <div className="effort-total">
          <div className="effort-total-num">{summary.volunteers_count}</div>
          <div className="effort-total-label">{summary.volunteers_count === 1 ? 'volunteer took part' : 'volunteers took part'}</div>
        </div>
        <div className="effort-total">
          <div className="effort-total-num">{hours(summary.total_hours)}</div>
          <div className="effort-total-label">of volunteer work in total</div>
        </div>
      </div>
      {rows.length > 0 && (
        <ul className="effort-rows">
          {rows.map(([label, h]) => (
            <li key={label}><span>{label}</span><strong>{hours(h)}</strong></li>
          ))}
        </ul>
      )}
    </>
  );
}

// What a caller or family member sees.
export function EffortSummaryCard({ summary }: { summary: EffortSummaryData }) {
  return (
    <section className="account-card effort-card" aria-label="How much work went into this case">
      <div className="account-detail-desc-label">Effort summary</div>
      <h2 className="effort-title">What it took to support this case</h2>
      <Numbers summary={summary} />
    </section>
  );
}

// What an admin sees: the same numbers, plus the decision while it is pending.
// `onChanged` receives the updated summary so the page can swap it in place.
export function EffortSummaryReview({ summary, onChanged, compact }: {
  summary: EffortSummaryData;
  onChanged: (s: EffortSummaryData) => void;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState('');

  const decide = async (action: 'approve' | 'reject') => {
    setBusy(action);
    setError('');
    try {
      const res = await fetch(`/api/staff/effort-summaries/${summary.id}/${action}`, { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (j.success) onChanged(j.summary);
      else setError(j.message || 'Could not save the decision. Please try again.');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const tone = summary.status === 'approved' ? 'green' : summary.status === 'rejected' ? 'red' : 'amber';
  const label = summary.status === 'approved'
    ? 'Approved — visible to the caller and family'
    : summary.status === 'rejected'
      ? 'Rejected — not shown'
      : 'Waiting for your approval';

  return (
    <section className={compact ? 'effort-review' : 'staff-card staff-card-pad effort-review'}>
      {!compact && <h2 className="staff-section-title">Effort summary</h2>}
      <span className="staff-badge" data-tone={tone}>{label}</span>
      <Numbers summary={summary} kv />
      {summary.status === 'pending' && (
        <p className="staff-row-meta">
          Sent from the incident group. The caller and the family will not see this until you approve it.
        </p>
      )}
      {error && <div className="staff-error">{error}</div>}
      {summary.status !== 'approved' && (
        <div className="effort-actions">
          <button type="button" className="staff-btn staff-btn--primary" disabled={busy !== null} onClick={() => decide('approve')}>
            {busy === 'approve' ? 'Approving…' : 'Approve'}
          </button>
          {summary.status === 'pending' && (
            <button type="button" className="staff-btn staff-btn--danger" disabled={busy !== null} onClick={() => decide('reject')}>
              {busy === 'reject' ? 'Rejecting…' : 'Reject'}
            </button>
          )}
        </div>
      )}
      {summary.status === 'approved' && (
        <div className="effort-actions">
          <button type="button" className="staff-btn staff-btn--danger" disabled={busy !== null} onClick={() => decide('reject')}>
            {busy === 'reject' ? 'Hiding…' : 'Hide from caller and family'}
          </button>
        </div>
      )}
    </section>
  );
}
