import React from "react";
import { Circle, G, Line, Text as SvgText } from "react-native-svg";
import type { HorizontalConstellation } from "../ephemeris/StarPositions";
import { type ProjectFn, type SkyPalette, type SelectedObject } from "../SkyLensVisual";
import type { LabelPlacer } from "../labelLayout";
// Pure geometry rules (no SVG import) so they are testable under Node.
import { isPlausibleSegment } from "./constellationGeometry";

const GOLD = "#D9A84E";
// Constellation NAMES get a softer, warmer gold than the line work. The saturated
// #D9A84E reads as UI chrome when set as text; this is closer to engraved brass — it
// sits back into the sky instead of sitting on top of it.
const CON_LABEL_GOLD = "#C9A468";

/**
 * The patterns a beginner is most likely to be looking for. These are drawn at full strength;
 * everything else in the catalogue is dimmed so the sky does not read as a wall of equal
 * names. Membership is about recognisability, not importance — it only controls emphasis.
 */
const PRIMARY_CONSTELLATIONS = new Set([
  "ursa-major",
  "ursa-minor",
  "orion",
  "cassiopeia",
  "leo",
  "gemini",
  "taurus",
  "scorpius",
  "sagittarius",
  "cygnus",
  "lyra",
  "aquila"
]);

// Primary names carry; secondary names recede. The dark backing is what keeps either
// legible where a label crosses a bright star or the Milky Way band.
const PRIMARY_FONT_SIZE = 14;
const SECONDARY_FONT_SIZE = 11.5;
const PRIMARY_OPACITY = 0.94;
const SECONDARY_OPACITY = 0.52;

/**
 * How far collision avoidance may move a name from its pattern's centroid before the name is
 * dropped instead. A label nudged clear across the screen is worse than no label: it reads as
 * belonging to whatever it landed on.
 */
const MAX_LABEL_DETACHMENT_PX = 78;

type Props = {
  constellations: HorizontalConstellation[];
  project: ProjectFn;
  box: { width: number; height: number };
  palette: SkyPalette;
  nightMode: boolean;
  placeLabel?: LabelPlacer;
  showLabels?: boolean;
  showNodes?: boolean;
  fullSphere?: boolean;
  // LABEL-PRIORITY SPLIT. The shared label placer is first-come-first-served, and z-order
  // forces the constellation FIGURES to render before the stars (lines belong under star
  // discs). If this layer also placed its labels in that early pass, constellation names
  // (priority 3) would claim slots before star names (priority 2) — inverting the ladder.
  //   • labelsOnly=false (default): render FIGURES only (lines + nodes), never labels.
  //   • labelsOnly=true: render LABELS only — mounted LATE (after stars & planets) so the
  //     names claim their slots in correct priority order.
  labelsOnly?: boolean;
  onSelect: (object: SelectedObject) => void;
};

export function ConstellationLayer({
  constellations,
  project,
  box,
  palette,
  nightMode,
  placeLabel,
  showLabels = true,
  showNodes = true,
  fullSphere = false,
  labelsOnly = false,
  onSelect,
}: Props) {
  // Render one constellation's NAME through the shared placer. Returns null when labels are
  // off, the centroid is off-screen/behind, or the placer finds no clean slot (priority-3
  // suppression). Kept identical to the pre-split behavior — only WHEN it runs changed.
  const renderLabel = (c: HorizontalConstellation) => {
    if (!showLabels) return null;
    const centroid = project(c.centroid.azimuthDegrees, c.centroid.altitudeDegrees);
    const labelVisible =
      !centroid.behind &&
      centroid.x > 14 &&
      centroid.x < box.width - 14 &&
      centroid.y > 38 &&
      centroid.y < box.height - 110;
    if (!labelVisible) return null;

    // A REGION name, not an object name — so it sits BELOW star and planet labels. Because
    // `centered` = true, the placer treats x as the CENTRE (matches textAnchor="middle").
    // Only label a pattern that is actually up. A centroid can project on-screen while the
    // figure itself is below the horizon, so require at least one visible member star.
    const anyStarUp = c.points.some((pt) => pt.aboveHorizon);
    if (!anyStarUp && !fullSphere) return null;

    // Asterisms carry both names: the one people use, and the constellation it sits inside.
    const label = (c.familiarName ? `${c.familiarName} · ${c.name}` : c.name).toUpperCase();
    const isPrimary = PRIMARY_CONSTELLATIONS.has(c.id);
    const fontSize = isPrimary ? PRIMARY_FONT_SIZE : SECONDARY_FONT_SIZE;
    const labelOpacity = isPrimary ? PRIMARY_OPACITY : SECONDARY_OPACITY;
    const position = placeLabel
      ? placeLabel(centroid.x, centroid.y, label, fontSize, undefined, true, { weight: 600, letterSpacing: 1.4 })
      : { x: centroid.x, y: centroid.y };
    // No clean slot → dropped (priority 3, below planets and named stars).
    if (!Number.isFinite(position.x)) return null;
    // Nudged so far it no longer reads as this pattern's name → drop it too.
    if (Math.hypot(position.x - centroid.x, position.y - centroid.y) > MAX_LABEL_DETACHMENT_PX) {
      return null;
    }

    // A named anchor star (Polaris) gets its own small label, so the pattern teaches the sky
    // rather than just naming itself. Rendered only when that star is above the horizon.
    const anchorIndex = c.anchorStarIndex;
    const anchorPoint = anchorIndex !== undefined ? c.points[anchorIndex] : undefined;
    const anchorProjected =
      anchorPoint && (anchorPoint.aboveHorizon || fullSphere)
        ? project(anchorPoint.azimuthDegrees, anchorPoint.altitudeDegrees)
        : null;
    const anchorVisible =
      anchorProjected &&
      !anchorProjected.behind &&
      anchorProjected.x > 14 &&
      anchorProjected.x < box.width - 14 &&
      anchorProjected.y > 38 &&
      anchorProjected.y < box.height - 110;

    return (
      <G key={`${c.id}-label`}>
        {anchorVisible && c.anchorStarName && (
          <G>
            <SvgText
              x={anchorProjected.x + 10}
              y={anchorProjected.y - 8}
              fill="none"
              stroke="#05070F"
              strokeWidth={3}
              strokeOpacity={0.8}
              strokeLinejoin="round"
              fontSize={12}
              fontWeight="700"
              letterSpacing={0.8}
            >
              {c.anchorStarName}
            </SvgText>
            <SvgText
              x={anchorProjected.x + 10}
              y={anchorProjected.y - 8}
              fill={nightMode ? palette.conLabel : CON_LABEL_GOLD}
              fontSize={12}
              fontWeight="700"
              letterSpacing={0.8}
              opacity={0.95}
            >
              {c.anchorStarName}
            </SvgText>
          </G>
        )}
        {/* Two-pass dark backing: a soft wide halo to lift the name off the sky, then a
            tighter outline for crisp edges. This is what makes a label readable where it
            crosses a bright star or the Milky Way, without adding a solid UI plate. */}
        <SvgText
          x={position.x}
          y={position.y}
          fill="none"
          stroke="#05070F"
          strokeWidth={isPrimary ? 5 : 4}
          strokeOpacity={isPrimary ? 0.5 : 0.4}
          strokeLinejoin="round"
          fontSize={fontSize}
          fontWeight="600"
          letterSpacing={1.4}
          textAnchor="middle"
        >
          {label}
        </SvgText>
        <SvgText
          x={position.x}
          y={position.y}
          fill="none"
          stroke="#05070F"
          strokeWidth={2}
          strokeOpacity={0.85}
          strokeLinejoin="round"
          fontSize={fontSize}
          fontWeight="600"
          letterSpacing={1.4}
          textAnchor="middle"
        >
          {label}
        </SvgText>
        <SvgText
          x={position.x}
          y={position.y}
          fill={nightMode ? palette.conLabel : CON_LABEL_GOLD}
          fontSize={fontSize}
          fontWeight="600"
          letterSpacing={1.4}
          opacity={labelOpacity}
          textAnchor="middle"
        >
          {label}
        </SvgText>
        <Circle
          cx={position.x}
          cy={position.y - 3}
          r={26}
          fill="transparent"
          onPress={() =>
            onSelect({
              kind: "constellation",
              id: c.id,
              name: c.name,
              subtitle: "Constellation",
              facts: [{ label: "Best season", value: c.season }],
              description: c.myth,
            })
          }
        />
      </G>
    );
  };

  // LABELS-ONLY pass: cheap (projects centroids only), mounted late for correct priority.
  if (labelsOnly) {
    return <G>{constellations.map((c) => renderLabel(c))}</G>;
  }

  // FIGURES pass: lines + nodes. Labels are handled by the separate labels-only mount, so
  // this pass never draws them (renderLabel short-circuits on !showLabels when the canvas
  // passes showLabels={false} here).
  return (
    <G>
      {constellations.map((c) => {
        const projected = c.points.map((pt) => project(pt.azimuthDegrees, pt.altitudeDegrees));
        const lineColor = nightMode ? palette.line : GOLD;

        const usedPts = new Set<number>();
        const segments = c.lines
          .filter(([i, j]) => {
            const a = projected[i];
            const b = projected[j];
            if (!a || !b || a.behind || b.behind) return false;
            const margin = 70;
            if (a.x < -margin || a.x > box.width + margin || a.y < -margin || a.y > box.height + margin) return false;
            if (b.x < -margin || b.x > box.width + margin || b.y < -margin || b.y > box.height + margin) return false;
            // Drop only segments that are IMPLAUSIBLY long — a wrap artefact where the two
            // endpoints landed on opposite sides of the projection seam and the line would
            // be drawn straight across the viewport.
            //
            // This used to be a flat 260px. That is smaller than the screen, so zooming in
            // (which legitimately spreads a pattern out) silently culled real segments and
            // the Big Dipper lost arms as you zoomed — the pattern appeared to change shape.
            // Scale the limit with the viewport instead, so genuine geometry always survives
            // and only true wrap artefacts are removed.
            if (!isPlausibleSegment(a, b, box)) return false;
            return true;
          })
          .map(([i, j], idx) => {
            usedPts.add(i);
            usedPts.add(j);
            const a = projected[i];
            const b = projected[j];
            const belowHorizon = !(c.points[i]?.aboveHorizon && c.points[j]?.aboveHorizon);
            const ix0 = a.x + (b.x - a.x) * 0.18;
            const iy0 = a.y + (b.y - a.y) * 0.18;
            const ix1 = a.x + (b.x - a.x) * 0.82;
            const iy1 = a.y + (b.y - a.y) * 0.82;

            // LINE WORK STEPS BACK (−15% opacity, thinner). The figures were still reading
            // as a diagram drawn ON the sky rather than a constellation felt WITHIN it.
            // The stars are the heroes; the lines are only a hint that joins them.
            if (!showNodes) {
              return (
                <G key={`${c.id}-l${idx}`} opacity={belowHorizon && !fullSphere ? 0.15 : 1}>
                  <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={lineColor} strokeWidth={0.55} strokeOpacity={0.29} strokeLinecap="round" />
                </G>
              );
            }

            return (
              <G key={`${c.id}-l${idx}`} opacity={belowHorizon && !fullSphere ? 0.15 : 1}>
                <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={lineColor} strokeWidth={3} strokeOpacity={0.022} strokeLinecap="round" />
                <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={lineColor} strokeWidth={0.45} strokeOpacity={0.22} strokeLinecap="round" />
                <Line x1={ix0} y1={iy0} x2={ix1} y2={iy1} stroke={lineColor} strokeWidth={1} strokeOpacity={0.29} strokeLinecap="round" />
              </G>
            );
          });

        if (segments.length === 0) return null;

        const nodes = showNodes
          ? [...usedPts].map((pointIndex) => {
              const point = projected[pointIndex];
              if (!point || point.behind) return null;
              const dim = !c.points[pointIndex]?.aboveHorizon;
              return (
                <G key={`${c.id}-n${pointIndex}`} opacity={dim && !fullSphere ? 0.15 : 1}>
                  <Circle cx={point.x} cy={point.y} r={4.5} fill={lineColor} opacity={0.055} />
                  <Circle cx={point.x} cy={point.y} r={1.2} fill={lineColor} opacity={0.72} />
                </G>
              );
            })
          : null;

        return (
          <G key={c.id}>
            {segments}
            {nodes}
            {/* Labels are drawn by the separate labels-only pass (correct priority order);
                this only fires for a hypothetical combined-mode caller (showLabels + not
                labelsOnly). The canvas figures mount passes showLabels={false}. */}
            {renderLabel(c)}
          </G>
        );
      })}
    </G>
  );
}
