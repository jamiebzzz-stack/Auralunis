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

// Local-testing override: unlock premium when RevenueCat isn't available (e.g. Expo
// Go) so the gated UI is testable WITHOUT a real purchase. Double-guarded — it is
// only ever true when BOTH this flag is on AND the build is a dev build (`__DEV__` is
// compiled to false in release), so it can never ship the App Store app unlocked.
// SHIP CHECK: This is safe — __DEV__ compiles to `false` in release builds.
// The App Store binary will NEVER have premium unlocked via this flag.
const ALLOW_DEV_PREMIUM = true;
const devPremium = (): boolean => __DEV__ && ALLOW_DEV_PREMIUM;

// TEMPORARY preview override. The EAS "preview" build profile sets
// EXPO_PUBLIC_FORCE_PREMIUM=1 (see eas.json) so an internal/standalone preview build
// shows the premium sky WITHOUT a sandbox purchase. The "production" profile does NOT
// set this env, so the App Store build's bundle has it undefined → stays correctly
// gated. EXPO_PUBLIC_* is inlined at build time. Remove this const + the eas.json env
// when the preview demo is no longer needed.
const FORCE_PREMIUM = process.env.EXPO_PUBLIC_FORCE_PREMIUM === "1";

async function fetchMembership(): Promise<{ isPremium: boolean; kind: MembershipKind }> {
  // DEV BYPASS: in a dev build, unlock premium unconditionally so every gated feature
  // is visible/testable on device without a purchase. Short-circuits BEFORE RevenueCat
  // — previously the bypass only fired when RC was unavailable/errored, so on a working
  // dev build getCustomerInfo() succeeded, returned false, and the app stayed locked.
  // Double-guarded (__DEV__ compiles to false in release), so it can never ship the
  // App Store app unlocked. Flip ALLOW_DEV_PREMIUM to false to exercise the paywall.
  if (devPremium() || FORCE_PREMIUM) return { isPremium: true, kind: "subscription" }; // dev/preview demo shows the full subscriber UI
  if (!Purchases) return { isPremium: false, kind: "none" }; // RevenueCat unavailable in a release build

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
