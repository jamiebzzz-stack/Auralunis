// THE APP TOUR — the one and only first-run tutorial.
//
// AuraLunis used to ship two overlapping tutorials: this four-slide onboarding flow, which
// ended by pushing the user straight into birth-chart creation, and then the First Light tour,
// which offered itself the moment onboarding closed. A fresh install therefore met two
// walkthroughs back to back, the second of which was a hands-on mission that could refuse to
// advance if the sky did not cooperate.
//
// There is now exactly one tour: three informational screens, and the only inputs are Next,
// Back, Skip and Done. It never shows the paywall, advertises a trial, requests a permission,
// reads a sensor, touches entitlement, or writes to the Vault. Birth-chart setup is no longer
// part of it — it is a separate, optional, non-blocking prompt (BirthChartPrompt).
//
// Sky Lens is described truthfully as a fully rendered, sensor-aligned planetarium — never as
// AR / augmented reality / a camera overlay / a live camera (see onboarding-route-selftest.js).
import React, { useEffect, useState } from "react";
import { AccessibilityInfo, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LogoMark } from "@/components/LogoMark";
import { AuraLunisColors } from "@/theme/tokens";
import { tapLight } from "@/services/HapticService";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { CHROME_TEXT_SCALE } from "@/theme/dynamicType";

type Slide = {
  eyebrow: string;
  title: string;
  body: string;
  /** Optional truthful caveat / detail lines rendered under the body. */
  points?: { label: string; text: string }[];
  note?: string;
};

// Copy is deliberately scoped to what AuraLunis actually delivers: Sun sign, rising sign,
// the planets and moon over your birthplace, and a personal reading. Houses and aspects are
// NOT introduced because the app does not compute or display them.
// Three screens, in order. Deliberately fixed: the same tour for every user, with no capability
// branching, no premium variant, and nothing that can be blocked.
export const APP_TOUR_SLIDES: Slide[] = [
  {
    eyebrow: "THE SKY",
    title: "Explore the Sky",
    body:
      "Sky Lens is a fully rendered planetarium. It uses your device's compass and motion sensors to show the real positions of planets, bright stars and constellations above you right now — point your phone and the sky moves with you. Tap any object to open its card and read the detail behind it.",
  },
  {
    eyebrow: "LEARN",
    title: "Learn and Discover",
    body:
      "The Learn tab holds short, readable astronomy lessons that start from the beginning and build up to more advanced material. Your progress is remembered as you go, and the lessons you mark are kept so you can come back to them.",
  },
  {
    eyebrow: "YOUR VAULT",
    title: "Save What Matters",
    body:
      "Your Vault keeps the discoveries worth remembering — saved objects from the sky, the lessons you have marked, and your own sky notes — encrypted on your device. The Vault is a Premium feature, and nothing is ever saved unless you choose to save it.",
  },
];

/** How many screens the tour has. Exported so the count can be asserted directly. */
export const APP_TOUR_SCREEN_COUNT = APP_TOUR_SLIDES.length;

const SLIDES = APP_TOUR_SLIDES;

type Props = {
  visible: boolean;
  /** Called when onboarding is completed OR skipped — App persists the flag and enters the app. */
  onDone: () => void;
};

export function OnboardingFlow({ visible, onDone }: Props) {
  const [step, setStep] = useState(0);
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const isLast = step === SLIDES.length - 1;
  const slide = SLIDES[step];

  // Reset to the first slide every time onboarding (re)opens, including Replay Tutorial.
  useEffect(() => {
    if (visible) setStep(0);
  }, [visible]);

  // Gentle cross-fade on slide change — fully skipped when Reduce Motion is on.
  const fade = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) {
      fade.value = 1;
      return;
    }
    fade.value = 0;
    fade.value = withTiming(1, { duration: 260 });
  }, [step, reduceMotion]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  function announce(message: string) {
    // Keep VoiceOver oriented as the slide changes.
    AccessibilityInfo.announceForAccessibility(message);
  }

  function goNext() {
    tapLight();
    if (isLast) {
      onDone();
      return;
    }
    const next = step + 1;
    setStep(next);
    announce(`${SLIDES[next].title}. Step ${next + 1} of ${SLIDES.length}.`);
  }

  function goBack() {
    if (step === 0) return;
    tapLight();
    const prev = step - 1;
    setStep(prev);
    announce(`${SLIDES[prev].title}. Step ${prev + 1} of ${SLIDES.length}.`);
  }

  function skip() {
    tapLight();
    onDone();
  }

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={goBack}>
      <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
        {/* Header: progress + skip */}
        <View style={styles.header}>
          <Pressable
            style={styles.backHit}
            onPress={goBack}
            disabled={step === 0}
            accessibilityRole="button"
            accessibilityLabel="Back"
            accessibilityState={{ disabled: step === 0 }}
          >
            <Text
              style={[styles.backText, step === 0 && styles.backTextHidden]}
              maxFontSizeMultiplier={CHROME_TEXT_SCALE.cardAction}
              numberOfLines={1}
            >
              ‹ Back
            </Text>
          </Pressable>

          <View
            style={styles.dots}
            accessibilityRole="progressbar"
            accessibilityLabel={`Step ${step + 1} of ${SLIDES.length}`}
          >
            {SLIDES.map((_, i) => (
              <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
            ))}
          </View>

          {/* Skip on screens 1-2; the final screen offers Done instead, which is the same
              gesture and reads as finishing rather than abandoning. The placeholder keeps the
              progress dots centred when Skip is absent. */}
          {isLast ? (
            <View style={styles.skipHit} />
          ) : (
            <Pressable
              style={styles.skipHit}
              onPress={skip}
              accessibilityRole="button"
              accessibilityLabel="Skip the app tour"
            >
              <Text style={styles.skipText} maxFontSizeMultiplier={CHROME_TEXT_SCALE.cardAction} numberOfLines={1}>
                Skip
              </Text>
            </Pressable>
          )}
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={[styles.slide, fadeStyle]}>
            {step === 0 && (
              <View style={styles.logoWrap}>
                <LogoMark size={78} />
              </View>
            )}
            <Text style={styles.eyebrow} maxFontSizeMultiplier={CHROME_TEXT_SCALE.screenSubtitle} numberOfLines={1}>
              {slide.eyebrow}
            </Text>
            {/* The tour used to apply NO Dynamic Type policy at all. At AX-XXXL a 30pt title
                grew past 100pt and fragmented mid-word ("Explor / e the / Sky"). Capped with
                the shared screenTitle scale, held to two lines, and allowed to shrink the last
                bit rather than break a word. Default size is unaffected: the cap only binds
                once the system scale exceeds it. */}
            <Text
              style={styles.title}
              accessibilityRole="header"
              maxFontSizeMultiplier={CHROME_TEXT_SCALE.screenTitle}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {slide.title}
            </Text>
            <Text style={styles.body}>{slide.body}</Text>

            {slide.points?.map((point) => (
              <View key={point.label} style={styles.point}>
                <Text style={styles.pointLabel}>{point.label}</Text>
                <Text style={styles.pointText}>{point.text}</Text>
              </View>
            ))}

            {slide.note ? <Text style={styles.note}>{slide.note}</Text> : null}
          </Animated.View>
        </ScrollView>

        {/* Primary CTA pinned above the safe area */}
        <View style={styles.footer}>
          <Pressable
            style={styles.cta}
            onPress={goNext}
            accessibilityRole="button"
            accessibilityLabel={isLast ? "Done" : "Next"}
          >
            {/* ALWAYS enabled: no screen has a condition to satisfy, so this button can never
                be dead. That dead button is exactly what stranded users in the old tour. */}
            <Text
              style={styles.ctaText}
              maxFontSizeMultiplier={CHROME_TEXT_SCALE.cardAction}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {isLast ? "Done" : "Next"}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#040611", paddingHorizontal: 22 },
  // minHeight, NOT height. A fixed 40pt row with unbounded 14pt labels overflowed at
  // AX-XXXL and the Back/Skip text visually collided with the scrolling body beneath it.
  // The row now grows to fit its own content, so the ScrollView always starts below it —
  // spacing derived from the real chrome rather than a fixed offset tuned to one device.
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 40,
    paddingVertical: 4,
    flexShrink: 0,
  },
  backHit: { minWidth: 64, minHeight: 44, justifyContent: "center", flexShrink: 1 },
  backText: { color: AuraLunisColors.gold2, fontSize: 14, fontWeight: "800" },
  backTextHidden: { opacity: 0 },
  dots: { flexDirection: "row", gap: 8, alignItems: "center", flexShrink: 0, paddingHorizontal: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(199,166,106,0.28)" },
  dotActive: { width: 22, backgroundColor: AuraLunisColors.gold },
  skipHit: { minWidth: 64, minHeight: 44, alignItems: "flex-end", justifyContent: "center", flexShrink: 1 },
  skipText: { color: AuraLunisColors.muted, fontSize: 14, fontWeight: "800" },
  scroll: { flex: 1 },
  content: { paddingTop: 18, paddingBottom: 20, flexGrow: 1, justifyContent: "center" },
  slide: { alignItems: "center" },
  logoWrap: { marginBottom: 18 },
  eyebrow: { color: AuraLunisColors.gold, fontSize: 11, letterSpacing: 3, fontWeight: "900" },
  title: { color: "#FFF", fontSize: 30, fontWeight: "900", marginTop: 10, textAlign: "center", lineHeight: 36 },
  body: { color: AuraLunisColors.silver, fontSize: 15.5, lineHeight: 24, textAlign: "center", marginTop: 16, maxWidth: 360 },
  point: {
    width: "100%",
    maxWidth: 380,
    borderWidth: 1,
    borderColor: "rgba(199,166,106,0.22)",
    backgroundColor: "rgba(16,21,34,0.7)",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 15,
    marginTop: 12,
  },
  pointLabel: { color: AuraLunisColors.gold, fontSize: 10, letterSpacing: 1.5, fontWeight: "900" },
  pointText: { color: AuraLunisColors.silver, fontSize: 13.5, lineHeight: 20, marginTop: 4 },
  note: {
    color: AuraLunisColors.muted,
    fontSize: 12.5,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 20,
    maxWidth: 360,
    fontStyle: "italic",
  },
  footer: { paddingTop: 10 },
  cta: { width: "100%", borderRadius: 15, backgroundColor: AuraLunisColors.gold, paddingVertical: 16, alignItems: "center" },
  ctaText: { color: "#17120B", fontWeight: "900", fontSize: 15 },
});
