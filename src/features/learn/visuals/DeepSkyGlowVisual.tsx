import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Svg, { Circle, Defs, Ellipse, G, Path, RadialGradient, Stop } from "react-native-svg";
import { AuraLunisColors } from "@/theme/tokens";

const LABELS = ["Nebula", "Galaxy", "Cluster", "Remnant"];

const CAPTIONS = [
  "Nebulae glow as vast clouds of gas and dust — the stellar nurseries where new stars ignite.",
  "Galaxies are island cities of billions of stars, often spiralling around a bright central core.",
  "Star clusters are tight families of stars born together from the same collapsing cloud.",
  "Supernova remnants are the glowing shells flung outward when a massive star explodes."
];

/** Deterministic PRNG so every object keeps the same structure between renders. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff);
}

/**
 * A closed organic outline through the given points — used for gas structure. Emission nebulae
 * and supernova shells have ragged, filamentary edges; an ellipse is the single strongest tell
 * that a deep-sky object was drawn rather than observed.
 */
function organicPath(points: ReadonlyArray<readonly [number, number]>, cx: number, cy: number): string {
  const n = points.length;
  if (n < 3) return "";
  const at = (i: number) => {
    const p = points[((i % n) + n) % n];
    return [cx + p[0], cy + p[1]] as const;
  };
  const start = at(0);
  let d = `M ${start[0].toFixed(1)} ${start[1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return `${d} Z`;
}

/**
 * Emission-nebula lobes. Deliberately ASYMMETRIC and offset from one another: the first draft
 * used two centred lobes of similar size, which merged into a single dome and read as a hat
 * rather than a gas cloud. Real emission regions are lopsided, with one bright core and ragged
 * extensions trailing off it.
 */
const NEBULA_LOBES = [
  // Main body — larger, pushed left and down, with a deep notch on its upper edge.
  [[-58, 10], [-44, -18], [-16, -30], [4, -16], [10, 4], [-2, 26], [-26, 34], [-52, 28]],
  // Secondary lobe — smaller, higher and well clear to the right, not concentric.
  [[16, -34], [40, -42], [58, -26], [54, -4], [34, 6], [18, -12]],
  // A third ragged wisp trailing to the lower right, breaking any remaining symmetry.
  [[22, 14], [42, 10], [52, 24], [40, 38], [22, 34]],
] as const;

/** Faint outer wisps — gas has no edge, so the cloud should not either. */
const NEBULA_WISPS = [
  "M -70 -4 Q -50 -22, -22 -30",
  "M 62 -18 Q 74 2, 60 22",
  "M -34 40 Q -8 46, 22 40",
] as const;

/**
 * Supernova shell, built from SEPARATE arc fragments — never one closed outline.
 *
 * The first attempt drew a continuous path with a strokeDasharray to imply filaments. It
 * rendered as a dashed border and read as a decorative stitched ring, which was further from
 * the truth than the plain circle it replaced. A real remnant is a blast wave ploughing into
 * uneven gas: bright where it hits something dense, invisible where it does not.
 *
 * Each entry is [startAngle°, sweep°, radius, strokeWidth, opacity]. Gaps between fragments
 * are the point — the shell is genuinely incomplete.
 */
const REMNANT_ARCS: ReadonlyArray<readonly [number, number, number, number, number]> = [
  // Bright limb: where the blast wave has run into denser gas. Two overlapping arcs at
  // different radii, carrying most of the brightness.
  [-118, 96, 50, 3.2, 0.9],
  [-100, 62, 38, 2.0, 0.6],
  // Trailing edge — fainter, further out, thinning as it goes.
  [10, 46, 53, 1.6, 0.4],
  [70, 26, 44, 1.1, 0.28],
  // Opposite limb: barely there. A large sector from roughly 110°–230° is left EMPTY, which
  // is what stops the eye completing a circle. Evenly-spaced fragments at similar radii still
  // read as a segmented ring however wide the gaps are — the asymmetry has to be real.
  [232, 40, 31, 1.3, 0.34],
];

/** Filaments reaching out from the shell where the blast wave broke through. */
const REMNANT_FILAMENTS: ReadonlyArray<readonly [number, number, number]> = [
  // Clustered on the bright limb, where the shock is actually doing something.
  [-104, 48, 24], [-76, 50, 18], [-46, 46, 14], [26, 50, 16], [244, 32, 12],
];

/** Polar arc as an SVG path, so fragments can sit at different radii. */
function arcPath(cx: number, cy: number, startDeg: number, sweepDeg: number, radius: number): string {
  const rad = (d: number) => (d * Math.PI) / 180;
  const x1 = cx + radius * Math.cos(rad(startDeg));
  const y1 = cy + radius * Math.sin(rad(startDeg));
  const x2 = cx + radius * Math.cos(rad(startDeg + sweepDeg));
  const y2 = cy + radius * Math.sin(rad(startDeg + sweepDeg));
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${radius} ${radius} 0 ${sweepDeg > 180 ? 1 : 0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

const CLUSTER_STARS = (() => {
  const rng = seeded(0x51a2b3c4);
  return Array.from({ length: 46 }, () => {
    const angle = rng() * Math.PI * 2;
    // Concentration toward the core: a high power pulls most stars inward, as in a real cluster.
    const radius = Math.pow(rng(), 1.9) * 44;
    const bright = Math.pow(rng(), 2.1);
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius * 0.94,
      rad: 0.6 + bright * 2.2,
      opacity: 0.35 + bright * 0.65,
      warm: rng() < 0.28,
    };
  });
})();

/** Spiral arm as a log-spiral polyline — the shape disc galaxies actually take. */
function spiralArm(cx: number, cy: number, startAngle: number, turns: number, maxR: number): string {
  const points: string[] = [];
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = startAngle + t * turns * Math.PI * 2;
    const r = 6 + Math.pow(t, 0.85) * maxR;
    points.push(`${(cx + Math.cos(angle) * r).toFixed(1)} ${(cy + Math.sin(angle) * r * 0.42).toFixed(1)}`);
  }
  return `M ${points.join(" L ")}`;
}

/**
 * Each class gets its own visual language, so the four are distinguishable at a glance:
 * nebula = irregular luminous gas, galaxy = bright core plus a spiral disc, cluster = a dense
 * concentration of stars, remnant = a broken expanding shell. Schematic on purpose — these are
 * diagrams, not photographs, and nothing here claims to be a telescope image.
 */
function DeepSkyShape({ type, cx, cy }: { type: number; cx: number; cy: number }) {
  if (type === 0) {
    return (
      <G>
        <Defs>
          <RadialGradient id="dsNebCore" cx="45%" cy="45%" r="55%">
            <Stop offset="0%" stopColor="#F2B8FF" stopOpacity={0.5} />
            <Stop offset="45%" stopColor="#9A6BFF" stopOpacity={0.26} />
            <Stop offset="100%" stopColor="#6A4BD8" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="dsNebHaze" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#7FD4FF" stopOpacity={0.22} />
            <Stop offset="100%" stopColor="#7FD4FF" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {/* Haze offset from the lobes so the whole thing is not concentric. */}
        <Ellipse cx={cx - 8} cy={cy + 4} rx={74} ry={52} fill="url(#dsNebHaze)" />
        {NEBULA_LOBES.map((lobe, i) => (
          <Path key={i} d={organicPath(lobe, cx, cy)} fill="url(#dsNebCore)" opacity={[0.95, 0.62, 0.44][i]} />
        ))}
        {/* Dust lane: curved, thinner and much softer than the first attempt, which was a
            straight opaque bar and cut the cloud in half like a brim. */}
        <Path
          d={`M ${cx - 56} ${cy + 22} Q ${cx - 20} ${cy + 2}, ${cx + 2} ${cy + 12} T ${cx + 46} ${cy + 4}`}
          stroke="#0A0B14" strokeWidth={4.5} strokeOpacity={0.34} fill="none" strokeLinecap="round"
        />
        {NEBULA_WISPS.map((d, i) => (
          <Path
            key={`wisp-${i}`}
            d={d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_m, x, y) => `${cx + Number(x)} ${cy + Number(y)}`)}
            stroke="#B79CFF" strokeWidth={1.4} strokeOpacity={0.22} fill="none" strokeLinecap="round"
          />
        ))}
        {/* Young stars embedded in the cloud — what makes it a stellar nursery. */}
        {[[-14, -6], [10, 8], [2, -18], [26, -4], [-28, 12]].map(([x, y], i) => (
          <Circle key={i} cx={cx + x} cy={cy + y} r={i === 0 ? 1.9 : 1.2} fill="#FFF6D6" opacity={0.95} />
        ))}
      </G>
    );
  }

  if (type === 1) {
    return (
      <G>
        <Defs>
          <RadialGradient id="dsGalCore" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#FFF6D6" stopOpacity={1} />
            <Stop offset="35%" stopColor="#FFD99A" stopOpacity={0.7} />
            <Stop offset="100%" stopColor="#C99A5A" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="dsGalDisc" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#CFE0FF" stopOpacity={0.3} />
            <Stop offset="100%" stopColor="#8FA8E8" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {/* Disc, seen at an angle — flattened, as a real spiral is unless perfectly face-on. */}
        <Ellipse cx={cx} cy={cy} rx={66} ry={30} fill="url(#dsGalDisc)" />
        {[0, Math.PI].map((start, i) => (
          <Path
            key={i}
            d={spiralArm(cx, cy, start, 0.62, 58)}
            stroke="#BBD4FF" strokeWidth={2.2} strokeOpacity={0.42} fill="none" strokeLinecap="round"
          />
        ))}
        {[0.35, Math.PI + 0.35].map((start, i) => (
          <Path
            key={`f${i}`}
            d={spiralArm(cx, cy, start, 0.55, 46)}
            stroke="#E2C4FF" strokeWidth={1.4} strokeOpacity={0.3} fill="none" strokeLinecap="round"
          />
        ))}
        {/* Central bulge — the brightest thing in the frame, as it is in the sky. */}
        <Ellipse cx={cx} cy={cy} rx={22} ry={13} fill="url(#dsGalCore)" />
        <Circle cx={cx} cy={cy} r={3.4} fill="#FFFDF2" />
      </G>
    );
  }

  if (type === 2) {
    return (
      <G>
        <Defs>
          <RadialGradient id="dsClusterHalo" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#DCE8FF" stopOpacity={0.24} />
            <Stop offset="100%" stopColor="#DCE8FF" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {/* Unresolved glow of the fainter members, densest at the core. */}
        <Circle cx={cx} cy={cy} r={50} fill="url(#dsClusterHalo)" />
        {CLUSTER_STARS.map((star, i) => (
          <Circle
            key={i}
            cx={cx + star.x}
            cy={cy + star.y}
            r={star.rad}
            fill={star.warm ? "#FFE9A8" : "#FFFDF6"}
            opacity={star.opacity}
          />
        ))}
      </G>
    );
  }

  return (
    <G>
      <Defs>
        {/* Interior wash only — a plain centre-out fade, NOT an annulus. The previous version
            used a gradient that was transparent at the centre, bright at 82% and transparent
            again at the rim: that is a doughnut by construction, painted as one full circle,
            and it kept the ring silhouette no matter how broken the arcs on top were. It is
            offset from centre so nothing about the object reads as concentric. */}
        <RadialGradient id="dsRemHaze" cx="36%" cy="38%" r="62%">
          <Stop offset="0%" stopColor="#C97A5A" stopOpacity={0.16} />
          <Stop offset="60%" stopColor="#8A4A38" stopOpacity={0.07} />
          <Stop offset="100%" stopColor="#8A4A38" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={cx - 7} cy={cy - 5} rx={46} ry={39} fill="url(#dsRemHaze)" />
      {/* Separate arc fragments at differing radii, thickness and opacity. No closed path and
          no dash pattern — the gaps are real gaps. */}
      {/* Each fragment is drawn twice: a wide, faint under-stroke that supplies the diffuse
          glow, then the crisp filament on top. Because the glow rides the fragments, it
          inherits their gaps — so the emission is broken exactly where the shell is. */}
      {REMNANT_ARCS.map(([start, sweep, radius, width, opacity], i) => (
        <Path
          key={`glow-${i}`}
          d={arcPath(cx, cy, start, sweep, radius)}
          fill="none"
          stroke={i % 2 === 0 ? "#FF9E7A" : "#FF7F9A"}
          strokeWidth={width * 5.5}
          strokeOpacity={opacity * 0.16}
          strokeLinecap="round"
        />
      ))}
      {REMNANT_ARCS.map(([start, sweep, radius, width, opacity], i) => (
        <Path
          key={`arc-${i}`}
          d={arcPath(cx, cy, start, sweep, radius)}
          fill="none"
          stroke={i % 2 === 0 ? "#FFB07A" : "#FF8FA8"}
          strokeWidth={width}
          strokeOpacity={opacity}
          strokeLinecap="round"
        />
      ))}
      {REMNANT_FILAMENTS.map(([angle, inner, length], i) => {
        const rad = (angle * Math.PI) / 180;
        const x1 = cx + inner * Math.cos(rad), y1 = cy + inner * Math.sin(rad);
        const x2 = cx + (inner + length) * Math.cos(rad + 0.16), y2 = cy + (inner + length) * Math.sin(rad + 0.16);
        const mx = cx + (inner + length * 0.55) * Math.cos(rad + 0.02), my = cy + (inner + length * 0.55) * Math.sin(rad + 0.02);
        return (
          <Path key={`fil-${i}`} d={`M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`}
            stroke="#FFC7A8" strokeWidth={0.9} strokeOpacity={0.4} fill="none" strokeLinecap="round" />
        );
      })}
      {/* NO central point source. A dot here would assert that every remnant leaves a visible
          compact object, which is untrue of the class this illustrates: core-collapse events
          may leave a neutron star or black hole, Type Ia supernovae leave nothing at all, and
          in many remnants no central source is visible regardless. The caption describes the
          expanding shell only, so nothing on screen may imply more than that. */}
    </G>
  );
}

export function DeepSkyGlowVisual({
  onTabChange,
  selectedIndex
}: {
  onTabChange?: (index: number) => void;
  selectedIndex?: number;
} = {}) {
  const [active, setActive] = useState(selectedIndex ?? 0);

  useEffect(() => {
    if (selectedIndex === undefined) return;
    setActive(selectedIndex);
  }, [selectedIndex]);

  return (
    <View style={styles.card}>
      <Text style={styles.label}>DEEP SKY LAYER</Text>
      <View style={styles.canvas}>
        <Svg width="100%" height="100%" viewBox="0 0 280 150">
          <DeepSkyShape type={active} cx={140} cy={75} />
        </Svg>
      </View>
      <View style={styles.row}>
        {LABELS.map((label, index) => (
          <TouchableOpacity
            key={label}
            onPress={() => {
              setActive(index);
              onTabChange?.(index);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active === index }}
            accessibilityLabel={`Show ${label}`}
            hitSlop={6}
          >
            <Text style={[styles.pill, active === index && styles.pillActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.caption}>{CAPTIONS[active]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 28, padding: 16, backgroundColor: "rgba(255,255,255,0.055)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", marginBottom: 14 },
  label: { color: AuraLunisColors.gold2, fontSize: 11, letterSpacing: 2, fontWeight: "900" },
  canvas: { height: 150, borderRadius: 22, overflow: "hidden", marginTop: 10, backgroundColor: "rgba(3,5,10,0.8)" },
  row: { flexDirection: "row", gap: 8, marginTop: 12 },
  pill: { color: AuraLunisColors.silver, fontSize: 11, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  pillActive: { color: AuraLunisColors.gold2, borderColor: "rgba(217,168,78,0.28)", backgroundColor: "rgba(217,168,78,0.1)" },
  caption: { color: AuraLunisColors.muted, fontSize: 12, lineHeight: 18, marginTop: 10 }
});
