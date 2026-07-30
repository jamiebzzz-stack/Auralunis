import { useEffect, useRef, useState } from "react";
import { Accelerometer, Gyroscope, Magnetometer } from "expo-sensors";
import { pointingFromSensors, headingConditioning, type Vec3 } from "./SkyLensOrientation";
import type { CameraPointing } from "./SkyLensProjection";
// Follow-factor math lives in a pure module (no React / no expo-sensors) so the shipping
// values are directly assertable by the Sky Lens self-test.
import { resolveFollowFactors } from "./pointingFollow";
// Heading fusion: gyro for short-term motion, magnetometer as a slow bounded correction.
import { correctHeading, gyroHeadingDelta, normalizeHeading as normalizeFused } from "./orientationFusion";

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
  /**
   * Current zoom level (1 = default field of view). Higher zoom damps the follow factor
   * further — see zoomDampingMultiplier. This replaces a previous `_smoothingAlpha`
   * parameter that callers passed but the hook never read.
   */
  zoomLevel = 1
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
  // Zoom is read through a ref so changing it damps the NEXT sample without tearing down
  // and re-subscribing the sensor listeners (which would drop the stillness state).
  const zoomRef = useRef(zoomLevel);
  zoomRef.current = zoomLevel;
  // Fused heading. Seeded once from the magnetometer, then driven by gyro motion and only
  // nudged back toward magnetic north within bounds — never recomputed absolutely.
  const fusedHeadingRef = useRef<number | null>(null);
  const gyroSpeedRef = useRef(0);
  // Cumulative magnetic trim relative to the gyro-integrated heading, held inside the
  // +/-MAX_TOTAL_TRIM_DEGREES envelope so the magnetometer can never redefine north.
  const magneticTrimRef = useRef(0);
  const lastGyroAtRef = useRef(0);

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
      gyroSpeedRef.current = speed;

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

      // Integrate yaw ONLY while gyro-confirmed movement is in progress. A frozen scene
      // stays frozen: no integration, so no creep from bias while the phone rests.
      const previousAt = lastGyroAtRef.current;
      lastGyroAtRef.current = now;
      if (!movingRef.current || !previousAt || fusedHeadingRef.current === null) return;
      const dt = Math.min(0.25, (now - previousAt) / 1000);
      if (dt <= 0) return;
      fusedHeadingRef.current = normalizeFused(
        fusedHeadingRef.current + gyroHeadingDelta(reading, accelerometerRef.current, dt)
      );
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
      // Tilt comes straight from gravity — unambiguous and low-noise, no fusion needed.
      // Heading does NOT: it is the fused value, nudged toward the magnetometer within
      // strict bounds rather than recomputed from scratch on every sample.
      const measuredHeading = normalizeHeading(measured.azimuthDegrees);
      const conditioning = headingConditioning(accelerometerRef.current, magnetometer);
      let correctionReason = "seed";
      let correctionApplied = 0;
      if (fusedHeadingRef.current === null) {
        fusedHeadingRef.current = measuredHeading;
      } else {
        const correction = correctHeading({
          currentHeading: fusedHeadingRef.current,
          measuredHeading,
          conditioning,
          gyroSpeed: gyroSpeedRef.current,
          isMoving: movingRef.current,
          currentTrim: magneticTrimRef.current
        });
        fusedHeadingRef.current = correction.heading;
        magneticTrimRef.current = correction.trim;
        correctionReason = correction.reason;
        correctionApplied = correction.appliedDegrees;
      }


      const raw: CameraPointing = {
        azimuthDegrees: fusedHeadingRef.current,
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

      // One bounded update per sensor sample — a fraction of the remaining distance, never
      // more. The scene trails the hand deliberately, and zoom damps it further still.
      const largestDelta = Math.max(azimuthDelta, altitudeDelta, rollDelta);
      const { follow, roll } = resolveFollowFactors(largestDelta, zoomRef.current);
      const next: CameraPointing = {
        azimuthDegrees: followCircular(previous.azimuthDegrees, raw.azimuthDegrees, follow),
        altitudeDegrees: clampAltitude(followLinear(previous.altitudeDegrees, raw.altitudeDegrees, follow)),
        rollDegrees: followCircular(previous.rollDegrees, raw.rollDegrees, roll)
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
