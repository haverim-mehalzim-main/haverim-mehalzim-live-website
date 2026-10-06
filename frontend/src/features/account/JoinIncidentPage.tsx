import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import '../auth/auth.css';
import './people.css';

type LoadState = 'checking' | 'need_login' | 'joining' | 'error';

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page">
      <div className="auth-wrapper">
        <nav className="auth-nav">
          <Link to="/" className="auth-back">← Back to the site</Link>
          <div className="auth-nav-brand">
            <span className="auth-nav-brand-dot" />
            Haverim Mehalzim
          </div>
        </nav>
        <div className="auth-card">{children}</div>
      </div>
    </div>
  );
}

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
    const next = encodeURIComponent(`/join/${token}`);
    return (
      <Frame>
        <div className="join-hero">
          <div className="join-ring" aria-hidden="true">💙</div>
          <h1 className="join-title">Someone shared a case with you</h1>
          <p className="join-lead">
            Someone close to you asked you to follow along. Log in or create an account and you'll
            be with them as it unfolds.
          </p>
        </div>

        <ul className="join-list">
          <li><span className="join-check" aria-hidden="true">✓</span><span><strong>See how things are going</strong>, step by step, as our team works the case.</span></li>
          <li><span className="join-check" aria-hidden="true">✓</span><span><strong>Updates appear on their own.</strong> There's nothing you need to do.</span></li>
          <li><span className="join-check" aria-hidden="true">✓</span><span><strong>Private details stay private.</strong> You see progress, not personal contact information.</span></li>
        </ul>

        <div className="join-actions">
          <Link to={`/signup?next=${next}`} className="auth-submit">Create an account</Link>
          <Link to={`/login?next=${next}`} className="auth-submit auth-submit--secondary" style={{ marginTop: 0 }}>I already have an account</Link>
        </div>
      </Frame>
    );
  }

  if (state === 'error') {
    return (
      <Frame>
        <div className="join-hero">
          <div className="join-ring join-ring--error" aria-hidden="true">?</div>
          <h1 className="join-title">We couldn't open this link</h1>
          <p className="join-lead">{error}</p>
        </div>
        <div className="join-actions" style={{ marginTop: 24 }}>
          <Link to="/account" className="auth-submit">Go to your account</Link>
        </div>
        <p className="join-fine">Ask the person who shared it to send you a fresh link.</p>
      </Frame>
    );
  }

  return (
    <Frame>
      <div className="join-hero" role="status" aria-live="polite">
        <div className="join-ring join-ring--pulse" aria-hidden="true">💙</div>
        <h1 className="join-title">Connecting you to the case</h1>
        <p className="join-lead">One moment. We're getting everything ready for you.</p>
      </div>
    </Frame>
  );
}
