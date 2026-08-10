# App Store Connect — AuraLunis Current Configuration

This file is the current App Store Connect monetization reference. For marketing copy, see `docs/APP_STORE_METADATA.md` and `docs/APP_STORE_LISTING.md`.

## App identity

| Field | Value |
|---|---|
| Name | `AuraLunis` |
| Bundle ID | `com.ocoeestudios.auralunis` |
| SKU | `OCOEE-AURALUNIS-001` |
| Primary Language | English (U.S.) |
| Privacy Policy | `https://ocoeestudios.com/auralunis/privacy` |
| Terms | `https://ocoeestudios.com/auralunis/terms` |

## Current new-customer purchase

| Reference Name | Product ID | Type | U.S. Price |
|---|---|---|---|
| AuraLunis Lifetime | `com.ocoeestudios.auralunis.lifetime` | Non-consumable | **$29.99** |

The in-app new-customer paywall offers **Lifetime only**. It displays live localized StoreKit/RevenueCat pricing when available and uses `$29.99` as the U.S. fallback. It contains no subscription, recurring-billing, or free-trial language.

## Legacy auto-renewable subscriptions

These products remain approved for existing subscriber continuity. They are not shown as selectable new-customer purchases in the app.

| Reference Name | Product ID | Duration | Purpose |
|---|---|---|---|
| AuraLunis Premium Monthly | `com.ocoeestudios.auralunis.premium.monthly` | 1 month | Existing legacy subscribers |
| AuraLunis Premium Annual | `com.ocoeestudios.auralunis.premium.annual` | 1 year | Existing legacy subscribers |

Subscription Group: `AuraLunis Premium`

Do **not** remove these legacy products from the RevenueCat entitlement. Do **not** use App Store Connect's Remove from Sale control as a substitute for the in-app Lifetime-only offering when existing renewals must be preserved.

## RevenueCat alignment

- Entitlement identifier: `AuraLunis Premium` (exact spelling/capitalization)
- Current offering: `default`
- Current new-customer package: `$rc_lifetime`
- `$rc_lifetime` product: `com.ocoeestudios.auralunis.lifetime`
- Monthly/Annual may remain in the product catalog and attached to the entitlement for restore/backward compatibility, but are not in the current new-customer offering.

## App Review notes

Use `public/APP_STORE_REVIEW_NOTES.md` as the canonical app-level review note source.

For the individual Monthly/Annual product Review Notes, explain that the product is retained only for existing legacy subscribers, is not offered to new customers in-app, and remains available for existing access/restore/manage-subscription behavior.

For Lifetime, review notes should state that it is a one-time non-consumable purchase, $29.99 in the U.S. storefront, with no subscription, recurring charge, or free trial.

## Review screenshots

- Lifetime: use the current Lifetime-only purchase-flow screenshot.
- Legacy Monthly/Annual: keep product-specific review screenshots unless Apple requests replacement; do not substitute a Lifetime screenshot merely to make those legacy product pages look current.

## Release check before submission

1. GitHub CI is green on the exact commit to build.
2. New-customer paywall shows Lifetime only.
3. Lifetime fallback is `$29.99` and live localized StoreKit price wins when available.
4. RevenueCat `default` offering contains only `$rc_lifetime`.
5. `AuraLunis Premium` entitlement still contains eligible legacy Monthly/Annual products plus Lifetime.
6. Restore works for Lifetime and existing legacy subscriptions.
7. No stale `$129.99` or new-customer trial/subscription claim is present in current release metadata/docs.
