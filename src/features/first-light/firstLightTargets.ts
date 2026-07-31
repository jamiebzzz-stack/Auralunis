// Choosing what First Light points at — PURE. No react-native imports and no astronomy of its
// own: it RANKS a snapshot that the existing ephemeris already produced, so the tutorial can
// never disagree with the sky that is actually rendered, and can never claim something is up
// when it isn't.
//
// Nothing here is hardcoded to an object that might be below the horizon. Every candidate must
// arrive with `aboveHorizon: true` from the live computation, and the caller re-selects as the
// sky turns.

/** Structurally compatible with SkyBody from the Sky Lens ephemeris. */
export type TutorialBodyInput = {
  id: string;
  name: string;
  aboveHorizon: boolean;
  altitudeDegrees: number;
  azimuthDegrees: number;
  magnitude?: number;
};

/** Structurally compatible with HorizontalStar. */
export type TutorialStarInput = {
  id: string;
  name?: string;
  magnitude: number;
  aboveHorizon: boolean;
  altitudeDegrees: number;
  azimuthDegrees: number;
};

/** Structurally compatible with HorizontalConstellation. */
export type TutorialConstellationInput = {
  id: string;
  name: string;
  familiarName?: string;
  anchorStarName?: string;
  centroid: { azimuthDegrees: number; altitudeDegrees: number; aboveHorizon: boolean };
  points: ReadonlyArray<{ aboveHorizon: boolean }>;
};

export type TutorialTargetKind = "moon" | "planet" | "star" | "practice";

export type TutorialTarget = {
  kind: TutorialTargetKind;
  /** Matches the id the Sky Lens hit test puts on SelectedObject, so "the correct card
   *  opened" is an identity check rather than a name comparison. */
  id: string;
  name: string;
  subtitle: string;
  azimuthDegrees: number;
  altitudeDegrees: number;
  /**
   * True only for the tutorial-only practice marker used when nothing suitable is up. It is
   * never mixed into the live sky data and is always labelled as practice in the UI.
   */
  simulated: boolean;
};

/** Comfortably clear of the horizon, buildings, and trees. */
export const PREFERRED_MIN_ALTITUDE_DEGREES = 15;
/** Relaxed pass — still genuinely above the horizon, just lower down. */
export const MINIMUM_ALTITUDE_DEGREES = 3;

/** Naked-eye planets, in the order a beginner is most likely to succeed with. */
export const TUTORIAL_PLANET_IDS: ReadonlyArray<string> = ["venus", "jupiter", "mars", "saturn", "mercury"];

/** A "prominent bright star" for tutorial purposes. */
export const BRIGHT_STAR_MAX_MAGNITUDE = 1.6;

/**
 * Beginner constellations, in teaching order. Mirrors the PRIMARY_CONSTELLATIONS set in
 * ConstellationLayer.tsx — the tutorial must only promise patterns the renderer actually
 * labels at default zoom. scripts/first-light-selftest.js asserts the two stay in sync.
 */
export const PRIMARY_CONSTELLATION_IDS: ReadonlyArray<string> = [
  "ursa-major",
  "ursa-minor",
  "orion",
  "cassiopeia",
  "leo",
  "gemini",
  "taurus",
  "virgo",
  "scorpius",
  "sagittarius",
  "cygnus",
  "lyra",
  "aquila",
  "pegasus",
  "andromeda",
  "bootes",
  "corona-borealis",
  "cancer",
  "libra",
];

/** Preference order for the constellation step, then any other visible primary pattern. */
export const CONSTELLATION_PRIORITY: ReadonlyArray<string> = [
  "ursa-major",
  "ursa-minor",
  "orion",
  "cassiopeia",
];

/** At least this share of a figure's stars must be up, or the pattern reads as a fragment. */
export const MIN_CONSTELLATION_VISIBLE_FRACTION = 0.6;

const usable = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function isUp(candidate: { aboveHorizon: boolean; altitudeDegrees: number }, floor: number): boolean {
  return candidate.aboveHorizon && usable(candidate.altitudeDegrees) && candidate.altitudeDegrees >= floor;
}

function moonTarget(bodies: ReadonlyArray<TutorialBodyInput>, floor: number): TutorialTarget | null {
  const moon = bodies.find((b) => b.id === "moon");
  if (!moon || !isUp(moon, floor)) return null;
  return {
    kind: "moon",
    id: moon.id,
    name: moon.name,
    subtitle: "Earth’s Moon",
    azimuthDegrees: moon.azimuthDegrees,
    altitudeDegrees: moon.altitudeDegrees,
    simulated: false,
  };
}

function planetTarget(bodies: ReadonlyArray<TutorialBodyInput>, floor: number): TutorialTarget | null {
  const visible = bodies.filter((b) => TUTORIAL_PLANET_IDS.includes(b.id) && isUp(b, floor));
  if (visible.length === 0) return null;
  // Brightest first when magnitudes are available (lower magnitude = brighter); otherwise fall
  // back to the documented beginner order so the choice is still deterministic.
  const sorted = [...visible].sort((a, b) => {
    const am = usable(a.magnitude) ? a.magnitude : Number.POSITIVE_INFINITY;
    const bm = usable(b.magnitude) ? b.magnitude : Number.POSITIVE_INFINITY;
    if (am !== bm) return am - bm;
    return TUTORIAL_PLANET_IDS.indexOf(a.id) - TUTORIAL_PLANET_IDS.indexOf(b.id);
  });
  const planet = sorted[0];
  return {
    kind: "planet",
    id: planet.id,
    name: planet.name,
    subtitle: "Planet",
    azimuthDegrees: planet.azimuthDegrees,
    altitudeDegrees: planet.altitudeDegrees,
    simulated: false,
  };
}

function starTarget(
  stars: ReadonlyArray<TutorialStarInput>,
  floor: number,
  onlyId?: string
): TutorialTarget | null {
  const candidates = stars.filter((s) => {
    if (!isUp(s, floor)) return false;
    if (onlyId) return s.id === onlyId;
    return usable(s.magnitude) && s.magnitude <= BRIGHT_STAR_MAX_MAGNITUDE && s.id !== "polaris";
  });
  if (candidates.length === 0) return null;
  const star = [...candidates].sort((a, b) => a.magnitude - b.magnitude)[0];
  return {
    kind: "star",
    id: star.id,
    name: star.name || star.id,
    subtitle: star.id === "polaris" ? "The north star" : "Bright star",
    azimuthDegrees: star.azimuthDegrees,
    altitudeDegrees: star.altitudeDegrees,
    simulated: false,
  };
}

/**
 * The tutorial object for this moment, in the documented order: Moon → visible bright planet →
 * Polaris → prominent bright star. Tries a comfortable altitude first, then a relaxed one, so a
 * low but genuinely visible object still beats giving up.
 *
 * Returns null when nothing real is up. The caller then uses `practiceTarget()`, which is
 * clearly labelled as a practice marker and never presented as live astronomy.
 */
export function selectTutorialObject(
  bodies: ReadonlyArray<TutorialBodyInput>,
  stars: ReadonlyArray<TutorialStarInput>
): TutorialTarget | null {
  for (const floor of [PREFERRED_MIN_ALTITUDE_DEGREES, MINIMUM_ALTITUDE_DEGREES]) {
    const found =
      moonTarget(bodies, floor) ??
      planetTarget(bodies, floor) ??
      starTarget(stars, floor, "polaris") ??
      starTarget(stars, floor);
    if (found) return found;
  }
  return null;
}

/**
 * A tutorial-only practice marker, used when the real sky offers nothing suitable. It is
 * flagged `simulated`, is given an id that cannot collide with a catalog object, and is placed
 * in front of the camera rather than at a fictional sky position — so no one can mistake it
 * for an astronomical claim.
 */
export function practiceTarget(azimuthDegrees: number, altitudeDegrees: number): TutorialTarget {
  return {
    kind: "practice",
    id: "first-light-practice-marker",
    name: "Practice marker",
    subtitle: "Tutorial only — not a real object",
    azimuthDegrees: usable(azimuthDegrees) ? azimuthDegrees : 0,
    altitudeDegrees: usable(altitudeDegrees) ? altitudeDegrees : 30,
    simulated: true,
  };
}

function visibleEnough(constellation: TutorialConstellationInput, floor: number): boolean {
  if (!constellation.centroid?.aboveHorizon) return false;
  if (!usable(constellation.centroid.altitudeDegrees)) return false;
  if (constellation.centroid.altitudeDegrees < floor) return false;
  const points = constellation.points ?? [];
  if (points.length === 0) return false;
  const up = points.filter((p) => p.aboveHorizon).length;
  return up / points.length >= MIN_CONSTELLATION_VISIBLE_FRACTION;
}

/**
 * The constellation for the "Connect the stars" step: Big Dipper → Little Dipper → Orion →
 * Cassiopeia → any other visible primary pattern. Only patterns the renderer already labels at
 * default zoom are eligible, so the step can never highlight something with no visible label.
 */
export function selectTutorialConstellation(
  constellations: ReadonlyArray<TutorialConstellationInput>
): TutorialConstellationInput | null {
  for (const floor of [PREFERRED_MIN_ALTITUDE_DEGREES, MINIMUM_ALTITUDE_DEGREES]) {
    for (const id of CONSTELLATION_PRIORITY) {
      const match = constellations.find((c) => c.id === id && visibleEnough(c, floor));
      if (match) return match;
    }
    const fallback = constellations
      .filter((c) => PRIMARY_CONSTELLATION_IDS.includes(c.id) && visibleEnough(c, floor))
      .sort((a, b) => b.centroid.altitudeDegrees - a.centroid.altitudeDegrees)[0];
    if (fallback) return fallback;
  }
  return null;
}

export type ConstellationCopy = {
  /** The name people use — "Big Dipper" for an asterism, otherwise the constellation. */
  title: string;
  /** Secondary line: the official parent constellation for an asterism. */
  subtitle: string;
  isAsterism: boolean;
};

/**
 * Astronomically correct naming for the tutorial card.
 *
 * The Big Dipper and Little Dipper are ASTERISMS — patterns INSIDE Ursa Major and Ursa Minor,
 * not constellations. The tutorial leads with the familiar name, says plainly that it is an
 * asterism, and carries the official parent constellation as secondary text — matching how
 * ConstellationLayer already labels them. For the Little Dipper the Polaris association from
 * the catalog is preserved rather than dropped.
 */
export function describeConstellation(constellation: TutorialConstellationInput): ConstellationCopy {
  if (!constellation.familiarName) {
    return { title: constellation.name, subtitle: "Constellation", isAsterism: false };
  }
  const anchor = constellation.anchorStarName;
  const parent = `Asterism in ${constellation.name}`;
  return {
    title: constellation.familiarName,
    subtitle: anchor ? `${parent} · ${anchor} marks the end of its handle` : parent,
    isAsterism: true,
  };
}
