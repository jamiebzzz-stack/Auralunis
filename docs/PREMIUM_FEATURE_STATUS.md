> ⚠️ Historical document
>
> This file is retained for historical context only. Product, pricing, navigation, entitlement, camera/AR, Watch/watchOS, and architecture details may be obsolete. Use `CLAUDE.md` and the current merged code as the active source of truth.

# Premium Feature Status

> ⚠️ **HISTORICAL — pricing and offer details below are superseded.**
>
> AuraLunis is **Lifetime-only: $29.99 one-time**, as of 2026-08-09 — no
> subscription, no renewal, no free trial. This document is kept as a record of
> the retired three-tier model and is not a description of the shipping app.
>
> Source of truth: `src/features/paywall/MonetizationCatalog.ts` and `CLAUDE.md`.



## Launch-Ready (v1.0.0)

### Horizon Free
- [x] Basic Sky Lens (camera + AR overlay with device pointing)
- [x] Manual Sky Map fallback
- [x] Selected Learn content (all categories visible, detail varies by tier)
- [x] Tonight Score (weather + moon + sky quality)
- [x] Living Astrolabe on Home
- [x] Selected daily sky highlights
- [x] Encrypted local Vault (NaCl secretbox)

### Horizon+ ($4.99/mo · $29.99/yr · $24.99 founder first year)
- [x] Expanded Sky Lens (all visible bodies labeled)
- [x] All 88 constellation lessons
- [x] Celestial alarms and rituals (notifications wired)
- [x] Premium themes (Midnight Gold, Soft Moon, Deep Space)
- [x] Expanded Notes and Vault
- [x] RevenueCat purchase flow wired (needs API key + App Store products)
- [x] 7-day trial eligible
- [x] Simplified first-open paywall (Horizon+ only)

## Coming Later (not purchasable at launch)

### Aura Pro ($5.99/mo · $49.99/yr)
- [ ] Full Deep Sky and Milky Way layers
- [ ] Light-pollution and astrophotography predictor (panel scaffold exists)
- [ ] Time-Scrub Matrix (panel scaffold exists)
- [ ] Advanced Watch gallery and complication preferences
- [ ] Astral Sound Bath and premium utilities (audio playback not yet wired)
- Labeled "Coming Later" in the catalog and paywall

### Sovereign ($299/yr)
- [ ] Desk Obelisk StandBy widget (Swift scaffold)
- [ ] Apple Vision Pro Stellar Portal (Swift scaffold)
- [ ] Personalized Sovereign Sigil (crypto preview exists)
- [ ] Physical Astral Artifact fulfillment
- Labeled "Waitlist · Coming Later"

### Spatial Previews
- [ ] Stellar Portal (visionOS immersive space) — Swift scaffold
- [ ] Spatial Matrix — concept only
- Labeled "future spatial previews"

## Production Integrations Status

| Integration | Status |
|---|---|
| Ephemeris (astronomy-engine) | ✅ Real, verified (7/7 regression) |
| Satellites (satellite.js SGP4) | ✅ Real, verified (8/8 regression) |
| Sky Lens AR (projection + orientation) | ✅ Built, needs outdoor calibration |
| Vault encryption (NaCl secretbox) | ✅ Real, SecureStore key |
| Tonight Score | ✅ Real (needs weather API key for live cloud data) |
| Notifications (sunset/moonrise) | ✅ Wired, needs device permission test |
| RevenueCat (purchase/restore) | ✅ Code complete, needs API key + products |
| Camera permission flow | ✅ Real, with Manual Sky Map fallback |
| Location | ✅ Real, with neutral-default fallback |
| Weather (OpenWeatherMap) | ⏳ Scaffolded, needs API key |
| WidgetKit | ⏳ Swift scaffold, not compiled |
| watchOS | ⏳ Swift scaffold, not compiled |
| visionOS | ⏳ Swift scaffold, not compiled |
| Audio playback | ❌ Not started |
| Community features | ❌ Not started |
