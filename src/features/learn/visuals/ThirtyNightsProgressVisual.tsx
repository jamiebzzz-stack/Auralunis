// ThirtyNightsProgressVisual.tsx — an illustration of the 30 Nights arc.
//
// THIS COMPONENT DELIBERATELY SHOWS NO PROGRESS. The previous version animated "Night 1 → 6"
// on a one-second timer and told the reader "Complete each night to unlock the next. Your
// progress is saved automatically." No 30 Nights progress state exists anywhere in the app —
// nothing is tracked, stored, or unlocked — so that was a false claim about the user's own
// saved data, and the moving counter made it look like a live readout of it.
//
// It now describes the SHAPE of the course (a month of short guided sessions, building from
// naked-eye orientation toward deep-sky targets) without asserting anything about the reader.
// If real progress tracking is added later, this is the place to surface it — read it from that
// state, never from a timer.

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { AuraLunisColors } from "@/theme/tokens";

/** One marker per night. The larger beats are the milestones the course is built around. */
const NIGHTS = 30;
const MILESTONES = new Set([1, 8, 15, 22, 30]);

export function ThirtyNightsProgressVisual() {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>30 NIGHTS PATH</Text>
      <Text style={styles.title}>A month of short sessions</Text>

      <View style={styles.track}>
        {Array.from({ length: NIGHTS }, (_, i) => i + 1).map((n) => (
          <View key={n} style={[styles.tick, MILESTONES.has(n) && styles.tickMilestone]} />
        ))}
      </View>

      <View style={styles.legendRow}>
        <Text style={styles.legend}>Night 1</Text>
        <Text style={styles.legend}>Night 30</Text>
      </View>

      <Text style={styles.caption}>
        Thirty short guided sessions, starting with finding your bearings by eye and building
        toward planets, clusters and deep-sky targets. Each night stands on its own, so a
        clouded-out evening never sets you back.
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
  title: { color: "#FFF", fontSize: 22, fontWeight: "900", marginTop: 10 },
  track: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 18, height: 22 },
  tick: { flex: 1, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.12)" },
  // Milestones read as taller beats along the arc — structure, not achievement.
  tickMilestone: { height: 16, borderRadius: 4, backgroundColor: "rgba(246,220,145,0.55)" },
  legendRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  legend: { color: AuraLunisColors.faint, fontSize: 10, letterSpacing: 1 },
  caption: { color: AuraLunisColors.muted, fontSize: 12, lineHeight: 18, marginTop: 12 }
});
