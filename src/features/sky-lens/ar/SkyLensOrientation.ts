// Pure orientation math. Converts raw accelerometer + magnetometer vectors into
// the back camera's pointing direction (azimuth, altitude, roll). No React Native
// imports, so it is unit-testable in plain Node.
//
// Device frame: x = right, y = top, z = out of the screen toward the user.
// The back camera therefore points along -z.
// Accelerometer at rest reads the "up" direction (reaction to gravity).

import type { CameraPointing } from "./SkyLensProjection";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function scale(a: Vec3, k: number): Vec3 {
  return { x: a.x * k, y: a.y * k, z: a.z * k };
}
function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}
function norm(a: Vec3): Vec3 {
  const length = Math.sqrt(dot(a, a)) || 1;
  return scale(a, 1 / length);
}
const toDeg = (radians: number) => (radians * 180) / Math.PI;

const CAMERA_AXIS: Vec3 = { x: 0, y: 0, z: -1 };

// Magnetic-to-true-north correction (positive east). Default 0; set per-region
// or from a magnetic model during outdoor calibration.
export function pointingFromSensors(
  accelerometer: Vec3,
  magnetometer: Vec3,
  magneticDeclinationDegrees = 0
): CameraPointing {
  const up = norm(accelerometer);

  // Horizontal projection of the magnetic field points to magnetic north.
  const north = norm(sub(magnetometer, scale(up, dot(magnetometer, up))));
  const east = norm(cross(north, up));

  // Camera direction resolved onto the world east/north/up basis.
  const camEast = dot(CAMERA_AXIS, east);
  const camNorth = dot(CAMERA_AXIS, north);
  const camUp = Math.max(-1, Math.min(1, dot(CAMERA_AXIS, up)));

  const azimuth = (toDeg(Math.atan2(camEast, camNorth)) + magneticDeclinationDegrees + 360) % 360;
  const altitude = toDeg(Math.asin(camUp));
  const roll = toDeg(Math.atan2(accelerometer.x, accelerometer.y));

  return { azimuthDegrees: azimuth, altitudeDegrees: altitude, rollDegrees: roll };
}

/**
 * How trustworthy the magnetometer-derived azimuth is for the current posture, 0..1.
 *
 * Azimuth comes from atan2(camEast, camNorth). Both arguments shrink together as the camera
 * axis approaches vertical, so the result becomes ill-conditioned exactly when the phone is
 * held up at the sky — a small field perturbation then swings heading by several degrees.
 * This returns the magnitude of the camera axis' horizontal component, which is that
 * conditioning: ~1 at the horizon, ~0 at the zenith. Callers gate magnetometer correction
 * on it (see MIN_HEADING_CONDITIONING in orientationFusion.ts).
 */
export function headingConditioning(accelerometer: Vec3, magnetometer: Vec3): number {
  const up = norm(accelerometer);
  const north = norm(sub(magnetometer, scale(up, dot(magnetometer, up))));
  const east = norm(cross(north, up));
  const camEast = dot(CAMERA_AXIS, east);
  const camNorth = dot(CAMERA_AXIS, north);
  const horizontal = Math.hypot(camEast, camNorth);
  return Number.isFinite(horizontal) ? Math.max(0, Math.min(1, horizontal)) : 0;
}
