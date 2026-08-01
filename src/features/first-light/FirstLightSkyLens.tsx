// The Sky Lens half of First Light — steps 2 through 9.
//
// THIS COMPONENT ONLY OBSERVES. It reads values Sky Lens already computes and renders an
// overlay on top; it never calls back into orientation, projection, selection, layers, time, or
// the Vault. Specifically:
//
//   • "Look around" and "drag while locked" are detected from the RENDERED QUATERNION, using
//     the existing angleBetweenQuaternions helper. Nothing is added to the gesture handlers, so
//     Lock Sky, drag-to-pan, gesture arbitration, and smoothing are byte-for-byte unchanged.
//   • The tutorial object is chosen from the LIVE ephemeris snapshot and projected with the
//     SAME projection function the scene is drawn with, so the spotlight cannot disagree with
//     what is on screen. No object is hardcoded, and nothing below the horizon is ever chosen.
//   • Object cards are never opened by the tour. It watches `selectedId` and waits for the user
//     to tap the real object, so stale or incorrect object data is impossible.
//   • Sky objects are spotlighted with an explicit rect derived from that projection — no view
//     is mounted over the object, and the overlay's dimming is drawn AROUND the spotlight, so
//     the real hit target and its VoiceOver element stay live and tappable throughout.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { AuraLunisColors } from "@/theme/tokens";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { TourOverlay } from "@/features/tour/TourOverlay";
import {
  angleBetweenQuaternions,
  type Quaternion,
} from "@/features/sky-lens/ar/orientationQuaternion";
import { useFirstLight } from "./FirstLightContext";
import { LOOK_AROUND_NO_MOTION_HINT, NO_LIVE_TARGET_HINT } from "./firstLightSteps";
import { isObjectStepSatisfied, isSaveStepSatisfied, shouldRestoreLiveTime } from "./firstLightRules";
import {
  isProjectionTrustworthy,
  resolveProjectedSpotlightRect,
  type SpotlightReadiness,
} from "./firstLightSpotlight";
import {
  describeConstellation,
  practiceTarget,
  selectTutorialConstellation,
  selectTutorialObject,
  type TutorialBodyInput,
  type TutorialConstellationInput,
  type TutorialStarInput,
  type TutorialTarget,
} from "./firstLightTargets";

/** Enough rotation to be a deliberate look around, not a hand tremor. */
export const LOOK_AROUND_DEGREES = 12;
/** Enough panning, while locked, to count as "you dragged the sky". */
export const LOCK_DRAG_DEGREES = 8;
/** Enough of a time change to have visibly moved the sky. */
export const TIME_CHANGE_MINUTES = 20;
/** How often the tutorial target is re-picked as the sky turns (ms). */
const TARGET_REFRESH_MS = 20000;

type Projected = { x: number; y: number; onScreen: boolean; behind: boolean; bearingDegrees: number };

type Props = {
  box: { width: number; height: number };
  /**
   * The canvas above has reported its REAL size through onLayout. Sky Lens opens on a hardcoded
   * placeholder, and projecting through that placeholder put the spotlight ~94 px too high — in
   * the top chrome — on a 430x932 device. See firstLightSpotlight.ts.
   */
  boxMeasured: boolean;
  /** The observer location has settled ("granted" or the app-wide "fallback"), not DEFAULT_OBSERVER. */
  locationReady: boolean;
  /** The orientation actually rendered this frame (live, locked, dragged, or blending). */
  orientation: Quaternion;
  motionAvailable: boolean;
  isLocked: boolean;
  selectedId: string | null;
  timeOffsetMinutes: number;
  /** The existing time-travel control is mounted and release-intended. */
  timeControlAvailable: boolean;
  savedIds: ReadonlySet<string>;
  isPremium: boolean;
  bodies: ReadonlyArray<TutorialBodyInput>;
  stars: ReadonlyArray<TutorialStarInput>;
  constellations: ReadonlyArray<TutorialConstellationInput>;
  /** The SAME shared projection the scene, labels, and hit tests use. */
  project: (azimuthDegrees: number, altitudeDegrees: number) => Projected;
  /** Where the camera is aimed right now — only used to place the practice marker. */
  cameraAim: { azimuthDegrees: number; altitudeDegrees: number };
  onOpenLearn: () => void;
  onRestoreLiveTime: () => void;
  /** Measured height of the Sky Lens bottom control strip the tour card must not cover. */
  reservedBottom: number;
  accent: string;
};

// Screen-space bearing (0 = right, 90 = down) → an arrow glyph. Presentation only.
const ARROWS = ["→", "↘", "↓", "↙", "←", "↖", "↑", "↗"];
const arrowFor = (bearingDegrees: number) => ARROWS[Math.round(bearingDegrees / 45) % 8];

export function FirstLightSkyLens(props: Props) {
  const {
    box,
    boxMeasured,
    locationReady,
    orientation,
    motionAvailable,
    isLocked,
    selectedId,
    timeOffsetMinutes,
    timeControlAvailable,
    savedIds,
    isPremium,
    bodies,
    stars,
    constellations,
    project,
    cameraAim,
    onOpenLearn,
    onRestoreLiveTime,
    reservedBottom,
    accent,
  } = props;

  const firstLight = useFirstLight();
  const reduceMotion = useReducedMotion();

  const active = firstLight?.overlayVisible === true && firstLight.step?.host === "skyLens";
  const step = firstLight?.step ?? null;
  const stepId = step?.id ?? null;

  // ── Tell the tour what this device can actually support ─────────────────────────
  const reportCapabilities = firstLight?.reportCapabilities;
  const target = useTutorialTarget(bodies, stars, cameraAim);
  const hasLiveTarget = target !== null && !target.simulated;

  useEffect(() => {
    reportCapabilities?.({
      isPremium,
      motionAvailable,
      timeControlAvailable,
      // A save step only makes sense when there is a real object whose card can be opened.
      vaultSaveAvailable: hasLiveTarget,
      learnAvailable: true,
    });
  }, [reportCapabilities, isPremium, motionAvailable, timeControlAvailable, hasLiveTarget]);

  const constellation = useMemo(
    () => selectTutorialConstellation(constellations),
    // Re-picking on every ephemeris tick is enough; the list identity changes with the sky.
    [constellations]
  );

  // ── Step 2: meaningful orientation movement ─────────────────────────────────────
  // The anchor is captured when the step opens; movement is measured as the angle between
  // whole orientations, so any direction counts and no particular heading is demanded.
  const anchorRef = useRef<Quaternion | null>(null);
  useEffect(() => {
    anchorRef.current = orientation;
    // Deliberately anchored on step change only — re-anchoring every frame would mean the
    // threshold could never be crossed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepId]);

  const satisfy = firstLight?.satisfy;
  useEffect(() => {
    if (!active || stepId !== "lookAround" || !satisfy) return;
    // No sensors (simulator, or motion unavailable): explain the drag alternative and let the
    // user continue rather than trapping them on an impossible step.
    if (!motionAvailable) {
      satisfy("lookAround");
      return;
    }
    const anchor = anchorRef.current;
    if (!anchor) return;
    if (angleBetweenQuaternions(anchor, orientation) >= LOOK_AROUND_DEGREES) satisfy("lookAround");
  }, [active, stepId, motionAvailable, orientation, satisfy]);

  // ── Are the inputs behind a projected position authoritative yet? ───────────────
  // Gated at the PROJECTION rather than only at the rectangle, because the same provisional
  // numbers also decide `targetOnScreen` — and a placeholder viewport can report an object as
  // on screen when it is not, which would satisfy "Find your first object" without the user
  // ever seeing it. This changes no satisfaction RULE (firstLightRules is untouched); it only
  // withholds an input until it is real. Readiness always arrives: onLayout fires on first
  // layout, and the location resolver has a total try/catch, so status always leaves "loading".
  const readiness = useMemo<SpotlightReadiness>(
    () => ({ boxMeasured, locationReady }),
    [boxMeasured, locationReady]
  );
  const projectionTrustworthy = isProjectionTrustworthy(readiness);

  // ── Step 3: the chosen object comes into view ───────────────────────────────────
  const targetProjection = useMemo<Projected | null>(() => {
    // Only projected while the tour is on screen — Sky Lens re-renders on every sensor frame
    // and this must not add work to that path when no tour is running.
    if (!active || !target) return null;
    if (!projectionTrustworthy) return null;
    try {
      return project(target.azimuthDegrees, target.altitudeDegrees);
    } catch {
      return null;
    }
  }, [active, target, project, projectionTrustworthy]);

  useEffect(() => {
    if (!active || stepId !== "findObject" || !satisfy) return;
    // The rule lives in firstLightRules.isObjectStepSatisfied so the no-motion case is
    // deterministically testable — it was only reachable by driving a simulator before.
    const satisfied = isObjectStepSatisfied({
      step: "findObject",
      motionAvailable,
      targetSimulated: target?.simulated ?? false,
      targetOnScreen: !!targetProjection && targetProjection.onScreen && !targetProjection.behind,
      correctCardOpen: false,
    });
    if (satisfied) satisfy("findObject");
  }, [active, stepId, target?.simulated, motionAvailable, targetProjection, satisfy]);

  // ── Step 4: the CORRECT card opened ─────────────────────────────────────────────
  useEffect(() => {
    if (!active || stepId !== "openCard" || !satisfy) return;
    const satisfied = isObjectStepSatisfied({
      step: "openCard",
      motionAvailable,
      targetSimulated: target?.simulated ?? false,
      targetOnScreen: !!targetProjection && targetProjection.onScreen && !targetProjection.behind,
      correctCardOpen: !!target && selectedId === target.id,
    });
    if (satisfied) satisfy("openCard");
  }, [active, stepId, selectedId, target, motionAvailable, targetProjection, satisfy]);

  // ── Step 6: lock AND a real drag while locked ───────────────────────────────────
  // While the sky is locked the rendered orientation changes ONLY because of drag, so the
  // angle from the lock-time orientation is a faithful drag measure — with no hook into the
  // gesture handler and therefore no risk to drag behaviour.
  const lockAnchorRef = useRef<Quaternion | null>(null);
  const [lockObserved, setLockObserved] = useState(false);
  useEffect(() => {
    if (isLocked) {
      if (!lockAnchorRef.current) lockAnchorRef.current = orientation;
      setLockObserved(true);
    } else {
      lockAnchorRef.current = null;
    }
    // Anchored on the lock transition only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocked]);

  useEffect(() => {
    if (!active || stepId !== "lockSky" || !satisfy) return;
    if (!isLocked || !lockObserved) return;
    const anchor = lockAnchorRef.current;
    if (!anchor) return;
    if (angleBetweenQuaternions(anchor, orientation) >= LOCK_DRAG_DEGREES) satisfy("lockSky");
  }, [active, stepId, isLocked, lockObserved, orientation, satisfy]);

  // ── Step 7: a meaningful time change, then restore unless the user keeps it ─────
  const [keepChangedTime, setKeepChangedTime] = useState(false);
  useEffect(() => {
    if (!active || stepId !== "exploreTime" || !satisfy) return;
    if (Math.abs(timeOffsetMinutes) >= TIME_CHANGE_MINUTES) satisfy("exploreTime");
  }, [active, stepId, timeOffsetMinutes, satisfy]);

  // ── Step 8 (Vault variant): the tutorial object was really saved ────────────────
  useEffect(() => {
    if (!active || stepId !== "saveDiscovery" || !satisfy) return;
    // A real, persisted save is the genuine completion; the rule additionally refuses to demand
    // the impossible when there is no motion and the object cannot be brought into view.
    const satisfied = isSaveStepSatisfied({
      variant: step?.variant === "learn" ? "learn" : "vault",
      motionAvailable,
      targetSimulated: target?.simulated ?? false,
      targetOnScreen: !!targetProjection && targetProjection.onScreen && !targetProjection.behind,
      targetSaved: !!target && savedIds.has(target.id),
    });
    if (satisfied) satisfy("saveDiscovery");
  }, [active, stepId, step?.variant, savedIds, target, motionAvailable, targetProjection, satisfy]);

  // ── Completion flourish (skipped under Reduce Motion) ───────────────────────────
  const celebrate = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active || stepId !== "completion") return;
    if (reduceMotion) {
      celebrate.setValue(1);
      return;
    }
    celebrate.setValue(0);
    const animation = Animated.spring(celebrate, {
      toValue: 1,
      useNativeDriver: true,
      tension: 48,
      friction: 8,
    });
    animation.start();
    return () => animation.stop();
  }, [active, stepId, reduceMotion, celebrate]);

  // LEAVING THE TIME STEP RESTORES THE LIVE SKY — by ANY route.
  // Continue, Back, Skip Tour, a pause because Sky Lens closed, or the whole tour unmounting all
  // funnel through the same observation: the step that WAS showing is no longer showing. Wiring
  // this to the Continue handler alone left the sky frozen hours away whenever the user backed
  // out or skipped instead.
  const keepChangedTimeRef = useRef(keepChangedTime);
  keepChangedTimeRef.current = keepChangedTime;
  const restoreRef = useRef(onRestoreLiveTime);
  restoreRef.current = onRestoreLiveTime;
  const timeOffsetRef = useRef(timeOffsetMinutes);
  timeOffsetRef.current = timeOffsetMinutes;

  const previousStepRef = useRef<string | null>(null);
  useEffect(() => {
    const previous = previousStepRef.current;
    previousStepRef.current = stepId;
    const restore = shouldRestoreLiveTime({
      previousStepId: previous,
      nextStepId: stepId,
      keepChangedTime: keepChangedTimeRef.current,
      timeOffsetMinutes: timeOffsetRef.current,
    });
    if (restore) restoreRef.current();
  }, [stepId]);

  // Unmount (Sky Lens closed, tour torn down) — same rule, nextStepId of null.
  useEffect(
    () => () => {
      const restore = shouldRestoreLiveTime({
        previousStepId: previousStepRef.current,
        nextStepId: null,
        keepChangedTime: keepChangedTimeRef.current,
        timeOffsetMinutes: timeOffsetRef.current,
      });
      if (restore) restoreRef.current();
    },
    []
  );

  const handleContinue = useCallback(() => {
    if (!firstLight) return;
    // The step-change effect above performs the restore; advancing is all this has to do.
    firstLight.next();
  }, [firstLight]);

  if (!firstLight || !active || !step) return null;

  const constellationCopy = constellation ? describeConstellation(constellation) : null;
  // Same gate as the object projection — a placeholder viewport would ring the wrong patch of sky.
  const constellationProjection =
    constellation && projectionTrustworthy
      ? project(constellation.centroid.azimuthDegrees, constellation.centroid.altitudeDegrees)
      : null;

  // The spotlight rect is handed to the overlay directly rather than measured, because a sky
  // object moves every frame; measuring a continuously-moving view would invalidate the layout
  // registry sixty times a second. The rect comes from the SAME projection the scene is drawn
  // with, so the ring sits exactly where the object is rendered.
  // Readiness is re-checked inside the resolver as well: it is the single authority, so no
  // caller can accidentally draw from provisional inputs.
  const spotlightRect = resolveProjectedSpotlightRect({
    stepId,
    targetProjection,
    constellationProjection,
    box,
    readiness,
  });

  const hint = resolveHint({
    stepId,
    motionAvailable,
    simulatedTarget: target?.simulated ?? false,
    constellationCopy,
    targetName: target?.name ?? null,
    variant: step.variant ?? null,
    targetOnScreen: !!targetProjection && targetProjection.onScreen && !targetProjection.behind,
  });

  return (
    <>
      {/* Directional cue for "Find your first object". A hint, never an automatic camera
          move — the user does the finding. */}
      {stepId === "findObject" && target && !target.simulated && targetProjection && !targetProjection.onScreen && (
        <View style={styles.cue} pointerEvents="none">
          <Text style={[styles.cueText, { color: accent }]}>
            {targetProjection.behind
              ? `Turn around for ${target.name} ↻`
              : `Pan ${arrowFor(targetProjection.bearingDegrees)} to ${target.name}`}
          </Text>
        </View>
      )}

      <TourOverlay
        visible
        stepId={step.id}
        heading={step.heading}
        copy={step.copy}
        hint={hint}
        targetKey={step.targetKey}
        spotlightRect={spotlightRect}
        reservedBottom={reservedBottom}
        index={firstLight.index}
        total={firstLight.total}
        canGoBack={firstLight.canGoBack}
        canContinue={firstLight.canContinue}
        continueLabel={step.continueLabel ?? "Continue"}
        accent={accent}
        onBack={firstLight.back}
        onSkip={firstLight.skip}
        onContinue={handleContinue}
        actions={
          <>
            {stepId === "exploreTime" && (
              <Pressable
                onPress={() => setKeepChangedTime((value) => !value)}
                style={styles.choiceBtn}
                accessibilityRole="button"
                accessibilityState={{ selected: keepChangedTime }}
                accessibilityLabel={
                  keepChangedTime
                    ? "Keep the changed time when this step ends"
                    : "Return to the live current time when this step ends"
                }
              >
                <Text style={styles.choiceText}>
                  {keepChangedTime ? "✓ Keeping this time" : "Return to now when I continue"}
                </Text>
              </Pressable>
            )}

            {stepId === "saveDiscovery" && step.variant === "learn" && (
              <Pressable
                onPress={onOpenLearn}
                style={styles.choiceBtn}
                accessibilityRole="button"
                accessibilityLabel="Open Learn"
              >
                <Text style={styles.choiceText}>Open Learn</Text>
              </Pressable>
            )}

            {stepId === "completion" && (
              <Animated.View
                style={{
                  opacity: celebrate,
                  transform: [{ scale: celebrate.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
                }}
              >
                <Text style={[styles.celebrate, { color: accent }]} accessibilityElementsHidden>
                  ✦ ✦ ✦
                </Text>
                <Pressable
                  onPress={onOpenLearn}
                  style={styles.choiceBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Open Learn"
                >
                  <Text style={styles.choiceText}>Open Learn</Text>
                </Pressable>
                <Text style={styles.replayNote}>
                  You can replay First Light any time from Settings.
                </Text>
              </Animated.View>
            )}
          </>
        }
      />
    </>
  );
}

/** Chooses the tutorial object and refreshes it as the sky turns. */
function useTutorialTarget(
  bodies: ReadonlyArray<TutorialBodyInput>,
  stars: ReadonlyArray<TutorialStarInput>,
  cameraAim: { azimuthDegrees: number; altitudeDegrees: number }
): TutorialTarget | null {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), TARGET_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  return useMemo(() => {
    const live = selectTutorialObject(bodies, stars);
    if (live) return live;
    if (bodies.length === 0 && stars.length === 0) return null;
    // Nothing suitable is up. Fall back to a clearly-labelled practice marker placed in front
    // of the camera, so the tour continues without pretending anything is visible.
    return practiceTarget(cameraAim.azimuthDegrees, Math.max(20, cameraAim.altitudeDegrees));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodies, stars, tick]);
}

function resolveHint(args: {
  stepId: string | null;
  motionAvailable: boolean;
  simulatedTarget: boolean;
  constellationCopy: { title: string; subtitle: string } | null;
  targetName: string | null;
  variant: string | null;
  targetOnScreen: boolean;
}): string | null {
  const { stepId, motionAvailable, simulatedTarget, constellationCopy, targetName, variant, targetOnScreen } = args;
  if (stepId === "lookAround" && !motionAvailable) return LOOK_AROUND_NO_MOTION_HINT;
  if ((stepId === "findObject" || stepId === "openCard") && simulatedTarget) return NO_LIVE_TARGET_HINT;
  // No motion: state plainly that the sky cannot be swept here, and that the step is not being
  // treated as completed by pointing the phone. Nothing pretends motion was detected.
  if (stepId === "findObject" && !motionAvailable) {
    return targetName
      ? `${targetName} is up tonight, but without motion the sky can’t follow your phone — continue and you’ll learn to lock and drag instead.`
      : NO_LIVE_TARGET_HINT;
  }
  if (stepId === "openCard" && !motionAvailable && !targetOnScreen) {
    return "Tapping an object needs it on screen. Continue — the next steps show you how to bring the sky to you.";
  }
  if (stepId === "findObject" && targetName) return `Tonight’s target: ${targetName}.`;
  if (stepId === "openCard" && targetName) return `Tap ${targetName} to open its card.`;
  if (stepId === "constellation" && constellationCopy) {
    return `${constellationCopy.title} — ${constellationCopy.subtitle}.`;
  }
  if (stepId === "constellation") return "No familiar pattern is well placed right now — continue when you're ready.";
  if (stepId === "saveDiscovery" && variant !== "learn" && !motionAvailable && !targetOnScreen) {
    return "Saving needs the object on screen, which this device can’t reach without motion. Continue — you can save any object from its card whenever you like.";
  }
  if (stepId === "saveDiscovery" && variant === "learn") {
    return "Saving to the Vault is a Premium feature, so this step just points you at Learn instead.";
  }
  return null;
}

const styles = StyleSheet.create({
  cue: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "42%",
    alignItems: "center",
  },
  cueText: { fontSize: 15, fontWeight: "800", textShadowColor: "#000", textShadowRadius: 6 },
  choiceBtn: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(217,168,78,0.28)",
    backgroundColor: "rgba(217,168,78,0.10)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  choiceText: { color: "#FFF", fontWeight: "800", fontSize: 13.5 },
  celebrate: { fontSize: 20, textAlign: "center", marginBottom: 8, letterSpacing: 6 },
  replayNote: { color: AuraLunisColors.muted, fontSize: 12, textAlign: "center", marginTop: 8 },
});
