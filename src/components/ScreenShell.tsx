import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuraLunisColors, AuraLunisTypography } from "@/theme/tokens";
import { CHROME_TEXT_SCALE } from "@/theme/dynamicType";
import { LogoMark } from "@/components/LogoMark";
import { StarDust } from "@/components/StarDust";
import { useAuraLunisSettings } from "@/state/AuraLunisSettingsContext";

type Props = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  /** Optional custom background layer (rendered absolutely behind the scroll
   *  content). Defaults to the gold StarDust. Home passes a living Starfield. */
  background?: React.ReactNode;
};

export function ScreenShell({ title, subtitle, children, background }: Props) {
  const { palette } = useAuraLunisSettings();
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient colors={palette.gradient as unknown as readonly [string, string, ...string[]]} style={styles.root}>
      {background ?? <StarDust count={12} color={AuraLunisColors.gold} opacity={0.18} />}
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* Brand header matching mockup: [Logo] AURALUNIS */}
        <View style={styles.brandBar}>
          <LogoMark size={32} />
          <Text style={styles.brandName} maxFontSizeMultiplier={CHROME_TEXT_SCALE.screenSubtitle} numberOfLines={1}>
            AURALUNIS
          </Text>
          <View style={{ flex: 1 }} />
        </View>
        {/* Screen title */}
        <View style={styles.header}>
          <Text
            style={[styles.subtitle, { color: palette.accent }]}
            maxFontSizeMultiplier={CHROME_TEXT_SCALE.screenSubtitle}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
          {/* Bounded, and allowed to shrink to fit rather than fragment. Without a ceiling
              "Sky Lens + Archive" broke mid-word into four lines at the largest text size. */}
          <Text
            style={styles.title}
            maxFontSizeMultiplier={CHROME_TEXT_SCALE.screenTitle}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {title}
          </Text>
        </View>
        {children}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 18, paddingBottom: 120 },
  brandBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12
  },
  brandName: {
    fontFamily: AuraLunisTypography.display.fontFamily,
    fontSize: 18,
    letterSpacing: 3,
    color: AuraLunisColors.gold
  },
  header: { marginBottom: 16 },
  subtitle: {
    color: AuraLunisColors.gold,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    fontWeight: "800"
  },
  title: {
    color: "#FFF",
    fontSize: 29,
    fontWeight: "900",
    letterSpacing: -1.1,
    marginTop: 2
  }
});
