// MonetizationCatalog.ts
// AuraLunis pricing — Lifetime only.
//
// The RevenueCat `default` Offering contains exactly ONE package, `$rc_lifetime`
// (product `com.ocoeestudios.auralunis.lifetime`, $29.99 one-time). The monthly and annual
// subscriptions were removed from the Offering, so they are no longer purchasable and MUST
// NOT appear on the paywall — a plan card whose package is absent from the Offering resolves
// to `not_available` in RevenueCatService and produces a dead purchase button.
//
// Their product IDs deliberately REMAIN in `RevenueCatIds` below: the products were not
// deleted from App Store Connect, existing subscribers still hold the entitlement through
// them, and classifyAuraLunisMembership() reads those exact IDs to tell an active subscriber
// ("Manage Subscription") apart from a lifetime owner ("Lifetime Access"). Removing them
// would misclassify every existing subscriber. Do not "tidy" them away.
//
// NO TRIAL: lifetime is a one-time purchase, so nothing renews and no introductory offer
// applies. There is no trial or subscription-renewal copy anywhere on the paywall.
//
// NOTE: the lifetime *product id* is `com.ocoeestudios.auralunis.lifetime`; its RevenueCat
// *package* identifier is the dashboard default `$rc_lifetime` — that's what the Offering
// uses, so the code must match it exactly or the package won't resolve.

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
  /** Primary price display fallback — e.g. "$29.99". Live StoreKit price wins when available. */
  displayPrice: string;
  /** Secondary line — monthly equivalent or subtitle */
  subtitle: string;
  revenueCatPackageId: string;
  badge?: string;
  /** Effective monthly price for an annual plan — e.g. "$4.17/mo" */
  effectiveMonthly?: string;
}

/**
 * The purchasable plans, in paywall order. Exactly one entry: this must mirror the packages
 * actually present in the RevenueCat `default` Offering. `displayPrice` is only a FALLBACK for
 * when StoreKit hasn't returned yet — the paywall prefers the live localized price from
 * usePaywallOffers(), so a price change in App Store Connect needs no app update.
 */
export const plans: PlanOption[] = [
  {
    id: "lifetime",
    productId: RevenueCatIds.products.lifetime,
    name: "AuraLunis Lifetime",
    interval: "lifetime",
    displayPrice: "$29.99",
    subtitle: "One purchase. Premium forever.",
    revenueCatPackageId: RevenueCatIds.packages.lifetime,
  },
];

/** The single purchasable plan — the paywall has no tier selection to make. */
export const lifetimePlan: PlanOption = plans[0];

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

// Both lists below describe the gates that ACTUALLY ship. Every line was checked against the
// code that enforces it — SkyLensLayerCatalog (layer `premium` flags), PremiumVisualGating,
// FREE_LEARN_LESSON_IDS, CelestialCalendarScreen, FREE/PREMIUM_TRACKING_MODES,
// FREE_DRIFT_EVENT_LIMIT, and the screen-level `isPremium` guards. If a gate changes, change
// the matching line here: promising access the code denies is worse than promising nothing.

/** What a non-entitled user genuinely gets. Rendered as the "Free" column on the paywall. */
export const freeFeatures = [
  // NOT "the full Sky Lens planetarium": the Satellite and Ecliptic layers are premium, so
  // "full" would contradict the paid column two lines down.
  "The Sky Lens planetarium — stars, constellations, Milky Way, planets and nebulae",
  "Every constellation, in the standard visual treatment",
  "Tonight Score, Find Mode and the manual sky map",
  "Fleet, Deep Space, Golden Hour and Meteor tracking",
  `Cosmic Drift — your first ${FREE_DRIFT_EVENT_LIMIT} lock events`,
  // Kept in words, not imported: this module is require()d by the node self-tests and must
  // stay free of LearnCatalog's weight. paywall-copy-selftest asserts this stays in step with
  // FREE_LEARN_LESSON_IDS.length, so the two can never silently drift.
  "Three starter Learn lessons",
  "Celestial Calendar — event names, dates, ratings and descriptions",
  "Share Your Sky — create and preview cards",
];

/** What the Lifetime purchase adds. Rendered as the "Lifetime" column on the paywall. */
export const premiumFeatures = [
  "The living universe — spectral star colour, star bloom and animated Milky Way dust",
  "Detailed planets — Jupiter's cloud bands and Great Red Spot, Saturn's rings, phase-aware Venus",
  "A cinematic Moon with craters, earthshine and atmospheric glow",
  "Sky Lens Pro — Night Vision, Cinematic Mode, Time Travel, photo capture and sky-quality presets",
  "Satellite and ecliptic layers, with live tracking of the ISS, Starlink trains and debris",
  "The complete Learn curriculum",
  "Birth Sky — recreate the sky for your birth date, time and location",
  "Astro Weather — see tonight's observing conditions at a glance",
  "Photo Planner and the full Celestial Archive",
  "The encrypted Vault, for every sky note",
  "Full event details, plus reminders for meteor showers, eclipses and conjunctions",
  "Train, Debris, Chain, Static and Re-Entry tracking",
  "Unlimited Cosmic Drift, premium Share Your Sky export, and the Aura Pro panels",
];

/** Why it's a one-time purchase — shown under the Lifetime column. */
export const lifetimeFeatures = [
  "One payment. No subscription, no recurring charges.",
  "Every premium feature in the app today.",
];
