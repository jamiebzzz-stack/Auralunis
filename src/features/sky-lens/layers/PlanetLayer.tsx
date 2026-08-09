import React from "react";
import { Circle, Defs, G, RadialGradient, Stop, Text as SvgText } from "react-native-svg";
import type { SkyBody } from "../ephemeris/SkyEphemerisService";
import { PLANET_COLORS, type ProjectFn, type SkyPalette, type SelectedObject } from "../SkyLensVisual";
import type { LabelPlacer } from "../labelLayout";
import { renderPlanetIllustration } from "./PlanetIllustrations";

type Props = {
  bodies: SkyBody[];
  project: ProjectFn;
  palette: SkyPalette;
  nightMode: boolean;
  placeLabel?: LabelPlacer;
  showLabels?: boolean;
  labelsOnly?: boolean;
  useIllustrations?: boolean;
  zoom?: number;
  fullSphere?: boolean;
  onSelect: (object: SelectedObject) => void;
};

const PLANET_IDS = new Set(["mercury", "venus", "mars", "jupiter", "saturn"]);
const STYLE: Record<string, { disc: number; glow: number }> = {
  mercury: { disc: 6.8, glow: 14.5 },
  venus: { disc: 12, glow: 28 },
  mars: { disc: 12, glow: 26 },
  jupiter: { disc: 14.5, glow: 26.5 },
  saturn: { disc: 13.5, glow: 25.5 },
};

const HALO: Record<string, string> = {
  mercury: "#C0C6D4",
  venus: "#FFFBEA",
  mars: "#FF5E2C",
  jupiter: "#EF9F27",
  saturn: "#D9A84E",
};

export function PlanetLayer({
  bodies,
  project,
  palette,
  nightMode,
  placeLabel,
  showLabels = true,
  labelsOnly = false,
  useIllustrations = true,
  zoom = 1,
  onSelect,
}: Props) {
  const planetScale = Math.min(1.45, Math.max(1.0, 1.0 + (zoom - 1) * 0.12));

  const visible = bodies
    .filter((body) => PLANET_IDS.has(body.id) && body.aboveHorizon)
    .map((body) => {
      const point = project(body.azimuthDegrees, body.altitudeDegrees);
      if (!point.onScreen) return null;
      const style = STYLE[body.id] ?? { disc: 8, glow: 14 };
      return { body, point, disc: style.disc * planetScale, glow: style.glow * planetScale };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  if (placeLabel && (labelsOnly || showLabels)) {
    for (const v of visible) placeLabel.reserveCircle(v.point.x, v.point.y, v.disc * 1.15);
  }

  const renderLabel = (v: (typeof visible)[number]) => {
    const { body, point, glow, disc } = v;
    const { x, y } = point;
    const ringReach = body.id === "saturn" ? disc * 2.0 : 0;
    const reach = Math.max(glow * 0.8, ringReach);
    const avoid = { x, y, r: reach };
    const fallbackX = x + reach + (body.id === "saturn" ? 12 : 6);
    const placed = placeLabel ? placeLabel(fallbackX, y + 4, body.name, 17, avoid, false, { weight: 700 }) : null;
    const labelPoint = placed && Number.isFinite(placed.x) ? placed : { x: fallbackX, y: y + 4 };
    return (
      <G key={`${body.id}-label`}>
        <SvgText x={labelPoint.x} y={labelPoint.y} fill="none" stroke="#050914" strokeWidth={2.6} strokeOpacity={0.58} fontSize={17.5} fontWeight="800">
          {body.name}
        </SvgText>
        <SvgText x={labelPoint.x} y={labelPoint.y} fill={palette.starLabel} fontSize={17.5} fontWeight="800" opacity={1}>
          {body.name}
        </SvgText>
      </G>
    );
  };

  if (labelsOnly) return <G>{visible.map((v) => renderLabel(v))}</G>;

  return (
    <G>
      <Defs>
        {Object.entries(HALO).map(([id, hue]) => (
          <RadialGradient key={id} id={`planetHalo-${id}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.34} />
            <Stop offset="24%" stopColor={hue} stopOpacity={0.34} />
            <Stop offset="52%" stopColor={hue} stopOpacity={0.14} />
            <Stop offset="100%" stopColor={hue} stopOpacity={0} />
          </RadialGradient>
        ))}
        <RadialGradient id="planetHaloNight" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={palette.accent} stopOpacity={0.2} />
          <Stop offset="55%" stopColor={palette.accent} stopOpacity={0.07} />
          <Stop offset="100%" stopColor={palette.accent} stopOpacity={0} />
        </RadialGradient>
      </Defs>

      {visible.map(({ body, point, disc, glow }) => {
        const color = nightMode ? palette.accent : PLANET_COLORS[body.id] ?? palette.accent;
        const haloId = nightMode ? "planetHaloNight" : `planetHalo-${body.id}`;
        const { x, y } = point;
        const onPress = () => {
          onSelect({
            kind: "planet",
            id: body.id,
            name: body.name,
            subtitle: "Planet",
            facts: [
              ...(body.magnitude !== undefined ? [{ label: "Magnitude", value: body.magnitude.toFixed(1) }] : []),
              { label: "Azimuth", value: `${Math.round(body.azimuthDegrees)}°` },
              { label: "Altitude", value: `${Math.round(body.altitudeDegrees)}°` },
            ],
          });
        };

        return (
          <G key={body.id}>
            <Circle cx={x} cy={y} r={glow * 1.5} fill={`url(#${haloId})`} opacity={nightMode ? 0.1 : 0.28} />
            <Circle cx={x} cy={y} r={glow} fill={`url(#${haloId})`} opacity={nightMode ? 0.2 : 0.82} />
            {!nightMode && <Circle cx={x} cy={y} r={disc * 1.75} fill={`url(#${haloId})`} opacity={0.55} />}

            {(() => {
              if (useIllustrations) {
                const illustration = renderPlanetIllustration(body.id, x, y, disc, nightMode, {
                  illumination: body.illuminationFraction
                });
                if (illustration) return illustration;
              }
              return <Circle cx={x} cy={y} r={disc} fill={color} />;
            })()}

            {!nightMode && body.id !== "venus" && (
              <Circle
                cx={x - disc * 0.3}
                cy={y - disc * 0.3}
                r={Math.max(1, disc * 0.14)}
                fill="#FFFFFF"
                opacity={0.26}
              />
            )}

            {/* Large invisible target: artwork stays refined, tapping becomes forgiving. */}
            <Circle cx={x} cy={y} r={Math.max(glow + 18, 44)} fill="transparent" onPress={onPress} />

            {showLabels && renderLabel({ body, point, disc, glow })}
          </G>
        );
      })}
    </G>
  );
}
