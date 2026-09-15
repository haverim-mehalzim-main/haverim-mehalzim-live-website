import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import '../account/account.css';
import './auth.css';

interface IncidentSummary {
  id: number;
  incident_type: string;
  location: string;
  opened_date: string | null;
  life_threatening: boolean;
  handled: boolean;
  relation: 'owner' | 'follower';
}

interface DonationSummary {
  order_id: string;
  amount_usd: number;
  currency: string;
  confirmed_at: string | null;
  monday_item_id: string | null;
  progress: { step: number; step_title: string; step_subtitle: string; total_steps: number } | null;
}

function IncidentCard({ incident, ongoing }: { incident: IncidentSummary; ongoing: boolean }) {
  return (
    <Link to={`/incidents/${incident.id}`} className="account-incident-card">
      <div className="account-incident-top">
        <div className="account-incident-type">{incident.incident_type || 'Case'}</div>
        <div>
          <span className={`account-incident-badge ${ongoing ? 'account-incident-badge--ongoing' : 'account-incident-badge--past'}`}>
            {ongoing ? 'Ongoing' : 'Resolved'}
          </span>
          {incident.life_threatening && <span className="account-incident-badge account-incident-badge--urgent">Urgent</span>}
          {incident.relation === 'follower' && (
            <span className="account-incident-badge account-incident-badge--following">💙 Following</span>
          )}
        </div>
      </div>
      <div className="account-incident-meta">
        {incident.location}{incident.opened_date ? ` · opened ${incident.opened_date}` : ''}
      </div>
    </Link>
  );
}

const ROLE_LABELS: Record<string, string> = {
  family: 'Family/Friend',
};

function DonationCard({ donation }: { donation: DonationSummary }) {
  const symbol = donation.currency === '1' ? '₪' : '$';
  return (
    <div className="account-incident-card" style={{ cursor: 'default' }}>
      <div className="account-incident-top">
        <div className="account-incident-type">{symbol}{donation.amount_usd.toLocaleString()} donated</div>
        {donation.progress && (
          <span className="account-incident-badge account-incident-badge--ongoing">
            {donation.progress.step_title}
          </span>
        )}
      </div>
      <div className="account-incident-meta">
        {donation.confirmed_at ? `Confirmed ${donation.confirmed_at.slice(0, 10)}` : ''}
      </div>
      {donation.progress && (
        <div className="account-detail-desc-text" style={{ marginTop: 8 }}>
          {donation.progress.step_subtitle}
        </div>
      )}
    </div>
  );
}

export default function AccountPage() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const verified = searchParams.get('verified') === '1';
  const error = searchParams.get('error');

  const [ongoing, setOngoing] = useState<IncidentSummary[]>([]);
  const [past, setPast] = useState<IncidentSummary[]>([]);
  const [incidentsLoaded, setIncidentsLoaded] = useState(false);

  const [donations, setDonations] = useState<DonationSummary[]>([]);
  const [donationsLoaded, setDonationsLoaded] = useState(false);

  const isStaff = user?.roles.includes('admin') || user?.roles.includes('volunteer');
  const isDonor = user?.roles.includes('donor');
  const isAdmin = user?.roles.includes('admin') ?? false;
  const hasCommandCenterAccess = isAdmin || (!!user?.roles.includes('volunteer') && !!user?.roles.includes('premium'));

  useEffect(() => {
    if (!user) return;
    fetch('/api/my/incidents')
      .then(r => r.json())
      .then(j => {
        if (j.success) {
          setOngoing(j.ongoing || []);
          setPast(j.past || []);
        }
      })
      .catch(() => {})
      .finally(() => setIncidentsLoaded(true));
  }, [user]);

  useEffect(() => {
    if (!isDonor) return;
    fetch('/api/my/donations')
      .then(r => r.json())
      .then(j => { if (j.success) setDonations(j.donations || []); })
      .catch(() => {})
      .finally(() => setDonationsLoaded(true));
  }, [isDonor]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="auth-page">
      <div className="auth-wrapper" style={{ maxWidth: 640 }}>
        <nav className="auth-nav">
          <Link to="/" className="auth-back">← Back to Dashboard</Link>
          <div className="auth-nav-brand">
            <span className="auth-nav-brand-dot" />
            Haverim Mehalzim
          </div>
        </nav>

        {verified && <div className="auth-banner auth-banner--success">✓ Your email has been verified.</div>}
        {error && <div className="auth-banner auth-banner--error">{error}</div>}

        {loading ? (
          <div className="auth-card auth-card--center">Loading…</div>
        ) : user ? (
          <>
            <div className="auth-card" style={{ marginBottom: 24 }}>
              <div className="auth-eyebrow">◈ My Account</div>
              <h1 className="auth-title">{user.full_name}</h1>
              <p className="auth-sub">{user.email}</p>
              {user.roles.length > 0 && (
                <div className="auth-roles">
                  {user.roles.map(role => (
                    <span key={role} className="auth-role-badge">{ROLE_LABELS[role] ?? role}</span>
                  ))}
                </div>
              )}
              <button className="auth-submit auth-submit--secondary" onClick={handleLogout}>
                Log Out
              </button>
            </div>

            {isStaff && (
              <div className="account-section">
                <Link to="/staff/incidents" className="account-staff-console-link">
                  <span>◈ Staff Console — view and work incidents</span>
                  <span>→</span>
                </Link>
              </div>
            )}

            {hasCommandCenterAccess && (
              <div className="account-section">
                <Link to="/command" className="account-staff-console-link">
                  <span>◈ Command Center</span>
                  <span>→</span>
                </Link>
              </div>
            )}

            {isDonor && (
              <div className="account-section">
                <div className="account-section-header">
                  <div className="account-section-title">◈ Your Donations</div>
                </div>
                {!donationsLoaded ? (
                  <div className="account-empty">Loading…</div>
                ) : donations.length === 0 ? (
                  <div className="account-empty">No donations recorded here yet.</div>
                ) : (
                  donations.map(d => <DonationCard key={d.order_id} donation={d} />)
                )}
              </div>
            )}

            <div className="account-section">
              <div className="account-section-header">
                <div className="account-section-title">◈ Ongoing Cases</div>
                <Link to="/account/open-call" className="account-open-call-btn">🆘 Open a Call</Link>
              </div>
              {!incidentsLoaded ? (
                <div className="account-empty">Loading…</div>
              ) : ongoing.length === 0 ? (
                <div className="account-empty">No ongoing cases right now.</div>
              ) : (
                ongoing.map(inc => <IncidentCard key={inc.id} incident={inc} ongoing />)
              )}
            </div>

            {incidentsLoaded && past.length > 0 && (
              <div className="account-section">
                <div className="account-section-header">
                  <div className="account-section-title">◈ Past Cases</div>
                </div>
                {past.map(inc => <IncidentCard key={inc.id} incident={inc} ongoing={false} />)}
              </div>
            )}

            {!user.roles.includes('premium') && (
              <div className="account-section">
                <div className="account-premium-card">
                  <div className="account-premium-title">★ Go Premium</div>
                  <ul className="account-premium-list">
                    <li>24/7 priority availability</li>
                    <li>Option to raise a donation campaign for your case</li>
                    <li>More benefits on the way</li>
                  </ul>
                  <Link to="/premium" className="account-premium-cta">Learn More →</Link>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="auth-card auth-card--center">
            <p className="auth-sub">You&apos;re not logged in.</p>
            <Link to="/login" className="auth-submit" style={{ display: 'inline-block', textDecoration: 'none' }}>
              Log In
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
