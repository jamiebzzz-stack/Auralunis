// MoonDisc.tsx — a Moon that shows the phase the sky is actually in.
//
// GEOMETRY IS NOT DECIDED HERE. The lit region comes from moonLitRegionPath() in
// services/MoonPhase.ts, driven by the live illuminated fraction and waxing/waning direction,
// so the disc moves continuously through new → crescent → quarter → gibbous → full and a 30%
// waxing crescent is the mirror image of a 30% waning one. This file only decides how the
// surface looks; nothing in it may alter the terminator.
//
// The surface is drawn ONCE, in disc coordinates, and the illumination is a clip over the top.
// Maria and craters therefore stay pinned to the Moon as the phase changes rather than sliding
// around with the mask — which is what makes a rendered moon read as a real body.
//
// Two things make it read as rock rather than decoration:
//   · Maria are irregular closed curves, not ellipses. Real seas have ragged basalt margins,
//     and perfect ovals are the single strongest tell that a moon was drawn rather than seen.
//   · Craters are lit DIRECTIONALLY from the real Sun side: the interior wall facing the Sun
//     is in shadow and the far wall is lit, which is what makes a bowl look concave instead of
//     like a flat disc. The light direction follows the phase, so it stays consistent with the
//     terminator on the same frame.
//
// No blur filters: react-native-svg's filter support varies by platform, and a filter that
// silently no-ops would leave a hard edge. Softness comes from gradients, which always render.

import React, { useMemo } from "react";
import Svg, { Circle, ClipPath, Defs, G, LinearGradient, Path, RadialGradient, Stop } from "react-native-svg";
import { moonLitRegionPath } from "@/services/MoonPhase";

type Props = {
  /** Overall width/height of the disc in points. */
  size: number;
  illuminationPercent: number;
  isWaxing: boolean;
};

type Pt = readonly [number, number];

/**
 * Near-side maria as irregular closed outlines in UNIT disc coordinates (-1..1, origin at the
 * centre). Loosely placed to match the face people actually recognise: Imbrium upper left,
 * Serenitatis and Tranquillitatis upper right, Procellarum down the western limb, Crisium as
 * the small detached oval on the eastern edge.
 */
// The great basalt plains are genuinely dark — roughly half the reflectance of the highlands —
// and they are what makes the near side recognisable at a glance. The major maria are set
// heavier than the smaller ones so the familiar face resolves rather than reading as uniform mottling.
const MARIA: ReadonlyArray<{ pts: ReadonlyArray<Pt>; o: number }> = [
  // Mare Imbrium — large, roughly circular basin with a ragged southern margin.
  { o: 0.62, pts: [[-0.44, -0.56], [-0.16, -0.62], [0.04, -0.46], [0.00, -0.24], [-0.18, -0.14], [-0.42, -0.20], [-0.56, -0.38]] },
  // Mare Serenitatis — smoother oval, tilted.
  { o: 0.60, pts: [[0.14, -0.50], [0.38, -0.52], [0.52, -0.36], [0.48, -0.16], [0.28, -0.10], [0.12, -0.24]] },
  // Mare Tranquillitatis — irregular, opens toward the limb.
  { o: 0.58, pts: [[0.30, -0.06], [0.54, -0.10], [0.68, 0.06], [0.62, 0.26], [0.40, 0.30], [0.26, 0.16]] },
  // Oceanus Procellarum — the big elongated western plain.
  { o: 0.52, pts: [[-0.72, -0.30], [-0.52, -0.34], [-0.40, -0.10], [-0.44, 0.22], [-0.58, 0.44], [-0.74, 0.30], [-0.80, 0.00]] },
  // Mare Nubium / Humorum — the southern cluster, read as one soft region.
  { o: 0.44, pts: [[-0.30, 0.24], [-0.06, 0.20], [0.10, 0.36], [0.00, 0.54], [-0.22, 0.56], [-0.34, 0.42]] },
  // Mare Fecunditatis — lower east.
  { o: 0.40, pts: [[0.38, 0.34], [0.58, 0.30], [0.66, 0.46], [0.54, 0.60], [0.38, 0.54]] },
  // Mare Crisium — small, detached, distinctly oval.
  { o: 0.50, pts: [[0.62, -0.40], [0.78, -0.42], [0.84, -0.28], [0.74, -0.18], [0.62, -0.26]] },
];

/** Craters in unit coordinates. `r` is the bowl radius, also in unit coordinates. */
const CRATERS: ReadonlyArray<{ x: number; y: number; r: number; o: number }> = [
  { x: -0.06, y: 0.58, r: 0.10, o: 1.00 }, // Tycho
  { x: 0.30, y: 0.66, r: 0.06, o: 0.72 },
  { x: -0.34, y: 0.34, r: 0.07, o: 0.66 },
  { x: 0.06, y: -0.70, r: 0.055, o: 0.60 },
  { x: -0.62, y: -0.20, r: 0.05, o: 0.54 },
  { x: 0.70, y: 0.16, r: 0.045, o: 0.50 },
  { x: -0.20, y: -0.06, r: 0.04, o: 0.46 },
  { x: 0.16, y: 0.06, r: 0.035, o: 0.42 },
];

/**
 * Closed Catmull-Rom spline through the given unit-space points, emitted as cubic beziers in
 * absolute coordinates. Interpolating instead of listing bezier handles lets each sea be
 * described by a handful of readable points while still coming out as a smooth, irregular
 * outline rather than a polygon.
 */
function smoothClosedPath(pts: ReadonlyArray<Pt>, cx: number, cy: number, R: number): string {
  const n = pts.length;
  if (n < 3) return "";
  const at = (i: number): Pt => {
    const p = pts[((i % n) + n) % n];
    return [cx + p[0] * R, cy + p[1] * R];
  };
  const start = at(0);
  let d = `M ${start[0].toFixed(2)} ${start[1].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return `${d} Z`;
}

export function MoonDisc({ size, illuminationPercent, isWaxing }: Props) {
  const R = size / 2;
  const cx = R;
  const cy = R;

  const litPath = useMemo(
    () => moonLitRegionPath(cx, cy, R, illuminationPercent, isWaxing),
    [cx, cy, R, illuminationPercent, isWaxing]
  );

  const mariaPaths = useMemo(
    () => MARIA.map((m) => ({ d: smoothClosedPath(m.pts, cx, cy, R), o: m.o })),
    [cx, cy, R]
  );

  // The Sun lies on the lit limb's side, so the terminator and the crater shading agree.
  const sunX = isWaxing ? 1 : -1;

  // Earthshine is sunlight reflected off Earth onto the lunar night side. It is only genuinely
  // visible near new moon — by first quarter the lit crescent overwhelms it — so it fades out
  // rather than glowing at every phase.
  const earthshine = Math.max(0, 1 - illuminationPercent / 45);

  /** Maria + craters. `lit` selects the fully-shaded treatment or the faint night-side one. */
  const surface = (lit: boolean, keyPrefix: string) => {
    const mariaOpacity = lit ? 1 : 0.22;
    const craterOpacity = lit ? 1 : 0.12; // the night side should suggest terrain, not detail it
    return (
      <G>
        {mariaPaths.map((m, i) => (
          <Path key={`${keyPrefix}-m${i}`} d={m.d} fill="#6F6C64" opacity={m.o * mariaOpacity} />
        ))}
        {CRATERS.map((c, i) => {
          const x = cx + c.x * R;
          const y = cy + c.y * R;
          const r = c.r * R;
          // Displacement scales with the CRATER, not the disc. Scaling it to the disc made the
          // shadow and highlight overlap almost completely, so they cancelled and every crater
          // read as a flat pale bubble instead of a hollow.
          const off = r * 0.35;
          return (
            <G key={`${keyPrefix}-c${i}`} opacity={c.o * craterOpacity}>
              {/* The bowl itself: darker than the surrounding terrain, so it reads as sunken. */}
              <Circle cx={x} cy={y} r={r} fill="#8E8B83" opacity={0.6} />
              {/* Interior wall facing the Sun turns away from it, so that side is shadowed… */}
              <Circle cx={x + sunX * off} cy={y} r={r * 0.88} fill="#4B4945" opacity={0.5} />
              {/* …while the far wall catches the light. The pair is what makes it concave. */}
              <Circle cx={x - sunX * off * 0.85} cy={y} r={r * 0.6} fill="#FFFEF8" opacity={0.5} />
              {/* Faint rim so the crater has an edge rather than dissolving into the surface. */}
              <Circle
                cx={x}
                cy={y}
                r={r}
                fill="none"
                stroke="#F2EFE6"
                strokeWidth={Math.max(0.4, r * 0.1)}
                opacity={0.22}
              />
            </G>
          );
        })}
      </G>
    );
  };

  return (
    <Svg width={size} height={size}>
      <Defs>
        {/* Lit surface: neutral lunar grey, brightest where the Sun is highest on the disc,
            falling away toward the limb. Warm-neutral rather than blue — the Moon is rock. */}
        <RadialGradient id="moon-lit" cx={isWaxing ? "62%" : "38%"} cy="38%" r="76%">
          <Stop offset="0" stopColor="#FBF9F1" />
          <Stop offset="0.5" stopColor="#D2CFC4" />
          <Stop offset="0.82" stopColor="#A09D93" />
          <Stop offset="1" stopColor="#7B7972" />
        </RadialGradient>
        {/* Night side: near-neutral dark rock, only faintly cool. */}
        <RadialGradient id="moon-dark" cx="50%" cy="50%" r="70%">
          <Stop offset="0" stopColor="#2C2E33" />
          <Stop offset="1" stopColor="#1A1B20" />
        </RadialGradient>
        {/* Softens the terminator: the lit fill dims slightly as it meets the shadow. */}
        <LinearGradient id="moon-terminator" x1={isWaxing ? "0" : "1"} y1="0" x2={isWaxing ? "1" : "0"} y2="0">
          <Stop offset="0" stopColor="#101013" stopOpacity="0.5" />
          <Stop offset="0.14" stopColor="#101013" stopOpacity="0.1" />
          <Stop offset="0.36" stopColor="#101013" stopOpacity="0" />
        </LinearGradient>
        <ClipPath id="moon-disc">
          <Circle cx={cx} cy={cy} r={R} />
        </ClipPath>
        <ClipPath id="moon-lit-region">
          <Path d={litPath} />
        </ClipPath>
      </Defs>

      {/* Night hemisphere. Earthshine is a faint cool wash — the one place blue belongs. */}
      <G clipPath="url(#moon-disc)">
        <Circle cx={cx} cy={cy} r={R} fill="url(#moon-dark)" />
        {earthshine > 0.02 && (
          <Circle cx={cx} cy={cy} r={R} fill="#5E76A6" opacity={0.13 * earthshine} />
        )}
        {surface(false, "dark")}
      </G>

      {/* Lit hemisphere. Same surface geography, clipped to the real phase. */}
      <G clipPath="url(#moon-disc)">
        <G clipPath="url(#moon-lit-region)">
          <Circle cx={cx} cy={cy} r={R} fill="url(#moon-lit)" />
          {surface(true, "lit")}
          {/* Terminator falloff, inside the lit region so it only darkens that edge. */}
          <Circle cx={cx} cy={cy} r={R} fill="url(#moon-terminator)" />
        </G>
      </G>

      {/* Limb: a hairline that reads as the edge of a sphere. Deliberately not a glow — an
          outline bright enough to notice is the thing that makes a moon look like a sticker. */}
      <Circle
        cx={cx}
        cy={cy}
        r={R - 0.5}
        fill="none"
        stroke="#D9D6CD"
        strokeWidth={Math.max(0.5, R * 0.012)}
        opacity={0.16}
      />
    </Svg>
  );
}
