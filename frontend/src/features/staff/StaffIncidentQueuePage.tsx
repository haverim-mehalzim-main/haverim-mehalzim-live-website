import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { StaffGate, StaffShell } from './StaffShell';
import { MarkDoneButton } from './MarkDoneButton';
import { useStaffData } from './useStaffData';

interface QueueIncident {
  monday_item_id: string;
  local_id: number | null;
  name: string;
  incident_type: string;
  country: string;
  life_threatening: boolean;
  owner: { email: string; full_name: string } | null;
}

function RejectForm({ onConfirm, onCancel, busy }: {
  onConfirm: (reason: string) => void; onCancel: () => void; busy: boolean;
}) {
  const [reason, setReason] = useState('');
  return (
    <div className="staff-reject">
      <textarea
        className="staff-field" value={reason} onChange={e => setReason(e.target.value)} autoFocus
        placeholder="Why this request is being declined. The caller will see this."
      />
      <button className="staff-btn staff-btn--danger-solid" disabled={busy || !reason.trim()} onClick={() => onConfirm(reason.trim())}>
        Decline request
      </button>
      <button className="staff-btn" disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
  );
}

function QueueRow({ incident, triage, canComplete, onDecided }: {
  incident: QueueIncident; triage: boolean; canComplete: boolean; onDecided: (mondayItemId: string) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const linkTo = incident.local_id ? `/incidents/${incident.local_id}` : `/staff/monday/${incident.monday_item_id}`;

  const decide = async (action: 'approve' | 'reject', body?: object) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/staff/monday-incidents/${incident.monday_item_id}/${action}`, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = await res.json();
      if (j.success) onDecided(incident.monday_item_id);
      else setError(j.message || `Couldn't ${action} this request.`);
    } catch {
      setError('Network error.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="staff-row">
        <Link to={linkTo} className="staff-row-main">
          <div className="staff-row-title">{incident.name || '(unnamed)'}</div>
          <div className="staff-row-meta">
            {[incident.incident_type, incident.country, incident.owner?.full_name].filter(Boolean).join(' · ')}
          </div>
        </Link>
        <div className="staff-row-end">
          {incident.life_threatening && <span className="staff-badge" data-tone="red">Urgent</span>}
          {triage && !rejecting ? (
            <>
              <button className="staff-btn staff-btn--primary" disabled={busy} onClick={() => decide('approve')}>Approve</button>
              <button className="staff-btn staff-btn--danger" disabled={busy} onClick={() => setRejecting(true)}>Decline</button>
            </>
          ) : (
            !triage && (
              <>
                {canComplete && (
                  <MarkDoneButton
                    mondayItemId={incident.monday_item_id}
                    incidentName={incident.name}
                    onDone={() => onDecided(incident.monday_item_id)}
                  />
                )}
                <span className="staff-chevron">›</span>
              </>
            )
          )}
        </div>
      </div>
      {triage && rejecting && (
        <RejectForm busy={busy} onCancel={() => setRejecting(false)} onConfirm={reason => decide('reject', { reason })} />
      )}
      {error && <div className="staff-error" style={{ margin: '0 16px 12px' }}>{error}</div>}
    </div>
  );
}

function Queue({ status, title, subtitle, triage }: { status: string; title: string; subtitle: string; triage: boolean }) {
  const { data, setData, error } = useStaffData<{ incidents: QueueIncident[] }>(
    `/api/staff/incidents-by-status?status=${encodeURIComponent(status)}`,
  );
  const incidents = data?.incidents ?? null;
  const { user } = useAuth();
  // Only an admin can close a case, and only one that is in progress.
  const canComplete = user?.primary_role === 'admin' && !triage && status === 'Working on it';

  const handleDecided = (mondayItemId: string) =>
    setData(prev => (prev ? { ...prev, incidents: prev.incidents.filter(i => i.monday_item_id !== mondayItemId) } : prev));

  return (
    <StaffShell title={title} subtitle={incidents ? `${incidents.length} ${subtitle}` : undefined}>
      {error && <div className="staff-error">{error}</div>}
      {!incidents && !error && <div className="staff-loading">Loading…</div>}
      {incidents && (
        <div className="staff-card">
          {incidents.length === 0 ? (
            <div className="staff-empty">Nothing here right now.</div>
          ) : (
            incidents.map(inc => <QueueRow key={inc.monday_item_id} incident={inc} triage={triage} canComplete={canComplete} onDecided={handleDecided} />)
          )}
        </div>
      )}
    </StaffShell>
  );
}

export default function StaffIncidentQueuePage({ status, title, triage = false, allowVolunteer = false }: {
  status: string; title: string; triage?: boolean; allowVolunteer?: boolean;
}) {
  return (
    <StaffGate allow={allowVolunteer ? 'staff' : 'admin'}>
      <Queue
        status={status}
        title={title}
        triage={triage}
        subtitle={triage ? 'waiting for a decision' : 'open'}
      />
    </StaffGate>
  );
}
