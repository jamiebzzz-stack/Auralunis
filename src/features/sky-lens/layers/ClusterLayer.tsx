import React from "react";
import { StyleSheet } from "react-native";
import Svg, { Circle, Defs, G, RadialGradient, Stop } from "react-native-svg";
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
// STAR CLUSTERS — RENDERED AS STARS.
//
// A cluster is not a cloud. The Pleiades and the Beehive are swarms of individual suns,
// and painting them as smooth coloured gradients (which the retired NebulaLayer did) is
// simply wrong — it's the visual equivalent of a spelling mistake, and it's why they
// looked like fake stickers.
//
// So: no cloud fill, no nebula lobes, no dark centre. Just 15–30 deterministic stars in
// a centre-weighted swarm, over a whisper of glow (≤0.06) that suggests the unresolved
// members too faint to draw individually.
//
// This layer is deliberately DISJOINT from NebulaImageLayer: that one renders curated
// emission/planetary/supernova heroes, this one renders curated clusters. No object is
// drawn by both, so there is still exactly one renderer per object.
//
// Galaxies remain unrendered. They are not clouds and they are not swarms.
// ─────────────────────────────────────────────────────────────────────────────

// Curated bright clusters, in billing order. Only these ever render.
const HERO_CLUSTER_IDS = [
  "m45", // Pleiades — the Seven Sisters
  "m44", // Beehive
  "ngc5139", // Omega Centauri — the giant
  "ngc104", // 47 Tucanae
  "m13", // Hercules
  "m22", // Sagittarius
  "ngc6231", // Scorpius Jewel Box
  "m11", // Wild Duck
  "m4", // Scorpius
  "m3", // Canes Venatici
  "m15", // Pegasus
  "m2", // Aquarius
];
const HERO_CLUSTER_SET = new Set(HERO_CLUSTER_IDS);

// Two at once, matching the nebula budget. The sky stays a composition, not an inventory.
const MAX_VISIBLE_CLUSTERS = 2;

// Same UI exclusion zones as the nebula layer — a cluster centred under the HUD or the
// bottom tray is dropped, not drawn beneath them.
const UI_TOP = 150;
const SHUTTER_W = 150;
const SHUTTER_H = 230;

// Size: clusters are compact. The swarm radius is bounded hard, independent of catalog.
const MIN_R = 12;
const MAX_R = 30;

// Silver-white, pale blue, warm cream. No gold-yellow blobs, no neon.
const STAR_COLORS = ["#FFFFFF", "#EAF1FF", "#C6D8FF", "#FFF4E2", "#DCE6FA", "#FFF0D8"];

type Dot = { dx: number; dy: number; r: number; o: number; color: string };

// Deterministic swarm, generated ONCE per cluster id at module load and stored in
// cluster-local offsets (dx/dy as a fraction of radius). Because it's seeded and cached,
// the stars never re-roll between frames — no boiling, no twinkle-jump as the phone moves.
function buildSwarm(id: string): Dot[] {
  let s = 0;
  for (let i = 0; i < id.length; i += 1) s = (s * 31 + id.charCodeAt(i)) >>> 0;
  s = (s * 2654435761 + 1) >>> 0;
  const rng = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff);

  const count = 15 + Math.floor(rng() * 16); // 15–30
  const out: Dot[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = rng() * Math.PI * 2;
    // pow > 1 biases toward the centre → a dense core that thins outward, which is what a
    // real cluster looks like. A uniform disc would read as random confetti.
    const dr = Math.pow(rng(), 1.7);
    // A few brighter members among many faint ones — clusters are not uniform.
    const bright = rng() > 0.78;
    out.push({
      dx: Math.cos(angle) * dr,
      dy: Math.sin(angle) * dr,
      r: bright ? 1.3 + rng() * 0.8 : 0.55 + rng() * 0.6,
      o: bright ? 0.85 + rng() * 0.15 : 0.45 + rng() * 0.35,
      color: STAR_COLORS[Math.floor(rng() * STAR_COLORS.length)],
    });
  }
  return out;
}

const SWARMS: Record<string, Dot[]> = Object.fromEntries(
  HERO_CLUSTER_IDS.map((id) => [id, buildSwarm(id)])
);

export function ClusterLayer({ nebulae, pointing, basis, fov, box, visible, fullSphere = false, uiBottom = 120, onSelect }: Props) {
  // One projection for this layer, matching the shared camera snapshot exactly.
  const projectWith = (az: number, alt: number) =>
    basis
      ? projectTargetWithBasis(basis, az, alt, fov, box)
      : projectTarget(pointing, az, alt, fov, box);

  if (!visible || box.width <= 0 || box.height <= 0) return null;

  const candidates = nebulae
    .filter((n) => {
      if (n.type !== "cluster") return false; // belt-and-braces: clusters only
      if (!HERO_CLUSTER_SET.has(n.id)) return false;
      // Same strict horizon rule as every other layer: at or below the horizon, nothing.
      if (!fullSphere && n.altitudeDegrees <= 0) return false;
      return true;
    })
    .map((n) => {
      const p = projectWith(n.azimuthDegrees, n.altitudeDegrees);
      if (p.behind || !p.onScreen) return null;
      if (p.y < UI_TOP || p.y > box.height - uiBottom) return null;
      if (p.x > box.width - SHUTTER_W && p.y > box.height - SHUTTER_H) return null;

      const priority = HERO_CLUSTER_IDS.indexOf(n.id);
      const centreDistance = Math.hypot(p.x - box.width / 2, p.y - box.height / 2);
      return { n, p, rank: priority * 10_000 + centreDistance };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, MAX_VISIBLE_CLUSTERS);

  if (candidates.length === 0) return null;

  return (
    <Svg pointerEvents="box-none" width={box.width} height={box.height} style={StyleSheet.absoluteFillObject}>
      <Defs>
        {/* The ONLY glow in this layer, and it barely exists (0.05 → 0). It stands in for
            the unresolved faint members, not for a nebula. Any more than this and the
            cluster starts looking like a cloud again — which is the whole thing we're
            fixing. Fades fully to transparent: no disc edge, no dark centre. */}
        <RadialGradient id="clusterHaze" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#DCE6FA" stopOpacity={0.05} />
          <Stop offset="55%" stopColor="#C6D8FF" stopOpacity={0.02} />
          <Stop offset="100%" stopColor="#C6D8FF" stopOpacity={0} />
        </RadialGradient>
      </Defs>

      {candidates.map(({ n, p }) => {
        const radius = Math.max(MIN_R, Math.min(MAX_R, n.radius));
        const swarm = SWARMS[n.id] ?? [];

        return (
          <G key={n.id}>
            <G pointerEvents="none">
              <Circle cx={p.x} cy={p.y} r={radius * 1.35} fill="url(#clusterHaze)" />
              {swarm.map((d, i) => (
                <Circle
                  key={`${n.id}-${i}`}
                  cx={p.x + d.dx * radius}
                  cy={p.y + d.dy * radius}
                  r={d.r}
                  fill={d.color}
                  opacity={d.o}
                />
              ))}
            </G>

            {/* Hit target → info card. No label: nebula and cluster labels stay off. */}
            {onSelect && (
              <Circle
                cx={p.x}
                cy={p.y}
                r={Math.max(radius, 22)}
                fill="transparent"
                onPress={() =>
                  onSelect({
                    kind: "nebula",
                    id: n.id,
                    name: n.name,
                    subtitle: `${n.catalog} · Star cluster`,
                    facts: [
                      { label: "Distance", value: n.distanceLy },
                      { label: "Constellation", value: n.constellation },
                      { label: "Visibility", value: n.visibility },
                      { label: "Altitude", value: `${Math.round(n.altitudeDegrees)}°` },
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
