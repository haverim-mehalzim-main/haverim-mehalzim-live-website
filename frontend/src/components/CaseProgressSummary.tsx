import { useId, useState } from 'react';
import { CASE_JOURNEY_STEPS, CASE_JOURNEY_STEPS_SENSITIVE, journeyStepState } from './caseJourneySteps';
import { JourneyTimeline } from './CaseJourney';
import './journey.css';

const R = 26;
const CIRC = 2 * Math.PI * R;

// The caller's at-a-glance "where does my case stand": a small ring, the
// current step in one line, and a slim 8-segment bar. The full list of steps
// is one tap away but stays closed by default, so the page keeps its calm
// rhythm (the family view shows the whole list; the caller has more on the
// page and needs the answer first, the detail on demand).
export default function CaseProgressSummary({ step, total, sensitive }: {
  step: number;
  total: number;
  sensitive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const gradId = `jc-grad-${useId().replace(/:/g, '')}`;

  const steps = sensitive ? CASE_JOURNEY_STEPS_SENSITIVE : CASE_JOURNEY_STEPS;
  const current = Math.min(Math.max(step, 1), total);
  const def = steps.find(s => s.step === current) ?? steps[0];

  return (
    <section className={`account-card journey journey-compact${sensitive ? ' sensitive' : ''}`} aria-label="Case progress">
      <div className="jc-head">
        <div className="jc-ring">
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <defs>
              <linearGradient id={gradId} x1="64" y1="32" x2="0" y2="32" gradientUnits="userSpaceOnUse">
                <stop offset="0%" className="journey-ring-stop-a" />
                <stop offset="100%" className="journey-ring-stop-b" />
              </linearGradient>
            </defs>
            <circle className="jc-ring-track" cx="32" cy="32" r={R} />
            <circle
              className="jc-ring-fill" cx="32" cy="32" r={R}
              stroke={`url(#${gradId})`}
              strokeDasharray={CIRC}
              strokeDashoffset={CIRC * (1 - current / total)}
            />
          </svg>
          <div className="jc-ring-num">{current}</div>
        </div>
        <div className="jc-text">
          <div className="jc-eyebrow">Where things stand</div>
          <h2 className="jc-title">{def.title}</h2>
          <p className="jc-sub">{def.subtitle}</p>
        </div>
      </div>

      <div className="jc-bar" role="img" aria-label={`Step ${current} of ${total}: ${def.title}`}>
        {steps.map(s => <span key={s.step} className={`jc-seg ${journeyStepState(s, current)}`} />)}
      </div>

      <div className="jc-foot">
        <span className="jc-count">Step {current} of {total}</span>
        <button
          type="button" className="jc-toggle"
          aria-expanded={open} aria-controls={listId}
          onClick={() => setOpen(o => !o)}
        >
          {open ? 'Hide steps' : 'See all steps'}
          <svg className={`jc-chev${open ? ' jc-chev--open' : ''}`} width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {open && (
        <div id={listId}>
          <JourneyTimeline steps={steps} current={current} className="jc-list" />
        </div>
      )}
    </section>
  );
}
