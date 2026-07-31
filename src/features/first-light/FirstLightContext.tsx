// FirstLightContext — the one place that owns First Light.
//
// It holds the persisted tutorial document, the (pure) tour machine, and the capability set
// reported by Sky Lens, and derives everything the two overlay hosts render. Both hosts are
// dumb: they read from here and call back into here.
//
// Invariants worth stating, because each is a requirement:
//   • Nothing in this file writes to onboarding, entitlement, settings, Vault, or RevenueCat
//     state. First Light owns exactly one storage key.
//   • No setter is ever called from inside another setter's updater — updaters are pure, so
//     React (including StrictMode) may run them twice with the same result.
//   • Every async effect carries a cancellation flag, so a resolution that lands after unmount
//     is dropped rather than setting state on a dead component.
//   • Skipping is remembered. A user who said "not now" is not asked again; Settings → Replay
//     First Light is the only way back in.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { trackTutorialEvent } from "@/services/AnalyticsService";
import {
  DEFAULT_FIRST_LIGHT_STATE,
  markCompleted,
  markSkipped,
  markStarted,
  markStep,
  markTipSeen as markTipSeenPure,
  resetForReplay,
  shouldOfferFirstLight,
  type FirstLightState,
} from "./firstLightState";
import { loadFirstLightState, saveFirstLightState } from "./firstLightStorage";
import {
  buildFirstLightSteps,
  DEFAULT_CAPABILITIES,
  type FirstLightCapabilities,
  type FirstLightStep,
  type FirstLightStepId,
  type SaveStepVariant,
} from "./firstLightSteps";
import type { ContextualTipId } from "./contextualTips";
import {
  canContinue as machineCanContinue,
  canGoBack as machineCanGoBack,
  currentStep as machineCurrentStep,
  INITIAL_TOUR_STATE,
  reanchorIndex,
  tourReducer,
  type TourAction,
  type TourMachineState,
} from "@/features/tour/tourMachine";

type FirstLightContextValue = {
  hydrated: boolean;
  /** The persisted document (status, current step, tips seen). */
  document: FirstLightState;
  machine: TourMachineState;
  steps: FirstLightStep[];
  step: FirstLightStep | null;
  index: number;
  total: number;
  canContinue: boolean;
  canGoBack: boolean;
  /** True whenever a First Light step is on screen — contextual tips stand down. */
  overlayVisible: boolean;
  /** True when the "Begin First Light / Skip for now" choice should be presented. */
  offerVisible: boolean;
  /** Which shape the save step took for this user, or null when it was omitted. */
  saveVariant: SaveStepVariant | null;
  capabilities: FirstLightCapabilities;

  reportCapabilities: (capabilities: Partial<FirstLightCapabilities>) => void;
  beginTour: () => void;
  declineOffer: () => void;
  next: () => void;
  back: () => void;
  skip: () => void;
  satisfy: (stepId: FirstLightStepId) => void;
  finish: () => void;
  replay: () => void;

  hasSeenTip: (tipId: ContextualTipId) => boolean;
  recordTipSeen: (tipId: ContextualTipId) => void;
  recordTipDismissed: (tipId: ContextualTipId) => void;
};

const FirstLightContext = createContext<FirstLightContextValue | undefined>(undefined);

const nowISO = () => new Date().toISOString();

export function FirstLightProvider({
  children,
  /** False until the app proper is on screen — the offer must never sit over onboarding. */
  enabled = true,
}: {
  children: ReactNode;
  enabled?: boolean;
}) {
  const [hydrated, setHydrated] = useState(false);
  const [document, setDocument] = useState<FirstLightState>(DEFAULT_FIRST_LIGHT_STATE);
  const [machine, setMachine] = useState<TourMachineState>(INITIAL_TOUR_STATE);
  const [capabilities, setCapabilities] = useState<FirstLightCapabilities>(DEFAULT_CAPABILITIES);
  /** The offer was answered in this session — don't re-present it before the next launch. */
  const [offerAnswered, setOfferAnswered] = useState(false);

  // ── Hydrate once ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    void loadFirstLightState().then((loaded) => {
      if (!active) return;
      setDocument(loaded);
      setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const steps = useMemo(() => buildFirstLightSteps(capabilities), [capabilities]);

  // The step list changes shape when capabilities resolve (premium, sensors, Learn). Carry the
  // position across BY ID so a mid-tour rebuild can never land the user on a different step.
  const previousStepsRef = useRef<FirstLightStep[]>(steps);
  useEffect(() => {
    const previous = previousStepsRef.current;
    previousStepsRef.current = steps;
    if (previous === steps) return;
    const sameShape =
      previous.length === steps.length && previous.every((s, i) => s.id === steps[i].id);
    if (sameShape) return;
    setMachine((current) =>
      current.status === "running" ? reanchorIndex(current, previous, steps) : current
    );
  }, [steps]);

  const dispatch = useCallback(
    (action: TourAction) => {
      // The updater is the pure reducer — no other setter is called from inside it.
      setMachine((current) => tourReducer(current, action, steps));
    },
    [steps]
  );

  const step = machineCurrentStep(machine, steps) as FirstLightStep | null;
  const total = steps.length;
  const overlayVisible = machine.status === "running" && step !== null;

  // ── Persist status + position ───────────────────────────────────────────────────
  // Writes only when something meaningful changed, and only after hydration, so the default
  // document can never overwrite a real one during boot.
  const persistedRef = useRef<string>("");
  useEffect(() => {
    if (!hydrated) return;
    const signature = `${document.status}|${document.currentStep ?? ""}|${document.contextualTipsSeen.join(",")}`;
    if (signature === persistedRef.current) return;
    persistedRef.current = signature;
    void saveFirstLightState(document);
  }, [hydrated, document]);

  // Keep the persisted "where was I" pointer in step with the live machine, so an interrupted
  // tour resumes on the step the user was actually looking at.
  useEffect(() => {
    if (!hydrated || machine.status !== "running" || !step) return;
    setDocument((current) =>
      current.currentStep === step.id ? current : markStep(current, step.id, nowISO())
    );
  }, [hydrated, machine.status, step?.id]);

  const reportCapabilities = useCallback((next: Partial<FirstLightCapabilities>) => {
    setCapabilities((current) => {
      const merged = { ...current, ...next };
      const unchanged = (Object.keys(merged) as (keyof FirstLightCapabilities)[]).every(
        (key) => merged[key] === current[key]
      );
      return unchanged ? current : merged;
    });
  }, []);

  const beginTour = useCallback(() => {
    setOfferAnswered(true);
    dispatch({ type: "start" });
    setDocument((current) => markStarted(current, "welcome", nowISO()));
    trackTutorialEvent("first_light_started");
  }, [dispatch]);

  const declineOffer = useCallback(() => {
    setOfferAnswered(true);
    setDocument((current) => markSkipped(current, nowISO()));
    trackTutorialEvent("first_light_skipped", { reason: "offer_declined" });
  }, []);

  const next = useCallback(() => {
    if (step) trackTutorialEvent("first_light_step_completed", { stepId: step.id });
    const wasLast = step?.id === steps[steps.length - 1]?.id;
    dispatch({ type: "next" });
    if (wasLast) {
      setDocument((current) => markCompleted(current, nowISO()));
      trackTutorialEvent("first_light_completed");
    }
  }, [dispatch, step, steps]);

  const back = useCallback(() => dispatch({ type: "back" }), [dispatch]);

  const skip = useCallback(() => {
    dispatch({ type: "skip" });
    setDocument((current) => markSkipped(current, nowISO()));
    trackTutorialEvent("first_light_skipped", { stepId: step?.id ?? "unknown" });
  }, [dispatch, step]);

  const satisfy = useCallback(
    (stepId: FirstLightStepId) => {
      dispatch({ type: "satisfy", stepId });
    },
    [dispatch]
  );

  const finish = useCallback(() => {
    dispatch({ type: "complete" });
    setDocument((current) => markCompleted(current, nowISO()));
    trackTutorialEvent("first_light_completed");
  }, [dispatch]);

  const replay = useCallback(() => {
    setOfferAnswered(true);
    dispatch({ type: "restart" });
    setDocument((current) => resetForReplay(current, nowISO()));
    trackTutorialEvent("first_light_replayed");
  }, [dispatch]);

  const hasSeenTip = useCallback(
    (tipId: ContextualTipId) => document.contextualTipsSeen.includes(tipId),
    [document.contextualTipsSeen]
  );

  const recordTipSeen = useCallback((tipId: ContextualTipId) => {
    setDocument((current) => markTipSeenPure(current, tipId, nowISO()));
    trackTutorialEvent("contextual_tip_seen", { tipId });
  }, []);

  const recordTipDismissed = useCallback((tipId: ContextualTipId) => {
    setDocument((current) => markTipSeenPure(current, tipId, nowISO()));
    trackTutorialEvent("contextual_tip_dismissed", { tipId });
  }, []);

  const saveVariant = useMemo<SaveStepVariant | null>(
    () => steps.find((s) => s.id === "saveDiscovery")?.variant ?? null,
    [steps]
  );

  const offerVisible =
    enabled && hydrated && !offerAnswered && machine.status !== "running" && shouldOfferFirstLight(document);

  const value = useMemo<FirstLightContextValue>(
    () => ({
      hydrated,
      document,
      machine,
      steps,
      step,
      index: machine.index,
      total,
      canContinue: machineCanContinue(machine, steps),
      canGoBack: machineCanGoBack(machine),
      overlayVisible,
      offerVisible,
      saveVariant,
      capabilities,
      reportCapabilities,
      beginTour,
      declineOffer,
      next,
      back,
      skip,
      satisfy,
      finish,
      replay,
      hasSeenTip,
      recordTipSeen,
      recordTipDismissed,
    }),
    [
      hydrated,
      document,
      machine,
      steps,
      step,
      total,
      overlayVisible,
      offerVisible,
      saveVariant,
      capabilities,
      reportCapabilities,
      beginTour,
      declineOffer,
      next,
      back,
      skip,
      satisfy,
      finish,
      replay,
      hasSeenTip,
      recordTipSeen,
      recordTipDismissed,
    ]
  );

  return <FirstLightContext.Provider value={value}>{children}</FirstLightContext.Provider>;
}

/**
 * Read First Light. Returns null when no provider is mounted, so a Sky Lens rendered outside
 * the app shell (tests, previews) simply has no tour rather than throwing.
 */
export function useFirstLight(): FirstLightContextValue | null {
  return useContext(FirstLightContext) ?? null;
}
