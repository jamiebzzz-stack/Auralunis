// The optional birth-chart offer.
//
// Deliberately small and deliberately skippable. It is NOT part of the app tour, it never
// appears on the same launch as the tour (see birthChartPromptRules.ts), and "Maybe Later" is
// remembered exactly as firmly as "Create Chart" — neither is asked twice.
//
// It opens nothing on its own: "Create Chart" hands the user to the existing Sky tab entry
// point, which keeps its own premium gate. This component contains no entitlement check and no
// paywall of its own.

import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuraLunisColors } from "@/theme/tokens";
import { tapLight } from "@/services/HapticService";
import { useReducedMotion } from "@/hooks/useReducedMotion";

type Props = {
  visible: boolean;
  /** Remember the answer and close. Called for BOTH choices. */
  onAnswer: () => void;
  /** Take the user to the existing birth-chart entry point. */
  onCreate: () => void;
};

export function BirthChartPrompt({ visible, onAnswer, onCreate }: Props) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType={reduceMotion ? "none" : "fade"}
      // Dismissing with the system gesture counts as "Maybe Later" — never as unanswered,
      // so the prompt cannot reappear on the next launch.
      onRequestClose={onAnswer}
    >
      <View style={styles.scrim}>
        <View style={[styles.card, { marginBottom: insets.bottom }]} accessibilityViewIsModal>
          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.eyebrow} maxFontSizeMultiplier={1.6}>
              OPTIONAL
            </Text>
            <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={1.5}>
              Create your birth chart?
            </Text>
            <Text style={styles.copy} maxFontSizeMultiplier={1.8}>
              AuraLunis can map the sky exactly as it stood over your birthplace — the planets, the
              moon phase, your Sun sign and your rising sign. It needs your birth date, birth time
              and birthplace.
            </Text>
            {/* The same honest caveat the old onboarding slide carried: an unknown birth time is
                not a small loss, and saying so up front is better than a vague chart later. */}
            <Text style={styles.note} maxFontSizeMultiplier={1.6}>
              Don’t know your birth time? You’ll still get your Sun sign and the planets — but your
              rising sign and other time-sensitive details need the local time you were born.
            </Text>
            <Text style={styles.note} maxFontSizeMultiplier={1.6}>
              Entirely optional. Everything else in the app works without it, and you can set it up
              later from the Sky tab.
            </Text>
          </ScrollView>

          <Pressable
            style={styles.primaryBtn}
            onPress={() => {
              tapLight();
              onCreate();
              onAnswer();
            }}
            accessibilityRole="button"
            accessibilityLabel="Create my birth chart"
          >
            <Text
              style={styles.primaryText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              maxFontSizeMultiplier={1.5}
            >
              Create Chart
            </Text>
          </Pressable>

          <Pressable
            style={styles.secondaryBtn}
            onPress={() => {
              tapLight();
              onAnswer();
            }}
            accessibilityRole="button"
            accessibilityLabel="Maybe later"
          >
            <Text style={styles.secondaryText} numberOfLines={1} maxFontSizeMultiplier={1.4}>
              Maybe Later
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: "rgba(2,6,16,0.86)", justifyContent: "flex-end", padding: 18 },
  card: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: AuraLunisColors.borderGold,
    backgroundColor: AuraLunisColors.surface,
    padding: 22,
    // Bounded so the copy scrolls at large Dynamic Type sizes instead of pushing the buttons
    // off-screen — the same failure the tour card was fixed for.
    maxHeight: "84%",
  },
  scroll: { flexGrow: 0, flexShrink: 1 },
  eyebrow: { color: AuraLunisColors.gold, fontSize: 10.5, letterSpacing: 3, fontWeight: "900" },
  title: { color: "#FFF", fontSize: 23, fontWeight: "900", marginTop: 10, lineHeight: 29 },
  copy: { color: AuraLunisColors.silver, fontSize: 14.5, lineHeight: 21, marginTop: 10 },
  note: { color: AuraLunisColors.muted, fontSize: 12.5, lineHeight: 18, marginTop: 10, fontStyle: "italic" },
  primaryBtn: {
    marginTop: 18,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: AuraLunisColors.gold,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  primaryText: { color: "#17120B", fontWeight: "900", fontSize: 15 },
  secondaryBtn: { marginTop: 10, minHeight: 44, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: AuraLunisColors.muted, fontWeight: "800", fontSize: 14 },
});
