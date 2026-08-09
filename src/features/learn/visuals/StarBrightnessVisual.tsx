// StarBrightnessVisual.tsx — what magnitude and colour actually mean, using real stars.
//
// The previous version was three coloured circles whose opacity flickered on a timer. It
// contradicted its own caption: it said blue stars are hottest and red coolest, while drawing
// the WHITE circle largest, the blue one middle and the orange one smallest — so size tracked
// nothing at all, and nothing on screen was a real star.
//
// Every value below is the accepted apparent magnitude and surface temperature of a named star
// anyone can go outside and find. Two things are deliberately made explicit rather than left
// for the reader to infer wrongly:
//
//   · Disc size here encodes APPARENT BRIGHTNESS, not physical size. Betelgeuse is vastly
//     larger than Sirius in reality but appears fainter from Earth, so a size-equals-size
//     reading would be exactly backwards. The caption states this.
//   · The magnitude scale runs BACKWARDS — brighter stars have smaller, and sometimes
//     negative, numbers. That trips up nearly everyone, so it is said outright.
//
// Colours are approximate blackbody appearances for each temperature, not arbitrary palette
// choices, so the colour ordering genuinely follows the temperature ordering.

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import { AuraLunisColors } from "@/theme/tokens";
import { REFERENCE_STARS, apparentDiscRadius } from "../starReference";

export function StarBrightnessVisual() {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>STAR BRIGHTNESS + COLOR</Text>

      <View style={styles.row}>
        {REFERENCE_STARS.map((star) => {
          const r = apparentDiscRadius(star.magnitude);
          const box = 64;
          return (
            <View key={star.name} style={styles.starCol}>
              <Svg width={box} height={box}>
                <Defs>
                  <RadialGradient id={`glow-${star.name}`} cx="50%" cy="50%" r="50%">
                    <Stop offset="0" stopColor={star.color} stopOpacity="0.5" />
                    <Stop offset="1" stopColor={star.color} stopOpacity="0" />
                  </RadialGradient>
                </Defs>
                {/* Halo scales with the disc, so brighter stars also glow harder. */}
                <Circle cx={box / 2} cy={box / 2} r={r * 2.1} fill={`url(#glow-${star.name})`} />
                <Circle cx={box / 2} cy={box / 2} r={r} fill={star.color} />
                {/* Hot cores read near-white at the centre, as they do to the eye. */}
                <Circle cx={box / 2} cy={box / 2} r={r * 0.45} fill="#FFFFFF" opacity={0.55} />
              </Svg>
              <Text style={styles.starName}>{star.name}</Text>
              <Text style={styles.starMeta}>mag {star.magnitude.toFixed(2)}</Text>
              <Text style={styles.starTemp}>
                {star.spectral} · {star.kelvin.toLocaleString()} K
              </Text>
            </View>
          );
        })}
      </View>

      <Text style={styles.caption}>
        Colour follows temperature: blue-white Rigel burns near 12,000 K, while red Betelgeuse
        is around 3,600 K — cooler stars glow redder, hotter ones bluer. Magnitude runs
        backwards, so the brightest stars carry the smallest numbers, and Sirius at −1.46 is the
        brightest star in our night sky. Disc size here shows how bright each looks from Earth,
        not how large it truly is: Betelgeuse dwarfs Sirius, yet appears fainter because it lies
        far further away.
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
  row: { flexDirection: "row", justifyContent: "space-between", marginTop: 14 },
  starCol: { alignItems: "center", flex: 1 },
  starName: { color: "#FFF", fontSize: 11, fontWeight: "800", marginTop: 2 },
  starMeta: { color: AuraLunisColors.gold2, fontSize: 10, marginTop: 2 },
  starTemp: { color: AuraLunisColors.faint, fontSize: 9, marginTop: 1 },
  caption: { color: AuraLunisColors.muted, fontSize: 12, lineHeight: 18, marginTop: 12 }
});
