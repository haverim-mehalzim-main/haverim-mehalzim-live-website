import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PasswordInput from '../../components/PasswordInput';
import './auth.css';
import '../account/people.css';

type Status = 'idle' | 'submitting' | 'sent' | 'error';

export default function SignUpPage() {
  const [searchParams] = useSearchParams();
  // e.g. /signup?next=/join/<token> — carried through email verification so
  // a brand-new family/friend account lands back on the shared case, not the
  // generic account page, once they've confirmed their email.
  const next = searchParams.get('next');
  // e.g. /signup?invite=<token> — an admin-sent caller invitation. The invited
  // email is fetched (never passed in the URL) and locked, so the account is
  // created for exactly the address the invitation was sent to.
  const inviteToken = searchParams.get('invite');
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!inviteToken) return;
    fetch(`/api/caller-invite/${encodeURIComponent(inviteToken)}`)
      .then(r => r.json())
      .then(j => {
        if (j.success && j.state === 'pending' && j.email) {
          setInvitedEmail(j.email);
          setEmail(j.email);
          if (j.name) setFullName(n => n || j.name);
        }
      })
      .catch(() => { /* fall back to the ordinary sign-up form */ });
  }, [inviteToken]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus('submitting');
    setError('');
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, email, password, next: next || undefined }),
      });
      const json = await res.json();
      if (json.success) {
        setStatus('sent');
      } else {
        setStatus('error');
        setError(json.message || 'Something went wrong. Please try again.');
      }
    } catch {
      setStatus('error');
      setError('Something went wrong. Please try again.');
    }
  };

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

        {status === 'sent' ? (
          <div className="auth-card auth-card--center">
            <div className="auth-icon">✉</div>
            <h1 className="auth-title">Check your email</h1>
            <p className="auth-sub">
              We sent a verification link to <strong>{email}</strong>. Click it to activate your
              account — the link expires in 24 hours.
            </p>
          </div>
        ) : (
          <div className="auth-card">
            <div className="auth-eyebrow">{invitedEmail ? 'Your case is waiting' : 'Create Your Account'}</div>
            <h1 className="auth-title">{invitedEmail ? 'Create your account' : 'Sign up'}</h1>
            <p className="auth-sub">
              {invitedEmail
                ? 'Choose a password and we will send you one link to confirm your email. Then your case page opens.'
                : 'Already donated or bought premium? Use that same email to claim your existing account and set a password for it.'}
            </p>
            <form className="auth-form" onSubmit={handleSubmit}>
              <label className="auth-label">
                Full name
                <input
                  className="auth-input"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  required
                  maxLength={120}
                  autoComplete="name"
                />
              </label>
              <label className="auth-label">
                Email
                <input
                  className="auth-input"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  maxLength={200}
                  autoComplete="email"
                  readOnly={!!invitedEmail}
                />
              </label>
              <label className="auth-label">
                Password
                <PasswordInput
                  className="auth-input"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </label>
              {error && <div className="auth-error">{error}</div>}
              <button className="auth-submit" type="submit" disabled={status === 'submitting'}>
                {status === 'submitting' ? 'Creating account…' : 'Create account'}
              </button>
            </form>
            <div className="auth-switch">
              Already have an account?{' '}
              <Link to={next ? `/login?${inviteToken ? `invite=${encodeURIComponent(inviteToken)}&` : ''}next=${encodeURIComponent(next)}` : '/login'}>Log in</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
