// paywallCopy.ts
// PURE, node-testable copy resolver for the paywall. Given a plan interval, its price, and the
// STORE-RESOLVED trial state, it returns every user-visible string for that plan. This is the
// single source of truth for paywall wording so the modal never re-derives eligibility rules.
//
// FAIL CLOSED: free-trial language is produced ONLY for `trial.status === "eligible"` (which
// usePaywallOffers sets solely when RevenueCat/StoreKit positively confirms this account is
// eligible AND a real intro offer exists). Every other state — ineligible, unavailable, loading,
// no-offer, unknown, error — and lifetime in ALL states resolve to plan-accurate PAID copy with
// no "free", "trial", "7-day", or "7 days free" wording anywhere.
//
// The current new-customer paywall calls this resolver only for Lifetime. Subscription branches
// remain here for legacy-safe/testable behavior if a legacy surface ever needs them.
//
// Type-only imports keep this module free of runtime dependencies (no React / RevenueCat), so it
// can be unit-tested directly under node.

import type { PlanInterval, TrialState } from "./usePaywallOffers";

export type PaywallPlanCopy = {
  /** true only for a store-confirmed eligible subscription offer */
  isTrial: boolean;
  /** right-aligned price on the plan card, e.g. "$9.99/month" · "$29.99 one-time" */
  priceText: string;
  /** subtitle under the plan name, and the CTA supporting line */
  detailText: string;
  /** primary button label — also used as its accessibility label */
  ctaLabel: string;
  /** paywall heading shown when THIS plan is the selected one */
  heading: string;
  /** renewal disclosure under the CTA; null for lifetime (one-time, nothing renews) */
  disclosure: string | null;
};

export const DEFAULT_HEADLINE = "Unlock the Living Universe";

const TRIAL_DISCLOSURE =
  "After the free trial, your subscription renews automatically at the displayed price unless canceled at least 24 hours before the trial ends. Manage or cancel in your Apple ID subscription settings.";
const PAID_DISCLOSURE =
  "Your subscription renews automatically at the displayed price unless canceled at least 24 hours before the end of the period. Manage or cancel in your Apple ID subscription settings.";

function periodWord(interval: PlanInterval): string {
  return interval === "annual" ? "year" : "month";
}

// Base recurring/one-time price without the "/period" suffix: prefer the live localized store
// price, else strip the catalog display price's suffix. "$9.99/month" → "$9.99".
function basePrice(displayPrice: string, localizedPrice: string | null): string {
  if (localizedPrice) return localizedPrice;
  return displayPrice.replace(/\s*\/\s*(month|year)\s*$/i, "").trim();
}

// "7 days" → "7-day"; "1 month" → "1-month".
function trialAdjective(durationText: string): string {
  return durationText.replace(/^(\d+)\s+(day|week|month|year)s?$/i, "$1-$2");
}

// "7-day" → "7-Day" (title-cased for the button label).
function titleCaseAdjective(adjective: string): string {
  return adjective
    .split("-")
    .map((word, i) => (i === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join("-");
}

/**
 * Resolve every user-visible string for one plan from its store-resolved trial state.
 *
 * @param interval       monthly | annual | lifetime
 * @param displayPrice   catalog fallback price, e.g. "$9.99/month" · "$49.99/year" · "$29.99"
 * @param localizedPrice live localized store price (recurring/one-time) or null
 * @param trial          store-resolved trial state (never derived here)
 */
export function resolvePlanCopy(
  interval: PlanInterval,
  displayPrice: string,
  localizedPrice: string | null,
  trial: TrialState
): PaywallPlanCopy {
  const price = basePrice(displayPrice, localizedPrice);

  // Lifetime — a one-time purchase. NEVER any trial reference, in EVERY state.
  if (interval === "lifetime") {
    return {
      isTrial: false,
      priceText: `${localizedPrice ?? displayPrice} one-time`,
      detailText: `One-time purchase · ${price}`,
      ctaLabel: "Unlock Lifetime",
      heading: DEFAULT_HEADLINE,
      disclosure: null,
    };
  }

  const priceText = localizedPrice ? `${localizedPrice}/${periodWord(interval)}` : displayPrice;

  // Trial copy ONLY when the store positively confirmed eligibility.
  if (trial.status === "eligible") {
    const adj = trialAdjective(trial.durationText);
    return {
      isTrial: true,
      priceText,
      detailText: `${trial.durationText} free, then ${priceText}`,
      ctaLabel: `Start ${titleCaseAdjective(adj)} Free Trial`,
      heading: `Start your ${adj} free trial`,
      disclosure: TRIAL_DISCLOSURE,
    };
  }

  // Every non-eligible subscription state — ineligible | unavailable | loading (and, upstream,
  // unknown | no_offer | error which usePaywallOffers folds into "unavailable"). Fail closed to
  // plan-accurate paid copy with NO trial language.
  return {
    isTrial: false,
    priceText,
    detailText: `${price} per ${periodWord(interval)}`,
    ctaLabel: interval === "annual" ? "Subscribe Annually" : "Subscribe Monthly",
    heading: DEFAULT_HEADLINE,
    disclosure: PAID_DISCLOSURE,
  };
}
