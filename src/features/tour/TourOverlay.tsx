// TourOverlay — the reusable presentation layer for a guided tour.
//
// Deliberate properties, each of which was a requirement rather than a nicety:
//
//  • NOTHING COVERS THE HIGHLIGHTED CONTROL. Dimming is drawn as four bands AROUND the
//    spotlight (tourGeometry.dimBands), not as a scrim with a transparent hole. The control
//    keeps its own touch target and its own VoiceOver element — the tour can require you to
//    tap the real thing.
//  • NO OVERLAY EVER SWALLOWS UNRELATED TAPS. The root is pointerEvents="box-none" and every
//    decorative view is pointerEvents="none"; only the instruction card is interactive. When
//    `visible` is false the component renders null, so nothing invisible can be left behind.
//  • NO HARDCODED COORDINATES. The spotlight comes from a runtime measurement of a registered
//    target (TourTargetRegistry). If the target is missing, unmounted, or off-screen the step
//    still renders — just without a spotlight.
//  • Re-measures on layout change, orientation change, and on return from the background.
//  • Reduce Motion removes the fade; VoiceOver gets one announcement per step and focus moves
//    to the instruction card.

import React, { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AccessibilityInfo,
  Animated,
  AppState,
  findNodeHandle,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuraLunisColors } from "@/theme/tokens";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useTourTargetRegistry } from "./TourTargetRegistry";
import {
  cardAnchor,
  DEFAULT_CARD_GAP,
  dimBands,
  maxCardHeight,
  spotlightFor,
  type TourRect,
} from "./tourGeometry";

const FADE_MS = 220;
const DEFAULT_CARD_HEIGHT = 190;

export type TourOverlayProps = {
  visible: boolean;
  /** Identity of the step showing — drives the one-per-step VoiceOver announcement. */
  stepId: string;
  heading: string;
  copy: string;
  /** Optional second line: a fallback explanation, or why a step can't be completed here. */
  hint?: string | null;
  /** Registered target to spotlight. Omit (or point at a missing key) for a step with no
   *  spotlight. Ignored when `spotlightRect` is supplied. */
  targetKey?: string | null;
  /**
   * An explicit rect to spotlight, for a target that is not a mounted control — e.g. a sky
   * object whose position the host already computes from the live projection every frame.
   * Supplying it directly avoids measuring (and therefore re-registering) a view that moves
   * continuously, which would otherwise invalidate the whole layout registry on every frame.
   */
  spotlightRect?: TourRect | null;
  /**
   * Height of a host-owned control strip at the bottom that the instruction card must not
   * cover. Sky Lens passes its measured dock height so an un-spotlit card can never sit on top
   * of Lock Sky, the shutter, the layer bar, or the time panel.
   */
  reservedBottom?: number;
  index: number;
  total: number;
  canGoBack: boolean;
  canContinue: boolean;
  continueLabel?: string;
  skipLabel?: string;
  /** Extra controls rendered under the primary button (e.g. the completion step's choices). */
  actions?: ReactNode;
  onBack: () => void;
  onSkip: () => void;
  onContinue: () => void;
  accent?: string;
};

export function TourOverlay({
  visible,
  stepId,
  heading,
  copy,
  hint,
  targetKey,
  spotlightRect,
  reservedBottom = 0,
  index,
  total,
  canGoBack,
  canContinue,
  continueLabel = "Continue",
  skipLabel = "Skip Tour",
  actions,
  onBack,
  onSkip,
  onContinue,
  accent = AuraLunisColors.gold,
}: TourOverlayProps) {
  const insets = useSafeAreaInsets();
  const screen = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const registry = useTourTargetRegistry();
  const layoutNonce = registry?.layoutNonce ?? 0;
  const measureTarget = registry?.measureTarget;

  const [target, setTarget] = useState<TourRect | null>(null);
  const [cardHeight, setCardHeight] = useState(DEFAULT_CARD_HEIGHT);
  const cardRef = useRef<View>(null);

  // ── Measure the spotlight target ────────────────────────────────────────────────
  // Re-runs on step change, on any registered layout change, and when the window resizes.
  // The `cancelled` flag means a resolution that lands after the step advanced (or after the
  // overlay unmounted) is discarded instead of setting state on a dead component.
  useEffect(() => {
    // An explicit rect needs no measurement at all.
    if (!visible || spotlightRect || !targetKey || !measureTarget) {
      setTarget(null);
      return;
    }
    let cancelled = false;
    void measureTarget(targetKey).then((rect) => {
      if (!cancelled) setTarget(rect);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, spotlightRect, targetKey, measureTarget, layoutNonce, screen.width, screen.height]);

  // Coming back from the background can invalidate every measurement (rotation while away,
  // a changed text size). Ask the registry to re-measure rather than trusting stale numbers.
  const invalidateLayout = registry?.invalidateLayout;
  useEffect(() => {
    if (!visible || !invalidateLayout) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") invalidateLayout();
    });
    return () => subscription.remove();
  }, [visible, invalidateLayout]);

  // ── One VoiceOver announcement per step, and move focus to the instruction card ──
  useEffect(() => {
    if (!visible) return;
    const message = `${heading}. ${copy} Step ${index + 1} of ${total}.`;
    AccessibilityInfo.announceForAccessibility(message);

    // Focus lands on the card so the user hears the instruction before hunting the screen.
    // iOS only — setAccessibilityFocus is a no-op elsewhere and findNodeHandle can be null
    // for a not-yet-committed view, which we simply skip.
    if (Platform.OS !== "ios") return;
    const handle = cardRef.current ? findNodeHandle(cardRef.current) : null;
    if (handle != null) AccessibilityInfo.setAccessibilityFocus(handle);
  }, [visible, stepId, heading, copy, index, total]);

  // ── Entrance fade (skipped entirely under Reduce Motion) ────────────────────────
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) {
      fade.setValue(0);
      return;
    }
    if (reduceMotion) {
      fade.setValue(1);
      return;
    }
    fade.setValue(0);
    const animation = Animated.timing(fade, {
      toValue: 1,
      duration: FADE_MS,
      useNativeDriver: true,
    });
    animation.start();
    // Stopping the animation on unmount/step change is what keeps the driver from writing to
    // a detached node — the tour's equivalent of clearing a timer.
    return () => animation.stop();
  }, [visible, stepId, reduceMotion, fade]);

  const onCardLayout = useCallback((event: { nativeEvent: { layout: { height: number } } }) => {
    const height = event.nativeEvent.layout.height;
    if (Number.isFinite(height) && height > 0) setCardHeight(height);
  }, []);

  // Rendering null when hidden is the guarantee that no invisible overlay is ever left behind.
  if (!visible) return null;

  const spot = spotlightFor(spotlightRect ?? target, screen);
  const bands = dimBands(spot, screen);
  // The card is CAPPED, not merely scrollable. At the largest Dynamic Type sizes it used to
  // grow until almost no sky was left, which made "drag to explore" impractical even though
  // every control was technically reachable.
  const cardCap = maxCardHeight(screen, reservedBottom, insets);
  const anchor = cardAnchor(spot, screen, insets, Math.min(cardHeight, cardCap), DEFAULT_CARD_GAP, reservedBottom);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]} pointerEvents="box-none">
        {/* Dimming bands — purely decorative, never interactive. */}
        {bands.map((band, i) => (
          <View
            key={`band-${i}`}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.dim, { left: band.x, top: band.y, width: band.width, height: band.height }]}
          />
        ))}

        {/* Focus ring around the live control. Decorative: the control underneath keeps its
            own touch target and accessibility element. */}
        {spot && (
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[
              styles.ring,
              {
                left: spot.x,
                top: spot.y,
                width: spot.width,
                height: spot.height,
                borderColor: accent,
              },
            ]}
          />
        )}

        {/* Instruction card — the only interactive part of the overlay. */}
        <View onLayout={onCardLayout} style={[styles.card, { top: anchor.top, borderColor: accent, maxHeight: cardCap }]}>
          <View style={styles.progressRow}>
            <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {Array.from({ length: total }, (_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    i === index && [styles.dotActive, { backgroundColor: accent }],
                    i < index && styles.dotDone,
                  ]}
                />
              ))}
            </View>
            {/* Progress is also stated in words: colour is never the only indicator. */}
            <Text style={styles.progressText} accessibilityRole="text" numberOfLines={1} maxFontSizeMultiplier={1.4}>
              Step {index + 1} of {total}
            </Text>
          </View>

          <ScrollView
            style={styles.copyScroll}
            contentContainerStyle={styles.copyContent}
            // The scroll bar is the affordance that says "there is more" — without it a line
            // cut at the scroll boundary just reads as broken text.
            showsVerticalScrollIndicator
          >
            {/* The instruction TEXT is the single focusable element VoiceOver lands on when the
                step changes. Grouping is applied here rather than on the whole card, because a
                card-level `accessible` would swallow the Back / Skip / Continue buttons and make
                them unreachable. */}
            <View
              ref={cardRef}
              accessible
              accessibilityLabel={`${heading}. ${copy}${hint ? ` ${hint}` : ""}`}
            >
              <Text
                style={[styles.heading, { color: accent }]}
                accessibilityRole="header"
                // The heading is the most decorative text here; unbounded it became a billboard
                // that pushed the body copy out of view entirely.
                maxFontSizeMultiplier={1.5}
              >
                {heading}
              </Text>
              <Text style={styles.copy} maxFontSizeMultiplier={1.9}>
                {copy}
              </Text>
              {hint ? (
                <Text style={styles.hint} maxFontSizeMultiplier={1.7}>
                  {hint}
                </Text>
              ) : null}
            </View>
          </ScrollView>

          <View style={styles.buttonRow}>
            <Pressable
              onPress={onBack}
              disabled={!canGoBack}
              hitSlop={8}
              style={styles.secondaryBtn}
              accessibilityRole="button"
              accessibilityLabel="Go back to the previous step"
              accessibilityState={{ disabled: !canGoBack }}
            >
              <Text
                style={[styles.secondaryText, !canGoBack && styles.disabledText]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.4}
              >
                Back
              </Text>
            </Pressable>

            <Pressable
              onPress={onSkip}
              hitSlop={8}
              style={styles.secondaryBtn}
              accessibilityRole="button"
              accessibilityLabel="Skip the tour"
            >
              <Text style={styles.secondaryText} numberOfLines={1} maxFontSizeMultiplier={1.4}>
                {skipLabel}
              </Text>
            </Pressable>

            <Pressable
              onPress={onContinue}
              disabled={!canContinue}
              hitSlop={8}
              style={[
                styles.primaryBtn,
                { backgroundColor: accent },
                !canContinue && styles.primaryBtnDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel={continueLabel}
              accessibilityHint={
                canContinue ? undefined : "Finish the highlighted action to continue."
              }
              accessibilityState={{ disabled: !canContinue }}
            >
              <Text
                style={styles.primaryText}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                maxFontSizeMultiplier={1.5}
              >
                {continueLabel}
              </Text>
            </Pressable>
          </View>

          {actions ? <View style={styles.actions}>{actions}</View> : null}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { position: "absolute", backgroundColor: "rgba(2,6,16,0.72)" },
  ring: {
    position: "absolute",
    borderRadius: 18,
    borderWidth: 2,
  },
  card: {
    position: "absolute",
    // A column whose scrollable region shrinks and whose action row never does.
    flexDirection: "column",
    left: 14,
    right: 14,
    borderRadius: 22,
    borderWidth: 1,
    backgroundColor: "rgba(7,18,37,0.97)",
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  progressRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, flexShrink: 0 },
  dots: { flexDirection: "row", gap: 6, alignItems: "center", flexShrink: 1 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "rgba(199,166,106,0.28)" },
  dotDone: { backgroundColor: "rgba(199,166,106,0.6)" },
  dotActive: { width: 18 },
  progressText: { color: AuraLunisColors.muted, fontSize: 12, fontWeight: "700" },
  // Bounded height + scroll: Dynamic Type grows the text instead of clipping it, and a very
  // long line scrolls inside the card rather than pushing the buttons off-screen.
  // maxHeight is supplied at render time from the live viewport (see the ScrollView above);
  // this only carries the spacing.
  // flexShrink lets the copy give up space inside the capped card; the action row below has
  // flexShrink 0, so buttons stay fixed and fully visible however large the text grows.
  copyScroll: { marginTop: 10, flexShrink: 1 },
  // Bottom padding so the final line clears the action row instead of sitting flush against it.
  copyContent: { paddingBottom: 14 },
  heading: { fontSize: 19, fontWeight: "900" },
  copy: { color: AuraLunisColors.silver, fontSize: 14.5, lineHeight: 21, marginTop: 6 },
  hint: { color: AuraLunisColors.muted, fontSize: 12.5, lineHeight: 18, marginTop: 8, fontStyle: "italic" },
  buttonRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, flexShrink: 0 },
  // 44pt minimum height on every control — comfortable touch targets at any text size.
  secondaryBtn: { minHeight: 44, minWidth: 64, justifyContent: "center", paddingHorizontal: 6 },
  secondaryText: { color: AuraLunisColors.muted, fontSize: 13.5, fontWeight: "800" },
  disabledText: { opacity: 0.35 },
  primaryBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryText: { color: "#17120B", fontWeight: "900", fontSize: 14.5 },
  actions: { marginTop: 10, gap: 8, flexShrink: 0 },
});
