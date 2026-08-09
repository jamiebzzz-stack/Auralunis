// Contextual-tip state — all that remains of First Light.
//
// WHAT HAPPENED HERE
//
// This file used to own a guided tour: a step machine, a capability-driven mission, an offer
// modal, pause/resume, and per-step satisfaction. That tour was the SECOND tutorial a fresh
// install met — the onboarding slides ran first, and the First Light offer appeared the moment
// they closed. There is now exactly one app tour (three informational screens, in
// features/onboarding/OnboardingFlow), so the whole tour surface here is gone.
//
// What is NOT gone is contextual tips: the small, one-shot hints Sky Lens shows in context
// (ContextualTipHost). They are a separate feature, they were never part of the tour, and they
// keep their persistence here — one namespaced storage key (owned solely by
// firstLightStorage), reusing the retired tour's
// document shape so existing installs migrate rather than losing which tips they have seen.
//
// Invariants, unchanged:
//   • Nothing here writes to onboarding, entitlement, settings, Vault, or RevenueCat state.
//   • No setter is called from inside another setter's updater, so React (including StrictMode)
//     may run any updater twice with the same result.
//   • Every async effect carries a cancellation flag.

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
  markTipSeen as markTipSeenPure,
  type FirstLightState,
} from "./firstLightState";
import { loadFirstLightState, saveFirstLightState } from "./firstLightStorage";
import type { ContextualTipId } from "./contextualTips";

type FirstLightContextValue = {
  hydrated: boolean;
  /** The persisted document. Only `contextualTipsSeen` is written now. */
  document: FirstLightState;
  /**
   * Always false. Kept so ContextualTipHost's "stand down while a tour screen is showing" rule
   * reads exactly as it always did — there is simply never a tour screen any more.
   */
  overlayVisible: boolean;
  /** Always false, for the same reason. */
  offerVisible: boolean;

  hasSeenTip: (tipId: ContextualTipId) => boolean;
  recordTipSeen: (tipId: ContextualTipId) => void;
  recordTipDismissed: (tipId: ContextualTipId) => void;
};

const FirstLightContext = createContext<FirstLightContextValue | undefined>(undefined);

const nowISO = () => new Date().toISOString();

export function FirstLightProvider({
  children,
  /** Retained for call-site compatibility; tips are host-gated, so this is not consulted. */
  enabled: _enabled = true,
}: {
  children: ReactNode;
  enabled?: boolean;
}) {
  const [hydrated, setHydrated] = useState(false);
  const [document, setDocument] = useState<FirstLightState>(DEFAULT_FIRST_LIGHT_STATE);

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

  // ── Persist ─────────────────────────────────────────────────────────────────────
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

  const value = useMemo<FirstLightContextValue>(
    () => ({
      hydrated,
      document,
      overlayVisible: false,
      offerVisible: false,
      hasSeenTip,
      recordTipSeen,
      recordTipDismissed,
    }),
    [hydrated, document, hasSeenTip, recordTipSeen, recordTipDismissed]
  );

  return <FirstLightContext.Provider value={value}>{children}</FirstLightContext.Provider>;
}

/**
 * Read the tip state. Returns null when no provider is mounted, so a Sky Lens rendered outside
 * the app shell (tests, previews) simply has no tips rather than throwing.
 */
export function useFirstLight(): FirstLightContextValue | null {
  return useContext(FirstLightContext) ?? null;
}
