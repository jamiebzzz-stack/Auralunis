import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { StargazingIndex } from "@/services/StargazingIndexService";

type Props = { index: StargazingIndex };

const VERDICT_LABEL: Record<StargazingIndex["verdict"], string> = {
  GO: "GO",
  MAYBE: "MAYBE",
  STAY_IN: "STAY IN",
};

// One-number "should I go out tonight?" widget. Big score + verdict, a fill bar,
// the three condition chips, and the best observing window.
export function StargazingIndexCard({ index }: Props) {
  const { score, verdict, color, cloudScore, moonScore, seeingScore, bestWindow, summary } = index;
  const fill = Math.max(0, Math.min(100, score));

  return (
    <View style={[styles.card, { borderColor: color + "55" }]}>
      <View style={styles.headRow}>
        <View style={styles.scoreBlock}>
          <Text style={styles.label}>TONIGHT</Text>
          <Text style={[styles.score, { color }]}>{score}</Text>
        </View>
        <View style={[styles.verdictPill, { backgroundColor: color + "22", borderColor: color }]}>
          <Text style={[styles.verdict, { color }]}>{VERDICT_LABEL[verdict]}</Text>
        </View>
      </View>

      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${fill}%`, backgroundColor: color }]} />
      </View>

      <Text style={styles.summary}>{summary}</Text>

      <View style={styles.chipRow}>
        {/* U+FE0E forces TEXT presentation. Bare U+2601 is a typographic glyph, but iOS renders
            it as a colour emoji by default, which is the boxed-sticker look this replaced. */}
        <Text style={styles.chip}>{"\u2601\uFE0E"} {cloudScore >= 80 ? "Clear" : cloudScore >= 50 ? "Partly" : "Cloudy"}</Text>
        <Text style={styles.chip}>☾ {Math.round(100 - moonScore)}% Moon</Text>
        <Text style={styles.chip}>◉ {seeingScore >= 75 ? "Excellent" : seeingScore >= 50 ? "Good" : "Poor"}</Text>
      </View>

      <Text style={styles.window}>Best window · {bestWindow}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 20,
    borderRadius: 22,
    backgroundColor: "rgba(12,16,28,0.6)",
    borderWidth: 1,
  },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  scoreBlock: { flexDirection: "row", alignItems: "baseline", gap: 10 },
  label: { color: "rgba(233,236,245,0.6)", fontSize: 12, fontWeight: "700", letterSpacing: 2 },
  score: { fontSize: 46, fontWeight: "900", letterSpacing: -1, fontVariant: ["tabular-nums"] },
  verdictPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 14, borderWidth: 1 },
  verdict: { fontSize: 15, fontWeight: "900", letterSpacing: 1 },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.08)", marginTop: 14, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4 },
  summary: { color: "rgba(233,236,245,0.85)", fontSize: 13.5, lineHeight: 19, marginTop: 12 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  chip: { color: "rgba(233,236,245,0.8)", fontSize: 12.5, fontWeight: "600" },
  window: { color: "rgba(217,168,78,0.9)", fontSize: 12, lineHeight: 16, fontWeight: "700", marginTop: 12, letterSpacing: 0.3 },
});
