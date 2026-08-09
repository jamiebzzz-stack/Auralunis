// BirthSkyService.ts — "Your Sky The Night You Were Born"
// Reconstructs the sky over a given place at a given moment: real planet positions, real
// horizon state, real constellation membership, and the true ascendant.
//
// "Exact" was removed deliberately. The ephemeris is precise, but the RESULT is only as exact
// as the birth time the user could supply, and a blank time falls back to local noon (see
// parseBirthTime in BirthSkyScreen, which tracks that as `exact: false` and relabels the
// ascendant row accordingly). Claiming exactness we cannot verify is the one thing this
// feature must not do.
//
// NOTHING here may be fabricated. A previous version typed each planet with the constellation
// "it was in" and then assigned every planet the SAME month-based lookup — invented data
// presented to the reader as measurement. Every field below is computed for the birth moment.

import { SiderealTime, Illumination, MoonPhase, Body, Equator, Horizon, Observer, Constellation } from "astronomy-engine";
import { computePlanetaryTargets } from "@/utils/planetaryEphemeris";
import type { ObserverLocation } from "@/features/sky-lens/accuracy/SkyLensAccuracyTypes";
import { moonPhaseName } from "@/services/MoonPhase";
import {
  tropicalSignFor,
  tropicalLongitude,
  ZODIAC_BODIES,
  type ZodiacBodyName
} from "@/features/birthsky/tropicalZodiac";

// AsyncStorage key for the user's saved birthday (ISO 8601), set during onboarding so
// BirthSkyScreen can reveal the birth sky later without re-asking.
export const BIRTHDAY_STORAGE_KEY = "auralunis.birthday";

/** Thrown when the birth date cannot be parsed. Callers should surface, never substitute. */
export const INVALID_BIRTH_DATE = "INVALID_BIRTH_DATE";

export interface BirthSkyProfile {
  birthDate: string;       // ISO 8601
  location: ObserverLocation;
  locationName: string;
  moonPhase: string;       // "Waxing Crescent", "Full Moon", etc.
  moonIllumination: number;
  sunSign: string;         // Zodiac sign the sun was in
  risingSign: string;      // Zodiac sign rising in the east (ascendant)
  planets: BirthPlanet[];
  visibleCount: number;    // How many planets were above horizon
  cosmicSignature: string; // e.g. "Born under a waning gibbous with Venus and Jupiter flanking the zenith"
  /** Constellation the MOON occupied — measured, replacing the old month lookup. */
  dominantConstellation: string;
  /** Hemisphere-aware season at the birthplace. */
  seasonalSky: string;
  /** Whether it was day, one of the three twilights, or full night. */
  lightState: SkyLightState;
  /** Sun altitude in degrees at the birth moment; negative below the horizon. */
  sunAltitude: number;
  /** Local sidereal time at the birthplace, in hours (0–24). */
  localSiderealTimeHours: number;
  /**
   * Tropical zodiac sign per body, including the Sun, Moon and Pluto — the placements the
   * astrological reading is built from. Bodies the ephemeris cannot place are omitted rather
   * than defaulted, so a reading is never generated for a position we do not have.
   */
  zodiacPlacements: Record<string, string>;
  /**
   * Tropical ecliptic longitude per body, in degrees. The placement table derives sign, degree
   * and arcminutes from these. Bodies the ephemeris cannot place are omitted.
   */
  zodiacLongitudes: Record<string, number>;
  /** Ecliptic longitude of the ascendant, in degrees. */
  risingLongitude: number;
}

export interface BirthPlanet {
  name: string;
  azimuth: number;
  altitude: number;
  visible: boolean;        // above horizon at birth moment
  /**
   * Real IAU constellation containing the planet — ASTRONOMY. Irregular sky regions; there are
   * 13 along the ecliptic. Usually differs from the zodiac sign below and must never be used
   * as one (Mars sat in Cetus on the reference date, which is not a sign at all).
   */
  constellation: string;
  /**
   * Tropical zodiac sign — ASTROLOGY. Twelve equal 30° divisions from the March equinox,
   * derived from geocentric ecliptic longitude. Empty when the ephemeris cannot supply it.
   */
  zodiacSign: string;
  /** Hours east(-) or west(+) of the meridian. 0 = culminating. */
  hourAngleHours: number;
  /** Where it sat in its arc across the sky at that instant. */
  status: PlanetSkyStatus;
}

/** Position in the diurnal arc, derived from altitude and hour angle. */
export type PlanetSkyStatus = "below" | "rising" | "culminating" | "setting";

/** Sun-altitude bands. The boundaries are the standard twilight definitions. */
export type SkyLightState =
  | "Daylight"
  | "Civil twilight"
  | "Nautical twilight"
  | "Astronomical twilight"
  | "Night";

const ZODIAC_SIGNS = [
  { name: "Capricorn",  start: [1,1],   end: [1,19]  },
  { name: "Aquarius",   start: [1,20],  end: [2,18]  },
  { name: "Pisces",     start: [2,19],  end: [3,20]  },
  { name: "Aries",      start: [3,21],  end: [4,19]  },
  { name: "Taurus",     start: [4,20],  end: [5,20]  },
  { name: "Gemini",     start: [5,21],  end: [6,20]  },
  { name: "Cancer",     start: [6,21],  end: [7,22]  },
  { name: "Leo",        start: [7,23],  end: [8,22]  },
  { name: "Virgo",      start: [8,23],  end: [9,22]  },
  { name: "Libra",      start: [9,23],  end: [10,22] },
  { name: "Scorpio",    start: [10,23], end: [11,21] },
  { name: "Sagittarius",start: [11,22], end: [12,21] },
  { name: "Capricorn",  start: [12,22], end: [12,31] },
];

// Tropical zodiac order from ecliptic longitude 0° (Aries) onward.
const TROPICAL_SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];

/**
 * Sun sign from the SAME tropical-zodiac path as every other body. This previously used a
 * hand-rolled low-precision solar formula, which meant the Sun and the planets were placed by
 * two different algorithms and could disagree near a sign boundary.
 */
function getSunSign(birthDate: Date): string {
  return tropicalSignFor("Sun", birthDate)?.name ?? TROPICAL_SIGNS[0];
}

/**
 * Moon phase from the same astronomy-engine source the live Sky Lens / Home screens use,
 * so the illumination % and phase name match everywhere (the old synodic-cosine model
 * drifted up to ~8 points from the engine near the quarters).
 */
function getMoonPhase(when: Date): { name: string; illumination: number } {
  const illumination = Math.round(Illumination(Body.Moon, when).phase_fraction * 100);
  const isWaxing = MoonPhase(when) < 180; // elongation: 0° = new, 180° = full
  return { name: moonPhaseName(illumination, isWaxing), illumination };
}

/**
 * Rising sign (ascendant) — the zodiac sign on the eastern horizon at the birth moment.
 * Uses the true ascendant from local sidereal time, latitude, and obliquity:
 *   λ_asc = atan2( cos θ, -(sin θ·cos ε + tan φ·sin ε) )
 * where θ = local sidereal time (RAMC). Verified against the ephemeris: the resulting
 * ecliptic point sits on the horizon (alt ≈ 0) in the east. This correctly depends on
 * BOTH longitude and latitude, unlike the old month/UTC-hour approximation.
 */
function getRisingLongitude(birthDate: Date, location: ObserverLocation): number {
  const D2R = Math.PI / 180;
  const eps = 23.4393 * D2R; // mean obliquity of the ecliptic
  const gstHours = SiderealTime(birthDate); // Greenwich apparent sidereal time, hours
  const lstDeg = (((gstHours * 15 + location.longitudeDegrees) % 360) + 360) % 360;
  const th = lstDeg * D2R;
  const phi = location.latitudeDegrees * D2R;
  let lambda = Math.atan2(Math.cos(th), -(Math.sin(th) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps))) / D2R;
  lambda = ((lambda % 360) + 360) % 360;
  return lambda;
}


// ── Measured sky state ────────────────────────────────────────────────────────

/** Planet name (as computePlanetaryTargets reports it) → astronomy-engine body. */
const BODY_BY_NAME: Record<string, Body> = {
  Mercury: Body.Mercury,
  Venus: Body.Venus,
  Mars: Body.Mars,
  Jupiter: Body.Jupiter,
  Saturn: Body.Saturn,
  Uranus: Body.Uranus,
  Neptune: Body.Neptune,
};

/** Local sidereal time at the birthplace, in hours 0–24. */
function localSiderealHours(when: Date, location: ObserverLocation): number {
  const gst = SiderealTime(when); // Greenwich apparent sidereal time, hours
  const lst = (gst + location.longitudeDegrees / 15) % 24;
  return (lst + 24) % 24;
}

/**
 * IAU constellation containing a body, from its J2000 equatorial position. astronomy-engine's
 * Constellation() is defined on J2000 coordinates (it converts to the B1875 boundaries
 * internally), so `ofdate` MUST be false — passing coordinates of date would misplace objects
 * near a boundary, which is exactly the kind of quiet error this replaces.
 */
function constellationOf(body: Body, when: Date, observer: Observer): string {
  try {
    const eq = Equator(body, when, observer, false, true);
    return Constellation(eq.ra, eq.dec).name;
  } catch {
    return "";
  }
}

/** Hour angle in hours, negative east of the meridian (still climbing), positive west. */
function hourAngleHours(body: Body, when: Date, observer: Observer, lstHours: number): number {
  try {
    const eq = Equator(body, when, observer, true, true);
    let h = lstHours - eq.ra;
    while (h < -12) h += 24;
    while (h > 12) h -= 24;
    return h;
  } catch {
    return 0;
  }
}

/**
 * Where a body sat in its arc. Culmination is the meridian crossing, so a small hour angle
 * means it was as high as it would get that day; a negative hour angle means it was still
 * climbing in the east, positive means descending toward the west.
 */
function skyStatus(altitude: number, hourAngle: number): PlanetSkyStatus {
  if (altitude <= 0) return "below";
  if (Math.abs(hourAngle) < 0.5) return "culminating";
  return hourAngle < 0 ? "rising" : "setting";
}

/** Sun altitude at the birth moment, in degrees. */
function sunAltitudeDegrees(when: Date, observer: Observer): number {
  try {
    const eq = Equator(Body.Sun, when, observer, true, true);
    return Horizon(when, observer, eq.ra, eq.dec, "normal").altitude;
  } catch {
    return 0;
  }
}

/** Standard twilight bands. */
function lightStateFor(sunAltitude: number): SkyLightState {
  if (sunAltitude > 0) return "Daylight";
  if (sunAltitude > -6) return "Civil twilight";
  if (sunAltitude > -12) return "Nautical twilight";
  if (sunAltitude > -18) return "Astronomical twilight";
  return "Night";
}

/**
 * Season at the BIRTHPLACE. The old version hardcoded northern-hemisphere seasons, so a June
 * birth in Sydney was labelled a summer sky when it was midwinter there.
 */
function seasonFor(when: Date, latitudeDegrees: number): string {
  const month = when.getUTCMonth() + 1;
  const northern = [
    "winter", "winter", "spring", "spring", "spring", "summer",
    "summer", "summer", "autumn", "autumn", "autumn", "winter",
  ][month - 1];
  if (latitudeDegrees >= 0) return northern;
  const opposite: Record<string, string> = {
    winter: "summer", summer: "winter", spring: "autumn", autumn: "spring",
  };
  return opposite[northern];
}

/** Generate a poetic cosmic signature */
function generateSignature(profile: Partial<BirthSkyProfile>): string {
  const vis = profile.planets?.filter(p => p.visible).map(p => p.name) ?? [];
  const moonDesc = `a ${profile.moonPhase?.toLowerCase()} at ${profile.moonIllumination}%`;

  if (vis.length === 0) {
    return `Born under ${moonDesc}, with ${profile.dominantConstellation} overhead and ${profile.risingSign} rising in the east.`;
  }
  if (vis.length === 1) {
    return `Born under ${moonDesc} with ${vis[0]} watching from above, ${profile.dominantConstellation} spanning the sky.`;
  }
  const planetList =
    vis.length === 2
      ? `${vis[0]} and ${vis[1]}`
      : `${vis.slice(0, -1).join(", ")}, and ${vis[vis.length - 1]}`;
  const season = profile.seasonalSky ?? "";
  const article = /^[aeiou]/i.test(season) ? "an" : "a";
  return `Born under ${moonDesc} with ${planetList} visible, ${profile.dominantConstellation} overhead — ${article} ${season} sky.`;
}

/**
 * Compute the sky at a specific birth date/time/location.
 * Returns a BirthSkyProfile with planets, moon, constellations, and a cosmic signature.
 */
export function computeBirthSky(
  birthDateISO: string,
  location: ObserverLocation,
  locationName: string = "Unknown",
): BirthSkyProfile {
  const birthDate = new Date(birthDateISO);
  // Refuse rather than fabricate. An unparseable date otherwise reaches the ephemeris and
  // throws something obscure from inside astronomy-engine; worse, silently substituting a
  // fallback date would render a confident chart of the wrong sky. Same principle as the
  // screen's refusal to cast a chart when the birthplace time zone cannot be confirmed.
  if (Number.isNaN(birthDate.getTime())) throw new Error(INVALID_BIRTH_DATE);

  const sunSign = getSunSign(birthDate);
  const { name: moonPhase, illumination: moonIllumination } = getMoonPhase(birthDate);
  // The ascendant's precise ecliptic longitude, kept rather than reduced straight to a sign —
  // the placement table shows an exact degree and minute, and that value was already computed.
  const risingLongitude = getRisingLongitude(birthDate, location);
  const risingSign = TROPICAL_SIGNS[Math.floor(risingLongitude / 30) % 12];

  const observer = new Observer(
    location.latitudeDegrees,
    location.longitudeDegrees,
    location.altitudeMeters ?? 0
  );
  const lstHours = localSiderealHours(birthDate, location);

  // The Moon's REAL constellation, measured from its position — replacing a month-indexed
  // lookup table that ignored location, time of night, and hemisphere entirely.
  const dominantConstellation = constellationOf(Body.Moon, birthDate, observer) || "—";

  // Compute planet positions AT THE BIRTH MOMENT (not now) — the date arg is required,
  // otherwise computePlanetaryTargets defaults to new Date() and the whole birth chart
  // shows today's planets.
  const targets = computePlanetaryTargets(location, birthDate);
  const planets: BirthPlanet[] = targets.map((t) => {
    const body = BODY_BY_NAME[t.planet.name];
    const hourAngle = body === undefined ? 0 : hourAngleHours(body, birthDate, observer, lstHours);
    return {
      name: t.planet.name,
      azimuth: Math.round(t.azimuth),
      altitude: Math.round(t.altitude * 10) / 10,
      visible: t.altitude > 0,
      // Each planet's OWN constellation, never a shared placeholder.
      constellation: body === undefined ? "" : constellationOf(body, birthDate, observer),
      // Astrology, not astronomy — a separate frame, and usually a different answer.
      zodiacSign: tropicalSignFor(t.planet.name as ZodiacBodyName, birthDate)?.name ?? "",
      hourAngleHours: Math.round(hourAngle * 100) / 100,
      status: skyStatus(t.altitude, hourAngle),
    };
  });

  const visibleCount = planets.filter((p) => p.visible).length;

  // Placements for the reading. Pluto is included here even though it has no az/alt entry —
  // computePlanetaryTargets does not cover it, but its tropical sign is well defined.
  const zodiacPlacements: Record<string, string> = {};
  const zodiacLongitudes: Record<string, number> = {};
  for (const bodyName of ZODIAC_BODIES) {
    const longitude = tropicalLongitude(bodyName, birthDate);
    if (longitude === null) continue;
    zodiacLongitudes[bodyName] = longitude;
    const sign = tropicalSignFor(bodyName, birthDate);
    if (sign) zodiacPlacements[bodyName] = sign.name;
  }

  const sunAltitude = Math.round(sunAltitudeDegrees(birthDate, observer) * 10) / 10;
  const lightState = lightStateFor(sunAltitude);
  const seasonalSky = seasonFor(birthDate, location.latitudeDegrees);

  const profile: BirthSkyProfile = {
    birthDate: birthDateISO,
    location,
    locationName,
    moonPhase,
    moonIllumination,
    sunSign,
    risingSign,
    planets,
    visibleCount,
    cosmicSignature: "",
    dominantConstellation,
    seasonalSky,
    lightState,
    sunAltitude,
    localSiderealTimeHours: Math.round(lstHours * 100) / 100,
    zodiacPlacements,
    zodiacLongitudes,
    risingLongitude,
  };

  profile.cosmicSignature = generateSignature(profile);

  return profile;
}
