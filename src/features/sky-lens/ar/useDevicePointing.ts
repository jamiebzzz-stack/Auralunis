import { useEffect, useRef, useState } from "react";
import { Accelerometer, Magnetometer } from "expo-sensors";
import { pointingFromSensors, type Vec3 } from "./SkyLensOrientation";
import type { CameraPointing } from "./SkyLensProjection";

type SensorReading = { x: number; y: number; z: number };
interface SensorModule {
  setUpdateInterval: (intervalMs: number) => void;
  addListener: (listener: (reading: SensorReading) => void) => { remove: () => void };
}
const Sensors = { Accelerometer, Magnetometer } as unknown as {
  Accelerometer: SensorModule;
  Magnetometer: SensorModule;
};

export interface DevicePointingState {
  pointing: CameraPointing;
  available: boolean;
}

const EMPTY_POINTING: CameraPointing = {
  azimuthDegrees: 0,
  altitudeDegrees: 0,
  rollDegrees: 0,
};

// Twenty updates per second is responsive enough for a planetarium while leaving the
// large SVG scene time to finish each frame. The old 25 Hz path amplified compass noise.
const MAX_LIVE_INTERVAL_MS = 50;

// After the phone has been quiet for this long, hold the rendered sky on an anchor.
// Magnetometer drift inside the hold window is sensor noise, not intentional movement.
const STATIONARY_LOCK_DELAY_MS = 550;
const STATIONARY_HOLD_AZIMUTH = 1.0;
const STATIONARY_HOLD_ALTITUDE = 0.65;
const STATIONARY_HOLD_ROLL = 1.0;

const normalizeHeading = (degrees: number) => ((degrees % 360) + 360) % 360;
const clampAltitude = (degrees: number) => Math.max(-90, Math.min(90, degrees));

const shortestAngleDelta = (from: number, to: number) => {
  let delta = (to - from + 540) % 360 - 180;
  if (delta === -180) delta = 180;
  return delta;
};

const stabilizeAngle = (
  previous: number,
  next: number,
  deadZoneDegrees: number,
  gentleFollow: number
) => {
  const delta = shortestAngleDelta(previous, next);
  const magnitude = Math.abs(delta);
  if (magnitude <= deadZoneDegrees) return previous;

  const follow =
    magnitude > 15 ? 0.94 :
    magnitude > 5 ? 0.8 :
    magnitude > 1.5 ? 0.62 :
    gentleFollow;
  return previous + delta * follow;
};

export function useDevicePointing(
  updateMs = 50,
  magneticDeclinationDegrees = 0,
  smoothingAlpha = 0.24
): DevicePointingState {
  const [state, setState] = useState<DevicePointingState>({
    pointing: EMPTY_POINTING,
    available: false,
  });

  const accelerometerRef = useRef<Vec3>({ x: 0, y: 0, z: 1 });
  const magnetometerRef = useRef<Vec3 | null>(null);
  const stablePointingRef = useRef<CameraPointing | null>(null);
  const lastPublishedRef = useRef<CameraPointing | null>(null);
  const stationaryAnchorRef = useRef<CameraPointing | null>(null);
  const lastIntentionalMotionAtRef = useRef(Date.now());
  const alphaRef = useRef(smoothingAlpha);
  alphaRef.current = smoothingAlpha;

  useEffect(() => {
    const cadenceMs = Math.max(32, Math.min(updateMs, MAX_LIVE_INTERVAL_MS));
    Sensors.Accelerometer.setUpdateInterval(cadenceMs);
    Sensors.Magnetometer.setUpdateInterval(cadenceMs);

    const ema = (prev: Vec3, next: SensorReading, alpha: number): Vec3 => ({
      x: prev.x + (next.x - prev.x) * alpha,
      y: prev.y + (next.y - prev.y) * alpha,
      z: prev.z + (next.z - prev.z) * alpha,
    });

    const publishPointing = () => {
      const magnetometer = magnetometerRef.current;
      if (!magnetometer) return;

      const measured = pointingFromSensors(
        accelerometerRef.current,
        magnetometer,
        magneticDeclinationDegrees
      );
      const raw: CameraPointing = {
        ...measured,
        azimuthDegrees: normalizeHeading(measured.azimuthDegrees),
        altitudeDegrees: clampAltitude(-measured.altitudeDegrees),
      };

      const previous = stablePointingRef.current;
      const alpha = Math.max(0.12, Math.min(0.28, alphaRef.current));
      const gentleFollow = Math.max(0.34, Math.min(0.56, alpha * 1.9));
      const stable: CameraPointing = previous
        ? {
            azimuthDegrees: normalizeHeading(
              stabilizeAngle(previous.azimuthDegrees, raw.azimuthDegrees, 0.24, gentleFollow)
            ),
            altitudeDegrees: clampAltitude(
              stabilizeAngle(previous.altitudeDegrees, raw.altitudeDegrees, 0.18, gentleFollow)
            ),
            rollDegrees: normalizeHeading(
              stabilizeAngle(previous.rollDegrees, raw.rollDegrees, 0.3, gentleFollow * 0.88)
            ),
          }
        : raw;

      stablePointingRef.current = stable;
      const last = lastPublishedRef.current;
      if (!last) {
        lastPublishedRef.current = stable;
        lastIntentionalMotionAtRef.current = Date.now();
        setState({ pointing: stable, available: true });
        return;
      }

      const now = Date.now();
      const azimuthDelta = Math.abs(shortestAngleDelta(last.azimuthDegrees, stable.azimuthDegrees));
      const altitudeDelta = Math.abs(last.altitudeDegrees - stable.altitudeDegrees);
      const rollDelta = Math.abs(shortestAngleDelta(last.rollDegrees, stable.rollDegrees));

      // A real pan/tilt clears the stationary anchor. Tiny magnetic wobble does not.
      const intentionalMotion =
        azimuthDelta >= 0.48 ||
        altitudeDelta >= 0.34 ||
        rollDelta >= 0.55;
      if (intentionalMotion) {
        lastIntentionalMotionAtRef.current = now;
        stationaryAnchorRef.current = null;
      } else if (
        !stationaryAnchorRef.current &&
        now - lastIntentionalMotionAtRef.current >= STATIONARY_LOCK_DELAY_MS
      ) {
        stationaryAnchorRef.current = last;
      }

      const anchor = stationaryAnchorRef.current;
      if (anchor) {
        const anchorAzimuthDelta = Math.abs(shortestAngleDelta(anchor.azimuthDegrees, stable.azimuthDegrees));
        const anchorAltitudeDelta = Math.abs(anchor.altitudeDegrees - stable.altitudeDegrees);
        const anchorRollDelta = Math.abs(shortestAngleDelta(anchor.rollDegrees, stable.rollDegrees));

        if (
          anchorAzimuthDelta < STATIONARY_HOLD_AZIMUTH &&
          anchorAltitudeDelta < STATIONARY_HOLD_ALTITUDE &&
          anchorRollDelta < STATIONARY_HOLD_ROLL
        ) {
          // Keep the exact last rendered frame while the phone is still.
          return;
        }

        // The user has moved beyond the lock window; resume following immediately.
        stationaryAnchorRef.current = null;
        lastIntentionalMotionAtRef.current = now;
      }

      // Do not invalidate the full SVG scene for sub-pixel sensor changes.
      const changed =
        azimuthDelta >= 0.28 ||
        altitudeDelta >= 0.2 ||
        rollDelta >= 0.34;
      if (!changed) return;

      lastPublishedRef.current = stable;
      setState({ pointing: stable, available: true });
    };

    const accelSub = Sensors.Accelerometer.addListener((reading) => {
      // Gravity is cleaner than magnetic heading, so it may follow a little faster.
      accelerometerRef.current = ema(accelerometerRef.current, reading, 0.34);
    });

    const magSub = Sensors.Magnetometer.addListener((reading) => {
      const alpha = Math.max(0.12, Math.min(0.28, alphaRef.current));
      magnetometerRef.current = magnetometerRef.current
        ? ema(magnetometerRef.current, reading, alpha)
        : reading;
      publishPointing();
    });

    return () => {
      accelSub.remove();
      magSub.remove();
    };
  }, [updateMs, magneticDeclinationDegrees]);

  return state;
}
