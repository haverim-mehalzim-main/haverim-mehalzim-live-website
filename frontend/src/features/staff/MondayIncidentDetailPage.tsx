import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import '../account/account.css';

const MONO = "'JetBrains Mono', 'Courier New', monospace";
const BG   = '#06090f';
const BG2  = '#0c1420';
const TEAL = '#00c9b1';
const RED  = '#f87171';

interface MondayIncident {
  monday_item_id: string;
  name: string;
  patient_name: string;
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

function FieldRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="account-field-row">
      <span className="account-field-row-label">{label}</span>
      <span className="account-field-row-value">{value}</span>
    </div>
  );
}

function TriagePanel({ mondayItemId, onDecided }: { mondayItemId: string; onDecided: (status: string) => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const approve = async () => {
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/staff/monday-incidents/${mondayItemId}/approve`, { method: 'POST' });
      const j = await res.json();
      if (j.success) onDecided('Working on it'); else setError(j.message || 'Failed to approve.');
    } catch { setError('Network error.'); } finally { setBusy(false); }
  };

  const reject = async () => {
    if (!reason.trim()) return;
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/staff/monday-incidents/${mondayItemId}/reject`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.trim() }),
      });
      const j = await res.json();
      if (j.success) onDecided('Rejected'); else setError(j.message || 'Failed to reject.');
    } catch { setError('Network error.'); } finally { setBusy(false); }
  };

  return (
    <div className="account-card">
      <div className="account-section-title" style={{ marginBottom: 14 }}>◈ Triage This Request</div>
      {!rejecting ? (
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={approve} disabled={busy}
            className="account-submit" style={{ width: 'auto', padding: '8px 18px', fontSize: 12 }}
          >
            Approve — Start Working On It
          </button>
          <button
            onClick={() => setRejecting(true)} disabled={busy}
            style={{ padding: '8px 18px', background: 'none', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}
          >
            Reject
          </button>
        </div>
      ) : (
        <div>
          <label className="account-label">
            Reason for declining (the caller will see this)
            <textarea
              className="account-textarea" value={reason} onChange={e => setReason(e.target.value)} autoFocus
            />
          </label>
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button
              onClick={reject} disabled={busy || !reason.trim()}
              style={{ padding: '8px 18px', background: RED, color: '#1a0505', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              Confirm Reject
            </button>
            <button
              onClick={() => setRejecting(false)} disabled={busy}
              style={{ padding: '8px 18px', background: 'none', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <div style={{ color: RED, fontSize: 12, marginTop: 10 }}>{error}</div>}
    </div>
  );
}

export default function MondayIncidentDetailPage() {
  const { mondayItemId } = useParams<{ mondayItemId: string }>();
  const { user, loading: authLoading } = useAuth();
  const [incident, setIncident] = useState<MondayIncident | null>(null);
  const [localId, setLocalId] = useState<number | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'not_found' | 'forbidden'>('loading');

  const isAdmin = user?.roles.includes('admin') ?? false;

  if (authLoading) {
    return <div style={{ minHeight: '100dvh', background: BG }} />;
  }

  if (user && isAdmin && state === 'loading') {
    fetch(`/api/staff/monday-incidents/${mondayItemId}`)
      .then(r => {
        if (r.status === 403) { setState('forbidden'); return null; }
        if (r.status === 404) { setState('not_found'); return null; }
        return r.json();
      })
      .then(j => {
        if (j?.success) {
          setIncident(j.incident);
          setLocalId(j.local_id);
          setState('ok');
        }
      })
      .catch(() => setState('not_found'));
  }

  if (!user) {
    return (
      <div style={{ minHeight: '100dvh', background: BG, color: '#e2e8f0', fontFamily: MONO, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: BG2, border: '1px solid rgba(0,201,177,0.14)', borderRadius: 14, padding: '2rem', maxWidth: 380, textAlign: 'center' }}>
          <p style={{ fontSize: 13, marginBottom: '1.25rem' }}>Log in with an admin account to continue.</p>
          <Link to="/login" style={{ display: 'inline-block', padding: '0.75rem 1.5rem', background: TEAL, color: BG, borderRadius: 8, fontFamily: MONO, fontSize: 11, fontWeight: 700, textDecoration: 'none' }}>Log In →</Link>
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

  if (localId) {
    return (
      <div style={{ minHeight: '100dvh', background: BG, color: '#e2e8f0', fontFamily: MONO, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 13, marginBottom: 12 }}>This incident was opened through the app — view it there instead.</p>
          <Link to={`/incidents/${localId}`} style={{ fontSize: 12, color: TEAL }}>Go to incident page →</Link>
        </div>
      </div>
    );
  }

  if (state !== 'ok' || !incident) {
    return (
      <div style={{ minHeight: '100dvh', background: BG, color: '#e2e8f0', fontFamily: MONO, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: BG2, border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '2rem', maxWidth: 380, textAlign: 'center' }}>
          <p style={{ fontSize: 13 }}>
            {state === 'not_found' ? "We couldn't find this incident on Monday.com." : state === 'forbidden' ? 'Forbidden.' : 'Loading…'}
          </p>
        </div>
      </div>
    );
  }

  const inc = incident;

  return (
    <div style={{ minHeight: '100dvh', background: BG, color: '#e2e8f0', fontFamily: MONO }}>
      <div className="account-page">
        <div className="account-wrapper">
          <nav className="account-nav">
            <Link to="/staff/incidents" className="account-back">← Back to Staff Console</Link>
            <div className="account-nav-brand"><span className="account-nav-brand-dot" />Haverim Mehalzim</div>
          </nav>

          <div className="account-card">
            <div className="account-incident-top">
              <div className="account-incident-type">{inc.incident_type || 'Case'}</div>
              <div>
                <span className="account-incident-badge account-incident-badge--ongoing">{inc.incident_status_en}</span>
                {inc.life_threatening && <span className="account-incident-badge account-incident-badge--urgent">Urgent</span>}
              </div>
            </div>
            <div className="account-incident-meta" style={{ marginBottom: 14 }}>
              {inc.country || 'Unknown location'} · not opened through the app
            </div>
            {inc.description && (
              <>
                <div className="account-detail-desc-label">What happened</div>
                <p className="account-detail-desc-text">{inc.description}</p>
              </>
            )}
            <div className="account-detail-grid">
              {inc.patient_name && (
                <div>
                  <div className="account-detail-item-label">Patient / missing person</div>
                  <div className="account-detail-item-value">
                    {inc.patient_name}
                    {inc.patient_age ? `, age ${inc.patient_age}` : ''}
                    {inc.patient_gender ? ` (${inc.patient_gender})` : ''}
                  </div>
                </div>
              )}
              {inc.patient_phone && (
                <div>
                  <div className="account-detail-item-label">Patient phone</div>
                  <div className="account-detail-item-value">{inc.patient_phone}</div>
                </div>
              )}
              {inc.filer_info && (
                <div>
                  <div className="account-detail-item-label">Filed by</div>
                  <div className="account-detail-item-value">{inc.filer_info}</div>
                </div>
              )}
            </div>
          </div>

          <div className="account-card">
            <div className="account-section-title" style={{ marginBottom: 14 }}>◈ Case Details</div>
            {inc.rejection_reason && inc.incident_status_en === 'Rejected' && (
              <p style={{ fontSize: 12, color: 'var(--accent-red)', marginBottom: 12 }}>
                Rejected — reason given: {inc.rejection_reason}
              </p>
            )}
            <div className="account-field-groups">
              <div className="account-field-group-title">Classification</div>
              <div className="account-field-group-title">Location &amp; Timeline</div>
              <div>
                <FieldRow label="Incident status" value={inc.incident_status_en} />
                <FieldRow label="Case stage" value={inc.case_stage_en} />
                <FieldRow label="Combat service" value={inc.combat_service_en} />
                <FieldRow label="Referral source" value={inc.call_source_en} />
              </div>
              <div>
                <FieldRow label="Country" value={inc.country} />
                <FieldRow label="Requested" value={inc.in_request_at} />
                <FieldRow label="Closed" value={inc.closed_at} />
              </div>

              <div className="account-field-group-title">Team</div>
              <div className="account-field-group-title">Contacts &amp; Insurance</div>
              <div>
                <FieldRow label="CCC Official" value={inc.ccc_official_en} />
                <FieldRow label="Incident Manager" value={inc.incident_manager_en} />
                <FieldRow label="Supervisor" value={inc.supervisor_en} />
              </div>
              <div>
                <FieldRow label="Caller" value={inc.filer_info} />
                <FieldRow label="Insurance" value={inc.insurance_en} />
              </div>
            </div>
          </div>

          {inc.incident_status_en === 'New Request by User' && (
            <TriagePanel
              mondayItemId={inc.monday_item_id}
              onDecided={(status) => setIncident(prev => (prev ? { ...prev, incident_status_en: status } : prev))}
            />
          )}
        </div>
      </div>
    </div>
  );
}
