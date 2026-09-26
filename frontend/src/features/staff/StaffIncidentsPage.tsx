import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const MONO = "'JetBrains Mono', 'Courier New', monospace";
const BG   = '#06090f';
const BG2  = '#0c1420';
const TEAL = '#00c9b1';
const AMBER = '#ffb930';

interface DashboardData {
  done_count: number;
  in_progress_count: number;
  my_participated_count: number;
}

function StatTile({ label, count, to, color }: { label: string; count: number; to?: string; color: string }) {
  const tileStyle: React.CSSProperties = {
    flex: '1 1 160px', background: BG2, border: `1px solid ${color}44`,
    borderRadius: 10, padding: '18px 16px', textAlign: 'center', textDecoration: 'none', display: 'block',
  };
  const inner = (
    <>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{count}</div>
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 6, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</div>
    </>
  );
  return to ? <Link to={to} style={tileStyle}>{inner}</Link> : <div style={tileStyle}>{inner}</div>;
}

export default function StaffIncidentsPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  const isAdmin     = user?.roles.includes('admin') ?? false;
  const isVolunteer = user?.roles.includes('volunteer') ?? false;
  const hasAccess   = isAdmin || isVolunteer;

  useEffect(() => {
    if (isAdmin) navigate('/staff/overview', { replace: true });
  }, [isAdmin, navigate]);

  if (authLoading) {
    return <div style={{ minHeight: '100dvh', background: BG }} />;
  }

  if (!user) {
    return (
      <div style={{ minHeight: '100dvh', background: BG, color: '#e2e8f0', fontFamily: MONO, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: BG2, border: '1px solid rgba(0,201,177,0.14)', borderRadius: 14, padding: '2rem', maxWidth: 380, textAlign: 'center' }}>
          <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: TEAL, marginBottom: '1rem' }}>◈ Volunteer Dashboard</div>
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

  if (isAdmin) {
    return <div style={{ minHeight: '100dvh', background: BG }} />;
  }

  if (data === null && !error) {
    fetch('/api/staff/volunteer-dashboard')
      .then(r => {
        if (r.status === 403) { setError('Forbidden'); return null; }
        return r.json();
      })
      .then(j => { if (j?.success) setData(j); else if (j) setError('Failed to load.'); })
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
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.12em', marginLeft: 12 }}>VOLUNTEER DASHBOARD</span>
        </div>
        <Link to="/account" style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textDecoration: 'none', whiteSpace: 'nowrap' }}>← My Account</Link>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '2.5rem 1.5rem 5rem' }}>
        {error && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 16 }}>{error}</div>}
        {data === null && !error && <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Loading…</div>}

        {data !== null && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <StatTile label="Done" count={data.done_count} color="rgba(255,255,255,0.5)" />
            <StatTile label="In Progress" count={data.in_progress_count} to="/staff/in-progress" color={AMBER} />
            <StatTile label="You Participated In" count={data.my_participated_count} to="/staff/participated" color={TEAL} />
          </div>
        )}
      </div>
    </div>
  );
}
