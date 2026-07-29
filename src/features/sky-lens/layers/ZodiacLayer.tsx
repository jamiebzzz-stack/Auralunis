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
  /** Shared placer keeps zodiac glyphs clear of UI chrome and celestial labels. */
  placeLabel?: LabelPlacer;
  /** Artwork and glyphs render in separate passes so glyphs remain lowest priority. */
  labelsOnly?: boolean;
  onSelect: (object: SelectedObject) => void;
};

const GOLD = "#D9A84E";
const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const cardinalFor = (az: number) => CARDINALS[Math.round(((az % 360) + 360) % 360 / 45) % 8];

// Zodiac figures intentionally use glyph-only labels. The constellation layer already draws
// names such as SAGITTARIUS and CAPRICORNUS; repeating those names here created the doubled,
// cluttered labels seen on physical devices. Tapping the glyph still opens the full sign card.
export function ZodiacLayer({ zodiac, project, palette, nightMode, sun, birthSignId, placeLabel, labelsOnly = false, onSelect }: Props) {
  const lineColor = nightMode ? palette.line : GOLD;
  const symbolColor = nightMode ? palette.conLabel : GOLD;
  const inlineGlyphs = !placeLabel && !labelsOnly;

  const glyphUnit = (
    key: string,
    ax: number,
    ay: number,
    sign: ZodiacData["signs"][number],
    isCurrent: boolean,
    isBirth: boolean
  ) => (
    <G key={key}>
      {isCurrent && <Circle cx={ax} cy={ay} r={15} fill={GOLD} opacity={0.18} />}
      <SvgText
        x={ax}
        y={ay + 6}
        textAnchor="middle"
        fontSize={isCurrent ? 22 : 18}
        fill={symbolColor}
        opacity={isCurrent ? 0.95 : 0.52}
      >
        {sign.symbol}
      </SvgText>
      {isCurrent && (
        <SvgText x={ax} y={ay + 21} textAnchor="middle" fontSize={8} fontWeight="800" fill={GOLD} opacity={0.85}>
          ☀ Sun is here
        </SvgText>
      )}
      {isBirth && (
        <SvgText x={ax} y={ay - 19} textAnchor="middle" fontSize={8} fontWeight="800" fill="#FFE9B0" opacity={0.9}>
          ✦ Your sign
        </SvgText>
      )}
    </G>
  );

  if (labelsOnly) {
    if (!placeLabel) return null;
    return (
      <G>
        {zodiac.signs.map((sign, idx) => {
          const center = project(sign.center.azimuthDegrees, sign.center.altitudeDegrees);
          if (center.behind || !sign.center.aboveHorizon) return null;
          const isCurrent = !nightMode && idx === zodiac.sunSignIndex;
          const isBirth = !!birthSignId && sign.id === birthSignId;
          const footprint = unitFootprint([
            { text: sign.symbol, fontSize: isCurrent ? 22 : 18, dy: 0 },
            ...(isCurrent ? [{ text: "☀ Sun is here", fontSize: 8, dy: 21, weight: 800 }] : []),
            ...(isBirth ? [{ text: "✦ Your sign", fontSize: 8, dy: -19, weight: 800 }] : [])
          ]);
          const placed = placeLabel(center.x, center.y, sign.symbol, isCurrent ? 22 : 18, undefined, true, { footprint });
          if (!Number.isFinite(placed.x)) return null;
          return glyphUnit(sign.id, placed.x, placed.y, sign, isCurrent, isBirth);
        })}
      </G>
    );
  }

  return (
    <G>
      {zodiac.boundaries.map((boundary, index) => {
        const a = project(boundary.a.azimuthDegrees, boundary.a.altitudeDegrees);
        const b = project(boundary.b.azimuthDegrees, boundary.b.altitudeDegrees);
        if (a.behind || b.behind) return null;
        return (
          <Line
            key={`zb-${index}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={GOLD}
            strokeWidth={1}
            strokeOpacity={0.08}
            strokeDasharray="3 5"
          />
        );
      })}

      {zodiac.signs.map((sign, idx) => {
        const isCurrent = !nightMode && idx === zodiac.sunSignIndex;
        const isBirth = !!birthSignId && sign.id === birthSignId;
        const projectedStars = sign.starPositions.map((star) => project(star.azimuthDegrees, star.altitudeDegrees));
        const lineOpacity = isCurrent ? 0.8 : 0.5;

        const segments = sign.lines
          .filter(([i, j]) =>
            projectedStars[i] && projectedStars[j] && !projectedStars[i].behind && !projectedStars[j].behind &&
            sign.starPositions[i]?.aboveHorizon && sign.starPositions[j]?.aboveHorizon)
          .map(([i, j], index) => (
            <Line
              key={`${sign.id}-l${index}`}
              x1={projectedStars[i].x}
              y1={projectedStars[i].y}
              x2={projectedStars[j].x}
              y2={projectedStars[j].y}
              stroke={lineColor}
              strokeWidth={isCurrent ? 1.6 : 1.2}
              strokeOpacity={lineOpacity}
              strokeLinecap="round"
            />
          ));

        const dots = sign.starPositions.map((star, index) => {
          if (!star.aboveHorizon || !projectedStars[index] || !projectedStars[index].onScreen) return null;
          return (
            <Circle
              key={`${sign.id}-s${index}`}
              cx={projectedStars[index].x}
              cy={projectedStars[index].y}
              r={magnitudeToRadius(star.magnitude)}
              fill={nightMode ? palette.star : "#FFF1C4"}
            />
          );
        });

        const center = project(sign.center.azimuthDegrees, sign.center.altitudeDegrees);
        const centerVisible = !center.behind && sign.center.aboveHorizon;

        return (
          <G key={sign.id}>
            {segments}
            {dots}
            {centerVisible && (
              <G>
                <Circle
                  cx={center.x}
                  cy={center.y}
                  r={26}
                  fill="transparent"
                  onPress={() => {
                    const where = sign.center.aboveHorizon
                      ? `Visible (${cardinalFor(sign.center.azimuthDegrees)} sky)`
                      : "Below horizon";
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
                  }}
                />
                {inlineGlyphs && glyphUnit(`${sign.id}-inline`, center.x, center.y, sign, isCurrent, isBirth)}
              </G>
            )}
          </G>
        );
      })}

      {sun && sun.aboveHorizon && !nightMode && (() => {
        const projectedSun = project(sun.azimuthDegrees, sun.altitudeDegrees);
        if (projectedSun.behind || !projectedSun.onScreen) return null;
        return <SvgText x={projectedSun.x} y={projectedSun.y + 5} textAnchor="middle" fontSize={16}>☀</SvgText>;
      })()}
    </G>
  );
}
