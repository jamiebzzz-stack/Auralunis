// Where First Light is allowed to draw a spotlight — PURE. No react-native imports, so every
// readiness decision is unit-testable in plain Node (scripts/first-light-selftest.js).
//
// WHY THIS EXISTS (physical-device defect, integration/1.0.1-rc2):
//
// "Find your first object" ringed the HUD/header and called it Venus, then snapped to the real
// Venus a moment later. Nothing was wrong with the projection maths — it was fed inputs that
// were still provisional when the step opened:
//
//   • Sky Lens starts with a HARDCODED placeholder canvas of 360x720 (SkyLensScreen's `box`
//     useState) until onLayout reports the real size. On a 430x932 device that puts the
//     vertical centre at y=360 instead of y=466 and the scale at 6.00 px/deg instead of 7.17,
//     so an object 10 degrees above the optical axis is drawn 94 px too high — straight into
//     the top chrome.
//   • The observer starts at DEFAULT_OBSERVER (39.8283 N, 98.5795 W — the geographic centre of
//     the contiguous US) until the location resolver settles. Until then the tutorial is
//     pointing at a real sky, just not the user's: ~14 degrees of longitude is ~14 degrees of
//     hour angle, another ~100 px of displacement.
//
// Both are revised asynchronously and independently, which is exactly the "wrong place, then
// correct a moment later" signature that was recorded.
//
// The rule here is deliberately blunt: a projected spotlight is drawn ONLY from authoritative
// inputs. Until then there is NO rectangle at all — never a remembered one, never a provisional
// one. The tour card, its hint, and the degraded guidance all keep rendering, because the
// overlay already treats "no spotlight" as a supported presentation rather than an error.

/** Structurally identical to TourRect; declared locally so this module imports nothing. */
export type SpotlightRect = { x: number; y: number; width: number; height: number };

/** The projection result Sky Lens hands over for a sky object. */
export type SpotlightProjection = {
  x: number;
  y: number;
  onScreen: boolean;
  behind: boolean;
};

/**
 * Whether the inputs behind a projected position are authoritative yet.
 *
 * `locationReady` means the observer has SETTLED, not that permission was granted. A user who
 * declines location keeps DEFAULT_OBSERVER for the whole app, so the tutorial then agrees with
 * the sky actually being rendered — which is the point. Gating on "granted" instead would leave
 * the spotlight suppressed forever for those users and trade one dead end for another.
 */
export type SpotlightReadiness = {
  /** The Sky Lens canvas has reported its real size through onLayout. */
  boxMeasured: boolean;
  /** The observer location has settled — "granted" or the app-wide "fallback". */
  locationReady: boolean;
};

/** Half the width/height of the ring drawn around a single sky object. */
export const OBJECT_SPOTLIGHT_RADIUS = 34;
/** The constellation step rings the figure and the label the renderer already draws for it. */
export const CONSTELLATION_SPOTLIGHT_MAX_WIDTH = 260;
export const CONSTELLATION_SPOTLIGHT_HEIGHT = 180;

/**
 * True only when every input behind a projected position is authoritative. Exported so the
 * readiness decision can be asserted directly, and so callers can suppress a projection rather
 * than each re-deriving the rule.
 */
export function isProjectionTrustworthy(readiness: SpotlightReadiness | null | undefined): boolean {
  if (!readiness) return false;
  return readiness.boxMeasured === true && readiness.locationReady === true;
}

/** A projected position worth ringing: in front of the camera and inside the viewport. */
function isVisible(projection: SpotlightProjection | null | undefined): boolean {
  if (!projection) return false;
  if (!Number.isFinite(projection.x) || !Number.isFinite(projection.y)) return false;
  return projection.onScreen && !projection.behind;
}

/**
 * The rect to spotlight for a step that points at something in the sky.
 *
 * Returns null — meaning "render this step without a spotlight" — when the inputs are still
 * provisional, or when the object is off-screen or behind the camera. The caller must NOT
 * substitute a previous rectangle: a remembered rect is precisely the stale-highlight defect
 * this module was written to remove.
 */
export function resolveProjectedSpotlightRect(args: {
  stepId: string | null;
  targetProjection: SpotlightProjection | null;
  constellationProjection: SpotlightProjection | null;
  box: { width: number; height: number };
  readiness: SpotlightReadiness;
}): SpotlightRect | null {
  const { stepId, targetProjection, constellationProjection, box, readiness } = args;

  // GATE FIRST. Nothing below may run on provisional inputs.
  if (!isProjectionTrustworthy(readiness)) return null;

  if ((stepId === "findObject" || stepId === "openCard") && isVisible(targetProjection)) {
    const p = targetProjection as SpotlightProjection;
    return {
      x: p.x - OBJECT_SPOTLIGHT_RADIUS,
      y: p.y - OBJECT_SPOTLIGHT_RADIUS,
      width: OBJECT_SPOTLIGHT_RADIUS * 2,
      height: OBJECT_SPOTLIGHT_RADIUS * 2,
    };
  }

  if (stepId === "constellation" && isVisible(constellationProjection)) {
    const p = constellationProjection as SpotlightProjection;
    const width = Math.min(box.width - 16, CONSTELLATION_SPOTLIGHT_MAX_WIDTH);
    const height = CONSTELLATION_SPOTLIGHT_HEIGHT;
    return { x: p.x - width / 2, y: p.y - height / 2, width, height };
  }

  return null;
}
