// The app-root half of First Light: the optional offer, and the "Welcome" step that precedes
// Sky Lens. Everything from "Look around" onward lives inside Sky Lens (FirstLightSkyLens).
//
// The offer is a genuine choice, presented once. "Skip for now" is remembered, so the user is
// never asked again — Settings → Replay First Light is the way back in. Nothing here requests a
// permission, opens the paywall, or touches onboarding state.

import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuraLunisColors } from "@/theme/tokens";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { TourOverlay } from "@/features/tour/TourOverlay";
import { useFirstLight } from "./FirstLightContext";

type Props = {
  /** Bring the user to the Sky tab (and therefore Sky Lens) when the tour starts. */
  onEnterSky?: () => void;
};

export function FirstLightRootOverlay({ onEnterSky }: Props) {
  const firstLight = useFirstLight();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  if (!firstLight) return null;

  const { offerVisible, overlayVisible, step, steps, index, total, canGoBack } = firstLight;

  // ── The offer ────────────────────────────────────────────────────────────────────
  if (offerVisible) {
    return (
      <Modal
        visible
        transparent
        // Reduce Motion removes the presentation animation as well as the in-card ones.
        animationType={reduceMotion ? "none" : "fade"}
        onRequestClose={firstLight.declineOffer}
      >
        <View style={styles.offerScrim}>
          <View
            style={[styles.offerCard, { marginBottom: insets.bottom }]}
            accessibilityViewIsModal
          >
            <Text style={styles.eyebrow}>FIRST LIGHT</Text>
            <Text style={styles.offerTitle} accessibilityRole="header">
              Want a quick guided tour?
            </Text>
            <Text style={styles.offerCopy}>
              First Light walks you through the sky by doing, not reading. It takes a couple of
              minutes and you can leave at any time.
            </Text>
            <Text style={styles.offerNote}>
              You can start it later from Settings → Replay First Light.
            </Text>

            <Pressable
              style={styles.primaryBtn}
              onPress={() => {
                firstLight.beginTour();
                onEnterSky?.();
              }}
              accessibilityRole="button"
              accessibilityLabel="Begin First Light"
            >
              <Text style={styles.primaryText}>Begin First Light</Text>
            </Pressable>

            <Pressable
              style={styles.secondaryBtn}
              onPress={firstLight.declineOffer}
              accessibilityRole="button"
              accessibilityLabel="Skip First Light for now"
            >
              <Text style={styles.secondaryText}>Skip for now</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  // ── The Welcome step ─────────────────────────────────────────────────────────────
  if (!overlayVisible || !step || step.host !== "root") return null;

  return (
    <TourOverlay
      visible
      stepId={step.id}
      heading={step.heading}
      copy={step.copy}
      index={index}
      total={total}
      canGoBack={canGoBack}
      canContinue
      continueLabel={step.continueLabel ?? "Continue"}
      onBack={firstLight.back}
      onSkip={firstLight.skip}
      onContinue={() => {
        firstLight.next();
        // The next step lives in Sky Lens, so take the user there.
        if (steps[index + 1]?.host === "skyLens") onEnterSky?.();
      }}
    />
  );
}

const styles = StyleSheet.create({
  offerScrim: {
    flex: 1,
    backgroundColor: "rgba(2,6,16,0.86)",
    justifyContent: "flex-end",
    padding: 18,
  },
  offerCard: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: AuraLunisColors.borderGold,
    backgroundColor: AuraLunisColors.surface,
    padding: 22,
  },
  eyebrow: { color: AuraLunisColors.gold, fontSize: 10.5, letterSpacing: 3, fontWeight: "900" },
  offerTitle: { color: "#FFF", fontSize: 24, fontWeight: "900", marginTop: 10, lineHeight: 30 },
  offerCopy: { color: AuraLunisColors.silver, fontSize: 14.5, lineHeight: 21, marginTop: 10 },
  offerNote: { color: AuraLunisColors.muted, fontSize: 12.5, lineHeight: 18, marginTop: 10, fontStyle: "italic" },
  primaryBtn: {
    marginTop: 18,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: AuraLunisColors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: "#17120B", fontWeight: "900", fontSize: 15 },
  secondaryBtn: { marginTop: 10, minHeight: 44, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: AuraLunisColors.muted, fontWeight: "800", fontSize: 14 },
});
