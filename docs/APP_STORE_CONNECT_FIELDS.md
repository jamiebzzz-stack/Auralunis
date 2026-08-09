# App Store Connect — All Required Fields

## App Information

| Field | Value | Notes |
|-------|-------|-------|
| **Name** | `AuraLunis` | 9 characters |
| **Subtitle** | `Your Sky. Your Story.` | 21 characters (max 30) |
| **Privacy Policy URL** | `https://ocoeestudios.com/auralunis/privacy` | Must be hosted BEFORE submission |
| **Bundle ID** | `com.ocoeestudios.auralunis` | Set in app.json, cannot change after first upload |
| **SKU** | `OCOEE-AURALUNIS-001` | Internal tracking only, not visible to users |
| **Primary Language** | English (U.S.) | |
| **Primary Category** | Reference | Astronomy reference app |
| **Secondary Category** | Education | Learn about the sky |
| **Age Rating** | 4+ | No objectionable content |
| **Content Rights** | Does not contain third-party content | All original or public domain |
| **Made for Kids** | No | |
| **License Agreement** | Standard Apple EULA | Our additional terms at ocoeestudios.com/auralunis/terms |
| **DSA Trader Status** | Non-trader | Ocoee Studios is a small indie studio, not an EU trader |

## Category Decision

**Primary: Reference** (not Education, not Weather, not Utilities)
- Reference is where Sky Guide, Star Walk, and SkyView are listed
- Users search for astronomy apps in Reference
- Being in the same category means showing up in "Similar Apps"

**Secondary: Education**
- The Learn tab and guided lessons justify this
- Broadens discovery beyond astronomy-specific searches

**Alternate option if Reference feels wrong:**
- Primary: Education
- Secondary: Weather (for Astro Weather forecast feature)

## Subtitle Options (pick one)

1. `Your Sky. Your Story.` — 21 chars ← recommended (matches the in-app descriptor)
2. `Live Sky Map & Star Tracker` — 27 chars (SEO-friendly, more searchable)
3. `AR Sky, Stars & Satellites` — 27 chars (highlights AR + satellites)
4. `Astronomy & Celestial Guide` — 28 chars (broad, professional)

Recommendation: Option 1 for brand identity, or Option 2 if ASO (App Store Optimization) matters more at launch.

## Version Information (per platform)

| Field | Value |
|-------|-------|
| Version | 1.0.0 |
| Build | Set by EAS Build |
| What's New | "Welcome to AuraLunis — your personal window into the night sky." |
| Description | See below |
| Keywords | See below |
| Support URL | `https://ocoeestudios.com/auralunis/support` or `mailto:support@ocoeestudios.com` |
| Marketing URL | `https://ocoeestudios.com/auralunis` (optional) |
| Promotional Text | Can change anytime without review — use for seasonal events |

## App Description (4000 char max)

```
AuraLunis — Your Sky. Your Story.

Your time, written in the stars.

Point your phone at the sky. Watch gold constellation lines trace ancient patterns across your camera. See planets glow with color. Discover nebulae hiding in the Milky Way. Track the International Space Station as it streaks overhead. AuraLunis turns your iPhone into a living celestial instrument.

SKY LENS — AR CAMERA OVERLAY
Toggleable layers on your live camera. Stars with real spectral colors and magnitude sizing. Gold constellation lines that feel like luxury watch engravings. Glowing nebulae in pink, teal, and gold. The Milky Way rendered as a warm golden river. Night Vision mode for real stargazing. Every object tappable — discover names, distances, mythology, and science.

ZODIAC IN THE REAL SKY
Find your zodiac sign in the actual sky. Twelve zodiac constellations with symbols, mythology cards, and current sun position. See which sign the Sun is transiting right now.

CELESTIAL DIAL
A living Celestial Dial. Planets orbit on golden rings. Real-time moon phase. Tonight Score tells you if the sky is worth going outside for. Poetic sky descriptions: not just data — atmosphere.

BIRTH SKY
Enter your birthday. See the exact sky the moment you were born. Your moon phase, sun sign, rising constellation, visible planets, and a personal cosmic signature.

ASTRO WEATHER
Hour-by-hour observing forecast. Cloud cover, atmospheric seeing, transparency. One simple verdict: GO, MAYBE, or STAY IN.

ASTROPHOTOGRAPHY PLANNER
Exposure calculator with 500 Rule and NPF Rule. Milky Way core timing. Tonight's best targets ranked by difficulty. Stacking recommendations.

SATELLITE TRACKING
Nine tracking modes. ISS, Hubble, Starlink trains, space debris, and re-entry alerts. Live orbital radar with haptic proximity feedback.

LEARN
Free astronomy lessons with live visuals. Solar system, moon phases, star life cycles, constellations, deep sky objects. Each lesson links directly to Sky Lens — read about Orion, then see it in your sky.

DEEP SKY OBJECTS
Orion Nebula, Andromeda Galaxy, Pleiades, Lagoon Nebula, Ring Nebula, and more. Each rendered as a glowing cloud of color — not a dot on a map.

PRIVACY FIRST
No account required. No ads. No tracking. Your observations stay on your device in an encrypted vault. We don't sell data. We don't even collect it.

PREMIUM
Free: the Sky Lens planetarium, Tonight Score, Find Mode, Fleet/Deep Space/Golden Hour/Meteor tracking, three starter Learn lessons, and Celestial Calendar browsing.
Lifetime: premium visual treatment and Sky Lens Pro tools, satellite and ecliptic layers, the full Learn curriculum, Birth Sky, Astro Weather, Photo Planner, Celestial Archive, encrypted Vault, full event details and reminders, and everything we build next.

AuraLunis Lifetime — $29.99, one time. No subscription, no recurring charges.

Ocoee Studios · ocoeestudios.com
```

## Keywords (100 char max, comma-separated)

```
astronomy,stars,constellation,sky map,planets,satellite,ISS,moon,AR,stargazing,night sky,telescope
```

(96 characters — leaves 4 chars of room)

## Screenshots Required

| Device | Count | Sizes |
|--------|-------|-------|
| iPhone 6.7" (15 Pro Max) | 3-10 | 1290×2796 |
| iPhone 6.5" (optional) | 0-10 | 1284×2778 |
| iPad 12.9" (if universal) | 0-10 | 2048×2732 |

### Screenshot Strategy (5 screenshots)
1. **Sky Lens AR** — Camera view with gold constellation lines, planet labels (the "whoa" shot)
2. **Celestial Dial** — Home screen with animated clock, planets, tonight score
3. **Fleet Radar** — Satellite tracking with ISS targeted, orbital data
4. **Birth Sky** — Personal star chart with cosmic signature
5. **Astro Weather** — Tonight's forecast with GO verdict

Each screenshot should have:
- App UI at full fidelity
- Short headline text above (e.g., "Point. Discover. Feel the Sky.")
- AuraLunis gold-on-black color scheme
- Device frame optional (Apple allows with or without)

## App Review Notes

Paste the canonical block from **`public/APP_STORE_REVIEW_NOTES.md`** into the
App Review Information → Notes field. It covers Simulation Mode for testing the
sensor-dependent Sky Lens, the sandbox subscription product IDs, and the
no-account-required flow. Summary:

```
AuraLunis is an astronomy app that uses the device camera (Sky Lens),
location (to compute star/planet positions for the observer), and
motion sensors (to determine which direction the phone is pointing).

No account creation is required. No user data is transmitted to our
servers. Purchases are handled by RevenueCat/Apple.

AuraLunis offers a SINGLE in-app purchase: AuraLunis Lifetime, $29.99,
non-consumable, one time. There is no subscription and no free trial, so
nothing renews and there is no trial period to evaluate.

To reach it: open the app, go to Settings > Membership > "View Lifetime", or
tap any premium feature (for example Sky > Your Birth Sky). Either route opens
the same purchase screen. It can be tested with a Sandbox Apple ID.

Legacy note: monthly and annual subscription products still exist in App Store
Connect because existing subscribers retain access through them, but they were
removed from the active RevenueCat offering and are NOT offered to new
purchasers. The app never displays a subscription price.

Sky Lens includes a Simulation Mode for testing without live sensors (see
public review notes).

Contact: admin@ocoeestudios.com
```

## In-App Purchases (configure in ASC)

| Reference Name | Product ID | Type | Price |
|----------------|-----------|------|-------|
| AuraLunis Lifetime | `com.ocoeestudios.auralunis.lifetime` | Non-consumable | $29.99 |

This is the ONLY product offered for sale. It is the only package in the
RevenueCat `default` offering (`$rc_lifetime`).

Entitlement identifier (RevenueCat): `AuraLunis Premium` (exact — space + capitals)
Introductory offer: none. A one-time purchase carries no trial and nothing renews.

LEGACY, NOT FOR SALE — retained in App Store Connect only so existing
subscribers keep access and can manage their own subscriptions. Removed from
the RevenueCat offering; never shown to new purchasers:

| AuraLunis Monthly | `com.ocoeestudios.auralunis.premium.monthly` | Auto-renewable | legacy |
| AuraLunis Annual | `com.ocoeestudios.auralunis.premium.annual` | Auto-renewable | legacy |

Subscription Group: `AuraLunis Premium` (legacy subscribers only)

> The Lifetime product ID is `com.ocoeestudios.auralunis.lifetime` (the old
> `...lifetime.founders` product was deleted in ASC and recreated without the
> suffix). Reference name and display name are both the neutral **"Lifetime"**.
