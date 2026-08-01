// The Sky Lens half of First Light — steps 2 through 9.
//
// THIS COMPONENT ONLY OBSERVES. It reads values Sky Lens already computes and renders an
// overlay on top; it never calls back into orientation, projection, selection, layers, time, or
// the Vault. Specifically:
//
//   • "Look around" and "drag while locked" are detected from the RENDERED QUATERNION, using
//     the existing angleBetweenQuaternions helper. Nothing is added to the gesture handlers, so
//     Lock Sky, drag-to-pan, gesture arbitration, and smoothing are byte-for-byte unchanged.
//   • The tutorial object is chosen from what is ACTUALLY IN VIEW: candidates come from the live
//     ephemeris snapshot, are projected with the SAME projection function the scene is drawn
//     with, and only one comfortably inside the visible sky is eligible. No object is hardcoded,
//     nothing below the horizon is ever chosen, and nothing behind the camera can be nominated.
//     Once chosen it is FROZEN for the object steps, so no GPS fix, layout pass or sensor frame
//     can swap the target out from under the user mid-step.
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
import {
  LOOK_AROUND_NO_MOTION_HINT,
  NO_LIVE_TARGET_HINT,
  NO_VISIBLE_TARGET_HINT,
  OBJECT_STEP_FALLBACK_HINT,
  type FirstLightStepId,
} from "./firstLightSteps";
import { isObjectStepSatisfied, isSaveStepSatisfied, shouldRestoreLiveTime } from "./firstLightRules";
import {
  isProjectionTrustworthy,
  resolveProjectedSpotlightRect,
  type SpotlightReadiness,
} from "./firstLightSpotlight";
import {
  describeConstellation,
  rankTutorialCandidates,
  selectTutorialConstellation,
  selectVisibleTutorialTarget,
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
/**
 * How long an object step waits for a usable object before giving up and becoming
 * instructional. Long enough for a genuine sweep of the sky, short enough that nobody sits on a
 * dead Continue button wondering whether the app has hung.
 */
export const OBJECT_STEP_FALLBACK_MS = 45000;

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

  /** The steps that act on ONE specific object. The target is frozen across all of them. */
  const onObjectStep = stepId === "findObject" || stepId === "openCard" || stepId === "saveDiscovery";

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

  // ── Choose an object the user can ACTUALLY SEE ──────────────────────────────────
  // Previously the whole sky was ranked and the winner could be behind the user — the tour then
  // said "Turn around for Venus" and disabled Continue until they did, which on a physical
  // iPhone meant not at all. Candidates are now projected through the SAME basis, FOV, viewport
  // and readiness gates as the scene, and only one comfortably inside the visible sky is chosen.
  const rankedCandidates = useMemo(() => rankTutorialCandidates(bodies, stars), [bodies, stars]);

  // Only searched while an object step is actually hunting for a target. Sky Lens re-renders on
  // every sensor frame, and projecting every candidate each time would put real work on that
  // path for the whole tour — including the steps that have nothing to do with objects.
  const [frozenTarget, setFrozenTarget] = useState<TutorialTarget | null>(null);
  const searchingForTarget = active && onObjectStep && !frozenTarget;

  const visibleTarget = useMemo<TutorialTarget | null>(() => {
    if (!searchingForTarget || !projectionTrustworthy) return null;
    const candidates = rankedCandidates.map((candidate) => {
      try {
        return {
          target: candidate,
          projection: project(candidate.azimuthDegrees, candidate.altitudeDegrees),
        };
      } catch {
        return { target: candidate, projection: null };
      }
    });
    return selectVisibleTutorialTarget(candidates, box, { reservedBottom });
  }, [searchingForTarget, rankedCandidates, project, box, reservedBottom, projectionTrustworthy]);

  // ── Freeze it for the duration of the object steps ──────────────────────────────
  // Once chosen, the object does not change while the user is working with it. Neither a GPS
  // fix landing, nor a layout pass, nor a sensor frame, nor the old 20-second re-pick may swap
  // the target out from under Steps 3, 4 and 8 — Step 4's card check and Step 8's save check
  // both compare against this exact id.
  useEffect(() => {
    if (!active) return;
    if (!onObjectStep) {
      // Left the object steps entirely (or the tour restarted) — release, so a later run picks
      // afresh rather than inheriting a target from a previous pass.
      setFrozenTarget((current) => (current === null ? current : null));
      return;
    }
    if (frozenTarget) return; // locked: never re-picked mid-step
    if (visibleTarget) setFrozenTarget(visibleTarget);
  }, [active, onObjectStep, frozenTarget, visibleTarget]);

  /** The object this step is about: the frozen one on the object steps, else nothing. */
  const target = onObjectStep ? frozenTarget : null;

  // ── Tell the tour what this device can actually support ─────────────────────────
  const reportCapabilities = firstLight?.reportCapabilities;
  // Whether a real object is up AT ALL — deliberately not "is one in view", because the mission
  // SHAPE (Vault save vs the Learn fallback) must not flip as the user turns around.
  const hasLiveTarget = rankedCandidates.length > 0;

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

  // ── Bounded safety net for the object steps ─────────────────────────────────────
  // The object steps are the only ones that can be blocked by the SKY rather than by the user:
  // if nothing suitable is in view, and nothing comes into view, there is no action left to
  // perform. Rather than trap anyone, each object step gives up after a bounded interval and
  // becomes instructional — Continue unblocks, and the copy says plainly that the object step
  // was not completed. Nothing pretends the interaction happened, and this can only ever
  // unblock: a step already satisfied the real way never starts the timer.
  const [fallbackStepIds, setFallbackStepIds] = useState<ReadonlyArray<string>>([]);
  const stepAlreadySatisfied = firstLight?.canContinue === true;

  useEffect(() => {
    if (!active || !onObjectStep || !stepId) return;
    if (stepAlreadySatisfied) return;
    const timer = setTimeout(() => {
      setFallbackStepIds((current) => (current.includes(stepId) ? current : [...current, stepId]));
    }, OBJECT_STEP_FALLBACK_MS);
    // Re-armed whenever the step changes, so each object step gets its own full interval and a
    // step left and returned to is never instantly bypassed.
    return () => clearTimeout(timer);
  }, [active, onObjectStep, stepId, stepAlreadySatisfied]);

  const fallbackEngaged = !!stepId && onObjectStep && fallbackStepIds.includes(stepId);

  useEffect(() => {
    if (!active || !fallbackEngaged || !stepId || !satisfy) return;
    satisfy(stepId as FirstLightStepId);
  }, [active, fallbackEngaged, stepId, satisfy]);

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
    noVisibleTarget: onObjectStep && !target,
    fallbackEngaged,
  });

  return (
    <>
      {/* Directional cue — shown ONLY for an object that was already chosen because it was in
          view and has since drifted out. It can no longer say "turn around" for something the
          user was never shown: an object behind the camera is not eligible to be chosen. */}
      {stepId === "findObject" && target && !target.simulated && targetProjection && !targetProjection.onScreen && !fallbackEngaged && (
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

// The old useTutorialTarget hook is gone. It ranked the WHOLE SKY and re-picked on a 20-second
// timer, which is what nominated an object behind the user and then swapped targets mid-step.
// Selection is now viewport-aware (rankTutorialCandidates + selectVisibleTutorialTarget) and
// frozen for the duration of the object steps. `practiceTarget` remains exported and unit-tested
// but is no longer used to satisfy a step: a marker that is not in the sky must never stand in
// for finding something that is.

function resolveHint(args: {
  stepId: string | null;
  motionAvailable: boolean;
  simulatedTarget: boolean;
  constellationCopy: { title: string; subtitle: string } | null;
  targetName: string | null;
  variant: string | null;
  targetOnScreen: boolean;
  /** An object step is showing but nothing suitable is in view yet. */
  noVisibleTarget: boolean;
  /** The bounded safety net has given up on this object step. */
  fallbackEngaged: boolean;
}): string | null {
  const { stepId, motionAvailable, simulatedTarget, constellationCopy, targetName, variant, targetOnScreen } = args;
  // The safety net speaks first and speaks plainly: the step was skipped, not completed.
  if (args.fallbackEngaged) return OBJECT_STEP_FALLBACK_HINT;
  if (stepId === "lookAround" && !motionAvailable) return LOOK_AROUND_NO_MOTION_HINT;
  // Waiting for something worth pointing at — never name an object the user cannot see.
  if (args.noVisibleTarget) return NO_VISIBLE_TARGET_HINT;
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
