import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import PasswordInput from '../../components/PasswordInput';
import './auth.css';

export default function LoginPage() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // e.g. /login?next=/join/<token> — lets a share/invite link bounce someone
  // through login and land back where they were headed, instead of /account.
  const next = searchParams.get('next');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (json.success) {
        await refresh();
        // Only ever navigate to a same-site path — never follow `next` if it
        // looks like it could redirect off this site (open-redirect guard).
        const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/account';
        navigate(safeNext);
      } else {
        setError(json.message || 'Invalid email or password.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
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

        <div className="auth-card">
          <div className="auth-eyebrow">◈ Welcome Back</div>
          <h1 className="auth-title">Log In</h1>
          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-label">
              Email
              <input
                className="auth-input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </label>
            <label className="auth-label">
              Password
              <PasswordInput
                className="auth-input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </label>
            {error && <div className="auth-error">{error}</div>}
            <button className="auth-submit" type="submit" disabled={submitting}>
              {submitting ? 'Logging in…' : 'Log In'}
            </button>
          </form>
          <div className="auth-switch">
            Don&apos;t have an account?{' '}
            <Link to={next ? `/signup?next=${encodeURIComponent(next)}` : '/signup'}>Sign up</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
