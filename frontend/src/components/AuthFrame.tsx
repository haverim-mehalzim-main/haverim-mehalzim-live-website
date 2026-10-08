import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import '../features/auth/auth.css';
import '../features/account/people.css';

// The calm page shell shared by the screens that sit between a link and an
// account: the case-tracker gate and the caller-invitation page.
export default function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page">
      <div className="auth-wrapper">
        <nav className="auth-nav">
          <Link to="/" className="auth-back">← Back to the site</Link>
          <div className="auth-nav-brand"><span className="auth-nav-brand-dot" />Haverim Mehalzim</div>
        </nav>
        <div className="auth-card">{children}</div>
      </div>
    </div>
  );
}
