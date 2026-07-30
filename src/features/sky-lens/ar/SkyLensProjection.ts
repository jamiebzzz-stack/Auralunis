// Pure AR projection. Maps a celestial target's (azimuth, altitude) onto screen
// coordinates given where the camera is pointing, its field of view, and the
// overlay box size. No React Native imports, so it is unit-testable in plain Node.
//
// Convention: azimuth = degrees from true north, increasing clockwise
// (E = 90, S = 180, W = 270). altitude = degrees above the horizon.
// Screen: x increases right, y increases down, origin at top-left of the box.

export interface CameraPointing {
  azimuthDegrees: number; // compass direction the back camera points
  altitudeDegrees: number; // tilt of the camera above the horizon
  rollDegrees: number; // rotation about the optical axis
}

/** Camera basis in ENU, resolved from an orientation quaternion. */
export interface CameraBasis {
  forward: { e: number; n: number; u: number };
  right: { e: number; n: number; u: number };
  up: { e: number; n: number; u: number };
}

export interface CameraFov {
  horizontalDegrees: number;
  verticalDegrees: number;
}

export interface OverlayBox {
  width: number;
  height: number;
}

export interface ProjectedTarget {
  x: number;
  y: number;
  onScreen: boolean;
  behind: boolean;
  bearingDegrees: number; // direction from box center toward the target (for guidance arrows)
}

// Reasonable starting FOV for a phone back camera; tune per device on-site.
export const DEFAULT_FOV: CameraFov = { horizontalDegrees: 60, verticalDegrees: 45 };

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Half of the EFFECTIVE vertical field of view, derived from the horizontal FOV and the real
 * viewport aspect so both axes share one degrees-to-pixels scale.
 *
 * A tall phone therefore sees MORE sky vertically than horizontally, which is what an
 * undistorted window onto the sky must do. Deriving it (rather than using an independent
 * fov.verticalDegrees) is what keeps constellation geometry rigid.
 */
export function effectiveVerticalHalfFov(fov: CameraFov, box: OverlayBox): number {
  const halfH = fov.horizontalDegrees / 2;
  if (!(box.width > 0) || !(halfH > 0)) return fov.verticalDegrees / 2;
  const pixelsPerDegree = box.width / 2 / halfH;
  return box.height / 2 / pixelsPerDegree;
}

/** Full effective vertical field of view in degrees. */
export function effectiveVerticalFov(fov: CameraFov, box: OverlayBox): number {
  return effectiveVerticalHalfFov(fov, box) * 2;
}

// ── Full-dome camera projection ───────────────────────────────────────────────
// Everything is done with unit vectors in East-North-Up (ENU) coordinates, so the
// projection is correct in EVERY direction — including straight up at the zenith,
// where the old "behind = |Δazimuth| > 90" test created dead zones (azimuth is
// degenerate near vertical). `behind` is now the true hemisphere test (the target
// is behind the camera only when it's more than 90° off the optical axis).
type Vec = { e: number; n: number; u: number };

function azAltToVec(azDeg: number, altDeg: number): Vec {
  const az = toRad(azDeg);
  const alt = toRad(altDeg);
  const ca = Math.cos(alt);
  return { e: ca * Math.sin(az), n: ca * Math.cos(az), u: Math.sin(alt) };
}

function dot(a: Vec, b: Vec): number {
  return a.e * b.e + a.n * b.n + a.u * b.u;
}

function cross(a: Vec, b: Vec): Vec {
  return {
    e: a.n * b.u - a.u * b.n,
    n: a.u * b.e - a.e * b.u,
    u: a.e * b.n - a.n * b.e
  };
}

/**
 * Project a sky target using a CAMERA BASIS rather than azimuth/altitude/roll.
 *
 * This is the singularity-free path. `projectTarget` below reconstructs the camera's "right"
 * vector from the pointing azimuth, which is undefined when the camera looks straight up —
 * on a real handset that produced median azimuth swings of 45.8 deg per sample above 85 deg
 * elevation, with roll swinging by an almost identical amount (the classic gimbal signature).
 *
 * Here the basis arrives already resolved from the orientation quaternion, so nothing is ever
 * reconstructed from an angle and the zenith is an ordinary direction like any other.
 *
 * The screen mapping is identical to `projectTarget`: ONE shared degrees-to-pixels scale for
 * both axes (the isotropic fix), so constellation geometry stays rigid.
 */
export function projectTargetWithBasis(
  basis: CameraBasis,
  targetAzimuthDegrees: number,
  targetAltitudeDegrees: number,
  fov: CameraFov = DEFAULT_FOV,
  box: OverlayBox
): ProjectedTarget {
  const forward: Vec = { e: basis.forward.e, n: basis.forward.n, u: basis.forward.u };
  const right: Vec = { e: basis.right.e, n: basis.right.n, u: basis.right.u };
  // Screen "up" is the device top axis. Negated nowhere: y is flipped at the pixel step.
  const up: Vec = { e: basis.up.e, n: basis.up.n, u: basis.up.u };

  const target = azAltToVec(targetAzimuthDegrees, targetAltitudeDegrees);
  const depth = dot(target, forward);
  const behind = depth <= 0.0001;

  const hAngle = (Math.atan2(dot(target, right), depth) * 180) / Math.PI;
  const vAngle = (Math.atan2(dot(target, up), depth) * 180) / Math.PI;

  const halfH = fov.horizontalDegrees / 2;
  const pixelsPerDegree = box.width / 2 / halfH;
  const halfVEffective = effectiveVerticalHalfFov(fov, box);

  const x = box.width / 2 + hAngle * pixelsPerDegree;
  const y = box.height / 2 - vAngle * pixelsPerDegree;

  const onScreen = !behind && Math.abs(hAngle) <= halfH && Math.abs(vAngle) <= halfVEffective;
  const bearingDegrees = (Math.atan2(y - box.height / 2, x - box.width / 2) * 180) / Math.PI;

  return { x, y, onScreen, behind, bearingDegrees: (bearingDegrees + 360) % 360 };
}

export function projectTarget(
  pointing: CameraPointing,
  targetAzimuthDegrees: number,
  targetAltitudeDegrees: number,
  fov: CameraFov = DEFAULT_FOV,
  box: OverlayBox
): ProjectedTarget {
  // Camera basis: forward (where we point), right (horizontal, az+90 — always
  // well-defined even at the zenith), and up (= right × forward).
  const forward = azAltToVec(pointing.azimuthDegrees, pointing.altitudeDegrees);
  const right = azAltToVec(pointing.azimuthDegrees + 90, 0);
  const up = cross(right, forward);

  const target = azAltToVec(targetAzimuthDegrees, targetAltitudeDegrees);
  const depth = dot(target, forward); // cos(angle from optical axis)
  const behind = depth <= 0.0001;

  // Angles to the right of / above the optical axis (radians → degrees).
  const hAngle = (Math.atan2(dot(target, right), depth) * 180) / Math.PI;
  const vAngle = (Math.atan2(dot(target, up), depth) * 180) / Math.PI;

  // Apply camera roll so the overlay rotates with the device.
  const roll = toRad(pointing.rollDegrees);
  const hRot = hAngle * Math.cos(roll) + vAngle * Math.sin(roll);
  const vRot = -hAngle * Math.sin(roll) + vAngle * Math.cos(roll);

  const halfH = fov.horizontalDegrees / 2;

  // ONE angular scale for BOTH axes.
  //
  // This previously divided the horizontal angle by the horizontal FOV and the vertical
  // angle by the vertical FOV, then stretched each across its own screen dimension. With
  // DEFAULT_FOV 60x45 (aspect 1.33) on a 430x932 viewport (aspect 0.46) that made a degree
  // worth 2.86x more pixels vertically than horizontally, so any pattern that rotated on
  // screen genuinely sheared — the Big Dipper and Leo visibly changed proportions as the
  // phone turned. Sharing a single degrees-to-pixels scale makes the mapping conformal, so
  // a rigid sky pattern stays rigid under pan, roll and zoom.
  //
  // The vertical field of view is therefore DERIVED from the horizontal FOV and the real
  // viewport aspect rather than taken from fov.verticalDegrees, which is retained on the
  // type for compatibility but no longer drives scale.
  const pixelsPerDegree = box.width / 2 / halfH;
  const halfVEffective = effectiveVerticalHalfFov(fov, box);

  const x = box.width / 2 + hRot * pixelsPerDegree;
  const y = box.height / 2 - vRot * pixelsPerDegree;

  const onScreen = !behind && Math.abs(hRot) <= halfH && Math.abs(vRot) <= halfVEffective;
  const bearingDegrees =
    (Math.atan2(y - box.height / 2, x - box.width / 2) * 180) / Math.PI;

  return {
    x,
    y,
    onScreen,
    behind,
    bearingDegrees: (bearingDegrees + 360) % 360
  };
}
