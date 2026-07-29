import AsyncStorage from "@react-native-async-storage/async-storage";
import * as satellite from "satellite.js";
import type {
  SatelliteOverlayMode,
  SatelliteOverlayPoint,
  SatelliteOverlaySnapshot
} from "@/features/aura-pro/AuraProUtilityTypes";
import type { ObserverLocation } from "@/features/sky-lens/accuracy/SkyLensAccuracyTypes";
import { DEFAULT_OBSERVER } from "@/features/sky-lens/ephemeris/SkyEphemerisService";
import { fetchWithTimeout } from "@/utils/network";

// Real orbital overlay. We cache the orbital *elements* (TLE sets) per mode and
// propagate them with SGP4 to the current time on every render, then convert the
// ECI position to look-angles (azimuth / elevation / range) for the observer.
// Only objects currently above the horizon are shown. Elements are valid for
// hours/days, so caching them (not positions) respects CelesTrak's refresh limit
// while keeping on-screen positions live.

const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const CACHE_PREFIX = "auralunis.celestrak.elements.v2";
const MAX_POINTS = 48;

interface SatelliteElementSet {
  name: string;
  line1: string;
  line2: string;
  catalogNumber: string;
  objectType: string;
}

interface ElementCache {
  mode: SatelliteOverlayMode;
  fetchedAtISO: string;
  expiresAtISO: string;
  records: SatelliteElementSet[];
}

// Bundled snapshot elements for offline / fixture mode. Propagation is real;
// because these epochs are fixed, positions drift from reality over time. The
// live feed replaces them with current elements from CelesTrak.
const FIXTURE_TLES: Record<SatelliteOverlayMode, SatelliteElementSet[]> = {
  brightest: [
    { name: "ISS (ZARYA)", catalogNumber: "25544", objectType: "PAYLOAD",
      line1: "1 25544U 98067A   24145.50000000  .00016717  00000-0  30000-3 0  9990",
      line2: "2 25544  51.6400 200.0000 0006703  90.0000 270.0000 15.50000000    05" },
    { name: "HST", catalogNumber: "20580", objectType: "PAYLOAD",
      line1: "1 20580U 90037B   24145.50000000  .00001000  00000-0  50000-4 0  9991",
      line2: "2 20580  28.4700 100.0000 0002700 200.0000 160.0000 15.10000000    08" },
    { name: "TIANGONG", catalogNumber: "48274", objectType: "PAYLOAD",
      line1: "1 48274U 21035A   24145.50000000  .00020000  00000-0  20000-3 0  9992",
      line2: "2 48274  41.4700  50.0000 0005000  10.0000 350.0000 15.60000000    03" },
    { name: "NOAA 15", catalogNumber: "25338", objectType: "PAYLOAD",
      line1: "1 25338U 99008A   24145.50000000  .00000100  00000-0  60000-4 0  9993",
      line2: "2 25338  98.7000 150.0000 0010000  40.0000 320.0000 14.26000000    07" },
    { name: "LANDSAT 8", catalogNumber: "39084", objectType: "PAYLOAD",
      line1: "1 39084U 13008A   24145.50000000  .00000050  00000-0  20000-4 0  9994",
      line2: "2 39084  98.2000 220.0000 0001200  90.0000 270.0000 14.57000000    06" }
  ],
  stations: [
    { name: "ISS (ZARYA)", catalogNumber: "25544", objectType: "PAYLOAD",
      line1: "1 25544U 98067A   24145.50000000  .00016717  00000-0  30000-3 0  9990",
      line2: "2 25544  51.6400 200.0000 0006703  90.0000 270.0000 15.50000000    05" },
    { name: "TIANGONG", catalogNumber: "48274", objectType: "PAYLOAD",
      line1: "1 48274U 21035A   24145.50000000  .00020000  00000-0  20000-3 0  9992",
      line2: "2 48274  41.4700  50.0000 0005000  10.0000 350.0000 15.60000000    03" }
  ],
  decaying: [
    { name: "NOAA 15", catalogNumber: "25338", objectType: "PAYLOAD",
      line1: "1 25338U 99008A   24145.50000000  .00000100  00000-0  60000-4 0  9993",
      line2: "2 25338  98.7000 150.0000 0010000  40.0000 320.0000 14.26000000    07" },
    { name: "LANDSAT 8", catalogNumber: "39084", objectType: "PAYLOAD",
      line1: "1 39084U 13008A   24145.50000000  .00000050  00000-0  20000-4 0  9994",
      line2: "2 39084  98.2000 220.0000 0001200  90.0000 270.0000 14.57000000    06" }
  ]
};

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function inferObjectType(name: string): string {
  if (/\bDEB\b|DEBRIS/i.test(name)) return "DEBRIS";
  if (/R\/B|ROCKET/i.test(name)) return "ROCKET BODY";
  return "PAYLOAD";
}

function buildUrl(mode: SatelliteOverlayMode): string {
  const query =
    mode === "brightest"
      ? "GROUP=VISUAL"
      : mode === "stations"
        ? "GROUP=STATIONS"
        : "SPECIAL=DECAYING";
  return `https://celestrak.org/NORAD/elements/gp.php?${query}&FORMAT=TLE`;
}

function cacheKey(mode: SatelliteOverlayMode): string {
  return `${CACHE_PREFIX}.${mode}`;
}

// Parse CelesTrak 3-line element text into element sets, tolerant of stray lines.
function parseTle(text: string): SatelliteElementSet[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+$/, ""))
    .filter((line) => line.length > 0);

  const records: SatelliteElementSet[] = [];
  for (let i = 0; i + 2 < lines.length + 1 && i + 2 <= lines.length - 1; i += 1) {
    if (lines[i + 1].startsWith("1 ") && lines[i + 2].startsWith("2 ")) {
      const name = lines[i].trim();
      const line1 = lines[i + 1];
      const line2 = lines[i + 2];
      records.push({
        name,
        line1,
        line2,
        catalogNumber: line1.substring(2, 7).trim(),
        objectType: inferObjectType(name)
      });
      i += 2;
    }
  }
  return records;
}

// SGP4 propagation -> observer look-angles. Returns null on invalid elements or
// when the object is below the horizon.
function lookAngles(record: SatelliteElementSet, observer: ObserverLocation, when: Date) {
  try {
    const satrec = satellite.twoline2satrec(record.line1, record.line2);
    const pv = satellite.propagate(satrec, when);
    const position = pv ? pv.position : null;
    if (
      !position ||
      typeof position === "boolean" ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y) ||
      !Number.isFinite(position.z)
    ) {
      return null;
    }

    const gmst = satellite.gstime(when);
    const ecf = satellite.eciToEcf(position, gmst);
    const observerGd = {
      longitude: satellite.degreesToRadians(observer.longitudeDegrees),
      latitude: satellite.degreesToRadians(observer.latitudeDegrees),
      height: (observer.altitudeMeters ?? 0) / 1000
    };
    const look = satellite.ecfToLookAngles(observerGd, ecf);
    // satellite.js 5.x has no radiansToDegrees helper; convert inline.
    const toDeg = (rad: number) => (rad * 180) / Math.PI;
    const elevationDegrees = toDeg(look.elevation);
    if (!Number.isFinite(elevationDegrees) || elevationDegrees <= 0) return null;

    return {
      azimuthDegrees: toDeg(look.azimuth),
      elevationDegrees,
      rangeKilometers: look.rangeSat
    };
  } catch {
    return null;
  }
}

// Project azimuth/elevation onto the overlay box (percentages 0-100).
function project(azimuthDegrees: number, elevationDegrees: number) {
  const azimuth = ((azimuthDegrees % 360) + 360) % 360;
  const elevation = Math.max(0, Math.min(90, elevationDegrees));
  return {
    left: Math.max(3, Math.min(97, (azimuth / 360) * 100)),
    top: Math.max(6, Math.min(92, (1 - elevation / 90) * 86 + 6))
  };
}

function buildPoints(
  records: SatelliteElementSet[],
  observer: ObserverLocation,
  when: Date,
  mode: SatelliteOverlayMode
): SatelliteOverlayPoint[] {
  const points: SatelliteOverlayPoint[] = [];

  records.forEach((record, index) => {
    const look = lookAngles(record, observer, when);
    if (!look) return;

    const { left, top } = project(look.azimuthDegrees, look.elevationDegrees);
    points.push({
      id: `${mode}-${record.catalogNumber}-${index}`,
      name: record.name,
      catalogNumber: record.catalogNumber,
      objectType: record.objectType,
      epochISO: when.toISOString(),
      intensity: round(0.45 + (Math.min(90, look.elevationDegrees) / 90) * 0.55, 3),
      left: round(left, 2),
      top: round(top, 2),
      sourceMode: mode,
      azimuthDegrees: round(look.azimuthDegrees, 1),
      elevationDegrees: round(look.elevationDegrees, 1),
      rangeKilometers: round(look.rangeKilometers, 0)
    });
  });

  points.sort((a, b) => (b.elevationDegrees ?? 0) - (a.elevationDegrees ?? 0));
  return points.slice(0, MAX_POINTS);
}

function buildSnapshot(
  records: SatelliteElementSet[],
  observer: ObserverLocation,
  when: Date,
  mode: SatelliteOverlayMode,
  source: SatelliteOverlaySnapshot["source"],
  expiresAtISO: string,
  note: string
): SatelliteOverlaySnapshot {
  const points = buildPoints(records, observer, when, mode);
  return {
    mode,
    source,
    fetchedAtISO: when.toISOString(),
    expiresAtISO,
    points,
    note: `${points.length} object${points.length === 1 ? "" : "s"} above the horizon now. ${note}`
  };
}

function isElementSet(value: unknown): value is SatelliteElementSet {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<SatelliteElementSet>;
  return (
    typeof record.name === "string" &&
    typeof record.line1 === "string" &&
    record.line1.startsWith("1 ") &&
    typeof record.line2 === "string" &&
    record.line2.startsWith("2 ") &&
    typeof record.catalogNumber === "string"
  );
}

function parseCachedElements(value: string | null): ElementCache | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as Partial<ElementCache>;
    if (
      typeof parsed.mode !== "string" ||
      typeof parsed.expiresAtISO !== "string" ||
      !Number.isFinite(Date.parse(parsed.expiresAtISO)) ||
      !Array.isArray(parsed.records)
    ) {
      return undefined;
    }
    const records = parsed.records.filter(isElementSet);
    if (!records.length) return undefined;
    return {
      mode: parsed.mode as SatelliteOverlayMode,
      fetchedAtISO: typeof parsed.fetchedAtISO === "string" ? parsed.fetchedAtISO : new Date().toISOString(),
      expiresAtISO: parsed.expiresAtISO,
      records
    };
  } catch {
    return undefined;
  }
}

async function readCachedElements(mode: SatelliteOverlayMode): Promise<ElementCache | undefined> {
  try {
    return parseCachedElements(await AsyncStorage.getItem(cacheKey(mode)));
  } catch {
    return undefined;
  }
}

async function writeCachedElements(mode: SatelliteOverlayMode, cache: ElementCache): Promise<void> {
  try {
    await AsyncStorage.setItem(cacheKey(mode), JSON.stringify(cache));
  } catch {
    // Live results remain usable even when local cache storage is unavailable.
  }
}

export async function loadSatelliteOverlay(
  mode: SatelliteOverlayMode,
  observer: ObserverLocation = DEFAULT_OBSERVER,
  forceNetwork = false
): Promise<SatelliteOverlaySnapshot> {
  const when = new Date();
  const cached = await readCachedElements(mode);

  if (cached && !forceNetwork && Date.parse(cached.expiresAtISO) > when.getTime()) {
    return buildSnapshot(
      cached.records,
      observer,
      when,
      mode,
      "cache",
      cached.expiresAtISO,
      "Propagated from cached CelesTrak elements (refreshed no more than every two hours)."
    );
  }

  try {
    const response = await fetchWithTimeout(buildUrl(mode), { headers: { Accept: "text/plain" } });
    if (!response.ok) throw new Error(`CelesTrak response ${response.status}`);

    const records = parseTle(await response.text()).slice(0, 80);
    if (!records.length) throw new Error("No elements returned");

    const expiresAtISO = new Date(when.getTime() + CACHE_TTL_MS).toISOString();
    await writeCachedElements(mode, {
      mode,
      fetchedAtISO: when.toISOString(),
      expiresAtISO,
      records
    });

    return buildSnapshot(
      records,
      observer,
      when,
      mode,
      "network",
      expiresAtISO,
      "Live CelesTrak elements, propagated with SGP4 for your location."
    );
  } catch {
    if (cached) {
      return buildSnapshot(
        cached.records,
        observer,
        when,
        mode,
        "cache",
        cached.expiresAtISO,
        "Using last cached elements because the network was unavailable."
      );
    }
    return getSatelliteFixture(mode, observer, when);
  }
}

export function getSatelliteFixture(
  mode: SatelliteOverlayMode,
  observer: ObserverLocation = DEFAULT_OBSERVER,
  when: Date = new Date()
): SatelliteOverlaySnapshot {
  return buildSnapshot(
    FIXTURE_TLES[mode],
    observer,
    when,
    mode,
    "fixture",
    new Date(when.getTime() + CACHE_TTL_MS).toISOString(),
    "Bundled snapshot elements (may be stale). Tap Refresh Live Feed for current elements."
  );
}
