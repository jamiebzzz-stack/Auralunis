# AuraLunis RevenueCat Three-Tier Setup

> ⚠️ **HISTORICAL — pricing and offer details below are superseded.**
>
> AuraLunis is **Lifetime-only: $29.99 one-time**, as of 2026-08-09 — no
> subscription, no renewal, no free trial. This document is kept as a record of
> the retired three-tier model and is not a description of the shipping app.
>
> Source of truth: `src/features/paywall/MonetizationCatalog.ts` and `CLAUDE.md`.



## Product strategy

### Horizon Free
- Free forever
- No subscription product is needed

### Horizon+
- $2.99/month
- $19.99/year
- 7-day introductory free trial for eligible new subscribers

### Aura Pro
- $5.99/month
- $49.99/year
- 7-day introductory free trial for eligible new subscribers

### Sovereign
- $299/year
- Annual only
- Keep disabled in the launch paywall as a waitlist until the promised luxury benefits and physical fulfillment are ready
- The product identifier is reserved in the code scaffold so it can be activated later

## App Store Connect subscription group

Create one subscription group:

`AuraLunis Memberships`

Use levels:
1. Sovereign
2. Aura Pro
3. Horizon+

Place monthly and annual products for the same tier at the same level.

## App Store product IDs

- `com.ocoee.auralunis.horizon.monthly`
- `com.ocoee.auralunis.horizon.annual`
- `com.ocoee.auralunis.aura.monthly`
- `com.ocoee.auralunis.aura.annual`
- `com.ocoee.auralunis.sovereign.annual`

Confirm the identifiers before creating products in App Store Connect.

## RevenueCat entitlements

- `horizon_plus`
- `aura_pro`
- `sovereign`

## RevenueCat offering

Create:

`auralunis_launch`

Add custom packages:
- `horizon_monthly`
- `horizon_annual`
- `aura_monthly`
- `aura_annual`
- `sovereign_annual`

Do not add the Sovereign package to the active public offering until the promised benefits are ready for delivery.

## Public SDK keys

Replace placeholders in `app.json`:

```json
{
  "expo": {
    "extra": {
      "revenueCatIosApiKey": "REPLACE_WITH_REVENUECAT_PUBLIC_IOS_API_KEY",
      "revenueCatAndroidApiKey": "REPLACE_WITH_REVENUECAT_PUBLIC_ANDROID_API_KEY"
    }
  }
}
```

Use RevenueCat public SDK keys only. Do not embed private App Store Connect credentials in the app.

## Free-trial rule

Configure a 7-day introductory free trial on each paid App Store subscription product. Show trial language as:

`7-day free trial for eligible new subscribers`

A user is eligible for only one introductory offer per App Store subscription group. This means a person cannot use a Horizon+ trial and then claim a second Aura Pro trial in the same group.

## Sandbox QA

1. Add products in App Store Connect.
2. Add the 7-day introductory free trials.
3. Import products into RevenueCat.
4. Attach products to entitlements.
5. Create the `auralunis_launch` offering.
6. Add the four launch packages.
7. Add the RevenueCat public iOS SDK key to `app.json`.
8. Run the internal-development build.
9. Test purchase, cancellation, restore, and management URL behavior using an App Store sandbox account.
