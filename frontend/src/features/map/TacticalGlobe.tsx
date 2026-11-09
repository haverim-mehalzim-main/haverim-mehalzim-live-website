import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Globe from 'react-globe.gl';
import { fetchGlobeIncidents, type GlobeIncident } from './GlobeService';
import { Tooltip } from '../../components/Tooltip';
import { useDonate } from '../../context/DonateContext';

const DONATE_URL = 'https://www.jgive.com/new/en/usd/donation-targets/110214';
const GOLD = '#D4AF37';
const PENDING = '#4da6ff';

const SUCCESS_METRICS: Record<string, string> = {
  'Medical':          'Medical Care Delivered',
  'Rescue':           'Safe Extraction Completed',
  'Mental Health':    'Crisis Support Delivered',
  'Search & Locate':  'Person Located Successfully',
  'Antisemitism':     'Incident Documented & Reported',
  'Sexual Assault': 'Response Coordinated',
  'Other':            'Mission Completed',
};

const RESPONSE_TIERS_BRIEF = [
  { amount: 150,   label: 'Golden Hour',              desc: '1 hour of emergency case management' },
  { amount: 900,   label: 'Six-Hour Rapid Response', desc: '6 hours of coordinated response work' },
  { amount: 3000,  label: '24-Hour SOS Shift',       desc: 'Full-day emergency coverage' },
  { amount: 14000, label: 'Scoop & Run',             desc: '24h coordination, helicopter, ambulance & hospital' },
];

const GEO_URL =
  'https://raw.githubusercontent.com/vasturiano/react-globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson';

const HEX_TILE_URI = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="25">
    <polygon points="11,1 21,6.5 21,17.5 11,23 1,17.5 1,6.5"
      fill="none" stroke="#00e6a0" stroke-width="0.45"/>
  </svg>`,
)}`;

// ─────────────────────────────────────────────────────────────────────────────
// Cluster type + helpers
// ─────────────────────────────────────────────────────────────────────────────

interface GlobeCluster {
  id: string;
  lat: number;
  lng: number;
  locationName: string;
  incidents: GlobeIncident[];
  count: number;
  liveCount: number;
  resolvedCount: number;
  pendingCount: number;
  hasLive: boolean;
}

// Merge incidents within this many degrees of each other (~90 km)
const PROXIMITY_DEG = 0.8;

function clusterByLocation(incidents: GlobeIncident[]): GlobeCluster[] {
  const result: GlobeCluster[] = [];

  for (const inc of incidents) {
    let nearest: GlobeCluster | null = null;
    let nearestDist = Infinity;

    for (const c of result) {
      const dlat = inc.lat - c.lat;
      const dlng = inc.lng - c.lng;
      const dist = Math.sqrt(dlat * dlat + dlng * dlng);
      if (dist < PROXIMITY_DEG && dist < nearestDist) {
        nearest = c;
        nearestDist = dist;
      }
    }

    if (nearest) {
      nearest.incidents.push(inc);
      nearest.count++;
      if (inc.isLive)    { nearest.liveCount++; nearest.hasLive = true; }
      if (inc.isResolved)  nearest.resolvedCount++;
      if (inc.isPending)   nearest.pendingCount++;
    } else {
      result.push({
        id: `${inc.lat.toFixed(4)},${inc.lng.toFixed(4)}`,
        lat: inc.lat,
        lng: inc.lng,
        locationName: inc.locationName,
        incidents: [inc],
        count: 1,
        liveCount: inc.isLive ? 1 : 0,
        resolvedCount: inc.isResolved ? 1 : 0,
        pendingCount: inc.isPending ? 1 : 0,
        hasLive: inc.isLive,
      });
    }
  }

  // For clusters that absorbed multiple cities, build a readable display name
  for (const c of result) {
    if (c.count > 1) {
      const locCounts = new Map<string, number>();
      for (const inc of c.incidents) {
        locCounts.set(inc.locationName, (locCounts.get(inc.locationName) ?? 0) + 1);
      }
      const sorted = [...locCounts.entries()].sort((a, b) => b[1] - a[1]);
      c.locationName = sorted.length === 1
        ? sorted[0][0]
        : `${sorted[0][0]} +${sorted.length - 1}`;
    }
  }

  return result.sort((a, b) => Number(b.hasLive) - Number(a.hasLive));
}

function clusterColor(c: GlobeCluster): string {
  if (c.hasLive) return '#ff5050';
  return c.pendingCount === c.count ? PENDING : '#ffb930';
}

function incidentAccent(inc: GlobeIncident): string {
  if (inc.isLive) return '#ff5050';
  return inc.isPending ? PENDING : '#ffb930';
}

function clusterRadius(c: GlobeCluster): number {
  if (c.count === 1) return c.hasLive ? 0.45 : 0.42;
  return Math.min(0.55 + (c.count - 1) * 0.12, 1.6);
}

function clusterAltitude(c: GlobeCluster): number {
  if (c.count === 1) return c.hasLive ? 0.025 : 0.015;
  return Math.min(0.03 + c.count * 0.005, 0.08);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StorySection({
  accent,
  label,
  text,
}: {
  accent: string;
  label: string;
  text: string;
}) {
  return (
    <div className="mb-5 pl-4" style={{ borderLeft: `2px solid ${accent}55` }}>
      <div
        className="text-[10px] tracking-[0.25em] uppercase font-bold mb-2"
        style={{ color: `${accent}99` }}
      >
        {label}
      </div>
      <p className="text-[15px] leading-[1.75] text-[#b0c8dc]">
        {text}
      </p>
    </div>
  );
}

function ResponseImpactInfo({ accent, isResolved }: { accent: string; isResolved: boolean }) {
  return (
    <div className="mb-5 rounded overflow-hidden"
      style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
        <span className="text-[9px] tracking-[0.25em] uppercase font-bold" style={{ color: `${accent}99` }}>
          {isResolved ? 'What funded this mission' : 'Every Minute Counts'}
        </span>
      </div>
      <div className="px-4 divide-y divide-white/[0.05]">
        {RESPONSE_TIERS_BRIEF.map(tier => (
          <div key={tier.amount} className="flex items-center justify-between py-2.5">
            <div>
              <div className="text-[11px] font-bold text-white">{tier.label}</div>
              <div className="text-[10px] text-[#5a7a90] mt-0.5">{tier.desc}</div>
            </div>
            <span className="text-[13px] font-bold tabular-nums ml-4 flex-shrink-0"
              style={{ color: accent }}>${tier.amount.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function IncidentDetail({
  incident,
  onClose,
  onBack,
}: {
  incident: GlobeIncident;
  onClose: () => void;
  onBack?: () => void;
}) {
  const { openDonate } = useDonate();
  const isResolved  = incident.isResolved;
  const accentColor = isResolved ? GOLD : '#00e6a0';
  const metric      = SUCCESS_METRICS[incident.type] ?? 'Mission Completed';
  const hasStory    = incident.description || incident.assistance;

  // A request not yet approved: place and type only, no story and no
  // incident-specific donation (it isn't an active mission yet).
  if (incident.isPending) {
    return (
      <div>
        <div className="flex justify-between items-center mb-5">
          <span className="text-[11px] tracking-[0.28em] uppercase font-bold" style={{ color: PENDING }}>
            ◈ Incoming Request
          </span>
          <div className="flex items-center gap-1">
            {onBack && (
              <button
                onClick={onBack}
                className="text-[#3d5a72] hover:text-[#00e6a0] transition-colors text-lg leading-none px-1"
                title="Back to list"
              >‹</button>
            )}
            <button
              onClick={onClose}
              className="text-[#3d5a72] hover:text-white transition-colors text-lg leading-none px-1"
            >✕</button>
          </div>
        </div>
        <div className="mb-5">
          <div className="text-[11px] tracking-[0.2em] text-[#3d5a72] uppercase mb-1">
            {incident.locationName} · {incident.type}
          </div>
          <div className="text-2xl font-bold text-white mb-2">{incident.label}</div>
          <div
            className="inline-flex items-center gap-1.5 text-xs font-bold tracking-[0.2em] uppercase px-2.5 py-1 rounded-sm"
            style={{ color: PENDING, background: `${PENDING}15`, border: `1px solid ${PENDING}33` }}
          >
            Awaiting Review
          </div>
        </div>
        <p className="text-sm text-[#5a7a90] leading-relaxed mb-5">
          A new request has just reached our team and is being reviewed. Details are shared once a mission is opened.
        </p>
        <a
          href={DONATE_URL}
          onClick={e => { e.preventDefault(); openDonate(); }}
          className="flex items-center justify-center gap-2 w-full text-sm tracking-[0.18em] uppercase font-bold px-4 py-3 rounded transition-opacity hover:opacity-90"
          style={{ background: '#00e6a0', color: '#0B0E11' }}
        >
          <span>♥</span>
          <span>Support Our Mission</span>
        </a>
      </div>
    );
  }

  return (
    <div>
      {/* Header row */}
      <div className="flex justify-between items-center mb-5">
        <span
          className="text-[11px] tracking-[0.28em] uppercase font-bold"
          style={{ color: accentColor }}
        >
          {isResolved ? '◈ Impact Report' : '◈ Live Mission'}
        </span>
        <div className="flex items-center gap-1">
          {onBack && (
            <button
              onClick={onBack}
              className="text-[#3d5a72] hover:text-[#00e6a0] transition-colors text-lg leading-none px-1"
              title="Back to list"
            >‹</button>
          )}
          <button
            onClick={onClose}
            className="text-[#3d5a72] hover:text-white transition-colors text-lg leading-none px-1"
          >✕</button>
        </div>
      </div>

      {/* Identity block */}
      <div className="mb-5">
        <div className="text-[11px] tracking-[0.2em] text-[#3d5a72] uppercase mb-1">
          {incident.locationName} · {incident.type}
        </div>
        <div className="text-2xl font-bold text-white mb-2">{incident.label}</div>
        <div
          className="inline-flex items-center gap-1.5 text-xs font-bold tracking-[0.2em] uppercase px-2.5 py-1 rounded-sm"
          style={{
            color: incident.isLive ? '#ff5050' : accentColor,
            background: incident.isLive ? 'rgba(255,80,80,0.1)' : `${accentColor}15`,
            border: `1px solid ${incident.isLive ? 'rgba(255,80,80,0.3)' : accentColor + '33'}`,
          }}
        >
          {incident.isLive && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
          )}
          {incident.isLive ? 'Live — Responding Now' : '✓ Mission Resolved'}
        </div>
      </div>

      <div className="border-t border-[#ffffff08] mb-5" />

      {/* Story */}
      {incident.description && (
        <StorySection
          accent={incident.isLive ? '#ff5050' : '#00e6a0'}
          label="What Happened"
          text={incident.description}
        />
      )}
      {incident.assistance && (
        <StorySection
          accent={GOLD}
          label={isResolved ? 'How We Helped' : 'Steps Taken'}
          text={incident.assistance}
        />
      )}

      {/* Outcome chip — resolved only */}
      {isResolved && (
        <div
          className="flex items-center gap-2 mb-4 px-4 py-3 rounded"
          style={{ background: `${GOLD}12`, border: `1px solid ${GOLD}30` }}
        >
          <span className="text-lg" style={{ color: GOLD }}>✓</span>
          <div>
            <div className="text-[9px] tracking-[0.2em] uppercase mb-0.5" style={{ color: `${GOLD}77` }}>
              Outcome
            </div>
            <div className="text-sm font-bold" style={{ color: GOLD }}>{metric}</div>
          </div>
        </div>
      )}

      {/* Donor badge */}
      {isResolved && (
        <div
          className="flex items-center gap-2 text-sm mb-5 pb-5 border-b"
          style={{ borderColor: `${GOLD}18`, color: `${GOLD}99` }}
        >
          <span>🏅</span>
          <span>This mission was funded by donors like you</span>
        </div>
      )}

      {/* Live support copy */}
      {!isResolved && (
        <p className="text-sm text-[#5a7a90] leading-relaxed mb-5">
          {hasStory
            ? 'Our volunteers are on the ground right now — your donation keeps them there.'
            : 'Your support funds responses like this one — 24/7, at no cost to the people we help.'}
        </p>
      )}

      {/* Response impact info */}
      <ResponseImpactInfo accent={accentColor} isResolved={isResolved} />

      {/* CTA — live incidents route through Tranzila (one-time, incident-specific).
          Resolved/past incidents aren't live, so they fall back to the general
          JGive donation flow rather than an incident-specific Tranzila payment. */}
      <a
        href={DONATE_URL}
        onClick={e => {
          e.preventDefault();
          openDonate(isResolved
            ? undefined
            : {
                incidentId:   incident.id,
                incidentName: `${incident.label} · ${incident.locationName}`,
              });
        }}
        className="flex items-center justify-center gap-2 w-full text-sm tracking-[0.18em] uppercase font-bold px-4 py-3 rounded transition-opacity hover:opacity-90 mb-3"
        style={isResolved
          ? { background: GOLD, color: '#0B0E11' }
          : { background: '#00e6a0', color: '#0B0E11' }}
      >
        <span>♥</span>
        <span>{isResolved ? 'Fund the Next Rescue' : 'Support This Mission'}</span>
      </a>
      <Link
        to="/fund-our-team"
        className="flex items-center justify-center gap-2 w-full text-[10px] tracking-[0.18em] uppercase font-bold px-4 py-3 rounded transition-all"
        style={{
          color: accentColor,
          border: `1px solid ${accentColor}44`,
          background: `${accentColor}08`,
        }}
        onMouseEnter={e => (e.currentTarget.style.background = `${accentColor}18`)}
        onMouseLeave={e => (e.currentTarget.style.background = `${accentColor}08`)}
        onClick={onClose}
      >
        <span style={{ fontSize: 10 }}>◈</span>
        See How Funds Are Used
      </Link>
    </div>
  );
}

function ClusterPanel({
  cluster,
  onSelectIncident,
  onClose,
  compact = false,
}: {
  cluster: GlobeCluster;
  onSelectIncident: (inc: GlobeIncident) => void;
  onClose: () => void;
  compact?: boolean;
}) {
  const headerSize = compact ? 'text-[9px]'  : 'text-[10px]';
  const metaSize   = compact ? 'text-[8px]'  : 'text-[9px]';
  const rowLabel   = compact ? 'text-[8px]'  : 'text-[9px]';
  const rowMeta    = compact ? 'text-[7px]'  : 'text-[8px]';

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-start mb-1.5">
        <div>
          <span className={`${headerSize} tracking-[0.2em] uppercase font-bold text-[#00e6a0]`}>
            ◈ {cluster.locationName}
          </span>
          <div className={`${metaSize} text-[#7a9ab5] mt-0.5 flex gap-2 flex-wrap`}>
            <span>{cluster.count} incidents</span>
            {cluster.liveCount > 0 && (
              <span className="text-red-400">{cluster.liveCount} live</span>
            )}
            {cluster.resolvedCount > 0 && (
              <span className="text-amber-400">{cluster.resolvedCount} resolved</span>
            )}
            {cluster.pendingCount > 0 && (
              <span style={{ color: PENDING }}>{cluster.pendingCount} pending</span>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-[#3d5a72] hover:text-white leading-none px-1 text-sm flex-shrink-0 ml-2"
        >✕</button>
      </div>

      <div className="border-t border-[#00e6a0]/15 mb-2" />

      {/* Incident rows */}
      <div
        className={`flex flex-col gap-1 overflow-y-auto pr-0.5 ${compact ? 'max-h-52' : 'max-h-64'}`}
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#1e3040 transparent' }}
      >
        {cluster.incidents.map((inc) => {
          const accent = incidentAccent(inc);
          return (
            <button
              key={inc.id}
              onClick={() => onSelectIncident(inc)}
              className="flex items-center gap-2 px-2 py-1.5 rounded text-left w-full transition-colors hover:bg-white/5 group"
              style={{
                border: `1px solid ${accent}2e`,
                background: `${accent}08`,
              }}
            >
              {inc.isLive ? (
                <span className="relative flex h-2 w-2 flex-shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                </span>
              ) : (
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: accent }} />
              )}
              <div className="flex-1 min-w-0">
                <div className={`${rowLabel} font-bold text-white truncate`}>{inc.label}</div>
                <div className={`${rowMeta} text-[#7a9ab5] truncate`}>{inc.locationName} · {inc.type}</div>
              </div>
              <span
                className={`${rowMeta} tracking-wider font-bold flex-shrink-0`}
                style={{ color: accent }}
              >
                {inc.isLive ? 'LIVE' : inc.isPending ? 'PENDING' : 'DONE'}
              </span>
              <span className="text-[#3d5a72] text-[10px] group-hover:text-[#00e6a0] transition-colors">›</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StatusRow({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="flex justify-between items-center py-[3px]">
      <span className="text-[9px] tracking-[0.18em] uppercase text-[#7a9ab5]">{label}</span>
      <span className={`text-sm font-bold tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

function Corner({ position }: { position: 'tl' | 'tr' | 'bl' | 'br' }) {
  const base = 'absolute w-8 h-8 border-[#00e6a0] pointer-events-none';
  const map: Record<string, string> = {
    tl: 'top-4 left-4  border-t-2 border-l-2',
    tr: 'top-4 right-4 border-t-2 border-r-2',
    bl: 'bottom-4 left-4  border-b-2 border-l-2',
    br: 'bottom-4 right-4 border-b-2 border-r-2',
  };
  return <div className={`${base} ${map[position]}`} />;
}

function FilterList({
  incidentTypeCounts,
  selectedTypes,
  toggleType,
  resetTypes,
}: {
  incidentTypeCounts: [string, number][];
  selectedTypes: Set<string>;
  toggleType: (t: string) => void;
  resetTypes: () => void;
}) {
  return (
    <>
      <div className="flex justify-between items-center mb-3">
        <span className="text-[9px] text-[#00e6a0] tracking-[0.2em] uppercase flex items-center gap-1">
          Filter by Type
          <Tooltip text="Tap a type to show only those incidents on the globe" />
        </span>
        {selectedTypes.size > 0 && (
          <button onClick={resetTypes}
            className="text-[9px] text-[#3d5a72] hover:text-[#00e6a0] tracking-wider uppercase transition-colors">
            Reset
          </button>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {incidentTypeCounts.map(([type, count]) => {
          const isSelected = selectedTypes.has(type);
          const active     = selectedTypes.size === 0 || isSelected;
          return (
            <button key={type} onClick={() => toggleType(type)}
              className="flex items-center justify-between px-3 py-2 rounded text-left transition-colors"
              style={{
                background: isSelected ? '#00e6a022' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${isSelected ? '#00e6a055' : 'rgba(255,255,255,0.06)'}`,
                opacity: active ? 1 : 0.4,
              }}>
              <span className="text-[11px] text-[#c0d0e0]">{type}</span>
              <span className="text-[11px] font-bold tabular-nums text-[#00e6a0]">{count}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function TacticalGlobe() {
  const { openDonate } = useDonate();
  const globeRef     = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [countries,         setCountries]         = useState<any[]>([]);
  const [incidents,         setIncidents]         = useState<GlobeIncident[]>([]);
  const [dimensions,        setDimensions]        = useState({ width: window.innerWidth, height: window.innerHeight });
  const [error,             setError]             = useState<string | null>(null);
  const [selectedTypes,     setSelectedTypes]     = useState<Set<string>>(new Set());
  const [selectedIncident,  setSelectedIncident]  = useState<GlobeIncident | null>(null);
  const [selectedCluster,   setSelectedCluster]   = useState<GlobeCluster | null>(null);
  const [mobileFilterOpen,  setMobileFilterOpen]  = useState(false);
  const [mobileSearchOpen,  setMobileSearchOpen]  = useState(false);
  const [searchQuery,       setSearchQuery]       = useState('');
  const [filterLive,        setFilterLive]        = useState(false);
  const [filterResolved,    setFilterResolved]    = useState(false);
  const [filterPending,     setFilterPending]     = useState(false);

  const searchInputRef     = useRef<HTMLInputElement>(null);
  const mobileSearchRef    = useRef<HTMLInputElement>(null);

  const selectedClusterRef = useRef<GlobeCluster | null>(null);
  useEffect(() => { selectedClusterRef.current = selectedCluster; }, [selectedCluster]);

  const isMobile = dimensions.width < 768;

  // ── Derived data ─────────────────────────────────────────────────────────────

  const incidentTypeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    incidents.forEach(i => { counts.set(i.type, (counts.get(i.type) ?? 0) + 1); });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [incidents]);

  const displayedIncidents = useMemo(() => {
    let result = selectedTypes.size === 0 ? incidents : incidents.filter(i => selectedTypes.has(i.type));
    if (filterLive || filterResolved || filterPending) {
      result = result.filter(i =>
        (filterLive && i.isLive) || (filterResolved && i.isResolved) || (filterPending && i.isPending));
    }
    return result;
  }, [incidents, selectedTypes, filterLive, filterResolved, filterPending]);

  const clusters    = useMemo(() => clusterByLocation(displayedIncidents), [displayedIncidents]);
  const allClusters = useMemo(() => clusterByLocation(incidents), [incidents]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return allClusters
      .filter(c => c.locationName.toLowerCase().includes(q))
      .slice(0, 6);
  }, [allClusters, searchQuery]);

  const liveIncidents     = useMemo(() => displayedIncidents.filter(i => i.isLive),     [displayedIncidents]);
  const resolvedIncidents = useMemo(() => displayedIncidents.filter(i => i.isResolved), [displayedIncidents]);
  const pendingIncidents  = useMemo(() => displayedIncidents.filter(i => i.isPending),  [displayedIncidents]);
  const filteredTotal     = displayedIncidents.length;
  const ringData          = useMemo(() => clusters.filter(c => c.hasLive), [clusters]);

  // ── Data loading ─────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch(GEO_URL).then(r => r.json()).then(d => setCountries(d.features));
  }, []);

  useEffect(() => {
    fetchGlobeIncidents().then(setIncidents).catch(err => setError(err.message));
  }, []);

  // ── Responsive sizing ─────────────────────────────────────────────────────────

  useEffect(() => {
    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        setDimensions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
      }
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // ── Globe controls ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!countries.length) return;
    const timer = setTimeout(() => {
      const g = globeRef.current;
      if (!g) return;
      g.controls().autoRotate      = true;
      g.controls().autoRotateSpeed = 0.35;
      g.controls().enableZoom      = true;
      g.pointOfView({ lat: 28, lng: 25, altitude: isMobile ? 1.9 : 2.4 }, 1200);
    }, 300);
    return () => clearTimeout(timer);
  }, [countries]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Rotation helpers ──────────────────────────────────────────────────────────

  const pauseRotation  = useCallback(() => { const c = globeRef.current?.controls(); if (c) c.autoRotate = false; }, []);
  const resumeRotation = useCallback(() => { const c = globeRef.current?.controls(); if (c) c.autoRotate = true;  }, []);

  // ── Filter toggle ─────────────────────────────────────────────────────────────

  const toggleType  = useCallback((type: string) => {
    setSelectedTypes(prev => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  }, []);
  const resetTypes  = useCallback(() => setSelectedTypes(new Set()), []);

  const toggleLiveFilter     = useCallback(() => setFilterLive(v => !v),     []);
  const toggleResolvedFilter = useCallback(() => setFilterResolved(v => !v), []);
  const togglePendingFilter  = useCallback(() => setFilterPending(v => !v),  []);
  const resetStatusFilter    = useCallback(() => { setFilterLive(false); setFilterResolved(false); setFilterPending(false); }, []);

  const handleSearchSelect = useCallback((cluster: GlobeCluster) => {
    setSearchQuery('');
    setMobileSearchOpen(false);
    setMobileFilterOpen(false);
    pauseRotation();
    globeRef.current?.pointOfView({ lat: cluster.lat, lng: cluster.lng, altitude: 1.2 }, 1500);
    setTimeout(() => {
      if (cluster.count === 1) {
        setSelectedIncident(cluster.incidents[0]);
        setSelectedCluster(null);
      } else {
        setSelectedCluster(cluster);
        setSelectedIncident(null);
      }
    }, 900);
  }, [pauseRotation]);

  useEffect(() => {
    if (mobileSearchOpen) {
      setTimeout(() => mobileSearchRef.current?.focus(), 120);
    }
  }, [mobileSearchOpen]);

  // ── Cluster / incident selection ──────────────────────────────────────────────

  const handleClusterClick = useCallback((point: any) => {
    const cluster = point as GlobeCluster;
    setMobileFilterOpen(false);
    pauseRotation();
    if (cluster.count === 1) {
      setSelectedIncident(cluster.incidents[0]);
      setSelectedCluster(null);
    } else {
      setSelectedCluster(cluster);
      setSelectedIncident(null);
    }
  }, [pauseRotation]);

  const handleSelectFromCluster = useCallback((inc: GlobeIncident) => {
    setSelectedIncident(inc);
  }, []);

  const handleCloseIncident = useCallback(() => {
    setSelectedIncident(null);
    if (!selectedClusterRef.current) resumeRotation();
  }, [resumeRotation]);

  const handleBackToCluster = useCallback(() => {
    setSelectedIncident(null);
  }, []);

  const handleCloseCluster = useCallback(() => {
    setSelectedCluster(null);
    setSelectedIncident(null);
    resumeRotation();
  }, [resumeRotation]);

  const handleGlobeClick = useCallback(() => {
    setSelectedIncident(null);
    setSelectedCluster(null);
    resumeRotation();
  }, [resumeRotation]);

  // ── Tooltips ──────────────────────────────────────────────────────────────────

  const pointLabel = useCallback((d: any) => {
    const c = d as GlobeCluster;
    const accent = clusterColor(c);

    if (c.count === 1) {
      const inc = c.incidents[0];
      const status = inc.isLive ? '● LIVE' : inc.isPending ? '◌ PENDING' : '✓ RESOLVED';
      return `<div style="background:#0b0e11ee;border:1px solid ${accent};padding:6px 10px;
                  color:${accent};font:11px/1.6 'JetBrains Mono',monospace;border-radius:3px;">
        <strong>${inc.label}</strong> · ${inc.locationName}<br/>
        ${inc.type} · ${status}
      </div>`;
    }

    const liveText     = c.liveCount > 0     ? `<span style="color:#ff5050">${c.liveCount} live</span>`         : '';
    const resolvedText = c.resolvedCount > 0 ? `<span style="color:#ffb930">${c.resolvedCount} resolved</span>` : '';
    const pendingText  = c.pendingCount > 0  ? `<span style="color:${PENDING}">${c.pendingCount} pending</span>`  : '';
    const sep          = c.liveCount > 0 && c.resolvedCount > 0 ? ' · ' : '';
    const sep2         = (c.liveCount > 0 || c.resolvedCount > 0) && c.pendingCount > 0 ? ' · ' : '';

    return `<div style="background:#0b0e11ee;border:1px solid ${accent};padding:6px 10px;
                color:${accent};font:11px/1.6 'JetBrains Mono',monospace;border-radius:3px;">
      <strong>${c.locationName}</strong><br/>
      ${c.count} incidents · ${liveText}${sep}${resolvedText}${sep2}${pendingText}<br/>
      <span style="color:#3d5a72;font-size:9px">click to view all</span>
    </div>`;
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-[#0B0E11] overflow-hidden"
      style={{ minHeight: 600, fontFamily: "'JetBrains Mono', monospace" }}
    >
      {/* ── Globe ────────────────────────────────────────────────────────────── */}
      <Globe
        ref={globeRef}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="#0B0E11"
        atmosphereColor="#00e6a0"
        atmosphereAltitude={0.18}

        polygonsData={countries}
        polygonCapColor={() => '#3C4A3B'}
        polygonSideColor={() => 'rgba(60,74,59,0.45)'}
        polygonStrokeColor={() => '#4e6349'}
        polygonAltitude={0.006}

        ringsData={ringData}
        ringLat={(d: any) => (d as GlobeCluster).lat}
        ringLng={(d: any) => (d as GlobeCluster).lng}
        ringAltitude={0.01}
        ringColor={() => (t: number) => `rgba(255,30,30,${Math.max(0, 1 - t)})`}
        ringMaxRadius={4.5}
        ringPropagationSpeed={3.0}
        ringRepeatPeriod={700}

        pointsData={clusters}
        pointLat={(d: any) => (d as GlobeCluster).lat}
        pointLng={(d: any) => (d as GlobeCluster).lng}
        pointColor={(d: any) => clusterColor(d as GlobeCluster)}
        pointRadius={(d: any) => clusterRadius(d as GlobeCluster)}
        pointAltitude={(d: any) => clusterAltitude(d as GlobeCluster)}
        pointLabel={pointLabel}
        onPointHover={(point) => { if (point) pauseRotation(); }}
        onPointClick={handleClusterClick}

        onGlobeClick={handleGlobeClick}
      />

      {/* ── Hex grid overlay ─────────────────────────────────────────────────── */}
      <div aria-hidden className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: `url("${HEX_TILE_URI}")`, backgroundRepeat: 'repeat', opacity: 0.1, mixBlendMode: 'screen' }}
      />

      {/* ── HUD corners ──────────────────────────────────────────────────────── */}
      <Corner position="tl" /><Corner position="tr" />
      <Corner position="bl" /><Corner position="br" />

      {/* ── Crosshair ────────────────────────────────────────────────────────── */}
      <div aria-hidden className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative w-10 h-10">
          <div className="absolute top-1/2 left-0 right-0 h-px bg-[#00e6a0] opacity-50" />
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[#00e6a0] opacity-50" />
          <div className="absolute top-1/2 left-1/2 w-1.5 h-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#00e6a0] opacity-70" />
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          DESKTOP LAYOUT  (md and above)
          ════════════════════════════════════════════════════════════════════ */}

      {/* ── Desktop: top title ───────────────────────────────────────────────── */}
      <div aria-hidden className="hidden md:block absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none text-center">
        <div className="text-[10px] text-[#00e6a0] tracking-[0.3em] uppercase opacity-60">
          Haverim Mehalzim · Live Operations
        </div>
      </div>

      {/* ── Desktop: status board (top-right) ───────────────────────────────── */}
      <div className="hidden md:block absolute top-10 right-6 pointer-events-none">
        <div className="border border-[#00e6a0]/30 bg-[#0B0E11]/85 px-4 py-3" style={{ minWidth: 180 }}>
          <div className="text-[9px] text-[#00e6a0] tracking-[0.2em] uppercase border-b border-[#00e6a0]/20 pb-1.5 mb-2">
            ◈ Status Board
          </div>
          <StatusRow label="Operations" value={filteredTotal}          color="text-white" />
          <StatusRow label="Live"       value={liveIncidents.length}   color="text-red-400" />
          <StatusRow label="Resolved"   value={resolvedIncidents.length} color="text-amber-400" />
          <StatusRow label="Pending"    value={pendingIncidents.length}  color="text-sky-400" />
          {selectedTypes.size > 0 && (
            <div className="mt-2 pt-2 border-t border-[#00e6a0]/15 text-[8px] text-[#00e6a0] tracking-wider">
              FILTERED · {selectedTypes.size} TYPE{selectedTypes.size > 1 ? 'S' : ''}
            </div>
          )}
        </div>
        {error && (
          <div className="mt-2 border border-red-500/40 bg-[#0B0E11]/90 px-3 py-2 text-[9px] text-red-400 tracking-wider">
            ⚠ {error}
          </div>
        )}
      </div>

      {/* ── Desktop: left sidebar ────────────────────────────────────────────── */}
      <div className="hidden md:flex absolute top-10 bottom-10 left-6 flex-col gap-3 pointer-events-none overflow-y-auto" style={{ width: 190, scrollbarWidth: 'none' }}>

        <div className="pointer-events-auto">
          <Link to="/"
            className="flex items-center gap-1.5 text-[9px] tracking-[0.18em] uppercase
                       text-[#00e6a0] border border-[#00e6a0]/30 bg-[#0B0E11]/85
                       px-3 py-1.5 hover:bg-[#00e6a0]/10 transition-colors">
            ← Dashboard
          </Link>
        </div>

        {/* Cluster panel */}
        {selectedCluster && !selectedIncident && (
          <div className="bg-[#0B0E11]/95 px-4 py-3 pointer-events-auto"
            style={{ border: `1px solid ${clusterColor(selectedCluster)}44` }}>
            <ClusterPanel
              cluster={selectedCluster}
              onSelectIncident={handleSelectFromCluster}
              onClose={handleCloseCluster}
              compact
            />
          </div>
        )}

        {/* Search */}
        <div className="border border-[#00e6a0]/40 bg-[#0B0E11]/90 px-3 py-2.5 pointer-events-auto flex-shrink-0"
          style={{ boxShadow: '0 0 12px rgba(0,230,160,0.06)' }}>
          <div className="text-[9px] text-[#00e6a0] tracking-[0.2em] uppercase mb-2">
            Fly to Location
          </div>
          <div className="flex items-center gap-2 px-2 py-1.5 rounded"
            style={{ background: 'rgba(0,230,160,0.07)', border: '1px solid rgba(0,230,160,0.25)' }}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className="flex-shrink-0"
              style={{ color: searchQuery ? '#00e6a0' : '#7a9ab5' }}>
              <circle cx="4.5" cy="4.5" r="3.2" stroke="currentColor" strokeWidth="1.2"/>
              <line x1="7" y1="7" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') setSearchQuery('');
                if (e.key === 'Enter' && searchResults.length > 0) handleSearchSelect(searchResults[0]);
              }}
              placeholder="Search country…"
              className="flex-1 bg-transparent text-[11px] text-white tracking-wider outline-none min-w-0"
              style={{ caretColor: '#00e6a0' }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')}
                className="text-[#7a9ab5] hover:text-white text-[11px] transition-colors flex-shrink-0">✕</button>
            )}
          </div>
          {searchResults.length > 0 && (
            <div className="mt-2 flex flex-col gap-0.5 max-h-44 overflow-y-auto"
              style={{ scrollbarWidth: 'thin', scrollbarColor: '#1e3040 transparent' }}>
              {searchResults.map(cluster => (
                <button
                  key={cluster.id}
                  onClick={() => handleSearchSelect(cluster)}
                  className="flex items-center justify-between px-2 py-1.5 rounded text-left transition-colors hover:bg-white/5 group"
                  style={{ border: `1px solid ${clusterColor(cluster)}2e` }}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: clusterColor(cluster),
                               boxShadow: cluster.hasLive ? '0 0 4px #ff5050' : 'none' }} />
                    <span className="text-[10px] text-[#c0d0e0] truncate">{cluster.locationName}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-1">
                    {cluster.liveCount > 0 && (
                      <span className="text-[8px] text-red-400 font-bold tabular-nums">{cluster.liveCount} live</span>
                    )}
                    <span className="text-[9px] font-bold tabular-nums" style={{ color: '#00e6a0' }}>{cluster.count}</span>
                    <span className="text-[#3d5a72] text-[10px] group-hover:text-[#00e6a0] transition-colors">›</span>
                  </div>
                </button>
              ))}
            </div>
          )}
          {searchQuery && searchResults.length === 0 && (
            <div className="mt-2 text-[9px] text-[#7a9ab5] tracking-wider">
              No incidents found
            </div>
          )}
        </div>

        {incidentTypeCounts.length > 0 && (
          <div className="border border-[#00e6a0]/20 bg-[#0B0E11]/85 px-3 py-3 pointer-events-auto">
            <FilterList
              incidentTypeCounts={incidentTypeCounts}
              selectedTypes={selectedTypes}
              toggleType={toggleType}
              resetTypes={resetTypes}
            />
          </div>
        )}

        <div className="border border-[#00e6a0]/20 bg-[#0B0E11]/85 px-3 py-2.5 space-y-1.5 pointer-events-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[8px] text-[#00e6a0] tracking-[0.2em] uppercase">Legend</span>
            {(filterLive || filterResolved || filterPending)
              ? <button onClick={resetStatusFilter} className="text-[8px] text-[#3d5a72] hover:text-[#00e6a0] tracking-wider uppercase transition-colors">Reset</button>
              : <span className="text-[8px] text-[#3d5a72] tracking-wider">tap to filter</span>
            }
          </div>
          <button
            onClick={toggleLiveFilter}
            className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded transition-colors"
            style={{
              background: filterLive ? 'rgba(255,80,80,0.12)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${filterLive ? 'rgba(255,80,80,0.35)' : 'rgba(255,255,255,0.08)'}`,
            }}
          >
            <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 border-2 border-red-500" />
            </span>
            <span className="text-[9px] text-red-400 tracking-[0.2em] uppercase flex-1">Live incident</span>
            <Tooltip text="Incident currently open — our volunteers are actively responding" />
          </button>
          <button
            onClick={toggleResolvedFilter}
            className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded transition-colors"
            style={{
              background: filterResolved ? 'rgba(255,185,48,0.10)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${filterResolved ? 'rgba(255,185,48,0.30)' : 'rgba(255,255,255,0.08)'}`,
            }}
          >
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: '#ffb930' }} />
            <span className="text-[9px] text-amber-400 tracking-[0.2em] uppercase flex-1">Resolved incident</span>
            <Tooltip text="Incident successfully handled — outcome confirmed by our team" />
          </button>
          <button
            onClick={togglePendingFilter}
            className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded transition-colors"
            style={{
              background: filterPending ? `${PENDING}1a` : 'rgba(255,255,255,0.03)',
              border: `1px solid ${filterPending ? PENDING + '4d' : 'rgba(255,255,255,0.08)'}`,
            }}
          >
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PENDING }} />
            <span className="text-[9px] tracking-[0.2em] uppercase flex-1" style={{ color: PENDING }}>Pending request</span>
            <Tooltip text="New request awaiting review — only the place and type are shown" />
          </button>
        </div>
      </div>

      {/* ── Desktop: donate CTA (bottom-right) ──────────────────────────────── */}
      <div className="hidden md:flex absolute bottom-10 right-6 flex-col items-end gap-1.5">
        <a href={DONATE_URL} onClick={e => { e.preventDefault(); openDonate(); }}
          className="flex items-center gap-2 px-4 py-2
                     border border-[#00e6a0]/40 bg-[#0B0E11]/90
                     text-[9px] tracking-[0.18em] uppercase text-[#00e6a0]
                     hover:bg-[#00e6a0]/15 transition-colors">
          <span>♥</span>
          <span>Support Our Mission</span>
        </a>
        <Link to="/fund-our-team"
          className="text-[8px] tracking-[0.16em] uppercase text-[#3d5a72]
                     hover:text-[#00e6a0] transition-colors px-1">
          ◈ See How Funds Are Used →
        </Link>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          MOBILE LAYOUT  (below md)
          ════════════════════════════════════════════════════════════════════ */}

      {/* ── Mobile: top HUD bar ──────────────────────────────────────────────── */}
      <div className="md:hidden absolute top-0 left-0 right-0 z-50 flex items-center justify-between
                      px-4 py-3 bg-[#0B0E11]/95 border-b border-[#00e6a0]/25">
        <Link to="/"
          className="flex items-center gap-1.5 text-[11px] tracking-[0.12em] uppercase font-bold
                     text-[#00e6a0] active:opacity-70 transition-opacity">
          ← Back
        </Link>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[9px] text-[#00e6a0] tracking-[0.25em] uppercase opacity-60">Live Ops</span>
          <span className="text-[13px] font-bold text-white tabular-nums">{filteredTotal} ops</span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-[12px] font-bold text-red-400 tabular-nums">{liveIncidents.length} live</span>
          <span className="text-[11px] font-bold text-amber-400 tabular-nums">{resolvedIncidents.length} resolved</span>
          <span className="text-[10px] font-bold text-sky-400 tabular-nums">{pendingIncidents.length} pending</span>
        </div>
      </div>

      {/* ── Mobile: search overlay ───────────────────────────────────────────── */}
      <div
        className="md:hidden absolute left-0 right-0 z-[55] transition-all duration-250 ease-out"
        style={{
          top: 52,
          opacity:       mobileSearchOpen ? 1 : 0,
          transform:     mobileSearchOpen ? 'translateY(0)' : 'translateY(-8px)',
          pointerEvents: mobileSearchOpen ? 'auto' : 'none',
        }}
      >
        <div style={{ background: '#0d1117', borderBottom: '1px solid rgba(0,230,160,0.35)', backdropFilter: 'blur(12px)' }}
          className="px-4 py-3">
          {/* Input row */}
          <div className="flex items-center gap-3 px-3 py-2.5 rounded"
            style={{ background: 'rgba(0,230,160,0.08)', border: '1px solid rgba(0,230,160,0.35)' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: '#00e6a0', flexShrink: 0 }}>
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
              <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <input
              ref={mobileSearchRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') { setSearchQuery(''); setMobileSearchOpen(false); }
                if (e.key === 'Enter' && searchResults.length > 0) handleSearchSelect(searchResults[0]);
              }}
              placeholder="Search country or city…"
              className="flex-1 bg-transparent text-[15px] text-white tracking-wide outline-none"
              style={{ caretColor: '#00e6a0' }}
            />
            <button
              onClick={() => { setSearchQuery(''); setMobileSearchOpen(false); }}
              className="text-[#7a9ab5] hover:text-white text-sm transition-colors flex-shrink-0 px-1"
            >✕</button>
          </div>

          {/* Results */}
          {searchResults.length > 0 && (
            <div className="mt-2 flex flex-col gap-1 max-h-60 overflow-y-auto"
              style={{ scrollbarWidth: 'thin', scrollbarColor: '#1e3040 transparent' }}>
              {searchResults.map(cluster => (
                <button
                  key={cluster.id}
                  onClick={() => handleSearchSelect(cluster)}
                  className="flex items-center justify-between px-3 py-3 rounded text-left active:opacity-60 transition-opacity"
                  style={{
                    background: `${clusterColor(cluster)}0d`,
                    border:     `1px solid ${clusterColor(cluster)}40`,
                  }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: clusterColor(cluster),
                               boxShadow: cluster.hasLive ? '0 0 6px #ff5050' : 'none' }} />
                    <div>
                      <div className="text-[14px] text-white font-semibold truncate leading-tight">{cluster.locationName}</div>
                      {cluster.liveCount > 0 && (
                        <div className="text-[10px] text-red-400 font-bold tracking-wider mt-0.5">{cluster.liveCount} LIVE</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <span className="text-[13px] font-bold tabular-nums" style={{ color: '#00e6a0' }}>{cluster.count}</span>
                    <span className="text-[#3d5a72] text-base">›</span>
                  </div>
                </button>
              ))}
            </div>
          )}
          {searchQuery.trim() && searchResults.length === 0 && (
            <div className="mt-3 py-2 text-[12px] text-[#7a9ab5] tracking-wider text-center">
              No incidents found for "{searchQuery}"
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile: bottom action bar ────────────────────────────────────────── */}
      <div className="md:hidden absolute bottom-0 left-0 right-0 z-50 flex items-center justify-between
                      px-4 bg-[#0B0E11]/95 border-t border-[#00e6a0]/25 pointer-events-auto"
           style={{ paddingTop: 12, paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>
        <button
          onClick={() => { setMobileFilterOpen(o => !o); setSelectedIncident(null); setSelectedCluster(null); }}
          className="flex items-center gap-2 text-[10px] tracking-[0.15em] uppercase transition-colors"
          style={{ color: (mobileFilterOpen || selectedTypes.size > 0 || filterLive || filterResolved || filterPending) ? '#00e6a0' : '#7a9ab5' }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <line x1="2" y1="4" x2="12" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="4" y1="7" x2="10" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="6" y1="10" x2="8"  y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Filter{selectedTypes.size > 0 ? ` (${selectedTypes.size})` : ''}
        </button>

        <button
          onClick={() => { setMobileSearchOpen(o => !o); setMobileFilterOpen(false); setSearchQuery(''); }}
          className="flex items-center gap-2 text-[10px] tracking-[0.15em] uppercase transition-colors"
          style={{ color: mobileSearchOpen ? '#00e6a0' : '#7a9ab5' }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.5"/>
            <line x1="9" y1="9" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Search
        </button>

        <div className="flex items-center gap-1">
          <a href={DONATE_URL} onClick={e => { e.preventDefault(); openDonate(); }}
            className="flex items-center gap-1.5 text-[10px] tracking-[0.15em] uppercase
                       text-[#00e6a0] bg-[#00e6a0]/10 border border-[#00e6a0]/30
                       px-3 py-1.5 active:opacity-70 transition-opacity">
            ♥ Donate
          </a>
          <Link
            to="/fund-our-team"
            className="flex items-center justify-center w-7 h-7 rounded-full transition-colors active:opacity-70"
            style={{ color: '#3d5a72' }}
            title="How we use funds"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2"/>
              <line x1="7" y1="6.5" x2="7" y2="10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              <circle cx="7" cy="4.5" r="0.7" fill="currentColor"/>
            </svg>
          </Link>
        </div>
      </div>

      {/* ── Mobile: filter bottom sheet ──────────────────────────────────────── */}
      {mobileFilterOpen && (
        <div className="md:hidden absolute inset-0 z-30 bg-black/40"
          onClick={() => setMobileFilterOpen(false)} />
      )}
      <div
        className="md:hidden absolute left-0 right-0 bottom-0 z-40 rounded-t-2xl
                   bg-[#0d1117] border-t border-[#00e6a0]/30 overflow-hidden
                   transition-transform duration-300 ease-out"
        style={{
          transform: mobileFilterOpen ? 'translateY(0)' : 'translateY(100%)',
          pointerEvents: mobileFilterOpen ? 'auto' : 'none',
          maxHeight: '70vh',
        }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-[#3d5a72]" />
        </div>
        <div className="overflow-y-auto px-5 pb-20 pt-2" style={{ maxHeight: 'calc(70vh - 32px)' }}>
          <FilterList
            incidentTypeCounts={incidentTypeCounts}
            selectedTypes={selectedTypes}
            toggleType={toggleType}
            resetTypes={resetTypes}
          />
          <div className="border-t border-[#00e6a0]/15 mt-4 pt-4 space-y-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] text-[#00e6a0] tracking-[0.2em] uppercase">Legend</span>
              {(filterLive || filterResolved || filterPending)
                ? <button onClick={resetStatusFilter} className="text-[9px] text-[#3d5a72] hover:text-[#00e6a0] tracking-wider uppercase transition-colors">Reset</button>
                : <span className="text-[9px] text-[#3d5a72] tracking-wider">tap to filter</span>
              }
            </div>
            <button
              onClick={toggleLiveFilter}
              className="flex items-center gap-3 w-full text-left px-3 py-2 rounded"
              style={{
                background: filterLive ? 'rgba(255,80,80,0.12)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${filterLive ? 'rgba(255,80,80,0.35)' : 'rgba(255,255,255,0.08)'}`,
              }}
            >
              <span className="relative flex h-3 w-3 flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 border-2 border-red-500" />
              </span>
              <span className="text-[12px] text-red-400 flex-1">Live incident</span>
              <Tooltip text="Incident currently open — our volunteers are actively responding" />
            </button>
            <button
              onClick={toggleResolvedFilter}
              className="flex items-center gap-3 w-full text-left px-3 py-2 rounded"
              style={{
                background: filterResolved ? 'rgba(255,185,48,0.10)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${filterResolved ? 'rgba(255,185,48,0.30)' : 'rgba(255,255,255,0.08)'}`,
              }}
            >
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: '#ffb930' }} />
              <span className="text-[12px] text-amber-400 flex-1">Resolved incident</span>
              <Tooltip text="Incident successfully handled — outcome confirmed by our team" />
            </button>
            <button
              onClick={togglePendingFilter}
              className="flex items-center gap-3 w-full text-left px-3 py-2 rounded"
              style={{
                background: filterPending ? `${PENDING}1a` : 'rgba(255,255,255,0.03)',
                border: `1px solid ${filterPending ? PENDING + '4d' : 'rgba(255,255,255,0.08)'}`,
              }}
            >
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: PENDING }} />
              <span className="text-[12px] flex-1" style={{ color: PENDING }}>Pending request</span>
              <Tooltip text="New request awaiting review — only the place and type are shown" />
            </button>
          </div>

        </div>
      </div>

      {/* ── Mobile: cluster bottom sheet ─────────────────────────────────────── */}
      {selectedCluster && !selectedIncident && (
        <div className="md:hidden absolute inset-0 z-30 bg-black/40"
          onClick={handleCloseCluster} />
      )}
      <div
        className="md:hidden absolute left-0 right-0 bottom-0 z-40 rounded-t-2xl bg-[#0d1117]
                   transition-transform duration-300 ease-out"
        style={{
          borderTop: selectedCluster && !selectedIncident
            ? `1px solid ${clusterColor(selectedCluster)}44`
            : '1px solid transparent',
          transform: (selectedCluster && !selectedIncident) ? 'translateY(0)' : 'translateY(100%)',
          pointerEvents: (selectedCluster && !selectedIncident) ? 'auto' : 'none',
          maxHeight: '65vh',
        }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-[#3d5a72]" />
        </div>
        {selectedCluster && !selectedIncident && (
          <div className="px-5 pb-20 pt-2 overflow-y-auto" style={{ maxHeight: 'calc(65vh - 32px)' }}>
            <ClusterPanel
              cluster={selectedCluster}
              onSelectIncident={handleSelectFromCluster}
              onClose={handleCloseCluster}
            />
          </div>
        )}
      </div>

      {/* ── Incident detail modal (all screen sizes) ─────────────────────────── */}
      {selectedIncident && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center p-4 md:p-10"
          style={{ background: 'rgba(8,11,14,0.82)', backdropFilter: 'blur(4px)' }}
          onClick={handleCloseIncident}
        >
          <div
            className="relative w-full bg-[#0d1117] overflow-y-auto px-7 py-7 md:px-10 md:py-8"
            style={{
              maxWidth: 520,
              maxHeight: '88vh',
              border: `1px solid ${selectedIncident.isPending ? PENDING + '55' : selectedIncident.isResolved ? GOLD + '55' : '#00e6a04d'}`,
              scrollbarWidth: 'thin',
              scrollbarColor: '#1e3040 transparent',
              boxShadow: `0 0 48px ${selectedIncident.isResolved ? GOLD + '1a' : '#00e6a01a'}`,
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* HUD corners */}
            <div className="absolute top-3 left-3 w-4 h-4 pointer-events-none"
              style={{ borderTop: `1.5px solid ${selectedIncident.isResolved ? GOLD : '#00e6a0'}`, borderLeft: `1.5px solid ${selectedIncident.isResolved ? GOLD : '#00e6a0'}` }} />
            <div className="absolute top-3 right-3 w-4 h-4 pointer-events-none"
              style={{ borderTop: `1.5px solid ${selectedIncident.isResolved ? GOLD : '#00e6a0'}`, borderRight: `1.5px solid ${selectedIncident.isResolved ? GOLD : '#00e6a0'}` }} />
            <div className="absolute bottom-3 left-3 w-4 h-4 pointer-events-none"
              style={{ borderBottom: `1.5px solid ${selectedIncident.isResolved ? GOLD : '#00e6a0'}`, borderLeft: `1.5px solid ${selectedIncident.isResolved ? GOLD : '#00e6a0'}` }} />
            <div className="absolute bottom-3 right-3 w-4 h-4 pointer-events-none"
              style={{ borderBottom: `1.5px solid ${selectedIncident.isResolved ? GOLD : '#00e6a0'}`, borderRight: `1.5px solid ${selectedIncident.isResolved ? GOLD : '#00e6a0'}` }} />
            <IncidentDetail
              incident={selectedIncident}
              onClose={handleCloseIncident}
              onBack={selectedCluster ? handleBackToCluster : undefined}
            />
          </div>
        </div>
      )}

      {/* ── Error (both layouts) ──────────────────────────────────────────────── */}
      {error && (
        <div className="md:hidden absolute top-16 left-4 right-4 z-10
                        border border-red-500/40 bg-[#0B0E11]/90 px-3 py-2 text-[9px] text-red-400 tracking-wider">
          ⚠ {error}
        </div>
      )}
    </div>
  );
}
