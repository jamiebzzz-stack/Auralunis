// orientationFusion.ts — stable heading fusion for Sky Lens.
//
// Pure math: no React, no expo-sensors, so every rule here is directly testable.
//
// THE DEFECT THIS FIXES
// --------------------
// Heading used to be recomputed absolutely from the magnetometer on every magnetometer
// sample (pointingFromSensors -> atan2(camEast, camNorth)). Two consequences:
//
//   1. Every magnetometer sample re-derived the whole heading, so magnetic noise and indoor
//      interference moved the scene directly, with no rejection of any kind.
//   2. That atan2 is ill-conditioned when the camera axis approaches vertical, because both
//      of its arguments go to zero together. Measured on the shipping code, a +/-2% field
//      perturbation swings heading 0 degrees at the horizon but ~4.6 degrees at 85 degrees
//      elevation — and pointing up is exactly how Sky Lens is held. That is the circling.
//
// THE FIX
// -------
// A complementary filter, split by what each sensor is actually good at:
//
//   * GYROSCOPE   — short-term relative motion. Accurate and quiet over seconds, drifts over
//                   minutes. Integrated about the gravity axis to move heading.
//   * ACCELEROMETER — tilt. Gravity is unambiguous and low-noise, so altitude and roll come
//                   straight from it and need no fusion.
//   * MAGNETOMETER — long-term absolute reference ONLY, applied as a slow bounded nudge that
//                   cancels gyro drift. It can never move the scene quickly.
//
// No single magnetometer sample can rotate the scene: correction is capped per sample,
// gated on measurement conditioning, and rejected outright when it disagrees wildly while
// the gyro says the phone is not turning.

/** Shortest signed angular distance from `from` to `to`, in (-180, 180]. */
export function shortestAngleDelta(from: number, to: number): number {
  let delta = ((to - from + 540) % 360) - 180;
  if (delta === -180) delta = 180;
  return delta;
}

export const normalizeHeading = (degrees: number) => ((degrees % 360) + 360) % 360;

/** Maximum heading correction the magnetometer may apply in a single sample, in degrees. */
export const MAX_HEADING_CORRECTION_PER_SAMPLE = 0.45;

/** Fraction of the remaining magnetic disagreement consumed per sample. */
export const HEADING_CORRECTION_GAIN = 0.05;

/**
 * Outlier tolerance. The allowance GROWS with gyro speed instead of switching rejection off:
 * a fast deliberate turn legitimately outruns the magnetometer for a moment, but a gentle pan
 * does not, and rejection must stay active at every speed.
 *
 * allowance = HEADING_OUTLIER_BASE_DEGREES + gyroSpeed * HEADING_OUTLIER_PER_RAD
 *   still  (0.01 rad/s) -> ~8.6 deg
 *   gentle (0.20 rad/s) -> ~20 deg    <- a persistent 44 deg magnetic error is REJECTED here
 *   fast   (1.50 rad/s) -> ~98 deg
 *
 * The previous rule only rejected outliers when the gyro was quiet, which disabled protection
 * during exactly the movement that sweeps a phone past steel, wiring and magnets.
 */
export const HEADING_OUTLIER_BASE_DEGREES = 8;
export const HEADING_OUTLIER_PER_RAD = 60;

/** Gyro speed (rad/s) below which the device is considered not to be turning. */
export const QUIET_GYRO_RAD_PER_SEC = 0.12;

/**
 * Hard envelope on CUMULATIVE magnetic trim, in degrees, relative to the gyro-integrated
 * heading. Capping only the per-sample step bounds the RATE but not the TOTAL: at 0.45 deg a
 * sample and 12.5 Hz the magnetometer could still walk the scene 5.6 deg/s indefinitely, and
 * a persistent bad reading dragged heading 44 deg over ten seconds on a real device.
 *
 * With this envelope the gyroscope owns the heading and the magnetometer may only trim it
 * within a fixed band, so a wrong magnetic reading can never redefine north.
 */
export const MAX_TOTAL_TRIM_DEGREES = 12;

/** Allowed outlier disagreement at a given gyro speed. */
export function outlierAllowanceDegrees(gyroSpeed: number): number {
  const speed = Number.isFinite(gyroSpeed) ? Math.max(0, gyroSpeed) : 0;
  return HEADING_OUTLIER_BASE_DEGREES + speed * HEADING_OUTLIER_PER_RAD;
}

/** Clamp cumulative trim into the envelope. */
export function clampTrim(trim: number): number {
  if (!Number.isFinite(trim)) return 0;
  return Math.max(-MAX_TOTAL_TRIM_DEGREES, Math.min(MAX_TOTAL_TRIM_DEGREES, trim));
}

/**
 * Minimum horizontal component of the camera axis for a magnetometer heading to be
 * trustworthy. Below this the atan2 is ill-conditioned (camera near vertical) and the
 * measurement is ignored entirely rather than fed in noisily.
 */
export const MIN_HEADING_CONDITIONING = 0.30;

export interface HeadingCorrectionInput {
  /** Current fused heading, degrees. */
  currentHeading: number;
  /** Heading the magnetometer currently reports, degrees. */
  measuredHeading: number;
  /** Magnitude of the camera axis' horizontal component, 0..1. */
  conditioning: number;
  /** Current gyroscope speed, rad/s. */
  gyroSpeed: number;
  /** False when the gyro has confirmed stillness — correction is then forbidden. */
  isMoving: boolean;
  /** Cumulative trim already applied, relative to the gyro-integrated heading. */
  currentTrim: number;
}

export interface HeadingCorrectionResult {
  heading: number;
  /** Why a correction was skipped, for tests and diagnostics. */
  reason: "applied" | "frozen" | "ill-conditioned" | "outlier" | "envelope";
  /** Degrees actually applied this sample (signed). */
  appliedDegrees: number;
  /** Cumulative trim after this sample, always within the envelope. */
  trim: number;
}

/**
 * One bounded magnetometer correction step.
 *
 * Ordering matters and is asserted by the self-test: the stationary freeze is checked first,
 * so a still phone can never be moved by the magnetometer at all.
 */
export function correctHeading(input: HeadingCorrectionInput): HeadingCorrectionResult {
  const { currentHeading, measuredHeading, conditioning, gyroSpeed, isMoving } = input;
  const currentTrim = clampTrim(input.currentTrim ?? 0);
  const unchanged = (reason: HeadingCorrectionResult["reason"]): HeadingCorrectionResult => ({
    heading: normalizeHeading(currentHeading),
    reason,
    appliedDegrees: 0,
    trim: currentTrim
  });

  // 1. Stationary guard. A gyro-confirmed still phone is frozen on every axis; magnetometer
  //    drift may neither move the view nor unlock it. Checked before every other rule.
  if (!isMoving) return unchanged("frozen");

  // 2. Conditioning gate. Near-vertical camera => azimuth measurement is meaningless.
  if (!Number.isFinite(conditioning) || conditioning < MIN_HEADING_CONDITIONING) {
    return unchanged("ill-conditioned");
  }

  // 3. Outlier rejection, with an allowance that scales with gyro speed so protection is
  //    never switched off — least of all during the gentle pans that caused the drift.
  const delta = shortestAngleDelta(currentHeading, measuredHeading);
  if (Math.abs(delta) > outlierAllowanceDegrees(gyroSpeed)) return unchanged("outlier");

  // 4. Bounded nudge along the shortest path, then clamped into the cumulative envelope.
  const desired = delta * HEADING_CORRECTION_GAIN;
  const perSample = Math.max(
    -MAX_HEADING_CORRECTION_PER_SAMPLE,
    Math.min(MAX_HEADING_CORRECTION_PER_SAMPLE, desired)
  );
  const nextTrim = clampTrim(currentTrim + perSample);
  const applied = nextTrim - currentTrim;
  // Envelope saturated: the magnetometer wants more but may not have it.
  if (applied === 0 && perSample !== 0) {
    return { heading: normalizeHeading(currentHeading), reason: "envelope", appliedDegrees: 0, trim: currentTrim };
  }
  return {
    heading: normalizeHeading(currentHeading + applied),
    reason: "applied",
    appliedDegrees: applied,
    trim: nextTrim
  };
}

/**
 * Heading change from gyroscope rotation about the gravity axis.
 *
 * The component of angular velocity along `up` is rotation in the horizontal plane. Compass
 * azimuth increases clockwise seen from above, while a positive right-hand-rule rotation
 * about `up` is counter-clockwise, hence the negation.
 */
export function gyroHeadingDelta(
  gyro: { x: number; y: number; z: number },
  up: { x: number; y: number; z: number },
  dtSeconds: number
): number {
  const yawRate = gyro.x * up.x + gyro.y * up.y + gyro.z * up.z;
  if (!Number.isFinite(yawRate) || !Number.isFinite(dtSeconds)) return 0;
  return -((yawRate * dtSeconds * 180) / Math.PI);
}
