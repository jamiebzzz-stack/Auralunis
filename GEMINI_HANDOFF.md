> ## ⛔ BRANCH PROTOCOL — READ FIRST (every agent: Claude, Gemini, ChatGPT, all)
>
> **NEVER commit or push directly to `main`.** Multiple AIs edit this repo in
> parallel. Direct-to-main pushes have repeatedly collided, and on 2026-06-25 a
> bad parallel merge committed conflict markers straight to `main` and **broke the
> build** (it stopped compiling).
>
> Required flow for EVERY change — no exceptions:
> 1. `git pull origin main` first; check `gh pr list` and recent `git log` so you
>    don't rebuild what another agent is already doing.
> 2. `git checkout -b <type>/<short-name>`  (e.g. `visual/…`, `fix/…`, `feat/…`)
> 3. commit on that branch, then `git push origin <branch>`
> 4. open a PR to `main`, device-test, then merge (and delete the branch).
>
> `main` must always be green: a branch may only merge if `npx tsc --noEmit`
> reports **zero errors** and the Metro bundle builds. Never merge with conflict
> markers (`<<<<<<<` / `>>>>>>>`) in any file.
>
> ---
>
# AuraLunis — Full App Handoff for Gemini

> ⛔ **PRICING IN THIS DOCUMENT IS OUT OF DATE.**
>
> AuraLunis is **Lifetime-only: $29.99 one-time**, as of 2026-08-09. There is no
> subscription, nothing renews, and there is no free trial. The monthly/annual
> packages were removed from the RevenueCat offering; re-adding those plan cards
> produces a purchase button that silently fails.
>
> Source of truth: `src/features/paywall/MonetizationCatalog.ts` and `CLAUDE.md`.
> Pricing tables below are retained as a record of the retired model — do not
> implement from them.



> **Last updated:** Session 8 (monetization + live TLE pipeline)
> Read this before suggesting any code changes. Much of what you might suggest is already built.

---

## Logo

Crescent-C astrolabe — three concentric rings, compass needle, N/S/E/W points, central gold starburst, small moon icon on the ring, gold spheres at cardinal points. Do not replace or simplify it.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <defs>
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFF6D6"/>
      <stop offset="50%" stop-color="#D9A84E"/>
      <stop offset="100%" stop-color="#C7A66A"/>
    </linearGradient>
    <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#FFF7D7"/>
      <stop offset="60%" stop-color="#D9A84E"/>
      <stop offset="100%" stop-color="#C7A66A" stop-opacity="0"/>
    </radialGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="2" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <circle cx="100" cy="100" r="88" fill="none" stroke="url(#goldGrad)" stroke-width="1.5" opacity="0.7"/>
  <g stroke="#D9A84E" stroke-width="0.8" opacity="0.5">
    <line x1="100" y1="12" x2="100" y2="20"/><line x1="100" y1="180" x2="100" y2="188"/>
    <line x1="12" y1="100" x2="20" y2="100"/><line x1="180" y1="100" x2="188" y2="100"/>
  </g>
  <circle cx="100" cy="100" r="62" fill="none" stroke="#D9A84E" stroke-width="1" opacity="0.45"/>
  <circle cx="100" cy="100" r="36" fill="none" stroke="#C0C6D4" stroke-width="0.8" opacity="0.25"/>
  <line x1="100" y1="16" x2="100" y2="184" stroke="#D9A84E" stroke-width="1" opacity="0.6"/>
  <polygon points="100,10 96,22 104,22" fill="#D9A84E" opacity="0.8"/>
  <polygon points="100,190 96,180 104,180" fill="#D9A84E" opacity="0.5"/>
  <line x1="16" y1="100" x2="184" y2="100" stroke="#D9A84E" stroke-width="0.5" opacity="0.25"/>
  <text x="100" y="9" text-anchor="middle" font-family="serif" font-size="8" fill="#D9A84E" font-weight="bold">N</text>
  <text x="100" y="198" text-anchor="middle" font-family="serif" font-size="8" fill="#D9A84E" opacity="0.6">S</text>
  <text x="195" y="103" text-anchor="middle" font-family="serif" font-size="8" fill="#D9A84E" opacity="0.6">E</text>
  <text x="5" y="103" text-anchor="middle" font-family="serif" font-size="8" fill="#D9A84E" opacity="0.6">W</text>
  <path d="M118 52 C88 62 68 88 68 118 c0 34 24 58 52 58 -8 4 -18 2 -28 0 C62 170 40 146 40 118 40 78 72 48 118 52 Z" fill="url(#goldGrad)" filter="url(#glow)"/>
  <circle cx="140" cy="116" r="8" fill="#C0C6D4" opacity="0.7"/>
  <circle cx="144" cy="113" r="6.5" fill="#030816"/>
  <circle cx="100" cy="100" r="8" fill="url(#coreGlow)" filter="url(#glow)"/>
  <circle cx="100" cy="38" r="4" fill="#D9A84E" filter="url(#glow)"/>
  <circle cx="162" cy="100" r="4" fill="#D9A84E" filter="url(#glow)"/>
  <circle cx="100" cy="162" r="3.5" fill="#D9A84E" opacity="0.7"/>
  <circle cx="38" cy="100" r="3.5" fill="#D9A84E" opacity="0.7"/>
  <text x="130" y="42" font-size="6" fill="#FFF6D6" opacity="0.7">✦</text>
</svg>
```

**Logo rules:** Never replace with generic moon/compass. Never simplify the three rings. Always on `#030816`. Wordmark: AURALUNIS in Cinzel serif. Slogan: *Your Time, Written in the Stars*

---

## App Identity

- **Name:** AuraLunis — The Interactive Astral Clock
- **Developer:** Ocoee Studios (Mrs. Pepper, founder)
- **Bundle ID:** `com.ocoeestudios.auralunis`
- **GitHub:** `ocoee-studios/Auralunis` (private)
- **Stack:** React Native / Expo SDK 54 / TypeScript

---

## Design System (locked)

| Token | Value |
|---|---|
| Cosmic Black (bg) | `#030816` |
| Midnight Navy (surface) | `#071225` |
| Deep Indigo (elevated) | `#0B1630` |
| Astral Gold | `#D9A84E` |
| Gold 2 | `#FFF6D6` |
| Moon Silver | `#C0C6D4` |
| Nebula Violet | `#7B5CF6` |
| Green (lock) | `#4ADE80` |
| Amber (decay watch) | `#FF9500` |
| Crimson (decay critical) | `#FF3B30` |

Typography: Cinzel serif (headings) + Playfair Display (body)

---

## Navigation (locked — 5 tabs, do not add more)

**Home · Sky · Learn · Vault · Settings**

OrbitalAlignmentScreen opens as a full-screen modal from the Sky tab — not a separate tab.

---

## Pricing (locked)

| Product | Price | Trial |
|---|---|---|
| AuraLunis Premium monthly | $9.99/mo | 7-day intro trial only when Apple confirms eligibility |
| AuraLunis Premium annual | $49.99/yr | 7-day intro trial only when Apple confirms eligibility |
| AuraLunis Lifetime | $29.99 one-time | No trial |

A trial is never promised unconditionally — the offer is shown only when StoreKit reports both the introductory offer and the customer's eligibility.

RevenueCat product IDs:
- `com.ocoeestudios.auralunis.premium.monthly`
- `com.ocoeestudios.auralunis.premium.annual`
- `com.ocoeestudios.auralunis.lifetime`

RevenueCat package IDs: `premium_monthly`, `premium_annual`, `$rc_lifetime`

Entitlement: `AuraLunis Premium` (all three products unlock this single entitlement)

**Do not suggest changing these prices or adding more tiers.**

---

## Feature Gates (locked)

| Mode | Free | Premium |
|---|---|---|
| Fleet (ISS, Hubble, NOAA-20, Terra, Starlink) | ✅ | — |
| Deep Space (7 planets, Keplerian ephemeris) | ✅ | — |
| Golden Hour (sun vector, countdown) | ✅ | — |
| Meteor Shower Sonar | ✅ | — |
| Starlink Train Tracker | — | ✅ |
| Space Debris Mission Loop | — | ✅ |
| Re-Entry Vector Warning | — | ✅ |
| Sky-Crawl Alignment Chains | — | ✅ |
| Ionospheric Static audio | — | ✅ |
| Cosmic Drift galaxy (unlimited) | 5 events free | ✅ unlimited |

Gate implementation: `isModeGated(mode)` in `src/features/paywall/MonetizationCatalog.ts`. `useEntitlement()` hook in `src/hooks/useEntitlement.ts`. `PremiumModeGate` component in `src/components/PremiumModeGate.tsx`. All wired into `OrbitalAlignmentScreen.tsx`.

**Do not suggest rewriting paywall gates — they are fully implemented.**

---

## What Is Already Built (do not suggest rebuilding these)

### Core tracking engine
- `src/utils/alignmentEngine.ts` — pure bearing/elevation/score math. `SpatialTarget` interface includes `decayAlert?` and `velocityKms?`.
- `src/utils/hapticController.ts` — score-based proximity haptic cadence
- `src/utils/planetaryEphemeris.ts` — full Keplerian orbital model for 7 planets (~1° accuracy)

### Radar component
- `src/components/SpaceRadarGrid.tsx` — multi-blip SVG radar with:
  - Horizon Scope (curved arc by device pitch, ground shading)
  - Debris flash (fast crimson pulse)
  - Decay alert pulse (slow amber pulse)
  - Train node opacity fade lead→tail
  - Spring-animated blips via Reanimated (UI thread)

### All 9 tracking modes — fully implemented in `OrbitalAlignmentScreen.tsx`
1. **Fleet** — 6 LEO satellites, live Celestrak TLE on mode entry
2. **Deep Space** — 7 planets, on-device Keplerian math
3. **Train** — Starlink chain, live Celestrak TLE + per-second re-propagation
4. **Golden Hour** — USNO solar position, golden hour countdown
5. **Debris** — Space debris, live Celestrak + optional Space-Track auth
6. **Meteor** — 6 shower radiant points, sonar haptic cadence
7. **Chain** — Daily multi-target puzzle, date-seeded
8. **Static** — Ionospheric audio synthesis params + expo-av playback engine
9. **Re-Entry** — Orbital decay tracking, corridor alerts, urgent haptics

### Data services
- `AtmosphereExplorerService.ts` — fleet simulation + live TLE sync
- `StarlinkTrainService.ts` — live Celestrak fetch + per-second SGP4 re-propagation
- `SpaceDebrisService.ts` — live Celestrak debris clouds + optional Space-Track auth
- `ReEntryService.ts` — decay tracking, corridor prediction, double-pulse haptic
- `MeteorShowerService.ts` — 6 showers with real radiant RA/Dec
- `SkyAlignmentChainService.ts` — daily puzzle generator
- `ChronoLightService.ts` — USNO solar position, golden hour windows
- `SolarWindService.ts` — live NOAA Kp index (10-min cache)
- `IonosphericStaticService.ts` — audio synthesis parameter math
- `CosmicDriftService.ts` — lock history persistence (AsyncStorage, 5-event free cap)

### Live TLE pipeline (fully built)
- `src/services/LiveTLEService.ts` — confirmed-working Celestrak endpoints:
  - `celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle`
  - `celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=tle`
  - `celestrak.org/NORAD/elements/gp.php?GROUP=cosmos-1408-debris&FORMAT=tle`
  - Space-Track.org authenticated feed for debris
  - satellite.js SGP4 propagation on-device
  - `repropagateStarlinkToNow()` / `repropagateDebrisToNow()` — per-second refresh from cache (no extra network calls)
  - 2-hour cache, stale-on-failure fallback

### Audio engine (fully built)
- `src/services/IonosphericAudioEngine.ts` — expo-av two-deck crossfader:
  - Deck A plays current phase noise loop, Deck B preloads next
  - 400ms crossfade on phase change
  - Chime layer fires on interval synced to alignment score
  - `setMuted()` toggle
  - Graceful silent fallback if audio MP3 files not yet bundled
- **Audio still needs:** 6 MP3 files per `assets/audio/README.md` (brown noise, pink noise, chimes at 220/440/528 Hz). Generate with Audacity. Then uncomment `require()` lines in the engine.

### Native modules (Swift)
- `apple-native/iOS/AuraLunisHaptics/AuraLunisHapticsModule.swift` — Expo Module, CoreHaptics

### Monetization
- `src/features/paywall/MonetizationCatalog.ts` — three products, `isModeGated()`, feature lists
- `src/features/paywall/ThreeTierPaywallModal.tsx` — three-plan paywall UI (Monthly/Annual/Lifetime)
- `src/hooks/useEntitlement.ts` — RevenueCat entitlement check + AppState refresh
- `src/components/PremiumModeGate.tsx` — inline upgrade card for gated modes
- `src/components/SatelliteDataCard.tsx` — retro data card (tap a radar blip)
- `src/components/CosmicDriftGalaxy.tsx` — rotating SVG particle cloud of lock history

### App Store compliance
- `public/PRIVACY.md` — host at `ocoeestudios.com/auralunis/privacy`
- `public/TERMS.md` — host at `ocoeestudios.com/auralunis/terms`
- `public/APP_STORE_REVIEW_NOTES.md` — paste into App Store Connect review notes
- Simulation Mode built into `OrbitalAlignmentScreen` for static lab testing

---

## What Is NOT Yet Done (valid suggestions welcome here)

| Item | Notes |
|---|---|
| Audio MP3 files | 6 files needed — see `assets/audio/README.md`. Generate with Audacity. |
| Space-Track credentials | Free account at space-track.org. Call `setSpaceTrackCredentials()` in `SpaceDebrisService`. |
| Re-Entry live data | Currently mocked. Wire to Space-Track TIP stream when ready. |
| Xcode native build | Run `npx expo prebuild` on Mac. CoreHaptics module registers automatically. |
| ThreeTierPaywallModal navigation | "Unlock Premium" button in `PremiumModeGate` needs to open the modal — requires navigation context. |
| Quantum Intercept | Needs real-time server — not buildable client-only. Deferred post-launch. |
| iOS 26 Liquid Glass | Spec in `docs/LIQUID_GLASS_IMPLEMENTATION_SPEC.md`. Post-launch. |

---

## Architecture Rules (do not break these)

| Rule | Reason |
|---|---|
| TLE propagation stays in service layer, never in `alignmentEngine.ts` | Engine is pure math — no network/format awareness |
| `SpatialTarget` has no `tleLine1/tleLine2` fields | Propagation output (lat/lon/alt) is what the engine needs |
| Reanimated shared values for radar blips | UI thread only — no JS bridge jank |
| Expo Modules pattern for Swift native code | Matches existing `AuraLunisHapticsModule` pattern, auto-registers |
| AsyncStorage for Cosmic Drift, not encrypted vault | Lock history is celebration data, not sensitive |
| 2h Celestrak cache | TLEs update every few hours — more frequent = battery waste |
| Daily chain seeded from date hash | Same challenge for all users without a server |
| 7-day intro trial on monthly and annual, only when Apple confirms eligibility | Trial is never promised unconditionally; lifetime has no trial |

---

## Key File Locations

```
src/
├── screens/OrbitalAlignmentScreen.tsx   ← 9-mode tracking hub (DO NOT restructure)
├── components/SpaceRadarGrid.tsx        ← radar with horizon scope, multi-blip
├── components/PremiumModeGate.tsx       ← inline paywall card
├── components/CosmicDriftGalaxy.tsx     ← particle galaxy
├── components/SatelliteDataCard.tsx     ← retro blip data card
├── hooks/useEntitlement.ts              ← RevenueCat premium check
├── utils/alignmentEngine.ts             ← pure math (no imports of services)
├── utils/planetaryEphemeris.ts          ← Keplerian planetary positions
├── services/LiveTLEService.ts           ← Celestrak + Space-Track + SGP4
├── services/IonosphericAudioEngine.ts   ← expo-av two-deck crossfader
├── services/CosmicDriftService.ts       ← lock history, 5-event free cap
├── features/paywall/MonetizationCatalog.ts ← pricing, gates, feature lists
├── features/paywall/ThreeTierPaywallModal.tsx ← three-plan paywall UI
└── theme/tokens.ts                      ← AuraLunisColors, AuraLunisPricing

apple-native/
└── iOS/AuraLunisHaptics/AuraLunisHapticsModule.swift

public/
├── PRIVACY.md
├── TERMS.md
└── APP_STORE_REVIEW_NOTES.md

docs/
└── CLAUDE_SESSION_NOTES.md   ← full build history, all decisions
```

---

## Contacts

- Studio: Ocoee Studios
- Support: admin@ocoeestudios.com
- Privacy: manager@ocoeestudios.com
- GitHub personal: `jamiebzzz-stack` / org: `ocoee-studios`
