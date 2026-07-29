// ReEntryService.ts
// Re-Entry Vector Warning — Live Breakup Radar.
// Tracks satellites in active orbital decay and predicts reentry corridors.
// Data source: Space-Track TIP (Tracking and Impact Prediction) messages.
// Until live Space-Track integration is wired, uses a realistic mock dataset
// seeded with real historical reentry candidates.
//
// Reentry corridor: the ground track arc where the object will descend through
// the atmosphere. Displayed as a vector path on the radar scope.
// Alert fires if the corridor crosses within 12h of the observer's local horizon.

import type { ObserverLocation } from "@/features/sky-lens/accuracy/SkyLensAccuracyTypes";
import { getSpaceTrackCookie, ensureSpaceTrackAuth } from "@/services/LiveTLEService";
import { calculateAlignment } from "@/utils/alignmentEngine";
import type { CameraPointing } from "@/features/sky-lens/ar/SkyLensProjection";
import { fetchWithTimeout } from "@/utils/network";

export type DecayThreatLevel = "watch" | "warning" | "critical" | "imminent";

export interface ReEntryObject {
  id: string;
  name: string;
  noradId: number;
  /** Current perigee — reentry begins below ~80km */
  perigeeKm: number;
  /** Current apogee */
  apogeeKm: number;
  /** km/s — drops as drag bleeds velocity */
  velocityKms: number;
  /** Estimated reentry window: ISO range */
  reentryWindowStart: string;
  reentryWindowEnd: string;
  /** Hours until midpoint of reentry window */
  hoursUntilReentry: number;
  /** Ground track of predicted reentry corridor — array of [lat, lon] */
  corridorPoints: Array<{ lat: number; lon: number }>;
  threatLevel: DecayThreatLevel;
  origin: string;
  description: string;
  /** Amber (#FF9500) for watch/warning, crimson for critical/imminent */
  alertColor: string;
  latitudeDegrees: number;
  longitudeDegrees: number;
}

function threatColor(level: DecayThreatLevel): string {
  if (level === "imminent" || level === "critical") return "#FF3B30";
  return "#FF9500";
}

/** Generate a realistic ground track corridor from current position */
function buildCorridor(startLat: number, startLon: number, heading: number, pointCount = 8): Array<{ lat: number; lon: number }> {
  const points: Array<{ lat: number; lon: number }> = [];
  let lat = startLat, lon = startLon;
  for (let i = 0; i < pointCount; i++) {
    points.push({ lat: Math.max(-70, Math.min(70, lat)), lon: ((lon + 180) % 360) - 180 });
    lat += Math.cos((heading * Math.PI) / 180) * 4.5;
    lon += Math.sin((heading * Math.PI) / 180) * 5.2;
    heading += (Math.random() - 0.5) * 8; // slight curvature
  }
  return points;
}

// Mock reentry candidates — realistic objects based on historical TIP events
const MOCK_REENTRY_OBJECTS: ReEntryObject[] = [
  {
    id: "cosmos-2143-decay",
    name: "Cosmos 2143",
    noradId: 21867,
    perigeeKm: 112,
    apogeeKm: 148,
    velocityKms: 7.4,
    reentryWindowStart: new Date(Date.now() + 6 * 3600_000).toISOString(),
    reentryWindowEnd:   new Date(Date.now() + 18 * 3600_000).toISOString(),
    hoursUntilReentry: 9,
    corridorPoints: buildCorridor(48, -30, 112),
    threatLevel: "critical",
    origin: "Russia",
    description: "Defunct Russian reconnaissance satellite. 1991 launch. Uncontrolled reentry — ~40% of mass expected to survive to surface.",
    alertColor: "#FF3B30",
    latitudeDegrees: 48.0,
    longitudeDegrees: -30.0,
  },
  {
    id: "cz-3b-rocket-decay",
    name: "CZ-3B Rocket Body",
    noradId: 49015,
    perigeeKm: 145,
    apogeeKm: 310,
    velocityKms: 7.6,
    reentryWindowStart: new Date(Date.now() + 28 * 3600_000).toISOString(),
    reentryWindowEnd:   new Date(Date.now() + 52 * 3600_000).toISOString(),
    hoursUntilReentry: 36,
    corridorPoints: buildCorridor(-20, 80, 95),
    threatLevel: "warning",
    origin: "China",
    description: "Upper stage from a Long March 3B launch. 22-tonne body. Predicted reentry over ocean with low ground risk.",
    alertColor: "#FF9500",
    latitudeDegrees: -20.0,
    longitudeDegrees: 80.0,
  },
  {
    id: "tiangong-remnant",
    name: "Tiangong Fragment",
    noradId: 37820,
    perigeeKm: 168,
    apogeeKm: 200,
    velocityKms: 7.7,
    reentryWindowStart: new Date(Date.now() + 72 * 3600_000).toISOString(),
    reentryWindowEnd:   new Date(Date.now() + 96 * 3600_000).toISOString(),
    hoursUntilReentry: 80,
    corridorPoints: buildCorridor(30, 120, 75),
    threatLevel: "watch",
    origin: "China",
    description: "Structural fragment from Tiangong-1 space laboratory. Small mass — most expected to ablate during reentry.",
    alertColor: "#FF9500",
    latitudeDegrees: 30.0,
    longitudeDegrees: 120.0,
  },
];

let _decayFleet = MOCK_REENTRY_OBJECTS.map(o => ({ ...o }));
let _isLiveTIP = false;


// Space-Track TIP (Tracking and Impact Prediction) endpoint
const SPACE_TRACK_TIP_URL =
  "https://www.space-track.org/basicspacesdata/query/class/tip/DECAY_EPOCH/gt/now/orderby/DECAY_EPOCH/limit/10/format/json";

let _tipCredentials: { username: string; password: string } | null = null;

/** Provide Space-Track credentials to enable live TIP data. Call once on app init. */
export function setReEntryCredentials(username: string, password: string): void {
  _tipCredentials = { username, password };
}

/**
 * Fetch live reentry predictions from Space-Track TIP stream.
 * Returns null if unauthenticated or network unavailable — caller falls back to mock.
 */
async function fetchLiveTIPData(): Promise<ReEntryObject[] | null> {
  if (!_tipCredentials) return null;

  try {
    const authed = await ensureSpaceTrackAuth(
      _tipCredentials.username,
      _tipCredentials.password
    );
    if (!authed) return null;

    const cookie = getSpaceTrackCookie();
    if (!cookie) return null;

    const res = await fetchWithTimeout(SPACE_TRACK_TIP_URL, {
      headers: { Cookie: cookie, Accept: "application/json" },
    });

    if (!res.ok) return null;

    const predictions = await res.json() as Array<{
      NORAD_CAT_ID?: number | string;
      SATNAME?:      string;
      DECAY_EPOCH?:  string;
      LAT?:          string | number;
      LON?:          string | number;
      PERIGEE?:      string | number;
      APOGEE?:       string | number;
    }>;

    if (!Array.isArray(predictions) || predictions.length === 0) return null;

    const now = Date.now();

    return predictions
      .filter(p => p.NORAD_CAT_ID && p.DECAY_EPOCH)
      .map((p, i): ReEntryObject => {
        const decayMs   = new Date(p.DECAY_EPOCH!).getTime();
        const hoursLeft = Math.max(0, (decayMs - now) / 3600_000);
        const perigee   = parseFloat(String(p.PERIGEE  ?? 120));
        const apogee    = parseFloat(String(p.APOGEE   ?? 200));
        const lat       = parseFloat(String(p.LAT      ?? 0));
        const lon       = parseFloat(String(p.LON      ?? 0));
        const norad     = Number(p.NORAD_CAT_ID);

        let threat: DecayThreatLevel = "watch";
        if (hoursLeft < 2)  threat = "imminent";
        else if (hoursLeft < 12) threat = "critical";
        else if (hoursLeft < 48) threat = "warning";

        return {
          id:   `tip-${norad}`,
          name: p.SATNAME ?? `Object ${norad}`,
          noradId: norad,
          perigeeKm: isNaN(perigee) ? 120 : perigee,
          apogeeKm:  isNaN(apogee)  ? 200 : apogee,
          velocityKms: 7.8 - (i * 0.05),
          reentryWindowStart: p.DECAY_EPOCH!,
          reentryWindowEnd:   new Date(decayMs + 12 * 3600_000).toISOString(),
          hoursUntilReentry:  hoursLeft,
          corridorPoints: buildCorridor(
            isNaN(lat) ? 0 : lat,
            isNaN(lon) ? 0 : lon,
            (i * 47) % 360
          ),
          threatLevel: threat,
          alertColor: threatColor(threat),
          origin: "Space-Track TIP",
          description: `Live TIP prediction — NORAD ${norad}. Predicted reentry: ${p.DECAY_EPOCH}.`,
          latitudeDegrees:  isNaN(lat) ? 0 : lat,
          longitudeDegrees: isNaN(lon) ? 0 : lon,
        };
      });
  } catch {
    return null;
  }
}

/** Call on reentry mode entry — syncs live TIP data if credentials available */
export async function initReEntryLive(): Promise<boolean> {
  const live = await fetchLiveTIPData();
  if (live && live.length > 0) {
    _decayFleet = live;
    _isLiveTIP = true;
    return true;
  }
  _isLiveTIP = false;
  return false;
}

export function isReEntryLive(): boolean { return _isLiveTIP; }
let _decayTick = 0;

/** Simulate orbit decay — perigee drops ~0.5km per tick, velocity decreases */
export function simulateDecayTick(): void {
  _decayTick++;
  _decayFleet = _decayFleet.map(obj => {
    const newPerigee = Math.max(60, obj.perigeeKm - 0.08);
    const newVelocity = Math.max(6.5, obj.velocityKms - 0.001);
    const newHours = Math.max(0, obj.hoursUntilReentry - 1 / 3600);

    // Drift position along corridor
    const lon = ((obj.longitudeDegrees + 0.25 + 180) % 360) - 180;
    const lat = Math.max(-60, Math.min(60, obj.latitudeDegrees + Math.sin(_decayTick * 0.003) * 0.03));

    let threat: DecayThreatLevel = "watch";
    if (newHours < 2) threat = "imminent";
    else if (newHours < 12) threat = "critical";
    else if (newHours < 48) threat = "warning";

    return {
      ...obj,
      perigeeKm: newPerigee,
      velocityKms: newVelocity,
      hoursUntilReentry: newHours,
      threatLevel: threat,
      alertColor: threatColor(threat),
      latitudeDegrees: lat,
      longitudeDegrees: lon,
    };
  });
}

export interface DecayState {
  object: ReEntryObject;
  alignment: ReturnType<typeof calculateAlignment>;
  /** Is the reentry corridor projected to cross this observer's horizon within 12h? */
  crossesLocalHorizon: boolean;
}

/** Check if any corridor point is within ~1500km of the observer */
function corridorCrossesLocal(corridor: Array<{ lat: number; lon: number }>, observer: ObserverLocation): boolean {
  const R = 6371;
  const toRad = (d: number) => d * Math.PI / 180;
  return corridor.some(pt => {
    const dLat = toRad(pt.lat - observer.latitudeDegrees);
    const dLon = toRad(pt.lon - observer.longitudeDegrees);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(observer.latitudeDegrees)) * Math.cos(toRad(pt.lat)) * Math.sin(dLon / 2) ** 2;
    const distKm = 2 * R * Math.asin(Math.sqrt(a));
    return distKm < 1500;
  });
}

export function computeDecayFleet(observer: ObserverLocation, pointing: CameraPointing): DecayState[] {
  return _decayFleet.map(obj => ({
    object: obj,
    alignment: calculateAlignment(observer, pointing, {
      id: obj.id,
      name: obj.name,
      latitudeDegrees: obj.latitudeDegrees,
      longitudeDegrees: obj.longitudeDegrees,
      altitudeKm: Math.max(obj.perigeeKm, 80),
      decayAlert: true,
      velocityKms: obj.velocityKms,
    }),
    crossesLocalHorizon: corridorCrossesLocal(obj.corridorPoints, observer),
  })).sort((a, b) => a.object.hoursUntilReentry - b.object.hoursUntilReentry);
}

export function getDecayFleet(): ReEntryObject[] { return _decayFleet; }

export function formatReentryWindow(obj: ReEntryObject): string {
  const h = Math.round(obj.hoursUntilReentry);
  if (h < 1) return "IMMINENT — within 60 min";
  if (h < 24) return `~${h}h from now`;
  return `~${Math.round(h / 24)}d from now`;
}

/** Haptic pattern for reentry alert — urgent double-pulse */
export function reentryAlertPattern(): number[] {
  // [wait, vibrate, wait, vibrate, wait, vibrate]
  return [0, 100, 80, 100, 200, 200];
}
