import { useEffect, useRef, useState } from "react";
import { Accelerometer, Gyroscope, Magnetometer } from "expo-sensors";
import { pointingFromSensors, type Vec3 } from "./SkyLensOrientation";
import type { CameraPointing } from "./SkyLensProjection";

type SensorReading = { x: number; y: number; z: number };
interface SensorModule {
  setUpdateInterval: (intervalMs: number) => void;
  addListener: (listener: (reading: SensorReading) => void) => { remove: () => void };
}
const Sensors = { Accelerometer, Gyroscope, Magnetometer } as unknown as {
  Accelerometer: SensorModule;
  Gyroscope: SensorModule;
  Magnetometer: SensorModule;
};

export interface DevicePointingState {
  pointing: CameraPointing;
  available: boolean;
}

const EMPTY_POINTING: CameraPointing = {
  azimuthDegrees: 0,
  altitudeDegrees: 0,
  rollDegrees: 0
};

const STILLNESS_DELAY_MS = 500;
const GYRO_MOVEMENT_THRESHOLD = 0.075;

const normalizeHeading = (degrees: number) => ((degrees % 360) + 360) % 360;
const clampAltitude = (degrees: number) => Math.max(-90, Math.min(90, degrees));

const shortestAngleDelta = (from: number, to: number) => {
  let delta = (to - from + 540) % 360 - 180;
  if (delta === -180) delta = 180;
  return delta;
};

const followAngle = (
  previous: number,
  next: number,
  deadZoneDegrees: number,
  follow: number
) => {
  const delta = shortestAngleDelta(previous, next);
  if (Math.abs(delta) <= deadZoneDegrees) return previous;
  return previous + delta * follow;
};

export function useDevicePointing(
  updateMs = 120,
  magneticDeclinationDegrees = 0,
  smoothingAlpha = 0.3
): DevicePointingState {
  const [state, setState] = useState<DevicePointingState>({
    pointing: EMPTY_POINTING,
    available: false
  });

  const accelerometerRef = useRef<Vec3>({ x: 0, y: 0, z: 1 });
  const magnetometerRef = useRef<Vec3 | null>(null);
  const filteredPointingRef = useRef<CameraPointing | null>(null);
  const lastPublishedRef = useRef<CameraPointing | null>(null);
  const lastRealRotationAtRef = useRef(Date.now());
  const stationaryLockedRef = useRef(false);
  const alphaRef = useRef(smoothingAlpha);
  alphaRef.current = smoothingAlpha;

  useEffect(() => {
    Sensors.Accelerometer.setUpdateInterval(updateMs);
    Sensors.Magnetometer.setUpdateInterval(updateMs);
    Sensors.Gyroscope.setUpdateInterval(Math.min(updateMs, 50));

    const ema = (previous: Vec3, next: SensorReading): Vec3 => {
      const alpha = Math.min(alphaRef.current, 0.16);
      return {
        x: previous.x + (next.x - previous.x) * alpha,
        y: previous.y + (next.y - previous.y) * alpha,
        z: previous.z + (next.z - previous.z) * alpha
      };
    };

    const publishPointing = () => {
      const magnetometer = magnetometerRef.current;
      if (!magnetometer) return;

      const now = Date.now();
      const phoneIsStill = now - lastRealRotationAtRef.current >= STILLNESS_DELAY_MS;

      // Once the gyroscope confirms the phone has stopped rotating, freeze the exact rendered
      // frame. Magnetometer drift alone is never allowed to unlock or rotate the sky.
      if (phoneIsStill && lastPublishedRef.current) {
        stationaryLockedRef.current = true;
        return;
      }

      if (stationaryLockedRef.current) {
        stationaryLockedRef.current = false;
      }

      const measured = pointingFromSensors(
        accelerometerRef.current,
        magnetometer,
        magneticDeclinationDegrees
      );
      const raw: CameraPointing = {
        ...measured,
        azimuthDegrees: normalizeHeading(measured.azimuthDegrees),
        altitudeDegrees: clampAltitude(-measured.altitudeDegrees)
      };

      const previous = filteredPointingRef.current;
      const filtered: CameraPointing = previous
        ? {
            azimuthDegrees: normalizeHeading(
              followAngle(previous.azimuthDegrees, raw.azimuthDegrees, 0.65, 0.42)
            ),
            altitudeDegrees: clampAltitude(
              followAngle(previous.altitudeDegrees, raw.altitudeDegrees, 0.45, 0.38)
            ),
            rollDegrees: normalizeHeading(
              followAngle(previous.rollDegrees, raw.rollDegrees, 0.75, 0.34)
            )
          }
        : raw;

      filteredPointingRef.current = filtered;
      const last = lastPublishedRef.current;
      if (last) {
        const azimuthDelta = Math.abs(shortestAngleDelta(last.azimuthDegrees, filtered.azimuthDegrees));
        const altitudeDelta = Math.abs(last.altitudeDegrees - filtered.altitudeDegrees);
        const rollDelta = Math.abs(shortestAngleDelta(last.rollDegrees, filtered.rollDegrees));

        if (azimuthDelta < 0.35 && altitudeDelta < 0.25 && rollDelta < 0.4) return;
      }

      lastPublishedRef.current = filtered;
      setState({ pointing: filtered, available: true });
    };

    const accelerometerSubscription = Sensors.Accelerometer.addListener((reading) => {
      accelerometerRef.current = ema(accelerometerRef.current, reading);
    });

    const gyroscopeSubscription = Sensors.Gyroscope.addListener((reading) => {
      const angularSpeed = Math.sqrt(
        reading.x * reading.x + reading.y * reading.y + reading.z * reading.z
      );
      if (angularSpeed >= GYRO_MOVEMENT_THRESHOLD) {
        lastRealRotationAtRef.current = Date.now();
        stationaryLockedRef.current = false;
      }
    });

    const magnetometerSubscription = Sensors.Magnetometer.addListener((reading) => {
      magnetometerRef.current = magnetometerRef.current
        ? ema(magnetometerRef.current, reading)
        : reading;
      publishPointing();
    });

    return () => {
      accelerometerSubscription.remove();
      gyroscopeSubscription.remove();
      magnetometerSubscription.remove();
    };
  }, [updateMs, magneticDeclinationDegrees]);

  return state;
}
