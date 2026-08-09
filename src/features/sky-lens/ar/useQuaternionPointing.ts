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

/** Sensor cadence. Matches the old pointing hook so battery behaviour is unchanged. */
const UPDATE_INTERVAL_MS = 80;

/**
 * Slerp factor per sample. One whole orientation is smoothed — never azimuth, altitude,
 * roll, or any individual star. Deliberately gentle so the sky trails the hand.
 */
const SMOOTHING = 0.16;

/**
 * Motion gate, in degrees of orientation change per sample. Below this the device is treated
 * as still and the orientation is frozen EXACTLY — not slowly drifting toward a noisy target.
 */
const STILL_THRESHOLD_DEGREES = 0.18;

/** Consecutive quiet samples required before the scene freezes (about a third of a second). */
const STILL_CONFIRM_SAMPLES = 4;

/**
 * A single sample further than this from the current orientation is discarded as implausible.
 * Real hand motion cannot cover 90 degrees in one 80 ms sample.
 */
const MAX_PLAUSIBLE_STEP_DEGREES = 90;

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
  const quietCountRef = useRef(0);

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

        const step = angleBetweenQuaternions(previous, next);

        // Implausible single-frame jump — drop it rather than teleport the sky.
        if (step > MAX_PLAUSIBLE_STEP_DEGREES) return;

        // Stillness gate. Once confirmed still the orientation is frozen bit-for-bit:
        // no slerp, no creep. Only real movement resumes tracking.
        if (step < STILL_THRESHOLD_DEGREES) {
          quietCountRef.current += 1;
          if (quietCountRef.current >= STILL_CONFIRM_SAMPLES) {
            if (!isStill) setIsStill(true);
            return;
          }
        } else {
          quietCountRef.current = 0;
          if (isStill) setIsStill(false);
        }

        // Smooth the WHOLE orientation along the shortest arc.
        const smoothed = slerp(previous, next, SMOOTHING);
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
