// alignmentEngine.ts
// Pure alignment math for the Orbital Alignment screen.
// Takes the observer's GPS, device pointing, and a spatial target,
// returns angular diffs, a 0-100 score, and lock state.
// No React imports — fully unit-testable.

import type { ObserverLocation } from "@/features/sky-lens/accuracy/SkyLensAccuracyTypes";
import type { CameraPointing } from "@/features/sky-lens/ar/SkyLensProjection";

export interface SpatialTarget {
  id: string;
  name: string;
  latitudeDegrees: number;
  longitudeDegrees: number;
  altitudeKm: number;
  /** True when this object is in active orbital decay / reentry warning */
  decayAlert?: boolean;
  /** Orbital velocity in km/s — drops as orbit decays */
  velocityKms?: number;
}

export interface AlignmentResult {
  /** Bearing from observer to target, degrees from true north (0-360) */
  targetAzimuth: number;
  /** Signed elevation from observer to target, degrees (negative = below the horizon) */
  targetElevation: number;
  /** Signed azimuth diff: positive = target is to the right of device heading */
  azimuthDiff: number;
  /** Signed elevation diff: positive = target is above device pitch */
  elevationDiff: number;
  /** Combined angular error in degrees (always >= 0) */
  totalAngularError: number;
  /** 0-100 alignment score. 100 = perfect lock */
  alignmentScore: number;
  /** True when totalAngularError < LOCK_THRESHOLD_DEGREES */
  isLocked: boolean;
}

// Degrees of total angular error required for a full lock
const LOCK_THRESHOLD_DEGREES = 3.5;
// Score falls to 0 at this error (degrees)
const FALLOFF_DEGREES = 90;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Wrap a degree value to [-180, 180] */
function normalizeSigned(deg: number): number {
  return (((deg + 180) % 360) + 360) % 360 - 180;
}

/**
 * Compute the azimuth (bearing) and elevation from an observer on Earth's
 * surface to a target at a given lat/lon/altitude.
 *
 * Azimuth is the great-circle initial bearing. Elevation is the true geometric
 * look-angle derived from Earth-centered position vectors, so it accounts for
 * curvature and is SIGNED: a target below the observer's horizon returns a
 * negative angle (−90° for the antipode). Callers that only want visible objects
 * must filter on elevation themselves.
 */
export function computeAzimuthElevation(
  observer: ObserverLocation,
  target: SpatialTarget
): { azimuth: number; elevation: number } {
  const lat1 = toRad(observer.latitudeDegrees);
  const lat2 = toRad(target.latitudeDegrees);
  const dLon = toRad(target.longitudeDegrees - observer.longitudeDegrees);

  // Great-circle bearing
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const bearing = (toDeg(Math.atan2(y, x)) + 360) % 360;

  // Elevation from Earth-centered positions, so curvature is fully accounted for and the
  // result is SIGNED. The previous atan2(altitude, surfaceDistance) flat-plane form fed
  // two always-positive arguments into atan2 and then clamped with Math.max(0, …), so it
  // could never return a negative angle: a satellite whose sub-point was thousands of km
  // away — past the horizon, or on the opposite face of the planet — was still reported as
  // above the horizon, and the radar granted locks on it. It also mis-stated the angle for
  // genuinely visible passes (~5° off at 1000 km separation, worse near the horizon).
  const R = 6371;
  const lon1 = toRad(observer.longitudeDegrees);
  const lon2 = toRad(target.longitudeDegrees);
  const cosLat1 = Math.cos(lat1);
  const cosLat2 = Math.cos(lat2);

  const obsX = R * cosLat1 * Math.cos(lon1);
  const obsY = R * cosLat1 * Math.sin(lon1);
  const obsZ = R * Math.sin(lat1);

  const targetRadius = R + Math.max(0, target.altitudeKm);
  const tgtX = targetRadius * cosLat2 * Math.cos(lon2);
  const tgtY = targetRadius * cosLat2 * Math.sin(lon2);
  const tgtZ = targetRadius * Math.sin(lat2);

  // Range vector observer → target.
  const rangeX = tgtX - obsX;
  const rangeY = tgtY - obsY;
  const rangeZ = tgtZ - obsZ;
  const rangeKm = Math.hypot(rangeX, rangeY, rangeZ);

  // Degenerate: target sits on the observer. Report straight up rather than dividing by 0.
  if (!(rangeKm > 1e-6)) return { azimuth: bearing, elevation: 90 };

  // Observer's local vertical is the unit radial through their position.
  const sinElevation =
    (rangeX * obsX + rangeY * obsY + rangeZ * obsZ) / (rangeKm * R);
  const elevation = toDeg(Math.asin(Math.max(-1, Math.min(1, sinElevation))));

  return { azimuth: bearing, elevation };
}

export function calculateAlignment(
  observer: ObserverLocation,
  pointing: CameraPointing,
  target: SpatialTarget
): AlignmentResult {
  const { azimuth: targetAzimuth, elevation: targetElevation } =
    computeAzimuthElevation(observer, target);

  const azimuthDiff = normalizeSigned(targetAzimuth - pointing.azimuthDegrees);
  const elevationDiff = targetElevation - pointing.altitudeDegrees;

  const totalAngularError = Math.sqrt(
    azimuthDiff ** 2 + elevationDiff ** 2
  );

  // Score: 100 at 0 error, falls linearly to 0 at FALLOFF_DEGREES
  const alignmentScore = Math.round(
    Math.max(0, 100 * (1 - totalAngularError / FALLOFF_DEGREES))
  );

  const isLocked = totalAngularError < LOCK_THRESHOLD_DEGREES;

  return {
    targetAzimuth: Math.round(targetAzimuth),
    targetElevation: Math.round(targetElevation * 10) / 10,
    azimuthDiff,
    elevationDiff,
    totalAngularError,
    alignmentScore,
    isLocked,
  };
}
