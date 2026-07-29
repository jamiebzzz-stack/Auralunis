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
  /** True during a deliberate pan/tilt. The renderer uses a lighter scene until settled. */
  moving: boolean;
}

const EMPTY_POINTING: CameraPointing = {
  azimuthDegrees: 0,
  altitudeDegrees: 0,
  rollDegrees: 0,
};

const MAX_LIVE_INTERVAL_MS = 40;
const SETTLE_DELAY_MS = 220;

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
    magnitude > 15 ? 0.98 :
    magnitude > 5 ? 0.9 :
    magnitude > 1.5 ? 0.76 :
    gentleFollow;
  return previous + delta * follow;
};

export function useDevicePointing(
  updateMs = 40,
  magneticDeclinationDegrees = 0,
  smoothingAlpha = 0.45
): DevicePointingState {
  const [state, setState] = useState<DevicePointingState>({
    pointing: EMPTY_POINTING,
    available: false,
    moving: false,
  });

  const accelerometerRef = useRef<Vec3>({ x: 0, y: 0, z: 1 });
  const magnetometerRef = useRef<Vec3 | null>(null);
  const stablePointingRef = useRef<CameraPointing | null>(null);
  const lastPublishedRef = useRef<CameraPointing | null>(null);
  const movingRef = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alphaRef = useRef(smoothingAlpha);
  alphaRef.current = smoothingAlpha;

  useEffect(() => {
    const cadenceMs = Math.max(16, Math.min(updateMs, MAX_LIVE_INTERVAL_MS));
    Sensors.Accelerometer.setUpdateInterval(cadenceMs);
    Sensors.Magnetometer.setUpdateInterval(cadenceMs);

    const ema = (prev: Vec3, next: SensorReading, alpha: number): Vec3 => ({
      x: prev.x + (next.x - prev.x) * alpha,
      y: prev.y + (next.y - prev.y) * alpha,
      z: prev.z + (next.z - prev.z) * alpha,
    });

    const markMoving = (pointing: CameraPointing) => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      movingRef.current = true;
      settleTimerRef.current = setTimeout(() => {
        movingRef.current = false;
        setState((current) => ({ ...current, pointing, moving: false }));
      }, SETTLE_DELAY_MS);
    };

    const publishPointing = () => {
      const magnetometer = magnetometerRef.current;
      if (!magnetometer) return;

      const p = pointingFromSensors(
        accelerometerRef.current,
        magnetometer,
        magneticDeclinationDegrees
      );
      const raw: CameraPointing = {
        ...p,
        azimuthDegrees: normalizeHeading(p.azimuthDegrees),
        altitudeDegrees: clampAltitude(-p.altitudeDegrees),
      };

      const previous = stablePointingRef.current;
      const alpha = Math.max(0.14, Math.min(0.5, alphaRef.current));
      const gentleFollow = Math.max(0.48, Math.min(0.78, alpha * 1.75));
      const stable: CameraPointing = previous
        ? {
            azimuthDegrees: normalizeHeading(
              stabilizeAngle(previous.azimuthDegrees, raw.azimuthDegrees, 0.28, gentleFollow)
            ),
            altitudeDegrees: clampAltitude(
              stabilizeAngle(previous.altitudeDegrees, raw.altitudeDegrees, 0.2, gentleFollow)
            ),
            rollDegrees: normalizeHeading(
              stabilizeAngle(previous.rollDegrees, raw.rollDegrees, 0.35, gentleFollow * 0.9)
            ),
          }
        : raw;

      stablePointingRef.current = stable;
      const last = lastPublishedRef.current;
      const azDelta = last ? Math.abs(shortestAngleDelta(last.azimuthDegrees, stable.azimuthDegrees)) : 360;
      const altDelta = last ? Math.abs(last.altitudeDegrees - stable.altitudeDegrees) : 180;
      const rollDelta = last ? Math.abs(shortestAngleDelta(last.rollDegrees, stable.rollDegrees)) : 360;
      const deliberateMotion = azDelta >= 0.3 || altDelta >= 0.24 || rollDelta >= 0.45;
      const changed = !last || azDelta >= 0.1 || altDelta >= 0.08 || rollDelta >= 0.16;

      if (!changed) return;
      lastPublishedRef.current = stable;
      if (deliberateMotion) markMoving(stable);
      setState({ pointing: stable, available: true, moving: movingRef.current || deliberateMotion });
    };

    const accelSub = Sensors.Accelerometer.addListener((reading) => {
      // Gravity/tilt can follow more quickly than the noisier magnetic heading.
      accelerometerRef.current = ema(accelerometerRef.current, reading, 0.48);
    });

    const magSub = Sensors.Magnetometer.addListener((reading) => {
      const alpha = Math.max(0.14, Math.min(0.5, alphaRef.current));
      magnetometerRef.current = magnetometerRef.current
        ? ema(magnetometerRef.current, reading, alpha)
        : reading;
      publishPointing();
    });

    return () => {
      accelSub.remove();
      magSub.remove();
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    };
  }, [updateMs, magneticDeclinationDegrees]);

  return state;
}