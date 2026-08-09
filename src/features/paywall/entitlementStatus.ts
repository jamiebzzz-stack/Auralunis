// Pure entitlement/membership classification — no react-native or native-module imports,
// so it is unit-testable in plain Node and shared by both RevenueCatService (restore/purchase)
// and EntitlementContext (app-wide premium state). Everything here is derived from the
// RevenueCat CustomerInfo the store returns — never from display text or local flags.

import { RevenueCatIds } from "./MonetizationCatalog";

/** The minimal shape of CustomerInfo these helpers read. */
export type EntitlementCustomerInfo = {
  entitlements: { active: Record<string, unknown> };
  /** Product identifiers of the account's currently-active auto-renewing subscriptions. */
  activeSubscriptions?: string[];
};

export type MembershipKind = "none" | "subscription" | "lifetime";

/**
 * True only when the EXACT AuraLunis entitlement ("AuraLunis Premium") is active. Never
 * matches on "any entitlement" and never falls back to a different identifier. The bare
 * fact that a restore/purchase call completed is NOT sufficient — only an active entitlement.
 */
export function hasAuraLunisEntitlement(
  customerInfo: EntitlementCustomerInfo,
  entitlementId: typeof RevenueCatIds.entitlement = RevenueCatIds.entitlement
): boolean {
  return Boolean(customerInfo.entitlements.active[entitlementId]);
}

/**
 * Classify the customer's AuraLunis membership from the store's CustomerInfo:
 *   - "none":         entitlement not active.
 *   - "subscription": entitlement active AND an active auto-renewing monthly/annual sub.
 *   - "lifetime":     entitlement active via the one-time lifetime product (no active sub).
 * Subscription-vs-lifetime is derived from `activeSubscriptions` product IDs, so a lifetime
 * owner is never told they have a subscription to manage.
 */
export function classifyAuraLunisMembership(customerInfo: EntitlementCustomerInfo): MembershipKind {
  if (!hasAuraLunisEntitlement(customerInfo)) return "none";
  const active = customerInfo.activeSubscriptions ?? [];
  const hasActiveSubscription =
    active.includes(RevenueCatIds.products.premiumMonthly) ||
    active.includes(RevenueCatIds.products.premiumAnnual);
  return hasActiveSubscription ? "subscription" : "lifetime";
}

/** What the Settings membership card should render and do, per membership state. */
export type MembershipCtaKind = "paywall" | "manage" | "lifetime";
export type MembershipCta = {
  /** Truthful one-line status describing the current membership state. */
  statusCopy: string;
  /** The single primary CTA label for this state. */
  ctaLabel: string;
  /** What tapping the primary CTA should do (or `lifetime` = non-actionable active badge). */
  ctaKind: MembershipCtaKind;
};

/**
 * Single deterministic mapping from membership state → Settings card presentation.
 * Pure and total: any unexpected value (loading / unknown / error, all of which surface
 * as `membershipKind === "none"` from the fail-closed EntitlementContext) resolves to the
 * non-subscriber state — never a false active claim, never subscription management.
 */
export function resolveMembershipCta(membershipKind: MembershipKind): MembershipCta {
  switch (membershipKind) {
    case "subscription":
      return {
        statusCopy: "Your AuraLunis Premium membership is active.",
        ctaLabel: "Manage Subscription",
        ctaKind: "manage",
      };
    case "lifetime":
      return {
        statusCopy: "Lifetime Access — your AuraLunis Premium membership is active for good.",
        ctaLabel: "Lifetime Access",
        ctaKind: "lifetime",
      };
    case "none":
    default:
      return {
        statusCopy: "Unlock the full sky with AuraLunis Lifetime — one purchase, premium forever.",
        ctaLabel: "View Lifetime",
        ctaKind: "paywall",
      };
  }
}
