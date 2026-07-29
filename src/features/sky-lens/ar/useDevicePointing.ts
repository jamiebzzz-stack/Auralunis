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

const STILLNESS_DELAY_MS = 430;
const GYRO_MOVEMENT_THRESHOLD = 0.06;
const DISPLAY_EPSILON_AZ = 0.025;
const DISPLAY_EPSILON_ALT = 0.02;
const DISPLAY_EPSILON_ROLL = 0.03;

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

const interpolatePointing = (
  current: CameraPointing,
  target: CameraPointing,
  factor: number
): CameraPointing => ({
  azimuthDegrees: normalizeHeading(
    current.azimuthDegrees + shortestAngleDelta(current.azimuthDegrees, target.azimuthDegrees) * factor
  ),
  altitudeDegrees: clampAltitude(
    current.altitudeDegrees + (target.altitudeDegrees - current.altitudeDegrees) * factor
  ),
  rollDegrees: normalizeHeading(
    current.rollDegrees + shortestAngleDelta(current.rollDegrees, target.rollDegrees) * factor
  )
});

export function useDevicePointing(
  updateMs = 40,
  magneticDeclinationDegrees = 0,
  smoothingAlpha = 0.3
): DevicePointingState {
  const [state, setState] = useState<DevicePointingState>({
    pointing: EMPTY_POINTING,
    available: false
  });

  const accelerometerRef = useRef<Vec3>({ x: 0, y: 0, z: 1 });
  const magnetometerRef = useRef<Vec3 | null>(null);
  const sensorTargetRef = useRef<CameraPointing | null>(null);
  const displayPointingRef = useRef<CameraPointing | null>(null);
  const lastRealRotationAtRef = useRef(Date.now());
  const phoneMovingRef = useRef(true);
  const alphaRef = useRef(smoothingAlpha);
  alphaRef.current = smoothingAlpha;

  useEffect(() => {
    Sensors.Accelerometer.setUpdateInterval(updateMs);
    Sensors.Magnetometer.setUpdateInterval(updateMs);
    Sensors.Gyroscope.setUpdateInterval(Math.min(updateMs, 24));

    const ema = (previous: Vec3, next: SensorReading): Vec3 => {
      const alpha = Math.min(alphaRef.current, 0.22);
      return {
        x: previous.x + (next.x - previous.x) * alpha,
        y: previous.y + (next.y - previous.y) * alpha,
        z: previous.z + (next.z - previous.z) * alpha
      };
    };

    const updateSensorTarget = () => {
      const magnetometer = magnetometerRef.current;
      if (!magnetometer) return;

      const now = Date.now();
      const phoneIsStill = now - lastRealRotationAtRef.current >= STILLNESS_DELAY_MS;
      phoneMovingRef.current = !phoneIsStill;

      // Ordinary magnetometer drift is ignored once the gyroscope confirms the phone is still.
      if (phoneIsStill && sensorTargetRef.current) return;

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

      const previous = sensorTargetRef.current;
      const target: CameraPointing = previous
        ? {
            azimuthDegrees: normalizeHeading(
              followAngle(previous.azimuthDegrees, raw.azimuthDegrees, 0.32, 0.64)
            ),
            altitudeDegrees: clampAltitude(
              followAngle(previous.altitudeDegrees, raw.altitudeDegrees, 0.24, 0.58)
            ),
            rollDegrees: normalizeHeading(
              followAngle(previous.rollDegrees, raw.rollDegrees, 0.42, 0.5)
            )
          }
        : raw;

      sensorTargetRef.current = target;
      if (!displayPointingRef.current) {
        displayPointingRef.current = target;
        setState({ pointing: target, available: true });
      }
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
        phoneMovingRef.current = true;
      }
    });

    const magnetometerSubscription = Sensors.Magnetometer.addListener((reading) => {
      magnetometerRef.current = magnetometerRef.current
        ? ema(magnetometerRef.current, reading)
        : reading;
      updateSensorTarget();
    });

    let frameId = 0;
    let lastFrameAt = Date.now();
    const animate = () => {
      const now = Date.now();
      const elapsed = Math.min(50, Math.max(8, now - lastFrameAt));
      lastFrameAt = now;

      const target = sensorTargetRef.current;
      const current = displayPointingRef.current;
      if (target && current) {
        const azimuthDistance = Math.abs(shortestAngleDelta(current.azimuthDegrees, target.azimuthDegrees));
        const altitudeDistance = Math.abs(current.altitudeDegrees - target.altitudeDegrees);
        const rollDistance = Math.abs(shortestAngleDelta(current.rollDegrees, target.rollDegrees));

        // A velocity-aware camera follower: larger deliberate turns catch up quickly, while
        // slow pans remain buttery. The factor is time-scaled so different frame rates feel alike.
        const largestDistance = Math.max(azimuthDistance, altitudeDistance, rollDistance);
        const baseFollow = largestDistance > 18 ? 0.42 : largestDistance > 7 ? 0.3 : largestDistance > 2 ? 0.2 : 0.13;
        const timeScaledFollow = 1 - Math.pow(1 - baseFollow, elapsed / 16.67);
        const next = interpolatePointing(current, target, timeScaledFollow);

        const changed =
          Math.abs(shortestAngleDelta(current.azimuthDegrees, next.azimuthDegrees)) >= DISPLAY_EPSILON_AZ ||
          Math.abs(current.altitudeDegrees - next.altitudeDegrees) >= DISPLAY_EPSILON_ALT ||
          Math.abs(shortestAngleDelta(current.rollDegrees, next.rollDegrees)) >= DISPLAY_EPSILON_ROLL;

        if (changed) {
          displayPointingRef.current = next;
          setState({ pointing: next, available: true });
        } else if (!phoneMovingRef.current) {
          // Snap the final sub-pixel remainder once still, then stop producing React updates.
          const remaining =
            azimuthDistance >= DISPLAY_EPSILON_AZ ||
            altitudeDistance >= DISPLAY_EPSILON_ALT ||
            rollDistance >= DISPLAY_EPSILON_ROLL;
          if (remaining) {
            displayPointingRef.current = target;
            setState({ pointing: target, available: true });
          }
        }
      }

      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);

    return () => {
      accelerometerSubscription.remove();
      gyroscopeSubscription.remove();
      magnetometerSubscription.remove();
      cancelAnimationFrame(frameId);
    };
  }, [updateMs, magneticDeclinationDegrees]);

  return state;
}
