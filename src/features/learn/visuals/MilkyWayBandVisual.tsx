// MilkyWayBandVisual.tsx — the galaxy as it actually appears: a disc seen edge-on from inside.
//
// The previous version was a rounded rectangle that slid 24 px sideways every 180 ms. The
// motion carried no meaning (the band does not visibly move on that timescale) and read as a
// rendering glitch, and a uniform stripe taught the opposite of the truth — the band is
// conspicuously BRIGHTEST and WIDEST toward Sagittarius, because that is the direction of the
// galactic centre, and it is split lengthways by the Great Rift, a lane of foreground dust.
//
// What the drawing encodes, all of it real structure:
//   · a bright bulge toward the galactic centre, tapering along the disc
//   · star density that falls off with distance from the centre and from the mid-plane
//   · the Great Rift as an irregular dark lane, not a straight line
//   · the band tilted, because the galactic plane sits at an angle to the horizon
//
// It is a schematic, not a photograph, and the caption says so. Deterministic star placement
// (seeded PRNG) keeps it stable across renders rather than reshuffling on every frame.

import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Stop } from "react-native-svg";
import { AuraLunisColors } from "@/theme/tokens";

const W = 320;
const H = 180;
/** Where the galactic centre sits in the frame. Everything else is described relative to it. */
const CORE_X = W * 0.28;
const CORE_Y = H * 0.54;
const TILT = -12; // degrees; the galactic plane is inclined to the horizon

/** Deterministic PRNG so the star field is identical on every render. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff);
}

type Star = { x: number; y: number; r: number; o: number; warm: boolean };

/**
 * Stars concentrated toward the galactic plane and toward the centre. Density falls off with
 * both distance along the band and height above it, which is what produces the visible taper
 * rather than a uniform stripe.
 */
function buildStars(): Star[] {
  const rng = seeded(0x5eed1a7e);
  const out: Star[] = [];
  for (let i = 0; i < 260; i++) {
    const x = rng() * W;
    // Height above the mid-plane: two samples averaged, giving a centre-weighted spread.
    const spread = 30 * (0.45 + 0.55 * (1 - Math.abs(x - CORE_X) / W));
    const y = CORE_Y + (rng() + rng() - 1) * spread;
    // Probability of keeping a star drops with distance from the core.
    const along = 1 - Math.min(1, Math.abs(x - CORE_X) / (W * 0.78));
    const keep = 0.25 + 0.75 * along;
    if (rng() > keep) continue;
    const bright = Math.pow(rng(), 2.2); // few bright, many faint — a realistic distribution
    out.push({
      x,
      y,
      r: 0.35 + bright * 1.5,
      o: 0.25 + bright * 0.7,
      warm: rng() < 0.3
    });
  }
  return out;
}

/** The Great Rift: an irregular dust lane running along the plane, not a straight bar. */
const RIFT_PATH = `M ${W * 0.06} ${CORE_Y + 5}
  C ${W * 0.2} ${CORE_Y - 3}, ${W * 0.3} ${CORE_Y + 9}, ${W * 0.44} ${CORE_Y + 3}
  C ${W * 0.58} ${CORE_Y - 3}, ${W * 0.72} ${CORE_Y + 8}, ${W * 0.98} ${CORE_Y + 1}`;

export function MilkyWayBandVisual() {
  const stars = useMemo(buildStars, []);

  return (
    <View style={styles.card}>
      <Text style={styles.label}>MILKY WAY / GALAXY MODE</Text>
      <View style={styles.canvas}>
        <Svg width={W} height={H}>
          <Defs>
            {/* Diffuse light of the disc, brightest at the centre and fading along the band. */}
            <RadialGradient id="mwBand" cx={`${(CORE_X / W) * 100}%`} cy="50%" r="78%">
              <Stop offset="0" stopColor="#F6DC91" stopOpacity="0.34" />
              <Stop offset="0.35" stopColor="#CBD6F2" stopOpacity="0.17" />
              <Stop offset="1" stopColor="#8FA3D8" stopOpacity="0" />
            </RadialGradient>
            {/* The central bulge — denser and warmer than the rest of the disc. */}
            <RadialGradient id="mwCore" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#FFF3C9" stopOpacity="0.75" />
              <Stop offset="0.45" stopColor="#F6DC91" stopOpacity="0.3" />
              <Stop offset="1" stopColor="#F6DC91" stopOpacity="0" />
            </RadialGradient>
            {/* Dust absorbs rather than glows, so the rift is drawn as darkness over the band. */}
            <LinearGradient id="mwRift" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#05070D" stopOpacity="0.15" />
              <Stop offset="0.35" stopColor="#05070D" stopOpacity="0.8" />
              <Stop offset="1" stopColor="#05070D" stopOpacity="0.25" />
            </LinearGradient>
          </Defs>

          <G rotation={TILT} origin={`${CORE_X}, ${CORE_Y}`}>
            {/* Diffuse disc light, widest at the bulge. */}
            <Ellipse cx={CORE_X} cy={CORE_Y} rx={W * 0.92} ry={30} fill="url(#mwBand)" />
            {stars.map((s, i) => (
              <Circle
                key={i}
                cx={s.x}
                cy={s.y}
                r={s.r}
                fill={s.warm ? "#FFE9B8" : "#EAF1FF"}
                opacity={s.o}
              />
            ))}
            {/* Great Rift over the star field — foreground dust hides the stars behind it. */}
            <Path d={RIFT_PATH} stroke="url(#mwRift)" strokeWidth={11} fill="none" strokeLinecap="round" />
            {/* Bulge last, so the galactic centre stays the brightest thing in frame. */}
            <Ellipse cx={CORE_X} cy={CORE_Y} rx={46} ry={26} fill="url(#mwCore)" />
          </G>
        </Svg>

        <View style={[styles.marker, { left: CORE_X - 4, top: CORE_Y - 4 }]} />
        <Text style={[styles.pin, { left: CORE_X + 10, top: CORE_Y - 20 }]}>Galactic Center</Text>
        <Text style={[styles.pinMuted, { left: W * 0.6, top: CORE_Y + 24 }]}>Great Rift</Text>
      </View>
      <Text style={styles.caption}>
        Our galaxy's disc, seen edge-on from inside it. The band is brightest toward the
        galactic centre in Sagittarius and is split lengthways by the Great Rift — dust lanes
        blocking the starlight behind them. Schematic, not to scale. Best on moonless nights
        far from town.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 28, padding: 16, backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", marginBottom: 14
  },
  label: { color: AuraLunisColors.gold2, fontSize: 11, letterSpacing: 2, fontWeight: "900" },
  canvas: {
    height: H, width: W, alignSelf: "center", borderRadius: 24,
    backgroundColor: "#05070D", overflow: "hidden", marginTop: 10
  },
  marker: {
    position: "absolute", width: 8, height: 8, borderRadius: 4,
    backgroundColor: AuraLunisColors.gold2
  },
  pin: { position: "absolute", color: "#FFF", fontSize: 11, fontWeight: "800" },
  pinMuted: { position: "absolute", color: AuraLunisColors.silver, fontSize: 10 },
  caption: { color: AuraLunisColors.muted, fontSize: 12, lineHeight: 18, marginTop: 10 }
});
