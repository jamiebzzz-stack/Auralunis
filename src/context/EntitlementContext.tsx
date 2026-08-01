// EntitlementContext.tsx
// Single shared source of truth for premium status. One provider holds the state;
// every screen reads the SAME isPremium via useEntitlement(), so a purchase/restore
// updates the whole app at once (previously each useEntitlement() call had its own
// state and only refreshed on app-foreground). Fails CLOSED to `false` everywhere.

import React, { createContext, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { RevenueCatIds } from "@/features/paywall/MonetizationCatalog";
import { classifyAuraLunisMembership, type MembershipKind } from "@/features/paywall/entitlementStatus";
import { configureRevenueCat } from "@/services/RevenueCatService";

let Purchases: {
  getCustomerInfo: () => Promise<{ entitlements: { active: Record<string, unknown> }; activeSubscriptions?: string[] }>;
} | null = null;

try {
  Purchases = require("react-native-purchases").default;
} catch {
  // not available in Expo Go
}

async function fetchMembership(): Promise<{ isPremium: boolean; kind: MembershipKind }> {
  // THERE IS NO BYPASS. Premium is granted by exactly one thing: an active entitlement
  // returned by RevenueCat. A dev flag (ALLOW_DEV_PREMIUM) and a build-time env override
  // (EXPO_PUBLIC_FORCE_PREMIUM, set by the EAS "preview" profile) used to short-circuit
  // to premium here. Both were dead-code-eliminated from the App Store bundle, so no
  // shipped build was ever unlocked — but their correctness depended entirely on which
  // EAS profile produced the submission, and one wrong profile would have shipped the
  // app fully unlocked. That is not a risk worth carrying for a testing convenience.
  //
  // To exercise gated UI without a purchase, use a StoreKit sandbox account. To exercise
  // the paywall, use one without an entitlement. Both paths test what actually ships.
  if (!Purchases) return { isPremium: false, kind: "none" }; // RevenueCat unavailable (e.g. Expo Go) — fail CLOSED

  try {
    // The provider's first effect may run before App.tsx's initialization effect. Make
    // this function independently safe: never query CustomerInfo until the native SDK
    // has completed its idempotent configuration.
    const configuration = await configureRevenueCat();
    if (configuration.status !== "configured") return { isPremium: false, kind: "none" };

    const info = await Purchases.getCustomerInfo();
    const isPremium = Boolean(info.entitlements.active[RevenueCatIds.entitlement]);
    return { isPremium, kind: classifyAuraLunisMembership(info) };
  } catch {
    return { isPremium: false, kind: "none" }; // RC unavailable/errored — fail CLOSED in production
  }
}

export interface EntitlementValue {
  isPremium: boolean;
  /** "none" | "subscription" | "lifetime" — derived from the store's CustomerInfo. */
  membershipKind: MembershipKind;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export const EntitlementContext = createContext<EntitlementValue | null>(null);

// Module-level handle so non-React / out-of-provider code (e.g. the purchase flow in
// App.tsx, which renders the provider and so sits above it) can force a global
// re-check after a successful purchase or restore.
let externalRefresh: (() => Promise<void>) | null = null;
export async function refreshEntitlement(): Promise<void> {
  await externalRefresh?.();
}

export function EntitlementProvider({ children }: { children: ReactNode }) {
  const [isPremium, setIsPremium] = useState(false);
  const [membershipKind, setMembershipKind] = useState<MembershipKind>("none");
  const [isLoading, setIsLoading] = useState(true);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const { isPremium: premium, kind } = await fetchMembership();
    if (!mountedRef.current) return; // guard: don't setState after unmount
    setIsPremium(premium);
    setMembershipKind(kind);
    setIsLoading(false);
  }, []);

  // Expose this provider's refresh to the module-level helper while mounted.
  useEffect(() => {
    externalRefresh = refresh;
    return () => {
      if (externalRefresh === refresh) externalRefresh = null;
    };
  }, [refresh]);

  // Initial check.
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Re-check when the app returns to the foreground (purchase made elsewhere, etc.).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (appStateRef.current.match(/inactive|background/) && next === "active") {
        refresh();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [refresh]);

  return (
    <EntitlementContext.Provider value={{ isPremium, membershipKind, isLoading, refresh }}>
      {children}
    </EntitlementContext.Provider>
  );
}
