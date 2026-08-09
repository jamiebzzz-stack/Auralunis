// orreryGeometry.ts — real planetary positions for the Learn orrery.
//
// Pure apart from astronomy-engine, so every angle is checkable in plain Node.
//
// WHAT WAS WRONG. The orrery was labelled "LIVE ORRERY" while its planets moved on invented
// periods — `step/8`, `/10`, `/12`, `/14` — around four arbitrary rings, with colours matching
// no planet. Nothing about it was live. Same class of defect as the Moon card's fake phase
// cycle and the Home hero's "happening now": a confident label over made-up data.
//
// WHAT IT IS NOW. Each planet sits at its true HELIOCENTRIC ecliptic longitude for the given
// instant. That is the correct frame for a Sun-centred diagram, and — a useful irony —
// `EclipticLongitude()` being heliocentric is exactly why it was the WRONG call for tropical
// zodiac signs in tropicalZodiac.ts. Same function, opposite verdict, because the frame the
// picture needs is different.
//
// ── THE ONE THING THIS DIAGRAM CANNOT SHOW HONESTLY ──────────────────────────
//
// Distances are NOT to scale and cannot be. Neptune orbits ~78× further out than Mercury; drawn
// truthfully in a 260 pt frame, Mercury would sit inside the Sun's disc. Radii are therefore
// compressed with log(1 + AU), which preserves the real ORDER and keeps the gas giants visibly
// far out, while the angles stay exact. The visual states this outright rather than letting the
// reader assume the spacing means something.

import { Body, EclipticLongitude } from "astronomy-engine";

export interface OrreryPlanet {
  name: string;
  /** True heliocentric ecliptic longitude in degrees, 0–360. */
  longitudeDegrees: number;
  /** Real orbital semi-major axis in AU — the honest number, shown on request. */
  semiMajorAxisAU: number;
  /** Compressed orbit radius, 0–1. Order is real; spacing is not to scale. */
  normalizedRadius: number;
  /** Approximate true colour. */
  color: string;
}

/** Semi-major axes in AU and approximate colours. Order is orbital order. */
const PLANETS: ReadonlyArray<{ name: string; body: Body; au: number; color: string }> = [
  { name: "Mercury", body: Body.Mercury, au: 0.387, color: "#B4B2A9" },
  { name: "Venus", body: Body.Venus, au: 0.723, color: "#F0D9A0" },
  { name: "Earth", body: Body.Earth, au: 1.0, color: "#6FA8DC" },
  { name: "Mars", body: Body.Mars, au: 1.524, color: "#E2725B" },
  { name: "Jupiter", body: Body.Jupiter, au: 5.203, color: "#D9A066" },
  { name: "Saturn", body: Body.Saturn, au: 9.537, color: "#E3D5A1" },
  { name: "Uranus", body: Body.Uranus, au: 19.19, color: "#9FE1CB" },
  { name: "Neptune", body: Body.Neptune, au: 30.07, color: "#6E8FD6" },
];

const MAX_AU = 30.07;

/**
 * Compressed orbital radius, 0–1.
 *
 * log(1 + AU) rather than a linear or square-root map: linear would collapse the four inner
 * planets onto the Sun, and sqrt still bunches them. This keeps Mercury through Mars separable
 * while Neptune stays on the rim, and it is monotonic, so the drawn order is always the true
 * orbital order.
 */
export function normalizedOrbitRadius(au: number): number {
  if (!Number.isFinite(au) || au <= 0) return 0;
  return Math.log(1 + au) / Math.log(1 + MAX_AU);
}

/**
 * Every planet's real position for `when`.
 *
 * Returns an empty array rather than fabricating positions if the ephemeris fails — a diagram
 * with no planets is honest; a diagram with invented ones is what this replaced.
 */
export function orreryPositions(when: Date = new Date()): OrreryPlanet[] {
  if (Number.isNaN(when.getTime())) return [];
  const out: OrreryPlanet[] = [];
  for (const planet of PLANETS) {
    try {
      const longitude = EclipticLongitude(planet.body, when);
      if (!Number.isFinite(longitude)) continue;
      out.push({
        name: planet.name,
        longitudeDegrees: ((longitude % 360) + 360) % 360,
        semiMajorAxisAU: planet.au,
        normalizedRadius: normalizedOrbitRadius(planet.au),
        color: planet.color,
      });
    } catch {
      // Skip a body the ephemeris cannot place rather than guessing where it is.
    }
  }
  return out;
}

/**
 * Screen position for a planet.
 *
 * Ecliptic longitude 0° is drawn at the top and increases anticlockwise, matching how orbital
 * diagrams are conventionally oriented when viewed from ecliptic north.
 */
export function orreryPoint(
  planet: OrreryPlanet,
  centerX: number,
  centerY: number,
  maxRadius: number,
  minRadius = 0
): { x: number; y: number; r: number } {
  // Orbits are drawn between minRadius and maxRadius rather than from zero. Even after log
  // compression the four inner planets land at 0.10–0.27 of the frame, which puts Mercury
  // inside the Sun's glow — visible in testing. The floor is a DRAWING concern only; the
  // normalized radius above stays the honest log ratio.
  const r = minRadius + planet.normalizedRadius * (maxRadius - minRadius);
  const radians = (planet.longitudeDegrees * Math.PI) / 180;
  return {
    x: centerX + r * Math.sin(radians),
    y: centerY - r * Math.cos(radians),
    r,
  };
}
