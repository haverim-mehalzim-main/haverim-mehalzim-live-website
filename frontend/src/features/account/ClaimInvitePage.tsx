import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AuthFrame from '../../components/AuthFrame';
import { useAuth } from '../../context/AuthContext';

// The page behind the link an admin sends to the caller of an incident that
// was entered on Monday. Not logged in: sign up (or log in) with the invited
// email, then land back here. Logged in with the invited email: the case
// becomes theirs and they go straight to it.

type View =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'unusable'; message: string; canLogin: boolean }
  | { kind: 'need_account'; name: string | null }
  | { kind: 'wrong_account'; invitedEmail: string | null }
  | { kind: 'error' };

const GONE = 'This invitation is no longer valid. Please ask the Haverim Mehalzim team to send you a new one.';

export default function ClaimInvitePage() {
  const { token } = useParams<{ token: string }>();
  const { user, loading: authLoading, logout } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<View>({ kind: 'loading' });

  useEffect(() => {
    if (authLoading || !token) return;
    let cancelled = false;
    const set = (v: View) => { if (!cancelled) setView(v); };

    (async () => {
      try {
        const lookupRes = await fetch(`/api/caller-invite/${encodeURIComponent(token)}`);
        if (lookupRes.status === 404) { set({ kind: 'invalid' }); return; }
        const lookup = await lookupRes.json();

        if (!user) {
          if (lookup.state === 'pending') set({ kind: 'need_account', name: lookup.name ?? null });
          else if (lookup.state === 'claimed') set({ kind: 'unusable', message: 'This invitation has already been used. Log in to see your case.', canLogin: true });
          else set({ kind: 'unusable', message: GONE, canLogin: false });
          return;
        }

        set({ kind: 'loading' });
        const res = await fetch(`/api/caller-invite/${encodeURIComponent(token)}/claim`, { method: 'POST' });
        const json = await res.json();
        if (json.success) { if (!cancelled) navigate(`/incidents/${json.incident_id}`, { replace: true }); return; }
        if (res.status === 403) set({ kind: 'wrong_account', invitedEmail: lookup.email ?? null });
        else if (res.status === 409 || res.status === 410) set({ kind: 'unusable', message: json.message || GONE, canLogin: false });
        else set({ kind: 'error' });
      } catch {
        set({ kind: 'error' });
      }
    })();

    return () => { cancelled = true; };
  }, [user, authLoading, token, navigate]);

  const next = encodeURIComponent(`/claim/${token}`);
  const invite = encodeURIComponent(token ?? '');

  if (view.kind === 'need_account') {
    const firstName = view.name?.trim().split(/\s+/)[0];
    return (
      <AuthFrame>
        <div className="join-hero">
          <div className="join-ring" aria-hidden="true">💙</div>
          <h1 className="join-title">{firstName ? `Hi ${firstName}, your case page is ready` : 'Your case page is ready'}</h1>
          <p className="join-lead">
            Following your call to Haverim Mehalzim, we set up a personal page where you can follow
            how your case is progressing. Create your account to open it. It takes a minute.
          </p>
        </div>
        <div className="join-actions" style={{ marginTop: 24 }}>
          <Link to={`/signup?invite=${invite}&next=${next}`} className="auth-submit">Create my account</Link>
          <Link to={`/login?invite=${invite}&next=${next}`} className="auth-submit auth-submit--secondary" style={{ marginTop: 0 }}>I already have an account</Link>
        </div>
      </AuthFrame>
    );
  }

  if (view.kind === 'wrong_account') {
    return (
      <AuthFrame>
        <div className="join-hero">
          <div className="join-ring join-ring--error" aria-hidden="true">?</div>
          <h1 className="join-title">This invitation is for another email</h1>
          <p className="join-lead">
            You're logged in as <strong>{user?.email}</strong>, but this invitation was sent to
            {view.invitedEmail ? <> <strong>{view.invitedEmail}</strong></> : ' a different address'}.
            Log out and continue with the invited email.
          </p>
        </div>
        <div className="join-actions" style={{ marginTop: 24 }}>
          <button className="auth-submit" onClick={() => { logout(); }}>Log out and continue</button>
          <Link to="/account" className="auth-submit auth-submit--secondary" style={{ marginTop: 0 }}>Stay logged in</Link>
        </div>
      </AuthFrame>
    );
  }

  if (view.kind === 'unusable') {
    return (
      <AuthFrame>
        <div className="join-hero">
          <div className="join-ring join-ring--error" aria-hidden="true">!</div>
          <h1 className="join-title">This link can't be used</h1>
          <p className="join-lead">{view.message}</p>
        </div>
        <div className="join-actions" style={{ marginTop: 24 }}>
          {view.canLogin
            ? <Link to={`/login?next=${encodeURIComponent('/account')}`} className="auth-submit">Log in</Link>
            : <Link to="/" className="auth-submit">Back to the site</Link>}
        </div>
      </AuthFrame>
    );
  }

  if (view.kind === 'invalid' || view.kind === 'error') {
    return (
      <AuthFrame>
        <div className="join-hero">
          <div className="join-ring join-ring--error" aria-hidden="true">!</div>
          <h1 className="join-title">{view.kind === 'invalid' ? 'This link is not valid' : "We couldn't open this invitation"}</h1>
          <p className="join-lead">
            {view.kind === 'invalid'
              ? 'Please check that you opened the full link from your email, or ask the Haverim Mehalzim team to send it again.'
              : 'Something went wrong on our side. Please try again in a moment.'}
          </p>
        </div>
        {view.kind === 'error' && (
          <div className="join-actions" style={{ marginTop: 24 }}>
            <button className="auth-submit" onClick={() => window.location.reload()}>Try again</button>
          </div>
        )}
      </AuthFrame>
    );
  }

  return (
    <AuthFrame>
      <div className="join-hero" role="status" aria-live="polite">
        <div className="join-ring join-ring--pulse" aria-hidden="true">💙</div>
        <h1 className="join-title">Opening your case</h1>
        <p className="join-lead">One moment.</p>
      </div>
    </AuthFrame>
  );
}
