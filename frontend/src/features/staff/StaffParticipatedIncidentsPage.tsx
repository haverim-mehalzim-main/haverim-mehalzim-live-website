import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const MONO = "'JetBrains Mono', 'Courier New', monospace";
const BG   = '#06090f';
const BG2  = '#0c1420';
const TEAL = '#00c9b1';
const RED  = '#f87171';

interface ParticipatedIncident {
  local_id: number;
  monday_item_id: string;
  name: string;
  incident_type: string;
  country: string;
  life_threatening: boolean;
  incident_status_en: string;
}

function IncidentRow({ incident }: { incident: ParticipatedIncident }) {
  return (
    <Link
      to={`/incidents/${incident.local_id}`}
      style={{
        display: 'block', background: BG2, border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 10, padding: '1rem 1.25rem', marginBottom: 10, textDecoration: 'none', color: 'inherit',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>
            {incident.name || '(unnamed)'} — {incident.incident_type || '(no type)'}
          </div>
          <div style={{ fontSize: 10, color: `${TEAL}88`, marginTop: 3 }}>
            {incident.country || 'Unknown location'}
            {incident.life_threatening && <span style={{ color: RED }}> · Urgent</span>}
            {incident.incident_status_en && ` · ${incident.incident_status_en}`}
          </div>
        </div>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>→</span>
      </div>
    </Link>
  );
}

export default function StaffParticipatedIncidentsPage() {
  const { user, loading: authLoading } = useAuth();
  const [incidents, setIncidents] = useState<ParticipatedIncident[] | null>(null);
  const [error, setError] = useState('');

  const hasAccess = (user?.roles.includes('admin') || user?.roles.includes('volunteer')) ?? false;

  if (authLoading) {
    return <div style={{ minHeight: '100dvh', background: BG }} />;
  }

  if (!user) {
    return (
      <div style={{ minHeight: '100dvh', background: BG, color: '#e2e8f0', fontFamily: MONO, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: BG2, border: '1px solid rgba(0,201,177,0.14)', borderRadius: 14, padding: '2rem', maxWidth: 380, textAlign: 'center' }}>
          <p style={{ fontSize: 13, marginBottom: '1.25rem' }}>Log in to continue.</p>
          <Link to="/login" style={{ display: 'inline-block', padding: '0.75rem 1.5rem', background: TEAL, color: BG, borderRadius: 8, fontFamily: MONO, fontSize: 11, fontWeight: 700, textDecoration: 'none' }}>Log In →</Link>
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

  if (incidents === null && !error) {
    fetch('/api/staff/my-participated-incidents')
      .then(r => {
        if (r.status === 403) { setError('Forbidden'); return null; }
        return r.json();
      })
      .then(j => { if (j?.success) setIncidents(j.incidents); else if (j) setError('Failed to load.'); })
      .catch(() => setError('Network error.'));
  }

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
        <Link to="/staff/volunteer-dashboard" style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textDecoration: 'none', whiteSpace: 'nowrap' }}>← Back to Dashboard</Link>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '2.5rem 1.5rem 5rem' }}>
        <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: TEAL, marginBottom: '1.25rem' }}>
          ◈ Incidents You Participated In {incidents ? `(${incidents.length})` : ''}
        </div>
        {error && <div style={{ color: RED, fontSize: 12, marginBottom: 16 }}>{error}</div>}
        {incidents === null && !error && <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Loading…</div>}
        {incidents !== null && incidents.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>
            You haven&apos;t been approved to assist any incidents yet.
          </div>
        )}
        {incidents?.map(inc => <IncidentRow key={inc.local_id} incident={inc} />)}
      </div>
    </div>
  );
}
