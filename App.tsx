import React, { useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { GestureHandlerRootView as RNGestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

// react-native-gesture-handler's published types omit `children` on this
// component in some versions; it accepts them at runtime. Typed locally to match.
const GestureHandlerRootView = RNGestureHandlerRootView as unknown as React.ComponentType<{
  style?: object;
  children?: React.ReactNode;
}>;
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { RootTabs, type RootTabParamList } from "@/navigation/RootTabs";
import { TourTargetProvider } from "@/features/tour/TourTargetRegistry";
import { FirstLightProvider } from "@/features/first-light/FirstLightContext";
import { useEntitlement } from "@/hooks/useEntitlement";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ThreeTierPaywallModal } from "@/features/paywall/ThreeTierPaywallModal";
import { AuraLunisSettingsProvider } from "@/state/AuraLunisSettingsContext";
import { AuraLunisVaultProvider } from "@/state/AuraLunisVaultContext";
import { OnboardingFlow } from "@/features/onboarding/OnboardingFlow";
import { BirthChartPrompt } from "@/features/onboarding/BirthChartPrompt";
import {
  BIRTH_CHART_PROMPT_KEY,
  shouldShowBirthChartPrompt,
} from "@/features/onboarding/birthChartPromptRules";
import { LogoMark } from "@/components/LogoMark";
import { OnboardingProvider, useOnboarding } from "@/context/OnboardingContext";
import {
  EXISTING_USER_DATA_KEYS,
  hasExistingUserData,
  resolveLaunchRoute,
  shouldPersistMigration,
  type LaunchRoute,
} from "@/features/onboarding/onboardingRoute";
import {
  configureRevenueCat,
  purchaseAuraLunisPackage,
  restoreAuraLunisPurchases
} from "@/services/RevenueCatService";
import { plans } from "@/features/paywall/MonetizationCatalog";
import { configureNotificationHandler } from "@/services/NotificationService";
import { trackPaywallEvent } from "@/services/AnalyticsService";
import { useAuraLunisFonts } from "@/theme/useFonts";
import { PaywallNavigationProvider, usePaywallNavigation } from "@/context/PaywallNavigationContext";
import { relayPaywallRequest } from "@/context/paywallRelay";
import { EntitlementProvider, refreshEntitlement } from "@/context/EntitlementContext";
import { recordSession } from "@/services/ReviewPromptService";

const ONBOARDING_SEEN_KEY = "auralunis.onboarding.seen";

// Navigation handle for the First Light offer, which is rendered OUTSIDE the navigator (it is
// a sibling of NavigationContainer, like the paywall and onboarding modals) and therefore has
// no useNavigation() of its own. Used for exactly one thing: switching to the Sky tab when the
// user starts the tour. Guarded by isReady(), so it is inert before the tree mounts.
const navigationRef = createNavigationContainerRef<RootTabParamList>();

/**
 * Switch to the Sky tab, waiting for the navigator if it has not mounted yet.
 *
 * A silent no-op here meant that a user who tapped "Begin First Light" during a cold start
 * stayed on Home while the Welcome card appeared over the wrong tab. The retry is bounded, so a
 * navigator that never becomes ready simply gives up instead of looping.
 */
const NAV_READY_RETRY_MS = 50;
const NAV_READY_MAX_ATTEMPTS = 40; // ~2s

function goToSkyTab(attempt = 0) {
  if (navigationRef.isReady()) {
    navigationRef.navigate("Sky");
    return;
  }
  if (attempt >= NAV_READY_MAX_ATTEMPTS) return;
  setTimeout(() => goToSkyTab(attempt + 1), NAV_READY_RETRY_MS);
}

// Bridges the global PaywallNavigationContext to App.tsx's local paywallVisible state.
// Mounted inside PaywallNavigationProvider so it can read the context.
function PaywallBridge({ onOpen }: { onOpen: () => void }) {
  const { isPaywallVisible, closePaywall } = usePaywallNavigation();
  React.useEffect(() => {
    // Treat isPaywallVisible as a one-shot open REQUEST: open the modal, then immediately clear
    // the request so a later openPaywall() from any caller re-fires (previously the flag stuck at
    // true and only the first open per session worked). The `if (openModal)` guard means the
    // clear (true→false) never re-opens. App's local `paywallVisible` remains the visibility source.
    const { openModal, clearRequest } = relayPaywallRequest(isPaywallVisible);
    if (openModal) onOpen();
    if (clearRequest) closePaywall();
  }, [isPaywallVisible]);
  return null;
}

// Bridges Settings → "Replay Tutorial" (OnboardingContext.replayNonce) to App's route state.
// The initial mount is ignored; every later bump re-shows onboarding WITHOUT resetting the
// persisted completion flag — a replay is never treated as a new install.
function OnboardingBridge({ onReplay }: { onReplay: () => void }) {
  const { replayNonce } = useOnboarding();
  const first = useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    onReplay();
  }, [replayNonce]);
  return null;
}

// Opaque boot cover shown while the persisted onboarding signals resolve, so the Birth Chart
// / Home tab can never flash before the onboarding-vs-app decision is made.
function BootSplash() {
  return (
    <View style={styles.bootSplash}>
      <LogoMark size={96} />
    </View>
  );
}

export default function App() {
  // "loading" until the persisted flag + existing-user migration condition are resolved.
  const [route, setRoute] = useState<LaunchRoute>("loading");
  const [paywallVisible, setPaywallVisible] = useState(false);
  // Captured AT BOOT. The birth-chart prompt uses this so it can never appear on the same
  // launch the tour was completed on — which would just recreate back-to-back prompts.
  const [onboardingCompleteAtBoot, setOnboardingCompleteAtBoot] = useState(false);
  const [birthChartPromptAnswered, setBirthChartPromptAnswered] = useState(true);
  const [hasBirthData, setHasBirthData] = useState(true);

  useEffect(() => {
    let active = true;

    async function initialize() {
      configureNotificationHandler();
      void recordSession();

      void configureRevenueCat().catch(() => {
        // Keep the free Horizon experience usable if purchase setup is unavailable.
      });

      // Read the onboarding flag AND any durable prior-use data in one pass, then resolve the
      // launch route with the pure resolver. On any storage failure, fail toward showing
      // onboarding (treat as a fresh install) rather than skipping it silently.
      let signals = { onboardingComplete: false, hasExistingUserData: false };
      try {
        const keys = [ONBOARDING_SEEN_KEY, BIRTH_CHART_PROMPT_KEY, ...EXISTING_USER_DATA_KEYS];
        const entries = await AsyncStorage.multiGet(keys);
        const store: Record<string, string | null> = {};
        for (const [key, value] of entries) store[key] = value;
        signals = {
          onboardingComplete: Boolean(store[ONBOARDING_SEEN_KEY]),
          hasExistingUserData: hasExistingUserData(store),
        };
        if (active) {
          setOnboardingCompleteAtBoot(signals.onboardingComplete);
          setBirthChartPromptAnswered(Boolean(store[BIRTH_CHART_PROMPT_KEY]));
          setHasBirthData(hasExistingUserData(store));
        }
      } catch {
        // Fail toward NOT prompting: the defaults above already say "answered".
        // Leave signals at the fail-open default (new install → onboarding).
      }

      if (!active) return;

      // Migrate existing Build 5 users (saved data, no flag) so they aren't forced through
      // onboarding again — persist the flag once, without touching their birth data.
      if (shouldPersistMigration(signals)) void markOnboardingSeen();

      setRoute(resolveLaunchRoute(signals));
    }

    initialize();

    return () => {
      active = false;
    };
  }, []);

  async function markOnboardingSeen() {
    try {
      await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, "true");
    } catch {
      // Keep the experience usable if storage is unavailable.
    }
  }

  // Completing OR skipping onboarding (first run or replay) persists the flag and enters the
  // app. Replay is safe here too: the flag is simply re-affirmed, never cleared.
  function handleOnboardingDone() {
    void markOnboardingSeen();
    setRoute("app");
  }

  // Settings → "Replay App Tour": re-show the three-screen tour over the running app. It never
  // clears the onboarding flag, birth data, Vault data, entitlement, or the birth-chart answer —
  // handleOnboardingDone simply re-affirms the flag when the tour closes.
  function handleReplayTutorial() {
    setRoute("onboarding");
  }

  const birthChartPromptVisible = shouldShowBirthChartPrompt({
    appReady: route === "app",
    onboardingCompleteAtBoot,
    promptAnswered: birthChartPromptAnswered,
    hasBirthData,
  });

  // BOTH answers are remembered. "Maybe Later" is as final as "Create Chart": nobody is asked
  // twice, and neither answer touches birth data, Vault data, or entitlement.
  function answerBirthChartPrompt() {
    setBirthChartPromptAnswered(true);
    void AsyncStorage.setItem(BIRTH_CHART_PROMPT_KEY, "true").catch(() => {});
  }

  // Also callable from Settings → Manage Membership
  function openPaywall() {
    setPaywallVisible(true);
  }

  async function handleContinueFree() {
    setPaywallVisible(false);
  }

  async function handlePurchase(planId: string) {
    try {
      // Package-based purchase so EVERY plan (incl. lifetime) buys the right product.
      const plan = plans.find((p) => p.id === planId);
      const result = await purchaseAuraLunisPackage(plan?.revenueCatPackageId ?? planId, plan?.productId);

      if (result.status === "purchased") {
        trackPaywallEvent("purchase_complete", { planId });
        await refreshEntitlement(); // flip the whole app to premium immediately
        setPaywallVisible(false);
        Alert.alert("AuraLunis Lifetime Unlocked", "Premium access is active on this Apple ID.");
        return;
      }

      if (result.status === "cancelled") {
        trackPaywallEvent("purchase_cancelled", { planId });
        return;
      }

      if (result.status === "not_configured" || result.status === "not_available") {
        // RevenueCat / StoreKit is temporarily unavailable. Never describe Lifetime as a subscription.
        Alert.alert(
          "Purchase unavailable",
          "AuraLunis Lifetime could not be loaded from the App Store right now. Please try again in a moment."
        );
        return;
      }
    } catch {
      Alert.alert(
        "Purchase could not be completed",
        "Your purchase didn't go through. Please check your internet connection and try again. If you were charged, tap Restore Purchases to unlock Premium."
      );
    }
  }

  async function handleRestorePurchases() {
    try {
      const result = await restoreAuraLunisPurchases();

      if (result.status === "not_configured") {
        Alert.alert(
          "Restore unavailable",
          "AuraLunis could not connect to App Store purchase services right now. Please try again in a moment."
        );
        return;
      }
      if (result.status === "error") {
        Alert.alert(
          "Restore could not be completed",
          "We couldn't reach the App Store to restore your purchases. Please check your connection and try again."
        );
        return;
      }

      await refreshEntitlement(); // reflect any restored entitlement app-wide
      // Success message ONLY when the active AuraLunis Premium entitlement is present — a
      // completed restore that granted nothing must tell the truth, not claim success.
      Alert.alert(
        "Restore Purchases",
        result.entitled
          ? "Your AuraLunis Premium access has been restored."
          : "No active AuraLunis purchase was found on this Apple ID."
      );
    } catch {
      Alert.alert(
        "Restore could not be completed",
        "We couldn't reach the App Store to restore your purchases. Please check your connection and try again."
      );
    }
  }

  // Sovereign tier removed — killed feature (Desk Obelisk, Stellar Portal, etc.)

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
      <ErrorBoundary>
      <EntitlementProvider>
      <PaywallNavigationProvider>
      <OnboardingProvider>
        <AuraLunisSettingsProvider>
          <AuraLunisVaultProvider>
          {/* TourTargetProvider holds a registry of measured control positions (reusable
              infrastructure, unused by the app tour). FirstLightProvider now owns only the
              contextual-tip state and its one namespaced storage key. Neither touches
              onboarding, entitlement, or Vault state. */}
          <TourTargetProvider>
          <FirstLightProvider enabled={route === "app"}>
            <NavigationContainer ref={navigationRef}>
              <RootTabs />
            </NavigationContainer>
            <PaywallBridge onOpen={() => setPaywallVisible(true)} />
            <OnboardingBridge onReplay={handleReplayTutorial} />

            <ThreeTierPaywallModal
              visible={paywallVisible}
              onClose={() => setPaywallVisible(false)}
              onPurchase={handlePurchase}
              onRestore={handleRestorePurchases}
            />

            <OnboardingFlow
              visible={route === "onboarding"}
              onDone={handleOnboardingDone}
            />

            {/* Birth-chart setup: separate, optional, and never on the same launch as the
                tour. See birthChartPrompt.ts for the rule. */}
            <BirthChartPrompt
              visible={birthChartPromptVisible}
              onAnswer={answerBirthChartPrompt}
              onCreate={() => goToSkyTab()}
            />

            {/* Opaque boot cover — keeps the Home/Birth Chart tab from flashing before the
                onboarding-vs-app decision resolves. Rendered last so it sits on top. */}
            {route === "loading" && <BootSplash />}
          </FirstLightProvider>
          </TourTargetProvider>
          </AuraLunisVaultProvider>
        </AuraLunisSettingsProvider>
      </OnboardingProvider>
      </PaywallNavigationProvider>
      </EntitlementProvider>
      </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  bootSplash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#040611",
    alignItems: "center",
    justifyContent: "center",
  },
});
