import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const MONO = "'JetBrains Mono', 'Courier New', monospace";
const BG   = '#06090f';
const BG2  = '#0c1420';
const TEAL = '#00c9b1';
const AMBER = '#ffb930';

interface IncidentRow {
  id: number;
  monday_item_id: string;
  incident_type: string;
  location: string;
  handled: boolean;
  found_on_monday: boolean;
  owner: { email: string; full_name: string } | null;
  patient_name: string;
  patient_age: string;
  patient_gender: string;
  patient_phone: string;
  filer_info: string;
  pending_volunteer_requests: number;
}

function IncidentRowCard({ incident }: { incident: IncidentRow }) {
  return (
    <Link
      to={`/incidents/${incident.id}`}
      style={{
        display: 'block', background: BG2,
        border: `1px solid ${incident.pending_volunteer_requests > 0 ? 'rgba(255,185,48,0.35)' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 10, padding: '1rem 1.25rem', marginBottom: 10, textDecoration: 'none', color: 'inherit',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>
            {incident.incident_type || '(no type)'} — {incident.location || '(no location)'}
          </div>
          <div style={{ fontSize: 10, color: `${TEAL}88`, marginTop: 3 }}>
            {incident.owner ? `${incident.owner.full_name} · ${incident.owner.email}` : 'no owner'}
            {!incident.found_on_monday && ' · ⚠ not found on Monday'}
          </div>
          {(incident.patient_name || incident.filer_info) && (
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 3 }}>
              {incident.patient_name && `Patient: ${incident.patient_name}${incident.patient_age ? `, ${incident.patient_age}` : ''}${incident.patient_gender ? `, ${incident.patient_gender}` : ''}${incident.patient_phone ? ` · ${incident.patient_phone}` : ''}`}
              {incident.patient_name && incident.filer_info && '  ·  '}
              {incident.filer_info && `Filed by: ${incident.filer_info}`}
            </div>
          )}
          {incident.pending_volunteer_requests > 0 && (
            <div style={{
              display: 'inline-block', marginTop: 6, fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase',
              fontWeight: 700, color: AMBER, background: 'rgba(255,185,48,0.12)', border: '1px solid rgba(255,185,48,0.28)',
              borderRadius: 100, padding: '2px 8px',
            }}>
              ⏳ {incident.pending_volunteer_requests} volunteer{incident.pending_volunteer_requests > 1 ? 's' : ''} awaiting approval
            </div>
          )}
        </div>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>→</span>
      </div>
    </Link>
  );
}

export default function StaffIncidentsPage() {
  const { user, loading: authLoading } = useAuth();
  const [incidents, setIncidents] = useState<IncidentRow[] | null>(null);
  const [error, setError] = useState('');

  const isAdmin     = user?.roles.includes('admin') ?? false;
  const isVolunteer = user?.roles.includes('volunteer') ?? false;
  const hasAccess   = isAdmin || isVolunteer;

  if (authLoading) {
    return <div style={{ minHeight: '100dvh', background: BG }} />;
  }

  if (!user) {
    return (
      <div style={{ minHeight: '100dvh', background: BG, color: '#e2e8f0', fontFamily: MONO, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: BG2, border: '1px solid rgba(0,201,177,0.14)', borderRadius: 14, padding: '2rem', maxWidth: 380, textAlign: 'center' }}>
          <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: TEAL, marginBottom: '1rem' }}>◈ Staff Console</div>
          <p style={{ fontSize: 13, marginBottom: '1.25rem' }}>Log in with your staff account to continue.</p>
          <Link to="/login?next=/staff/incidents" style={{
            display: 'inline-block', padding: '0.75rem 1.5rem', background: TEAL, color: BG,
            borderRadius: 8, fontFamily: MONO, fontSize: 11, fontWeight: 700, textDecoration: 'none',
          }}>Log In →</Link>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div style={{ minHeight: '100dvh', background: BG, color: '#e2e8f0', fontFamily: MONO, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: BG2, border: '1px solid rgba(255,77,106,0.2)', borderRadius: 14, padding: '2rem', maxWidth: 380, textAlign: 'center' }}>
          <p style={{ fontSize: 13 }}>Your account doesn&apos;t have staff access.</p>
          <Link to="/account" style={{ fontSize: 11, color: TEAL }}>← Back to My Account</Link>
        </div>
      </div>
    );
  }

  if (incidents === null) {
    fetch('/api/staff/incidents')
      .then(r => {
        if (r.status === 403) { setError('Forbidden'); return null; }
        return r.json();
      })
      .then(j => { if (j?.success) setIncidents(j.incidents); else if (j) setError('Failed to load.'); })
      .catch(() => setError('Network error.'));
  }

  const totalPending = incidents?.reduce((sum, inc) => sum + inc.pending_volunteer_requests, 0) ?? 0;

  return (
    <div style={{ minHeight: '100dvh', background: BG, color: '#e2e8f0', fontFamily: MONO }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 10, background: `${BG}ee`, backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(0,201,177,0.12)', padding: '1rem 1.5rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 8,
      }}>
        <div style={{ whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: TEAL, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Haverim Mehalzim</span>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.12em', marginLeft: 12 }}>
            {isAdmin ? 'ADMIN CONSOLE' : 'VOLUNTEER CONSOLE'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          {isAdmin && totalPending > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: AMBER, background: 'rgba(255,185,48,0.12)',
              border: '1px solid rgba(255,185,48,0.28)', borderRadius: 100, padding: '4px 10px', whiteSpace: 'nowrap',
            }}>
              ⏳ {totalPending} pending volunteer request{totalPending > 1 ? 's' : ''}
            </span>
          )}
          {isAdmin && (
            <Link to="/staff/overview" style={{ fontSize: 10, color: TEAL, textDecoration: 'none', whiteSpace: 'nowrap' }}>◈ Overview →</Link>
          )}
          <Link to="/account" style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textDecoration: 'none', whiteSpace: 'nowrap' }}>← My Account</Link>
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '2.5rem 1.5rem 5rem' }}>
        {error && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 16 }}>{error}</div>}
        {incidents === null && !error && <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Loading…</div>}

        {incidents !== null && (
          <>
            <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: TEAL, marginBottom: '1.25rem' }}>
              ◈ Incidents opened through accounts ({incidents.length})
            </div>
            {incidents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>
                No incidents have been opened through the account dashboard yet.
              </div>
            ) : (
              incidents.map(inc => <IncidentRowCard key={inc.id} incident={inc} />)
            )}
          </>
        )}
      </div>
    </div>
  );
}
