import React from "react";
import { Circle, G, Line, Text as SvgText } from "react-native-svg";
import type { ZodiacData } from "../ephemeris/Zodiac";
import { magnitudeToRadius, type ProjectFn, type SkyPalette, type SelectedObject } from "../SkyLensVisual";
import { unitFootprint, type LabelPlacer } from "../labelLayout";

type Props = {
  zodiac: ZodiacData;
  project: ProjectFn;
  palette: SkyPalette;
  nightMode: boolean;
  sun?: { azimuthDegrees: number; altitudeDegrees: number; aboveHorizon: boolean } | null;
  birthSignId?: string | null;
  /**
   * Shared label placer. When provided, the sign NAME labels are routed through it so they
   * avoid UI chrome and higher-priority labels (planets/Moon/stars/constellations) and are
   * suppressed when no clean slot exists — exactly like every other labelled layer. The
   * constellation FIGURE (lines/dots) and the glyph marker stay at the true sky position.
   */
  placeLabel?: LabelPlacer;
  /**
   * Split-render flag mirroring ConstellationLayer: the artwork pass (lines/dots/glyph)
   * mounts UNDER the stars; a second `labelsOnly` pass mounts LAST so sign names yield in
   * the shared priority ladder. With no placer, everything renders inline (legacy).
   */
  labelsOnly?: boolean;
  /**
   * Suppress the sign NAME text, keeping the glyph and its markers.
   *
   * The zodiac name was 15px uppercase gold, centred — visually almost identical to a
   * constellation name, and drawn near the same centroid. With both layers on, Leo got two
   * near-identical labels. The constellation layer owns the name; the zodiac keeps its glyph,
   * which is what makes it a zodiac layer rather than a second set of names.
   */
  hideNames?: boolean;
  onSelect: (object: SelectedObject) => void;
};

const GOLD = "#D9A84E";
const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const cardinalFor = (az: number) => CARDINALS[Math.round(((az % 360) + 360) % 360 / 45) % 8];

// The 12 zodiac constellations along the ecliptic — the FREE "find your sign" layer.
// Gold lines (brighter for the sign the Sun is in), magnitude-sized star dots, the
// zodiac glyph + name at each center, faint boundary ticks between bands, a ☀ marker
// on the Sun, and an optional "Your sign" marker. Tap opens the sign's info card.
export function ZodiacLayer({ zodiac, project, palette, nightMode, sun, birthSignId, placeLabel, labelsOnly = false, hideNames = false, onSelect }: Props) {
  const lineColor = nightMode ? palette.line : GOLD;
  const symbolColor = nightMode ? palette.conLabel : GOLD;
  // Names render inline (at the raw center) only when there is no placer to route them
  // through; with a placer they are drawn in the dedicated labelsOnly pass instead.
  const inlineNames = !placeLabel && !labelsOnly;

  // The glyph + name + contextual markers, anchored on the NAME baseline (ay). Keeps the
  // exact stacking of the original: glyph 20px above the name, "Sun is here" 7px below,
  // "Your sign" 42px above — so placing the name simply carries the unit with it.
  const labelUnit = (key: string, ax: number, ay: number, sign: ZodiacData["signs"][number], isCurrent: boolean, isBirth: boolean) => (
    <G key={key}>
      {isCurrent && <Circle cx={ax} cy={ay - 24} r={15} fill={GOLD} opacity={0.18} />}
      <SvgText x={ax} y={ay - 20} textAnchor="middle" fontSize={isCurrent ? 22 : 18} fill={symbolColor} opacity={isCurrent ? 0.95 : 0.4}>
        {sign.symbol}
      </SvgText>
      {!hideNames && (
        <SvgText x={ax} y={ay} textAnchor="middle" fontSize={15} fontWeight="600" fill={symbolColor} opacity={isCurrent ? 0.9 : 0.5} letterSpacing={1}>
          {sign.name.toUpperCase()}
        </SvgText>
      )}
      {isCurrent && (
        <SvgText x={ax} y={ay + 7} textAnchor="middle" fontSize={8} fontWeight="800" fill={GOLD} opacity={0.85}>
          ☀ Sun is here · {sign.name} season
        </SvgText>
      )}
      {isBirth && (
        <SvgText x={ax} y={ay - 42} textAnchor="middle" fontSize={8} fontWeight="800" fill="#FFE9B0" opacity={0.9}>
          ✦ Your sign
        </SvgText>
      )}
    </G>
  );

  // ── LABELS-ONLY pass: sign names via the shared placer, lowest priority, suppressible ──
  if (labelsOnly) {
    if (!placeLabel) return null;
    return (
      <G>
        {zodiac.signs.map((sign, idx) => {
          const c = project(sign.center.azimuthDegrees, sign.center.altitudeDegrees);
          if (c.behind || !sign.center.aboveHorizon) return null;
          const isCurrent = !nightMode && idx === zodiac.sunSignIndex;
          const isBirth = !!birthSignId && sign.id === birthSignId;
          // Reserve the WHOLE unit, not just the name: glyph 20px above the name baseline, the
          // name itself, an optional current-sign context line 7px below, and an optional
          // "Your sign" line 42px above. Offsets mirror labelUnit() exactly, so the placed
          // anchor carries every part with it.
          const footprint = unitFootprint([
            { text: sign.symbol, fontSize: isCurrent ? 22 : 18, dy: -20 },
            { text: sign.name, fontSize: 15, dy: 0, weight: 600, letterSpacing: 1 },
            ...(isCurrent ? [{ text: `☀ Sun is here · ${sign.name} season`, fontSize: 8, dy: 7, weight: 800 }] : []),
            ...(isBirth ? [{ text: "✦ Your sign", fontSize: 8, dy: -42, weight: 800 }] : [])
          ]);
          // Centered unit: the placer nudges it vertically off collisions (chrome + higher
          // priority labels) while keeping it horizontally over its sign, and returns {NaN}
          // when the full footprint has no clean slot.
          const placed = placeLabel(c.x, c.y + 20, sign.name, 15, undefined, true, { weight: 600, letterSpacing: 1, footprint });
          if (!Number.isFinite(placed.x)) return null; // no room (chrome / crowding) → suppress
          return labelUnit(sign.id, placed.x, placed.y, sign, isCurrent, isBirth);
        })}
      </G>
    );
  }

  // ── ARTWORK pass (default): boundary ticks, figure lines, star dots, hit target ──
  return (
    <G>
      {/* Boundary ticks — perpendicular to the ecliptic, very subtle */}
      {zodiac.boundaries.map((b, i) => {
        const a = project(b.a.azimuthDegrees, b.a.altitudeDegrees);
        const c = project(b.b.azimuthDegrees, b.b.altitudeDegrees);
        if (a.behind || c.behind) return null;
        return (
          <Line key={`zb-${i}`} x1={a.x} y1={a.y} x2={c.x} y2={c.y} stroke={GOLD} strokeWidth={1} strokeOpacity={0.08} strokeDasharray="3 5" />
        );
      })}

      {zodiac.signs.map((sign, idx) => {
        const isCurrent = !nightMode && idx === zodiac.sunSignIndex;
        const isBirth = !!birthSignId && sign.id === birthSignId;
        const proj = sign.starPositions.map((s) => project(s.azimuthDegrees, s.altitudeDegrees));
        const lineOpacity = isCurrent ? 0.8 : 0.5;

        // Stick-figure lines (both endpoints in front + above horizon).
        const segs = sign.lines
          .filter(([i, j]) =>
            proj[i] && proj[j] && !proj[i].behind && !proj[j].behind &&
            sign.starPositions[i]?.aboveHorizon && sign.starPositions[j]?.aboveHorizon)
          .map(([i, j], k) => (
            <Line key={`${sign.id}-l${k}`} x1={proj[i].x} y1={proj[i].y} x2={proj[j].x} y2={proj[j].y}
              stroke={lineColor} strokeWidth={isCurrent ? 1.6 : 1.2} strokeOpacity={lineOpacity} strokeLinecap="round" />
          ));

        // Star dots.
        const dots = sign.starPositions.map((s, k) => {
          if (!s.aboveHorizon || !proj[k] || !proj[k].onScreen) return null;
          const r = magnitudeToRadius(s.magnitude);
          return <Circle key={`${sign.id}-s${k}`} cx={proj[k].x} cy={proj[k].y} r={r} fill={nightMode ? palette.star : "#FFF1C4"} />;
        });

        const c = project(sign.center.azimuthDegrees, sign.center.altitudeDegrees);
        const centerVisible = !c.behind && sign.center.aboveHorizon;

        return (
          <G key={sign.id}>
            {segs}
            {dots}
            {centerVisible && (
              <G>
                {/* hit target — stays on the constellation centre regardless of label slot */}
                <Circle cx={c.x} cy={c.y} r={26} fill="transparent" onPress={() => {
                  const where = sign.center.aboveHorizon ? `Visible (${cardinalFor(sign.center.azimuthDegrees)} sky)` : "Below horizon";
                  onSelect({
                    kind: "zodiac",
                    id: `zodiac-${sign.id}`,
                    name: `${sign.symbol}  ${sign.name}`,
                    subtitle: `Zodiac · ${sign.element} Sign`,
                    facts: [
                      { label: "Sun transits", value: sign.sunTransit },
                      { label: "Currently", value: where },
                      { label: "Brightest star", value: sign.brightestStar },
                    ],
                    description: sign.myth,
                  });
                }} />
                {/* Legacy inline names only when no placer is wired; otherwise the labelsOnly
                    pass renders them so they participate in the shared priority ladder. */}
                {inlineNames && labelUnit(`${sign.id}-inline`, c.x, c.y + 20, sign, isCurrent, isBirth)}
              </G>
            )}
          </G>
        );
      })}

      {/* The Sun's actual position marked on the ecliptic */}
      {sun && sun.aboveHorizon && !nightMode && (() => {
        const sp = project(sun.azimuthDegrees, sun.altitudeDegrees);
        if (sp.behind || !sp.onScreen) return null;
        return <SvgText x={sp.x} y={sp.y + 5} textAnchor="middle" fontSize={16}>☀</SvgText>;
      })()}
    </G>
  );
}
