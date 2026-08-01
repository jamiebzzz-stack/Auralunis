import React from "react";
import { Circle, G, Line, Text as SvgText } from "react-native-svg";
import type { HorizontalStar } from "../ephemeris/StarPositions";
import { magnitudeToRadius, starColor, warmShift, STAR_FEATURES, focusFactor, type ProjectFn, type SkyPalette, type SelectedObject, type FocusZone } from "../SkyLensVisual";
import { getExtinctionWarmth } from "@/services/SkyQualityService";
import type { LabelPlacer } from "../labelLayout";

type Props = {
  stars: HorizontalStar[];
  project: ProjectFn;
  palette: SkyPalette;
  nightMode: boolean;
  focus?: FocusZone;
  showcase?: FocusZone; // auto-lit hero region (e.g. Orion in view) — stronger star glow
  placeLabel?: LabelPlacer;
  labelMagLimit?: number; // progressive reveal: raised when zoomed so more labels appear
  showLabels?: boolean; // false in cinematic Immersive Sky mode → dots only, no text
  extinction?: boolean; // warm low-altitude stars toward orange (atmospheric extinction)
  bloom?: boolean; // premium: bright stars bloom (glow rings + diffraction spikes). free: clean dots.
  fullSphere?: boolean; // Planetarium: show below-horizon stars at full brightness (no dim/cull)
  onSelect: (object: SelectedObject) => void;
};

// Named stars at or above this brightness get a text label; fainter ones render
// as dots only to avoid clutter. Keep this conservative: Sky Lens should feel
// like an elegant instrument first, not a labeled encyclopedia map.
const LABEL_MAG_LIMIT = 1.35;

// deterministic per-star hash → a tiny, repeatable wobble so each showpiece bloom is
// a slightly different soft shape (feathered, not an identical perfect circle).
const hashStar = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};

export function StarLayer({ stars, project, palette, nightMode, focus = null, showcase = null, placeLabel, labelMagLimit = LABEL_MAG_LIMIT, showLabels = true, extinction = false, bloom = true, fullSphere = false, onSelect }: Props) {
  const quietLabelLimit = Math.min(labelMagLimit, LABEL_MAG_LIMIT);

  return (
    <G>
      {stars.map((star) => {
        // Render all stars, dim those below horizon
        const belowHorizon = !star.aboveHorizon;
        if (belowHorizon && !fullSphere && star.altitudeDegrees < -30) return null;
        const p = project(star.azimuthDegrees, star.altitudeDegrees);
        if (!p.onScreen) return null;

        const feature = nightMode ? undefined : STAR_FEATURES[star.id];
        // focus mode (tap) + auto showcase region (e.g. Orion in view): stars swell + glow
        const ff = focusFactor(p.x, p.y, focus);
        const sf = focusFactor(p.x, p.y, showcase);
        const lit = Math.max(ff, sf); // combined "in a lit region" strength
        const r = (feature ? feature.radius : magnitudeToRadius(star.magnitude)) * (1 + ff * 0.4 + sf * 0.3);
        // Night Mode stays monochrome red for dark adaptation; otherwise stars
        // take their spectral color, and the brightest get a soft colored glow.
        const baseColor = nightMode ? palette.star : starColor(star.id, star.magnitude);
        // Atmospheric extinction: stars low on the horizon redden (more air in the
        // line of sight). Skipped in Night Mode (monochrome red for dark adaptation).
        const color = extinction && !nightMode ? warmShift(baseColor, getExtinctionWarmth(star.altitudeDegrees)) : baseColor;
        // Bloom (glow rings + diffraction spikes + white-hot core) is premium. Free
        // keeps the spectral disc + interactive lit-region aura, just no bloom.
        const brightest = bloom && !nightMode && star.magnitude < 1.5; // Vega, Deneb, Sirius… — the showpieces
        const bright = bloom && !nightMode && star.magnitude < 2.0;
        const glint = bloom && !nightMode && star.magnitude < 1.2; // diffraction spike on the showpiece stars
        const spike = r + 9;
        const labeled = showLabels && star.name !== undefined && star.magnitude <= quietLabelLimit;

        return (
          <G key={star.id} opacity={belowHorizon && !fullSphere ? 0.25 : 1}>
            {/* Bigger invisible hit target — 24px minimum for easy tapping with sensor jitter */}
            <Circle
              cx={p.x}
              cy={p.y}
              r={Math.max(r + 16, 24)}
              fill="transparent"
              onPress={() =>
                onSelect({
                  kind: "star",
                  id: star.id,
                  name: star.name ?? "Star",
                  subtitle: star.name ? "Star" : undefined,
                  facts: [
                    { label: "Magnitude", value: star.magnitude.toFixed(2) },
                    { label: "Azimuth", value: `${Math.round(star.azimuthDegrees)}°` },
                    { label: "Altitude", value: `${Math.round(star.altitudeDegrees)}°` }
                  ]
                })
              }
            />
            {/* focus/showcase aura: any star in a lit region gets a soft halo */}
            {lit > 0 && <Circle cx={p.x} cy={p.y} r={(r + 9) * (1 + lit)} fill={color} opacity={0.16 * lit} />}
            {/* SHOWPIECE BLOOM — a soft FEATHERED falloff (faint wide halo → brighter
                core) instead of one hard-edged disc, with a tiny per-star centre offset
                so each bloom is a slightly different organic shape, not a sharp circle. */}
            {bloom && feature && (() => {
              // HALO CAP. Sirius peaked at 24 × 0.85 = 20.4, and the showcase multiplier
              // could double it — a giant translucent disc rather than a star. Clamped to
              // 7–19 so even the showpieces stay jewels.
              const gr = Math.max(7, Math.min(19, feature.glowRadius * 0.85 * (1 + sf * 1.0)));
              const h = hashStar(star.id);
              const ox = ((h % 7) - 3) * 0.1, oy = (((h >> 3) % 7) - 3) * 0.1; // ±0.3·gr
              return (
                <G>
                  <Circle cx={p.x + gr * ox} cy={p.y + gr * oy} r={gr} fill={color} opacity={0.045} />
                  <Circle cx={p.x} cy={p.y} r={gr * 0.68} fill={color} opacity={0.09} />
                  <Circle cx={p.x - gr * ox * 0.5} cy={p.y - gr * oy * 0.5} r={gr * 0.42} fill={color} opacity={0.18} />
                </G>
              );
            })()}
            {/* GLOW HIERARCHY — bright stars are the CRISP tier. The halo is pulled in
                tighter and the inner steps are brightened, so a star reads as a hard point
                of light wearing a neat halo. That's deliberately the opposite of the
                nebulae, which are pure diffuse haze with no crisp core anywhere. Same
                number of circles; the ramp is just steeper and narrower.
                  · bright stars → tight, crisp, luminous  (this block)
                  · planets      → richer, more solid      (PlanetLayer)
                  · nebulae      → soft haze, never sharp  (NebulaImageLayer)
                  · dome stars   → restrained              (DomeStarLayer, untouched) */}
            {brightest && <Circle cx={p.x} cy={p.y} r={r + 7} fill={color} opacity={0.03} />}
            {brightest && <Circle cx={p.x} cy={p.y} r={r + 5.5} fill={color} opacity={0.055} />}
            {bright && <Circle cx={p.x} cy={p.y} r={r + 3.6} fill={color} opacity={0.1} />}
            {bright && <Circle cx={p.x} cy={p.y} r={r + 2.3} fill={color} opacity={0.18} />}
            {bright && <Circle cx={p.x} cy={p.y} r={r + 1.1} fill={color} opacity={0.28} />}
            {glint && (
              <>
                {/* tapered 4-point diffraction — a faint wide underlay glow + a crisp
                    narrow core, so the spikes shimmer softly instead of reading as hard
                    cross-hairs (premium 'jewel' look on Sirius/Vega/etc.) */}
                <Line x1={p.x - spike * 1.18} y1={p.y} x2={p.x + spike * 1.18} y2={p.y} stroke={color} strokeWidth={2.4} strokeOpacity={0.1} strokeLinecap="round" />
                <Line x1={p.x} y1={p.y - spike * 1.18} x2={p.x} y2={p.y + spike * 1.18} stroke={color} strokeWidth={2.4} strokeOpacity={0.1} strokeLinecap="round" />
                <Line x1={p.x - spike} y1={p.y} x2={p.x + spike} y2={p.y} stroke={color} strokeWidth={0.8} strokeOpacity={0.42} strokeLinecap="round" />
                <Line x1={p.x} y1={p.y - spike} x2={p.x} y2={p.y + spike} stroke={color} strokeWidth={0.8} strokeOpacity={0.42} strokeLinecap="round" />
              </>
            )}
            <Circle cx={p.x} cy={p.y} r={r} fill={color} />
            {/* white-hot core for the showpiece stars */}
            {/* White-hot core — the crispness that makes a showpiece star a JEWEL. */}
            {glint && <Circle cx={p.x} cy={p.y} r={Math.max(r - 1, 1)} fill="#FFFFFF" opacity={0.92} />}
            {labeled && (() => {
              // 12 → 18pt, semibold: readable on a moving sky at arm's length. The bigger
              // font also enlarges the placer's collision box (it keys off fontSize), so
              // labels claim the room they actually occupy.
              const lp = placeLabel ? placeLabel(p.x + r + 5, p.y + 5, star.name ?? "", 16, undefined, false, { weight: 600 }) : { x: p.x + r + 5, y: p.y + 5 };
              // PRIORITY 2. No clean slot → SUPPRESS rather than clip or overlap.
              if (!Number.isFinite(lp.x)) return null;
              return (
                <G>
                  {/* Soft dark outline so warm-ivory names stay legible over the Milky Way. */}
                  <SvgText x={lp.x} y={lp.y} fill="none" stroke="#05070F" strokeWidth={1.6} strokeOpacity={0.42} fontSize={15} fontWeight="600">
                    {star.name}
                  </SvgText>
                  <SvgText x={lp.x} y={lp.y} fill={palette.starLabel} fontSize={15} fontWeight="600" opacity={0.72}>
                    {star.name}
                  </SvgText>
                </G>
              );
            })()}
          </G>
        );
      })}
    </G>
  );
}
