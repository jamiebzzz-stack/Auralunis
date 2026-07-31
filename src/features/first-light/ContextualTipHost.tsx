// One-time contextual mini-guides. A single small card, at most one at a time, shown only
// after First Light has settled and only when nothing more important is on screen.
//
// The eligibility rules live in contextualTips.ts (pure, unit-tested). This component is just
// the presentation plus the "seen" bookkeeping: whatever it shows, it records, so a tip appears
// exactly once per install unless the tutorial state is reset.

import React, { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { AuraLunisColors } from "@/theme/tokens";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useFirstLight } from "./FirstLightContext";
import { CONTEXTUAL_TIPS, nextEligibleTip, type ContextualTipId, type TipContext } from "./contextualTips";

type Props = {
  /** Ordered tips this host may show, most relevant first. */
  candidates: ReadonlyArray<ContextualTipId>;
  /** Everything that can suppress a tip right now. */
  context: Omit<TipContext, "firstLightSettled" | "tourOverlayVisible" | "otherTipVisible">;
  /** Distance from the bottom edge, so the card clears whatever chrome the host has. */
  bottom?: number;
};

export function ContextualTipHost({ candidates, context, bottom = 24 }: Props) {
  const firstLight = useFirstLight();
  const reduceMotion = useReducedMotion();
  const fade = useRef(new Animated.Value(0)).current;

  const settled =
    firstLight?.document.status === "completed" || firstLight?.document.status === "skipped";

  const tipId = firstLight
    ? nextEligibleTip(candidates, firstLight.document, {
        ...context,
        firstLightSettled: settled === true,
        tourOverlayVisible: firstLight.overlayVisible || firstLight.offerVisible,
        // This host renders one card at a time, so nothing can stack on itself.
        otherTipVisible: false,
      })
    : null;

  // Record the impression once, when a tip actually becomes visible.
  const announcedRef = useRef<string | null>(null);
  const recordTipSeen = firstLight?.recordTipSeen;
  useEffect(() => {
    if (!tipId) {
      announcedRef.current = null;
      return;
    }
    if (announcedRef.current === tipId) return;
    announcedRef.current = tipId;
    const tip = CONTEXTUAL_TIPS[tipId];
    AccessibilityInfo.announceForAccessibility(`${tip.heading}. ${tip.body}`);
    recordTipSeen?.(tipId);
  }, [tipId, recordTipSeen]);

  useEffect(() => {
    if (!tipId) {
      fade.setValue(0);
      return;
    }
    if (reduceMotion) {
      fade.setValue(1);
      return;
    }
    fade.setValue(0);
    const animation = Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [tipId, reduceMotion, fade]);

  if (!firstLight || !tipId) return null;
  const tip = CONTEXTUAL_TIPS[tipId];

  return (
    // box-none: the card is interactive, the space around it is not — a tip never swallows a
    // tap meant for the sky.
    <View style={[styles.wrap, { bottom }]} pointerEvents="box-none">
      <Animated.View style={[styles.card, { opacity: fade }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heading} accessibilityRole="header">
            {tip.heading}
          </Text>
          <Text style={styles.body}>{tip.body}</Text>
        </View>
        <Pressable
          onPress={() => firstLight.recordTipDismissed(tipId)}
          hitSlop={12}
          style={styles.dismiss}
          accessibilityRole="button"
          accessibilityLabel={`Dismiss tip: ${tip.heading}`}
        >
          <Text style={styles.dismissText}>✕</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 12, right: 12 },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: AuraLunisColors.borderGold,
    backgroundColor: "rgba(7,18,37,0.96)",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  heading: { color: AuraLunisColors.gold2, fontSize: 12, fontWeight: "900", letterSpacing: 1.2 },
  body: { color: AuraLunisColors.silver, fontSize: 13, lineHeight: 19, marginTop: 4 },
  dismiss: { minWidth: 44, minHeight: 44, alignItems: "flex-end", justifyContent: "center" },
  dismissText: { color: AuraLunisColors.muted, fontSize: 16, fontWeight: "800" },
});
