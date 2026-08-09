// tropicalZodiac.ts — Western tropical zodiac placement from real ephemeris.
//
// Pure apart from astronomy-engine, so every value is checkable in plain Node.
//
// ── THE DISTINCTION THIS FILE EXISTS TO PROTECT ──────────────────────────────
//
// A body's IAU CONSTELLATION and its TROPICAL ZODIAC SIGN are different things and usually
// disagree. Constellations are irregular sky regions with ragged official boundaries, and
// there are 13 of them along the ecliptic — the Sun passes through Ophiuchus. Tropical signs
// are twelve exactly-equal 30° divisions measured from the March equinox. Because the equinox
// precesses roughly one degree every 72 years, the two frames have drifted about a full sign
// apart since the scheme was named.
//
// Measured for 1990-06-15, NINE OF NINE planets disagreed. Mars was in the constellation
// CETUS — not a zodiac sign at all — while its tropical sign was Aries. Feeding constellation
// membership into an astrological reading would therefore have produced a "Cetus personality",
// which is why `constellation` and `zodiacSign` are kept as separate fields everywhere.
//
// ── WHY NOT EclipticLongitude() ──────────────────────────────────────────────
//
// astronomy-engine's `EclipticLongitude(body, date)` is HELIOCENTRIC. It throws outright on
// the Sun, which is the tell. Using it here would yield confidently wrong signs for every
// planet. The correct basis is the GEOCENTRIC longitude:
//
//     Ecliptic(GeoVector(body, date, true)).elon
//
// `Ecliptic()` returns coordinates referred to the TRUE EQUINOX OF DATE, which is exactly the
// tropical frame astrology uses — no manual precession needed. Verified: for 1950 this differs
// from the J2000 ecliptic by 0.696°, matching 50 years at 50.29″/yr.

import { Body, Ecliptic, GeoVector } from "astronomy-engine";

export type ZodiacElement = "Fire" | "Earth" | "Air" | "Water";
export type ZodiacModality = "Cardinal" | "Fixed" | "Mutable";

export interface ZodiacSign {
  name: string;
  element: ZodiacElement;
  modality: ZodiacModality;
  /** Traditional ruling planet. */
  ruler: string;
  /** How this sign characteristically expresses whatever planet occupies it. */
  expression: string;
  /** The strength that expression tends to bring. */
  strength: string;
  /** The tension that same expression tends to create. */
  tension: string;
}

/** The twelve signs in order from 0° ecliptic longitude (the March equinox point). */
export const ZODIAC_SIGNS: ReadonlyArray<ZodiacSign> = [
  { name: "Aries", element: "Fire", modality: "Cardinal", ruler: "Mars",
    expression: "directly and without much delay between impulse and action",
    strength: "courage, initiative and a willingness to go first",
    tension: "impatience, and starting more than gets finished" },
  { name: "Taurus", element: "Earth", modality: "Fixed", ruler: "Venus",
    expression: "steadily, through the senses, and at its own unhurried pace",
    strength: "persistence, reliability and real physical comfort",
    tension: "resistance to change long after change has become sensible" },
  { name: "Gemini", element: "Air", modality: "Mutable", ruler: "Mercury",
    expression: "through language, curiosity and rapid switching between interests",
    strength: "quick wit, adaptability and genuine range",
    tension: "scattering attention, and depth lost to breadth" },
  { name: "Cancer", element: "Water", modality: "Cardinal", ruler: "Moon",
    expression: "protectively, through attachment and memory",
    strength: "loyalty, care and a long emotional memory",
    tension: "guardedness, and holding on past the point of usefulness" },
  { name: "Leo", element: "Fire", modality: "Fixed", ruler: "Sun",
    expression: "warmly and visibly, with a wish to be seen doing it",
    strength: "generosity, presence and creative confidence",
    tension: "a need for recognition that can overshadow the work itself" },
  { name: "Virgo", element: "Earth", modality: "Mutable", ruler: "Mercury",
    expression: "precisely, by improving whatever it touches",
    strength: "discernment, craft and genuine usefulness",
    tension: "self-criticism, and perfect becoming the enemy of finished" },
  { name: "Libra", element: "Air", modality: "Cardinal", ruler: "Venus",
    expression: "relationally, weighing one side against the other",
    strength: "fairness, grace and real skill with people",
    tension: "indecision, and peace kept at the cost of honesty" },
  { name: "Scorpio", element: "Water", modality: "Fixed", ruler: "Mars",
    expression: "intensely and privately, all or not at all",
    strength: "depth, resilience and unusual perceptiveness",
    tension: "guardedness that curdles into suspicion" },
  { name: "Sagittarius", element: "Fire", modality: "Mutable", ruler: "Jupiter",
    expression: "expansively, reaching for meaning and the wider view",
    strength: "optimism, honesty and appetite for experience",
    tension: "restlessness, and bluntness mistaken for candour" },
  { name: "Capricorn", element: "Earth", modality: "Cardinal", ruler: "Saturn",
    expression: "deliberately, with an eye on the long structure",
    strength: "discipline, endurance and real competence",
    tension: "severity, and worth measured only in output" },
  { name: "Aquarius", element: "Air", modality: "Fixed", ruler: "Saturn",
    expression: "independently, at a slight analytical distance",
    strength: "originality, principle and a wide social conscience",
    tension: "detachment where warmth was what was needed" },
  { name: "Pisces", element: "Water", modality: "Mutable", ruler: "Jupiter",
    expression: "permeably, blurring the line between self and surroundings",
    strength: "empathy, imagination and unusual sensitivity",
    tension: "boundaries that dissolve, and escapism when it gets heavy" },
];

/** The 30° bucket containing an ecliptic longitude. Input may be any real number of degrees. */
export function signFromLongitude(longitudeDegrees: number): ZodiacSign {
  if (!Number.isFinite(longitudeDegrees)) return ZODIAC_SIGNS[0];
  const normalized = ((longitudeDegrees % 360) + 360) % 360;
  return ZODIAC_SIGNS[Math.floor(normalized / 30) % 12];
}

/** Bodies a tropical placement is computed for. */
export const ZODIAC_BODIES = [
  "Sun", "Moon", "Mercury", "Venus", "Mars",
  "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
] as const;
export type ZodiacBodyName = typeof ZODIAC_BODIES[number];

const BODY_BY_NAME: Record<ZodiacBodyName, Body> = {
  Sun: Body.Sun, Moon: Body.Moon, Mercury: Body.Mercury, Venus: Body.Venus, Mars: Body.Mars,
  Jupiter: Body.Jupiter, Saturn: Body.Saturn, Uranus: Body.Uranus, Neptune: Body.Neptune,
  Pluto: Body.Pluto,
};

/**
 * Geocentric ecliptic longitude in the true-equinox-of-date frame — the tropical basis.
 * Returns null rather than a fallback if the ephemeris cannot supply it (astronomy-engine
 * limits Pluto to roughly 1700–2200), so callers omit the placement instead of inventing one.
 */
export function tropicalLongitude(body: ZodiacBodyName, when: Date): number | null {
  try {
    const vector = GeoVector(BODY_BY_NAME[body], when, true);
    const longitude = Ecliptic(vector).elon;
    return Number.isFinite(longitude) ? longitude : null;
  } catch {
    return null;
  }
}

/** Tropical sign for a body at an instant, or null when the ephemeris cannot supply it. */
export function tropicalSignFor(body: ZodiacBodyName, when: Date): ZodiacSign | null {
  const longitude = tropicalLongitude(body, when);
  return longitude === null ? null : signFromLongitude(longitude);
}

/** A placement broken into the parts a chart table shows. */
export interface SignPosition {
  sign: string;
  /** Whole degrees within the sign, 0–29. */
  degree: number;
  /** Arcminutes within the degree, 0–59. */
  minutes: number;
  /** Preformatted "24°37′" for display. */
  display: string;
}

/**
 * Split an ecliptic longitude into sign, degree and arcminutes.
 *
 * Rounding is done in arcminutes and then carried, so 29°59.6′ becomes the next sign's 0°00′
 * rather than an impossible 29°60′ — a boundary a naive floor/round pair gets wrong.
 */
export function signPositionFromLongitude(longitudeDegrees: number): SignPosition {
  const normalized = Number.isFinite(longitudeDegrees)
    ? ((longitudeDegrees % 360) + 360) % 360
    : 0;
  let totalMinutes = Math.round(normalized * 60);
  totalMinutes = ((totalMinutes % 21600) + 21600) % 21600; // 360° × 60
  const signIndex = Math.floor(totalMinutes / 1800) % 12;   // 30° × 60
  const withinSign = totalMinutes % 1800;
  const degree = Math.floor(withinSign / 60);
  const minutes = withinSign % 60;
  return {
    sign: ZODIAC_SIGNS[signIndex].name,
    degree,
    minutes,
    display: `${degree}°${String(minutes).padStart(2, "0")}′`,
  };
}
