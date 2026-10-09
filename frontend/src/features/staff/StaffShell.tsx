import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './staff.css';

interface NavItem { to: string; label: string; icon: ReactNode }

const svg = (children: ReactNode) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const ICONS = {
  dashboard: svg(<><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /></>),
  inbox: svg(<><path d="M2 9h3.5l1 2h3l1-2H14" /><path d="M3.5 3h9L14 9v4H2V9z" /></>),
  activity: svg(<path d="M1.5 8h3l2-5 3 10 2-5h3" />),
  check: svg(<><circle cx="8" cy="8" r="6" /><path d="M5.5 8.2l1.8 1.8 3.2-3.6" /></>),
  user: svg(<><circle cx="8" cy="5.5" r="2.5" /><path d="M3 13.5c.6-2.4 2.5-3.5 5-3.5s4.4 1.1 5 3.5" /></>),
  globe: svg(<><circle cx="8" cy="8" r="6" /><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12" /></>),
  chat: svg(<><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" /><path d="M5.5 6.5h5" /></>),
};

const ADMIN_NAV: NavItem[] = [
  { to: '/staff/admin-dashboard', label: 'Dashboard', icon: ICONS.dashboard },
  { to: '/staff/requests', label: 'New requests', icon: ICONS.inbox },
  { to: '/staff/in-progress', label: 'In progress', icon: ICONS.activity },
  { to: '/staff/intake-officers', label: 'Intake officers', icon: ICONS.user },
];
const VOLUNTEER_NAV: NavItem[] = [
  { to: '/staff/volunteer-dashboard', label: 'Dashboard', icon: ICONS.dashboard },
  { to: '/staff/in-progress', label: 'In progress', icon: ICONS.activity },
  { to: '/staff/participated', label: 'My cases', icon: ICONS.check },
];

// "Report a call": opens a WhatsApp chat with the incident agent and a ready first
// message that starts an intake (the officer then types what the caller says).
// Admins only, and only when the agent's number is configured on the server.
function useAgentChatLink(enabled: boolean) {
  const [link, setLink] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch('/api/staff/agent-chat-link')
      .then(r => r.json())
      .then(j => { if (!cancelled && j.success) setLink(j.link || null); })
      .catch(() => { /* no button — the rest of the console is unaffected */ });
    return () => { cancelled = true; };
  }, [enabled]);
  return link;
}

export function StaffShell({ title, subtitle, actions, children }: {
  title: string; subtitle?: string; actions?: ReactNode; children: ReactNode;
}) {
  const { user } = useAuth();
  const isAdmin = user?.primary_role === 'admin';
  const nav = isAdmin ? ADMIN_NAV : VOLUNTEER_NAV;
  const chatLink = useAgentChatLink(isAdmin);

  return (
    <div className="staff-ui">
      <aside className="staff-rail">
        <div className="staff-brand"><span className="staff-brand-mark" />Haverim Mehalzim</div>
        {chatLink && (
          <a href={chatLink} target="_blank" rel="noopener noreferrer" className="staff-report-call">
            {ICONS.chat}<span>Report a call</span>
          </a>
        )}
        <nav className="staff-nav">
          {nav.map(item => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `staff-nav-link${isActive ? ' active' : ''}`}>
              {item.icon}{item.label}
            </NavLink>
          ))}
        </nav>
        <div className="staff-rail-foot">
          {user && <div className="staff-who"><strong>{user.full_name}</strong>{user.primary_role === 'admin' ? 'Admin' : 'Volunteer'}</div>}
          <Link to="/account" className="staff-nav-link">{ICONS.user}My account</Link>
          <Link to="/" className="staff-nav-link">{ICONS.globe}Public site</Link>
        </div>
      </aside>
      <main className="staff-main">
        <div className="staff-page">
          <div className="staff-head">
            <div>
              <h1 className="staff-title">{title}</h1>
              {subtitle && <p className="staff-sub">{subtitle}</p>}
            </div>
            {actions}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

// Everything a staff page needs before it can show data: wait for the session,
// ask anonymous visitors to log in, turn away accounts without the right role.
// Children only mount once access is granted, so they can fetch freely.
export function StaffGate({ allow, children }: { allow: 'admin' | 'staff'; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="staff-ui" />;

  const role = user?.primary_role;
  const allowed = allow === 'admin' ? role === 'admin' : role === 'admin' || role === 'volunteer';

  if (user && allowed) return <>{children}</>;

  return (
    <div className="staff-ui">
      <div className="staff-gate">
        <div className="staff-gate-card">
          {!user ? (
            <>
              <p>Log in with your staff account to continue.</p>
              <Link to={`/login?next=${encodeURIComponent(location.pathname)}`} className="staff-btn staff-btn--primary">Log in</Link>
            </>
          ) : (
            <>
              <p>{allow === 'admin' ? 'This page is for admins only.' : "Your account doesn't have staff access."}</p>
              <Link to={role === 'volunteer' ? '/staff/volunteer-dashboard' : '/account'} className="staff-btn">
                {role === 'volunteer' ? 'Back to dashboard' : 'Back to my account'}
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
