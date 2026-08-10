# AuraLunis — API Keys Setup Guide

> ⚠️ **HISTORICAL — pricing and offer details below are superseded.**
>
> AuraLunis is **Lifetime-only: $29.99 one-time**, as of 2026-08-09 — no
> subscription, no renewal, no free trial. This document is kept as a record of
> the retired three-tier model and is not a description of the shipping app.
>
> Source of truth: `src/features/paywall/MonetizationCatalog.ts` and `CLAUDE.md`.



## Required Keys

### 1. RevenueCat (subscriptions)
1. Create account at https://app.revenuecat.com
2. Create a new project: "AuraLunis"
3. Add an "Apple App Store" app with bundle ID: `com.ocoeestudios.auralunis`
4. Go to API Keys → copy the **Public SDK Key** (starts with `appl_`)
5. In `app.json`, set:
   ```json
   "extra": {
     "revenueCatApiKey": "appl_your_key_here"
   }
   ```
6. In App Store Connect → In-App Purchases, create:
   - `com.ocoeestudios.auralunis.premium.monthly` — $9.99/month auto-renewable
   - `com.ocoeestudios.auralunis.premium.annual` — $49.99/year auto-renewable
   - `com.ocoeestudios.auralunis.lifetime` — $29.99 one-time non-consumable (reference name and display name both "Lifetime")
   - No free trial / introductory offer on any plan.
7. In RevenueCat → Products, import all three products
8. Create an Entitlement with the EXACT identifier `AuraLunis Premium` (with the space and capitals — not `auralunis_premium`). Attach all three products to it.
9. Create an Offering: `default` with packages `premium_monthly`, `premium_annual`, and `$rc_lifetime`

## No other API keys are required

AuraLunis ships with no other third-party API keys:

- **Weather (Tonight Score / Astro Weather):** uses **Open-Meteo**, a free, keyless service. No account or API key is needed. Only approximate latitude/longitude are sent.
- **Astronomy:** `astronomy-engine` runs entirely on-device with zero network requests.
- **Satellites / space weather:** public, read-only feeds (CelesTrak, NOAA SWPC). No keys, no personal data.

> There is **no AI / LLM feature** in AuraLunis. Do not add an Anthropic/Claude key or any "AI Sky Companion" — that concept was descoped before launch and no such service exists in the app.

## Where keys are used
- RevenueCat: `src/services/RevenueCatService.ts` → `configureRevenueCat()`
- Open-Meteo (no key): `src/services/WeatherService.ts` → `fetchCurrentWeather()`

## Testing without the RevenueCat key
The app runs without the RevenueCat key:
- Weather still works (Open-Meteo is keyless)
- Subscriptions show a "not configured" state (sandbox testing still works once the key is set)
- All other features (ephemeris, constellations, vault, etc.) work fully offline
