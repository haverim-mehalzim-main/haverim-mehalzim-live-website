import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const MONO = "'JetBrains Mono', 'Courier New', monospace";
const BG   = '#06090f';
const BG2  = '#0c1420';
const TEAL = '#00c9b1';
const AMBER = '#ffb930';

// Basic layout/infrastructure only — real Command Center features land later.
export default function CommandCenterPage() {
  const { user, loading: authLoading } = useAuth();

  const isAdmin          = user?.roles.includes('admin') ?? false;
  const isPremiumVolunteer = (user?.roles.includes('volunteer') ?? false) && (user?.roles.includes('premium') ?? false);
  const hasAccess         = isAdmin || isPremiumVolunteer;

  if (authLoading) {
    return <div style={{ minHeight: '100dvh', background: BG }} />;
  }

  if (!user) {
    return (
      <div style={{ minHeight: '100dvh', background: BG, color: '#e2e8f0', fontFamily: MONO, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: BG2, border: '1px solid rgba(0,201,177,0.14)', borderRadius: 14, padding: '2rem', maxWidth: 380, textAlign: 'center' }}>
          <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: TEAL, marginBottom: '1rem' }}>◈ Command Center</div>
          <p style={{ fontSize: 13, marginBottom: '1.25rem' }}>Log in with an authorized account to continue.</p>
          <Link to="/login?next=/command" style={{
            display: 'inline-block', padding: '0.75rem 1.5rem', background: TEAL, color: BG,
            borderRadius: 8, fontFamily: MONO, fontSize: 11, fontWeight: 700, textDecoration: 'none',
          }}>Log In →</Link>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div style={{ minHeight: '100dvh', background: BG, color: '#e2e8f0', fontFamily: MONO, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: BG2, border: '1px solid rgba(255,77,106,0.2)', borderRadius: 14, padding: '2rem', maxWidth: 380, textAlign: 'center' }}>
          <p style={{ fontSize: 13 }}>Your account doesn&apos;t have Command Center access.</p>
          <Link to="/account" style={{ fontSize: 11, color: TEAL }}>← Back to My Account</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100dvh', background: BG, color: '#e2e8f0', fontFamily: MONO }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 10, background: `${BG}ee`, backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(0,201,177,0.12)', padding: '1rem 1.5rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <span style={{ fontSize: 11, fontWeight: 700, color: TEAL, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Haverim Mehalzim</span>
          <span style={{ fontSize: 9, color: AMBER, letterSpacing: '0.12em', marginLeft: 12 }}>COMMAND CENTER</span>
        </div>
        <Link to="/account" style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>← My Account</Link>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '2.5rem 1.5rem 5rem' }}>
        <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: TEAL, marginBottom: '1.25rem' }}>
          ◈ Overview
        </div>
        <div style={{
          background: BG2, border: '1px dashed rgba(255,255,255,0.12)', borderRadius: 12,
          padding: '3rem 1.5rem', textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: 12,
        }}>
          More is coming to this page. For now, this confirms your Command Center access is active.
        </div>

        <div style={{ marginTop: 10 }}>
          <Link to="/staff/incidents" style={{
            display: 'inline-block', fontSize: 11, color: TEAL, textDecoration: 'none',
          }}>◈ Staff Console — view and work incidents →</Link>
        </div>
      </div>
    </div>
  );
}
