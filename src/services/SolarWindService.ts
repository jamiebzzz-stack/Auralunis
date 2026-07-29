// SolarWindService.ts
// Solar Wind Aura — fetches real-time NOAA space weather data.
// Drives the visual aura deformation on the dashboard.
// Falls back to calm state if network is unavailable.

import { fetchWithTimeout, finiteNumber } from "@/utils/network";

export type AuraIntensity = "calm" | "active" | "storm" | "severe";

export interface SpaceWeatherSnapshot {
  /** Kp index 0-9 (global geomagnetic activity) */
  kpIndex: number;
  /** Solar wind speed in km/s */
  solarWindSpeed: number;
  /** Interplanetary magnetic field Bz component (negative = geoeffective) */
  bzNano: number;
  /** X-ray flux class: A/B/C/M/X */
  xrayClass: string;
  auraIntensity: AuraIntensity;
  /** Human-readable summary */
  summary: string;
  source: "live" | "fallback";
  fetchedAt: string;
}

const FALLBACK: SpaceWeatherSnapshot = {
  kpIndex: 1,
  solarWindSpeed: 380,
  bzNano: -2,
  xrayClass: "A",
  auraIntensity: "calm",
  summary: "Solar activity quiet. Smooth magnetic field lines.",
  source: "fallback",
  fetchedAt: new Date().toISOString(),
};

/** Map Kp index to aura intensity */
function kpToIntensity(kp: number): AuraIntensity {
  if (kp >= 8) return "severe";
  if (kp >= 6) return "storm";
  if (kp >= 4) return "active";
  return "calm";
}

/** NOAA SWPC planetary K-index feed (JSON, public, no key needed) */
const KP_URL = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";
const SOLAR_WIND_URL = "https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json";

let _cache: SpaceWeatherSnapshot | null = null;
let _lastFetch = 0;
const CACHE_MS = 10 * 60 * 1000; // refresh every 10 minutes

export async function fetchSpaceWeather(): Promise<SpaceWeatherSnapshot> {
  const now = Date.now();
  if (_cache && now - _lastFetch < CACHE_MS) return _cache;

  try {
    const [kpResp, windResp] = await Promise.all([
      fetchWithTimeout(KP_URL),
      fetchWithTimeout(SOLAR_WIND_URL),
    ]);

    if (!kpResp.ok || !windResp.ok) throw new Error("NOAA fetch failed");

    const kpData = await kpResp.json() as string[][];
    const windData = await windResp.json() as string[][];

    // NOAA ships these feeds as arrays of string rows, and routinely emits nulls, empty
    // strings and header-only payloads. Guard the row lookups and coerce every reading to a
    // finite number: a bare parseFloat yields NaN, and NaN loses every comparison in
    // kpToIntensity, so a real storm would silently render as "calm".
    if (!Array.isArray(kpData) || !Array.isArray(windData)) throw new Error("NOAA payload malformed");

    // Last row: [time_tag, Kp, Kp_index]
    const kpRow = kpData[kpData.length - 1] ?? [];
    const kp = finiteNumber(kpRow[1], FALLBACK.kpIndex);

    // Last wind row: [time_tag, bx, by, bz, lon, lat, bt]
    const windRow = windData[windData.length - 1] ?? [];
    const bz = finiteNumber(windRow[3], FALLBACK.bzNano);

    // Approximate solar wind speed from bt (rough heuristic)
    const bt = finiteNumber(windRow[6], 5);
    const solarWindSpeed = 350 + bt * 10;

    const intensity = kpToIntensity(kp);

    let xrayClass = "A";
    if (kp >= 7) xrayClass = "X";
    else if (kp >= 5) xrayClass = "M";
    else if (kp >= 3) xrayClass = "C";
    else if (kp >= 2) xrayClass = "B";

    const summaries: Record<AuraIntensity, string> = {
      calm:   "Solar activity quiet. Smooth magnetic field lines.",
      active: "Elevated geomagnetic activity. Minor disturbances possible.",
      storm:  "Geomagnetic storm in progress. Aurora may be visible at high latitudes.",
      severe: "Severe geomagnetic storm. Strong aurora. Possible satellite disruptions.",
    };

    _cache = {
      kpIndex: kp,
      solarWindSpeed,
      bzNano: bz,
      xrayClass,
      auraIntensity: intensity,
      summary: summaries[intensity],
      source: "live",
      fetchedAt: new Date().toISOString(),
    };
    _lastFetch = now;
    return _cache;
  } catch {
    return { ...FALLBACK, fetchedAt: new Date().toISOString() };
  }
}

/** Aura visual parameters for each intensity level */
export interface AuraVisuals {
  primaryColor: string;
  secondaryColor: string;
  animationSpeed: number; // 1 = slow, 5 = frantic
  particleCount: number;
  glowIntensity: number;  // 0..1
}

export const AURA_VISUALS: Record<AuraIntensity, AuraVisuals> = {
  calm:   { primaryColor: "#78C8FF", secondaryColor: "#0B1630", animationSpeed: 1,   particleCount: 20, glowIntensity: 0.3 },
  active: { primaryColor: "#D9A84E", secondaryColor: "#7B5CF6", animationSpeed: 2.5, particleCount: 35, glowIntensity: 0.5 },
  storm:  { primaryColor: "#EF9F27", secondaryColor: "#4ADE80", animationSpeed: 4,   particleCount: 55, glowIntensity: 0.75 },
  severe: { primaryColor: "#F0997B", secondaryColor: "#D9A84E", animationSpeed: 5,   particleCount: 80, glowIntensity: 1.0 },
};
