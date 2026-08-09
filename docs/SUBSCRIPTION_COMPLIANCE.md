# AuraLunis — Apple Subscription Compliance

> ⚠️ **HISTORICAL — pricing and offer details below are superseded.**
>
> AuraLunis is **Lifetime-only: $29.99 one-time**, as of 2026-08-09 — no
> subscription, no renewal, no free trial. This document is kept as a record of
> the retired three-tier model and is not a description of the shipping app.
>
> Source of truth: `src/features/paywall/MonetizationCatalog.ts` and `CLAUDE.md`.



## Required by Apple (App Review Guidelines 3.1.2)

### Restore Purchases button
- [x] Present on the Membership screen
- [x] Calls `Purchases.restorePurchases()` via RevenueCat
- [x] Shows confirmation alert on success/failure
- Location: Settings → Manage Plan → Restore Purchases

### Subscription management deep link
- [x] "Manage Subscription" button links to Apple Settings
- [x] Uses `Linking.openURL('https://apps.apple.com/account/subscriptions')`
- Location: Settings → Manage Plan → Manage Subscription

### Auto-renewable disclosures (required on paywall)
The paywall must clearly state:
- [x] Price per billing period ($9.99/month or $49.99/year)
- [x] Trial is eligibility-gated: monthly/annual may include a 7-day introductory free trial for eligible customers (Apple-determined); lifetime has no trial
- [x] "Payment will be charged to your Apple ID account at the confirmation of purchase"
- [x] "Subscription automatically renews unless cancelled at least 24 hours before the end of the current period"
- [x] Links to Terms of Use and Privacy Policy

### Terms of Use link
- Must be accessible from the paywall
- Must be accessible from Settings
- URL: ocoeestudios.com/auralunis/terms

### Privacy Policy link
- Must be accessible from the paywall
- Must be accessible from Settings
- Must be entered in App Store Connect
- URL: ocoeestudios.com/auralunis/privacy

## RevenueCat Product IDs

| Product | ID | Type |
|---|---|---|
| Premium Monthly | `com.ocoeestudios.auralunis.premium.monthly` | Auto-renewable |
| Premium Annual | `com.ocoeestudios.auralunis.premium.annual` | Auto-renewable |
| Lifetime | `com.ocoeestudios.auralunis.lifetime` | Non-consumable |

## Entitlement
`AuraLunis Premium` — exact identifier (with the space and capitals, NOT a snake_case slug). All three products unlock this single entitlement. A mismatch means purchases succeed but never unlock premium.

## Offering
`default` — contains packages `premium_monthly`, `premium_annual`, and `$rc_lifetime`.

## Free trial
Monthly and annual subscriptions may include a 7-day introductory free trial for eligible customers only; eligibility is determined by Apple, so not every customer receives it. Lifetime is a one-time purchase with no trial.
Configure in App Store Connect → In-App Purchases → each product → Introductory Offer.

## Sandbox testing
1. Create a sandbox Apple ID in App Store Connect → Users and Access → Sandbox Testers
2. Sign out of your real Apple ID on the test device
3. Attempt purchase in the app — it will prompt for sandbox credentials
4. Sandbox subscriptions renew at accelerated rates (monthly = 5 min, annual = 1 hour)

## Grace period
Enable Billing Grace Period in App Store Connect → App → Subscriptions → Billing Grace Period.
This gives users 6-16 days to fix payment issues before losing access.
