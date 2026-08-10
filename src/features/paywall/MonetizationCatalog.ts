// MonetizationCatalog.ts
// AuraLunis monetization source of truth.
//
// NEW CUSTOMERS: the active RevenueCat offering and in-app paywall offer Lifetime only.
// LEGACY CUSTOMERS: Monthly and Annual product/package identifiers remain here so existing
// subscribers can keep their AuraLunis Premium entitlement, restore purchases, and manage
// their subscriptions. Keeping legacy IDs in the catalog does NOT make them purchasable in
// the current offering.
//
// StoreKit/RevenueCat localized pricing is the runtime source of truth. The displayPrice values
// below are safe fallbacks for loading/offline states and therefore must match App Store Connect.
// Lifetime is a one-time purchase and never carries trial or recurring-billing language.
//
// NOTE: the lifetime App Store / RevenueCat *product id* is
// `com.ocoeestudios.auralunis.lifetime`. Its RevenueCat *package* identifier is the
// dashboard default `$rc_lifetime` — that's what the offering uses, so the code must
// match it exactly or the lifetime package won't resolve. User-facing copy is "Lifetime".

export const RevenueCatIds = {
  products: {
    premiumMonthly:    "com.ocoeestudios.auralunis.premium.monthly",
    premiumAnnual:     "com.ocoeestudios.auralunis.premium.annual",
    lifetime:          "com.ocoeestudios.auralunis.lifetime",
  },
  packages: {
    premiumMonthly:    "premium_monthly",
    premiumAnnual:     "premium_annual",
    lifetime:          "$rc_lifetime",
  },
  // All three products unlock this single entitlement. This MUST match the
  // entitlement IDENTIFIER in the RevenueCat dashboard EXACTLY — it is literally
  // "AuraLunis Premium" (with the space and capitals), not a snake_case slug. A
  // mismatch means purchases succeed but never unlock premium, so do not "tidy"
  // this into auralunis_premium.
  entitlement: "AuraLunis Premium",
} as const;

export interface PlanOption {
  id: string;
  productId: string;
  name: string;
  interval: "monthly" | "annual" | "lifetime";
  /** Primary fallback price display — live StoreKit/RevenueCat localized price wins at runtime. */
  displayPrice: string;
  /** Secondary line — monthly equivalent or subtitle */
  subtitle: string;
  revenueCatPackageId: string;
  badge?: string;
  /** Effective monthly price for an annual plan — legacy metadata only. */
  effectiveMonthly?: string;
}

// Monthly and Annual entries are intentionally retained for legacy entitlement recognition,
// restore, and subscription-management flows. The new-customer paywall selects only `lifetime`.
export const plans: PlanOption[] = [
  {
    id: "premium_annual",
    productId: RevenueCatIds.products.premiumAnnual,
    name: "AuraLunis Premium",
    interval: "annual",
    displayPrice: "$49.99/year",
    subtitle: "$4.17/month, billed annually",
    revenueCatPackageId: RevenueCatIds.packages.premiumAnnual,
    badge: "Most Popular",
    effectiveMonthly: "$4.17/mo",
  },
  {
    id: "premium_monthly",
    productId: RevenueCatIds.products.premiumMonthly,
    name: "AuraLunis Premium",
    interval: "monthly",
    displayPrice: "$9.99/month",
    subtitle: "Billed monthly · Cancel anytime",
    revenueCatPackageId: RevenueCatIds.packages.premiumMonthly,
  },
  {
    id: "lifetime",
    productId: RevenueCatIds.products.lifetime,
    name: "Lifetime",
    interval: "lifetime",
    displayPrice: "$29.99",
    subtitle: "Pay once. Own the sky forever.",
    revenueCatPackageId: RevenueCatIds.packages.lifetime,
    badge: "Best value",
  },
];

// ─── Feature gates ────────────────────────────────────────────────────────────

/** Tracking modes accessible on the free tier */
export const FREE_TRACKING_MODES = ["fleet", "deep-space", "golden", "meteor"] as const;

/** Tracking modes that require the "AuraLunis Premium" entitlement */
export const PREMIUM_TRACKING_MODES = ["train", "debris", "reentry", "chain", "static"] as const;

export type FreeTrackingMode    = typeof FREE_TRACKING_MODES[number];
export type PremiumTrackingMode = typeof PREMIUM_TRACKING_MODES[number];
export type TrackingMode        = FreeTrackingMode | PremiumTrackingMode;

export function isModeGated(mode: string): boolean {
  return PREMIUM_TRACKING_MODES.includes(mode as PremiumTrackingMode);
}

/** Cosmic Drift: free users can save this many lock events */
export const FREE_DRIFT_EVENT_LIMIT = 5;

// ─── Paywall feature lists ────────────────────────────────────────────────────

export const freeFeatures = [
  "Fleet tracking — ISS, Hubble, NOAA-20",
  "Deep Space — all 7 planets in real time",
  "Golden Hour sun vector",
  "Meteor shower sonar",
  "Tonight Score",
  "Basic Learn (Solar System, Moon, Planets)",
  `Cosmic Drift — first ${FREE_DRIFT_EVENT_LIMIT} lock events`,
];

export const premiumFeatures = [
  "Experience the Living Universe",
  "✨ Watch the Milky Way come alive with animated dust and hydrogen clouds",
  "💜 Explore breathtaking nebulae — Orion, Lagoon, Trifid in stunning detail",
  "🪐 See planets like never before — Jupiter's cloud bands and Great Red Spot, Saturn's rings, Mars' rust-toned surface, and phase-aware Venus",
  "🌕 A cinematic Moon with craters, earthshine, and atmospheric god rays",
  "🌙 Birth Sky — the exact sky the moment you were born",
  "☁️ Astro Weather — know instantly if tonight is worth going outside",
  "📸 Sky Lens Pro — Night Vision, Cinematic Mode, Time Travel",
  "🛰️ Live satellite tracking — ISS, Starlink trains, space debris",
  "📅 Never miss a meteor shower, eclipse, or conjunction again",
];

export const lifetimeFeatures = [
  "🌙 Lifetime — the entire living universe, forever",
  "Every premium feature, plus all future updates, for one price",
  "No subscription — pay once, own it for good",
];
