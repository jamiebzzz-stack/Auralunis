import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { AuraLunisColors } from "@/theme/tokens";
import { CHROME_MIN_TOUCH, CHROME_TEXT_SCALE } from "@/theme/dynamicType";

type Props = {
  title: string;
  description: string;
  actionLabel?: string;
  onPress?: () => void;
  status?: string;
};

export function FeatureCard({
  title,
  description,
  actionLabel = "Open",
  onPress,
  status = "Ready"
}: Props) {
  function handlePress() {
    // Haptics enhance the experience but should never block the button action.
    void Haptics.selectionAsync().catch(() => {
      // No-op on unsupported devices and preview environments.
    });

    onPress?.();
  }

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        {/* Decorative heading: bounded so it cannot consume the card. */}
        <Text style={styles.title} maxFontSizeMultiplier={CHROME_TEXT_SCALE.cardTitle} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.status} maxFontSizeMultiplier={CHROME_TEXT_SCALE.cardStatus} numberOfLines={1}>
          {status}
        </Text>
      </View>
      {/* Body copy is intentionally NOT capped — this is the text the accessibility setting
          exists to enlarge, and the card is inside a scroll view. */}
      <Text style={styles.description}>{description}</Text>
      <Pressable style={styles.button} onPress={handlePress}>
        <Text style={styles.buttonText} maxFontSizeMultiplier={CHROME_TEXT_SCALE.cardAction} numberOfLines={1}>
          {actionLabel}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 12
  },
  top: { flexDirection: "row", justifyContent: "space-between", gap: 12, alignItems: "center" },
  title: { color: "#FFF", fontSize: 18, fontWeight: "800", flex: 1 },
  status: {
    color: AuraLunisColors.gold2,
    fontSize: 11,
    flexShrink: 0,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(217,168,78,0.25)"
  },
  description: { color: AuraLunisColors.muted, lineHeight: 20, fontSize: 13, marginTop: 8 },
  button: {
    marginTop: 14,
    backgroundColor: "rgba(217,168,78,0.13)",
    borderWidth: 1,
    borderColor: "rgba(217,168,78,0.26)",
    borderRadius: 16,
    paddingVertical: 12,
    // A real touch target, independent of how the caption scales.
    minHeight: CHROME_MIN_TOUCH,
    justifyContent: "center",
    alignItems: "center"
  },
  buttonText: { color: "#FFF", fontWeight: "800" }
});
