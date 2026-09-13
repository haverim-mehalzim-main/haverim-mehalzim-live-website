import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import type { DashboardData } from './types';
import LiveMissionFeed from './LiveMissionFeed';
import { Tooltip } from '../../components/Tooltip';
import { useDonate } from '../../context/DonateContext';
import { useAuth } from '../../context/AuthContext';
import logoImg from '../../assets/logo.png';
import './dashboard.css';

// ── Replace with your real donation page URL ──────────────────────────────────
const DONATE_URL    = 'https://www.jgive.com/new/en/usd/donation-targets/110214';
const CONTACT_EMAIL = 'info@haverimmehalzim.org';

// ── Funnel config: Emergency → Community → Money ──────────────────────────────
// 1) EMERGENCY — primary "Help Me" SOS button links straight to the emergency
//    WhatsApp chat. Number is in full international format, digits only.
const EMERGENCY_WHATSAPP   = '972506899026';
const EMERGENCY_WA_MESSAGE = 'Hi, I need emergency help.';
const WHATSAPP_URL = `https://wa.me/${EMERGENCY_WHATSAPP}?text=${encodeURIComponent(EMERGENCY_WA_MESSAGE)}`;
// 2) COMMUNITY — "Volunteer" is the primary community ask (volunteer sign-up form).
const VOLUNTEER_URL = 'https://forms.monday.com/forms/2c04f95ad95a484c607ef71912af4e23?r=euc1';

const AVG_MISSION_COST = 150;   // USD — base Golden Hour cost
interface DonationTier { amount: number; title: string; desc: string; icon: string; highlight?: boolean; impactNote?: string; }
const DONATION_TIERS: DonationTier[] = [
  { amount: 150,   title: 'Golden Hour',                  desc: 'Funds one hour of emergency case management — the critical first window',                                              icon: '⚡' },
  { amount: 900,   title: 'Six-Hour Rapid Response',      desc: 'Covers six hours of coordinated response work for a complex emergency',                                              icon: '◈' },
  { amount: 3000,  title: '24-Hour SOS Shift',            desc: 'Funds one full day of emergency response coverage — keeping our team fully operational for 24 hours straight',      icon: '♥', highlight: true },
  { amount: 14000, title: 'Scoop & Run',                  desc: 'Full operation: 24h coordination, up to 3h helicopter, ambulance transfer, and initial hospital care',               icon: '★', impactNote: 'Donors at this level receive a private link to see the real-world impact of their contribution.' },
];

// ─── Data fetching ────────────────────────────────────────────────────────────

async function fetchDashboard(): Promise<DashboardData> {
  const res = await fetch('/api/dashboard');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error('API returned success: false');
  return json.data as DashboardData;
}

// ─── Small components ─────────────────────────────────────────────────────────

function CountUp({ to, duration = 1800, delay = 0 }: { to: number; duration?: number; delay?: number }) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!to) return;
    let raf: number;
    const timer = setTimeout(() => {
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        setValue(Math.floor(eased * to));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);

    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [to, duration, delay]);

  return <>{value.toLocaleString()}</>;
}

function SectionLabel({ text, stagger = '' }: { text: string; stagger?: string }) {
  return (
    <div className={`section-label fade-in ${stagger}`}>
      <div className="section-label-text">{text}</div>
      <div className="section-label-line" />
    </div>
  );
}

function KpiCard({ color, value, label, icon, tooltip }: {
  color: string; value: number | string; label: string; icon: React.ReactNode; tooltip?: string;
}) {
  return (
    <div className={`kpi-card ${color} fade-in`}>
      <div className="kpi-icon">{icon}</div>
      <div className="kpi-number">{value}</div>
      <div className="kpi-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
        {label}
        {tooltip && <Tooltip text={tooltip} />}
      </div>
    </div>
  );
}


// ─── Growth + ROI components ──────────────────────────────────────────────────

function GrowthMetric({
  label, prev, curr, delta, prevNum, accent, deltaSuffix = '',
}: {
  label: string; prev: string; curr: string;
  delta: number; prevNum: number; accent?: 'teal' | 'amber'; deltaSuffix?: string;
}) {
  const pct = prevNum > 0 ? Math.round(Math.abs(delta) / prevNum * 100) : null;
  const dir = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  return (
    <div className="growth-metric">
      <div className="growth-metric-label">{label}</div>
      <div className="growth-metric-values">
        <span className="growth-metric-prev">{prev}</span>
        <span className="growth-arrow">→</span>
        <span className={`growth-metric-curr${accent ? ` gm-${accent}` : ''}`}>{curr}</span>
      </div>
      <div className={`growth-delta gd-${dir}`}>
        {dir === 'flat' ? '—' : (
          <>
            {dir === 'up' ? '↑' : '↓'}{' '}
            {delta > 0 ? '+' : ''}{delta}{deltaSuffix}
            {pct !== null && !deltaSuffix && <span className="growth-delta-pct"> ({pct}%)</span>}
          </>
        )}
      </div>
    </div>
  );
}

function GrowthSnapshot({
  currentYearLabel, lastYearLabel, currentData, lastData,
}: {
  currentYearLabel: string; lastYearLabel: string;
  currentData: { total: number; handled: number };
  lastData:    { total: number; handled: number };
}) {
  return (
    <div className="growth-snapshot fade-in stagger-4">
      <div className="growth-header">
        <span className="growth-eyebrow">◈ Year over Year Growth</span>
        <span className="growth-period">{lastYearLabel} → {currentYearLabel}</span>
      </div>
      <div className="growth-grid growth-grid-2">
        <GrowthMetric
          label="Incidents Received"
          prev={lastData.total.toString()}
          curr={currentData.total.toString()}
          delta={currentData.total - lastData.total}
          prevNum={lastData.total}
        />
        <GrowthMetric
          label="Cases Managed"
          prev={lastData.handled.toString()}
          curr={currentData.handled.toString()}
          delta={currentData.handled - lastData.handled}
          prevNum={lastData.handled}
          accent="teal"
        />
      </div>
    </div>
  );
}

function DonorROI({ data }: { data: DashboardData }) {
  const [activeTierIdx, setActiveTierIdx] = useState(3);
  const activeTier = DONATION_TIERS[activeTierIdx];
  const { openDonate } = useDonate();

  return (
    <div className="donor-roi-section fade-in stagger-4">

      {/* Header */}
      <div className="donor-roi-header">
        <div className="donor-roi-header-left">
          <div className="donor-roi-eyebrow">◈ Your Donation in Action</div>
          <h2 className="donor-roi-headline">See what your money actually does.</h2>
        </div>
      </div>

      {/* Tier selector */}
      <div className="donor-tiers-label">Choose your impact level</div>
      <div className="donor-tiers-grid">
        {DONATION_TIERS.map((tier, i) => (
          <button
            key={tier.amount}
            className={`donor-tier-card${tier.highlight ? ' highlight' : ''}${activeTierIdx === i ? ' active' : ''}`}
            onClick={() => setActiveTierIdx(i)}
          >
            <div className="donor-tier-icon">{tier.icon}</div>
            <div className="donor-tier-amount">${tier.amount}</div>
            <div className="donor-tier-title">{tier.title}</div>
            <div className="donor-tier-desc">{tier.desc}</div>
          </button>
        ))}
      </div>

      {/* CTA */}
      <div className="donor-roi-footer">
        {activeTier.impactNote && (
          <div className="donor-tier-impact-note">
            <span className="donor-tier-impact-icon">★</span>
            <span>{activeTier.impactNote}</span>
          </div>
        )}
        <div className="donor-roi-cta">
          <a href={DONATE_URL} onClick={e => { e.preventDefault(); openDonate(); }} className="donor-roi-btn-primary">
            ♥ Donate Now
          </a>
        </div>
      </div>

    </div>
  );
}

function YearTypeRows({ received, handled }: { received: Record<string, number>; handled: Record<string, number> }) {
  const allTypes = Array.from(new Set([...Object.keys(received), ...Object.keys(handled)]));
  allTypes.sort((a, b) => (received[b] ?? 0) - (received[a] ?? 0));
  if (!allTypes.length) return <div className="empty">No data</div>;
  const maxReceived = Math.max(...allTypes.map(t => received[t] ?? 0), 1);
  return (
    <>
      {/* Column headers */}
      <div className="type-row" style={{ paddingBottom: 6, borderBottom: '1px solid var(--border-dim)' }}>
        <div className="type-name" style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Type</div>
        <div style={{ flex: 1 }} />
        <div className="type-count" style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', minWidth: 64, display: 'flex', alignItems: 'center', gap: 2 }}>
          Received
          <Tooltip text="Total calls received by our Emergency Response Center" />
        </div>
        <div className="type-count" style={{ fontSize: 10, color: 'var(--accent-teal)', textTransform: 'uppercase', letterSpacing: '0.1em', minWidth: 56, display: 'flex', alignItems: 'center', gap: 2 }}>
          Cases
          <Tooltip text="Emergency cases our team coordinated and managed end-to-end" />
        </div>
      </div>
      {allTypes.map(type => {
        const recv = received[type] ?? 0;
        const done = handled[type] ?? 0;
        const pct  = Math.round((recv / maxReceived) * 100);
        return (
          <div className="type-row" key={type}>
            <div className="type-name">{type || 'Unknown'}</div>
            <div className="type-bar-container">
              <div className="type-bar" style={{ width: `${pct}%` }} />
            </div>
            <div className="type-count" style={{ minWidth: 64 }}>{recv}</div>
            <div className="type-count" style={{ minWidth: 56, color: 'var(--accent-teal)' }}>{done}</div>
          </div>
        );
      })}
    </>
  );
}

function TypeRows({ types }: { types: Record<string, number> }) {
  const entries = Object.entries(types).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return <div className="empty">No data</div>;
  const max = entries[0][1];
  return (
    <>
      {entries.map(([type, count]) => (
        <div className="type-row" key={type}>
          <div className="type-name">{type || 'Unknown'}</div>
          <div className="type-bar-container">
            <div className="type-bar" style={{ width: `${Math.round((count / max) * 100)}%` }} />
          </div>
          <div className="type-count">{count}</div>
        </div>
      ))}
    </>
  );
}

function CountryRows({ countries }: { countries: Record<string, number> }) {
  const entries = Object.entries(countries).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return <div className="empty">No data</div>;
  return (
    <>
      {entries.map(([country, count], i) => (
        <div className="country-row" key={country}>
          <div className="country-rank">{String(i + 1).padStart(2, '0')}</div>
          <div className="country-name">{country || 'Unknown'}</div>
          <div className="country-badge">{count}</div>
        </div>
      ))}
    </>
  );
}

function CountriesModal({ title, countries, onClose }: {
  title: string; countries: Record<string, number>; onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const total = Object.keys(countries).length;

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(4,8,12,0.88)', backdropFilter: 'blur(6px)',
        padding: 24,
        animation: 'fadeIn 0.15s ease',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#0d1117',
          border: '1px solid rgba(0,230,160,0.2)',
          borderRadius: 16,
          width: '100%', maxWidth: 480,
          maxHeight: '80vh',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 0 0 1px rgba(0,230,160,0.06), 0 32px 80px rgba(0,0,0,0.7)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 22px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
          background: 'rgba(0,230,160,0.03)',
        }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
              {title}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent-teal)', letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: 3 }}>
              {total} countries
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8, cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: 18, lineHeight: 1,
              width: 36, height: 36,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >×</button>
        </div>
        {/* Scrollable list */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <CountryRows countries={countries} />
        </div>
        {/* Footer hint */}
        <div style={{
          padding: '10px 22px',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          fontFamily: 'var(--font-mono)', fontSize: 10,
          color: 'rgba(255,255,255,0.18)', letterSpacing: '0.1em',
          textAlign: 'center', flexShrink: 0,
        }}>
          Press ESC or click outside to close
        </div>
      </div>
    </div>,
    document.body
  );
}

const COUNTRY_PREVIEW = 5;

function CountryPanel({ title, countries }: { title: string; countries: Record<string, number> }) {
  const [open, setOpen] = useState(false);
  const entries = Object.entries(countries).sort((a, b) => b[1] - a[1]);
  const total = entries.length;
  const preview = Object.fromEntries(entries.slice(0, COUNTRY_PREVIEW));

  return (
    <>
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">{title}</div>
          <div className="panel-count">{total} countries</div>
        </div>
        <div className="panel-body">
          <CountryRows countries={preview} />
        </div>
        {total > COUNTRY_PREVIEW && (
          <button
            onClick={() => setOpen(true)}
            className="show-all-btn"
          >
            Show all {total} countries ↗
          </button>
        )}
      </div>
      {open && (
        <CountriesModal
          title={title}
          countries={countries}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

type PeriodTab = 'month' | 'last_month' | 'year';

const PERIOD_TABS: { key: PeriodTab; label: string }[] = [
  { key: 'year',       label: 'This Year'  },
  { key: 'last_month', label: 'Last Month' },
  { key: 'month',      label: 'This Month' },
];

function PeriodCard({
  currentMonth,
  lastMonth,
  currentYear,
  monthData,
  lastMonthData,
  yearData,
}: {
  currentMonth: string;
  lastMonth: string;
  currentYear: number;
  monthData:     { total: number; handled: number; types: Record<string, number>; handled_types: Record<string, number> };
  lastMonthData: { total: number; handled: number; types: Record<string, number>; handled_types: Record<string, number> };
  yearData:      { total: number; handled: number; types: Record<string, number>; handled_types: Record<string, number> };
}) {
  const [tab, setTab] = useState<PeriodTab>('year');
  const indicatorRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Partial<Record<PeriodTab, HTMLButtonElement | null>>>({});

  useEffect(() => {
    const btn = btnRefs.current[tab];
    const ind = indicatorRef.current;
    if (!btn || !ind) return;
    ind.style.left  = `${btn.offsetLeft}px`;
    ind.style.width = `${btn.offsetWidth}px`;
  }, [tab]);

  const dataMap: Record<PeriodTab, typeof monthData> = {
    month:      monthData,
    last_month: lastMonthData,
    year:       yearData,
  };
  const labelMap: Record<PeriodTab, string> = {
    month:      currentMonth,
    last_month: lastMonth,
    year:       String(currentYear),
  };

  const d     = dataMap[tab];
  const label = labelMap[tab];

  return (
    <div className="panel fade-in">
      {/* Tab header */}
      <div className="panel-header" style={{ paddingBottom: 0, borderBottom: 'none', flexDirection: 'column', alignItems: 'stretch', gap: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div className="panel-title">Performance by Period</div>
          <span className="panel-count">{label}</span>
        </div>
        {/* Tabs */}
        <div style={{ position: 'relative', display: 'flex', gap: 0, borderBottom: '1px solid var(--border-dim)' }}>
          {PERIOD_TABS.map(({ key, label: tabLabel }) => (
            <button
              key={key}
              ref={el => { btnRefs.current[key] = el; }}
              onClick={() => setTab(key)}
              style={{
                padding: '8px 20px',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: tab === key ? 'var(--text-primary)' : 'var(--text-muted)',
                transition: 'color 0.2s',
              }}
            >
              {tabLabel}
            </button>
          ))}
          {/* Sliding underline */}
          <div
            ref={indicatorRef}
            style={{
              position: 'absolute',
              bottom: -1,
              height: 2,
              background: 'var(--accent-teal)',
              borderRadius: 1,
              transition: 'left 0.25s ease, width 0.25s ease',
            }}
          />
        </div>
      </div>

      {/* Stats + breakdown */}
      <div className="month-hero" style={{ borderRadius: 0, border: 'none', padding: '24px 22px', marginBottom: 0 }}>
        <div className="month-stats">
          <div className="month-stat">
            <div className="month-stat-value">{d.total}</div>
            <div className="month-stat-label">Incidents Received</div>
          </div>
          <div className="month-stat">
            <div className="month-stat-value" style={{ color: 'var(--accent-teal)' }}>{d.handled}</div>
            <div className="month-stat-label">Cases Managed</div>
          </div>
        </div>
        <div className="month-divider" />
        <div className="month-breakdown">
          {tab === 'year'
            ? <YearTypeRows received={d.types} handled={d.handled_types} />
            : <TypeRows types={d.types} />
          }
        </div>
      </div>
    </div>
  );
}

function Panel({ title, count, children }: {
  title: string; count?: string; children: React.ReactNode;
}) {
  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">{title}</div>
        {count && <div className="panel-count">{count}</div>}
      </div>
      <div className="panel-body">{children}</div>
    </div>
  );
}

// ─── Hero globe visual ───────────────────────────────────────────────────────

const HQ_X = 172, HQ_Y = 131;
const GLOBE_MARKERS = [
  { cx: 116, cy: 100 },  // Western Europe
  { cx: 65,  cy: 115 },  // East Coast USA
  { cx: 48,  cy: 135 },  // West Coast USA
  { cx: 216, cy: 150 },  // Southeast Asia
  { cx: 80,  cy: 192 },  // South America
  { cx: 153, cy: 196 },  // Southern Africa
  { cx: 232, cy: 196 },  // Australia
  { cx: 184, cy: 108 },  // Eastern Europe / Turkey
];

function HeroGlobe() {
  return (
    <div className="hero-visual-wrap">
      <div className="hud-corner hud-tl" />
      <div className="hud-corner hud-tr" />
      <div className="hud-corner hud-bl" />
      <div className="hud-corner hud-br" />
      <div className="hud-tag hud-tag-tl">◈ LIVE OPS</div>
      <div className="hud-tag hud-tag-br">GLOBAL NET</div>
      <svg viewBox="0 0 300 300" className="hero-globe-svg" aria-hidden="true">
        <defs>
          <radialGradient id="hgGlobe" cx="38%" cy="35%" r="65%">
            <stop offset="0%"   stopColor="#0d2a1e" />
            <stop offset="100%" stopColor="#040c09" />
          </radialGradient>
          <filter id="hgGlow">
            <feGaussianBlur stdDeviation="2.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="hgDot">
            <feGaussianBlur stdDeviation="1.2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Globe body */}
        <circle cx="150" cy="150" r="115" fill="url(#hgGlobe)" />
        <circle cx="150" cy="150" r="115" fill="none" stroke="rgba(0,230,160,0.22)" strokeWidth="1" />

        {/* Latitude lines */}
        <ellipse cx="150" cy="50"  rx="58"  ry="13"  fill="none" stroke="rgba(0,230,160,0.07)" strokeWidth="0.6" />
        <ellipse cx="150" cy="93"  rx="100" ry="22"  fill="none" stroke="rgba(0,230,160,0.07)" strokeWidth="0.6" />
        <ellipse cx="150" cy="150" rx="115" ry="27"  fill="none" stroke="rgba(0,230,160,0.11)" strokeWidth="0.7" />
        <ellipse cx="150" cy="207" rx="100" ry="22"  fill="none" stroke="rgba(0,230,160,0.07)" strokeWidth="0.6" />
        <ellipse cx="150" cy="250" rx="58"  ry="13"  fill="none" stroke="rgba(0,230,160,0.07)" strokeWidth="0.6" />

        {/* Longitude lines */}
        <line x1="150" y1="35" x2="150" y2="265" stroke="rgba(0,230,160,0.09)" strokeWidth="0.6" />
        <ellipse cx="150" cy="150" rx="58"  ry="115" fill="none" stroke="rgba(0,230,160,0.07)" strokeWidth="0.6" />
        <ellipse cx="150" cy="150" rx="100" ry="115" fill="none" stroke="rgba(0,230,160,0.07)" strokeWidth="0.6" />

        {/* Radar sweep */}
        <g className="hg-sweep">
          <path d="M 150 150 L 150 35 A 115 115 0 0 1 250 93 Z" fill="rgba(0,230,160,0.05)" />
          <line x1="150" y1="150" x2="150" y2="35" stroke="rgba(0,230,160,0.6)" strokeWidth="1.2" />
        </g>

        {/* Outer dashed ring */}
        <circle cx="150" cy="150" r="118" fill="none" stroke="rgba(0,230,160,0.22)"
          strokeWidth="0.8" strokeDasharray="3 4" className="hg-outer-ring" />

        {/* Connection arcs from HQ to each marker */}
        {GLOBE_MARKERS.map(({ cx, cy }, i) => {
          const cpx = (HQ_X + cx) / 2 + (150 - (HQ_X + cx) / 2) * 0.3;
          const cpy = (HQ_Y + cy) / 2 + (150 - (HQ_Y + cy) / 2) * 0.3 - 16;
          return (
            <path key={i}
              d={`M ${HQ_X} ${HQ_Y} Q ${cpx} ${cpy} ${cx} ${cy}`}
              fill="none" stroke="rgba(0,230,160,0.22)" strokeWidth="0.8"
              className="hg-arc" style={{ animationDelay: `${i * 0.35}s` }}
            />
          );
        })}

        {/* Pulse rings */}
        {GLOBE_MARKERS.map(({ cx, cy }, i) => (
          <circle key={i} cx={cx} cy={cy} r="7" fill="none"
            stroke="rgba(0,230,160,0.55)" strokeWidth="0.9"
            className="hg-pulse" style={{ animationDelay: `${i * 0.32}s` }}
          />
        ))}

        {/* Incident dots */}
        {GLOBE_MARKERS.map(({ cx, cy }, i) => (
          <circle key={i} cx={cx} cy={cy} r="2.5" fill="#00e6a0" filter="url(#hgDot)" />
        ))}

        {/* HQ marker */}
        <circle cx={HQ_X} cy={HQ_Y} r="16" fill="none" stroke="rgba(0,230,160,0.2)"
          strokeWidth="0.8" className="hg-pulse" style={{ animationDelay: '0.6s' }} />
        <circle cx={HQ_X} cy={HQ_Y} r="9"  fill="none" stroke="rgba(0,230,160,0.5)" strokeWidth="1" />
        <circle cx={HQ_X} cy={HQ_Y} r="4"  fill="#00e6a0" filter="url(#hgGlow)" />
        <text x={HQ_X + 7} y={HQ_Y - 7} fontSize="5.5" fill="rgba(0,230,160,0.75)"
          fontFamily="monospace" letterSpacing="0.08em">HQ</text>
      </svg>
    </div>
  );
}

// ─── SVG Icons ───────────────────────────────────────────────────────────────

const IconSignal = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="#00e6a0" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="8" cy="8" r="2" /><path d="M3 13a7 7 0 0 1 0-10M13 3a7 7 0 0 1 0 10" />
  </svg>
);
const IconShield = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="#00e6a0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 2L3 4.5v4c0 3 2 5 5 5.5 3-.5 5-2.5 5-5.5v-4L8 2z" />
  </svg>
);
const IconUsers = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="#4da6ff" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="6" cy="5" r="2.5" /><path d="M1.5 13.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" />
    <path d="M11 3.5a2.5 2.5 0 0 1 0 5M14.5 13.5c0-2-1.5-3.5-3.5-3.5" />
  </svg>
);
const IconGlobe = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="#ffb930" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="8" cy="8" r="6" /><path d="M2 8h12M8 2a10 10 0 0 1 0 12M8 2a10 10 0 0 0 0 12" />
  </svg>
);
const IconRate = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="#00e6a0" strokeWidth="1.5" strokeLinecap="round">
    <path d="M2 12L6 7l3 3 5-6" /><circle cx="14" cy="4" r="1.5" fill="#00e6a0" stroke="none" />
  </svg>
);

// ─── Testimonials ─────────────────────────────────────────────────────────────

interface Testimonial { name: string; message: string; case_ref: string; timestamp: string; rating?: number | null; }

const CYCLE_MS = 7000;

function StarRating({ rating }: { rating: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 12 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <svg key={n} width="14" height="14" viewBox="0 0 14 14" fill={n <= rating ? '#D4AF37' : 'none'} stroke={n <= rating ? '#D4AF37' : 'rgba(212,175,55,0.25)'} strokeWidth="1.2">
          <polygon points="7,1 8.8,5.2 13.5,5.5 10,8.6 11.1,13.2 7,10.5 2.9,13.2 4,8.6 0.5,5.5 5.2,5.2" />
        </svg>
      ))}
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'rgba(212,175,55,0.7)', marginLeft: 4 }}>
        {rating}/5
      </span>
    </div>
  );
}

function TestimonialsSection() {
  const { openDonate } = useDonate();
  const [items, setItems]         = useState<Testimonial[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [animClass, setAnimClass] = useState('t-enter-right');
  const [animKey, setAnimKey]     = useState(0);
  const [progress, setProgress]   = useState(0);
  const rafRef   = useRef<number>(0);
  const startRef = useRef<number>(0);

  useEffect(() => {
    fetch('/api/testimonials')
      .then(r => r.json())
      .then(j => { if (j.success && j.data?.length) setItems(j.data); })
      .catch(() => {});
  }, []);

  const goTo = (idx: number, dir: 'fwd' | 'bwd') => {
    cancelAnimationFrame(rafRef.current);
    setAnimClass(dir === 'fwd' ? 't-exit-left' : 't-exit-right');
    setTimeout(() => {
      setActiveIdx(idx);
      setAnimClass(dir === 'fwd' ? 't-enter-right' : 't-enter-left');
      setAnimKey(k => k + 1);
      setProgress(0);
      startRef.current = performance.now();
    }, 260);
  };

  useEffect(() => {
    if (items.length <= 1) return;
    cancelAnimationFrame(rafRef.current);
    startRef.current = performance.now();
    const tick = (now: number) => {
      const pct = Math.min((now - startRef.current) / CYCLE_MS, 1);
      setProgress(pct);
      if (pct >= 1) {
        const next = (activeIdx + 1) % items.length;
        setAnimClass('t-exit-left');
        setTimeout(() => {
          setActiveIdx(next);
          setAnimClass('t-enter-right');
          setAnimKey(k => k + 1);
          setProgress(0);
        }, 260);
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [items.length, activeIdx]);

  if (!items.length) return null;

  const active = items[activeIdx];

  return (
    <div className="testimonials-wrap fade-in stagger-3">

      <div className="testimonials-eyebrow">
        <span className="testimonials-eyebrow-tag">❝ Real Stories</span>
        <span className="testimonials-eyebrow-line" />
        <span className="testimonials-eyebrow-sub">Families we've helped — in their own words</span>
      </div>

      {/* key forces remount on each slide so the animation always fires fresh */}
      <div key={animKey} className={`testimonial-spotlight ${animClass}`}>
        <div className="testimonial-bg-glyph" aria-hidden>"</div>

        {active.rating != null && <StarRating rating={active.rating} />}

        <blockquote className="testimonial-spotlight-body">{active.message}</blockquote>

        <div className="testimonial-spotlight-author">
          <div className="testimonial-avatar">
            {active.name.trim().charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="testimonial-name">{active.name}</div>
            {active.case_ref && (
              <div className="testimonial-case">
                Case ···{active.case_ref}{active.timestamp ? ` · ${active.timestamp}` : ''}
              </div>
            )}
          </div>
        </div>

        <div className="testimonial-spotlight-cta">
          <span className="testimonial-spotlight-cta-text">
            Every outcome like this is funded by people who care.
          </span>
          <a href={DONATE_URL} onClick={e => { e.preventDefault(); openDonate(); }} className="testimonial-spotlight-cta-btn">
            ♥ Help the Next Family
          </a>
        </div>

        {items.length > 1 && (
          <div className="testimonial-progress-track">
            <div className="testimonial-progress-bar" style={{ width: `${progress * 100}%` }} />
          </div>
        )}
      </div>

      {items.length > 1 && (
        <div className="testimonial-dots">
          {items.map((_, i) => (
            <button
              key={i}
              className={`testimonial-dot${i === activeIdx ? ' active' : ''}`}
              onClick={() => goTo(i, i > activeIdx ? 'fwd' : 'bwd')}
              aria-label={`Story ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Donor Impact Teaser ──────────────────────────────────────────────────────

function DonorImpactTeaser() {
  const [token, setToken] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let t = token.trim();
    // Accept a full URL (paste from email) or just the raw token
    if (t.includes('/')) t = t.split('/').pop() || t;
    t = t.toLowerCase().replace(/[^0-9a-f]/g, '');
    if (t) navigate(`/my-impact/${t}`);
  };

  return (
    <div className="donor-teaser fade-in stagger-4">
      <div className="donor-teaser-left">
        <div className="donor-teaser-eyebrow">◈ Already donated?</div>
        <div className="donor-teaser-sub">
          Enter your personal code to see your direct impact on our operations
        </div>
      </div>
      <form onSubmit={handleSubmit} className="donor-teaser-form">
        <input
          className="donor-teaser-input"
          type="text"
          value={token}
          onChange={e => setToken(e.target.value)}
          placeholder="Your personal code"
          spellCheck={false}
          autoComplete="off"
        />
        <button type="submit" className="donor-teaser-btn" disabled={!token.trim()}>
          See My Impact →
        </button>
      </form>
    </div>
  );
}

// ─── Page navigation cards ────────────────────────────────────────────────────

function PageNavCards() {
  return (
    <div className="page-nav-section fade-in stagger-3">
      <SectionLabel text="Explore" />
      <div className="page-nav-grid">
        <Link to="/map" className="page-nav-card page-nav-card--teal">
          <div className="page-nav-card-eyebrow">◉ Operations</div>
          <div className="page-nav-card-title">Live Operations Map</div>
          <div className="page-nav-card-desc">Every active and resolved incident plotted on a live 3D world map</div>
          <div className="page-nav-card-cta">Open Map →</div>
        </Link>
        <Link to="/fund-our-team" className="page-nav-card page-nav-card--blue">
          <div className="page-nav-card-eyebrow">◈ Transparency</div>
          <div className="page-nav-card-title">Fund Our Team</div>
          <div className="page-nav-card-desc">Every response tier explained — what it costs, what it covers, and how to fund it</div>
          <div className="page-nav-card-cta">See Breakdown →</div>
        </Link>
        <Link to="/premium" className="page-nav-card page-nav-card--gold">
          <div className="page-nav-card-eyebrow">★ Premium</div>
          <div className="page-nav-card-title">Premium Membership</div>
          <div className="page-nav-card-desc">A one-time contribution for permanent priority status, starting with 24/7 availability</div>
          <div className="page-nav-card-cta">Go Premium →</div>
        </Link>
        {/* <Link to="/leaderboard" className="page-nav-card page-nav-card--gold">
          <div className="page-nav-card-eyebrow">★ Donors</div>
          <div className="page-nav-card-title">Donor Leaderboard</div>
          <div className="page-nav-card-desc">Top donors ranked by lives saved — see where your name stands</div>
          <div className="page-nav-card-cta">View Rankings →</div>
        </Link> */}
      </div>
    </div>
  );
}

// ─── Newsletter sign-up ──────────────────────────────────────────────────────────

const INTEREST_OPTIONS = ['Volunteering', 'Donating', 'Updates'] as const;
type Interest = typeof INTEREST_OPTIONS[number];

function NewsletterSignup() {
  const [name, setName]           = useState('');
  const [email, setEmail]         = useState('');
  const [interests, setInterests] = useState<Interest[]>(['Updates']);
  const [status, setStatus]       = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg]   = useState('');

  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const canSubmit  = name.trim().length > 0 && emailValid && status !== 'submitting';

  const toggleInterest = (i: Interest) =>
    setInterests(prev => (prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim())   { setErrorMsg('Please enter your name.');           setStatus('error'); return; }
    if (!emailValid)    { setErrorMsg('Please enter a valid email address.'); setStatus('error'); return; }

    setStatus('submitting');
    setErrorMsg('');
    try {
      const res = await fetch('/api/newsletter', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: name.trim(), email: email.trim(), interests }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.message || 'Something went wrong.');
      setStatus('success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not sign you up. Please try again.');
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <div className="newsletter-section fade-in" id="newsletter">
        <div className="newsletter-success" role="status">
          <div className="newsletter-success-icon">✓</div>
          <div className="newsletter-success-title">You’re on the list.</div>
          <div className="newsletter-success-sub">Thank you for joining our community — we’ll be in touch.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="newsletter-section fade-in" id="newsletter">
      <div className="newsletter-intro">
        <div className="newsletter-eyebrow">◈ Join the Community</div>
        <h2 className="newsletter-headline">Stay close to the mission.</h2>
        <p className="newsletter-body">
          Get field updates and ways to help — whether you want to volunteer, donate, or simply follow along.
        </p>
      </div>
      <form className="newsletter-form" onSubmit={handleSubmit} noValidate>
        <div className="newsletter-field">
          <label htmlFor="nl-name" className="newsletter-label">Name</label>
          <input
            id="nl-name" className="newsletter-input" type="text" value={name}
            onChange={e => setName(e.target.value)} autoComplete="name" required
          />
        </div>
        <div className="newsletter-field">
          <label htmlFor="nl-email" className="newsletter-label">Email</label>
          <input
            id="nl-email" className="newsletter-input" type="email" value={email}
            onChange={e => setEmail(e.target.value)} autoComplete="email" required
            aria-invalid={status === 'error' && !emailValid}
          />
        </div>
        <fieldset className="newsletter-interests">
          <legend className="newsletter-label">I’m interested in</legend>
          {INTEREST_OPTIONS.map(opt => (
            <label key={opt} className="newsletter-checkbox">
              <input type="checkbox" checked={interests.includes(opt)} onChange={() => toggleInterest(opt)} />
              <span>{opt}</span>
            </label>
          ))}
        </fieldset>
        {status === 'error' && <div className="newsletter-error" role="alert">{errorMsg}</div>}
        <button type="submit" className="newsletter-submit" disabled={!canSubmit}>
          {status === 'submitting' ? 'Signing up…' : 'Sign Up'}
        </button>
      </form>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

// ─── Geo period modal ────────────────────────────────────────────────────────

function GeoPeriodModal({ currentMonth, lastMonth, data, onClose }: {
  currentMonth: string; lastMonth: string; data: DashboardData; onClose: () => void;
}) {
  type GeoTab = 'this' | 'last';
  const [tab, setTab] = useState<GeoTab>('this');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const countries = tab === 'this' ? data.current_month.countries   : data.last_month.countries;
  const handled   = tab === 'this' ? data.current_month.handled_countries : data.last_month.handled_countries;
  const label     = tab === 'this' ? currentMonth : lastMonth;

  const tabBtn = (t: GeoTab, lbl: string) => (
    <button
      key={t}
      onClick={() => setTab(t)}
      style={{
        background:    tab === t ? 'rgba(0,230,160,0.1)' : 'none',
        border:        tab === t ? '1px solid rgba(0,230,160,0.3)' : '1px solid transparent',
        borderRadius:  6, padding: '5px 14px', cursor: 'pointer',
        fontFamily:    'var(--font-mono)', fontSize: 10,
        letterSpacing: '0.1em', textTransform: 'uppercase',
        color:         tab === t ? 'var(--accent-teal)' : 'var(--text-muted)',
        transition: 'all 0.15s',
      }}
    >{lbl}</button>
  );

  return createPortal(
    <div
      style={{ position:'fixed', inset:0, zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center',
        background:'rgba(4,8,12,0.88)', backdropFilter:'blur(6px)', padding:24, animation:'fadeIn 0.15s ease' }}
      onClick={onClose}
    >
      <div
        style={{ background:'#0d1117', border:'1px solid rgba(0,230,160,0.2)', borderRadius:16,
          width:'100%', maxWidth:660, maxHeight:'82vh', overflow:'hidden', display:'flex',
          flexDirection:'column', boxShadow:'0 0 0 1px rgba(0,230,160,0.06), 0 32px 80px rgba(0,0,0,0.7)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12,
          padding:'16px 20px', borderBottom:'1px solid rgba(255,255,255,0.06)',
          flexShrink:0, background:'rgba(0,230,160,0.03)', flexWrap:'wrap' }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:15, fontWeight:700, color:'var(--text-primary)' }}>
            Geographic Distribution — {label}
          </div>
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            {tabBtn('this', currentMonth)}
            {tabBtn('last', lastMonth)}
            <button onClick={onClose} style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)',
              borderRadius:8, cursor:'pointer', color:'var(--text-muted)', fontSize:18, lineHeight:1,
              width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center', marginLeft:4,
              transition:'background 0.15s, color 0.15s' }}
              onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.08)';e.currentTarget.style.color='#fff'}}
              onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,0.04)';e.currentTarget.style.color='var(--text-muted)'}}>×</button>
          </div>
        </div>
        {/* Two-column body */}
        <div className="geo-modal-grid">
          <div>
            <div style={{ padding:'10px 16px 8px', fontFamily:'var(--font-mono)', fontSize:9,
              color:'var(--text-muted)', letterSpacing:'0.15em', textTransform:'uppercase',
              borderBottom:'1px solid rgba(255,255,255,0.05)' }}>Countries Reached</div>
            <CountryRows countries={countries} />
          </div>
          <div style={{ borderLeft:'1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ padding:'10px 16px 8px', fontFamily:'var(--font-mono)', fontSize:9,
              color:'var(--accent-teal)', letterSpacing:'0.15em', textTransform:'uppercase',
              borderBottom:'1px solid rgba(255,255,255,0.05)' }}>Cases Managed</div>
            <CountryRows countries={handled} />
          </div>
        </div>
        <div style={{ padding:'9px 20px', borderTop:'1px solid rgba(255,255,255,0.05)',
          fontFamily:'var(--font-mono)', fontSize:9, color:'rgba(255,255,255,0.18)',
          letterSpacing:'0.1em', textAlign:'center', flexShrink:0 }}>
          Press ESC or click outside to close
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { openDonate } = useDonate();
  const { user } = useAuth();
  const [data, setData]             = useState<DashboardData | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>('—');
  const [geoModalOpen, setGeoModalOpen] = useState(false);

  const load = () => {
    fetchDashboard()
      .then(d => {
        setData(d);
        setLastUpdate(new Date().toLocaleTimeString('en-GB'));
        setError(null);
      })
      .catch(e => setError(e.message));
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const currentMonth = new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  const lastMonthDate = new Date();
  lastMonthDate.setDate(1);
  lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
  const lastMonth = lastMonthDate.toLocaleString('en-GB', { month: 'long', year: 'numeric' });

  return (
    <div className="page-bg">
      <div className="page-wrapper">

        {/* ── Header ── */}
        <header>
          <div className="header-brand">
            <div className="brand-icon">
              <img src={logoImg} alt="Haverim Mehalzim" className="brand-logo-img" />
              <div className="brand-powered">Powered by Gvanim</div>
            </div>
            <div>
              <div className="brand-title">Haverim Mehalzim</div>
              <div className="brand-sub">Incident Command Dashboard</div>
            </div>
          </div>
          <nav className="header-nav">
            <Link to="/map" className="header-nav-link">Live Map</Link>
            <Link to="/fund-our-team" className="header-nav-link">Fund Our Team</Link>
            {/* <Link to="/leaderboard" className="header-nav-link">Leaderboard</Link> */}
            <Link to={user ? '/account' : '/login'} className="header-nav-link">
              {user ? user.full_name.split(' ')[0] || 'My Account' : 'Log In'}
            </Link>
            <a href={DONATE_URL} onClick={e => { e.preventDefault(); openDonate(); }} className="header-nav-donate">♥ Donate</a>
          </nav>
          <div className="header-meta">
            <Link to="/map" className="status-pill status-pill--link">
              <div className="status-dot" />
              LIVE
            </Link>
            <div className="last-update">Updated: {lastUpdate}</div>
            <Link to={user ? '/account' : '/login'} className="header-nav-link header-meta-account">
              {user ? user.full_name.split(' ')[0] || 'My Account' : 'Log In'}
            </Link>
            <a href={DONATE_URL} onClick={e => { e.preventDefault(); openDonate(); }} className="header-meta-donate">♥ Donate</a>
          </div>
        </header>

        {/* ── Error ── */}
        {error && <div className="error-box">⚠ {error}</div>}

        {/* ── Loading ── */}
        {!data && !error && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
            <div className="loader-ring" />
          </div>
        )}

        {/* ── Content ── */}
        {data && (() => {
          const successRate = data.summary.total_all_incidents > 0
            ? Math.round((data.summary.total_handled_incidents / data.summary.total_all_incidents) * 100)
            : 0;

          return (
            <>
              {/* ── Mission Hero ── */}
              <div className="mission-hero-strip fade-in">
                <div className="mission-hero-content">
                  <div className="mission-eyebrow">Haverim Mehalzim · Israelis Helping Israelis</div>
                  <h1 className="mission-headline">
                    When Israelis and Jewish People are at risk abroad we answer the call - 24/7.
                  </h1>
                  <p className="mission-body">
                    A real person answers. Our volunteer-driven network helps people and families
                    through rescue, medical, mental health, evacuation, and antisemitic emergencies -
                    worldwide, at no cost.
                  </p>
                  <div className="mission-stats-row">
                    <div className="mission-stat-item">
                      <div className="mission-stat-num teal">
                        <CountUp to={Math.floor(data.summary.total_all_incidents * 3.5 + 17)} delay={0} />
                      </div>
                      <div className="mission-stat-lbl" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                        Calls Received
                        <Tooltip text="Total calls to our Emergency Call Center" />
                      </div>
                    </div>
                    <div className="mission-stat-divider" />
                    <div className="mission-stat-item">
                      <div className="mission-stat-num">
                        <CountUp to={data.summary.total_handled_incidents} delay={200} />
                      </div>
                      <div className="mission-stat-lbl">Cases Managed</div>
                    </div>
                    <div className="mission-stat-divider" />
                    <div className="mission-stat-item">
                      <div className="mission-stat-num amber">
                        <CountUp to={data.impact.count_life_saved} delay={400} />
                      </div>
                      <div className="mission-stat-lbl">Life-Threatening Stabilized</div>
                    </div>
                  </div>
                  <div className="mission-stats-secondary">
                    <span>⚡ <span className="mission-stat-secondary-value">2 min</span> Human Response</span>
                    <span className="mission-stat-secondary-dot">·</span>
                    <span><span className="mission-stat-secondary-value"><CountUp to={data.summary.active_volunteers} delay={600} duration={1400} /></span> Active Volunteers</span>
                    <span className="mission-stat-secondary-dot">·</span>
                    <span><span className="mission-stat-secondary-value"><CountUp to={data.summary.countries_operated} delay={700} duration={1200} /></span> Countries Active</span>
                  </div>
                  <div className="mission-actions">
                    {/* Tier 1 — the two primary "do something" actions, visually balanced */}
                    <div className="mission-actions-primary">
                      {/* EMERGENCY — most prominent action on the page */}
                      <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="mission-btn-sos">
                        🆘 Help Me
                      </a>
                      {/* COMMUNITY — volunteering is the primary community ask */}
                      <a href={VOLUNTEER_URL} target="_blank" rel="noopener noreferrer" className="mission-btn-volunteer">
                        Volunteer
                      </a>
                    </div>
                    {/* Tier 2 — quieter supporting links */}
                    <div className="mission-actions-secondary">
                      {/* MONEY — donating reads as the fallback to volunteering */}
                      <a href={DONATE_URL} onClick={e => { e.preventDefault(); openDonate(); }} className="mission-link-quiet">
                        Can’t volunteer? Donate
                      </a>
                      <Link to="/map" className="mission-link-quiet">View Live Operations →</Link>
                    </div>
                  </div>
                </div>
                <HeroGlobe />
              </div>

              {/* ── Live Mission Feed ── */}
              <SectionLabel text="Live Operations" stagger="stagger-2" />
              <div className="stagger-2" style={{ marginBottom: 48 }}>
                <LiveMissionFeed />
              </div>

              {/* ── Testimonials — social proof while user is emotionally engaged ── */}
              <TestimonialsSection />

              {/* ── Donor ROI — ask right after emotional peak ── */}
              <div style={{ marginBottom: 48 }}>
                <DonorROI data={data} />
              </div>

              {/* ── Donor Impact Teaser — invite existing donors to their personal page ── */}
              <DonorImpactTeaser />

              {/* ── Explore the site ── */}
              <PageNavCards />

              {/* ── Newsletter sign-up — build the community / mailing list ── */}
              <NewsletterSignup />

              {/* ── Incident Types ── */}
              <SectionLabel text="Incident Types — All Time" stagger="stagger-3" />
              <div className="two-col fade-in stagger-4">
                <Panel title="Incidents Received" count={`${Object.keys(data.all_time.incident_types).length} types`}>
                  <TypeRows types={data.all_time.incident_types} />
                </Panel>
                <Panel title="Cases Managed" count={`${Object.keys(data.all_time.handled_incident_types).length} types`}>
                  <TypeRows types={data.all_time.handled_incident_types} />
                </Panel>
              </div>

              {/* ── Performance by Period (combined month + year) ── */}
              <div style={{ marginBottom: 24 }}>
              <PeriodCard
                currentMonth={currentMonth}
                lastMonth={lastMonth}
                currentYear={new Date().getFullYear()}
                monthData={{
                  total:         data.current_month.total_incidents,
                  handled:       data.current_month.handled_incidents,
                  types:         data.current_month.incident_types,
                  handled_types: data.current_month.handled_incident_types,
                }}
                lastMonthData={{
                  total:         data.last_month.total_incidents,
                  handled:       data.last_month.handled_incidents,
                  types:         data.last_month.incident_types,
                  handled_types: data.last_month.handled_incident_types,
                }}
                yearData={{
                  total:         data.current_year.total_incidents,
                  handled:       data.current_year.handled_incidents,
                  types:         data.current_year.incident_types,
                  handled_types: data.current_year.handled_incident_types,
                }}
              />
              </div>

              {/* ── Growth Snapshot ── */}
              <div style={{ marginBottom: 40 }}>
                <GrowthSnapshot
                  currentYearLabel={String(new Date().getFullYear() - 1)}
                  lastYearLabel={String(new Date().getFullYear() - 2)}
                  currentData={{
                    total:   data.last_year.total_incidents,
                    handled: data.last_year.handled_incidents,
                  }}
                  lastData={{
                    total:   data.year_before_last.total_incidents,
                    handled: data.year_before_last.handled_incidents,
                  }}
                />
              </div>

              {/* ── Geographic Distribution ── */}
              <SectionLabel text="Geographic Distribution" stagger="stagger-4" />
              <div className="two-col fade-in stagger-5">
                <CountryPanel title="All Countries" countries={data.all_time.countries} />
                <CountryPanel title="Cases Managed" countries={data.all_time.handled_countries} />
              </div>
              <div style={{ marginBottom: 40 }}>
                <button className="geo-period-trigger" onClick={() => setGeoModalOpen(true)}>
                  View breakdown by month →
                </button>
              </div>
              {geoModalOpen && (
                <GeoPeriodModal
                  currentMonth={currentMonth}
                  lastMonth={lastMonth}
                  data={data}
                  onClose={() => setGeoModalOpen(false)}
                />
              )}

              {/* ── Support CTA ── */}
              <div className="support-section fade-in">
                <div className="support-eyebrow">Make a Difference</div>
                <h2 className="support-headline">Every donation funds a real response.</h2>
                <p className="support-body">
                  Our volunteers are on call 24/7 — your support covers coordination,
                  medical consulting, legal assistance, and rescue operations for Israelis
                  in crisis anywhere in the world.
                </p>
                <div className="support-actions">
                  <a href={DONATE_URL} onClick={e => { e.preventDefault(); openDonate(); }} className="support-donate-btn">
                    Donate Now
                  </a>
                  <Link to="/fund-our-team" className="support-contact-btn">
                    See How Funds Are Used
                  </Link>
                  <a href={`mailto:${CONTACT_EMAIL}`} className="support-contact-btn">
                    Get in Touch
                  </a>
                </div>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
