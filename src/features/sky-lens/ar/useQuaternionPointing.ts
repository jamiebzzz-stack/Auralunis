// useQuaternionPointing.ts — live Sky Lens orientation from DeviceMotion.
//
// Replaces the raw Accelerometer + Gyroscope + Magnetometer fusion in useDevicePointing.
// Core Motion already fuses those three far better than we can, and — critically — the
// orientation is carried as a QUATERNION the whole way, never round-tripped through
// azimuth/altitude/roll. Device data showed that round-trip is what produced the circling:
// above 85 degrees elevation the Euler azimuth swung a median 45.8 degrees per sample while
// the physical rotation was a fraction of that.
//
// The old hook is deliberately left in place and unused until this passes device testing.
//
// RESPONSE (2026-08-09): every filter constant here is time-based, not per-sample. See the
// block above the constants for the measurements that forced that change. Nothing in this file
// touches the projection, the camera basis, or Lock/drag — those were measured separately and
// are not implicated.

import { useCallback, useEffect, useRef, useState } from "react";
import { DeviceMotion } from "expo-sensors";
import {
  IDENTITY_QUATERNION,
  quaternionFromDeviceMotion,
  isValidQuaternion,
  normalizeQuaternion,
  slerp,
  angleBetweenQuaternions,
  type Quaternion
} from "./orientationQuaternion";
// All filter timing and gating rules live in the React-free orientationFilter module, so they
// are unit-testable under plain Node. Nothing here is expressed "per sample".
import {
  UPDATE_INTERVAL_MS,
  RESPONSE_TIME_CONSTANT_MS,
  STILL_THRESHOLD_DEGREES_PER_SECOND,
  STILL_CONFIRM_MS,
  MAX_PLAUSIBLE_RATE_DEGREES_PER_SECOND,
  angularRateDegreesPerSecond,
  resolveDeltaMs,
  smoothingFactor
} from "./orientationFilter";

export interface QuaternionPointingState {
  /** Current smoothed orientation. Identity until the first valid sample arrives. */
  orientation: Quaternion;
  /** True once DeviceMotion has produced at least one usable sample. */
  available: boolean;
  /** True while the device is confirmed still and the orientation is frozen. */
  isStill: boolean;
  /** The latest raw (unsmoothed) orientation — used to resume cleanly after unlocking. */
  readLiveOrientation: () => Quaternion;
}

export function useQuaternionPointing(enabled: boolean = true): QuaternionPointingState {
  const [orientation, setOrientation] = useState<Quaternion>(IDENTITY_QUATERNION);
  const [available, setAvailable] = useState(false);
  const [isStill, setIsStill] = useState(false);

  const smoothedRef = useRef<Quaternion | null>(null);
  const rawRef = useRef<Quaternion>(IDENTITY_QUATERNION);
  /** Accumulated quiet time in ms — duration, not sample count, so cadence cannot change it. */
  const quietMsRef = useRef(0);

  const readLiveOrientation = useCallback(() => rawRef.current, []);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let subscription: { remove: () => void } | null = null;

    const start = async () => {
      let deviceMotionAvailable = false;
      try {
        deviceMotionAvailable = await DeviceMotion.isAvailableAsync();
      } catch {
        deviceMotionAvailable = false;
      }
      if (cancelled || !deviceMotionAvailable) return;

      DeviceMotion.setUpdateInterval(UPDATE_INTERVAL_MS);
      subscription = DeviceMotion.addListener((motion) => {
        const rotation = motion?.rotation;
        if (!rotation) return;

        const sample = quaternionFromDeviceMotion(rotation.alpha, rotation.beta, rotation.gamma);
        // Reject anything non-finite or degenerate before it can reach the scene.
        if (!isValidQuaternion(sample)) return;
        const next = normalizeQuaternion(sample);
        rawRef.current = next;

        const previous = smoothedRef.current;
        if (!previous) {
          smoothedRef.current = next;
          setOrientation(next);
          setAvailable(true);
          return;
        }

        // Real elapsed time for this sample. DeviceMotion reports its own interval; it is
        // trusted only when sane, so a stalled JS thread cannot distort the filter.
        const deltaMs = resolveDeltaMs(motion?.interval, UPDATE_INTERVAL_MS);

        const step = angleBetweenQuaternions(previous, next);
        const rate = angularRateDegreesPerSecond(step, deltaMs);

        // Implausible rotation — drop it rather than teleport the sky.
        if (rate > MAX_PLAUSIBLE_RATE_DEGREES_PER_SECOND) return;

        // Stillness gate, accumulated in MILLISECONDS so it confirms after the same real
        // duration at any cadence. Once confirmed still the orientation is frozen bit-for-bit:
        // no slerp, no creep. Only real movement resumes tracking.
        if (rate < STILL_THRESHOLD_DEGREES_PER_SECOND) {
          quietMsRef.current += deltaMs;
          if (quietMsRef.current >= STILL_CONFIRM_MS) {
            if (!isStill) setIsStill(true);
            return;
          }
        } else {
          quietMsRef.current = 0;
          if (isStill) setIsStill(false);
        }

        // Smooth the WHOLE orientation along the shortest arc, by a factor derived from the
        // real elapsed time — never a fixed per-sample constant.
        const smoothed = slerp(previous, next, smoothingFactor(deltaMs, RESPONSE_TIME_CONSTANT_MS));
        smoothedRef.current = smoothed;
        setOrientation(smoothed);
      });
    };

    void start();

    return () => {
      cancelled = true;
      subscription?.remove();
      subscription = null;
    };
    // `isStill` is intentionally excluded: it is read through the closure only to avoid
    // redundant setState calls, and including it would resubscribe the sensor on every
    // still/moving transition, dropping the smoothing state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { orientation, available, isStill, readLiveOrientation };
}
