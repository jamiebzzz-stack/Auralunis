// MoonPhaseLiveVisual.tsx — the Moon as it actually is right now.
//
// This card previously cycled a hardcoded list of eight phase names every 900 ms with a fixed
// illumination array, while telling the reader "Current lunar phase based on your date and
// location." It was a demo animation, and the label was untrue. Both the number and the shape
// now come from astronomy-engine through the shared lunarState() helper.
//
// It re-reads on a slow timer only because the Moon genuinely moves: the lit fraction changes
// by roughly 3–4% per hour near the quarters, so a minute-scale refresh keeps a long-lived
// screen honest without doing meaningful work.

import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AuraLunisColors } from "@/theme/tokens";
import { lunarState } from "@/services/MoonPhase";
import { MoonDisc } from "./MoonDisc";

/** The Moon moves slowly; re-reading once a minute is ample and effectively free. */
const REFRESH_MS = 60_000;

const MOON_SIZE = 132;

export function MoonPhaseLiveVisual() {
  const [state, setState] = useState(() => lunarState());

  useEffect(() => {
    const id = setInterval(() => setState(lunarState()), REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  // Whole percent for display; the disc keeps the unrounded value so the terminator does not
  // visibly step as the fraction crosses a percentage boundary.
  const shownPercent = Math.round(state.illuminationPercent);

  return (
    <View style={styles.card}>
      <Text style={styles.label}>LIVE MOON PHASE</Text>
      <View style={styles.row}>
        <View style={styles.moonShell}>
          <MoonDisc
            size={MOON_SIZE}
            illuminationPercent={state.illuminationPercent}
            isWaxing={state.isWaxing}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{state.name}</Text>
          <Text style={styles.meta}>Illumination · {shownPercent}%</Text>
          <Text style={styles.caption}>
            {state.isWaxing
              ? "Growing fuller each night — it sets after sunset, so look early in the evening."
              : "Shrinking each night — it rises late, so look in the early hours."}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 28, padding: 16, backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", marginBottom: 14
  },
  label: { color: AuraLunisColors.gold2, fontSize: 11, letterSpacing: 2, fontWeight: "900" },
  row: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 12 },
  // Sized to the disc exactly; the renderer draws its own limb, so no border or clipping here.
  moonShell: { width: MOON_SIZE, height: MOON_SIZE },
  title: { color: "#FFF", fontSize: 19, fontWeight: "900" },
  meta: { color: AuraLunisColors.gold2, fontSize: 12, marginTop: 4 },
  caption: { color: AuraLunisColors.muted, fontSize: 12, lineHeight: 18, marginTop: 8 }
});
