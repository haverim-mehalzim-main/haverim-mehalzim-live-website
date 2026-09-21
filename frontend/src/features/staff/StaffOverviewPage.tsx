import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const MONO = "'JetBrains Mono', 'Courier New', monospace";
const BG   = '#06090f';
const BG2  = '#0c1420';
const TEAL = '#00c9b1';
const AMBER = '#ffb930';
const RED = '#f87171';

interface OverviewData {
  total_incidents: number;
  incident_status_counts: Record<string, number>;
  ccc_workload: [string, number][];
  manager_workload: [string, number][];
  supervisor_workload: [string, number][];
  stuck_incidents: { id: string; name: string; incident_manager: string }[];
  pending_volunteer_total: number;
  pending_volunteer_incidents: { incident_id: number; incident_name: string; count: number; oldest_requested_at: string }[];
}

const STATUS_COLORS: Record<string, string> = {
  'New Request by User': TEAL,
  'Working on it': AMBER,
  'Live': '#4da6ff',
  'Stuck': RED,
  'Done': 'rgba(255,255,255,0.35)',
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: TEAL, marginBottom: '1.1rem' }}>
      ◈ {children}
    </div>
  );
}

function WorkloadList({ title, data }: { title: string; data: [string, number][] }) {
  return (
    <div style={{ flex: '1 1 200px', minWidth: 200 }}>
      <div style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 10 }}>
        {title}
      </div>
      {data.length === 0 ? (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>No active cases assigned.</div>
      ) : (
        data.map(([name, count]) => (
          <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 12 }}>
            <span style={{ color: '#e2e8f0' }}>{name}</span>
            <span style={{ color: TEAL, fontWeight: 700 }}>{count}</span>
          </div>
        ))
      )}
    </div>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function StaffOverviewPage() {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState('');

  const isAdmin = user?.roles.includes('admin') ?? false;

  if (authLoading) {
    return <div style={{ minHeight: '100dvh', background: BG }} />;
  }

  if (!user) {
    return (
      <div style={{ minHeight: '100dvh', background: BG, color: '#e2e8f0', fontFamily: MONO, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: BG2, border: '1px solid rgba(0,201,177,0.14)', borderRadius: 14, padding: '2rem', maxWidth: 380, textAlign: 'center' }}>
          <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: TEAL, marginBottom: '1rem' }}>◈ Management Overview</div>
          <p style={{ fontSize: 13, marginBottom: '1.25rem' }}>Log in with an admin account to continue.</p>
          <Link to="/login?next=/staff/overview" style={{
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
          <p style={{ fontSize: 13 }}>This overview is admin-only.</p>
          <Link to="/staff/incidents" style={{ fontSize: 11, color: TEAL }}>← Back to Staff Console</Link>
        </div>
      </div>
    );
  }

  if (data === null) {
    fetch('/api/staff/overview')
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
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.12em', marginLeft: 12 }}>MANAGEMENT OVERVIEW</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <Link to="/staff/incidents" style={{ fontSize: 10, color: TEAL, textDecoration: 'none', whiteSpace: 'nowrap' }}>◈ Staff Console →</Link>
          <Link to="/account" style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textDecoration: 'none', whiteSpace: 'nowrap' }}>← My Account</Link>
        </div>
      </div>

      <div style={{ maxWidth: 780, margin: '0 auto', padding: '2.5rem 1.5rem 5rem' }}>
        {error && <div style={{ color: RED, fontSize: 12, marginBottom: 16 }}>{error}</div>}
        {data === null && !error && <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Loading…</div>}

        {data !== null && (
          <>
            <div style={{ marginBottom: '2.5rem' }}>
              <SectionTitle>Pipeline ({data.total_incidents} total on the board)</SectionTitle>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {Object.entries(data.incident_status_counts).map(([status, count]) => (
                  <div key={status} style={{
                    flex: '1 1 100px', background: BG2, border: `1px solid ${STATUS_COLORS[status] ?? 'rgba(255,255,255,0.1)'}44`,
                    borderRadius: 10, padding: '14px 12px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: STATUS_COLORS[status] ?? '#e2e8f0' }}>{count}</div>
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 4, letterSpacing: '0.04em' }}>{status}</div>
                  </div>
                ))}
              </div>
            </div>

            {data.stuck_incidents.length > 0 && (
              <div style={{ marginBottom: '2.5rem' }}>
                <SectionTitle>Stuck Cases ({data.stuck_incidents.length})</SectionTitle>
                <div style={{ background: BG2, border: '1px solid rgba(248,113,113,0.25)', borderRadius: 10, padding: '0.5rem 1.25rem' }}>
                  {data.stuck_incidents.map(inc => (
                    <div key={inc.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 12 }}>
                      <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{inc.name}</span>
                      <span style={{ color: 'rgba(255,255,255,0.4)' }}>{inc.incident_manager || 'Unassigned'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginBottom: '2.5rem' }}>
              <SectionTitle>Workload (active, non-Done cases)</SectionTitle>
              <div style={{ background: BG2, border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '1.25rem', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <WorkloadList title="CCC Officials" data={data.ccc_workload} />
                <WorkloadList title="Incident Managers" data={data.manager_workload} />
                <WorkloadList title="Supervisors" data={data.supervisor_workload} />
              </div>
            </div>

            <div>
              <SectionTitle>
                Volunteer Approvals {data.pending_volunteer_total > 0 ? `(${data.pending_volunteer_total} pending)` : ''}
              </SectionTitle>
              {data.pending_volunteer_incidents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255,255,255,0.2)', fontSize: 12, background: BG2, borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)' }}>
                  No volunteers waiting on approval right now.
                </div>
              ) : (
                <div style={{ background: BG2, border: '1px solid rgba(255,185,48,0.25)', borderRadius: 10, padding: '0.5rem 1.25rem' }}>
                  {data.pending_volunteer_incidents.map(p => (
                    <Link
                      key={p.incident_id} to={`/incidents/${p.incident_id}`}
                      style={{
                        display: 'flex', justifyContent: 'space-between', padding: '10px 0',
                        borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 12, textDecoration: 'none', color: 'inherit',
                      }}
                    >
                      <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{p.incident_name}</span>
                      <span style={{ color: AMBER }}>
                        {p.count} waiting · oldest {timeAgo(p.oldest_requested_at)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
