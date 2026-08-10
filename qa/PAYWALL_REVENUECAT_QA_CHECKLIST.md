# AuraLunis — Lifetime-Only Paywall + RevenueCat QA

Tester:
Build:
Sandbox account:
Date:

## New-customer paywall
- [ ] Paywall shows **Lifetime only**.
- [ ] No Monthly option is visible/selectable.
- [ ] No Annual option is visible/selectable.
- [ ] U.S. fallback price is **$29.99 one-time**.
- [ ] Live localized StoreKit/RevenueCat price replaces the fallback when available.
- [ ] No free-trial wording appears.
- [ ] No auto-renewal / recurring-subscription wording appears.
- [ ] Restore Purchases is visible.
- [ ] Terms and Privacy are accessible.
- [ ] Lifetime purchase unlocks `AuraLunis Premium`.

## RevenueCat
- [ ] Entitlement identifier is exactly `AuraLunis Premium`.
- [ ] Current offering is `default`.
- [ ] Current offering contains only `$rc_lifetime` → `com.ocoeestudios.auralunis.lifetime`.
- [ ] Monthly and Annual are **not** in the current new-customer offering.
- [ ] Legacy Monthly/Annual products remain attached to the `AuraLunis Premium` entitlement.

## App Store Connect
- [ ] Lifetime product ID is `com.ocoeestudios.auralunis.lifetime`.
- [ ] Lifetime is a non-consumable one-time purchase.
- [ ] U.S. Lifetime price is $29.99.
- [ ] Monthly and Annual remain approved for legacy subscriber continuity.
- [ ] Monthly/Annual review notes explain they are legacy-only and not presented to new customers in-app.

## Legacy subscriber regression
- [ ] Existing Monthly subscriber remains premium.
- [ ] Existing Annual subscriber remains premium.
- [ ] Monthly restore recovers `AuraLunis Premium`.
- [ ] Annual restore recovers `AuraLunis Premium`.
- [ ] Active legacy subscriber sees Manage Subscription.
- [ ] Lifetime customer does not see a recurring-subscription management CTA.

## Result
- [ ] PASS
- [ ] BLOCKED — attach issue log
