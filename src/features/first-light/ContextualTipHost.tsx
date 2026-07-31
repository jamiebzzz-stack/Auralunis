// One-time contextual mini-guides. A single small card, at most one at a time, shown only
// after First Light has settled and only when nothing more important is on screen.
//
// WHY THE TIP IDENTITY IS HELD IN STATE.
// Eligibility is derived from `contextualTipsSeen`. The first version recorded the impression
// the instant a tip rendered, which made the tip that was showing ineligible on the very next
// render; the next candidate took the slot, was recorded too, and the whole set was consumed in
// a four-render burst with nothing readable. Now the host CHOOSES once (selectHeldTip) and
// keeps that identity until it is dismissed or retires, and the impression is recorded on a
// timer. A tip can no longer replace itself, so a burst is structurally impossible.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { AuraLunisColors } from "@/theme/tokens";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useFirstLight } from "./FirstLightContext";
import {
  CONTEXTUAL_TIPS,
  selectHeldTip,
  TIP_AUTO_HIDE_MS,
  TIP_MIN_IMPRESSION_MS,
  type ContextualTipId,
  type TipContext,
} from "./contextualTips";

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

  /** The one tip this host owns right now. Never swapped out from under itself. */
  const [heldTipId, setHeldTipId] = useState<ContextualTipId | null>(null);

  const settled =
    firstLight?.document.status === "completed" || firstLight?.document.status === "skipped";

  const tipContext: TipContext = {
    ...context,
    firstLightSettled: settled === true,
    tourOverlayVisible: (firstLight?.overlayVisible ?? false) || (firstLight?.offerVisible ?? false),
    // This host renders one card at a time, so nothing can stack on itself.
    otherTipVisible: false,
  };

  const tipId = firstLight ? selectHeldTip(heldTipId, candidates, firstLight.document, tipContext) : null;

  // Adopt the selection. Runs only when the resolved tip differs from what is held, so a
  // `contextualTipsSeen` write can never bump the tip that is currently on screen.
  useEffect(() => {
    if (tipId !== heldTipId) setHeldTipId(tipId);
  }, [tipId, heldTipId]);

  const recordTipSeen = firstLight?.recordTipSeen;
  const announcedRef = useRef<string | null>(null);

  // Announce once per tip, then record the impression only after it has genuinely been on
  // screen — and retire it if the user never dismisses it. Both timers are cleared on change
  // or unmount, so nothing fires against a dead component.
  useEffect(() => {
    if (!tipId) {
      announcedRef.current = null;
      return;
    }
    if (announcedRef.current !== tipId) {
      announcedRef.current = tipId;
      const tip = CONTEXTUAL_TIPS[tipId];
      AccessibilityInfo.announceForAccessibility(`${tip.heading}. ${tip.body}`);
    }

    const impression = setTimeout(() => recordTipSeen?.(tipId), TIP_MIN_IMPRESSION_MS);
    const retire = setTimeout(() => setHeldTipId(null), TIP_AUTO_HIDE_MS);
    return () => {
      clearTimeout(impression);
      clearTimeout(retire);
    };
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

  const dismiss = useCallback(() => {
    if (!tipId || !firstLight) return;
    // Dismissal always records the tip, so a remount cannot replay it.
    firstLight.recordTipDismissed(tipId);
    setHeldTipId(null);
  }, [tipId, firstLight]);

  if (!firstLight || !tipId) return null;
  const tip = CONTEXTUAL_TIPS[tipId];

  return (
    // box-none: the card is interactive, the space around it is not — a tip never swallows a
    // tap meant for the sky.
    <View style={[styles.wrap, { bottom }]} pointerEvents="box-none">
      <Animated.View style={[styles.card, { opacity: fade }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heading} accessibilityRole="header" maxFontSizeMultiplier={1.6}>
            {tip.heading}
          </Text>
          <Text style={styles.body} maxFontSizeMultiplier={1.8}>
            {tip.body}
          </Text>
        </View>
        <Pressable
          onPress={dismiss}
          hitSlop={12}
          style={styles.dismiss}
          accessibilityRole="button"
          accessibilityLabel={`Dismiss tip: ${tip.heading}`}
        >
          <Text style={styles.dismissText} maxFontSizeMultiplier={1.4}>
            ✕
          </Text>
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
