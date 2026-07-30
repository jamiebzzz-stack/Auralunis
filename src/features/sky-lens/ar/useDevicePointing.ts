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

// Deliberately conservative. Sky Lens should feel controllable before it feels fast.
const SENSOR_INTERVAL_MS = 80;
const GYRO_START_THRESHOLD = 0.095;
const GYRO_STOP_THRESHOLD = 0.045;
const STILLNESS_CONFIRM_MS = 260;
const AZIMUTH_DEAD_ZONE = 0.9;
const ALTITUDE_DEAD_ZONE = 0.65;
const ROLL_DEAD_ZONE = 0.9;

const normalizeHeading = (degrees: number) => ((degrees % 360) + 360) % 360;
const clampAltitude = (degrees: number) => Math.max(-90, Math.min(90, degrees));

const shortestAngleDelta = (from: number, to: number) => {
  let delta = (to - from + 540) % 360 - 180;
  if (delta === -180) delta = 180;
  return delta;
};

const followCircular = (previous: number, next: number, factor: number) =>
  normalizeHeading(previous + shortestAngleDelta(previous, next) * factor);

const followLinear = (previous: number, next: number, factor: number) =>
  previous + (next - previous) * factor;

export function useDevicePointing(
  _updateMs = SENSOR_INTERVAL_MS,
  magneticDeclinationDegrees = 0,
  _smoothingAlpha = 0.3
): DevicePointingState {
  const [state, setState] = useState<DevicePointingState>({
    pointing: EMPTY_POINTING,
    available: false
  });

  const accelerometerRef = useRef<Vec3>({ x: 0, y: 0, z: 1 });
  const magnetometerRef = useRef<Vec3 | null>(null);
  const publishedRef = useRef<CameraPointing | null>(null);
  const movingRef = useRef(false);
  const lastMotionAtRef = useRef(0);

  useEffect(() => {
    Sensors.Accelerometer.setUpdateInterval(SENSOR_INTERVAL_MS);
    Sensors.Magnetometer.setUpdateInterval(SENSOR_INTERVAL_MS);
    Sensors.Gyroscope.setUpdateInterval(40);

    const smoothVector = (previous: Vec3, next: SensorReading, alpha: number): Vec3 => ({
      x: previous.x + (next.x - previous.x) * alpha,
      y: previous.y + (next.y - previous.y) * alpha,
      z: previous.z + (next.z - previous.z) * alpha
    });

    const accelerometerSubscription = Sensors.Accelerometer.addListener((reading) => {
      accelerometerRef.current = smoothVector(accelerometerRef.current, reading, 0.14);
    });

    const gyroscopeSubscription = Sensors.Gyroscope.addListener((reading) => {
      const speed = Math.hypot(reading.x, reading.y, reading.z);
      const now = Date.now();

      if (speed >= GYRO_START_THRESHOLD) {
        movingRef.current = true;
        lastMotionAtRef.current = now;
      } else if (
        movingRef.current &&
        speed <= GYRO_STOP_THRESHOLD &&
        now - lastMotionAtRef.current >= STILLNESS_CONFIRM_MS
      ) {
        movingRef.current = false;
      }
    });

    const magnetometerSubscription = Sensors.Magnetometer.addListener((reading) => {
      magnetometerRef.current = magnetometerRef.current
        ? smoothVector(magnetometerRef.current, reading, 0.12)
        : reading;

      const magnetometer = magnetometerRef.current;
      if (!magnetometer) return;

      const measured = pointingFromSensors(
        accelerometerRef.current,
        magnetometer,
        magneticDeclinationDegrees
      );
      const raw: CameraPointing = {
        azimuthDegrees: normalizeHeading(measured.azimuthDegrees),
        altitudeDegrees: clampAltitude(-measured.altitudeDegrees),
        rollDegrees: normalizeHeading(measured.rollDegrees)
      };

      const previous = publishedRef.current;
      if (!previous) {
        publishedRef.current = raw;
        setState({ pointing: raw, available: true });
        return;
      }

      // Once the gyroscope confirms the phone is still, the rendered sky is frozen exactly.
      // Magnetometer drift cannot move it or unlock it.
      if (!movingRef.current) return;

      const azimuthDelta = Math.abs(shortestAngleDelta(previous.azimuthDegrees, raw.azimuthDegrees));
      const altitudeDelta = Math.abs(raw.altitudeDegrees - previous.altitudeDegrees);
      const rollDelta = Math.abs(shortestAngleDelta(previous.rollDegrees, raw.rollDegrees));

      if (
        azimuthDelta < AZIMUTH_DEAD_ZONE &&
        altitudeDelta < ALTITUDE_DEAD_ZONE &&
        rollDelta < ROLL_DEAD_ZONE
      ) {
        return;
      }

      // One bounded update per sensor sample. Keep deliberate turns responsive, but use a
      // slower follow rate so normal hand movement does not race ahead of the observer.
      const largestDelta = Math.max(azimuthDelta, altitudeDelta, rollDelta);
      const factor = largestDelta > 18 ? 0.34 : largestDelta > 7 ? 0.26 : 0.18;
      const next: CameraPointing = {
        azimuthDegrees: followCircular(previous.azimuthDegrees, raw.azimuthDegrees, factor),
        altitudeDegrees: clampAltitude(followLinear(previous.altitudeDegrees, raw.altitudeDegrees, factor)),
        rollDegrees: followCircular(previous.rollDegrees, raw.rollDegrees, Math.min(factor, 0.22))
      };

      publishedRef.current = next;
      setState({ pointing: next, available: true });
    });

    return () => {
      accelerometerSubscription.remove();
      gyroscopeSubscription.remove();
      magnetometerSubscription.remove();
    };
  }, [magneticDeclinationDegrees]);

  return state;
}
