import { Link } from 'react-router-dom';
import { StaffGate, StaffShell } from './StaffShell';
import { useStaffData } from './useStaffData';

interface VolunteerRequester {
  request_id: number;
  full_name: string | null;
  email: string | null;
  requested_at: string;
}

interface AdminDashboardData {
  total_incidents: number;
  incident_status_counts: Record<string, number>;
  ccc_workload: [string, number][];
  manager_workload: [string, number][];
  supervisor_workload: [string, number][];
  pending_volunteer_total: number;
  pending_volunteer_incidents: {
    incident_id: number; incident_name: string; count: number; oldest_requested_at: string;
    requesters: VolunteerRequester[];
  }[];
}

const STATUS_TONES: Record<string, string> = {
  'New Request by User': 'accent',
  'Working on it': 'amber',
  'Done': 'green',
  'Rejected': 'red',
};

// The server returns JSON keys alphabetically; the pipeline reads in this order.
const STATUS_ORDER = ['New Request by User', 'Working on it', 'Done', 'Rejected'];
const orderedStatuses = (counts: Record<string, number>) =>
  Object.entries(counts).sort(([a], [b]) => {
    const ia = STATUS_ORDER.indexOf(a);
    const ib = STATUS_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

// Pipeline stages an admin can open as a full queue; Done and Rejected are
// just counts.
const STATUS_LINKS: Record<string, string> = {
  'New Request by User': '/staff/requests',
  'Working on it': '/staff/in-progress',
};

function WorkloadColumn({ title, data }: { title: string; data: [string, number][] }) {
  return (
    <div className="staff-col">
      <div className="staff-col-title">{title}</div>
      {data.length === 0 ? (
        <div className="staff-row-meta">No active cases assigned.</div>
      ) : (
        data.map(([name, count]) => (
          <div key={name} className="staff-kv">
            <span>{name}</span>
            <strong>{count}</strong>
          </div>
        ))
      )}
    </div>
  );
}

function timeAgo(iso: string): string {
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function AdminDashboard() {
  const { data, error } = useStaffData<AdminDashboardData>('/api/staff/admin-dashboard');

  return (
    <StaffShell
      title="Admin dashboard"
      subtitle={data ? `${data.total_incidents} incidents on the board` : undefined}
    >
      {error && <div className="staff-error">{error}</div>}
      {!data && !error && <div className="staff-loading">Loading…</div>}

      {data && (
        <>
          <section className="staff-section">
            <h2 className="staff-section-title">Pipeline</h2>
            <div className="staff-stats">
              {orderedStatuses(data.incident_status_counts).map(([status, count]) => {
                const inner = (
                  <>
                    <div className="staff-stat-label">{status}</div>
                    <div className="staff-stat-num">{count}</div>
                    {STATUS_LINKS[status] && <div className="staff-stat-hint">Open queue →</div>}
                  </>
                );
                return STATUS_LINKS[status] ? (
                  <Link key={status} to={STATUS_LINKS[status]} className="staff-stat" data-tone={STATUS_TONES[status]}>{inner}</Link>
                ) : (
                  <div key={status} className="staff-stat" data-tone={STATUS_TONES[status]}>{inner}</div>
                );
              })}
            </div>
          </section>

          <section className="staff-section">
            <h2 className="staff-section-title">Workload on active cases</h2>
            <div className="staff-card staff-cols">
              <WorkloadColumn title="CCC officials" data={data.ccc_workload} />
              <WorkloadColumn title="Incident managers" data={data.manager_workload} />
              <WorkloadColumn title="Supervisors" data={data.supervisor_workload} />
            </div>
          </section>

          <section className="staff-section">
            <h2 className="staff-section-title">
              Volunteer approvals{data.pending_volunteer_total > 0 ? ` · ${data.pending_volunteer_total} waiting` : ''}
            </h2>
            <div className="staff-card">
              {data.pending_volunteer_incidents.length === 0 ? (
                <div className="staff-empty">No volunteers are waiting for approval.</div>
              ) : (
                data.pending_volunteer_incidents.map(p => (
                  <div key={p.incident_id}>
                    <Link to={`/incidents/${p.incident_id}`} className="staff-row">
                      <div className="staff-row-main">
                        <div className="staff-row-title">{p.incident_name}</div>
                        <div className="staff-row-meta">Oldest request {timeAgo(p.oldest_requested_at)}</div>
                      </div>
                      <div className="staff-row-end">
                        <span className="staff-badge" data-tone="amber">{p.count} waiting</span>
                        <span className="staff-chevron">›</span>
                      </div>
                    </Link>
                    {p.requesters.map(r => (
                      <div key={r.request_id} className="staff-subrow">
                        <span>{r.full_name || 'Unknown'} · {r.email}</span>
                        <span>{timeAgo(r.requested_at)}</span>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      )}
    </StaffShell>
  );
}

export default function StaffAdminDashboardPage() {
  return <StaffGate allow="admin"><AdminDashboard /></StaffGate>;
}
