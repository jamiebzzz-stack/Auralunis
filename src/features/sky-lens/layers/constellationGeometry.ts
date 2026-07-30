// constellationGeometry.ts — pure geometry rules for constellation line work.
//
// No React and no react-native-svg, so the rules are directly testable.
//
// Constellation shape is rigid BY CONSTRUCTION: every star in a pattern is projected in a
// single pass from one immutable camera-pointing snapshot (see ConstellationLayer's
// `c.points.map(project)`), and no star is ever smoothed individually — only the camera
// orientation is smoothed, upstream in useDevicePointing. A pattern may rotate, translate,
// scale with field of view, or leave the screen, but it cannot bend or shear.
//
// The one way a pattern can APPEAR to change shape is if segments are culled inconsistently.
// That was a real defect: the cull used a flat 260px budget, which is smaller than the
// screen, so zooming in — which legitimately spreads a pattern out — silently removed real
// segments and the Big Dipper lost arms. The limit now scales with the viewport.

export interface ProjectedPoint {
  x: number;
  y: number;
}

export interface ViewportBox {
  width: number;
  height: number;
}

/**
 * Whether a projected segment is real geometry rather than a projection-seam artefact.
 *
 * A genuine constellation segment never spans more than about one viewport diagonal at any
 * zoom. Anything longer means the two endpoints landed on opposite sides of the projection
 * seam (the 0/360 heading wrap), and drawing it would streak a line across the whole screen.
 */
export function isPlausibleSegment(
  a: ProjectedPoint,
  b: ProjectedPoint,
  box: ViewportBox
): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false;
  const limit = Math.hypot(box.width, box.height) * 1.05;
  return Math.hypot(dx, dy) <= limit;
}
