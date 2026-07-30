import { Horizon, Observer } from "astronomy-engine";
import type { ObserverLocation } from "../accuracy/SkyLensAccuracyTypes";
import type { BrightStar } from "../data/brightStars";
import type { ConstellationLine } from "../data/constellationLines";

// Converts fixed-star equatorial coordinates (catalog RA/Dec) into the same
// (azimuth, altitude) the AR projection already consumes for Solar-System bodies.
//
// Catalog coordinates are J2000. We feed them straight to astronomy-engine's
// Horizon() for the observation time, which applies local sidereal time and
// refraction. Precession (J2000 → date) is left uncorrected: over ~25 years it
// is < 0.4°, far below the device's compass/FOV error for a naked-eye overlay.
// Pure module (no React Native imports) so it is unit-testable in plain Node.

export interface HorizontalStar {
  id: string;
  name?: string;
  magnitude: number;
  azimuthDegrees: number;
  altitudeDegrees: number;
  aboveHorizon: boolean;
}

export interface HorizontalConstellation {
  /** Everyday name of the pattern, when it differs from the constellation (asterisms). */
  familiarName?: string;
  /** Index into `points` of a star worth naming (e.g. Polaris in Ursa Minor). */
  anchorStarIndex?: number;
  anchorStarName?: string;
  id: string;
  name: string;
  season: string;
  myth: string;
  // Each star of the figure resolved to horizontal coordinates, in the same
  // order as the source so `lines` index pairs still connect the right points.
  points: { azimuthDegrees: number; altitudeDegrees: number; aboveHorizon: boolean }[];
  lines: [number, number][];
  centroid: { azimuthDegrees: number; altitudeDegrees: number; aboveHorizon: boolean };
}

function toObserver(location: ObserverLocation): Observer {
  return new Observer(
    location.latitudeDegrees,
    location.longitudeDegrees,
    location.altitudeMeters ?? 0
  );
}

function equatorialToHorizontal(
  observer: Observer,
  when: Date,
  raHours: number,
  decDegrees: number
): { azimuthDegrees: number; altitudeDegrees: number; aboveHorizon: boolean } {
  const h = Horizon(when, observer, raHours, decDegrees, "normal");
  return {
    azimuthDegrees: h.azimuth,
    altitudeDegrees: h.altitude,
    aboveHorizon: h.altitude > 0
  };
}

export function computeStarPositions(
  stars: ReadonlyArray<BrightStar>,
  location: ObserverLocation,
  when: Date = new Date()
): HorizontalStar[] {
  const observer = toObserver(location);
  return stars.map((star) => {
    const h = equatorialToHorizontal(observer, when, star.raHours, star.decDegrees);
    return {
      id: star.id,
      name: star.name,
      magnitude: star.magnitude,
      azimuthDegrees: h.azimuthDegrees,
      altitudeDegrees: h.altitudeDegrees,
      aboveHorizon: h.aboveHorizon
    };
  });
}

export function computeConstellationPositions(
  constellations: ReadonlyArray<ConstellationLine>,
  location: ObserverLocation,
  when: Date = new Date()
): HorizontalConstellation[] {
  const observer = toObserver(location);
  return constellations.map((c) => {
    const points = c.stars.map((s) =>
      equatorialToHorizontal(observer, when, s.raHours, s.decDegrees)
    );
    // Centroid from the mean RA/Dec keeps the label off any one star.
    const meanRa = c.stars.reduce((sum, s) => sum + s.raHours, 0) / c.stars.length;
    const meanDec = c.stars.reduce((sum, s) => sum + s.decDegrees, 0) / c.stars.length;
    const centroid = equatorialToHorizontal(observer, when, meanRa, meanDec);
    return {
      id: c.id,
      name: c.name,
      familiarName: c.familiarName,
      anchorStarIndex: c.anchorStarIndex,
      anchorStarName: c.anchorStarName,
      season: c.season,
      myth: c.myth,
      points,
      lines: c.lines,
      centroid
    };
  });
}
