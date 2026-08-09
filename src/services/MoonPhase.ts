// Single source of truth for moon-phase naming, illumination bucketing, and the DISC GEOMETRY
// used to draw the phase. Canonical thresholds (illumination %): New <3 · Crescent <40 ·
// Quarter 40–60 · Gibbous 60–97 · Full ≥97. Used by the calendar, prompts, birth sky, and
// compatibility features so the same illumination always yields the same name.
//
// Everything here is derived from astronomy-engine or is pure math — there is no lookup table
// of phase images and no hardcoded phase list. A renderer that picks from eight static images
// cannot show the continuous progression the sky actually goes through, and cannot tell a 30%
// waxing crescent from its mirror-image 30% waning crescent.

import { Illumination, MoonPhase as moonSunElongation, Body } from "astronomy-engine";

export const MOON_PHASE_NAMES = [
  "New Moon",
  "Waxing Crescent",
  "First Quarter",
  "Waxing Gibbous",
  "Full Moon",
  "Waning Gibbous",
  "Last Quarter",
  "Waning Crescent"
] as const;

// Full eight-phase name. Requires the waxing/waning direction to distinguish,
// e.g. Waxing Crescent from Waning Crescent.
export function moonPhaseName(illuminationPercent: number, isWaxing: boolean): string {
  if (illuminationPercent < 3) return MOON_PHASE_NAMES[0];
  if (illuminationPercent > 97) return MOON_PHASE_NAMES[4];
  if (isWaxing) {
    if (illuminationPercent < 40) return MOON_PHASE_NAMES[1];
    if (illuminationPercent < 60) return MOON_PHASE_NAMES[2];
    return MOON_PHASE_NAMES[3];
  }
  if (illuminationPercent > 60) return MOON_PHASE_NAMES[5];
  if (illuminationPercent > 40) return MOON_PHASE_NAMES[6];
  return MOON_PHASE_NAMES[7];
}

// ── Live lunar state ──────────────────────────────────────────────────────────

export interface LunarState {
  /** Fraction of the disc lit by the Sun, 0–100. */
  illuminationPercent: number;
  /** True while the lit fraction is growing (elongation < 180°). */
  isWaxing: boolean;
  /** Moon–Sun ecliptic elongation, 0–360°. 0° = new, 180° = full. */
  phaseAngleDegrees: number;
  /** Eight-phase name consistent with every other surface in the app. */
  name: string;
}

/**
 * The Moon's actual state at `when`. This is the ONLY function a renderer should ask — it
 * consolidates the `Illumination` + `MoonPhase` pair that was previously duplicated inline in
 * BirthSkyService, so illumination and direction can never disagree.
 *
 * Falls back to a new moon rather than throwing: a visual must degrade, not crash a screen.
 */
export function lunarState(when: Date = new Date()): LunarState {
  try {
    const phaseAngleDegrees = normalizeDegrees(moonSunElongation(when));
    const illuminationPercent = clampPercent(Illumination(Body.Moon, when).phase_fraction * 100);
    // Elongation grows 0 → 360 through one lunation, so the first half is waxing. Taking the
    // direction from the SAME instant as the fraction keeps the pair self-consistent.
    const isWaxing = phaseAngleDegrees < 180;
    return {
      illuminationPercent,
      isWaxing,
      phaseAngleDegrees,
      name: moonPhaseName(illuminationPercent, isWaxing)
    };
  } catch {
    return { illuminationPercent: 0, isWaxing: true, phaseAngleDegrees: 0, name: MOON_PHASE_NAMES[0] };
  }
}

function normalizeDegrees(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0;
  return ((degrees % 360) + 360) % 360;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

// ── Disc geometry ─────────────────────────────────────────────────────────────

export interface MoonDiscGeometry {
  /**
   * Semi-axis of the terminator ellipse, in the same units as `radius`. The terminator is the
   * projection of a great circle onto the disc, so it is always an ellipse sharing the disc's
   * vertical axis: `radius` at new and full (where it coincides with the limb) and 0 at the
   * quarters (where it is a straight line). Interpolating this is what produces a CONTINUOUS
   * new → crescent → quarter → gibbous → full progression from one number.
   */
  terminatorRadius: number;
  /** Which limb carries the light. Waxing lights the right limb (northern convention). */
  litOnRight: boolean;
  /** Under half lit: the terminator bows toward the lit limb, thinning the sliver. */
  crescent: boolean;
}

/**
 * Resolve the drawing geometry for a phase. Pure — no rendering library — so the shape can be
 * verified in plain Node against known phases.
 */
export function moonDiscGeometry(
  radius: number,
  illuminationPercent: number,
  isWaxing: boolean
): MoonDiscGeometry {
  const safeRadius = Number.isFinite(radius) && radius > 0 ? radius : 0;
  const k = clampPercent(illuminationPercent) / 100;
  return {
    // |1 - 2k|: full width at k=0 and k=1, zero at k=0.5.
    terminatorRadius: safeRadius * Math.abs(1 - 2 * k),
    litOnRight: isWaxing,
    crescent: k < 0.5
  };
}

/**
 * SVG path describing the LIT region of the disc: one semicircular limb arc, then the
 * terminator ellipse back to the start. Sweep flags follow from which limb is lit and whether
 * the terminator bows toward it; in SVG's y-down space, travelling bottom → top with sweep 1
 * passes to the left and with sweep 0 to the right.
 *
 * At k=0 the terminator arc lands exactly on the lit limb, so the path encloses nothing (new
 * moon); at k=1 it lands on the opposite limb, enclosing the whole disc (full moon).
 */
export function moonLitRegionPath(
  cx: number,
  cy: number,
  radius: number,
  illuminationPercent: number,
  isWaxing: boolean
): string {
  const { terminatorRadius, litOnRight, crescent } = moonDiscGeometry(radius, illuminationPercent, isWaxing);
  const top = `${cx} ${cy - radius}`;
  const bottom = `${cx} ${cy + radius}`;
  const limbSweep = litOnRight ? 1 : 0;
  const terminatorSweep = litOnRight ? (crescent ? 0 : 1) : crescent ? 1 : 0;
  return [
    `M ${top}`,
    `A ${radius} ${radius} 0 0 ${limbSweep} ${bottom}`,
    `A ${terminatorRadius} ${radius} 0 0 ${terminatorSweep} ${top}`,
    "Z"
  ].join(" ");
}

// Direction-agnostic label for callers that only know illumination and have no
// waxing/waning context (e.g. a single birth-night snapshot). Same thresholds.
export function moonPhaseLabel(illuminationPercent: number): string {
  if (illuminationPercent < 3) return "New Moon";
  if (illuminationPercent < 40) return "Crescent Moon";
  if (illuminationPercent < 60) return "Quarter Moon";
  if (illuminationPercent <= 97) return "Gibbous Moon";
  return "Full Moon";
}
