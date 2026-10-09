import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { StaffGate, StaffShell } from './StaffShell';

interface Officer {
  id: number;
  full_name: string;
  phone: string;
  added_by: string | null;
  created_at: string | null;
}

// What the server answers to every list/add/remove/sync call: the fresh list, whether the
// agent is connected to this site at all, and (after a change) whether the agent was updated.
interface OfficersResponse {
  success: boolean;
  message?: string;
  officers: Officer[];
  agent_configured: boolean;
  synced?: boolean | null;
}

type Banner = { tone: 'ok' | 'warn' | 'error'; text: string } | null;

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

function Officers() {
  const [officers, setOfficers] = useState<Officer[] | null>(null);
  const [agentConfigured, setAgentConfigured] = useState(true);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState<Banner>(null);

  const apply = useCallback((j: OfficersResponse, whatChanged?: string) => {
    setOfficers(j.officers);
    setAgentConfigured(j.agent_configured);
    if (j.synced === true) setBanner({ tone: 'ok', text: `${whatChanged ?? 'Done'}. The agent now has the updated list and uses it from its next message.` });
    else if (j.synced === false) setBanner({ tone: 'error', text: `${whatChanged ?? 'Saved'}, but the agent could not be updated. Nothing is lost: press Sync now to send the list again.` });
    else if (j.synced === null) setBanner({ tone: 'warn', text: `${whatChanged ?? 'Saved'}, but the agent is not connected to this site, so nothing was sent to it.` });
  }, []);

  useEffect(() => {
    fetch('/api/staff/intake-officers')
      .then(r => r.json())
      .then((j: OfficersResponse) => { if (j.success) apply(j); else setError(j.message || 'Could not load the list.'); })
      .catch(() => setError('Could not load the list.'));
  }, [apply]);

  const call = async (url: string, init: RequestInit, whatChanged: string) => {
    setBusy(true); setError('');
    try {
      const res = await fetch(url, init);
      const j: OfficersResponse = await res.json();
      if (!j.success) { setError(j.message || 'Something went wrong.'); return false; }
      apply(j, whatChanged);
      return true;
    } catch {
      setError('Network error. Nothing was changed.');
      return false;
    } finally { setBusy(false); }
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await call('/api/staff/intake-officers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: name, phone }),
    }, `${name.trim()} was added`);
    if (ok) { setName(''); setPhone(''); }
  };

  const remove = async (officer: Officer) => {
    setConfirmId(null);
    await call(`/api/staff/intake-officers/${officer.id}`, { method: 'DELETE' }, `${officer.full_name} was removed`);
  };

  const first = officers !== null && officers.length === 0;

  return (
    <StaffShell
      title="Intake officers"
      subtitle="Who can message the incident agent on WhatsApp and open an intake"
      actions={agentConfigured && officers && officers.length > 0
        ? <button className="staff-btn" disabled={busy} onClick={() => call('/api/staff/intake-officers/sync', { method: 'POST' }, 'Synced')}>Sync now</button>
        : undefined}
    >
      {error && <div className="staff-error">{error}</div>}
      {!agentConfigured && (
        <div className="staff-notice staff-notice--warn">
          The agent is not connected to this site (AGENT_BASE_URL / AGENT_API_SECRET are not set here). Changes are saved, but the agent will not receive them.
        </div>
      )}
      {banner && <div className={`staff-notice staff-notice--${banner.tone}`} role="status">{banner.text}</div>}

      <section className="staff-card staff-card-pad">
        <h2 className="staff-section-title">Add an officer</h2>
        {first && (
          <p className="staff-row-meta" style={{ marginBottom: 12 }}>
            Right now <strong>nobody can message the agent</strong>. Only officers added here can, so add everyone who should have access, starting with yourself.
          </p>
        )}
        <form className="staff-officer-form" onSubmit={add}>
          <label className="staff-officer-field">
            <span>Full name</span>
            <input className="staff-field" value={name} onChange={e => setName(e.target.value)} placeholder="Dana Levi" required minLength={2} maxLength={80} autoComplete="off" />
          </label>
          <label className="staff-officer-field">
            <span>WhatsApp number</span>
            <input className="staff-field" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+972 50 123 4567" required inputMode="tel" autoComplete="off" />
          </label>
          <button className="staff-btn staff-btn--primary" type="submit" disabled={busy || !name.trim() || !phone.trim()}>
            {busy ? 'Saving…' : 'Add officer'}
          </button>
        </form>
        <p className="staff-row-meta" style={{ marginTop: 10 }}>
          The name is required: the agent greets the officer by it and records it as the officer on every report and on Monday.
        </p>
      </section>

      <section className="staff-section">
        <h2 className="staff-section-title">With access{officers ? ` (${officers.length})` : ''}</h2>
        <div className="staff-card">
          {officers === null && !error && <div className="staff-loading" style={{ padding: 16 }}>Loading…</div>}
          {officers && officers.length === 0 && <div className="staff-empty">No officers added yet.</div>}
          {officers && officers.map(o => (
            <div className="staff-row" key={o.id}>
              <div className="staff-row-main">
                <div className="staff-row-title">{o.full_name}</div>
                <div className="staff-row-meta">
                  <span dir="ltr">{o.phone}</span>
                  {o.added_by || o.created_at ? ` · added${o.added_by ? ` by ${o.added_by}` : ''}${o.created_at ? ` on ${formatDate(o.created_at)}` : ''}` : ''}
                </div>
              </div>
              <div className="staff-row-end">
                {confirmId === o.id ? (
                  <>
                    <button className="staff-btn staff-btn--danger-solid" disabled={busy} onClick={() => remove(o)}>Remove access</button>
                    <button className="staff-btn" disabled={busy} onClick={() => setConfirmId(null)}>Keep</button>
                  </>
                ) : (
                  <button className="staff-btn staff-btn--danger" disabled={busy} onClick={() => setConfirmId(o.id)}>Remove</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </StaffShell>
  );
}

export default function StaffIntakeOfficersPage() {
  return (
    <StaffGate allow="admin">
      <Officers />
    </StaffGate>
  );
}
