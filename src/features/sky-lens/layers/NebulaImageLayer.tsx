import React from "react";
import { StyleSheet } from "react-native";
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop } from "react-native-svg";
import type { HorizontalNebula } from "../ephemeris/Nebulae";
import type { SelectedObject } from "../SkyLensVisual";
import {
  projectTarget, projectTargetWithBasis,
  type CameraFov,
  type CameraPointing,
  type CameraBasis,
  type OverlayBox,
} from "../ar/SkyLensProjection";

type Props = {
  nebulae: HorizontalNebula[];
  pointing: CameraPointing;
  /** Quaternion camera basis. When present it MUST be used, so this layer agrees with
   *  every other layer about where the camera is looking. */
  basis?: CameraBasis;
  fov: CameraFov;
  box: OverlayBox;
  visible: boolean;
  fullSphere?: boolean;
  /** Height of the bottom control dock (px) — artwork centred inside it is dropped. */
  uiBottom?: number;
  onSelect?: (object: SelectedObject) => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// THE ONE NEBULA RENDERER.
//
// Sky Lens used to run TWO nebula renderers over the same objects at the same time:
// this layer, and the procedural NebulaLayer inside SkyLensCanvas. Both were gated on
// the same `deepsky` key, so every nebula was drawn twice — doubling the opacity and
// muddying the colour. NebulaLayer's visible artwork is now retired (SkyLensCanvas);
// this file is the single source of nebula imagery.
//
// It also renders ONLY curated hero nebulae. The deep-sky catalog is 38 objects — 12
// star clusters and 9 galaxies among them — and the old renderer painted every one of
// them as a glowing emission cloud. The Beehive is not a nebula; Andromeda is not a
// nebula. They get no cloud artwork here.
// ─────────────────────────────────────────────────────────────────────────────

// Only these objects ever get cloud artwork. Curated, recognisable, and every one of
// them genuinely IS a nebula (emission / reflection / planetary / supernova remnant).
const HERO_NEBULA_IDS = new Set([
  "m42", // Orion
  "ngc2237", // Rosette
  "m1", // Crab
  "ngc7000", // North America
  "ngc6960", // Veil
  "m27", // Dumbbell
  "m57", // Ring
  "m8", // Lagoon
  "m20", // Trifid
  "m16", // Eagle
  "ngc3372", // Carina
  "m17", // Swan / Omega
]);

// Belt-and-braces: even inside the allowlist, refuse to paint a cloud over anything the
// catalog classes as a cluster or a galaxy. If someone adds "m45" to the list above by
// mistake, this stops the Pleiades becoming a pink cloud.
const CLOUD_TYPES = new Set(["emission", "reflection", "planetary", "supernova"]);

type ArtDirection = {
  scale: number;
  warm: string;
  cool: string;
  core: string;
  haze: string;
  rotation: number;
  elongated?: boolean;
  /** THE hero. Larger size ceilings and richer gradients. Exactly one object has this. */
  hero?: boolean;
};

// PALETTE — dusty rose, mauve, violet, indigo, icy blue, teal, amber, silver. No neon,
// no electric magenta, no saturated cyan, no black.
const ROSE = "#F2AEC2";
const PINK = "#F58AB0";
const VIOLET = "#9A7DE2";
const INDIGO = "#6F76D9";
const CYAN = "#7CCFE0";
const TEAL = "#66C7C1";
const AMBER = "#E8A36A";
const SILVER = "#EAF1FF";
const CREAM = "#FFF0D8";

// SIZE. `scale` multiplies the catalog radius, then a hard clamp bounds the result, then
// a screen-relative cap bounds it again (see MAX_OUTER_FRAC). Three independent ceilings,
// so no object can run away regardless of its catalog entry or the FOV.
const ART: Record<string, ArtDirection> = {
  // M42 — THE hero, and it was being strangled by rules written for its companions.
  //
  // Measured on a 16 Pro Max: the shared screen cap (MAX_OUTER_FRAC 0.09) bound BEFORE
  // the catalog radius mattered, so Orion rendered 77px wide — of which only ~63px was
  // the visible lobe — at a peak alpha of 0.72 x 0.32 = 0.23 over a bright Milky Way.
  // A speck. Raising the global opacity could never fix that; the CAPS were the bug.
  //
  // It now has its own ceilings (see MAX_*_HERO) and its own richer gradients, and it is
  // the ONLY object with hero: true. Every other nebula keeps the restrained treatment.
  // Rose + violet + soft blue, silver-white core.
  m42: { scale: 1.55, warm: ROSE, cool: "#8FB6FF", core: "#F6F2FF", haze: VIOLET, rotation: -18, hero: true },
  ngc2237: { scale: 0.9, warm: ROSE, cool: VIOLET, core: "#FFE7F5", haze: "#B08AD8", rotation: 8 },
  m1: { scale: 0.72, warm: AMBER, cool: TEAL, core: CREAM, haze: INDIGO, rotation: 28, elongated: true },
  ngc3372: { scale: 1.0, warm: AMBER, cool: TEAL, core: CREAM, haze: VIOLET, rotation: -12 },
  m8: { scale: 1.0, warm: ROSE, cool: INDIGO, core: CREAM, haze: VIOLET, rotation: 14, elongated: true },
  m20: { scale: 0.82, warm: PINK, cool: INDIGO, core: "#FFF5E8", haze: VIOLET, rotation: -8 },
  m16: { scale: 0.82, warm: AMBER, cool: VIOLET, core: "#FFE9C8", haze: INDIGO, rotation: 18 },
  m17: { scale: 0.78, warm: PINK, cool: VIOLET, core: "#FFF0D6", haze: INDIGO, rotation: -28, elongated: true },
  ngc7000: { scale: 1.0, warm: ROSE, cool: CYAN, core: "#FFE6D8", haze: INDIGO, rotation: 20, elongated: true },
  m27: { scale: 0.7, warm: TEAL, cool: "#9FC7F0", core: SILVER, haze: INDIGO, rotation: 35, elongated: true },
  m57: { scale: 0.58, warm: TEAL, cool: "#B8A6E8", core: SILVER, haze: VIOLET, rotation: 0 },
  ngc6960: { scale: 0.95, warm: CYAN, cool: VIOLET, core: SILVER, haze: INDIGO, rotation: -34, elongated: true },
};

// Curated billing order — which object wins a slot when several are on screen.
const HERO_PRIORITY = ["m42", "m8", "ngc3372", "ngc7000", "ngc6960", "ngc2237", "m20", "m16", "m17", "m1", "m27", "m57"];

// TWO. Not three. A sky with one luminous hero and one quiet companion reads as a
// composition; a sky with several competing clouds reads as a sticker sheet.
const MAX_VISIBLE_NEBULAE = 2;

// Group opacity per rank. Low-to-medium: these sit INSIDE the sky, not on top of it.
// Nudged 0.62 → 0.70 (hero) and 0.42 → 0.46 (companion) after device review — Orion read
// beautifully but a touch too faint. A ~13% lift on the hero only; the companion barely
// moves, so the composition still has one clear protagonist.
const HERO_FALLOFF = [0.72, 0.46];

const MIN_BASE = 14;
const MAX_BASE = 30;
// The outermost veil is 1.5 × base, and no ordinary nebula may exceed ~18% of the screen
// width. That bounds the drawn diameter, so a wide FOV or a fat catalog radius can't
// produce a screen-filling blob.
const MAX_OUTER_FRAC = 0.09; // × box.width, as a RADIUS
const OUTER_VEIL = 1.5;

// HERO ceilings — M42 only. 0.15 × 430pt = 64.5px outer radius → ~129px apparent width,
// inside the 90–140px target. Still a hard cap: it cannot run away on a wider screen.
const MAX_BASE_HERO = 44;
const MAX_OUTER_FRAC_HERO = 0.15;

// M42 texture — elongated feathered FILAMENTS that curve around the Trapezium, instead of
// concentric circular pools (which read as identifiable bubbles). Each is placed at an
// angle around the core and elongated TANGENTIALLY (its long axis perpendicular to the
// radius), so it wraps the centre rather than pointing at it — and, being tangential, its
// long axis never grows the radial footprint. Low per-filament opacity: no single one is
// identifiable; together they read as one integrated rose-violet cloud.
//   ang  — degrees around the core
//   dist — centre offset, × rx
//   len  — tangential half-length, × rx    wid — radial half-width, × ry
//   tone — warm | cool | haze              op  — this filament's opacity
const HERO_FILAMENTS = [
  { ang: 18,  dist: 0.52, len: 0.98, wid: 0.30, tone: "warm", op: 0.4, seed: 51 },
  { ang: 74,  dist: 0.55, len: 0.84, wid: 0.26, tone: "haze", op: 0.38, seed: 57 },
  { ang: 128, dist: 0.58, len: 0.92, wid: 0.28, tone: "cool", op: 0.4, seed: 61 },
  { ang: 196, dist: 0.5,  len: 1.0,  wid: 0.30, tone: "warm", op: 0.42, seed: 67 },
  { ang: 252, dist: 0.55, len: 0.86, wid: 0.26, tone: "haze", op: 0.38, seed: 71 },
  { ang: 312, dist: 0.58, len: 0.9,  wid: 0.30, tone: "cool", op: 0.4, seed: 73 },
  { ang: 348, dist: 0.34, len: 0.72, wid: 0.24, tone: "warm", op: 0.36, seed: 79 },
] as const;

// UI EXCLUSION ZONES. Measured against the real chrome (top HUD ≈ 150px, bottom tray +
// shutter ≈ 240px), not guessed. A nebula whose centre lands under the controls is
// dropped outright rather than drawn beneath them.
const UI_TOP = 150;
// The shutter/camera control sits bottom-right; keep clouds off it.
const SHUTTER_W = 150;
const SHUTTER_H = 230;

// Smooth, high-point organic silhouette. 28 control points and three low-frequency
// lobe harmonics — no corners, no polygon. (The retired NebulaLayer built its blobs from
// NINE points, which is exactly why they read as angular.)
function cloudPath(cx: number, cy: number, rx: number, ry: number, seed: number): string {
  const count = 28;
  const points: Array<[number, number]> = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    const fine =
      ((Math.sin(seed * 17.17 + i * 9.73) + 1) / 2) * 0.05 +
      ((Math.sin(seed * 5.31 + i * 23.9) + 1) / 2) * 0.02;
    const lobes =
      Math.cos(angle * 2 + seed * 1.7) * 0.11 +
      Math.cos(angle * 3 - seed * 0.9) * 0.07 +
      Math.cos(angle * 5 + seed * 2.3) * 0.04;
    const wobble = 0.88 + fine + lobes;
    points.push([cx + Math.cos(angle) * rx * wobble, cy + Math.sin(angle) * ry * wobble]);
  }
  const mid = (a: number, b: number): [number, number] => [
    (points[a][0] + points[b][0]) / 2,
    (points[a][1] + points[b][1]) / 2,
  ];
  const start = mid(count - 1, 0);
  let d = `M ${start[0].toFixed(1)} ${start[1].toFixed(1)}`;
  for (let i = 0; i < count; i += 1) {
    const next = mid(i, (i + 1) % count);
    d += ` Q ${points[i][0].toFixed(1)} ${points[i][1].toFixed(1)} ${next[0].toFixed(1)} ${next[1].toFixed(1)}`;
  }
  return `${d} Z`;
}

export function NebulaImageLayer({ nebulae, pointing, basis, fov, box, visible, fullSphere = false, uiBottom = 120, onSelect }: Props) {
  // One projection for this layer, matching the shared camera snapshot exactly.
  const projectWith = (az: number, alt: number) =>
    basis
      ? projectTargetWithBasis(basis, az, alt, fov, box)
      : projectTarget(pointing, az, alt, fov, box);

  if (!visible || box.width <= 0 || box.height <= 0) return null;

  const candidates = nebulae
    .filter((nebula) => {
      if (!HERO_NEBULA_IDS.has(nebula.id)) return false; // curated heroes only
      if (!ART[nebula.id]) return false;
      if (!CLOUD_TYPES.has(nebula.type)) return false; // never a cluster or a galaxy
      // HORIZON RULE. Strict: at or below the horizon, nothing is painted. No permissive
      // -20° grace band — an object at altitude −10° is under the ground.
      if (!fullSphere && nebula.altitudeDegrees <= 0) return false;
      return true;
    })
    .map((nebula, index) => {
      const projected = projectWith(nebula.azimuthDegrees, nebula.altitudeDegrees);
      if (projected.behind || !projected.onScreen) return null;

      // UI exclusion zones — drop, don't draw-under.
      if (projected.y < UI_TOP || projected.y > box.height - uiBottom) return null;
      if (projected.x > box.width - SHUTTER_W && projected.y > box.height - SHUTTER_H) return null;

      const priorityIndex = HERO_PRIORITY.indexOf(nebula.id);
      const centreDistance = Math.hypot(projected.x - box.width / 2, projected.y - box.height / 2);
      return {
        nebula,
        projected,
        index,
        // Curated billing first, then nearest-to-centre.
        rank: priorityIndex >= 0 ? priorityIndex * 10_000 + centreDistance : 100_000 + centreDistance,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, MAX_VISIBLE_NEBULAE);

  // ── DEV-ONLY M42 DIAGNOSTIC ───────────────────────────────────────────────────
  // Orion "not landing" could mean four different things (not selected / wrong position /
  // too small / too faint). This says which, instead of leaving it to guesswork.
  if (__DEV__) {
    const m42 = nebulae.find((n) => n.id === "m42");
    if (!m42) {
      console.log("[M42] absent from catalog");
    } else {
      const chosen = candidates.find((c) => c.nebula.id === "m42");
      let reject: string | null = null;
      if (!chosen) {
        if (!fullSphere && m42.altitudeDegrees <= 0) reject = `below horizon (alt ${m42.altitudeDegrees.toFixed(1)}°)`;
        else {
          const p = projectWith(m42.azimuthDegrees, m42.altitudeDegrees);
          if (p.behind) reject = "behind the viewer";
          else if (!p.onScreen) reject = `off-screen (x ${p.x.toFixed(0)}, y ${p.y.toFixed(0)})`;
          else if (p.y < UI_TOP) reject = `under the top HUD (y ${p.y.toFixed(0)} < ${UI_TOP})`;
          else if (p.y > box.height - uiBottom) reject = `under the bottom dock (y ${p.y.toFixed(0)})`;
          else reject = "lost its slot to higher-priority heroes";
        }
      }
      if (chosen) {
        const art = ART.m42;
        const maxOuter = box.width * MAX_OUTER_FRAC_HERO;
        const base = Math.min(
          Math.max(MIN_BASE, Math.min(MAX_BASE_HERO, m42.radius * art.scale)),
          maxOuter / OUTER_VEIL
        );
        const w = base * OUTER_VEIL * 2;
        const h = base * 0.84 * OUTER_VEIL * 2;
        console.log("[M42] RENDERED", {
          selected: true,
          altitudeDeg: +m42.altitudeDegrees.toFixed(2),
          x: +chosen.projected.x.toFixed(1),
          y: +chosen.projected.y.toFixed(1),
          widthPx: +w.toFixed(0),   // target 90–140
          heightPx: +h.toFixed(0),
          groupOpacity: 0.82,
          peakAlpha: +(0.82 * 0.52).toFixed(2),
        });
      } else {
        console.log("[M42] NOT RENDERED", { selected: false, altitudeDeg: +m42.altitudeDegrees.toFixed(2), reason: reject });
      }
    }
  }

  if (candidates.length === 0) return null;

  return (
    // box-none, not none: the clouds themselves ignore touches, but the hit targets below
    // stay tappable (this layer inherited nebula selection when NebulaLayer was retired).
    <Svg pointerEvents="box-none" width={box.width} height={box.height} style={StyleSheet.absoluteFillObject}>
      {candidates.map(({ nebula, projected, index }, rank) => {
        const art = ART[nebula.id];
        const isHero = !!art.hero;

        // THREE size ceilings, applied in order. The hero gets its own, larger ones.
        const maxOuter = box.width * (isHero ? MAX_OUTER_FRAC_HERO : MAX_OUTER_FRAC);
        const scaled = nebula.radius * art.scale;
        const clamped = Math.max(MIN_BASE, Math.min(isHero ? MAX_BASE_HERO : MAX_BASE, scaled));
        const base = Math.min(clamped, maxOuter / OUTER_VEIL);

        const rx = art.elongated ? base * 1.36 : base;
        const ry = art.elongated ? base * 0.62 : base * 0.84;
        const seed = index + nebula.id.length * 13;
        const warmId = `neb-warm-${nebula.id}`;
        const coolId = `neb-cool-${nebula.id}`;
        const coreId = `neb-core-${nebula.id}`;
        const hazeId = `neb-haze-${nebula.id}`;
        const rotation = `rotate(${art.rotation} ${projected.x.toFixed(1)} ${projected.y.toFixed(1)})`;

        // The hero carries roughly 1.7x the peak alpha of a companion. Measured: the old
        // 0.72 x 0.32 = 0.23 simply vanished into the Milky Way. This lands near 0.42 —
        // clearly present, still translucent, still integrated (nowhere near opaque).
        const groupOpacity = isHero ? 0.82 : HERO_FALLOFF[rank] ?? 0.42;
        const wA = isHero ? [0.52, 0.3, 0.08] : [0.32, 0.16, 0.04];
        const cA = isHero ? [0.46, 0.28, 0.07] : [0.28, 0.14, 0.03];
        const hA = isHero ? [0.26, 0.15] : [0.16, 0.09];
        const kA = isHero ? [0.5, 0.28, 0.1] : [0.42, 0.22, 0.07];

        return (
          <G key={nebula.id}>
            <G transform={rotation} opacity={groupOpacity} pointerEvents="none">
              <Defs>
                {/* Translucent mist over the Milky Way, never a solid painted patch. Every
                    gradient fades fully to zero — no hard edge anywhere. */}
                <RadialGradient id={warmId} cx="48%" cy="48%" r="52%">
                  <Stop offset="0%" stopColor={art.warm} stopOpacity={wA[0]} />
                  <Stop offset="45%" stopColor={art.warm} stopOpacity={wA[1]} />
                  <Stop offset="80%" stopColor={art.warm} stopOpacity={wA[2]} />
                  <Stop offset="100%" stopColor={art.warm} stopOpacity={0} />
                </RadialGradient>
                <RadialGradient id={coolId} cx="48%" cy="48%" r="52%">
                  <Stop offset="0%" stopColor={art.cool} stopOpacity={cA[0]} />
                  <Stop offset="45%" stopColor={art.cool} stopOpacity={cA[1]} />
                  <Stop offset="80%" stopColor={art.cool} stopOpacity={cA[2]} />
                  <Stop offset="100%" stopColor={art.cool} stopOpacity={0} />
                </RadialGradient>
                <RadialGradient id={hazeId} cx="50%" cy="50%" r="50%">
                  <Stop offset="0%" stopColor={art.haze} stopOpacity={hA[0]} />
                  <Stop offset="50%" stopColor={art.haze} stopOpacity={hA[1]} />
                  <Stop offset="100%" stopColor={art.haze} stopOpacity={0} />
                </RadialGradient>
                {/* Soft core. No white plateau, and emphatically NO dark oval stamp — the
                    centre is a diffuse swell of light, nothing else. */}
                <RadialGradient id={coreId} cx="50%" cy="50%" r="50%">
                  <Stop offset="0%" stopColor={art.core} stopOpacity={kA[0]} />
                  <Stop offset="30%" stopColor={art.core} stopOpacity={kA[1]} />
                  <Stop offset="70%" stopColor={art.core} stopOpacity={kA[2]} />
                  <Stop offset="100%" stopColor={art.core} stopOpacity={0} />
                </RadialGradient>
                {isHero && (
                  <>
                    {/* The dark dust lane — M42's "Fish's Mouth". A SOFT navy fold on one
                        flank, fully fading to transparent, NOT a central capsule or a hard
                        oval. This is what gives Orion its structure rather than a smooth orb. */}
                    <RadialGradient id={`neb-dust-${nebula.id}`} cx="50%" cy="50%" r="50%">
                      <Stop offset="0%" stopColor="#0A1226" stopOpacity={0.22} />
                      <Stop offset="55%" stopColor="#0A1226" stopOpacity={0.1} />
                      <Stop offset="100%" stopColor="#0A1226" stopOpacity={0} />
                    </RadialGradient>
                    {/* A concentrated silver-white glow behind the Trapezium, so the heart
                        blazes rather than blending into the rose. */}
                    <RadialGradient id={`neb-heart-${nebula.id}`} cx="50%" cy="50%" r="50%">
                      <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.85} />
                      <Stop offset="35%" stopColor="#EAF1FF" stopOpacity={0.4} />
                      <Stop offset="100%" stopColor="#EAF1FF" stopOpacity={0} />
                    </RadialGradient>
                  </>
                )}
              </Defs>

              {/* Outer haze → warm lobes → cool lobes → core. Overlapping feathered veils,
                  each offset, so the silhouette has no single hard boundary. 11 elements. */}
              <Path d={cloudPath(projected.x, projected.y, rx * OUTER_VEIL, ry * OUTER_VEIL, seed)} fill={`url(#${hazeId})`} />
              <Path d={cloudPath(projected.x - rx * 0.2, projected.y + ry * 0.06, rx * 1.22, ry * 1.1, seed + 3)} fill={`url(#${warmId})`} />
              <Path d={cloudPath(projected.x + rx * 0.28, projected.y - ry * 0.2, rx * 0.88, ry * 0.86, seed + 7)} fill={`url(#${coolId})`} />
              <Path d={cloudPath(projected.x + rx * 0.08, projected.y + ry * 0.26, rx * 0.7, ry * 0.62, seed + 11)} fill={`url(#${warmId})`} />
              <Path d={cloudPath(projected.x - rx * 0.12, projected.y - ry * 0.1, rx * 0.46, ry * 0.44, seed + 17)} fill={`url(#${coolId})`} />

              {/* Companion nebulae keep the simple tint pools — cheap, and at their small
                  size a soft circle never reads as a "bubble". The HERO does not use these;
                  it gets the filament system below instead. */}
              {!isHero && (
                <>
                  <Circle cx={projected.x - rx * 0.3} cy={projected.y + ry * 0.22} r={base * 0.32} fill={art.warm} opacity={0.1} />
                  <Circle cx={projected.x + rx * 0.26} cy={projected.y + ry * 0.3} r={base * 0.28} fill={art.haze} opacity={0.09} />
                  <Circle cx={projected.x + rx * 0.32} cy={projected.y - ry * 0.28} r={base * 0.2} fill={art.cool} opacity={0.09} />
                </>
              )}

              {/* HERO FILAMENTS. Seven elongated feathered veils, each placed around the
                  Trapezium and elongated TANGENTIALLY so they curve around the core instead
                  of radiating from it. Individually faint (no single one is identifiable);
                  together they weave one integrated rose-violet cloud. This replaces the
                  circular pools that read as overlapping bubbles. */}
              {isHero &&
                HERO_FILAMENTS.map((f, i) => {
                  const rad = (f.ang * Math.PI) / 180;
                  const fx = projected.x + Math.cos(rad) * f.dist * rx;
                  const fy = projected.y + Math.sin(rad) * f.dist * ry;
                  const fillId = f.tone === "warm" ? warmId : f.tone === "cool" ? coolId : hazeId;
                  // Long axis tangential = radius angle + 90°, plus the group's own rotation.
                  const tangent = f.ang + 90 + art.rotation;
                  return (
                    <G key={`fil-${i}`} transform={`rotate(${tangent.toFixed(1)} ${fx.toFixed(1)} ${fy.toFixed(1)})`}>
                      <Path d={cloudPath(fx, fy, rx * f.len, ry * f.wid, seed + f.seed)} fill={`url(#${fillId})`} opacity={f.op} />
                    </G>
                  );
                })}

              {/* THE DARK DUST CHANNEL — one soft, elongated navy fold crossing the
                  lower-right, feathered and fully fading to transparent. Carves depth into
                  the glow. Not a hard capsule, not a black stripe, never over the Trapezium. */}
              {isHero && (
                <G transform={`rotate(${(28 + art.rotation).toFixed(1)} ${(projected.x + rx * 0.24).toFixed(1)} ${(projected.y + ry * 0.3).toFixed(1)})`}>
                  <Path
                    d={cloudPath(projected.x + rx * 0.24, projected.y + ry * 0.3, rx * 0.72, ry * 0.2, seed + 41)}
                    fill={`url(#neb-dust-${nebula.id})`}
                  />
                </G>
              )}

              <Circle cx={projected.x} cy={projected.y} r={Math.max(6, base * 0.3)} fill={`url(#${coreId})`} />

              {/* Silver-white heart glow behind the Trapezium — the blaze at Orion's centre. */}
              {isHero && (
                <Circle cx={projected.x - base * 0.03} cy={projected.y + base * 0.02} r={base * 0.2} fill={`url(#neb-heart-${nebula.id})`} />
              )}

              {/* The Trapezium — the knot of hot young stars at Orion's heart. Now brighter
                  and larger-cored (full white, r up ~30%), so it reads as a blazing nursery
                  rather than a soft smudge. Kept crisp against the surrounding mist. */}
              {isHero && (
                <>
                  <Circle cx={projected.x - base * 0.05} cy={projected.y - base * 0.02} r={2} fill="#FFFFFF" opacity={1} />
                  <Circle cx={projected.x + base * 0.07} cy={projected.y + base * 0.04} r={1.6} fill="#FFFFFF" opacity={0.95} />
                  <Circle cx={projected.x + base * 0.01} cy={projected.y + base * 0.09} r={1.3} fill="#FFF8EC" opacity={0.92} />
                  <Circle cx={projected.x - base * 0.1} cy={projected.y + base * 0.06} r={1.2} fill="#EAF1FF" opacity={0.88} />
                </>
              )}

              {/* Embedded stars — what ties the cloud into the star field instead of
                  floating it on top. Kept crisp so stars stay legible over the mist. */}
              <Circle cx={projected.x - base * 0.18} cy={projected.y + base * 0.08} r={0.9} fill="#FFFDF5" opacity={0.75} />
              <Circle cx={projected.x + base * 0.22} cy={projected.y - base * 0.13} r={0.7} fill={SILVER} opacity={0.66} />
            </G>

            {/* Hit target → info card. Nebula selection used to live in NebulaLayer; it
                moves here so retiring that layer doesn't cost the user the tap. */}
            {onSelect && (
              <Circle
                cx={projected.x}
                cy={projected.y}
                r={Math.max(base * 0.8, 22)}
                fill="transparent"
                onPress={() =>
                  onSelect({
                    kind: "nebula",
                    id: nebula.id,
                    name: nebula.name,
                    subtitle: `${nebula.catalog} · Nebula`,
                    facts: [
                      { label: "Distance", value: nebula.distanceLy },
                      { label: "Constellation", value: nebula.constellation },
                      { label: "Azimuth", value: `${Math.round(nebula.azimuthDegrees)}°` },
                      { label: "Altitude", value: `${Math.round(nebula.altitudeDegrees)}°` },
                    ],
                  })
                }
              />
            )}
          </G>
        );
      })}
    </Svg>
  );
}
