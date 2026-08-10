// magneticDeclination.ts — local magnetic declination for the Sky Lens true-north correction.
//
// WHY THIS EXISTS
// ---------------
// The quaternion pipeline consumes Core Motion attitude referenced to MAGNETIC north
// (.xMagneticNorthZVertical — see deviceMotionOrientation.ts), but every celestial target is
// an astronomy-engine TRUE-north azimuth. With no correction the whole rendered sky is
// rotated in azimuth by the local declination — roughly 7-8° W in Florida, +11..16° E across
// the western US, and ±20°+ at high latitudes. That directly undercuts the "sensor-aligned
// planetarium" premise, and at high zoom it pushes the intended target off screen.
//
// SOURCE OF TRUTH
// ---------------
// iOS already runs the World Magnetic Model: Location.getHeadingAsync() reports BOTH
// trueHeading and magHeading for the current position, and their difference IS the local
// declination (east-positive). Reading it from the OS means no bundled WMM tables, no extra
// dependency, and no drift from what the system itself believes.
//
// SAFETY RULES
// ------------
//  - NEVER prompts. Declination is read only when foreground location permission has ALREADY
//    been granted; otherwise this resolves 0.
//  - trueHeading is -1 when unavailable (no fix, or no heading support) -> 0.
//  - Any throw, non-finite value, or implausible magnitude (> 60°, beyond real-world
//    declination away from the immediate magnetic poles) -> 0.
//  - 0 reproduces the previous, uncorrected behaviour exactly, so no failure path here can
//    make the sky worse than it was before this file existed.

import * as Location from "expo-location";

/** Largest declination we will trust. Real values stay well inside this away from the poles. */
const MAX_PLAUSIBLE_DECLINATION_DEGREES = 60;

let cachedDeclination: number | null = null;

/** Wrap a degree value to [-180, 180]. */
function normalizeSigned(degrees: number): number {
  return (((degrees + 180) % 360) + 360) % 360 - 180;
}

/**
 * Local magnetic declination in degrees, east-positive. Resolves 0 whenever a trustworthy
 * value cannot be obtained.
 *
 * Cached for the session: declination changes by ~0.1°/decade and only meaningfully with
 * large position changes, so one successful read per launch is ample.
 */
export async function resolveMagneticDeclination(): Promise<number> {
  if (cachedDeclination !== null) return cachedDeclination;

  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted) return 0; // never prompt from a render path

    const heading = await Location.getHeadingAsync();
    const trueHeading = heading?.trueHeading;
    const magHeading = heading?.magHeading;

    if (
      typeof trueHeading !== "number" ||
      typeof magHeading !== "number" ||
      !Number.isFinite(trueHeading) ||
      !Number.isFinite(magHeading) ||
      trueHeading < 0 || // -1 = true heading unavailable
      magHeading < 0
    ) {
      return 0;
    }

    const declination = normalizeSigned(trueHeading - magHeading);
    if (!Number.isFinite(declination)) return 0;
    if (Math.abs(declination) > MAX_PLAUSIBLE_DECLINATION_DEGREES) return 0;

    cachedDeclination = declination;
    return declination;
  } catch {
    return 0;
  }
}

/** Test seam: clear the session cache. */
export function __resetDeclinationCacheForTests(): void {
  cachedDeclination = null;
}
