// orientationQuaternion.ts — singularity-free camera orientation for Sky Lens.
//
// Pure math: no React, no expo-sensors, so every rule here is directly testable.
//
// WHY QUATERNIONS
// ---------------
// Device data confirmed that the Rz*Rx*Ry device-to-world convention is correct, and that
// the remaining circling is Euler DEGENERACY, not a sensor or convention problem. Measured
// on a real handset over 165 samples:
//
//   camera altitude -90..0 deg  ->  median azimuth change 1.5 deg per sample
//   camera altitude  85..90 deg ->  median azimuth change 45.8 deg, max 166.2 deg
//
// and in every large jump the roll moved by almost exactly the same amount as the azimuth
// (166.2/169.3, 144.8/139.1, 96.5/96.0). That is the signature of gimbal degeneracy: the
// physical rotation is small and real, but the split between azimuth and roll is arbitrary
// when the camera points near the zenith — which is exactly where Sky Lens is used.
//
// No amount of smoothing fixes that, because the representation itself is degenerate. So the
// orientation is carried as a quaternion end-to-end and the projection consumes it directly.
// Azimuth/altitude/roll are retained only for diagnostics and UI readouts, never as the
// source of camera motion.
//
// FRAMES
// ------
// Core Motion's reference frame (xMagneticNorthZVertical) is X = magnetic north, Y = west,
// Z = up. The projection works in ENU, so world vectors are converted on the way out:
// east = -west, north = north, up = up.

export interface Quaternion {
  w: number;
  x: number;
  y: number;
  z: number;
}

export interface Vec3ENU {
  e: number;
  n: number;
  u: number;
}

export interface CameraBasis {
  /** Where the back camera looks. */
  forward: Vec3ENU;
  /** Device +x (screen right). */
  right: Vec3ENU;
  /** Device +y (screen top). */
  up: Vec3ENU;
}

export const IDENTITY_QUATERNION: Quaternion = { w: 1, x: 0, y: 0, z: 0 };

/** Every component finite and the quaternion has usable magnitude. */
export function isValidQuaternion(q: Quaternion | null | undefined): boolean {
  if (!q) return false;
  if (![q.w, q.x, q.y, q.z].every((v) => Number.isFinite(v))) return false;
  return Math.hypot(q.w, q.x, q.y, q.z) > 1e-6;
}

/** Unit-length quaternion. Invalid input degrades to identity rather than poisoning the scene. */
export function normalizeQuaternion(q: Quaternion): Quaternion {
  if (!isValidQuaternion(q)) return { ...IDENTITY_QUATERNION };
  const length = Math.hypot(q.w, q.x, q.y, q.z);
  return { w: q.w / length, x: q.x / length, y: q.y / length, z: q.z / length };
}

/** Hamilton product: the rotation `b` followed by the rotation `a`. */
export function multiplyQuaternions(a: Quaternion, b: Quaternion): Quaternion {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w
  };
}

/** Rotation of `angleRadians` about a unit axis. */
export function quaternionFromAxisAngle(
  axis: { x: number; y: number; z: number },
  angleRadians: number
): Quaternion {
  const length = Math.hypot(axis.x, axis.y, axis.z);
  if (!(length > 1e-9) || !Number.isFinite(angleRadians)) return { ...IDENTITY_QUATERNION };
  const half = angleRadians / 2;
  const s = Math.sin(half) / length;
  return { w: Math.cos(half), x: axis.x * s, y: axis.y * s, z: axis.z * s };
}

/**
 * Quaternion for a DeviceMotion attitude, composing the SAME rotation the device data
 * confirmed: R = Rz(alpha) * Rx(beta) * Ry(gamma), mapping device -> world.
 *
 * Composed directly from the three axis rotations, so there is no matrix round-trip and no
 * place for an Euler singularity to enter.
 */
export function quaternionFromDeviceMotion(
  alpha: number,
  beta: number,
  gamma: number
): Quaternion {
  if (![alpha, beta, gamma].every((v) => Number.isFinite(v))) return { ...IDENTITY_QUATERNION };
  const qz = quaternionFromAxisAngle({ x: 0, y: 0, z: 1 }, alpha);
  const qx = quaternionFromAxisAngle({ x: 1, y: 0, z: 0 }, beta);
  const qy = quaternionFromAxisAngle({ x: 0, y: 1, z: 0 }, gamma);
  return normalizeQuaternion(multiplyQuaternions(multiplyQuaternions(qz, qx), qy));
}

/** Dot product — the cosine of half the angle between two orientations. */
export function dotQuaternions(a: Quaternion, b: Quaternion): number {
  return a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z;
}

/** Angle between two orientations, in degrees (0..180). */
export function angleBetweenQuaternions(a: Quaternion, b: Quaternion): number {
  const d = Math.min(1, Math.abs(dotQuaternions(normalizeQuaternion(a), normalizeQuaternion(b))));
  return (2 * Math.acos(d) * 180) / Math.PI;
}

/**
 * Spherical linear interpolation along the SHORTEST arc.
 *
 * q and -q describe the same orientation, so when the dot product is negative one input is
 * negated first — otherwise the interpolation takes the long way round and the sky spins
 * through nearly a full turn. This replaces per-angle smoothing entirely: one whole
 * orientation is smoothed, never azimuth/altitude/roll independently.
 */
export function slerp(from: Quaternion, to: Quaternion, t: number): Quaternion {
  if (!isValidQuaternion(from)) return normalizeQuaternion(to);
  if (!isValidQuaternion(to)) return normalizeQuaternion(from);
  const factor = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0;

  const a = normalizeQuaternion(from);
  let b = normalizeQuaternion(to);
  let cos = dotQuaternions(a, b);

  // Shortest arc.
  if (cos < 0) {
    b = { w: -b.w, x: -b.x, y: -b.y, z: -b.z };
    cos = -cos;
  }

  // Nearly parallel: linear blend avoids dividing by a vanishing sine.
  if (cos > 0.9995) {
    return normalizeQuaternion({
      w: a.w + (b.w - a.w) * factor,
      x: a.x + (b.x - a.x) * factor,
      y: a.y + (b.y - a.y) * factor,
      z: a.z + (b.z - a.z) * factor
    });
  }

  const theta = Math.acos(Math.min(1, Math.max(-1, cos)));
  const sinTheta = Math.sin(theta);
  const wA = Math.sin((1 - factor) * theta) / sinTheta;
  const wB = Math.sin(factor * theta) / sinTheta;
  return normalizeQuaternion({
    w: a.w * wA + b.w * wB,
    x: a.x * wA + b.x * wB,
    y: a.y * wA + b.y * wB,
    z: a.z * wA + b.z * wB
  });
}

/** Rotate a device-frame vector into the Core Motion world frame (north, west, up). */
function rotateToWorld(
  q: Quaternion,
  v: { x: number; y: number; z: number }
): { north: number; west: number; up: number } {
  // t = 2 * (q_vec x v); v' = v + q.w * t + q_vec x t
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    north: v.x + q.w * tx + (q.y * tz - q.z * ty),
    west: v.y + q.w * ty + (q.z * tx - q.x * tz),
    up: v.z + q.w * tz + (q.x * ty - q.y * tx)
  };
}

/** Convert a Core Motion world vector (north, west, up) into ENU. */
function toENU(v: { north: number; west: number; up: number }): Vec3ENU {
  return { e: -v.west, n: v.north, u: v.up };
}

/**
 * The camera basis in ENU for an orientation.
 *
 * Device frame is x = right, y = top, z = out of the screen, so the back camera looks along
 * -z. Returning the whole basis is what removes the zenith problem: the projection never has
 * to reconstruct a "right" vector from an azimuth that is undefined when pointing straight up.
 */
export function cameraBasisFromQuaternion(orientation: Quaternion): CameraBasis {
  const q = normalizeQuaternion(orientation);
  return {
    forward: toENU(rotateToWorld(q, { x: 0, y: 0, z: -1 })),
    right: toENU(rotateToWorld(q, { x: 1, y: 0, z: 0 })),
    up: toENU(rotateToWorld(q, { x: 0, y: 1, z: 0 }))
  };
}

/**
 * Compose a user drag offset onto a frozen orientation.
 *
 * Yaw is applied about world up and pitch about the camera's own right axis, so dragging
 * behaves the same wherever the camera is pointing — including at the zenith, where an
 * azimuth-based pan would be undefined.
 */
export function composeDragOffset(
  base: Quaternion,
  yawDegrees: number,
  pitchDegrees: number
): Quaternion {
  const safeYaw = Number.isFinite(yawDegrees) ? yawDegrees : 0;
  const safePitch = Number.isFinite(pitchDegrees) ? pitchDegrees : 0;
  const toRad = Math.PI / 180;

  // World up in the device-independent reference frame is +Z.
  const yaw = quaternionFromAxisAngle({ x: 0, y: 0, z: 1 }, safeYaw * toRad);
  // Pitch about the device's own right axis (device +x) keeps the horizon level.
  const pitch = quaternionFromAxisAngle({ x: 1, y: 0, z: 0 }, safePitch * toRad);
  return normalizeQuaternion(multiplyQuaternions(multiplyQuaternions(yaw, base), pitch));
}

/**
 * Orientation whose camera looks at a given sky direction with a given roll.
 *
 * Used by "Find It" style guidance and by tests that need the camera centred on a target.
 * Built from an explicit basis rather than Euler angles, so it is well-defined at the zenith.
 */
export function quaternionLookingAt(
  azimuthDegrees: number,
  altitudeDegrees: number,
  rollDegrees: number = 0
): Quaternion {
  const toRad = Math.PI / 180;
  const az = azimuthDegrees * toRad;
  const alt = altitudeDegrees * toRad;
  const ca = Math.cos(alt);
  // Camera forward in the Core Motion world frame (north, west, up).
  const fN = ca * Math.cos(az);
  const fW = -ca * Math.sin(az); // west = -east
  const fU = Math.sin(alt);

  // Screen right = forward x worldUp, normalized (degenerate only exactly at the pole, where
  // any right vector is valid — fall back to world north).
  let rN = fW * 1 - fU * 0;
  let rW = fU * 0 - fN * 1;
  let rU = fN * 0 - fW * 0;
  let rLen = Math.hypot(rN, rW, rU);
  if (!(rLen > 1e-9)) {
    rN = 1;
    rW = 0;
    rU = 0;
    rLen = 1;
  }
  rN /= rLen;
  rW /= rLen;
  rU /= rLen;

  // Screen up = right x forward.
  const uN = rW * fU - rU * fW;
  const uW = rU * fN - rN * fU;
  const uU = rN * fW - rW * fN;

  // Rotation matrix columns are the world-frame images of the device axes:
  // device x -> right, device y -> up, device z -> -forward.
  const m = [
    [rN, uN, -fN],
    [rW, uW, -fW],
    [rU, uU, -fU]
  ];

  // Matrix -> quaternion (Shepperd's method, numerically stable branch selection).
  const trace = m[0][0] + m[1][1] + m[2][2];
  let q: Quaternion;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    q = {
      w: s / 4,
      x: (m[2][1] - m[1][2]) / s,
      y: (m[0][2] - m[2][0]) / s,
      z: (m[1][0] - m[0][1]) / s
    };
  } else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
    const s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2;
    q = { w: (m[2][1] - m[1][2]) / s, x: s / 4, y: (m[0][1] + m[1][0]) / s, z: (m[0][2] + m[2][0]) / s };
  } else if (m[1][1] > m[2][2]) {
    const s = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2;
    q = { w: (m[0][2] - m[2][0]) / s, x: (m[0][1] + m[1][0]) / s, y: s / 4, z: (m[1][2] + m[2][1]) / s };
  } else {
    const s = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2;
    q = { w: (m[1][0] - m[0][1]) / s, x: (m[0][2] + m[2][0]) / s, y: (m[1][2] + m[2][1]) / s, z: s / 4 };
  }

  const base = normalizeQuaternion(q);
  if (!rollDegrees) return base;
  // Roll is about the device's own z axis, so post-multiply.
  return normalizeQuaternion(
    multiplyQuaternions(base, quaternionFromAxisAngle({ x: 0, y: 0, z: 1 }, rollDegrees * toRad))
  );
}

/**
 * Diagnostics/UI ONLY — azimuth, altitude and roll read off an orientation.
 *
 * Never feed this back into the camera path. It is exactly the degenerate representation the
 * quaternion pipeline exists to avoid; it is safe only for display.
 */
export function eulerReadoutFromQuaternion(orientation: Quaternion): {
  azimuthDegrees: number;
  altitudeDegrees: number;
} {
  const { forward } = cameraBasisFromQuaternion(orientation);
  const azimuth = ((Math.atan2(forward.e, forward.n) * 180) / Math.PI + 360) % 360;
  const altitude = (Math.asin(Math.max(-1, Math.min(1, forward.u))) * 180) / Math.PI;
  return { azimuthDegrees: azimuth, altitudeDegrees: altitude };
}
