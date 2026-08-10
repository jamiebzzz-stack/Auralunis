# AuraLunis — Apple Purchase Compliance

## Current monetization contract

### New customers
- The in-app purchase surface offers **AuraLunis Lifetime only**.
- Product ID: `com.ocoeestudios.auralunis.lifetime`
- Type: non-consumable / one-time purchase
- U.S. storefront price: **$29.99**
- Runtime display price comes from StoreKit/RevenueCat localized pricing; `$29.99` is the safe fallback.
- No subscription, recurring billing, or free-trial language appears on the new-customer paywall.

### Existing legacy subscribers
The legacy subscription products remain valid so existing subscribers can continue to use their previously purchased access and normal Apple subscription-management flows:

| Product | ID | Type |
|---|---|---|
| Premium Monthly | `com.ocoeestudios.auralunis.premium.monthly` | Auto-renewable legacy subscription |
| Premium Annual | `com.ocoeestudios.auralunis.premium.annual` | Auto-renewable legacy subscription |

These products are **not selectable on the new-customer in-app paywall**. Do not detach them from the shared RevenueCat entitlement merely to hide them from new customers.

## RevenueCat

### Entitlement
`AuraLunis Premium` — exact identifier, including space and capitalization.

Lifetime and eligible legacy Monthly/Annual purchases unlock this same entitlement so restore/access remains backward-compatible.

### Current offering
`default` — public new-customer offering contains only package `$rc_lifetime` mapped to `com.ocoeestudios.auralunis.lifetime`.

Legacy Monthly/Annual products may remain in the RevenueCat product catalog and attached to the entitlement without being present in the current offering.

## Restore Purchases
- Restore remains available from the purchase/settings flow.
- Restore success is based on the actual `AuraLunis Premium` entitlement, not merely a completed restore call.
- Existing Monthly/Annual customers must continue to restore successfully.
- Lifetime purchasers must continue to restore successfully.

## Subscription management
- Existing active Monthly/Annual subscribers retain the Manage Subscription path to Apple's subscription-management UI.
- Lifetime customers are shown a non-recurring Lifetime Access state, not a Manage Subscription action.

## Terms and Privacy
The new-customer Lifetime paywall keeps Terms, Privacy, and Restore Purchases accessible. Because the offered product is non-consumable Lifetime, the paywall must not show auto-renewal or trial disclosures that apply only to subscriptions.

## App Store Connect operational rule
Do not use **Remove from Sale** on Monthly/Annual as a shortcut for hiding them in-app when the business requirement is to preserve legacy subscriber renewals. New-customer availability is controlled by the in-app Lifetime-only paywall and RevenueCat's Lifetime-only current offering.
