// starReference.ts — real stellar data for the Learn visuals.
//
// Pure data and math: no React, no react-native, so the values and the brightness mapping can
// be checked in plain Node (same convention as MoonPhase.ts and SkyLensProjection.ts). The
// previous Stars visual invented three coloured circles whose sizes tracked nothing; keeping
// the numbers here, testable, is what stops that recurring.
//
// Magnitudes and temperatures are the accepted values for each star. Colours are approximate
// blackbody appearances at those temperatures, so the colour ordering follows the temperature
// ordering rather than being a palette choice.

export interface ReferenceStar {
  name: string;
  /** Apparent magnitude — lower is brighter, and the brightest stars go negative. */
  magnitude: number;
  /** Approximate surface temperature in kelvin. */
  kelvin: number;
  /** Spectral class. */
  spectral: string;
  /** Approximate blackbody colour at that temperature. */
  color: string;
}

export const REFERENCE_STARS: ReadonlyArray<ReferenceStar> = [
  { name: "Sirius", magnitude: -1.46, kelvin: 9940, spectral: "A1", color: "#DCE6FF" },
  { name: "Rigel", magnitude: 0.13, kelvin: 12100, spectral: "B8", color: "#B8D4FF" },
  { name: "Capella", magnitude: 0.08, kelvin: 4970, spectral: "G8", color: "#FFEFC0" },
  { name: "Betelgeuse", magnitude: 0.5, kelvin: 3600, spectral: "M2", color: "#FF8866" }
];

/**
 * Disc radius from apparent magnitude. Each step of 1 magnitude is a factor of ~2.512 in
 * received light, so the radius is derived from that ratio rather than a linear ramp — the
 * relative sizes on screen then reflect real brightness ratios.
 *
 * This encodes APPARENT BRIGHTNESS, never physical size. Betelgeuse is vastly larger than
 * Sirius but appears fainter from Earth, so reading these discs as stellar radii would be
 * exactly backwards. The visual's caption says so explicitly.
 */
export function apparentDiscRadius(magnitude: number): number {
  if (!Number.isFinite(magnitude)) return 9;
  const relativeLight = Math.pow(2.512, -magnitude);
  return 9 + 7 * Math.log10(relativeLight + 1);
}
