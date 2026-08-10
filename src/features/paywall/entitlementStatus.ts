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

export function hasAuraLunisEntitlement(
  customerInfo: EntitlementCustomerInfo,
  entitlementId: typeof RevenueCatIds.entitlement = RevenueCatIds.entitlement
): boolean {
  return Boolean(customerInfo.entitlements.active[entitlementId]);
}

export function classifyAuraLunisMembership(customerInfo: EntitlementCustomerInfo): MembershipKind {
  if (!hasAuraLunisEntitlement(customerInfo)) return "none";
  const active = customerInfo.activeSubscriptions ?? [];
  const hasActiveSubscription =
    active.includes(RevenueCatIds.products.premiumMonthly) ||
    active.includes(RevenueCatIds.products.premiumAnnual);
  return hasActiveSubscription ? "subscription" : "lifetime";
}

export type MembershipCtaKind = "paywall" | "manage" | "lifetime";
export type MembershipCta = {
  statusCopy: string;
  ctaLabel: string;
  ctaKind: MembershipCtaKind;
};

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
        statusCopy: "Unlock AuraLunis Premium for life with one purchase.",
        ctaLabel: "View Lifetime",
        ctaKind: "paywall",
      };
  }
}
