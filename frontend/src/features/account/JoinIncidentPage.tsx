import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import '../auth/auth.css';

type LoadState = 'checking' | 'need_login' | 'joining' | 'error';

export default function JoinIncidentPage() {
  const { user, loading: authLoading } = useAuth();
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>('checking');
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading || !token) return;

    if (!user) {
      setState('need_login');
      return;
    }

    setState('joining');
    fetch(`/api/incidents/join/${encodeURIComponent(token)}`, { method: 'POST' })
      .then(r => r.json())
      .then(j => {
        if (!j.success) {
          setError(j.message || 'This link is invalid or has expired.');
          setState('error');
          return;
        }
        navigate(`/incidents/${j.incident_id}`, { replace: true });
      })
      .catch(() => {
        setError('Something went wrong. Please try again.');
        setState('error');
      });
  }, [user, authLoading, token, navigate]);

  if (state === 'need_login') {
    const next = `/join/${token}`;
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
          <div className="auth-card auth-card--center">
            <div className="auth-icon">💙</div>
            <h1 className="auth-title">Someone shared a case with you</h1>
            <p className="auth-sub">
              Log in or create an account to follow along and see how things are going.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Link to={`/login?next=${encodeURIComponent(next)}`} className="auth-submit" style={{ textDecoration: 'none' }}>
                Log In
              </Link>
              <Link to={`/signup?next=${encodeURIComponent(next)}`} className="auth-submit auth-submit--secondary" style={{ textDecoration: 'none' }}>
                Sign Up
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (state === 'error') {
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
          <div className="auth-card auth-card--center">
            <p className="auth-sub">{error}</p>
            <Link to="/account" className="auth-submit" style={{ display: 'inline-block', textDecoration: 'none' }}>
              Go to My Account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-wrapper">
        <div className="auth-card auth-card--center">Connecting you to the case…</div>
      </div>
    </div>
  );
}
