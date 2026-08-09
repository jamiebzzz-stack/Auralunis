// LearnDetailScreen.tsx
// A full-screen, FREE lesson — opened when a Learn topic card is tapped (no Alert,
// no paywall). Shows the live visual, gold key-facts, the full lesson body, a
// "Try in Sky Lens" jump, and a "Next lesson" button. Reuses ScreenShell + the
// living Starfield so it reads like a beautiful astronomy textbook.

import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ScreenShell } from "@/components/ScreenShell";
import { Starfield } from "@/components/Starfield";
import { GlassPanel } from "@/components/GlassPanel";
import { AuraLunisColors } from "@/theme/tokens";
import { tapLight } from "@/services/HapticService";
import { LearnVisualForCategory } from "@/features/learn/LearnCategoryVisual";
import { useEntitlement } from "@/hooks/useEntitlement";
import { usePaywallNavigation } from "@/context/PaywallNavigationContext";
import { useAuraLunisVault } from "@/state/AuraLunisVaultContext";
import { isLearnLessonFree } from "@/features/learn/LearnCatalog";
import type { LearnTopic } from "@/features/learn/LearnTypes";

interface LearnDetailScreenProps {
  topic: LearnTopic;
  categoryTitle: string;
  nextTopicTitle: string | null;
  onBack: () => void;
  onNext: () => void;
  onOpenSkyLens: () => void;
}

export function LearnDetailScreen({
  topic,
  categoryTitle,
  nextTopicTitle,
  onBack,
  onNext,
  onOpenSkyLens,
}: LearnDetailScreenProps) {
  const { isPremium } = useEntitlement();
  const { addItem } = useAuraLunisVault();
  const [saved, setSaved] = useState(false);

  // "Next lesson" swaps the `topic` prop while this screen stays mounted, so the saved flag
  // has to follow the lesson. Without the reset the button stayed "✓ Saved to Vault" and
  // disabled on every subsequent lesson, making them impossible to save.
  useEffect(() => { setSaved(false); }, [topic.id]);

  const saveToVault = () => {
    tapLight();
    // Lesson marks are saved to the (premium) Vault — free users get the paywall instead.
    if (!isPremium) { openPaywall(); return; }
    addItem({ type: "lesson", title: topic.title, detail: `Observed during "${topic.title}". ${topic.skyLensAction ?? ""}`.trim() });
    setSaved(true);
  };
  const { openPaywall } = usePaywallNavigation();
  const lessonIsFree = isLearnLessonFree(topic.id);

  // Screen-level entitlement guard (defense-in-depth): advanced lessons are premium. A non-entitled
  // user must never read a premium lesson body, even if this screen is reached by another path
  // (e.g. "Next"). Render a premium preview/gate; "Unlock Premium" opens the existing paywall.
  if (!lessonIsFree && !isPremium) {
    return (
      <ScreenShell title={topic.title} subtitle={categoryTitle} background={<Starfield />}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          onPress={() => { tapLight(); onBack(); }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back to Learn"
        >
          <Text style={styles.backArrow}>←</Text>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <View style={styles.gateCard}>
          <Text style={styles.gateIcon}>◈</Text>
          <Text style={styles.gateTitle}>{topic.title}</Text>
          <Text style={styles.gateBadge}>PREMIUM LESSON</Text>
          <Text style={styles.gateDesc}>{topic.summary}</Text>
          <Text style={styles.gateDesc}>
            The starter lessons are free — unlock the full Learn library with Premium.
          </Text>
          <Pressable style={styles.unlockBtn} onPress={() => { tapLight(); openPaywall(); }}>
            <Text style={styles.unlockText}>✦ Unlock Premium</Text>
          </Pressable>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title={topic.title} subtitle={categoryTitle} background={<Starfield />}>
      {/* Top nav — large, high-contrast back control (>=44pt tap target) */}
      <Pressable
        style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
        onPress={() => { tapLight(); onBack(); }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Back to Learn"
      >
        <Text style={styles.backArrow}>←</Text>
        <Text style={styles.backText}>Back</Text>
      </Pressable>

      <View style={styles.badgeRow}>
        <Text style={styles.freeTag}>{lessonIsFree ? "FREE LESSON" : "PREMIUM LESSON"}</Text>
        <Text style={styles.levelTag}>{topic.level.toUpperCase()}</Text>
      </View>

      {/* Live visual up top */}
      <GlassPanel accent style={styles.visualCard}>
        {/* KEYED BY LESSON ID. "Next lesson" swaps `topic` while this screen stays mounted,
            so a visual holding local state (DeepSkyGlowVisual's `active` tab) kept the option
            tapped in the PREVIOUS lesson — pick "Remnant" in Galaxies and Spotting Star
            Clusters opened showing Remnant. useState's initializer does not re-run on a prop
            change, and the visual's selectedIndex effect early-returns when the destination
            lesson supplies none.

            The key remounts ONLY this visual. Everything outside it — the screen, navigation,
            scroll position, saved records, course progress and entitlement — is untouched. */}
        <LearnVisualForCategory key={topic.id} categoryId={topic.categoryId} />
      </GlassPanel>

      {/* Key facts as gold bullets */}
      <Text style={styles.sectionLabel}>KEY FACTS</Text>
      <View style={styles.factsCard}>
        {topic.keyFacts.map((fact, i) => (
          <View key={i} style={styles.factRow}>
            <Text style={styles.bullet}>✦</Text>
            <Text style={styles.factText}>{fact}</Text>
          </View>
        ))}
      </View>

      {/* Full description */}
      <Text style={styles.sectionLabel}>THE LESSON</Text>
      <Text style={styles.summary}>{topic.summary}</Text>
      {(topic.body ?? "").split("\n\n").filter(Boolean).map((para, i) => (
        <Text key={i} style={styles.bodyPara}>{para}</Text>
      ))}

      {/* Try in Sky Lens */}
      <Pressable style={styles.skyBtn} onPress={() => { tapLight(); onOpenSkyLens(); }}>
        <Text style={styles.skyBtnText}>{topic.skyLensAction ?? "Try in Sky Lens"} →</Text>
      </Pressable>

      {/* Save to Vault — logs this observation so it appears in the Vault tab. */}
      <Pressable
        style={[styles.vaultBtn, saved && styles.vaultBtnSaved]}
        onPress={saveToVault}
        disabled={saved}
        accessibilityRole="button"
        accessibilityLabel={saved ? "Saved to Vault" : "Save this lesson to your Vault"}
      >
        <Text style={styles.vaultBtnText}>{saved ? "✓  Saved to Vault" : "Save to Vault"}</Text>
      </Pressable>

      {/* Next lesson */}
      {nextTopicTitle && (
        <Pressable style={styles.nextBtn} onPress={() => { tapLight(); onNext(); }}>
          <Text style={styles.nextLabel}>NEXT LESSON</Text>
          <Text style={styles.nextTitle}>{nextTopicTitle} →</Text>
        </Pressable>
      )}

      {/* Soft Premium nudge — surfaced at the end of the free starter lessons for free users
          only (never blocks a free lesson's content). */}
      {!isPremium && (
        <View style={styles.nudge}>
          <Text style={styles.nudgeTitle}>✦  Go deeper with Premium</Text>
          <Text style={styles.nudgeBody}>
            Unlock the full Learn library plus the Sky Lens planetarium aligned to your sky, your Birth
            Sky chart, the major constellations with mythology, and the full deep-sky catalogue.
          </Text>
          <Pressable style={styles.nudgeBtn} onPress={() => { tapLight(); openPaywall(); }}>
            <Text style={styles.nudgeBtnText}>Unlock Premium</Text>
          </Pressable>
        </View>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  gateCard: { marginTop: 24, backgroundColor: "rgba(7,18,37,0.7)", borderRadius: 20, borderWidth: 1, borderColor: AuraLunisColors.gold, padding: 24, alignItems: "center" },
  gateIcon: { fontSize: 32, color: AuraLunisColors.gold, marginBottom: 10 },
  gateTitle: { color: AuraLunisColors.gold2, fontSize: 22, fontWeight: "900", textAlign: "center" },
  gateBadge: { color: AuraLunisColors.gold, fontSize: 11, fontWeight: "800", letterSpacing: 2, textTransform: "uppercase", marginTop: 4, marginBottom: 12 },
  gateDesc: { color: AuraLunisColors.silver, fontSize: 14, lineHeight: 21, textAlign: "center", marginBottom: 14 },
  unlockBtn: { backgroundColor: AuraLunisColors.gold, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28, alignItems: "center", marginTop: 6 },
  unlockText: { color: AuraLunisColors.cosmicBlack, fontWeight: "900", fontSize: 14 },
  backBtn: {
    flexDirection: "row", alignItems: "center", gap: 3,
    alignSelf: "flex-start",
    minHeight: 44, paddingVertical: 9, paddingLeft: 12, paddingRight: 16,
    marginBottom: 14, borderRadius: 22,
    backgroundColor: "rgba(217,168,78,0.14)",
    borderWidth: 1, borderColor: "rgba(217,168,78,0.45)",
  },
  backBtnPressed: { backgroundColor: "rgba(217,168,78,0.26)" },
  backArrow: { color: AuraLunisColors.gold, fontSize: 19, fontWeight: "900", marginTop: -1 },
  backText: { color: AuraLunisColors.gold, fontSize: 16, fontWeight: "800", letterSpacing: 0.3 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  freeTag: {
    fontSize: 9, fontWeight: "900", letterSpacing: 1.5, color: AuraLunisColors.cosmicBlack,
    backgroundColor: AuraLunisColors.gold, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: "hidden",
  },
  levelTag: {
    fontSize: 9, fontWeight: "800", letterSpacing: 1.5, color: AuraLunisColors.gold2,
    borderWidth: 1, borderColor: "rgba(217,168,78,0.35)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: "hidden",
  },
  visualCard: { marginBottom: 18, paddingVertical: 10 },
  sectionLabel: {
    fontSize: 10, fontWeight: "900", letterSpacing: 2, color: AuraLunisColors.gold, marginBottom: 10,
  },
  factsCard: {
    backgroundColor: "rgba(217,168,78,0.06)",
    borderWidth: 1, borderColor: "rgba(217,168,78,0.16)",
    borderRadius: 16, padding: 14, marginBottom: 20, gap: 10,
  },
  factRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  bullet: { color: AuraLunisColors.gold2, fontSize: 13, lineHeight: 20, marginTop: 0 },
  factText: { color: "#FFF", fontSize: 14, lineHeight: 20, flex: 1, fontWeight: "600" },
  summary: { color: AuraLunisColors.gold2, fontSize: 15, lineHeight: 23, fontWeight: "700", marginBottom: 12 },
  bodyPara: { color: AuraLunisColors.silver, fontSize: 14, lineHeight: 23, marginBottom: 14 },
  skyBtn: {
    marginTop: 4, marginBottom: 14, borderRadius: 14, paddingVertical: 14, alignItems: "center",
    backgroundColor: AuraLunisColors.gold,
  },
  skyBtnText: { color: AuraLunisColors.cosmicBlack, fontWeight: "900", fontSize: 14, letterSpacing: 0.3 },
  vaultBtn: {
    marginBottom: 14, borderRadius: 14, paddingVertical: 13, alignItems: "center",
    backgroundColor: "rgba(217,168,78,0.12)",
    borderWidth: 1, borderColor: "rgba(217,168,78,0.4)",
  },
  vaultBtnSaved: { borderColor: "rgba(217,168,78,0.7)", backgroundColor: "rgba(217,168,78,0.2)" },
  vaultBtnText: { color: AuraLunisColors.gold2, fontWeight: "800", fontSize: 14, letterSpacing: 0.3 },
  nextBtn: {
    marginBottom: 24, borderRadius: 14, padding: 14,
    backgroundColor: "rgba(255,255,255,0.045)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  nextLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 2, color: AuraLunisColors.faint, marginBottom: 3 },
  nextTitle: { fontSize: 15, fontWeight: "800", color: "#FFF" },
  nudge: {
    marginBottom: 28, borderRadius: 16, padding: 16,
    backgroundColor: "rgba(217,168,78,0.07)", borderWidth: 1, borderColor: "rgba(217,168,78,0.22)",
  },
  nudgeTitle: { color: AuraLunisColors.gold2, fontSize: 14, fontWeight: "800", marginBottom: 6 },
  nudgeBody: { color: AuraLunisColors.silver, fontSize: 13, lineHeight: 20, marginBottom: 12 },
  nudgeBtn: { borderRadius: 12, paddingVertical: 11, alignItems: "center", backgroundColor: AuraLunisColors.gold },
  nudgeBtnText: { color: AuraLunisColors.cosmicBlack, fontWeight: "900", fontSize: 13, letterSpacing: 0.3 },
});
