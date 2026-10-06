import { CASE_JOURNEY_STEPS, CASE_JOURNEY_STEPS_SENSITIVE, journeyStepState } from './caseJourneySteps';
import './journey.css';

const RADIUS = 74;
const CIRC = 2 * Math.PI * RADIUS;

// The case's progress as a family sees it: a glowing ring with where things
// stand now, then every step in order. Used by the public tracker page and by
// the followed-case page in a family member's account, so both always match.
export default function CaseJourney({ step, total, sensitive, showHero = true, note }: {
  step: number;
  total: number;
  sensitive: boolean;
  showHero?: boolean;
  note?: string;
}) {
  const steps = sensitive ? CASE_JOURNEY_STEPS_SENSITIVE : CASE_JOURNEY_STEPS;
  const current = Math.min(Math.max(step, 1), total);
  const def = steps.find(s => s.step === current) ?? steps[0];
  const offset = CIRC * (1 - current / total);

  return (
    <div className={`journey${sensitive ? ' sensitive' : ''}`}>
      {showHero && (
        <section className="journey-hero">
          <div className="journey-ring-wrap">
            <svg className="journey-ring-svg" viewBox="0 0 176 176" aria-hidden="true">
              <defs>
                <linearGradient id="journey-ring-grad" gradientUnits="userSpaceOnUse" x1="176" y1="88" x2="0" y2="88">
                  <stop offset="0%" className="journey-ring-stop-a" />
                  <stop offset="100%" className="journey-ring-stop-b" />
                </linearGradient>
              </defs>
              <circle className="journey-ring-track" cx="88" cy="88" r={RADIUS} />
              <circle
                className="journey-ring-fill"
                cx="88" cy="88" r={RADIUS}
                stroke="url(#journey-ring-grad)"
                strokeDasharray={CIRC}
                strokeDashoffset={offset}
              />
            </svg>
            <div className="journey-ring-center">
              <div className="journey-ring-num">{current}</div>
              <div className="journey-ring-denom">of {total} steps</div>
            </div>
          </div>
          <div className="journey-hero-eyebrow">Where things stand</div>
          <h2 className="journey-hero-title">{def.title}</h2>
          <p className="journey-hero-subtitle">{def.subtitle}</p>
          {note && <p className="journey-hero-note">{note}</p>}
        </section>
      )}

      <h3 className="journey-section-title">Every step, in order</h3>

      <div className="journey-timeline">
        {steps.map((s, idx) => {
          const state = journeyStepState(s, current);
          return (
            <div key={s.step}>
              {idx > 0 && <div className={`journey-connector journey-connector--${s.step <= current ? 'filled' : 'empty'}`} />}
              <div className={`journey-step ${state}`}>
                <div className="journey-step-node">
                  {state === 'complete' ? '✓' : state === 'active' ? s.icon : s.step}
                </div>
                <div className="journey-step-body">
                  <div className="journey-step-title">{s.title}</div>
                  <div className="journey-step-subtitle">{s.subtitle}</div>
                  {state === 'active' && <span className="journey-step-pill">Happening now</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
