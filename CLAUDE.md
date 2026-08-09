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
# CLAUDE.md — AuraLunis Project Context

## What this is
AuraLunis is "The Interactive Astral Clock" — a React Native (Expo SDK 54) app
for iOS that tracks the real sky (Sun, Moon, planets, satellites). Its core
experiences are **Sky Lens** (a sensor-aligned, fully-rendered planetarium — NOT
a camera/AR pass-through), a 9-mode orbital tracking radar, an education library
(Learn), a celestial calendar, and an encrypted vault for sky notes.

## Active codebase
This React Native / Expo repo is the source of truth. Do not revive earlier
HTML implementations. HTML files in the repo are visual references only.

## Navigation (locked — do not add tabs)
Home · Sky · Learn · Vault · Settings

There is **no "Watch" tab** and no watch-face feature — remove any such references.

## Pricing (locked — source of truth: `src/features/paywall/MonetizationCatalog.ts`)

⛔ **LIFETIME-ONLY. Do not restore the three-tier paywall.** It was removed
deliberately on 2026-08-09 and reintroducing it is a regression, not a fix.

- **Horizon Free** — always free
- **AuraLunis Lifetime** — **$29.99 one-time**, the ONLY purchasable product

There is NO subscription, nothing renews, and there is NO free trial — a
one-time purchase carries no introductory offer. Any monthly/annual price or
trial wording in the UI is a bug.

**Why this matters:** the monthly and annual packages were removed from the
RevenueCat `default` offering remotely. A plan card whose package is absent
resolves to `not_available` in RevenueCatService, so re-adding those cards
produces a purchase button that silently does nothing — the exact defect this
replaced. If subscriptions are ever reinstated, they must return to the
RevenueCat offering FIRST.

The monthly/annual **product IDs deliberately remain** in `RevenueCatIds`:
existing subscribers still hold the entitlement through them, and
`classifyAuraLunisMembership()` reads those exact IDs to tell an active
subscriber ("Manage Subscription") from a lifetime owner ("Lifetime Access").
Removing them would misclassify every existing subscriber. Do not tidy them away.

Bundle ID: `com.ocoeestudios.auralunis` (Ocoee Studios LLC).

RevenueCat **product IDs** (must match App Store Connect exactly — current source of truth):
- `com.ocoeestudios.auralunis.premium.monthly`
- `com.ocoeestudios.auralunis.premium.annual`
- `com.ocoeestudios.auralunis.lifetime`

RevenueCat **package IDs**: the `default` offering contains **only `$rc_lifetime`**.
`premium_monthly` and `premium_annual` still exist as packages but were REMOVED from the
offering — they resolve to `not_available` if a plan card tries to purchase them.

**Entitlement identifier (exact): `AuraLunis Premium`** — all three products unlock this
single entitlement. Do NOT use the old snake_case string `auralunis_premium`; it is not the
entitlement identifier and must not appear in code or docs.

The paywall (`ThreeTierPaywallModal` — filename kept to avoid churning eight self-tests)
shows exactly ONE option: AuraLunis Lifetime. There is no tier selector and nothing is
"selected by default". It also renders a Free vs Lifetime comparison drawn from the
verified entitlement gates. There is **no "Aura Pro" or
"Sovereign" purchase tier**: the Sovereign tier was removed, and the Aura Pro panels are
premium *features* under `AuraLunis Premium`, not a separate purchasable tier.

## Access model (Free vs Premium) — authoritative, matches the merged gating

FREE (Horizon):
- Tonight Score
- Manual Sky Map
- Find Mode
- Basic Sky Lens planetarium
- Fleet, Deep Space, Golden Hour, and Meteor telemetry modes
- First 5 Cosmic Drift lock events
- Limited starter Learn content (the first 3 lessons)
- Basic Celestial Calendar browsing (event list, names, dates, ratings, descriptions)

PREMIUM (AuraLunis Premium):
- Birth Sky — entire feature
- Photo Planner — entire feature
- Astro Weather
- Event, eclipse, meteor, and conjunction reminders
- Full Sky Lens Pro tools and premium visual layers (night vision, cinematic mode, time
  travel, photo capture, spectral visuals, satellites/ecliptic layers, etc.)
- Train, Debris, Chain, Static, and Re-Entry telemetry modes
- Encrypted Vault — **all read and write entry points** (Home Cosmic Notes, Sky "Save + Find",
  Sky Lens object save, Learn lesson marks)
- Advanced Learn content (every lesson beyond the free starter set)
- Share Your Sky exports and premium sharing (creating/previewing a card is free; the
  export/share action is premium)
- Full Celestial Archive
- Aura Pro Satellite Thermal
- Aura Pro Astrophoto Predictor
- Advanced Celestial Calendar details (best time, where to look, moon interference) and alerts

## Feature gate mechanics (locked)
- Premium telemetry modes: `PREMIUM_TRACKING_MODES` = train, debris, reentry, chain, static
  (free: fleet, deep space, golden hour, meteor). Gate helper: `isModeGated()` in
  `src/features/paywall/MonetizationCatalog.ts`.
- Cosmic Drift: `FREE_DRIFT_EVENT_LIMIT = 5` free lock events; unlimited with Premium.
- Entitlement check: **`useEntitlement()`** in `src/hooks/useEntitlement.ts` — the SHARED single
  source of truth (backed by `EntitlementContext`, mounted once at the app root, fails closed to
  non-premium). Every premium check MUST read `useEntitlement().isPremium`; never hardcode an
  entitlement string or infer premium status any other way.
- Paywall is opened via `usePaywallNavigation().openPaywall()`.

## Required gating pattern (follow for every premium feature)
1. **Gate the visible entry point** — e.g. a Sky FeatureCard onPress:
   `if (!isPremium) { openPaywall(); return; }` before opening the feature.
2. **Add a screen-level or capability-level entitlement guard** as defense-in-depth, so the
   feature is unreachable even if entered by another path (the screen early-returns a premium
   preview/gate; inline panels self-gate; per-action guards cover capabilities like export/save).
3. **Non-entitled actions open the EXISTING paywall** (`openPaywall()`) — never a bespoke one.
4. **Entitled users continue normally** — no behavior change for premium users.
5. **Freemium features gate ONLY their approved premium capabilities.** Calendar keeps basic
   browsing free and gates the advanced detail chips; Learn keeps the starter lessons free and
   gates advanced ones; Share keeps card creation free and gates export. Never paywall the free tier.

Each gated feature has a deterministic self-test at `scripts/*-gate-selftest.js`, wired into
`npm run qa:all` (e.g. `qa:birthsky`, `qa:photo-planner`, `qa:astro-weather`, `qa:reminders`,
`qa:archive`, `qa:telemetry-modes`, `qa:aura-pro-panels`, `qa:vault`, `qa:vault-write`, `qa:share`,
`qa:calendar`, `qa:learn`). Self-tests assert the canonical entitlement string, never a literal.

## Before coding: run
```bash
npm install
npx expo install --fix
npm run typecheck   # tsc --noEmit
npm run qa:all      # full test suite (includes the premium-gate self-tests)
```

## QA suite
- `npm run qa:all` — the full chain: static/sky/whole app checks, RevenueCat + Aura Pro preflights,
  regression guards, ephemeris/satellite/sky-lens self-tests, and every premium-gate self-test.
- `npm run qa:fresh-bugs` — 100+ regression guards
- `tsc --noEmit` — must be 0 errors

## Key architecture
- `astronomy-engine` — real ephemeris (Sun/Moon/planets)
- `satellite.js` — SGP4 orbital propagation
- `tweetnacl` — NaCl secretbox vault encryption
- `expo-sensors` — magnetometer + accelerometer for sensor-aligned pointing
- `react-native-purchases` — RevenueCat subscriptions
- `react-native-reanimated` — UI-thread animations for radar blips
- `react-native-svg` — SVG radar scope, rendered sky
- `expo-av` — audio engine
- `expo-notifications` — sunset/moonrise alerts (basic, free) + premium celestial-event reminders

## Do NOT enable until genuinely ready
- Vision Pro / spatial experiences
- Community features
- Hardware checkout flows

(There is no separate Aura Pro / Sovereign *purchase* tier to enable — those tiers do not exist;
the Aura Pro panels ship as premium features under `AuraLunis Premium`.)

## Key file map
- `docs/CLAUDE_SESSION_NOTES.md` — full build history, all decisions
- `GEMINI_HANDOFF.md` — orientation for external AI agents
- `src/features/paywall/MonetizationCatalog.ts` — pricing, product IDs, entitlement, gates, features
- `src/features/paywall/ThreeTierPaywallModal.tsx` — the three-plan paywall UI
- `src/context/EntitlementContext.tsx` — shared entitlement provider (single source of truth)
- `src/hooks/useEntitlement.ts` — `useEntitlement()` consumer hook
- `src/context/PaywallNavigationContext.tsx` — `usePaywallNavigation().openPaywall()`
- `src/screens/OrbitalAlignmentScreen.tsx` — 9-mode tracking hub
- `src/screens/SkyScreen.tsx` — Sky tab (Sky Lens + gated feature cards)
- `src/theme/tokens.ts` — AuraLunisColors

## Contact
- admin@ocoeestudios.com
- manager@ocoeestudios.com

## GitHub
`ocoee-studios/Auralunis` (private)
