> ⚠️ Historical document
>
> This file is retained for historical context only. Product, pricing, navigation, entitlement, camera/AR, Watch/watchOS, and architecture details may be obsolete. Use `CLAUDE.md` and the current merged code as the active source of truth.

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
# AuraLunis — Master Handoff for ChatGPT

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


**Updated:** June 22, 2026 (end of massive build session)
**Repo:** `jamiebzzz-stack/Auralunis` (GitHub)
**Local folder:** `~/chronaura` (repo was renamed on GitHub; local kept old name)
**Developer:** Ocoee Studios (Mrs. Pepper, founder, non-technical product owner)
**Contact:** admin@ocoeestudios.com · support@ocoeestudios.com

---

## ⛔ THE RULES

```
DO NOT REPLACE — EXTEND ONLY
```

This codebase is **219 source files and 172 commits** of mature, working code.
Three AI assistants (Claude, Claude Code, Gemini) built it collaboratively.
Never generate fresh replacements of existing components.

```
Do not make it look more realistic. Make it feel more sacred.
```

```
Make it look like a $10,000 celestial instrument from a
civilization thousands of years more advanced than ours.
```

---

## What Is AuraLunis?

A premium iOS astronomy app — "The Interactive Astral Clock." Point your phone at the sky and see gold constellation lines, planet labels, satellite tracks, glowing nebulae, and the Milky Way overlaid on your live camera. Track ISS flyovers, plan astrophotography sessions, discover your Birth Sky, and wear the sky on your Apple Watch.

**Tagline:** "Your Time, Written in the Stars"
**Bundle ID:** `com.ocoee.auralunis`

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native / Expo SDK 54 |
| Language | TypeScript (strict, 0 errors) |
| Navigation | React Navigation (bottom tabs) |
| State | React Context + AsyncStorage |
| Subscriptions | RevenueCat (`auralunis_premium`) |
| Astronomy | astronomy-engine (real ephemeris) |
| Satellites | satellite.js + SGP4 propagation |
| Weather | Open-Meteo API (free, no key) |
| Encryption | tweetnacl (NaCl secretbox for Vault) |
| Animations | react-native-reanimated |
| Fonts | Cinzel (headings) + Playfair Display (body) |

---

## Design System (LOCKED)

| Token | Hex | Usage |
|-------|-----|-------|
| Cosmic Black | `#030816` | Primary background |
| Surface | `#071225` | Cards, elevated surfaces |
| Astral Gold | `#D9A84E` | Primary accent — ALL interactive elements |
| Starlight | `#FFF6D6` | Bright text, star color |
| Silver | `#C0C6D4` | Body text |
| Muted | `#747D90` | Secondary text |

**Gold is the brand.** Every other astronomy app uses blue/white. AuraLunis owns gold.

---

## Pricing (LOCKED)

| Tier | Price | Trial |
|------|-------|-------|
| Monthly | $6.99/mo | No trial |
| Annual | $39.99/yr | 7-day free trial |
| Founders Lifetime | $99.99 | Rises to $129.99 post-launch |

---

## What's Built and Running on Device

### Sky Lens AR (the crown jewel)
Full-screen camera overlay with real sensor tracking:
- Live camera feed with DeviceMotion sensors (heading + altitude HUD)
- **3,500 background stars** across full celestial sphere, magnitude-sized, spectrally colored
- **35 constellations** with gold lines (recently ungated — was blocking 25+ patterns)
- **Zodiac layer** with 12 symbols along ecliptic, "Sun is here" marker, info cards with mythology
- **38 deep sky objects** (nebulae, galaxies, clusters) with multi-layer glowing renders — emission (pink), reflection (blue), planetary (teal ring), galaxy (warm elliptical), cluster (gold sparkle)
- **Milky Way** photographic core texture (ESO/Brunier, gold-tinted) — BUT currently only renders when pointing at Sagittarius (galactic center). Needs fix to show along entire band.
- **Ecliptic line** (path of Sun/Moon/planets)
- **Shooting stars** (random 1-3 per hour)
- **Star twinkle** + diffraction spikes on brightest stars
- **Find Mode:** "Pan ↙ to the Moon" / "Turn around for the Moon"
- **Night Vision Mode** (deep red palette)
- **Tap any object** → info card with name, data, poetic description, "Save to Vault"
- **Planetarium Mode** (camera off, full opacity sky)
- **Layer bar:** Stars · Constellations · Zodiac · Planets · Grid + scrollable premium layers

### Gemini Visual FX Layers (pushed, wiring in progress)
Six premium atmosphere layers built by Gemini, all in `src/features/sky-lens/layers/`:
- **PremiumSkyBloomLayer** — deep bloom + moon halo + horizon glow + MW silk (14s breathing)
- **LuxuryStarfieldFXLayer** — 110 cosmic dust particles + optic glints (9s shimmer)
- **AstralBreathingLayer** — whole-sky 22s radial pulse
- **LunarGodRayLayer** — 18 moon rays + 7× radius grand halo (16s drift)
- **OrbitalGhostTrailsLayer** — Bézier satellite trail memory
- **ConstellationForgeLayer** — gold ink line-drawing + star bloom animation

### Home Screen
- Living starfield background with subtle star dots
- Celestial Dial — animated clock with planets on orbital rings
- **Celestial Mood Engine** — poetic sky descriptions wired in ("A half-moon divides light and shadow...")
- Golden hour countdown, visible bodies list, mode shortcuts

### Other Screens Built
- **Birth Sky** — date/time/location → personal star chart with cosmic signature
- **Astro Weather** — hour-by-hour forecast, GO / MAYBE / STAY IN verdict
- **Photo Planner** — exposure calculator, MW timing, stacking advice
- **Sky Share** — branded observation cards for social
- **Celestial Archive** — deep sky reference sections
- **Fleet Radar** — 9 tracking modes, ISS targeting, redesigned as "window into space"
- **Learn** — real full-screen lessons with Sky Lens deep-linking ("See in Sky Lens" → Find Mode)
- **Settings** — three-tier paywall, Night Vision toggle, Bortle scale picker, legal pages (in-app modal)

### Legal & Compliance (DONE)
- Privacy Policy + Terms of Use hardwired in-app (TermsScreen.tsx, PrivacyScreen.tsx)
- App Store Nutrition Label ready (docs/APP_STORE_NUTRITION_LABEL.md)
- App Store Connect fields answered (docs/APP_STORE_CONNECT_FIELDS.md)
- Privacy manifests in app.json
- Age rating: 4+

---

## Known Issues (from latest audit)

### CRITICAL
1. **Milky Way disappears** when not pointing at Sagittarius — `MilkyWayCoreLayer` returns null when galactic center is behind camera. Procedural `MilkyWayLayer` was gutted. Need a gradient band for the full galactic plane wrap.
2. **Milky Way texture hard edges** — visible vertical stripe boundaries where texture ends

### BUGS
3. Dead `src/features/future/` folder — 7 files for killed features
4. SIM_LOCATION hardcoded to NYC in OrbitalAlignmentScreen
5. Onboarding never triggers — no first-launch check
6. RevenueCat API key is placeholder — verify graceful degradation

### POLISH
7. Constellation rendering — 35 patterns exist, PR #51 ungated them (verify merged)
8. Nebula radii should be 50% larger for more visual impact
9. Hero Moon not built yet (LunarGodRayLayer exists but MoonLayer is basic)

---

## Spec Documents

| Spec | Location | Lines |
|------|----------|-------|
| Sky Lens Architecture | `src/features/sky-lens/SKY_LENS_SPEC.md` | 570 |
| Visual Quality Standards | `src/features/sky-lens/VISUAL_QUALITY_SPEC.md` | 580+ |
| Visual Build Phases | `src/features/sky-lens/VISUAL_BUILD_PHASES.md` | 148 |
| Sacred Sky Brief | `docs/SACRED_SKY_BRIEF.md` | 61 |
| Visual Elevation Build Order | `docs/VISUAL_ELEVATION_BUILD_ORDER.md` | 209 |
| Watch App | `src/features/watch/WATCH_APP_SPEC.md` | 624 |
| App Store Connect | `docs/APP_STORE_CONNECT_FIELDS.md` | 159 |
| Launch Checklist | `docs/LAUNCH_CHECKLIST.md` | 47 |
| Bug/Todo List | `docs/CLAUDE_CODE_TODO.md` | 147 |
| Next Fixes | `docs/NEXT_FIXES.md` | 117 |
| Critical Fixes | `docs/CRITICAL_FIXES.md` | — |
| FX Gate Process | `docs/VISUAL_FX_GATE.md` | — |

---

## Visual FX Build Priority

```
Phase 0: Astral Breathing (±1.5% opacity, 20s sine wave — WIRED)
Phase 1: Premium Night Sky (star twinkle, magnitude, color — DONE)
Phase 2: Celestial Depth (parallax 8 layers — SPECCED, NOT BUILT)
Phase 3: AuraLunis Signature (gold engravings, Saturn rings — SPECCED)
Phase 4: Hero Moon (texture + earthshine + god rays — SPECCED, NOT BUILT)
Phase 5: Living Sky (shooting stars DONE, flares + shimmer SPECCED)
```

---

## Watch App (specced, not built)

624-line spec. 6 screens (Celestial Dial, Tonight's Sky, Star Compass with haptics, Satellite Timeline, Photo Timer, Observation Log). 7 complications. Crown on every screen. HealthKit future integration specced but NOT declared in app.json.

---

## App Name Mapping (CRITICAL)

| App | Repo | Local Folder | What It Is |
|-----|------|-------------|-----------|
| **AuraLunis** | `jamiebzzz-stack/Auralunis` | `~/chronaura` | Astronomy / astral clock (THIS APP) |
| **Dreammmm** | `ocoee-studios/dreammmm` | `~/ocoee/auralunis` | Dream journal (SEPARATE APP) |

---

## Branch Discipline

All visual work goes to `visual/sacred-sky-pass` or `visual/polish-pass`.
PR to main. Test on device before merging. NEVER push directly to main.
One Gemini FX layer already caused a device crash (SVG animation props).
Claude Code audits and fixes before merge.

---

## Build Priority

```
1. Fix Milky Way (shows in all directions, not just Sagittarius)
2. Fix MW texture hard edges
3. Verify constellation ungating (PR #51)
4. Wire + test Gemini FX layers one at a time
5. Hero Moon (LunarGodRayLayer + moon texture)
6. Parallax depth system
7. TestFlight build (needs Apple Developer account)
8. App Store submission
```

---

## Communication Style

Mrs. Pepper communicates in a terse, directive style. Approves with "awesome," flags issues briefly ("it's blah", "that's goofy", "it still doesn't 360"), moves fast between topics. Strong visual design sensibility — pushes hard for premium aesthetics. Runs Claude, Claude Code, Gemini, and ChatGPT simultaneously. Expects coordination via the repo.

**When in doubt: read the repo, check the specs, extend don't replace.**
