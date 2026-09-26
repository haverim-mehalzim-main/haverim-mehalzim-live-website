import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const MONO = "'JetBrains Mono', 'Courier New', monospace";
const BG   = '#06090f';
const BG2  = '#0c1420';
const TEAL = '#00c9b1';
const RED  = '#f87171';

interface QueueIncident {
  monday_item_id: string;
  local_id: number | null;
  name: string;
  incident_type: string;
  country: string;
  life_threatening: boolean;
  owner: { email: string; full_name: string } | null;
}

function RejectForm({ onConfirm, onCancel, busy }: { onConfirm: (reason: string) => void; onCancel: () => void; busy: boolean }) {
  const [reason, setReason] = useState('');
  return (
    <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <textarea
        value={reason} onChange={e => setReason(e.target.value)} autoFocus
        placeholder="Reason for declining (the caller will see this)"
        style={{ flex: '1 1 220px', minHeight: 60, background: BG, border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#e2e8f0', fontFamily: MONO, fontSize: 12, padding: 8, resize: 'vertical' }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button
          onClick={() => reason.trim() && onConfirm(reason.trim())} disabled={busy || !reason.trim()}
          style={{ padding: '6px 12px', background: RED, color: '#1a0505', border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          Confirm Reject
        </button>
        <button
          onClick={onCancel} disabled={busy}
          style={{ padding: '6px 12px', background: 'none', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)', borderRadius: 8, fontSize: 11, cursor: 'pointer' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function QueueRow({ incident, triage, onDecided }: {
  incident: QueueIncident; triage: boolean; onDecided: (mondayItemId: string) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const linkTo = incident.local_id ? `/incidents/${incident.local_id}` : `/staff/monday/${incident.monday_item_id}`;

  const approve = async () => {
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/staff/monday-incidents/${incident.monday_item_id}/approve`, { method: 'POST' });
      const j = await res.json();
      if (j.success) onDecided(incident.monday_item_id); else setError(j.message || 'Failed to approve.');
    } catch { setError('Network error.'); } finally { setBusy(false); }
  };

  const reject = async (reason: string) => {
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/staff/monday-incidents/${incident.monday_item_id}/reject`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
      });
      const j = await res.json();
      if (j.success) onDecided(incident.monday_item_id); else setError(j.message || 'Failed to reject.');
    } catch { setError('Network error.'); } finally { setBusy(false); }
  };

  return (
    <div style={{ background: BG2, border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <Link to={linkTo} style={{ textDecoration: 'none', color: 'inherit', flex: '1 1 220px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>
            {incident.name || '(unnamed)'} — {incident.incident_type || '(no type)'}
          </div>
          <div style={{ fontSize: 10, color: `${TEAL}88`, marginTop: 3 }}>
            {incident.country || 'Unknown location'}
            {incident.life_threatening && <span style={{ color: RED }}> · Urgent</span>}
            {incident.owner && <> · {incident.owner.full_name}</>}
            {!incident.local_id && ' · not opened through the app'}
          </div>
        </Link>
        {triage && !rejecting && (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              onClick={approve} disabled={busy}
              style={{ padding: '6px 14px', background: TEAL, color: BG, border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
            >
              Approve
            </button>
            <button
              onClick={() => setRejecting(true)} disabled={busy}
              style={{ padding: '6px 14px', background: 'none', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)', borderRadius: 8, fontSize: 11, cursor: 'pointer' }}
            >
              Reject
            </button>
          </div>
        )}
      </div>
      {triage && rejecting && <RejectForm busy={busy} onCancel={() => setRejecting(false)} onConfirm={reject} />}
      {error && <div style={{ color: RED, fontSize: 11, marginTop: 8 }}>{error}</div>}
    </div>
  );
}

export default function StaffIncidentQueuePage({ status, title, triage = false }: {
  status: string; title: string; triage?: boolean;
}) {
  const { user, loading: authLoading } = useAuth();
  const [incidents, setIncidents] = useState<QueueIncident[] | null>(null);
  const [error, setError] = useState('');

  const isAdmin = user?.roles.includes('admin') ?? false;

  if (authLoading) {
    return <div style={{ minHeight: '100dvh', background: BG }} />;
  }

  if (!user) {
    return (
      <div style={{ minHeight: '100dvh', background: BG, color: '#e2e8f0', fontFamily: MONO, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: BG2, border: '1px solid rgba(0,201,177,0.14)', borderRadius: 14, padding: '2rem', maxWidth: 380, textAlign: 'center' }}>
          <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: TEAL, marginBottom: '1rem' }}>◈ {title}</div>
          <p style={{ fontSize: 13, marginBottom: '1.25rem' }}>Log in with an admin account to continue.</p>
          <Link to="/login" style={{
            display: 'inline-block', padding: '0.75rem 1.5rem', background: TEAL, color: BG,
            borderRadius: 8, fontFamily: MONO, fontSize: 11, fontWeight: 700, textDecoration: 'none',
          }}>Log In →</Link>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div style={{ minHeight: '100dvh', background: BG, color: '#e2e8f0', fontFamily: MONO, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: BG2, border: '1px solid rgba(255,77,106,0.2)', borderRadius: 14, padding: '2rem', maxWidth: 380, textAlign: 'center' }}>
          <p style={{ fontSize: 13 }}>This page is admin-only.</p>
          <Link to="/staff/incidents" style={{ fontSize: 11, color: TEAL }}>← Back to Staff Console</Link>
        </div>
      </div>
    );
  }

  if (incidents === null) {
    fetch(`/api/staff/incidents-by-status?status=${encodeURIComponent(status)}`)
      .then(r => {
        if (r.status === 403) { setError('Forbidden'); return null; }
        return r.json();
      })
      .then(j => { if (j?.success) setIncidents(j.incidents); else if (j) setError('Failed to load.'); })
      .catch(() => setError('Network error.'));
  }

  const handleDecided = (mondayItemId: string) => {
    setIncidents(prev => (prev ? prev.filter(i => i.monday_item_id !== mondayItemId) : prev));
  };

  return (
    <div style={{ minHeight: '100dvh', background: BG, color: '#e2e8f0', fontFamily: MONO }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 10, background: `${BG}ee`, backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(0,201,177,0.12)', padding: '1rem 1.5rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 8,
      }}>
        <div style={{ whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: TEAL, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Haverim Mehalzim</span>
        </div>
        <Link to="/staff/overview" style={{ fontSize: 10, color: TEAL, textDecoration: 'none', whiteSpace: 'nowrap' }}>◈ Overview →</Link>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '2.5rem 1.5rem 5rem' }}>
        <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: TEAL, marginBottom: '1.25rem' }}>
          ◈ {title} {incidents ? `(${incidents.length})` : ''}
        </div>
        {error && <div style={{ color: RED, fontSize: 12, marginBottom: 16 }}>{error}</div>}
        {incidents === null && !error && <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Loading…</div>}
        {incidents !== null && incidents.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>Nothing here right now.</div>
        )}
        {incidents?.map(inc => (
          <QueueRow key={inc.monday_item_id} incident={inc} triage={triage} onDecided={handleDecided} />
        ))}
      </div>
    </div>
  );
}
