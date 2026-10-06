import { Link } from 'react-router-dom';
import { StaffGate, StaffShell } from './StaffShell';
import { useStaffData } from './useStaffData';

interface ParticipatedIncident {
  local_id: number;
  monday_item_id: string;
  name: string;
  incident_type: string;
  country: string;
  life_threatening: boolean;
  incident_status_en: string;
}

const STATUS_TONES: Record<string, string> = { 'Working on it': 'amber', Done: 'green', Rejected: 'red' };

function Participated() {
  const { data, error } = useStaffData<{ incidents: ParticipatedIncident[] }>('/api/staff/my-participated-incidents');
  const incidents = data?.incidents ?? null;

  return (
    <StaffShell title="My cases" subtitle={incidents ? `${incidents.length} you've been approved to help with` : undefined}>
      {error && <div className="staff-error">{error}</div>}
      {!incidents && !error && <div className="staff-loading">Loading…</div>}
      {incidents && (
        <div className="staff-card">
          {incidents.length === 0 ? (
            <div className="staff-empty">You haven't been approved to help with any cases yet. Find one under In progress.</div>
          ) : (
            incidents.map(inc => (
              <Link key={inc.local_id} to={`/incidents/${inc.local_id}`} className="staff-row">
                <div className="staff-row-main">
                  <div className="staff-row-title">{inc.name || '(unnamed)'}</div>
                  <div className="staff-row-meta">{[inc.incident_type, inc.country].filter(Boolean).join(' · ')}</div>
                </div>
                <div className="staff-row-end">
                  {inc.life_threatening && <span className="staff-badge" data-tone="red">Urgent</span>}
                  {inc.incident_status_en && (
                    <span className="staff-badge" data-tone={STATUS_TONES[inc.incident_status_en]}>{inc.incident_status_en}</span>
                  )}
                  <span className="staff-chevron">›</span>
                </div>
              </Link>
            ))
          )}
        </div>
      )}
    </StaffShell>
  );
}

export default function StaffParticipatedIncidentsPage() {
  return <StaffGate allow="staff"><Participated /></StaffGate>;
}
