import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import PasswordInput from '../../components/PasswordInput';
import './auth.css';

type Status = 'idle' | 'submitting' | 'sent' | 'error';

export default function SignUpPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus('submitting');
    setError('');
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, email, password }),
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
          <Link to="/" className="auth-back">← Back to Dashboard</Link>
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
            <div className="auth-eyebrow">◈ Create Your Account</div>
            <h1 className="auth-title">Sign Up</h1>
            <p className="auth-sub">
              Already donated or bought premium? Use that same email to claim your existing
              account and set a password for it.
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
                {status === 'submitting' ? 'Creating account…' : 'Create Account'}
              </button>
            </form>
            <div className="auth-switch">
              Already have an account? <Link to="/login">Log in</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
