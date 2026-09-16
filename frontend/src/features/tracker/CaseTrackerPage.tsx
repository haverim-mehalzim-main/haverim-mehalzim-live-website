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
const RADIUS     = 55;
const CIRC       = 2 * Math.PI * RADIUS;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCaseId(id: string): string {
  return `CASE-${id.slice(-7).toUpperCase()}`;
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
  if (mins === 1) return 'Updated 1 min ago';
  return `Updated ${mins} min ago`;
}

// ─── Ring progress ────────────────────────────────────────────────────────────

function RingProgress({ step, total, sensitive }: { step: number; total: number; sensitive: boolean }) {
  const offset = CIRC * (1 - step / total);
  return (
    <div className="tracker-ring-wrap">
      <svg className="tracker-ring-svg" viewBox="0 0 148 148">
        <circle className="tracker-ring-track" cx="74" cy="74" r={RADIUS} />
        <circle
          className="tracker-ring-fill"
          cx="74" cy="74" r={RADIUS}
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          style={sensitive ? { stroke: 'var(--tr-amber)' } : undefined}
        />
      </svg>
      <div className="tracker-ring-center">
        <div className="tracker-ring-num">{step}</div>
        <div className="tracker-ring-denom">of {total}</div>
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
        {state === 'active'   && <span className="tracker-step-pill">In Progress</span>}
        {state === 'complete' && <span className="tracker-step-pill">Complete</span>}
      </div>
    </div>
  );
}

// ─── Feedback card ────────────────────────────────────────────────────────────

const RATING_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Very Good',
  5: 'Excellent',
};

function RatingSlider({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled: boolean }) {
  return (
    <div style={{ marginBottom: '1.1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontFamily: 'var(--tr-mono)', fontSize: 11, color: 'var(--tr-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Rate our service
        </span>
        <span style={{ fontFamily: 'var(--tr-mono)', fontSize: 12, fontWeight: 700, color: 'var(--tr-teal)', letterSpacing: '0.06em' }}>
          {value} / 5 — {RATING_LABELS[value]}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: 'var(--tr-mono)', fontSize: 10, color: 'var(--tr-muted)' }}>1</span>
        <input
          type="range"
          min={1} max={5} step={1}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          disabled={disabled}
          style={{ flex: 1, accentColor: 'var(--tr-teal)', cursor: disabled ? 'not-allowed' : 'pointer' }}
        />
        <span style={{ fontFamily: 'var(--tr-mono)', fontSize: 10, color: 'var(--tr-muted)' }}>5</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            onClick={() => !disabled && onChange(n)}
            disabled={disabled}
            style={{
              width: 32, height: 32,
              borderRadius: '50%',
              border: `1px solid ${n === value ? 'var(--tr-teal)' : 'rgba(255,255,255,0.08)'}`,
              background: n === value ? 'rgba(0,201,177,0.15)' : 'transparent',
              color: n === value ? 'var(--tr-teal)' : 'var(--tr-muted)',
              fontFamily: 'var(--tr-mono)',
              fontSize: 12,
              fontWeight: n === value ? 700 : 400,
              cursor: disabled ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
            }}
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
      <div className="tracker-engage-eyebrow">Your Voice Matters</div>
      <div className="tracker-engage-title">Leave us a message</div>
      <div className="tracker-engage-body">
        Your words mean everything to our volunteers.
        It takes 30 seconds and stays private — just between you and our team.
      </div>

      {status === 'sent' ? (
        <div className="tracker-feedback-success">
          <div className="tracker-feedback-success-icon">♡</div>
          <div className="tracker-feedback-success-text">
            Thank you — your message has been received by our team.<br />
            It will be shared with the volunteers who worked your case.
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
          <RatingSlider value={rating} onChange={setRating} disabled={status === 'sending'} />
          {status === 'error' && (
            <p style={{ fontSize: '0.75rem', color: '#f87171', marginBottom: '0.6rem', fontFamily: 'sans-serif' }}>
              Something went wrong — please try again.
            </p>
          )}
          <button
            className="tracker-feedback-btn"
            onClick={submit}
            disabled={status === 'sending' || !message.trim() || !name.trim()}
          >
            {status === 'sending' ? 'Sending…' : 'Send your message →'}
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
      <div className="tracker-engage-eyebrow">Support the Next Family</div>
      <div className="tracker-engage-title">Help us answer the next call</div>
      <div className="tracker-engage-body">
        Every case like yours is run entirely by volunteers and funded by
        people who care. No government funding. No corporate backing.
        Just people helping people.
      </div>
      <div className="tracker-donate-stat">
        <span className="tracker-donate-stat-num">~$150</span>
        <span className="tracker-donate-stat-label">per Golden Hour</span>
      </div>
      <a
        href={DONATE_URL}
        onClick={e => { e.preventDefault(); openDonate(); }}
        className="tracker-donate-btn"
      >
        Support our mission →
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
      <div className="tracker-done-banner">
        <div className="tracker-done-mark">✦</div>
        <div className="tracker-done-title">Case Complete</div>
        <p className="tracker-done-subtitle">
          Our team was with you every step of the way.<br />
          We hope your family is safe and at peace.
        </p>
        <p className="tracker-done-powered">
          Handled by volunteers · Funded by donors like you
        </p>
      </div>

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
    <div className="tracker-fullpage-state">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', width: 300 }}>
        <div className="tr-skel" style={{ height: 148, borderRadius: '50%', width: 148, margin: '0 auto' }} />
        <div className="tr-skel" style={{ height: '1.4rem', width: '55%', margin: '0.75rem auto 0' }} />
        <div className="tr-skel" style={{ height: '0.9rem', width: '80%', margin: '0 auto' }} />
        <div className="tr-skel" style={{ height: '0.9rem', width: '65%', margin: '0 auto' }} />
        <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <div className="tr-skel" style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div className="tr-skel" style={{ height: '0.8rem', width: '60%', marginBottom: '0.4rem' }} />
                <div className="tr-skel" style={{ height: '0.65rem', width: '85%' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function NotFoundScreen({ caseId }: { caseId?: string }) {
  return (
    <div className="tracker-fullpage-state">
      <div className="tracker-state-code">404</div>
      <div className="tracker-state-title">Case Not Found</div>
      <p className="tracker-state-body">
        We couldn't find a case matching{' '}
        <strong style={{ color: '#00c9b1' }}>{caseId || 'this ID'}</strong>.
        Please check the link you received or contact our support team.
      </p>
      <a href="mailto:info@haverimmehalzim.org" className="tracker-state-link">
        Contact Support →
      </a>
    </div>
  );
}

function ErrorScreen() {
  return (
    <div className="tracker-fullpage-state">
      <div className="tracker-state-code">ERR</div>
      <div className="tracker-state-title">Connection Error</div>
      <p className="tracker-state-body">
        We couldn't reach our systems right now. The page will retry automatically.
        If this persists, please contact our team.
      </p>
      <a href="mailto:info@haverimmehalzim.org" className="tracker-state-link">
        Contact Support →
      </a>
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

      {/* ── Header ── */}
      <header className="tracker-header">
        <span className="tracker-header-org">Haverim Mehalzim</span>
        <span className="tracker-live-badge">
          <span className="tracker-live-dot" />
          Live
        </span>
        <span className="tracker-case-id">{fmtCaseId(data.item_id)}</span>
      </header>

      {/* ── Top progress bar ── */}
      <div className="tracker-topbar">
        <div className="tracker-topbar-fill" style={{ width: `${progress * 100}%` }} />
      </div>

      <main className="tracker-content">

        {/* ── Complete: banner + engagement ── */}
        {isComplete && <CompletionScreen data={data} />}

        {/* ── In progress: ring hero ── */}
        {!isComplete && (
          <section className="tracker-hero">
            <RingProgress step={current} total={data.total_steps} sensitive={data.is_sensitive} />
            <div className="tracker-hero-eyebrow">Current Step</div>
            <h1 className="tracker-hero-title">{currentDef.title}</h1>
            <p className="tracker-hero-subtitle">{currentDef.subtitle}</p>
          </section>
        )}

        <div className="tracker-divider" />

        {/* ── Timeline ── */}
        <div className="tracker-timeline">
          {steps.map((s, idx) => (
            <div key={s.step}>
              {idx > 0 && (
                <div className={`tracker-connector ${s.step <= current ? 'filled' : 'empty'}`} />
              )}
              <TimelineStep def={s} current={current} />
            </div>
          ))}
        </div>

        {/* ── Footer ── */}
        <footer className="tracker-footer">
          {data.opened_date && (
            <span className="tracker-footer-meta">Case opened: {fmtDate(data.opened_date)}</span>
          )}
          <span className="tracker-footer-meta">
            {lastUpdated ? timeAgoLabel(lastUpdated) : 'Loading…'}
            {' · '}Auto-refreshes every 60 s
          </span>
          <a href="mailto:info@haverimmehalzim.org" className="tracker-footer-link">
            Need help? Contact us →
          </a>
        </footer>

      </main>
    </div>
  );
}
