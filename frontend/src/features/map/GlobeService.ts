import { getCoordinates, toEnglishName } from './utils/coordinateUtils';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Raw shape returned by Flask GET /api/incidents */
interface RawIncident {
  id: string;
  name: string;
  // Monday column IDs
  status_mkmbjwef?: string;   // unified status: Live / Active / Working on it / Done / Completed
  color_mkvvrm1r?: string;    // legacy Hebrew handled status (kept for dashboard compat)
  status_mkmb1zc6?: string;   // incident type
  location_mkmbv7be?: string; // primary coordinate source
  country_mkmb91h3?: string;  // fallback coordinate source
  country_code?: string;      // ISO-2 code from Monday's Country column (final fallback)
  check_mkn3c7v8?: string;    // life-threatening flag
  text_mm42945p?: string;     // incident description (what happened)
  text_mm2rbp1q?: string;     // incident assistance (how we helped)
  [key: string]: unknown;
}

/** Shape consumed by TacticalGlobe */
export interface GlobeIncident {
  id: string;
  label: string;        // display name (e.g. "INC-001")
  locationName: string; // resolved city or country name
  lat: number;
  lng: number;
  type: string;
  country: string;
  isLive: boolean;      // status_mkmbjwef in LIVE_STATUSES
  isResolved: boolean;  // status_mkmbjwef in HANDLED_STATUSES
  description: string;  // what happened (text_mm42945p)
  assistance: string;   // how we helped (text_mm2rbp1q)
}

// ─────────────────────────────────────────────────────────────────────────────
// Incident type translation — must mirror INCIDENT_TYPE_TRANSLATIONS in constants.py
// ─────────────────────────────────────────────────────────────────────────────

const INCIDENT_TYPE_TRANSLATIONS: Record<string, string> = {
  'רפואי':          'Medical',
  'נפשי':           'Mental Health',
  'חילוץ':          'Rescue',
  'איתור':          'Search & Locate',
  'אנטישמיות':      'Antisemitism',
  'חברות מחלצות':   'Sexual Assault',
  'אחר':            'Other',
};

function translateType(raw: string): string {
  return INCIDENT_TYPE_TRANSLATIONS[raw] ?? (raw || 'Unknown');
}

// ─────────────────────────────────────────────────────────────────────────────
// Status constants — must mirror app/features/incidents/constants.py
// ─────────────────────────────────────────────────────────────────────────────

/** "Live" and "Active" are treated as the same category: Live */
const LIVE_STATUSES    = new Set(['Live', 'Active', 'Working on it']);
const HANDLED_STATUSES = new Set(['Done', 'Completed']);

/**
 * Only approved incidents are plotted: Live (an admin approved it) or Handled
 * (closed). "New Request by User", "Rejected" and an empty status are not.
 * /api/incidents already filters the same way (MAP_VISIBLE_STATUSES); this is
 * the second check, so the map stays right even if the API is ever loosened.
 */
const isMapVisible = (status: string) => LIVE_STATUSES.has(status) || HANDLED_STATUSES.has(status);

// ─────────────────────────────────────────────────────────────────────────────
// Processing
// ─────────────────────────────────────────────────────────────────────────────

function buildLabel(index: number): string {
  return `INC-${String(index + 1).padStart(3, '0')}`;
}

function resolveLocationName(location?: string, country?: string): string {
  if (location?.trim()) return toEnglishName(location.trim());
  if (country?.trim())  return toEnglishName(country.trim());
  return 'UNKNOWN';
}

/**
 * Converts raw API incidents into typed GlobeIncident objects.
 * Returns [mapped, countWithCoords] so the caller can log the ratio.
 */
function processIncidents(raw: RawIncident[]): GlobeIncident[] {
  const mapped: GlobeIncident[] = [];
  let coordMisses = 0;

  raw.forEach((inc, i) => {
    const status = inc.status_mkmbjwef?.trim() ?? '';
    if (!isMapVisible(status)) return;

    const coords = getCoordinates(inc.location_mkmbv7be, inc.country_mkmb91h3, inc.country_code);

    if (!coords) {
      coordMisses++;
      return;
    }

    const isLive     = LIVE_STATUSES.has(status);
    const isResolved = HANDLED_STATUSES.has(status);

    mapped.push({
      id:           inc.id,
      label:        buildLabel(i),
      locationName: resolveLocationName(inc.location_mkmbv7be, inc.country_mkmb91h3),
      lat:          coords.lat,
      lng:          coords.lng,
      type:         translateType(inc.status_mkmb1zc6?.trim() ?? ''),
      country:      inc.country_mkmb91h3?.trim() ?? 'Unknown',
      isLive,
      isResolved,
      description:  inc.text_mm42945p?.trim() ?? '',
      assistance:   inc.text_mm2rbp1q?.trim()  ?? '',
    });
  });

  if (coordMisses > 0) {
    console.warn(`[GlobeService] ${coordMisses} incident(s) dropped — no coordinate match for location/country value`);
  }

  // Live incidents first — rendered on top of the ring layer
  return mapped.sort((a, b) => Number(b.isLive) - Number(a.isLive));
}

// ─────────────────────────────────────────────────────────────────────────────
// API fetch
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchGlobeIncidents(): Promise<GlobeIncident[]> {
  const res = await fetch('/api/incidents');
  if (!res.ok) throw new Error(`API error ${res.status}`);

  const json = await res.json();
  const raw   = (json.data ?? []) as RawIncident[];
  const countReceived  = json.count_received  ?? raw.length;
  const countDisplayed = json.count_displayed ?? raw.length;

  const incidents = processIncidents(raw);

  console.log(
    `[GlobeService] received=${countReceived} ` +
    `api_filtered=${countDisplayed} ` +
    `coord_resolved=${incidents.length} ` +
    `(live=${incidents.filter(i => i.isLive).length} ` +
    `resolved=${incidents.filter(i => i.isResolved).length})`
  );

  return incidents;
}
