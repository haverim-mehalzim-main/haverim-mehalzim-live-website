import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AuthFrame from '../../components/AuthFrame';
import { useAuth } from '../../context/AuthContext';

// A case-tracker link (for example the one in a donor's thank-you email) is
// no longer a public page. Everyone signs up or logs in first; if their
// account has a real relationship to the case they land on its incident page,
// otherwise they're told the case is shared by invitation.

type State = 'checking' | 'need_login' | 'no_access' | 'error';

export default function TrackAccessPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<State>('checking');

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setState('need_login'); return; }
    if (!caseId) { setState('no_access'); return; }

    setState('checking');
    fetch(`/api/track/${encodeURIComponent(caseId)}`)
      .then(r => r.json().then(j => ({ status: r.status, j })))
      .then(({ status, j }) => {
        if (j.success) navigate(`/incidents/${j.incident_id}`, { replace: true });
        else if (status === 401) setState('need_login');
        else if (status === 403 || status === 400) setState('no_access');
        else setState('error');
      })
      .catch(() => setState('error'));
  }, [user, authLoading, caseId, navigate]);

  if (state === 'need_login') {
    const next = encodeURIComponent(`/track/${caseId}`);
    return (
      <AuthFrame>
        <div className="join-hero">
          <div className="join-ring" aria-hidden="true">💙</div>
          <h1 className="join-title">Sign up to follow this case</h1>
          <p className="join-lead">
            To protect everyone's privacy, cases can only be followed from an account. It takes a
            minute, and you'll see how things are going as they happen.
          </p>
        </div>
        <div className="join-actions" style={{ marginTop: 24 }}>
          <Link to={`/signup?next=${next}`} className="auth-submit">Create an account</Link>
          <Link to={`/login?next=${next}`} className="auth-submit auth-submit--secondary" style={{ marginTop: 0 }}>I already have an account</Link>
        </div>
      </AuthFrame>
    );
  }

  if (state === 'no_access') {
    return (
      <AuthFrame>
        <div className="join-hero">
          <div className="join-ring join-ring--error" aria-hidden="true">?</div>
          <h1 className="join-title">This case is shared by invitation</h1>
          <p className="join-lead">
            Your account isn't connected to this case yet. Ask the person who opened it to send you
            an invitation link.
          </p>
        </div>
        <div className="join-actions" style={{ marginTop: 24 }}>
          <Link to="/account" className="auth-submit">Go to your account</Link>
        </div>
      </AuthFrame>
    );
  }

  if (state === 'error') {
    return (
      <AuthFrame>
        <div className="join-hero">
          <div className="join-ring join-ring--error" aria-hidden="true">!</div>
          <h1 className="join-title">We couldn't load this case</h1>
          <p className="join-lead">Something went wrong on our side. Please try again in a moment.</p>
        </div>
        <div className="join-actions" style={{ marginTop: 24 }}>
          <button className="auth-submit" onClick={() => window.location.reload()}>Try again</button>
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame>
      <div className="join-hero" role="status" aria-live="polite">
        <div className="join-ring join-ring--pulse" aria-hidden="true">💙</div>
        <h1 className="join-title">Opening the case</h1>
        <p className="join-lead">One moment.</p>
      </div>
    </AuthFrame>
  );
}
