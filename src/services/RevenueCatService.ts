import { Linking, LogBox, Platform } from "react-native";
import Constants from "expo-constants";
import { RevenueCatIds } from "@/features/paywall/MonetizationCatalog";
import {
  classifyAuraLunisMembership,
  hasAuraLunisEntitlement,
  type MembershipKind,
} from "@/features/paywall/entitlementStatus";

// Re-exported so existing importers keep working now that the pure entitlement logic
// lives in a node-testable module with no react-native imports.
export { classifyAuraLunisMembership, hasAuraLunisEntitlement };
export type { MembershipKind };

// RevenueCat's SDK logs "Invalid API Key" / offerings errors to the console in Expo Go
// (it can't validate against StoreKit in dev). Even though we already swallow the thrown
// error, that internal console log still surfaces as a red LogBox banner on every screen,
// which ruins dev/testing/screenshots. Hide ONLY those RC messages in dev — every other
// error stays visible, and LogBox doesn't run in production builds at all.
if (__DEV__) {
  LogBox.ignoreLogs([
    /Invalid API Key/i,
    /configuring Purchases/i,
    /fetching offerings/i,
    /RevenueCat/i,
    /Purchases instance/i,
    /native store is not available/i,
    /running inside Expo Go/i,
    /rev\.cat/i,
    /Test Store/i
  ]);
}

// Dynamic require — react-native-purchases is not available in Expo Go
type CustomerInfo = { entitlements: { active: Record<string, unknown> }; activeSubscriptions?: string[]; managementURL?: string | null };
// StoreKit-reported introductory offer (e.g. Apple's "1 week free trial"). This is data
// the STORE owns — the app only reflects it, never fabricates it.
type StoreIntroPrice = {
  priceString: string;
  price: number;
  periodUnit: string; // DAY | WEEK | MONTH | YEAR, as StoreKit reports it
  periodNumberOfUnits: number;
  cycles: number;
};
type PurchasesPackage = {
  product: {
    priceString: string;
    price: number;
    identifier: string;
    subscriptionPeriod?: string | null; // ISO-8601, e.g. "P1M" / "P1Y"
    introPrice?: StoreIntroPrice | null;
  };
  identifier: string;
};

let Purchases: {
  configure: (opts: { apiKey: string }) => void;
  getCustomerInfo: () => Promise<CustomerInfo>;
  getOfferings: () => Promise<{ current: { availablePackages: PurchasesPackage[] } | null }>;
  purchasePackage: (pkg: PurchasesPackage) => Promise<{ customerInfo: CustomerInfo }>;
  restorePurchases: () => Promise<CustomerInfo>;
  // iOS: per-account eligibility for each product's introductory offer.
  checkTrialOrIntroductoryPriceEligibility?: (
    productIdentifiers: string[]
  ) => Promise<Record<string, { status: number; description?: string }>>;
} | null = null;

try {
  Purchases = require("react-native-purchases").default;
} catch {
  // react-native-purchases not available in Expo Go — all purchase functions will gracefully degrade
}

type BillingPeriod = "monthly" | "annual";
type AuraLunisPaidTierId = string;

type ConfigureResult =
  | { status: "configured" }
  | { status: "missing_api_key" }
  | { status: "unsupported_platform" };

let configured = false;

// RevenueCat PUBLIC SDK key for iOS. Public (`appl_`) keys are designed to ship in
// the client binary — they cannot read or mutate account data — so this is safe to
// hardcode, and it keeps the live key out of app.json (which only carries a
// placeholder). A real `extra.revenueCatIosApiKey` in app.json still wins if present,
// so a build can override per-environment without a code change.
const REVENUECAT_IOS_PUBLIC_KEY = "appl_wFLNgxZEHwoGKyJYEMUspGVphen";

function isPlaceholderKey(value?: string) {
  return !value || value.startsWith("REPLACE_WITH_");
}

function getPublicApiKey() {
  const extra = Constants.expoConfig?.extra ?? {};

  if (Platform.OS === "ios") {
    const fromConfig = extra.revenueCatIosApiKey as string | undefined;
    return isPlaceholderKey(fromConfig) ? REVENUECAT_IOS_PUBLIC_KEY : fromConfig;
  }

  if (Platform.OS === "android") {
    return extra.revenueCatAndroidApiKey as string | undefined;
  }

  return undefined;
}

export async function configureRevenueCat(): Promise<ConfigureResult> {
  if (configured) return { status: "configured" };
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    return { status: "unsupported_platform" };
  }

  const apiKey = getPublicApiKey();

  if (isPlaceholderKey(apiKey)) {
    return { status: "missing_api_key" };
  }

  const publicApiKey = apiKey as string;
  if (!Purchases) return { status: "unsupported_platform" };
  try {
    Purchases.configure({ apiKey: publicApiKey });
    configured = true;
    return { status: "configured" };
  } catch {
    // Invalid key / Expo Go where the SDK can't validate against the App Store:
    // never let it throw an unhandled error (that's the red LogBox banner on every
    // screen). Treat as not-configured; the app stays fully usable and gated correctly.
    return { status: "missing_api_key" };
  }
}

export async function getCurrentPackages(): Promise<PurchasesPackage[]> {
  const configuration = await configureRevenueCat();

  if (configuration.status !== "configured") return [];
  if (!Purchases) return [];

  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current?.availablePackages ?? [];
  } catch {
    // No live App Store offering yet (e.g. before launch, or Expo Go) — return empty
    // instead of throwing an unhandled "Invalid API Key / fetching offerings" error.
    return [];
  }
}

// In-flight guards. StoreKit rejects a second purchase while one is still presenting, and a
// double-tapped Restore fires two round-trips whose results can land out of order. Each entry
// point below de-duplicates onto the single in-flight promise, so every caller awaits — and
// resolves with — the same result, preserving the declared return type exactly.
type PurchaseTierResult = {
  status: "purchased" | "cancelled" | "not_configured" | "not_available";
  customerInfo?: CustomerInfo;
  productId?: string;
};
type PurchasePackageResult = {
  status: "purchased" | "cancelled" | "not_configured" | "not_available";
  customerInfo?: CustomerInfo;
};
type RestoreResult = {
  status: "restored" | "not_configured" | "error";
  customerInfo?: CustomerInfo;
  entitled?: boolean;
  membership?: MembershipKind;
};

let _purchaseTierInFlight: Promise<PurchaseTierResult> | null = null;
let _purchasePackageInFlight: Promise<PurchasePackageResult> | null = null;
let _restoreInFlight: Promise<RestoreResult> | null = null;

export function purchaseAuraLunisTier(
  tierId: AuraLunisPaidTierId,
  billingPeriod: BillingPeriod
): Promise<PurchaseTierResult> {
  if (_purchaseTierInFlight) return _purchaseTierInFlight;
  const run = runPurchaseAuraLunisTier(tierId, billingPeriod);
  // Clear the latch whether it resolves or rejects, so a failed attempt can be retried.
  _purchaseTierInFlight = run;
  run.catch(() => {}).then(() => { _purchaseTierInFlight = null; });
  return run;
}

async function runPurchaseAuraLunisTier(
  tierId: AuraLunisPaidTierId,
  billingPeriod: BillingPeriod
): Promise<PurchaseTierResult> {
  const product = { productId: billingPeriod === "annual" ? RevenueCatIds.products.premiumAnnual : RevenueCatIds.products.premiumMonthly, packageId: billingPeriod === "annual" ? RevenueCatIds.packages.premiumAnnual : RevenueCatIds.packages.premiumMonthly };

  const configuration = await configureRevenueCat();

  if (configuration.status !== "configured") {
    return { status: "not_configured", productId: product.productId };
  }
  if (!Purchases) {
    return { status: "not_configured", productId: product.productId };
  }

  const packages = await getCurrentPackages();
  const selectedPackage = packages.find(
    (candidate) =>
      candidate.identifier === product.packageId ||
      candidate.product.identifier === product.productId
  );

  if (!selectedPackage) {
    return { status: "not_available", productId: product.productId };
  }

  try {
    const result = await Purchases.purchasePackage(selectedPackage);
    return {
      status: "purchased",
      customerInfo: result.customerInfo,
      productId: product.productId
    };
  } catch (error) {
    const candidate = error as { userCancelled?: boolean };

    if (candidate.userCancelled) {
      return { status: "cancelled", productId: product.productId };
    }

    throw error;
  }
}

// Generic package purchase — correctly handles ALL plans including lifetime. The
// tier-based helper above only mapped annual/monthly, so a lifetime selection would
// mis-purchase the monthly product. Match the RevenueCat package by its identifier
// or the underlying product identifier.
export function purchaseAuraLunisPackage(
  packageId: string,
  productId?: string
): Promise<PurchasePackageResult> {
  if (_purchasePackageInFlight) return _purchasePackageInFlight;
  const run = runPurchaseAuraLunisPackage(packageId, productId);
  _purchasePackageInFlight = run;
  run.catch(() => {}).then(() => { _purchasePackageInFlight = null; });
  return run;
}

async function runPurchaseAuraLunisPackage(
  packageId: string,
  productId?: string
): Promise<PurchasePackageResult> {
  const configuration = await configureRevenueCat();
  if (configuration.status !== "configured" || !Purchases) return { status: "not_configured" };

  const packages = await getCurrentPackages();
  const pkg = packages.find(
    (candidate) => candidate.identifier === packageId || (productId !== undefined && candidate.product.identifier === productId)
  );
  if (!pkg) return { status: "not_available" };

  try {
    const result = await Purchases.purchasePackage(pkg);
    return { status: "purchased", customerInfo: result.customerInfo };
  } catch (error) {
    const candidate = error as { userCancelled?: boolean };
    if (candidate.userCancelled) return { status: "cancelled" };
    throw error;
  }
}

export function restoreAuraLunisPurchases(): Promise<RestoreResult> {
  if (_restoreInFlight) return _restoreInFlight;
  const run = runRestoreAuraLunisPurchases();
  _restoreInFlight = run;
  run.catch(() => {}).then(() => { _restoreInFlight = null; });
  return run;
}

async function runRestoreAuraLunisPurchases(): Promise<RestoreResult> {
  const configuration = await configureRevenueCat();

  if (configuration.status !== "configured") {
    return { status: "not_configured" };
  }
  if (!Purchases) return { status: "not_configured" };

  try {
    const customerInfo = await Purchases.restorePurchases();
    // Report whether the restore actually granted the entitlement — callers MUST gate the
    // success message on `entitled`, not the bare "restored" status (which only means the
    // call completed). `membership` separates an active subscription from lifetime.
    const entitled = hasAuraLunisEntitlement(customerInfo, RevenueCatIds.entitlement);
    const membership = classifyAuraLunisMembership(customerInfo);
    return { status: "restored", customerInfo, entitled, membership };
  } catch {
    // A genuine StoreKit / RevenueCat / network failure. This is NOT "not configured" —
    // callers must show a distinct failure message, never "available after launch".
    return { status: "error" };
  }
}

export async function openAuraLunisSubscriptionManagement(): Promise<{
  status: "opened" | "missing_url" | "not_configured";
}> {
  const configuration = await configureRevenueCat();

  if (configuration.status !== "configured") {
    return { status: "not_configured" };
  }
  if (!Purchases) return { status: "not_configured" };

  try {
    const customerInfo = await Purchases.getCustomerInfo();
    const managementURL = customerInfo.managementURL;

    if (!managementURL) return { status: "missing_url" };

    await Linking.openURL(managementURL);
    return { status: "opened" };
  } catch {
    // RC error or Linking.openURL rejection — fail gracefully instead of throwing.
    return { status: "not_configured" };
  }
}

// ── Introductory offer (7-day free trial) support ──────────────────────────────
// Apple owns the actual trial: it is configured as an INTRODUCTORY OFFER on the monthly
// and annual products in App Store Connect. StoreKit (via RevenueCat) reports both the
// offer details (introPrice) and per-account eligibility. The app NEVER creates a trial,
// timer, or local entitlement — it only mirrors what the store returns. No offer, or an
// ineligible account, means the app shows normal pricing and a plain "Continue".

export type IntroOfferEligibility = "eligible" | "ineligible" | "unknown" | "no_offer";

export type IntroOfferInfo = {
  priceString: string; // localized, typically "Free" / "$0.00" for a free trial
  price: number; // 0 for a free trial
  periodUnit: string; // DAY | WEEK | MONTH | YEAR
  periodNumberOfUnits: number;
  cycles: number;
};

export type LivePackage = {
  packageId: string;
  productId: string;
  priceString: string; // localized recurring price, e.g. "$9.99"
  price: number;
  subscriptionPeriod: string | null; // ISO-8601, e.g. "P1M" / "P1Y"
  introOffer: IntroOfferInfo | null;
};

// RevenueCat's INTRO_ELIGIBILITY_STATUS enum has stable, documented numeric values:
//   0 UNKNOWN · 1 INELIGIBLE · 2 ELIGIBLE · 3 NO_INTRO_OFFER_EXISTS
// Mapped by number so we don't statically import the SDK enum — react-native-purchases is
// dynamically required so the app survives Expo Go (where the native module is absent).
function mapEligibilityStatus(status: number): IntroOfferEligibility {
  switch (status) {
    case 2:
      return "eligible";
    case 1:
      return "ineligible";
    case 3:
      return "no_offer";
    default:
      return "unknown";
  }
}

// Live packages with localized prices and any StoreKit-reported intro offer. Returns []
// when RevenueCat isn't configured / no offering exists (pre-launch, Expo Go) — callers
// then fall back to the catalog's static prices. Localized store prices are the source of
// truth whenever they're available.
export async function getLivePackages(): Promise<LivePackage[]> {
  const packages = await getCurrentPackages();
  return packages.map((p) => ({
    packageId: p.identifier,
    productId: p.product.identifier,
    priceString: p.product.priceString,
    price: p.product.price,
    subscriptionPeriod: p.product.subscriptionPeriod ?? null,
    introOffer: p.product.introPrice
      ? {
          priceString: p.product.introPrice.priceString,
          price: p.product.introPrice.price,
          periodUnit: p.product.introPrice.periodUnit,
          periodNumberOfUnits: p.product.introPrice.periodNumberOfUnits,
          cycles: p.product.introPrice.cycles,
        }
      : null,
  }));
}

// Per-product introductory-offer eligibility. Returns {} when RevenueCat isn't configured
// or the lookup fails — a failed eligibility lookup must NEVER block purchasing, so callers
// treat a missing entry as "no trial promise, normal pricing".
export async function getIntroOfferEligibility(
  productIds: string[]
): Promise<Record<string, IntroOfferEligibility>> {
  const configuration = await configureRevenueCat();
  if (configuration.status !== "configured" || !Purchases) return {};

  const check = Purchases.checkTrialOrIntroductoryPriceEligibility;
  if (typeof check !== "function") return {}; // older/native-less SDK surface

  try {
    const raw = await check.call(Purchases, productIds);
    const out: Record<string, IntroOfferEligibility> = {};
    for (const id of productIds) {
      const status = raw?.[id]?.status;
      out[id] = typeof status === "number" ? mapEligibilityStatus(status) : "unknown";
    }
    return out;
  } catch {
    // Network / StoreKit error — degrade to normal pricing, never throw or block purchase.
    return {};
  }
}

// hasAuraLunisEntitlement + classifyAuraLunisMembership now live in
// @/features/paywall/entitlementStatus (pure, node-testable) and are re-exported at the
// top of this file.
