import React from "react";
import { Circle, ClipPath, Defs, Ellipse, G, RadialGradient, Stop, Text as SvgText } from "react-native-svg";
import type { SkyBody } from "../ephemeris/SkyEphemerisService";
import type { ProjectFn, SkyPalette, SelectedObject } from "../SkyLensVisual";
import type { LabelPlacer } from "../labelLayout";

type Props = {
  moon: SkyBody | undefined;
  illuminationPercent: number;
  project: ProjectFn;
  palette: SkyPalette;
  nightMode: boolean;
  showLabels?: boolean;
  heroMode?: boolean;
  fullSphere?: boolean;
  placeLabel?: LabelPlacer;
  onSelect: (object: SelectedObject) => void;
};

export const MOON_RADIUS = 16.5;
const R = MOON_RADIUS;

export function MoonLayer({ moon, illuminationPercent, project, palette, nightMode, showLabels = true, heroMode = true, fullSphere = false, placeLabel, onSelect }: Props) {
  void fullSphere;
  if (!moon || !moon.aboveHorizon) return null;

  const p = project(moon.azimuthDegrees, moon.altitudeDegrees);
  if (!p.onScreen) return null;

  const f = Math.max(0, Math.min(1, illuminationPercent / 100));
  const shadowCx = p.x + f * 2 * R;
  const shadowColor = nightMode ? "#300A0A" : "#142040";
  const shadowOp = nightMode ? 0.8 : 0.78;
  const low = Math.max(0, Math.min(1, (14 - moon.altitudeDegrees) / 14));
  const flare = f * (nightMode ? 0 : 1);

  const surfaceBright = nightMode ? "#E08A8A" : "#FFFDF5";
  const surfaceMid = palette.moon;
  const surfaceLimb = nightMode ? "#7A1C1C" : "#C7CDDC";
  const mare = nightMode ? "rgba(120,30,30,0.40)" : "rgba(74,82,104,0.42)";
  const craterShade = nightMode ? "rgba(90,22,22,0.45)" : "rgba(60,68,92,0.5)";
  const craterRim = nightMode ? "rgba(230,150,150,0.5)" : "rgba(255,253,240,0.6)";

  const cx = p.x;
  const cy = p.y;

  return (
    <G>
      <Defs>
        <ClipPath id="skylens-moon-clip">
          <Circle cx={cx} cy={cy} r={R} />
        </ClipPath>
        <RadialGradient id="skylens-moon-scatter" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#FFF6DC" stopOpacity="0.18" />
          <Stop offset="34%" stopColor={palette.moon} stopOpacity="0.065" />
          <Stop offset="100%" stopColor={palette.moon} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="skylens-moon-bloom" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#FFFBEF" stopOpacity="0.42" />
          <Stop offset="58%" stopColor={palette.moon} stopOpacity="0.13" />
          <Stop offset="100%" stopColor={palette.moon} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="skylens-moon-mare" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={mare} stopOpacity="1" />
          <Stop offset="55%" stopColor={mare} stopOpacity="0.8" />
          <Stop offset="100%" stopColor={mare} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="skylens-moon-terminator" cx={shadowCx} cy={cy} r={R} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={shadowColor} stopOpacity={shadowOp} />
          <Stop offset="0.7" stopColor={shadowColor} stopOpacity={shadowOp} />
          <Stop offset="1" stopColor={shadowColor} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="skylens-moon-surface" cx="43%" cy="40%" r="64%">
          <Stop offset="0%" stopColor={surfaceBright} stopOpacity="1" />
          <Stop offset="62%" stopColor={surfaceMid} stopOpacity="1" />
          <Stop offset="100%" stopColor={surfaceLimb} stopOpacity="1" />
        </RadialGradient>
        <RadialGradient id="skylens-moon-horizon" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#FFC774" stopOpacity={0.32 * low} />
          <Stop offset="45%" stopColor="#E89A47" stopOpacity={0.11 * low} />
          <Stop offset="100%" stopColor="#E89A47" stopOpacity="0" />
        </RadialGradient>
      </Defs>

      {heroMode && <Circle cx={cx} cy={cy} r={R * 3.2} fill="url(#skylens-moon-scatter)" />}
      {heroMode && low > 0.02 && <Circle cx={cx} cy={cy + R * 0.5} r={R * 2.8} fill="url(#skylens-moon-horizon)" />}
      {heroMode && <Circle cx={cx} cy={cy} r={R * 1.65} fill="url(#skylens-moon-bloom)" />}

      <Circle cx={cx} cy={cy} r={R} fill={heroMode ? "url(#skylens-moon-surface)" : (nightMode ? palette.moon : "#EDEFF5")} />

      <G clipPath="url(#skylens-moon-clip)">
        {heroMode && (
          <>
            <Circle cx={cx - R * 0.34} cy={cy - R * 0.24} r={R * 0.4} fill="url(#skylens-moon-mare)" />
            <Circle cx={cx + R * 0.16} cy={cy + R * 0.32} r={R * 0.31} fill="url(#skylens-moon-mare)" />
            <Circle cx={cx + R * 0.42} cy={cy - R * 0.36} r={R * 0.2} fill="url(#skylens-moon-mare)" />
            <Circle cx={cx - R * 0.06} cy={cy + R * 0.08} r={R * 0.24} fill="url(#skylens-moon-mare)" />
            <Circle cx={cx + R * 0.5} cy={cy + R * 0.46} r={R * 0.1} fill={craterShade} />
            <Circle cx={cx + R * 0.5} cy={cy + R * 0.44} r={R * 0.1} fill="none" stroke={craterRim} strokeWidth={0.5} />
            <Circle cx={cx - R * 0.5} cy={cy + R * 0.34} r={R * 0.08} fill={craterShade} />
            <Circle cx={cx + R * 0.08} cy={cy - R * 0.52} r={R * 0.07} fill={craterShade} />
          </>
        )}
        <Circle cx={shadowCx} cy={cy} r={R} fill="url(#skylens-moon-terminator)" />
        {heroMode && low > 0.02 && <Circle cx={cx} cy={cy} r={R} fill="#F0A24E" opacity={0.24 * low} />}
      </G>

      <Circle cx={cx} cy={cy} r={R} fill="none" stroke={palette.moon} strokeOpacity={0.45} strokeWidth={0.6} />
      {heroMode && flare > 0.05 && <Circle cx={cx} cy={cy} r={R * 1.16} fill="none" stroke="#BFD8FF" strokeOpacity={0.09 * flare} strokeWidth={0.8} />}
      {heroMode && flare > 0.05 && <Ellipse cx={cx} cy={cy} rx={R * 3.2} ry={R * 0.075} fill="#DCEBFF" opacity={0.065 * flare} />}

      {/* Large invisible target so the Moon remains selectable after the sky settles. */}
      <Circle
        cx={cx}
        cy={cy}
        r={48}
        fill="transparent"
        onPress={() =>
          onSelect({
            kind: "moon",
            id: "moon",
            name: "Moon",
            subtitle: "Earth's satellite",
            facts: [
              { label: "Illumination", value: `${Math.round(illuminationPercent)}%` },
              { label: "Azimuth", value: `${Math.round(moon.azimuthDegrees)}°` },
              { label: "Altitude", value: `${Math.round(moon.altitudeDegrees)}°` }
            ]
          })
        }
      />

      {showLabels && (() => {
        if (placeLabel) placeLabel.reserveCircle(cx, cy, R * 1.2);
        const avoid = { x: cx, y: cy, r: R * 1.35 };
        const fallbackX = cx + R * 1.35 + 6;
        const placed = placeLabel ? placeLabel(fallbackX, cy + 4, "Moon", 17, avoid) : null;
        const lp = placed && Number.isFinite(placed.x) ? placed : { x: fallbackX, y: cy + 4 };
        return (
          <G>
            <SvgText x={lp.x} y={lp.y} fill="none" stroke="#050914" strokeWidth={2.2} strokeOpacity={0.5} fontSize={17} fontWeight="700">
              Moon
            </SvgText>
            <SvgText x={lp.x} y={lp.y} fill={palette.starLabel} fontSize={17} fontWeight="700" opacity={0.96}>
              Moon
            </SvgText>
          </G>
        );
      })()}
    </G>
  );
}
