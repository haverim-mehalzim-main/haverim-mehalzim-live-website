import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { StaffGate, StaffShell } from './StaffShell';
import { useStaffData } from './useStaffData';

interface MondayIncident {
  monday_item_id: string;
  name: string;
  patient_age: string;
  patient_gender: string | null;
  patient_phone: string;
  filer_info: string;
  incident_type: string;
  country: string;
  description: string;
  life_threatening: boolean;
  incident_status_en: string;
  case_stage_en: string;
  insurance_en: string;
  combat_service_en: string;
  call_source_en: string;
  ccc_official_en: string;
  incident_manager_en: string;
  supervisor_en: string;
  in_request_at: string;
  closed_at: string;
  rejection_reason: string | null;
}

interface DetailResponse { incident: MondayIncident; local_id: number | null }

const STATUS_TONES: Record<string, string> = { 'Working on it': 'amber', Done: 'green', Rejected: 'red', 'New Request by User': 'accent' };

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="staff-kv">
      <span className="staff-kv-label">{label}</span>
      <span className="staff-kv-value">{value}</span>
    </div>
  );
}

function TriagePanel({ mondayItemId, onDecided }: { mondayItemId: string; onDecided: (status: string) => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const decide = async (action: 'approve' | 'reject') => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/staff/monday-incidents/${mondayItemId}/${action}`, {
        method: 'POST',
        headers: action === 'reject' ? { 'Content-Type': 'application/json' } : undefined,
        body: action === 'reject' ? JSON.stringify({ reason: reason.trim() }) : undefined,
      });
      const j = await res.json();
      if (j.success) onDecided(action === 'approve' ? 'Working on it' : 'Rejected');
      else setError(j.message || `Couldn't ${action} this request.`);
    } catch {
      setError('Network error.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="staff-section">
      <h2 className="staff-section-title">Decision</h2>
      <div className="staff-card staff-card-pad">
        {error && <div className="staff-error">{error}</div>}
        {!rejecting ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="staff-btn staff-btn--primary" disabled={busy} onClick={() => decide('approve')}>Approve and start work</button>
            <button className="staff-btn staff-btn--danger" disabled={busy} onClick={() => setRejecting(true)}>Decline</button>
          </div>
        ) : (
          <>
            <textarea
              className="staff-field" value={reason} onChange={e => setReason(e.target.value)} autoFocus
              placeholder="Why this request is being declined. The caller will see this."
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="staff-btn staff-btn--danger-solid" disabled={busy || !reason.trim()} onClick={() => decide('reject')}>Decline request</button>
              <button className="staff-btn" disabled={busy} onClick={() => setRejecting(false)}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function MondayIncidentDetail({ mondayItemId }: { mondayItemId: string }) {
  const { data, setData, error } = useStaffData<DetailResponse>(`/api/staff/monday-incidents/${mondayItemId}`);
  const inc = data?.incident;

  const back = (
    <Link to="/staff/admin-dashboard" className="staff-btn">Back to dashboard</Link>
  );

  return (
    <StaffShell title={inc?.name || 'Incident'} subtitle={inc ? 'Not opened through the app' : undefined} actions={back}>
      {error && <div className="staff-error">{error}</div>}
      {!inc && !error && <div className="staff-loading">Loading…</div>}

      {data && data.local_id && (
        <div className="staff-card staff-card-pad">
          This incident was opened through the app. <Link to={`/incidents/${data.local_id}`} style={{ color: 'var(--s-accent)' }}>Open its full page</Link>
        </div>
      )}

      {inc && !data?.local_id && (
        <>
          <section className="staff-section">
            <div className="staff-card staff-card-pad">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {inc.incident_status_en && <span className="staff-badge" data-tone={STATUS_TONES[inc.incident_status_en]}>{inc.incident_status_en}</span>}
                {inc.incident_type && <span className="staff-badge">{inc.incident_type}</span>}
                {inc.life_threatening && <span className="staff-badge" data-tone="red">Urgent</span>}
              </div>
              {inc.rejection_reason && inc.incident_status_en === 'Rejected' && (
                <div className="staff-error">Declined. Reason given: {inc.rejection_reason}</div>
              )}
              {inc.description ? <p style={{ whiteSpace: 'pre-wrap' }}>{inc.description}</p> : <p className="staff-row-meta">No description.</p>}
            </div>
          </section>

          {inc.incident_status_en === 'New Request by User' && (
            <TriagePanel
              mondayItemId={inc.monday_item_id}
              onDecided={status => setData(prev => (prev ? { ...prev, incident: { ...prev.incident, incident_status_en: status } } : prev))}
            />
          )}

          <section className="staff-section">
            <h2 className="staff-section-title">Case details</h2>
            <div className="staff-card staff-card-pad staff-detail-grid">
              <div>
                <Field label="Patient age" value={inc.patient_age} />
                <Field label="Patient gender" value={inc.patient_gender} />
                <Field label="Patient phone" value={inc.patient_phone} />
                <Field label="Reported by" value={inc.filer_info} />
                <Field label="Country" value={inc.country} />
                <Field label="Requested" value={inc.in_request_at} />
                <Field label="Closed" value={inc.closed_at} />
              </div>
              <div>
                <Field label="Case stage" value={inc.case_stage_en} />
                <Field label="Combat service" value={inc.combat_service_en} />
                <Field label="Referral source" value={inc.call_source_en} />
                <Field label="Insurance" value={inc.insurance_en} />
                <Field label="CCC official" value={inc.ccc_official_en} />
                <Field label="Incident manager" value={inc.incident_manager_en} />
                <Field label="Supervisor" value={inc.supervisor_en} />
              </div>
            </div>
          </section>
        </>
      )}
    </StaffShell>
  );
}

export default function MondayIncidentDetailPage() {
  const { mondayItemId } = useParams<{ mondayItemId: string }>();
  return (
    <StaffGate allow="admin">
      <MondayIncidentDetail mondayItemId={mondayItemId ?? ''} />
    </StaffGate>
  );
}
