// The app-root half of First Light: the optional offer, and the "Welcome" step that precedes
// Sky Lens. Everything from "Look around" onward lives inside Sky Lens (FirstLightSkyLens).
//
// The offer is a genuine choice, presented once. "Skip for now" is remembered, so the user is
// never asked again — Settings → Replay First Light is the way back in. Nothing here requests a
// permission, opens the paywall, or touches onboarding state.
//
// When the persisted document says the user was mid-tour, the offer leads with RESUME and also
// offers a clean restart, rather than silently dropping them back at step one.

import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuraLunisColors } from "@/theme/tokens";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { TourOverlay } from "@/features/tour/TourOverlay";
import { useFirstLight } from "./FirstLightContext";

/**
 * Height of the app's bottom tab bar, reserved so the Welcome card never sits on top of the
 * navigation. Mirrors TAB_BAR_STYLE.height in navigation/RootTabs.tsx — kept as a local value
 * rather than an import so the tour stays out of the navigation module graph; the wiring
 * self-test asserts the two stay equal.
 */
export const ROOT_TAB_BAR_HEIGHT = 82;

type Props = {
  /** Bring the user to the Sky tab (and therefore Sky Lens) when the tour starts. */
  onEnterSky?: () => void;
};

export function FirstLightRootOverlay({ onEnterSky }: Props) {
  const firstLight = useFirstLight();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  if (!firstLight) return null;

  const { offerVisible, overlayVisible, step, steps, index, total, canGoBack, resumable } = firstLight;

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
          <View style={[styles.offerCard, { marginBottom: insets.bottom }]} accessibilityViewIsModal>
            {/* Bounded + scrollable: at the largest Dynamic Type sizes the copy outgrows the
                card, and without this the heading was pushed off the top of the screen — the
                user was asked to choose without being able to read the question. */}
            <ScrollView style={styles.offerScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.eyebrow} maxFontSizeMultiplier={1.6}>
                FIRST LIGHT
              </Text>
              <Text style={styles.offerTitle} accessibilityRole="header" maxFontSizeMultiplier={1.5}>
                {resumable ? "Pick up where you left off?" : "Want a quick guided tour?"}
              </Text>
              <Text style={styles.offerCopy} maxFontSizeMultiplier={1.8}>
                {resumable
                  ? "You were partway through First Light. Carry on from where you stopped, or start again from the beginning."
                  : "First Light walks you through the sky by doing, not reading. It takes a couple of minutes and you can leave at any time."}
              </Text>
              <Text style={styles.offerNote} maxFontSizeMultiplier={1.6}>
                You can start it later from Settings → Replay First Light.
              </Text>
            </ScrollView>

            <Pressable
              style={styles.primaryBtn}
              onPress={() => {
                if (resumable) firstLight.resumeTour();
                else firstLight.beginTour();
                onEnterSky?.();
              }}
              accessibilityRole="button"
              accessibilityLabel={resumable ? "Resume First Light" : "Begin First Light"}
            >
              <Text
                style={styles.primaryText}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                maxFontSizeMultiplier={1.5}
              >
                {resumable ? "Resume First Light" : "Begin First Light"}
              </Text>
            </Pressable>

            {resumable ? (
              <Pressable
                style={styles.secondaryBtn}
                onPress={() => {
                  firstLight.restartTour();
                  onEnterSky?.();
                }}
                accessibilityRole="button"
                accessibilityLabel="Restart First Light from the beginning"
              >
                <Text style={styles.secondaryText} numberOfLines={1} maxFontSizeMultiplier={1.4}>
                  Start from the beginning
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              style={styles.secondaryBtn}
              onPress={firstLight.declineOffer}
              accessibilityRole="button"
              accessibilityLabel="Skip First Light for now"
            >
              <Text style={styles.secondaryText} numberOfLines={1} maxFontSizeMultiplier={1.4}>
                Skip for now
              </Text>
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
      // Keep the card clear of the tab bar — the Welcome step runs over the live app.
      reservedBottom={ROOT_TAB_BAR_HEIGHT}
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
    // Never taller than the screen: the copy scrolls inside, the buttons stay put.
    maxHeight: "84%",
  },
  offerScroll: { flexGrow: 0, flexShrink: 1 },
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
    paddingHorizontal: 14,
  },
  primaryText: { color: "#17120B", fontWeight: "900", fontSize: 15 },
  secondaryBtn: { marginTop: 10, minHeight: 44, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: AuraLunisColors.muted, fontWeight: "800", fontSize: 14 },
});
