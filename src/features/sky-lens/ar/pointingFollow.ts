// pointingFollow.ts — how fast the rendered sky follows the phone.
//
// Pure math, no React and no native sensor imports, so the shipping values can be
// asserted directly by scripts/skylens-selftest.js (same pattern as SkyLensProjection.ts).
//
// Each sensor sample moves the published pointing only a fraction of the way toward the
// measured pointing. That fraction is the follow factor: lower means the scene lags
// further behind the hand and reads as calmer and more deliberate.
//
// These are intentionally slow. The sky should move only when the phone clearly moves,
// trail it in a controlled way, keep labels readable mid-turn, and settle fast enough
// that a user can stop and tap what they are looking at.
//
// This is a plain fraction-of-remaining-distance follow — there is no acceleration term,
// no velocity amplification, no animation chase loop, and no automatic recentering.

export const FOLLOW_FACTOR_SMALL = 0.11;
export const FOLLOW_FACTOR_MEDIUM = 0.17;
export const FOLLOW_FACTOR_LARGE = 0.23;

/** Degrees of largest-axis change separating a small / medium / large movement. */
export const MEDIUM_MOVEMENT_DEGREES = 7;
export const LARGE_MOVEMENT_DEGREES = 18;

/**
 * Roll is the most distracting axis to over-follow — it tips the whole frame and makes
 * labels hard to read — so it never follows faster than this regardless of movement size.
 */
export const ROLL_FOLLOW_CEILING = 0.15;

/**
 * Zoom damping. A narrow field of view magnifies both real motion and hand shake, so the
 * follow factor is scaled down further as zoom climbs. 1x is undamped relative to the base
 * factors above (which are already slow); the multiplier falls linearly and is floored so
 * the sky never becomes unresponsive at maximum zoom.
 */
export const ZOOM_DAMPING_PER_STEP = 0.055;
export const ZOOM_DAMPING_FLOOR = 0.45;

/** Damping multiplier applied to the follow factor at a given zoom level (1 = no zoom). */
export function zoomDampingMultiplier(zoomLevel: number): number {
  const safeZoom = Number.isFinite(zoomLevel) ? Math.max(1, zoomLevel) : 1;
  const damped = 1 - (safeZoom - 1) * ZOOM_DAMPING_PER_STEP;
  return Math.max(ZOOM_DAMPING_FLOOR, Math.min(1, damped));
}

/** Base follow factor for a movement, before zoom damping. */
export function baseFollowFactor(largestDeltaDegrees: number): number {
  if (largestDeltaDegrees > LARGE_MOVEMENT_DEGREES) return FOLLOW_FACTOR_LARGE;
  if (largestDeltaDegrees > MEDIUM_MOVEMENT_DEGREES) return FOLLOW_FACTOR_MEDIUM;
  return FOLLOW_FACTOR_SMALL;
}

/**
 * The follow factors actually applied to one sensor sample: the movement-size factor
 * scaled by zoom damping, with roll additionally held under its own ceiling.
 */
export function resolveFollowFactors(
  largestDeltaDegrees: number,
  zoomLevel: number
): { follow: number; roll: number } {
  const damping = zoomDampingMultiplier(zoomLevel);
  const follow = baseFollowFactor(largestDeltaDegrees) * damping;
  return { follow, roll: Math.min(follow, ROLL_FOLLOW_CEILING * damping) };
}
