import React from "react";
import { G, Line, Polyline, Text as SvgText } from "react-native-svg";
import type { ProjectFn, SkyPalette } from "../SkyLensVisual";

type Props = {
  /**
   * Skip N/E/S/W and draw only the intercardinals.
   *
   * CardinalLayer is the dedicated always-on compass layer and owns the four majors. This
   * layer carries the same four in its own CARDINALS list, so with both mounted every major
   * was drawn twice — visible on device as two stacked "W" labels at the horizon. Ownership
   * is explicit rather than first-come: the identity registry would hand the win to whichever
   * mounted first, which is this layer, and the dedicated compass layer is the better label.
   */
  omitMajorCardinals?: boolean;
  project: ProjectFn;
  centerAzimuth: number;
  box: { width: number; height: number };
  palette: SkyPalette;
};

const CARDINALS: { az: number; label: string }[] = [
  { az: 0, label: "N" },
  { az: 45, label: "NE" },
  { az: 90, label: "E" },
  { az: 135, label: "SE" },
  { az: 180, label: "S" },
  { az: 225, label: "SW" },
  { az: 270, label: "W" },
  { az: 315, label: "NW" }
];

// Builds an SVG polyline string for a small-circle of constant altitude, sampled
// in azimuth around where the device points. Points that fall behind the camera
// are dropped so the line never wraps across the screen.
function altitudeArc(project: ProjectFn, altitude: number, centerAz: number): string {
  const pts: string[] = [];
  for (let k = -100; k <= 100; k += 4) {
    const p = project(centerAz + k, altitude);
    if (!p.behind) pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
  }
  return pts.join(" ");
}

// A vertical great-circle of constant azimuth from horizon to zenith. Split into
// in-front runs so it never streaks when part of the meridian is behind the camera.
function meridianRuns(project: ProjectFn, azimuth: number): string[] {
  const runs: string[] = [];
  let run: string[] = [];
  for (let alt = 0; alt <= 88; alt += 6) {
    const p = project(azimuth, alt);
    if (p.behind) {
      if (run.length > 1) runs.push(run.join(" "));
      run = [];
      continue;
    }
    run.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
  }
  if (run.length > 1) runs.push(run.join(" "));
  return runs;
}

export function GridLayer({ project, centerAzimuth, box, palette, omitMajorCardinals = false }: Props) {
  const horizon = altitudeArc(project, 0, centerAzimuth);
  const arc30 = altitudeArc(project, 30, centerAzimuth);
  const arc60 = altitudeArc(project, 60, centerAzimuth);

  // Azimuth meridians every 30° around the full sphere.
  const meridians = Array.from({ length: 12 }, (_, i) => meridianRuns(project, i * 30));
  const zenith = project(centerAzimuth, 90);

  return (
    <G>
      {meridians.flat().map((pts, i) => (
        <Polyline key={`mer-${i}`} points={pts} fill="none" stroke={palette.grid} strokeWidth={0.8} strokeDasharray="3 7" />
      ))}
      {arc30.length > 0 && (
        <Polyline points={arc30} fill="none" stroke={palette.grid} strokeWidth={1} strokeDasharray="4 6" />
      )}
      {arc60.length > 0 && (
        <Polyline points={arc60} fill="none" stroke={palette.grid} strokeWidth={1} strokeDasharray="4 6" />
      )}
      {horizon.length > 0 && (
        <Polyline points={horizon} fill="none" stroke={palette.horizon} strokeWidth={1.4} />
      )}

      {/* Altitude tick labels along the meridian the device faces */}
      {[30, 60].map((alt) => {
        const p = project(centerAzimuth, alt);
        if (p.behind || p.x < 0 || p.x > box.width) return null;
        return (
          <SvgText key={`alt-${alt}`} x={p.x + 4} y={p.y - 3} fill={palette.gridLabel} fontSize={12} fontWeight="600">
            {alt}°
          </SvgText>
        );
      })}

      {/* Zenith marker — shown when pointing near straight up */}
      {!zenith.behind && zenith.x > 0 && zenith.x < box.width && zenith.y > 0 && zenith.y < box.height && (
        <G>
          <Line x1={zenith.x - 7} y1={zenith.y} x2={zenith.x + 7} y2={zenith.y} stroke={palette.horizon} strokeWidth={1} />
          <Line x1={zenith.x} y1={zenith.y - 7} x2={zenith.x} y2={zenith.y + 7} stroke={palette.horizon} strokeWidth={1} />
          <SvgText x={zenith.x + 10} y={zenith.y + 3} fill={palette.gridLabel} fontSize={12} fontWeight="600">
            90° zenith
          </SvgText>
        </G>
      )}

      {/* Cardinal + intercardinal markers on the horizon */}
      {CARDINALS.filter(({ label }) => !(omitMajorCardinals && label.length === 1)).map(({ az, label }) => {
        const p = project(az, 0);
        if (p.behind || p.x < -10 || p.x > box.width + 10) return null;
        const major = label.length === 1;
        return (
          <G key={`card-${label}`}>
            <Line x1={p.x} y1={p.y - 6} x2={p.x} y2={p.y + 6} stroke={palette.horizon} strokeWidth={1} />
            <SvgText
              x={p.x}
              y={p.y + 20}
              fill={major ? palette.accent : palette.gridLabel}
              fontSize={major ? 13 : 12}
              fontWeight={major ? "900" : "600"}
              textAnchor="middle"
            >
              {label}
            </SvgText>
          </G>
        );
      })}
    </G>
  );
}
