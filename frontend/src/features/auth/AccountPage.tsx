import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './auth.css';

export default function AccountPage() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const verified = searchParams.get('verified') === '1';
  const error = searchParams.get('error');

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="auth-page">
      <div className="auth-wrapper">
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
          <div className="auth-card">
            <div className="auth-eyebrow">◈ My Account</div>
            <h1 className="auth-title">{user.full_name}</h1>
            <p className="auth-sub">{user.email}</p>
            {user.roles.length > 0 && (
              <div className="auth-roles">
                {user.roles.map(role => (
                  <span key={role} className="auth-role-badge">{role}</span>
                ))}
              </div>
            )}
            {!user.roles.includes('premium') && (
              <Link to="/premium" className="auth-premium-upsell">
                ★ Go Premium — permanent priority status, starting with 24/7 availability
              </Link>
            )}
            <button className="auth-submit auth-submit--secondary" onClick={handleLogout}>
              Log Out
            </button>
          </div>
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
