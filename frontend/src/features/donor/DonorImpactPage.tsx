import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useDonate } from '../../context/DonateContext';
import './donor.css';
import '../account/people.css';

const DONATE_URL     = 'https://www.jgive.com/new/en/usd/donation-targets/110214';
const AVG_MISSION_COST = 150;

interface DonorData {
  name:                string;
  total_donated:       number;
  missions_funded:     number;
  first_donation_date: string;
  last_donation_date:  string;
  note:                string;
  incidents_since:     number;
  handled_since:       number;
  lives_saved_since:   number;
}

type LoadState = 'loading' | 'not_found' | 'error' | 'ready';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function CountUp({ to, duration = 1800 }: { to: number; duration?: number }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!to) return;
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      setValue(Math.floor((1 - Math.pow(1 - p, 3)) * to));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);
  return <>{value.toLocaleString()}</>;
}

function formatDate(d: string) {
  if (!d) return '—';
  try {
    return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', {
      month: 'long', day: 'numeric', year: 'numeric',
    });
  } catch { return d; }
}

function monthsAgo(dateStr: string): number {
  if (!dateStr) return 0;
  const start = new Date(dateStr);
  const now   = new Date();
  return Math.max(0, (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()));
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DonorImpactPage() {
  const { openDonate } = useDonate();
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<LoadState>('loading');
  const [data,  setData]  = useState<DonorData | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!token) { setState('not_found'); return; }
    fetch(`/api/donor/${encodeURIComponent(token)}`)
      .then(r => {
        if (r.status === 404) throw new Error('not_found');
        if (!r.ok)            throw new Error('error');
        return r.json();
      })
      .then(j => {
        if (!j.success) throw new Error('not_found');
        setData(j.data as DonorData);
        setState('ready');
      })
      .catch(e => setState(e.message === 'not_found' ? 'not_found' : 'error'));
  }, [token]);

  const handleShare = () => {
    navigator.clipboard?.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  // ── Loading ──
  if (state === 'loading') return (
    <div className="donor-page">
      <div className="donor-page-wrapper">
        <div className="donor-loading">
          <div className="donor-spinner" />
          <div className="donor-loading-text">Loading your impact report…</div>
        </div>
      </div>
    </div>
  );

  // ── Not found / Error ──
  if (state !== 'ready') return (
    <div className="donor-page">
      <div className="donor-page-wrapper">
        <nav className="donor-nav">
          <Link to="/" className="donor-back">← Back to the site</Link>
          <div className="donor-nav-brand">
            <span className="donor-nav-brand-dot" />
            Haverim Mehalzim
          </div>
        </nav>
        <div className="donor-not-found">
          <div className="donor-not-found-icon">◈</div>
          <h2>{state === 'not_found' ? 'Impact page not found' : 'Something went wrong'}</h2>
          <p>
            {state === 'not_found'
              ? "We couldn't find a donor impact page for this code. Please check your link, or contact us if you believe this is an error."
              : "We couldn't load your impact data right now. Please try again in a moment."}
          </p>
          <Link to="/" className="donor-home-btn">See our operations →</Link>
        </div>
      </div>
    </div>
  );

  // ── Ready ──
  const d       = data!;
  const months  = monthsAgo(d.first_donation_date);
  const today   = new Date().toLocaleDateString('en-GB', { month: 'long', day: 'numeric', year: 'numeric' });
  const firstName = d.name.split(' ')[0];

  return (
    <div className="donor-page">
      <div className="donor-page-wrapper">

        {/* Nav */}
        <nav className="donor-nav">
          <Link to="/" className="donor-back">← Back to the site</Link>
          <div className="donor-nav-brand">
            <span className="donor-nav-brand-dot" />
            Haverim Mehalzim
          </div>
        </nav>

        {/* Hero */}
        <div className="donor-hero">
          <div className="donor-hero-eyebrow">Your personal impact report</div>
          <h1 className="donor-hero-name">
            Welcome back,<br />
            <span className="donor-hero-name-highlight">{d.name}</span>
          </h1>
          <p className="donor-hero-sub">
            Your generosity has directly powered emergency operations — every dollar went to our
            volunteers on the ground, responding to Israelis in crisis around the world.
          </p>
          {(d.first_donation_date || d.last_donation_date) && (
            <div className="donor-hero-dates">
              {d.first_donation_date && (
                <span className="donor-date-chip">
                  <span className="donor-date-label">First donated</span>
                  {formatDate(d.first_donation_date)}
                </span>
              )}
              {d.last_donation_date && d.last_donation_date !== d.first_donation_date && (
                <span className="donor-date-chip">
                  <span className="donor-date-label">Most recent gift</span>
                  {formatDate(d.last_donation_date)}
                </span>
              )}
            </div>
          )}
        </div>

        {/* KPI strip */}
        <div className="donor-kpi-strip">
          <div className="donor-kpi-card teal">
            <div className="donor-kpi-value">
              <span>$</span><CountUp to={Math.round(d.total_donated)} />
            </div>
            <div className="donor-kpi-label">Total donated</div>
          </div>
          <div className="donor-kpi-card teal">
            <div className="donor-kpi-value">
              <CountUp to={d.missions_funded} />
            </div>
            <div className="donor-kpi-label">Missions funded</div>
            <div className="donor-kpi-sub">${AVG_MISSION_COST} per mission</div>
          </div>
          {d.first_donation_date && (
            <>
              <div className="donor-kpi-card">
                <div className="donor-kpi-value">
                  <CountUp to={d.handled_since} />
                </div>
                <div className="donor-kpi-label">Cases managed</div>
                <div className="donor-kpi-sub">since your first gift</div>
              </div>
              <div className="donor-kpi-card gold">
                <div className="donor-kpi-value">
                  <CountUp to={d.lives_saved_since} />
                </div>
                <div className="donor-kpi-label">Life-threatening cases</div>
                <div className="donor-kpi-sub">stabilized in your window</div>
              </div>
            </>
          )}
        </div>

        {/* Impact window — only shown when first_donation_date is known */}
        {d.first_donation_date && <div className="donor-window">
          <div className="donor-window-header">
            <div className="donor-window-eyebrow">Your impact window</div>
            <div className="donor-window-period">{months} month{months !== 1 ? 's' : ''} of operations</div>
          </div>

          {/* Timeline */}
          <div className="donor-window-timeline">
            <div className="donor-timeline-start-block">
              <div className="donor-timeline-dot teal" />
              <div className="donor-timeline-date">{formatDate(d.first_donation_date)}</div>
              <div className="donor-timeline-label">First gift</div>
            </div>
            <div className="donor-timeline-track">
              <div className="donor-timeline-fill" />
              <div className="donor-timeline-badge">{d.incidents_since.toLocaleString()} incidents responded</div>
            </div>
            <div className="donor-timeline-end-block">
              <div className="donor-timeline-dot amber" />
              <div className="donor-timeline-date">{today}</div>
              <div className="donor-timeline-label">Today</div>
            </div>
          </div>

          {/* Stats breakdown */}
          <div className="donor-window-stats">
            <div className="donor-window-stat">
              <span className="donor-window-num">{d.incidents_since.toLocaleString()}</span>
              <span className="donor-window-text">total incidents received since your first donation</span>
            </div>
            <div className="donor-window-stat">
              <span className="donor-window-num teal">{d.handled_since.toLocaleString()}</span>
              <span className="donor-window-text">cases fully managed and closed by our volunteer team</span>
            </div>
            <div className="donor-window-stat">
              <span className="donor-window-num gold">{d.lives_saved_since.toLocaleString()}</span>
              <span className="donor-window-text">life-threatening situations where our team intervened</span>
            </div>
          </div>
        </div>}

        {/* Personal note */}
        {d.note && (
          <div className="donor-note">
            <div className="donor-note-eyebrow">A personal message from our team</div>
            <blockquote className="donor-note-text">{d.note}</blockquote>
          </div>
        )}

        {/* CTA */}
        <div className="donor-cta">
          <div className="donor-cta-headline">Thank you, {firstName}.</div>
          <div className="donor-cta-sub">
            Your support makes it possible for us to answer the call every time, for every Israeli.
            The work continues — and so can your impact.
          </div>
          <div className="donor-cta-actions">
            <a href={DONATE_URL} onClick={e => { e.preventDefault(); openDonate(); }} className="donor-cta-donate">
              ♥ Donate Again
            </a>
            {/* <Link
              to={`/leaderboard?you=${encodeURIComponent(firstName)}`}
              className="donor-cta-share"
            >
              See Leaderboard
            </Link> */}
            <button
              className={`donor-cta-share${copied ? ' copied' : ''}`}
              onClick={handleShare}
            >
              {copied ? '✓ Link Copied' : '⤴ Share This Page'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
