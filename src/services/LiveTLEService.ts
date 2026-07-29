// LiveTLEService.ts
// Live Two-Line Element data pipeline.
//
// Sources:
//   Celestrak — public, no auth, CORS-friendly. Used for ISS + Starlink.
//     TLE text endpoint: https://celestrak.org/NORAD/elements/gp.php?GROUP=...&FORMAT=tle
//     JSON endpoint:     https://celestrak.org/NORAD/elements/gp.php?GROUP=...&FORMAT=json
//
//   Space-Track.org — requires free account. Used for debris catalog.
//     Auth:  POST https://www.space-track.org/ajaxauth/login
//     Query: https://www.space-track.org/basicspacesdata/query/...
//     Note:  React Native cannot use Set-Cookie from fetch headers directly.
//            We extract the cookie string manually and pass it on subsequent requests.
//
// satellite.js handles all SGP4 propagation on-device — no position data
// is sent externally. Positions are computed locally from TLE strings.

import { fetchWithTimeout } from "@/utils/network";
import * as Satellite from "satellite.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TLERecord {
  name: string;
  noradId: number;
  line1: string;
  line2: string;
}

export interface PropagatedPosition {
  noradId: number;
  name: string;
  latitudeDegrees: number;
  longitudeDegrees: number;
  altitudeKm: number;
  velocityKms: number;
  timestamp: string;
}

// ─── Celestrak endpoints (confirmed working as of 2025) ───────────────────────

const CELESTRAK = {
  /** Active Starlink constellation — TLE text format (3 lines per satellite) */
  starlink: "https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle",
  /** ISS by NORAD ID — TLE text */
  iss:      "https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=tle",
  /** Active debris (RCS > 1m²) — TLE text */
  debris:   "https://celestrak.org/NORAD/elements/gp.php?GROUP=cosmos-1408-debris&FORMAT=tle",
  /** Iridium-33 debris cloud */
  iridium:  "https://celestrak.org/NORAD/elements/gp.php?GROUP=iridium-33-debris&FORMAT=tle",
  /** Recently launched objects */
  recent:   "https://celestrak.org/NORAD/elements/gp.php?GROUP=last-30-days&FORMAT=tle",
};

// ─── Space-Track endpoints ─────────────────────────────────────────────────────

const SPACE_TRACK = {
  auth:   "https://www.space-track.org/ajaxauth/login",
  /** Latest TLE for DEBRIS class objects, LEO only, limit 30 */
  debris: "https://www.space-track.org/basicspacesdata/query/class/tle_latest/ORDINAL/1/OBJECT_TYPE/DEBRIS/MEAN_MOTION/%3E11/ECCENTRICITY/%3C0.25/EPOCH/%3Enow-30/limit/30/format/json",
};

// ─── Cache ────────────────────────────────────────────────────────────────────

interface CacheEntry { records: TLERecord[]; fetchedAt: number; }
const _cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

let _spaceTrackCookie: string | null = null;

// ─── TLE text parser ──────────────────────────────────────────────────────────

/** Parse standard 3-line TLE text into TLERecord array */
function parseTLEText(text: string): TLERecord[] {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const records: TLERecord[] = [];

  for (let i = 0; i + 2 < lines.length; i += 3) {
    const name = lines[i];
    const line1 = lines[i + 1];
    const line2 = lines[i + 2];

    // Basic sanity: line1 starts with "1 ", line2 starts with "2 "
    if (!line1.startsWith("1 ") || !line2.startsWith("2 ")) continue;

    const noradId = parseInt(line1.substring(2, 7).trim(), 10);
    if (isNaN(noradId)) continue;

    records.push({ name, noradId, line1, line2 });
  }

  return records;
}

// ─── Celestrak fetch ──────────────────────────────────────────────────────────

async function fetchCelestrak(key: string, url: string): Promise<TLERecord[]> {
  const cached = _cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.records;

  try {
    const res = await fetchWithTimeout(url, { headers: { Accept: "text/plain" } });
    if (!res.ok) throw new Error(`Celestrak ${res.status}`);
    const text = await res.text();
    const records = parseTLEText(text);
    _cache.set(key, { records, fetchedAt: Date.now() });
    return records;
  } catch {
    return cached?.records ?? [];
  }
}

// ─── Space-Track fetch ────────────────────────────────────────────────────────

/** Authenticate with Space-Track and cache the session cookie */
async function authenticateSpaceTrack(username: string, password: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(SPACE_TRACK.auth, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `identity=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
    });

    if (!res.ok) return false;

    // Extract session cookie — React Native fetch returns headers as a Headers object
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      // Pull just the session token (chocolatechip= or similar)
      _spaceTrackCookie = setCookie.split(";")[0];
    }

    // Also accept a 200 with empty body as successful auth
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchSpaceTrackDebris(username: string, password: string): Promise<TLERecord[]> {
  const cacheKey = "spacetrack-debris";
  const cached = _cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.records;

  try {
    if (!_spaceTrackCookie) {
      const authed = await authenticateSpaceTrack(username, password);
      if (!authed) return cached?.records ?? [];
    }

    const res = await fetchWithTimeout(SPACE_TRACK.debris, {
      headers: {
        Cookie: _spaceTrackCookie ?? "",
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      // Session may have expired — clear and retry once
      _spaceTrackCookie = null;
      const authed = await authenticateSpaceTrack(username, password);
      if (!authed) return cached?.records ?? [];
      return fetchSpaceTrackDebris(username, password);
    }

    const data = await res.json() as Array<{
      OBJECT_NAME?: string;
      NORAD_CAT_ID?: number | string;
      TLE_LINE1?: string;
      TLE_LINE2?: string;
    }>;

    const records: TLERecord[] = data
      .filter(d => d.TLE_LINE1 && d.TLE_LINE2)
      .map(d => ({
        name:    d.OBJECT_NAME ?? "Unknown Fragment",
        noradId: Number(d.NORAD_CAT_ID ?? 0),
        line1:   d.TLE_LINE1!,
        line2:   d.TLE_LINE2!,
      }));

    _cache.set(cacheKey, { records, fetchedAt: Date.now() });
    return records;
  } catch {
    return cached?.records ?? [];
  }
}

// ─── SGP4 propagator ──────────────────────────────────────────────────────────

/** Propagate a TLE record to real-world position at `date` using satellite.js */
export function propagateRecord(record: TLERecord, date: Date = new Date()): PropagatedPosition | null {
  try {
    const satrec = Satellite.twoline2satrec(record.line1, record.line2);
    const posVel = Satellite.propagate(satrec, date);

    // satellite.js returns null/false on a decayed or unpropagatable orbit.
    if (!posVel) return null;
    if (!posVel.position || typeof posVel.position === "boolean") return null;
    if (!posVel.velocity || typeof posVel.velocity === "boolean") return null;

    const gmst = Satellite.gstime(date);
    const geo  = Satellite.eciToGeodetic(posVel.position, gmst);

    const lat = Satellite.degreesLat(geo.latitude);
    const lon = Satellite.degreesLong(geo.longitude);
    const alt = geo.height;

    const v = posVel.velocity;
    const vel = Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2);

    // Sanity check — reject obviously bad propagations
    if (isNaN(lat) || isNaN(lon) || isNaN(alt) || alt < 0 || alt > 50000) return null;

    return {
      noradId: record.noradId,
      name:    record.name,
      latitudeDegrees:  lat,
      longitudeDegrees: lon,
      altitudeKm: Math.round(alt * 10) / 10,
      velocityKms: Math.round(vel * 100) / 100,
      timestamp: date.toISOString(),
    };
  } catch {
    return null;
  }
}

/** Propagate an array of records, filtering out failed propagations */
export function propagateAll(records: TLERecord[], date: Date = new Date()): PropagatedPosition[] {
  return records
    .map(r => propagateRecord(r, date))
    .filter((p): p is PropagatedPosition => p !== null);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Live ISS position right now */
export async function getLiveISSPosition(): Promise<PropagatedPosition | null> {
  const records = await fetchCelestrak("iss", CELESTRAK.iss);
  return records.length > 0 ? propagateRecord(records[0]) : null;
}

/** Live Starlink positions — returns up to `limit` nodes propagated to now */
export async function getLiveStarlinkPositions(limit = 28): Promise<PropagatedPosition[]> {
  const records = await fetchCelestrak("starlink", CELESTRAK.starlink);
  return propagateAll(records.slice(0, limit));
}

/** Live Cosmos-1408 debris field — the largest active debris cloud */
export async function getLiveCosmos1408Debris(limit = 10): Promise<PropagatedPosition[]> {
  const records = await fetchCelestrak("cosmos-debris", CELESTRAK.debris);
  return propagateAll(records.slice(0, limit));
}

/** Live Iridium-33 debris cloud */
export async function getLiveIridiumDebris(limit = 6): Promise<PropagatedPosition[]> {
  const records = await fetchCelestrak("iridium-debris", CELESTRAK.iridium);
  return propagateAll(records.slice(0, limit));
}

/**
 * Live debris from Space-Track.org (requires free account credentials).
 * Falls back to Celestrak Cosmos-1408 debris if credentials not provided.
 */
export async function getLiveSpaceTrackDebris(
  username?: string,
  password?: string,
  limit = 6
): Promise<PropagatedPosition[]> {
  if (!username || !password) {
    // Fallback: Celestrak public debris data
    const cosmos = await getLiveCosmos1408Debris(limit / 2);
    const iridium = await getLiveIridiumDebris(limit / 2);
    return [...cosmos, ...iridium].slice(0, limit);
  }
  const records = await fetchSpaceTrackDebris(username, password);
  return propagateAll(records.slice(0, limit));
}

/**
 * Re-propagate an already-fetched set of TLE records to the current moment.
 * Call this every second inside a setInterval to keep positions live.
 */
export async function repropagateStarlinkToNow(limit = 28): Promise<PropagatedPosition[]> {
  // Use cached records — no network call
  const cached = _cache.get("starlink");
  if (!cached) return getLiveStarlinkPositions(limit);
  return propagateAll(cached.records.slice(0, limit), new Date());
}

export async function repropagateDebrisToNow(limit = 6): Promise<PropagatedPosition[]> {
  const cosmos = _cache.get("cosmos-debris");
  const iridium = _cache.get("iridium-debris");
  const records = [
    ...(cosmos?.records ?? []),
    ...(iridium?.records ?? []),
  ].slice(0, limit);
  if (records.length === 0) return getLiveCosmos1408Debris(limit);
  return propagateAll(records, new Date());
}

/** Returns the current Space-Track session cookie if authenticated, null otherwise.
 *  ReEntryService uses this to reuse the session without re-authenticating. */
export function getSpaceTrackCookie(): string | null { return _spaceTrackCookie; }

/** Authenticate with Space-Track and cache cookie — callable externally */
export async function ensureSpaceTrackAuth(username: string, password: string): Promise<boolean> {
  if (_spaceTrackCookie) return true;
  return authenticateSpaceTrack(username, password);
}

export function isSatelliteJsAvailable(): boolean {
  try {
    return typeof Satellite.twoline2satrec === "function";
  } catch {
    return false;
  }
}
