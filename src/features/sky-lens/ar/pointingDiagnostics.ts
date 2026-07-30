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


// ── Quaternion orientation diagnostics ───────────────────────────────────────────────
// Dev-only, same contract as above: silent in Release.

let lastOrientationLogAt = 0;
const ORIENTATION_THROTTLE_MS = 500;

export interface OrientationSample {
  orientation: { w: number; x: number; y: number; z: number };
  /** Degrees of orientation change this sample. */
  step: number;
  /** Whether the stillness gate has frozen the scene. */
  still: boolean;
  source: "live" | "frozen" | "locked" | "drag" | "unlock-blend";
  /** Drag offset while locked, in degrees. */
  dragYaw?: number;
  dragPitch?: number;
  /** Unlock blend progress, 0..1. */
  blend?: number;
}

export function logOrientationSample(sample: OrientationSample): void {
  if (!__DEV__) return;
  const now = Date.now();
  if (now - lastOrientationLogAt < ORIENTATION_THROTTLE_MS) return;
  lastOrientationLogAt = now;

  const q = sample.orientation;
  const f = (v: number | undefined, p = 3) =>
    (Number.isFinite(v) ? (v as number) : 0).toFixed(p).padStart(p + 4);

  // eslint-disable-next-line no-console
  console.log(
    "[SkyLensQuat]" +
      ` q=[${f(q.w)} ${f(q.x)} ${f(q.y)} ${f(q.z)}]` +
      ` step=${f(sample.step, 2)}deg` +
      ` ${sample.still ? "STILL " : "MOVING"}` +
      ` src=${sample.source.padEnd(12)}` +
      (sample.dragYaw !== undefined ? ` dragYaw=${f(sample.dragYaw, 1)}` : "") +
      (sample.dragPitch !== undefined ? ` dragPitch=${f(sample.dragPitch, 1)}` : "") +
      (sample.blend !== undefined ? ` blend=${f(sample.blend, 2)}` : "")
  );
}
