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
  rollDegrees: 0
};

const STATIONARY_LOCK_DELAY_MS = 650;
const STATIONARY_RELEASE_AZIMUTH = 1.8;
const STATIONARY_RELEASE_ALTITUDE = 1.1;
const STATIONARY_RELEASE_ROLL = 1.6;

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
  const follow = magnitude > 8 ? 0.72 : magnitude > 3 ? 0.48 : gentleFollow;
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

  // Keep raw sensor samples out of React state. A magnetometer frame publishes one coordinated
  // pointing update using the latest acceleration instead of rebuilding the sky twice.
  const accelerometerRef = useRef<Vec3>({ x: 0, y: 0, z: 1 });
  const magnetometerRef = useRef<Vec3 | null>(null);
  const stablePointingRef = useRef<CameraPointing | null>(null);
  const lastPublishedRef = useRef<CameraPointing | null>(null);
  const stationaryAnchorRef = useRef<CameraPointing | null>(null);
  const lastPublishedMotionAtRef = useRef(Date.now());
  const alphaRef = useRef(smoothingAlpha);
  alphaRef.current = smoothingAlpha;

  useEffect(() => {
    Sensors.Accelerometer.setUpdateInterval(updateMs);
    Sensors.Magnetometer.setUpdateInterval(updateMs);

    const ema = (previous: Vec3, next: SensorReading): Vec3 => {
      // Preserve the App Store build's conservative low-pass ceiling.
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

      const previous = stablePointingRef.current;
      const stable: CameraPointing = previous
        ? {
            azimuthDegrees: normalizeHeading(
              stabilizeAngle(previous.azimuthDegrees, raw.azimuthDegrees, 0.55, 0.24)
            ),
            altitudeDegrees: clampAltitude(
              stabilizeAngle(previous.altitudeDegrees, raw.altitudeDegrees, 0.4, 0.22)
            ),
            rollDegrees: normalizeHeading(
              stabilizeAngle(previous.rollDegrees, raw.rollDegrees, 0.65, 0.2)
            )
          }
        : raw;

      stablePointingRef.current = stable;
      const last = lastPublishedRef.current;
      if (!last) {
        lastPublishedRef.current = stable;
        lastPublishedMotionAtRef.current = Date.now();
        setState({ pointing: stable, available: true });
        return;
      }

      const now = Date.now();
      const azimuthDelta = Math.abs(shortestAngleDelta(last.azimuthDegrees, stable.azimuthDegrees));
      const altitudeDelta = Math.abs(last.altitudeDegrees - stable.altitudeDegrees);
      const rollDelta = Math.abs(shortestAngleDelta(last.rollDegrees, stable.rollDegrees));

      const anchor = stationaryAnchorRef.current;
      if (anchor) {
        const anchorAzimuthDelta = Math.abs(shortestAngleDelta(anchor.azimuthDegrees, stable.azimuthDegrees));
        const anchorAltitudeDelta = Math.abs(anchor.altitudeDegrees - stable.altitudeDegrees);
        const anchorRollDelta = Math.abs(shortestAngleDelta(anchor.rollDegrees, stable.rollDegrees));

        if (
          anchorAzimuthDelta < STATIONARY_RELEASE_AZIMUTH &&
          anchorAltitudeDelta < STATIONARY_RELEASE_ALTITUDE &&
          anchorRollDelta < STATIONARY_RELEASE_ROLL
        ) {
          // Hold the exact rendered frame while the phone is physically still.
          return;
        }

        // Movement has clearly exceeded the stationary window; resume immediately.
        stationaryAnchorRef.current = null;
        lastPublishedMotionAtRef.current = now;
      }

      // Ignore sub-pixel sensor noise so the large SVG scene is not invalidated needlessly.
      const changed =
        azimuthDelta >= 0.45 ||
        altitudeDelta >= 0.3 ||
        rollDelta >= 0.5;

      if (!changed) {
        if (
          !stationaryAnchorRef.current &&
          now - lastPublishedMotionAtRef.current >= STATIONARY_LOCK_DELAY_MS
        ) {
          stationaryAnchorRef.current = last;
        }
        return;
      }

      lastPublishedMotionAtRef.current = now;
      stationaryAnchorRef.current = null;
      lastPublishedRef.current = stable;
      setState({ pointing: stable, available: true });
    };

    const accelerometerSubscription = Sensors.Accelerometer.addListener((reading) => {
      accelerometerRef.current = ema(accelerometerRef.current, reading);
    });

    const magnetometerSubscription = Sensors.Magnetometer.addListener((reading) => {
      magnetometerRef.current = magnetometerRef.current
        ? ema(magnetometerRef.current, reading)
        : reading;
      publishPointing();
    });

    return () => {
      accelerometerSubscription.remove();
      magnetometerSubscription.remove();
    };
  }, [updateMs, magneticDeclinationDegrees]);

  return state;
}
