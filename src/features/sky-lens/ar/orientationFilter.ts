// orientationFilter.ts — timing and gating rules for the Sky Lens orientation filter.
//
// Pure math: no React, no expo-sensors, so every constant and helper is directly testable
// under plain Node (same convention as paywallCopy.ts and SkyLensProjection.ts).
//
// WHY THIS EXISTS
// ---------------
// EVERY value here is expressed in real units — milliseconds, or degrees per SECOND — and
// never "per sample". The previous implementation smoothed by a fixed 0.16 slerp per sample at
// an 80 ms cadence, so the response time was a hidden function of the sensor interval: change
// the interval and the feel changed with it, silently.
//
// Measured on that setup: a 459 ms time constant and 1375 ms to settle. At a 45 deg/s pan the
// sky trailed the handset by 20.6 deg — about 148 px on a 430 pt-wide screen — and moved in
// visible 26 px steps. On device that read as the sky "swimming" and then catching up, which
// is the symptom this file exists to remove.
//
// Two things deliberately NOT changed here: the projection (measured at 0.1% shape variation
// at 25 deg off-axis, 3.0% at 55 deg — minor polish, not the defect) and Lock/drag (confirmed
// working on device). Neither is implicated in the lag.

/**
 * Sensor cadence. 60 Hz — the rate the scene is actually looked at. The old 80 ms (12.5 Hz)
 * cadence also made motion visibly stepped.
 */
export const UPDATE_INTERVAL_MS = 16;

/**
 * Response time constant. The smoothed orientation closes 63% of the gap to the live attitude
 * in this long, whatever the sensor cadence happens to be. Short enough to feel attached to
 * the hand, long enough to reject per-sample sensor noise.
 */
export const RESPONSE_TIME_CONSTANT_MS = 120;

/**
 * Motion gate in degrees per SECOND. Below this the device is treated as still and the
 * orientation is frozen EXACTLY — not creeping toward a noisy target. Rate-expressed so it
 * means the same thing at any cadence; the old 0.18 deg/sample at 80 ms was 2.25 deg/s.
 */
export const STILL_THRESHOLD_DEGREES_PER_SECOND = 2.25;

/** How long the device must stay under the gate before the scene freezes. */
export const STILL_CONFIRM_MS = 320;

/**
 * A sample implying a rotation faster than this is discarded rather than teleporting the sky.
 * Deliberately permissive — real hand motion can be genuinely fast, and rejecting a real fast
 * pan is far more noticeable than letting one odd sample through. Equivalent to the previous
 * 90 deg per 80 ms sample.
 */
export const MAX_PLAUSIBLE_RATE_DEGREES_PER_SECOND = 1125;

/**
 * Bounds on the per-sample delta. `interval` from DeviceMotion is trusted only when sane: a
 * stalled JS thread or a first sample can otherwise report a wild dt, which would make the
 * filter jump (dt >> tau) or stall (dt <= 0).
 */
export const MIN_DELTA_MS = 1;
export const MAX_DELTA_MS = 250;

/**
 * Frame-rate-independent smoothing factor: the fraction of the remaining gap to close over
 * `deltaMs`. `alpha = 1 - exp(-dt/tau)` is the exact discrete equivalent of a continuous
 * first-order lag, so halving the sensor interval does not change how the sky feels.
 *
 * Returns 1 (snap straight to the live value) for degenerate inputs — a filter that cannot
 * compute a sensible partial step must not apply a wrong one.
 */
export function smoothingFactor(deltaMs: number, timeConstantMs: number): number {
  if (!(deltaMs > 0) || !(timeConstantMs > 0)) return 1;
  return 1 - Math.exp(-deltaMs / timeConstantMs);
}

/** Clamp a reported sensor interval into a usable delta. */
export function resolveDeltaMs(reported: number | undefined, fallbackMs: number): number {
  const usable = Number.isFinite(reported) && (reported as number) > 0 ? (reported as number) : fallbackMs;
  return Math.max(MIN_DELTA_MS, Math.min(MAX_DELTA_MS, usable));
}

/** Angular rate implied by an orientation step over a real elapsed time. */
export function angularRateDegreesPerSecond(stepDegrees: number, deltaMs: number): number {
  if (!(deltaMs > 0)) return 0;
  return stepDegrees / (deltaMs / 1000);
}
