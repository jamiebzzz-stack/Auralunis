import React from "react";
import { Circle, Defs, G, LinearGradient, Path, RadialGradient, Stop } from "react-native-svg";
import type { ProjectFn } from "../SkyLensVisual";

type Props = {
  project: ProjectFn;
  centerAzimuth: number;
  box: { width: number; height: number };
  nightMode: boolean;
  boost?: number;
};

function buildRidgePath(points: { x: number; y: number }[], width: number, height: number, lift: number) {
  if (points.length < 4) return null;
  const sorted = [...points]
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .sort((a, b) => a.x - b.x);
  if (sorted.length < 4) return null;

  const ridge = sorted.map((point, index) => {
    const wave = Math.sin(index * 1.7) * 7 + Math.sin(index * 0.63) * 4;
    return {
      x: Math.max(-20, Math.min(width + 20, point.x)),
      y: Math.max(height * 0.56, Math.min(height * 0.94, point.y - lift - wave))
    };
  });

  return [
    `M ${-24} ${height + 8}`,
    `L ${ridge[0].x.toFixed(1)} ${ridge[0].y.toFixed(1)}`,
    ...ridge.slice(1).map((point) => `L ${point.x.toFixed(1)} ${point.y.toFixed(1)}`),
    `L ${width + 24} ${height + 8}`,
    "Z"
  ].join(" ");
}

// Premium horizon treatment: projected airglow plus two extremely soft mountain ridges.
// The ridges follow the actual celestial horizon, so they sink when the phone tilts up and
// rise when the phone tilts down. They are intentionally low-contrast and never replace the sky.
export function HorizonGlowLayer({ project, centerAzimuth, box, nightMode, boost = 1 }: Props) {
  const o = (value: number) => Math.min(0.2, value * boost);
  const warmR = Math.max(84, box.height * 0.24);
  const coolR = Math.max(90, box.height * 0.24);

  const sample = (altitude: number, step = 8) => {
    const points: { x: number; y: number }[] = [];
    for (let offset = -104; offset <= 104; offset += step) {
      const projected = project(centerAzimuth + offset, altitude);
      if (!projected.behind) points.push({ x: projected.x, y: projected.y });
    }
    return points;
  };

  const horizonPoints = sample(0, 6);
  const warmPoints = sample(1.5);
  const coolPoints = sample(9);
  const farRidge = buildRidgePath(horizonPoints, box.width, box.height, 8);
  const nearRidge = buildRidgePath(horizonPoints, box.width, box.height, -5);

  return (
    <G pointerEvents="none">
      <Defs>
        <RadialGradient id="hzWarm" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={nightMode ? "#7A1718" : "#C9A878"} stopOpacity={nightMode ? 0.018 : o(0.13)} />
          <Stop offset="42%" stopColor={nightMode ? "#4B0B0C" : "#9C7E54"} stopOpacity={nightMode ? 0.008 : o(0.05)} />
          <Stop offset="100%" stopColor={nightMode ? "#4B0B0C" : "#9C7E54"} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="hzCool" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={nightMode ? "#411011" : "#5E8C9E"} stopOpacity={nightMode ? 0.008 : o(0.032)} />
          <Stop offset="60%" stopColor={nightMode ? "#260708" : "#3E6478"} stopOpacity={nightMode ? 0.004 : o(0.012)} />
          <Stop offset="100%" stopColor={nightMode ? "#260708" : "#3E6478"} stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id="hzFarRidge" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={nightMode ? "#120608" : "#101827"} stopOpacity={nightMode ? 0.38 : 0.42} />
          <Stop offset="100%" stopColor={nightMode ? "#050102" : "#030816"} stopOpacity={0.82} />
        </LinearGradient>
        <LinearGradient id="hzNearRidge" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={nightMode ? "#090203" : "#09101C"} stopOpacity={0.62} />
          <Stop offset="100%" stopColor="#02040A" stopOpacity={0.96} />
        </LinearGradient>
      </Defs>

      {coolPoints.map((point, index) => (
        <Circle key={`hc-${index}`} cx={point.x} cy={point.y} r={coolR * (0.85 + (((index * 41) % 100) / 100) * 0.3)} fill="url(#hzCool)" />
      ))}
      {warmPoints.map((point, index) => (
        <Circle key={`hw-${index}`} cx={point.x} cy={point.y} r={warmR * (0.82 + (((index * 37) % 100) / 100) * 0.36)} fill="url(#hzWarm)" />
      ))}

      {farRidge ? <Path d={farRidge} fill="url(#hzFarRidge)" opacity={nightMode ? 0.45 : 0.6} /> : null}
      {nearRidge ? <Path d={nearRidge} fill="url(#hzNearRidge)" opacity={nightMode ? 0.64 : 0.78} /> : null}
    </G>
  );
}
