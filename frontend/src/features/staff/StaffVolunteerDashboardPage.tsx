import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { StaffGate, StaffShell } from './StaffShell';
import { useStaffData } from './useStaffData';

interface VolunteerDashboardData {
  done_count: number;
  in_progress_count: number;
  my_participated_count: number;
}

function VolunteerDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.primary_role === 'admin';
  const { data, error } = useStaffData<VolunteerDashboardData>('/api/staff/volunteer-dashboard');

  // Admins have a richer dashboard of their own.
  useEffect(() => {
    if (isAdmin) navigate('/staff/admin-dashboard', { replace: true });
  }, [isAdmin, navigate]);

  return (
    <StaffShell title="Dashboard" subtitle="Where things stand across the board">
      {error && <div className="staff-error">{error}</div>}
      {!data && !error && <div className="staff-loading">Loading…</div>}

      {data && (
        <>
          <section className="staff-section">
            <div className="staff-stats">
              <Link to="/staff/in-progress" className="staff-stat" data-tone="amber">
                <div className="staff-stat-label">In progress</div>
                <div className="staff-stat-num">{data.in_progress_count}</div>
                <div className="staff-stat-hint">Find a case to join →</div>
              </Link>
              <Link to="/staff/participated" className="staff-stat" data-tone="accent">
                <div className="staff-stat-label">You took part in</div>
                <div className="staff-stat-num">{data.my_participated_count}</div>
                <div className="staff-stat-hint">See your cases →</div>
              </Link>
              <div className="staff-stat" data-tone="green">
                <div className="staff-stat-label">Completed</div>
                <div className="staff-stat-num">{data.done_count}</div>
              </div>
            </div>
          </section>

          <section className="staff-section">
            <h2 className="staff-section-title">Where to start</h2>
            <div className="staff-card">
              <Link to="/staff/in-progress" className="staff-row">
                <div className="staff-row-main">
                  <div className="staff-row-title">Browse cases in progress</div>
                  <div className="staff-row-meta">Open a case and request to join. An admin approves you before you see the full details.</div>
                </div>
                <span className="staff-chevron">›</span>
              </Link>
            </div>
          </section>
        </>
      )}
    </StaffShell>
  );
}

export default function StaffVolunteerDashboardPage() {
  return <StaffGate allow="staff"><VolunteerDashboard /></StaffGate>;
}
