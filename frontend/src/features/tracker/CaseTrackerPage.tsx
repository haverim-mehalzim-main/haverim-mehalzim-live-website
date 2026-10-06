import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useDonate } from '../../context/DonateContext';
import { CASE_JOURNEY_STEPS, CASE_JOURNEY_STEPS_SENSITIVE, journeyStepState, type CaseStepDef } from '../../components/caseJourneySteps';
import './tracker.css';

// ─── Step definitions ─────────────────────────────────────────────────────────

type StepDef = CaseStepDef;
const NORMAL_STEPS = CASE_JOURNEY_STEPS;
const SENSITIVE_STEPS = CASE_JOURNEY_STEPS_SENSITIVE;

const DONATE_URL = 'https://www.jgive.com/new/en/usd/donation-targets/110214';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CaseData {
  item_id:      string;
  step:         number;
  is_sensitive: boolean;
  opened_date:  string | null;
  total_steps:  number;
}

type LoadState  = 'loading' | 'not_found' | 'error' | 'ready';
type FeedbackState = 'idle' | 'sending' | 'sent' | 'error';

// ─── Constants ────────────────────────────────────────────────────────────────

const REFRESH_MS = 60_000;
const RADIUS     = 74;
const CIRC       = 2 * Math.PI * RADIUS;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCaseId(id: string): string {
  return `Case ${id.slice(-7).toUpperCase()}`;
}

function fmtDate(d: string | null): string {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return ''; }
}

function timeAgoLabel(d: Date): string {
  const mins = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return 'Just updated';
  if (mins === 1) return 'Updated 1 minute ago';
  return `Updated ${mins} minutes ago`;
}

// ─── Ring progress ────────────────────────────────────────────────────────────

function RingProgress({ step, total }: { step: number; total: number }) {
  const offset = CIRC * (1 - step / total);
  return (
    <div className="tracker-ring-wrap">
      <svg className="tracker-ring-svg" viewBox="0 0 176 176" aria-hidden="true">
        <defs>
          <linearGradient id="tracker-ring-grad" gradientUnits="userSpaceOnUse" x1="176" y1="88" x2="0" y2="88">
            <stop offset="0%" className="tracker-ring-stop-a" />
            <stop offset="100%" className="tracker-ring-stop-b" />
          </linearGradient>
        </defs>
        <circle className="tracker-ring-track" cx="88" cy="88" r={RADIUS} />
        <circle
          className="tracker-ring-fill"
          cx="88" cy="88" r={RADIUS}
          stroke="url(#tracker-ring-grad)"
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="tracker-ring-center">
        <div className="tracker-ring-num">{step}</div>
        <div className="tracker-ring-denom">of {total} steps</div>
      </div>
    </div>
  );
}

// ─── Timeline step ────────────────────────────────────────────────────────────

function TimelineStep({ def, current }: { def: StepDef; current: number }) {
  const state = journeyStepState(def, current);
  return (
    <div className={`tracker-step ${state}`}>
      <div className="tracker-step-node">
        {state === 'complete' ? '✓' : state === 'active' ? def.icon : def.step}
      </div>
      <div className="tracker-step-body">
        <div className="tracker-step-title">{def.title}</div>
        <div className="tracker-step-subtitle">{def.subtitle}</div>
        {state === 'active' && <span className="tracker-step-pill">Happening now</span>}
      </div>
    </div>
  );
}

// ─── Feedback card ────────────────────────────────────────────────────────────

const RATING_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Very good',
  5: 'Excellent',
};

function RatingPicker({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled: boolean }) {
  return (
    <div className="tracker-rating">
      <div className="tracker-rating-head">
        <span>How was our service?</span>
        <strong>{RATING_LABELS[value]}</strong>
      </div>
      <div className="tracker-rating-dots" role="radiogroup" aria-label="Rate our service from 1 to 5">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={n === value}
            className={`tracker-rating-dot${n <= value ? ' on' : ''}`}
            onClick={() => !disabled && onChange(n)}
            disabled={disabled}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function FeedbackCard({ caseId }: { caseId: string }) {
  const [name,    setName]    = useState('');
  const [message, setMessage] = useState('');
  const [rating,  setRating]  = useState(5);
  const [status,  setStatus]  = useState<FeedbackState>('idle');

  const submit = useCallback(async () => {
    if (!message.trim()) return;
    setStatus('sending');
    try {
      const res = await fetch('/api/feedback', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ case_id: caseId, name: name.trim(), message: message.trim(), rating }),
      });
      setStatus(res.ok ? 'sent' : 'error');
    } catch {
      setStatus('error');
    }
  }, [caseId, name, message, rating]);

  return (
    <div className="tracker-engage-card tracker-feedback-card">
      <div className="tracker-engage-eyebrow">Your voice matters</div>
      <h3 className="tracker-engage-title">Leave us a message</h3>
      <p className="tracker-engage-body">
        Your words mean everything to our volunteers. It takes 30 seconds and stays
        private, just between you and our team.
      </p>

      {status === 'sent' ? (
        <div className="tracker-feedback-success">
          <div className="tracker-feedback-success-icon">♡</div>
          <div className="tracker-feedback-success-text">
            Thank you. Your message has been received by our team and will be shared
            with the volunteers who worked your case.
          </div>
        </div>
      ) : (
        <>
          <input
            className="tracker-feedback-field"
            type="text"
            placeholder="Your name"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={120}
            disabled={status === 'sending'}
          />
          <textarea
            className="tracker-feedback-field"
            placeholder="How did we do? What would you like our team to know?"
            rows={4}
            value={message}
            onChange={e => setMessage(e.target.value)}
            maxLength={2000}
            disabled={status === 'sending'}
          />
          <RatingPicker value={rating} onChange={setRating} disabled={status === 'sending'} />
          {status === 'error' && (
            <p className="tracker-feedback-error">Something went wrong. Please try again.</p>
          )}
          <button
            className="tracker-feedback-btn"
            onClick={submit}
            disabled={status === 'sending' || !message.trim() || !name.trim()}
          >
            {status === 'sending' ? 'Sending…' : 'Send your message'}
          </button>
        </>
      )}
    </div>
  );
}

// ─── Donation card ────────────────────────────────────────────────────────────

function DonateCard() {
  const { openDonate } = useDonate();
  return (
    <div className="tracker-engage-card tracker-donate-card">
      <div className="tracker-engage-eyebrow">Help the next family</div>
      <h3 className="tracker-engage-title">Help us answer the next call</h3>
      <p className="tracker-engage-body">
        Every case like yours is run entirely by volunteers and funded by people who care.
        No government funding. No corporate backing. Just people helping people.
      </p>
      <div className="tracker-donate-stat">
        <span className="tracker-donate-stat-num">~$150</span>
        <span className="tracker-donate-stat-label">covers one golden hour of response</span>
      </div>
      <a
        href={DONATE_URL}
        onClick={e => { e.preventDefault(); openDonate(); }}
        className="tracker-donate-btn"
      >
        Support our mission
      </a>
      <span className="tracker-donate-secondary">
        Secure · Takes 2 minutes · Every dollar reaches the field
      </span>
    </div>
  );
}

// ─── Completion screen ────────────────────────────────────────────────────────

function CompletionScreen({ data }: { data: CaseData }) {
  return (
    <>
      <section className="tracker-done-banner">
        <div className="tracker-done-mark" aria-hidden="true">✦</div>
        <h1 className="tracker-done-title">Case complete</h1>
        <p className="tracker-done-subtitle">
          Our team was with you every step of the way.
          We hope your family is safe and at peace.
        </p>
        <p className="tracker-done-powered">
          Handled by volunteers · Funded by donors like you
        </p>
      </section>

      <div className="tracker-engagement">
        <FeedbackCard caseId={data.item_id} />
        <DonateCard />
      </div>
    </>
  );
}

// ─── State screens ────────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="tracker-page">
      <div className="tracker-fullpage-state">
        <div className="tracker-skeleton-stack">
          <div className="tr-skel tracker-skel-ring" />
          <div className="tr-skel tracker-skel-line tracker-skel-line--title" />
          <div className="tr-skel tracker-skel-line" />
          <div className="tr-skel tracker-skel-line tracker-skel-line--short" />
          <div className="tracker-skel-rows">
            {[1, 2, 3].map(i => (
              <div key={i} className="tracker-skel-row">
                <div className="tr-skel tracker-skel-dot" />
                <div className="tracker-skel-row-text">
                  <div className="tr-skel tracker-skel-line tracker-skel-line--mid" />
                  <div className="tr-skel tracker-skel-line tracker-skel-line--thin" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function NotFoundScreen({ caseId }: { caseId?: string }) {
  return (
    <div className="tracker-page">
      <div className="tracker-fullpage-state">
        <div className="tracker-state-icon" aria-hidden="true">?</div>
        <h1 className="tracker-state-title">We couldn't find this case</h1>
        <p className="tracker-state-body">
          Nothing matches <strong>{caseId || 'this link'}</strong>.
          Please check the link you received, or contact our team and we'll help right away.
        </p>
        <a href="mailto:info@haverimmehalzim.org" className="tracker-state-link">Contact our team</a>
      </div>
    </div>
  );
}

function ErrorScreen() {
  return (
    <div className="tracker-page">
      <div className="tracker-fullpage-state">
        <div className="tracker-state-icon" aria-hidden="true">!</div>
        <h1 className="tracker-state-title">We can't reach our systems right now</h1>
        <p className="tracker-state-body">
          This page will try again by itself. If it keeps happening, please contact our team.
        </p>
        <a href="mailto:info@haverimmehalzim.org" className="tracker-state-link">Contact our team</a>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CaseTrackerPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const [loadState,   setLoadState]   = useState<LoadState>('loading');
  const [data,        setData]        = useState<CaseData | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [tick,        setTick]        = useState(0);

  const fetchData = useCallback(async () => {
    if (!caseId) { setLoadState('error'); return; }
    try {
      const res = await fetch(`/api/track/${caseId}`);
      if (res.status === 404) { setLoadState('not_found'); return; }
      if (!res.ok)            { setLoadState('error');     return; }
      const json = await res.json();
      if (!json.success)      { setLoadState('error');     return; }
      setData(json.data as CaseData);
      setLastUpdated(new Date());
      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }, [caseId]);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(iv);
  }, [fetchData]);

  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(iv);
  }, []);
  void tick;

  if (loadState === 'loading')        return <LoadingScreen />;
  if (loadState === 'not_found')      return <NotFoundScreen caseId={caseId} />;
  if (loadState === 'error' || !data) return <ErrorScreen />;

  const steps      = data.is_sensitive ? SENSITIVE_STEPS : NORMAL_STEPS;
  const current    = Math.min(Math.max(data.step, 1), data.total_steps);
  const isComplete = current === data.total_steps;
  const progress   = current / data.total_steps;
  const currentDef = steps.find(s => s.step === current) ?? steps[0];

  return (
    <div className={`tracker-page${data.is_sensitive ? ' sensitive' : ''}`}>
      <div className="tracker-topbar" aria-hidden="true">
        <div className="tracker-topbar-fill" style={{ width: `${progress * 100}%` }} />
      </div>

      <header className="tracker-header">
        <span className="tracker-header-org"><span className="tracker-header-dot" />Haverim Mehalzim</span>
        <span className="tracker-header-right">
          <span className="tracker-live-badge"><span className="tracker-live-dot" />Live</span>
          <span className="tracker-case-id">{fmtCaseId(data.item_id)}</span>
        </span>
      </header>

      <main className="tracker-content">
        {isComplete ? (
          <CompletionScreen data={data} />
        ) : (
          <section className="tracker-hero">
            <RingProgress step={current} total={data.total_steps} />
            <div className="tracker-hero-eyebrow">Where things stand</div>
            <h1 className="tracker-hero-title">{currentDef.title}</h1>
            <p className="tracker-hero-subtitle">{currentDef.subtitle}</p>
            <p className="tracker-hero-note">
              You don't need to do anything right now. This page updates by itself.
            </p>
          </section>
        )}

        <h2 className="tracker-section-title">Every step, in order</h2>

        <div className="tracker-timeline">
          {steps.map((s, idx) => (
            <div key={s.step}>
              {idx > 0 && (
                <div className={`tracker-connector tracker-connector--${s.step <= current ? 'filled' : 'empty'}`} />
              )}
              <TimelineStep def={s} current={current} />
            </div>
          ))}
        </div>

        <footer className="tracker-footer">
          {data.opened_date && (
            <span className="tracker-footer-meta">Case opened {fmtDate(data.opened_date)}</span>
          )}
          <span className="tracker-footer-meta">
            {lastUpdated ? timeAgoLabel(lastUpdated) : 'Loading…'}
            {' · '}Refreshes every minute
          </span>
          <a href="mailto:info@haverimmehalzim.org" className="tracker-footer-link">Need help? Contact us</a>
        </footer>
      </main>
    </div>
  );
}
