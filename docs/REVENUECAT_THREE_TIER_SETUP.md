# Archived — RevenueCat Three-Tier Setup

This document described an abandoned pre-launch Horizon+/Aura Pro/Sovereign pricing model and is **not a current configuration guide**.

## Current AuraLunis monetization

- **New customers:** AuraLunis Lifetime only, one-time purchase.
- Lifetime product ID: `com.ocoeestudios.auralunis.lifetime`
- RevenueCat package: `$rc_lifetime`
- U.S. App Store price: **$29.99**
- Current RevenueCat offering: `default`, containing Lifetime only.
- Shared entitlement: `AuraLunis Premium`

## Legacy subscriptions

The approved Monthly and Annual product IDs are retained only for existing subscriber continuity, restore, entitlement recognition, and Apple subscription management:

- `com.ocoeestudios.auralunis.premium.monthly`
- `com.ocoeestudios.auralunis.premium.annual`

They are not part of the new-customer in-app offering.

See `docs/SUBSCRIPTION_COMPLIANCE.md` and `src/features/paywall/MonetizationCatalog.ts` for the current contract.
