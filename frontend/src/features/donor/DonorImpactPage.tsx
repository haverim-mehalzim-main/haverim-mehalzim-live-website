import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useDonate } from '../../context/DonateContext';
import './donor.css';

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
          <div className="donor-not-found-icon" aria-hidden="true">?</div>
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
  const hasWindow = !!d.first_donation_date;

  return (
    <div className="donor-page">
      <div className="donor-page-wrapper">

        <nav className="donor-nav">
          <Link to="/" className="donor-back">← Back to the site</Link>
          <div className="donor-nav-brand">
            <span className="donor-nav-brand-dot" />
            Haverim Mehalzim
          </div>
        </nav>

        <div className="donor-hero">
          <div className="donor-hero-eyebrow">Your personal impact report</div>
          <h1 className="donor-hero-name">Thank you, {firstName}</h1>
          <p className="donor-hero-sub">
            Your generosity has directly powered emergency operations. Every dollar went to our
            volunteers on the ground, responding to Israelis in crisis around the world.
          </p>
          {(d.first_donation_date || d.last_donation_date) && (
            <div className="donor-hero-dates">
              {d.first_donation_date && (
                <span className="donor-date-chip">Giving since <strong>{formatDate(d.first_donation_date)}</strong></span>
              )}
              {d.last_donation_date && d.last_donation_date !== d.first_donation_date && (
                <span className="donor-date-chip">Latest gift <strong>{formatDate(d.last_donation_date)}</strong></span>
              )}
            </div>
          )}
        </div>

        <section className="donor-big">
          <div className="donor-big-num"><CountUp to={d.missions_funded} /></div>
          <div className="donor-big-label">missions funded</div>
          <p className="donor-big-sub">
            Your <strong>$<CountUp to={Math.round(d.total_donated)} /></strong> in total gifts, at about ${AVG_MISSION_COST} per mission.
          </p>
        </section>

        {hasWindow && (
          <div className="donor-stats">
            <div className="donor-stat">
              <div className="donor-stat-num"><CountUp to={d.incidents_since} /></div>
              <div className="donor-stat-body">
                <div className="donor-stat-label">Cases received</div>
                <div className="donor-stat-sub">since your first gift</div>
              </div>
            </div>
            <div className="donor-stat donor-stat--teal">
              <div className="donor-stat-num"><CountUp to={d.handled_since} /></div>
              <div className="donor-stat-body">
                <div className="donor-stat-label">Cases managed</div>
                <div className="donor-stat-sub">by our volunteer team</div>
              </div>
            </div>
            <div className="donor-stat donor-stat--gold">
              <div className="donor-stat-num"><CountUp to={d.lives_saved_since} /></div>
              <div className="donor-stat-body">
                <div className="donor-stat-label">Life-threatening cases</div>
                <div className="donor-stat-sub">where we stepped in</div>
              </div>
            </div>
          </div>
        )}

        {hasWindow && (
          <section className="donor-window">
            <div className="donor-window-head">
              <h2 className="donor-window-title">Your impact window</h2>
              <div className="donor-window-period">{months} month{months !== 1 ? 's' : ''} of operations</div>
            </div>

            <div className="donor-timeline">
              <div>
                <div className="donor-timeline-dot" />
                <div className="donor-timeline-date">{formatDate(d.first_donation_date)}</div>
                <div className="donor-timeline-label">First gift</div>
              </div>
              <div className="donor-timeline-track">
                <div className="donor-timeline-badge">{d.incidents_since.toLocaleString()} cases responded to</div>
              </div>
              <div className="donor-timeline-end">
                <div className="donor-timeline-dot" />
                <div className="donor-timeline-date">{today}</div>
                <div className="donor-timeline-label">Today</div>
              </div>
            </div>

            <div className="donor-window-list">
              <div className="donor-window-row">
                <span className="donor-window-row-num">{d.incidents_since.toLocaleString()}</span>
                <span className="donor-window-row-text">cases received since your first donation</span>
              </div>
              <div className="donor-window-row">
                <span className="donor-window-row-num donor-window-row-num--teal">{d.handled_since.toLocaleString()}</span>
                <span className="donor-window-row-text">cases fully managed and closed by our volunteer team</span>
              </div>
              <div className="donor-window-row">
                <span className="donor-window-row-num donor-window-row-num--gold">{d.lives_saved_since.toLocaleString()}</span>
                <span className="donor-window-row-text">life-threatening situations where our team stepped in</span>
              </div>
            </div>
          </section>
        )}

        {d.note && (
          <section className="donor-note">
            <div className="donor-note-eyebrow">A personal message from our team</div>
            <blockquote className="donor-note-text">{d.note}</blockquote>
          </section>
        )}

        <section className="donor-cta">
          <h2 className="donor-cta-headline">We could not do this without you.</h2>
          <p className="donor-cta-sub">
            Your support makes it possible for us to answer the call every time, for every Israeli.
            The work continues, and so can your impact.
          </p>
          <div className="donor-cta-actions">
            <a href={DONATE_URL} onClick={e => { e.preventDefault(); openDonate(); }} className="donor-cta-donate">
              Donate again
            </a>
            <button className={`donor-cta-share${copied ? ' copied' : ''}`} onClick={handleShare}>
              {copied ? 'Link copied' : 'Share this page'}
            </button>
          </div>
        </section>

      </div>
    </div>
  );
}
