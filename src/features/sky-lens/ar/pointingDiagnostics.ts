// pointingDiagnostics.ts — TEMPORARY dev-only instrumentation for Sky Lens pointing.
//
// Emits one structured line per throttled sample so a physical-device session can be read
// back and reasoned about, instead of guessing from a screen recording.
//
// NOT IN RELEASE. Every entry point is behind `__DEV__`, so this compiles to dead code and
// logs nothing in a Release build. That also means: to SEE this output you must run a debug
// build. A Release build will print nothing by design.
//
// Remove this file once the orientation work is signed off.

export interface PointingSample {
  /** Heading the magnetometer reported this sample, before any fusion. */
  rawHeading: number;
  /** Heading actually used to render, after fusion. */
  fusedHeading: number;
  /** Gyroscope magnitude, rad/s. */
  gyroSpeed: number;
  /** Gyro-confirmed movement state. */
  isMoving: boolean;
  /** Conditioning of the magnetometer heading, 0..1 (low = camera near vertical). */
  conditioning: number;
  /** Why the correction was applied or skipped. */
  reason: string;
  /** Degrees of correction actually applied this sample (signed). */
  appliedDegrees: number;
  /** Cumulative magnetic trim relative to the gyro-integrated heading. */
  cumulativeTrim: number;
  /** Published altitude and roll, for spotting axis problems. */
  altitude: number;
  roll: number;
}

const THROTTLE_MS = 250;
let lastLoggedAt = 0;
let sampleCount = 0;
let cumulativeCorrection = 0;
let rejectedOutliers = 0;
let frozenSamples = 0;
let envelopeHits = 0;

/** Reset the running session counters (call when Sky Lens mounts). */
export function resetPointingDiagnostics(): void {
  if (!__DEV__) return;
  lastLoggedAt = 0;
  sampleCount = 0;
  cumulativeCorrection = 0;
  rejectedOutliers = 0;
  frozenSamples = 0;
  envelopeHits = 0;
}

/**
 * Record one pointing sample. Counters accumulate on every call; a formatted line is printed
 * at most every THROTTLE_MS so the console stays readable during a device session.
 */
export function logPointingSample(sample: PointingSample): void {
  if (!__DEV__) return;

  sampleCount += 1;
  cumulativeCorrection += sample.appliedDegrees;
  if (sample.reason === "outlier") rejectedOutliers += 1;
  if (sample.reason === "frozen") frozenSamples += 1;
  if (sample.reason === "envelope") envelopeHits += 1;

  const now = Date.now();
  if (now - lastLoggedAt < THROTTLE_MS) return;
  lastLoggedAt = now;

  // Signed shortest disagreement between what the magnetometer wants and what we render.
  let disagreement = ((sample.rawHeading - sample.fusedHeading + 540) % 360) - 180;
  if (disagreement === -180) disagreement = 180;

  const fixed = (value: number, places = 1) =>
    (Number.isFinite(value) ? value : 0).toFixed(places).padStart(7);

  // eslint-disable-next-line no-console
  console.log(
    "[SkyLens]" +
      ` raw=${fixed(sample.rawHeading)}` +
      ` fused=${fixed(sample.fusedHeading)}` +
      ` disagree=${fixed(disagreement)}` +
      ` gyro=${fixed(sample.gyroSpeed, 3)}` +
      ` ${sample.isMoving ? "MOVING" : "STILL "}` +
      ` cond=${fixed(sample.conditioning, 2)}` +
      ` ${sample.reason.padEnd(15)}` +
      ` applied=${fixed(sample.appliedDegrees, 3)}` +
      ` trim=${fixed(sample.cumulativeTrim, 2)}` +
      ` cumulative=${fixed(cumulativeCorrection)}` +
      ` alt=${fixed(sample.altitude)}` +
      ` roll=${fixed(sample.roll)}` +
      ` n=${sampleCount}` +
      ` outliers=${rejectedOutliers}` +
      ` frozen=${frozenSamples}` +
      ` envelopeHits=${envelopeHits}`
  );
}
