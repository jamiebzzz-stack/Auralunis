# AuraLunis 7-Day Trial Launch Popup

> ⚠️ **HISTORICAL — pricing and offer details below are superseded.**
>
> AuraLunis is **Lifetime-only: $29.99 one-time**, as of 2026-08-09 — no
> subscription, no renewal, no free trial. This document is kept as a record of
> the retired three-tier model and is not a description of the shipping app.
>
> Source of truth: `src/features/paywall/MonetizationCatalog.ts` and `CLAUDE.md`.



## Purpose
Show a polished AuraLunis Premium offer when the user first opens the app.
(The current first-open surface is `ThreeTierPaywallModal`.)

## Behavior
- Show on first open.
- Do not force it on every launch.
- Provide these actions:
  - Continue Exploring
  - Restore Purchases
  - Purchase a plan (Monthly / Annual / Lifetime)
- Only surface trial wording ("Start your 7-day free trial") when Apple confirms the
  customer is eligible for the introductory offer — never promise a trial unconditionally.
- Save a local `seen` flag after purchase or Continue Exploring.
- Use softer reminders later from premium feature gates or Settings.

## Pricing (single premium entitlement: `AuraLunis Premium`)
- Monthly: $9.99 — 7-day intro trial only when Apple confirms eligibility
- Annual: $49.99 — 7-day intro trial only when Apple confirms eligibility
- AuraLunis Lifetime: $29.99 — no trial (the only purchasable product)

## Production Handoff
Real purchases should use StoreKit / RevenueCat.
