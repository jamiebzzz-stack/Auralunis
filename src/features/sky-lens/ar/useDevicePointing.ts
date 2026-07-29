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

const MAX_LIVE_INTERVAL_MS = 40;

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
    magnitude > 15 ? 0.95 :
    magnitude > 5 ? 0.82 :
    magnitude > 1.5 ? 0.68 :
    gentleFollow;
  return previous + delta * follow;
};

export function useDevicePointing(
  updateMs = 40,
  magneticDeclinationDegrees = 0,
  smoothingAlpha = 0.3
): DevicePointingState {
  const [state, setState] = useState<DevicePointingState>({
    pointing: EMPTY_POINTING,
    available: false,
  });

  const accelerometerRef = useRef<Vec3>({ x: 0, y: 0, z: 1 });
  const magnetometerRef = useRef<Vec3 | null>(null);
  const stablePointingRef = useRef<CameraPointing | null>(null);
  const lastPublishedRef = useRef<CameraPointing | null>(null);
  const alphaRef = useRef(smoothingAlpha);
  alphaRef.current = smoothingAlpha;

  useEffect(() => {
    const cadenceMs = Math.max(16, Math.min(updateMs, MAX_LIVE_INTERVAL_MS));
    Sensors.Accelerometer.setUpdateInterval(cadenceMs);
    Sensors.Magnetometer.setUpdateInterval(cadenceMs);

    const ema = (prev: Vec3, next: SensorReading): Vec3 => {
      const alpha = Math.max(0.1, Math.min(0.36, alphaRef.current));
      return {
        x: prev.x + (next.x - prev.x) * alpha,
        y: prev.y + (next.y - prev.y) * alpha,
        z: prev.z + (next.z - prev.z) * alpha,
      };
    };

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
      const alpha = Math.max(0.1, Math.min(0.36, alphaRef.current));
      const gentleFollow = Math.max(0.4, Math.min(0.72, alpha * 2.2));
      const stable: CameraPointing = previous
        ? {
            azimuthDegrees: normalizeHeading(
              stabilizeAngle(previous.azimuthDegrees, raw.azimuthDegrees, 0.18, gentleFollow)
            ),
            altitudeDegrees: clampAltitude(
              stabilizeAngle(previous.altitudeDegrees, raw.altitudeDegrees, 0.14, gentleFollow)
            ),
            rollDegrees: normalizeHeading(
              stabilizeAngle(previous.rollDegrees, raw.rollDegrees, 0.22, gentleFollow * 0.9)
            ),
          }
        : raw;

      stablePointingRef.current = stable;
      const last = lastPublishedRef.current;
      const changed =
        !last ||
        Math.abs(shortestAngleDelta(last.azimuthDegrees, stable.azimuthDegrees)) >= 0.035 ||
        Math.abs(last.altitudeDegrees - stable.altitudeDegrees) >= 0.035 ||
        Math.abs(shortestAngleDelta(last.rollDegrees, stable.rollDegrees)) >= 0.05;

      if (!changed) return;
      lastPublishedRef.current = stable;
      setState({ pointing: stable, available: true });
    };

    const accelSub = Sensors.Accelerometer.addListener((reading) => {
      accelerometerRef.current = ema(accelerometerRef.current, reading);
    });

    const magSub = Sensors.Magnetometer.addListener((reading) => {
      magnetometerRef.current = magnetometerRef.current
        ? ema(magnetometerRef.current, reading)
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