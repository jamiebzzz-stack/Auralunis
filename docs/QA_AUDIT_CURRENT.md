# AuraLunis Current QA Audit

> ⚠️ **HISTORICAL — pricing and offer details below are superseded.**
>
> AuraLunis is **Lifetime-only: $29.99 one-time**, as of 2026-08-09 — no
> subscription, no renewal, no free trial. This document is kept as a record of
> the retired three-tier model and is not a description of the shipping app.
>
> Source of truth: `src/features/paywall/MonetizationCatalog.ts` and `CLAUDE.md`.



This branch uses the current launch architecture as the source of truth.

## Automated checks

The branch workflow runs:

- TypeScript compilation
- Static repository checks
- Sky Lens projection and accuracy checks
- Whole-app architecture checks
- Fresh regression checks
- RevenueCat configuration preflight
- Premium feature preflight
- Ephemeris self-test
- Satellite SGP4 self-test
- Sky Lens self-test
- Expo Doctor

## Current product assumptions

- Navigation is Home, Sky, Learn, Vault, and Settings.
- Sky Lens is a permanent cinematic planetarium; there is no live camera feed.
- Birth Sky requires birth date, local birth time, and birthplace for horizon-based accuracy.
- The onboarding Birth Sky is explicitly a date-only preview and does not claim exact planets or horizon.
- Weather uses keyless Open-Meteo and falls back safely when offline.
- Launch pricing is $9.99 monthly, $49.99 annual, and $129.99 lifetime, with no free trial.

## Device verification still required

Automation cannot fully validate physical-device behavior. Before merging or submitting a build, verify on an iPhone:

- Sky Lens motion, gestures, labels, and deep-sky image placement
- Birthplace lookup on Wi-Fi and cellular data
- Birth Sky AM/PM and 24-hour time entry
- Notification permission and delivery
- RevenueCat purchase and restore in StoreKit sandbox
- Share-sheet image capture
- Haptics and safe-area layout

Do not merge or submit this branch solely because automated checks pass.
