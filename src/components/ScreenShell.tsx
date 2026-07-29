import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { AuraLunisColors, AuraLunisTypography } from "@/theme/tokens";
import { LogoMark } from "@/components/LogoMark";
import { StarDust } from "@/components/StarDust";
import { useAuraLunisSettings } from "@/state/AuraLunisSettingsContext";

type Props = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  /** Optional custom background layer rendered behind the safe scrolling content. */
  background?: React.ReactNode;
};

export function ScreenShell({ title, subtitle, children, background }: Props) {
  const { palette } = useAuraLunisSettings();
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient colors={palette.gradient as unknown as readonly [string, string, ...string[]]} style={styles.root}>
      {background ?? <StarDust count={12} color={AuraLunisColors.gold} opacity={0.18} />}
      {/* The SafeAreaView owns insets.top so the whole scroll viewport begins below the
          Dynamic Island. Do not add insets.top again as content padding: that would double
          the gap while still allowing a differently structured ScrollView to scroll under it. */}
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(36, insets.bottom + 28) }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
        >
          <View style={styles.brandBar}>
            <LogoMark size={32} />
            <Text style={styles.brandName} allowFontScaling={false}>AURALUNIS</Text>
            <View style={{ flex: 1 }} />
          </View>
          <View style={styles.header}>
            <Text style={[styles.subtitle, { color: palette.accent }]}>{subtitle}</Text>
            <Text style={styles.title} maxFontSizeMultiplier={1.25}>{title}</Text>
          </View>
          {children}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 12 },
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
    lineHeight: 34,
    fontWeight: "900",
    letterSpacing: -1.1,
    marginTop: 2
  }
});