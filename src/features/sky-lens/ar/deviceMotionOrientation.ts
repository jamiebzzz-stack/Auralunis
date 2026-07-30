// deviceMotionOrientation.ts — map iOS DeviceMotion attitude to a camera pointing.
//
// Pure math: no React, no expo-sensors, so the mapping is directly testable.
//
// WHY THIS EXISTS
// ---------------
// Sky Lens used to rebuild heading itself from raw Accelerometer + Gyroscope + Magnetometer
// samples. That hand-rolled fusion was the source of the circling and the sudden heading
// swings. iOS already runs a far better fusion in Core Motion, so we consume its output
// instead of competing with it.
//
// REFERENCE FRAME
// ---------------
// expo-sensors starts device-motion updates with CMAttitudeReferenceFrame
// .xMagneticNorthZVertical whenever it is available (SensorsUtils.swift), falling back to
// .xArbitraryCorrectedZVertical only on hardware without a magnetometer. So:
//
//   X axis -> magnetic north
//   Z axis -> vertical (up)
//   Y axis -> west       (right-handed: Y = Z x X = up x north)
//
// Attitude arrives as Euler angles in radians:
//   alpha = yaw   (rotation about Z)
//   beta  = pitch (rotation about X)
//   gamma = roll  (rotation about Y)
//
// IMPORTANT: on the arbitrary fallback frame the yaw origin is NOT north, so azimuth is
// relative rather than absolute. `isAbsoluteFrame` lets callers surface that.

import type { CameraPointing } from "./SkyLensProjection";

export interface DeviceMotionRotation {
  alpha: number; // yaw, radians
  beta: number; // pitch, radians
  gamma: number; // roll, radians
}

const RAD_TO_DEG = 180 / Math.PI;

const normalizeHeading = (degrees: number) => ((degrees % 360) + 360) % 360;
const clampAltitude = (degrees: number) => Math.max(-90, Math.min(90, degrees));

/**
 * Rotation matrix for CMAttitude Euler angles.
 *
 * Core Motion composes the device orientation as yaw about Z, then pitch about X, then roll
 * about Y. The returned matrix R maps a vector expressed in the REFERENCE frame into the
 * DEVICE frame, so the transpose takes a device-frame vector back out into the world.
 */
function attitudeMatrix(alpha: number, beta: number, gamma: number): number[][] {
  const cA = Math.cos(alpha);
  const sA = Math.sin(alpha);
  const cB = Math.cos(beta);
  const sB = Math.sin(beta);
  const cG = Math.cos(gamma);
  const sG = Math.sin(gamma);

  // R = Rz(alpha) * Rx(beta) * Ry(gamma)
  return [
    [cA * cG - sA * sB * sG, -sA * cB, cA * sG + sA * sB * cG],
    [sA * cG + cA * sB * sG, cA * cB, sA * sG - cA * sB * cG],
    [-cB * sG, sB, cB * cG]
  ];
}

/**
 * Multiply `m` by column vector `v` — device frame -> world frame.
 *
 * Verified empirically rather than assumed: with the transpose, sweeping yaw left azimuth
 * pinned (yaw leaked into roll instead). Applied directly, azimuth tracks yaw one-for-one.
 */
function apply(m: number[][], v: [number, number, number]): [number, number, number] {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
  ];
}

/** True when every component of the rotation is a finite number. */
export function isUsableRotation(rotation: Partial<DeviceMotionRotation> | null | undefined): boolean {
  if (!rotation) return false;
  return (
    Number.isFinite(rotation.alpha) &&
    Number.isFinite(rotation.beta) &&
    Number.isFinite(rotation.gamma)
  );
}

/**
 * Convert a DeviceMotion attitude into the back camera's pointing direction.
 *
 * The device frame is x = right, y = top, z = out of the screen toward the user, so the back
 * camera looks along -z. That axis is rotated out into the world frame and read off as
 * compass azimuth (clockwise from north) and altitude above the horizon. Roll is the twist of
 * the device's "top" axis about the camera axis, so the sky rotates with the handset.
 */
export function pointingFromDeviceMotion(rotation: DeviceMotionRotation): CameraPointing {
  const m = attitudeMatrix(rotation.alpha, rotation.beta, rotation.gamma);

  // Back camera axis and device "top" axis, expressed in the world frame.
  const [camNorth, camWest, camUp] = apply(m, [0, 0, -1]);
  const [topNorth, topWest, topUp] = apply(m, [0, 1, 0]);

  // World frame is (north, west, up); compass east is -west.
  const azimuth = normalizeHeading(Math.atan2(-camWest, camNorth) * RAD_TO_DEG);
  const altitude = clampAltitude(Math.asin(Math.max(-1, Math.min(1, camUp))) * RAD_TO_DEG);

  // Roll: angle between the device's top axis and world "up", measured in the plane
  // perpendicular to the camera axis. Zero means the handset is upright.
  const cam: [number, number, number] = [camNorth, camWest, camUp];
  const worldUp: [number, number, number] = [0, 0, 1];
  // Screen-up reference = component of world up perpendicular to the camera axis.
  const dotUpCam = worldUp[0] * cam[0] + worldUp[1] * cam[1] + worldUp[2] * cam[2];
  const refN = worldUp[0] - dotUpCam * cam[0];
  const refW = worldUp[1] - dotUpCam * cam[1];
  const refU = worldUp[2] - dotUpCam * cam[2];
  const refLen = Math.hypot(refN, refW, refU);

  let roll = 0;
  if (refLen > 1e-6) {
    const rN = refN / refLen;
    const rW = refW / refLen;
    const rU = refU / refLen;
    // Right-handed side axis = cam x reference.
    const sN = cam[1] * rU - cam[2] * rW;
    const sW = cam[2] * rN - cam[0] * rU;
    const sU = cam[0] * rW - cam[1] * rN;
    const alongRef = topNorth * rN + topWest * rW + topUp * rU;
    const alongSide = topNorth * sN + topWest * sW + topUp * sU;
    roll = Math.atan2(alongSide, alongRef) * RAD_TO_DEG;
  }

  return {
    azimuthDegrees: azimuth,
    altitudeDegrees: altitude,
    rollDegrees: normalizeHeading(roll)
  };
}
