import { useCallback, useEffect, useState } from 'react';
import './effort.css';

// The effort estimate for a finished case: how many people took part and how many
// hours of work they put in. The WhatsApp agent calculates it (an admin starts that
// with "Summarize incident"), an admin approves or edits it, and only then does a
// caller or family member see it — so nobody sees a number nobody checked.

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
  // Admin view only: who last typed over the numbers (absent for callers and families).
  source?: 'agent' | 'admin';
  edited_at?: string | null;
  edited_by?: string | null;
}

// Where the last "Summarize incident" click got to, while there is no summary yet or
// a new one is on its way. `null` once the numbers arrived.
export interface EffortRequestState {
  state: 'requested' | 'needs_input' | 'failed';
  reason: string | null;
  requested_at: string;
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

// ── Manual edit ──────────────────────────────────────────────────────────────

// Same rows as the breakdown, in the order the page shows them. The total is not a
// field: the server adds the parts up, so it can never disagree with the breakdown.
const EDIT_FIELDS: { key: keyof EffortSummaryData; label: string }[] = [
  { key: 'case_managers_hours', label: 'Case managers (hours)' },
  { key: 'supervisors_hours', label: 'Supervisors (hours)' },
  { key: 'command_center_hours', label: 'Command & control center (hours)' },
  { key: 'doctors_hours', label: 'Doctors (hours)' },
  { key: 'mental_health_hours', label: 'Psychologists & mental health specialists (hours)' },
  { key: 'field_operations_hours', label: 'Field operations (hours)' },
  { key: 'other_hours', label: 'Other volunteers (hours)' },
];

function EffortSummaryEditor({ summary, onSaved, onCancel }: {
  summary: EffortSummaryData;
  onSaved: (s: EffortSummaryData, warnings: string[]) => void;
  onCancel: () => void;
}) {
  // Kept as text while typing so "1." or an empty box doesn't fight the user.
  const [values, setValues] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(EDIT_FIELDS.map(f => [f.key, String(summary[f.key])])),
    volunteers_count: String(summary.volunteers_count),
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const num = (k: string) => (values[k].trim() === '' ? NaN : Number(values[k]));
  const parts = EDIT_FIELDS.map(f => num(f.key as string));
  const total = parts.every(Number.isFinite) ? parts.reduce((a, b) => a + b, 0) : null;
  const valid = total !== null && parts.every(n => n >= 0) && Number.isInteger(num('volunteers_count')) && num('volunteers_count') >= 0;

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const body = {
        ...Object.fromEntries(EDIT_FIELDS.map(f => [f.key, num(f.key as string)])),
        volunteers_count: num('volunteers_count'),
      };
      const res = await fetch(`/api/staff/effort-summaries/${summary.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (j.success) onSaved(j.summary, j.warnings || []);
      else setError(j.message || 'Could not save. Please try again.');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="effort-editor">
      <div className="effort-editor-grid">
        <label className="effort-editor-field">
          <span>Volunteers who took part</span>
          <input className="staff-field" type="number" min={0} step={1} value={values.volunteers_count}
            onChange={e => setValues(v => ({ ...v, volunteers_count: e.target.value }))} />
        </label>
        {EDIT_FIELDS.map(f => (
          <label key={f.key} className="effort-editor-field">
            <span>{f.label}</span>
            <input className="staff-field" type="number" min={0} step={0.5} value={values[f.key as string]}
              onChange={e => setValues(v => ({ ...v, [f.key as string]: e.target.value }))} />
          </label>
        ))}
      </div>
      <p className="staff-row-meta">
        Total: <strong>{total === null ? '—' : hours(Math.round(total * 100) / 100)}</strong> (the sum of the rows above).{' '}
        {summary.status === 'approved'
          ? 'Saving updates what the caller and family see, right away.'
          : 'Saving also approves it, so the caller and family will see it.'}
        {' '}The same numbers are written to the case on Monday.
      </p>
      {error && <div className="staff-error">{error}</div>}
      <div className="effort-actions">
        <button type="button" className="staff-btn staff-btn--primary" disabled={busy || !valid} onClick={save}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="staff-btn" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ── Admin review ─────────────────────────────────────────────────────────────

// What an admin sees: the same numbers, plus the decision while it is pending, and
// the option to change them — before or after approval. `onChanged` receives the
// updated summary so the page can swap it in place.
export function EffortSummaryReview({ summary, onChanged, compact }: {
  summary: EffortSummaryData;
  onChanged: (s: EffortSummaryData) => void;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

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
  const editedNote = summary.source === 'admin' && summary.edited_at
    ? `Edited by ${summary.edited_by || 'an admin'} · ${new Date(summary.edited_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
    : null;

  return (
    <section className={compact ? 'effort-review' : 'staff-card staff-card-pad effort-review'}>
      {!compact && <h2 className="staff-section-title">Effort summary</h2>}
      <span className="staff-badge" data-tone={tone}>{label}</span>
      {editedNote && <p className="staff-row-meta">{editedNote}</p>}
      {editing ? (
        <EffortSummaryEditor
          summary={summary}
          onCancel={() => setEditing(false)}
          onSaved={(s, w) => { setEditing(false); setWarnings(w); onChanged(s); }}
        />
      ) : (
        <>
          <Numbers summary={summary} kv />
          {summary.status === 'pending' && (
            <p className="staff-row-meta">
              Calculated from the incident group. The caller and the family will not see this until you approve it.
            </p>
          )}
          {warnings.map(w => <div key={w} className="staff-error">{w}</div>)}
          {error && <div className="staff-error">{error}</div>}
          <div className="effort-actions">
            {summary.status !== 'approved' && (
              <button type="button" className="staff-btn staff-btn--primary" disabled={busy !== null} onClick={() => decide('approve')}>
                {busy === 'approve' ? 'Approving…' : 'Approve'}
              </button>
            )}
            <button type="button" className="staff-btn" disabled={busy !== null} onClick={() => { setWarnings([]); setEditing(true); }}>
              Edit numbers
            </button>
            {summary.status === 'pending' && (
              <button type="button" className="staff-btn staff-btn--danger" disabled={busy !== null} onClick={() => decide('reject')}>
                {busy === 'reject' ? 'Rejecting…' : 'Reject'}
              </button>
            )}
            {summary.status === 'approved' && (
              <button type="button" className="staff-btn staff-btn--danger" disabled={busy !== null} onClick={() => decide('reject')}>
                {busy === 'reject' ? 'Hiding…' : 'Hide from caller and family'}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

// ── "Summarize incident" ─────────────────────────────────────────────────────

// What to tell the admin, and what to do, for each reason the agent (or the link to
// it) can give. Reasons are short codes from the server, never the agent's own words.
const REQUEST_MESSAGES: Record<string, string> = {
  needs_input:
    'The agent asked the officer for more information in the WhatsApp group (for example who held which role). It will finish by itself once they answer — or press “Try again”.',
  no_group:
    'This case is not linked to a WhatsApp group yet. In the incident group, an officer writes “@חמל קשר את הקבוצה לאירוע” followed by the case ID, and then you can try again.',
  group_not_found:
    'The case is linked to a group the agent can no longer see (it may have left the group). Re-link it from the group, then try again.',
  whatsapp_disconnected: 'The agent’s WhatsApp is disconnected right now. Try again in a minute.',
  agent_not_configured: 'The connection to the agent is not set up on the server.',
  agent_unreachable: 'Could not reach the agent. Try again in a minute.',
  agent_refused: 'The agent refused the request (the shared secret may not match on both sides).',
  case_not_found: 'The agent could not find this case on the incidents board.',
  monday_write_failed: 'The agent calculated the hours but could not write them to Monday, so nothing was sent. Try again.',
  site_rejected: 'The agent calculated the hours but the site did not accept them. Try again.',
  no_result: 'The agent could not produce a result. Try again.',
  timed_out: 'The agent did not answer in time (it may have restarted). Try again.',
  agent_error: 'Something went wrong while calculating. Try again.',
};

// The admin's panel on a case page: the "Summarize incident" button, what the agent is
// doing, and the summary itself (approve / edit / hide). It polls while the agent works,
// so the numbers appear here without a refresh.
export function EffortSummaryAdmin({ mondayItemId, onSummaryChange }: {
  mondayItemId: string;
  onSummaryChange?: (s: EffortSummaryData | null) => void;
}) {
  const [summary, setSummary] = useState<EffortSummaryData | null>(null);
  const [request, setRequest] = useState<EffortRequestState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  const apply = useCallback((j: { summary?: EffortSummaryData | null; request?: EffortRequestState | null }) => {
    setSummary(j.summary ?? null);
    setRequest(j.request ?? null);
    onSummaryChange?.(j.summary ?? null);
  }, [onSummaryChange]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/staff/incidents/${mondayItemId}/effort-summary`);
      const j = await res.json().catch(() => ({}));
      if (j.success) apply(j);
    } catch { /* keep what is shown; the next poll tries again */ }
    setLoaded(true);
  }, [mondayItemId, apply]);

  useEffect(() => { load(); }, [load]);

  // While the agent is working (or waiting for the officer) the answer can arrive at
  // any moment — quickly while calculating, slowly while it waits on a person.
  const waiting = request?.state;
  useEffect(() => {
    if (waiting !== 'requested' && waiting !== 'needs_input') return;
    const id = setInterval(load, waiting === 'requested' ? 4000 : 10000);
    return () => clearInterval(id);
  }, [waiting, load]);

  const start = async () => {
    setStarting(true);
    setError('');
    try {
      const res = await fetch(`/api/staff/incidents/${mondayItemId}/effort-summary/request`, { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (j.summary !== undefined || j.request !== undefined) apply(j);
      if (!j.success && !j.request) setError(j.message || 'Could not start the calculation. Please try again.');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setStarting(false);
    }
  };

  if (!loaded) return null;

  const calculating = request?.state === 'requested';
  const buttonLabel = starting || calculating ? 'Calculating…' : summary ? 'Calculate again' : 'Summarize incident';

  return (
    <section className="staff-card staff-card-pad effort-admin">
      <h2 className="staff-section-title">Effort summary</h2>

      {!summary && !request && (
        <p className="staff-row-meta">
          The agent reads the incident’s WhatsApp group and works out how many volunteers took part and how many
          hours they put in. You then approve it, or change the numbers, before the caller and family see it.
        </p>
      )}

      {calculating && (
        <p className="staff-row-meta" role="status">
          The agent is reading the group conversation and calculating. This can take a minute or two.
        </p>
      )}
      {request && !calculating && (
        <div className="staff-error" data-tone={request.state === 'needs_input' ? 'info' : undefined} role="status">
          {REQUEST_MESSAGES[request.reason || ''] || REQUEST_MESSAGES.agent_error}
          {/* The officer needs the case ID to link the group, so show it right here. */}
          {request.reason === 'no_group' && <> Case ID: <strong>{mondayItemId}</strong></>}
        </div>
      )}
      {error && <div className="staff-error">{error}</div>}

      <div className="effort-actions">
        {/* Primary only while there is nothing else to do; next to a summary awaiting a decision it is the quiet option. */}
        <button type="button" className={summary && !request ? 'staff-btn' : 'staff-btn staff-btn--primary'} disabled={starting || calculating} onClick={start}>
          {request?.state === 'needs_input' || request?.state === 'failed' ? 'Try again' : buttonLabel}
        </button>
      </div>
      {summary?.status === 'approved' && !calculating && (
        <p className="staff-row-meta">
          Calculating again replaces the posted numbers, and they stay hidden until you approve the new ones.
        </p>
      )}

      {summary && (
        <EffortSummaryReview
          compact
          summary={summary}
          onChanged={s => { setSummary(s); onSummaryChange?.(s); }}
        />
      )}
    </section>
  );
}
