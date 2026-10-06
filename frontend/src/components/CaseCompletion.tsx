import { useCallback, useState } from 'react';
import { useDonate } from '../context/DonateContext';
import './journey.css';

type FeedbackState = 'idle' | 'sending' | 'sent' | 'error';

const DONATE_URL = 'https://www.jgive.com/new/en/usd/donation-targets/110214';

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
    <div className="journey-rating">
      <div className="journey-rating-head">
        <span>How was our service?</span>
        <strong>{RATING_LABELS[value]}</strong>
      </div>
      <div className="journey-rating-dots" role="radiogroup" aria-label="Rate our service from 1 to 5">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={n === value}
            className={`journey-rating-dot${n <= value ? ' on' : ''}`}
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
    <div className="journey-engage-card journey-feedback-card">
      <div className="journey-engage-eyebrow">Your voice matters</div>
      <h3 className="journey-engage-title">Leave us a message</h3>
      <p className="journey-engage-body">
        Your words mean everything to our volunteers. It takes 30 seconds and stays
        private, just between you and our team.
      </p>

      {status === 'sent' ? (
        <div className="journey-feedback-success">
          <div className="journey-feedback-success-icon">♡</div>
          <div className="journey-feedback-success-text">
            Thank you. Your message has been received by our team and will be shared
            with the volunteers who worked your case.
          </div>
        </div>
      ) : (
        <>
          <input
            className="journey-feedback-field"
            type="text"
            placeholder="Your name"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={120}
            disabled={status === 'sending'}
          />
          <textarea
            className="journey-feedback-field"
            placeholder="How did we do? What would you like our team to know?"
            rows={4}
            value={message}
            onChange={e => setMessage(e.target.value)}
            maxLength={2000}
            disabled={status === 'sending'}
          />
          <RatingPicker value={rating} onChange={setRating} disabled={status === 'sending'} />
          {status === 'error' && (
            <p className="journey-feedback-error">Something went wrong. Please try again.</p>
          )}
          <button
            className="journey-feedback-btn"
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
    <div className="journey-engage-card journey-donate-card">
      <div className="journey-engage-eyebrow">Help the next family</div>
      <h3 className="journey-engage-title">Help us answer the next call</h3>
      <p className="journey-engage-body">
        Every case like yours is run entirely by volunteers and funded by people who care.
        No government funding. No corporate backing. Just people helping people.
      </p>
      <div className="journey-donate-stat">
        <span className="journey-donate-stat-num">~$150</span>
        <span className="journey-donate-stat-label">covers one golden hour of response</span>
      </div>
      <a
        href={DONATE_URL}
        onClick={e => { e.preventDefault(); openDonate(); }}
        className="journey-donate-btn"
      >
        Support our mission
      </a>
      <span className="journey-donate-secondary">
        Secure · Takes 2 minutes · Every dollar reaches the field
      </span>
    </div>
  );
}

// The closing moment of a case: a thank-you, then a way to tell the volunteers how it went
// and a gentle invitation to help the next family.

export default function CaseCompletion({ caseId }: { caseId: string }) {
  return (
    <div className="journey">
      <section className="journey-done-banner">
        <div className="journey-done-mark" aria-hidden="true">✦</div>
        <h1 className="journey-done-title">Case complete</h1>
        <p className="journey-done-subtitle">
          Our team was with you every step of the way.
          We hope your family is safe and at peace.
        </p>
        <p className="journey-done-powered">
          Handled by volunteers · Funded by donors like you
        </p>
      </section>

      <div className="journey-engagement">
        <FeedbackCard caseId={caseId} />
        <DonateCard />
      </div>
    </div>
  );
}
