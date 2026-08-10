# AuraLunis — Final Sandbox + Device Test Script

> ⚠️ **HISTORICAL — pricing and offer details below are superseded.**
>
> AuraLunis is **Lifetime-only: $29.99 one-time**, as of 2026-08-09 — no
> subscription, no renewal, no free trial. This document is kept as a record of
> the retired three-tier model and is not a description of the shipping app.
>
> Source of truth: `src/features/paywall/MonetizationCatalog.ts` and `CLAUDE.md`.



Run this once before App Store submission. Everything here is **sandbox-only / physical-device**
work that the simulator cannot exercise (fresh sim installs always return trial-ELIGIBLE and never
hit real StoreKit). App state at time of writing: `main` @ `6180de8`, premium gating + paywall
hardening + trial-wording docs all merged.

**Facts to check against (do not change — these are the shipped values):**
- Products: `com.ocoeestudios.auralunis.premium.monthly` ($9.99/mo), `…premium.annual` ($49.99/yr), `…lifetime` ($29.99 one-time)
- Packages: `premium_monthly`, `premium_annual`, `$rc_lifetime`
- Entitlement (exact): `AuraLunis Premium`
- Trial: 7-day intro on monthly + annual, **eligible customers only** (Apple-determined); **lifetime never has a trial**

---

## Part 0 — Setup (once)

- [ ] Mac with Xcode + a physical iPhone (real device required for StoreKit + sensors)
- [ ] App Store Connect access for Ocoee Studios LLC
- [ ] **Create ≥ 2 sandbox test accounts:** App Store Connect → **Users and Access → Sandbox → Test Accounts → +**
  - Use plus-addressed emails you control, e.g. `jamiebzzz+sbx1@gmail.com`, `+sbx2` (they don't need to be real inboxes; note the passwords)
  - Set both to a **US** store (matches the $ pricing tiers)
  - **Account A = "fresh eligible"** (never used for a purchase), **Account B = "will become ineligible"**
- [ ] Confirm the three IAPs exist in App Store Connect with a **7-day Introductory Offer (Free)** configured on monthly + annual, **none** on lifetime; all in subscription group `AuraLunis Premium`; status "Ready to Submit" / approved for sandbox
- [ ] **Install the build on the device** — TestFlight is cleanest (`Product → Archive → distribute to TestFlight`), or `npx expo run:ios --configuration Release --device "<your-iPhone>"`
- [ ] **Sign into sandbox on the device:** Settings → **App Store** → scroll to **Sandbox Account** → sign in as **Account A**. (Do NOT sign out of your real Apple ID; sandbox is separate.)

> **Sandbox renewal is accelerated** — a 7-day trial ≈ **3 min**, "monthly" ≈ 5 min, "annual" ≈ 1 hr.
> Useful for watching trial→paid conversion without waiting real days.

**How to reset a tester between runs:** App Store Connect → Sandbox → the tester → **Clear Purchase History**
(or **Edit → Renewal Rate**). Clearing history makes that account trial-**eligible** again.

---

## Part 1 — Sandbox purchase flow (Account A, fresh/eligible)

Fresh install → open app → complete/**Skip** onboarding → Settings → **View Memberships** (opens the paywall).

### 1a. Annual (default selection)
- [ ] Paywall heading: **"Start your 7-day free trial"**
- [ ] Annual row selected by default: "AuraLunis Premium · 7 days free, then $49.99/year · $49.99/year · Most Popular"
- [ ] CTA: **"Start 7-Day Free Trial"** with sub-line **"7 days free, then $49.99/year"**
- [ ] Tap CTA → Apple sandbox sheet appears, shows **$49.99/year** with the **7-day free trial** line and **[Environment: Sandbox]**
- [ ] Authenticate → success → paywall dismisses → premium unlocks
- [ ] Verify entitlement live: open a **premium** feature (e.g. **Birth Sky** on Home, or **Photo Planner**) → it opens instead of re-showing the paywall
- [ ] Settings → Subscription card now shows an **active/manage** state (not "View Memberships")

### 1b. Restore Purchases
- [ ] Delete + reinstall the app (or sign the app out/in) to drop local state
- [ ] Settings → **Restore Purchases** (also present in the paywall footer) → success → premium re-unlocks
- [ ] Truthfulness check: Restore with **no** purchase (use fresh Account C or a cleared account) → message is **"No active AuraLunis purchase was found"**, NOT a false success and NOT a "not configured" error

### 1c. Monthly
- [ ] Reset: clear Account A's purchase history (or use a fresh eligible account) → reinstall
- [ ] Paywall → tap the **Monthly** row → CTA sub-line switches to **"7 days free, then $9.99/month"**
- [ ] Purchase → sandbox sheet shows **$9.99/month** + 7-day free trial → success → premium unlocks

### 1d. Lifetime (never a trial)
- [ ] Paywall → tap the **Lifetime** row
- [ ] Heading changes to **"Unlock the Living Universe"** (no trial wording)
- [ ] CTA: **"Unlock Lifetime"** with sub-line **"One-time purchase · $29.99"**; the renewal/trial disclosure **disappears**
- [ ] Purchase → sandbox sheet shows **$29.99 one-time** (no trial line) → success → premium unlocks permanently

### 1e. Purchase edge cases
- [ ] **Cancel** the Apple sheet mid-purchase → paywall stays, no unlock, no crash, no error toast that implies failure-of-config
- [ ] **Interrupted / declined** (use sandbox "decline") → app recovers, premium stays locked

---

## Part 2 — Trial eligibility: eligible vs ineligible

The app gates trial copy on `checkTrialOrIntroductoryPriceEligibility`. Verify **both** states on a real device.

### 2a. Eligible (Account A, fresh, before any purchase)
- [ ] Fresh install + fresh/cleared eligible account → open paywall
- [ ] Monthly and Annual both show **"7 days free, then $X"** and CTA **"Start 7-Day Free Trial"**
- [ ] Lifetime shows **no** trial wording

### 2b. Ineligible (an account that already consumed the intro offer)
Make an account ineligible one of two ways:
  - Use **Account B** after it has already redeemed the monthly or annual intro offer once in this group (do a trial purchase, then let it lapse / cancel in sandbox), **or**
  - Any account whose purchase history you did **not** clear after a prior trial run.
- [ ] Reinstall, sign in as the **ineligible** account, open paywall
- [ ] Heading is **"Unlock the Living Universe"** (no trial promise), NOT "Start your 7-day free trial"
- [ ] Monthly CTA: **"Subscribe Monthly"**, supporting line **"$9.99 per month"** — **no** "free"/"trial"/"7-day" anywhere
- [ ] Annual CTA: **"Subscribe Annually"**, supporting line **"$49.99 per year"** — no trial wording
- [ ] Lifetime unchanged: **"Unlock Lifetime" / "One-time purchase · $29.99"**
- [ ] Purchasing as ineligible charges the **standard price immediately** (sandbox sheet shows no free-trial line)

### 2c. Loading / offline resilience
- [ ] Turn on Airplane Mode, open the paywall cold → it must **fail closed**: no trial promise while offers are unresolved (paid CTA, standard price), never a trial the store hasn't confirmed
- [ ] Restore connectivity → eligible account resolves back to trial copy

> This eligible-vs-ineligible pair is the one thing the simulator can't prove (it always returns
> ELIGIBLE). The deterministic `qa:paywall-copy` suite already covers all 20 copy states in code;
> Part 2 confirms the **live StoreKit** signal drives them correctly on device.

---

## Part 3 — Physical-device sensors, permissions, performance

### 3a. Compass / motion (Sky Lens is sensor-aligned, not AR)
- [ ] Sky tab → **Open Sky Lens** → grant motion access → rotate/tilt the phone: the rendered sky tracks device orientation smoothly
- [ ] Calibrate if prompted (figure-8); heading feels correct vs. real cardinal directions
- [ ] **Orbital Alignment** radar responds to pointing the device at the sky
- [ ] No "point your phone at the sky" **camera** pass-through — it's a rendered planetarium (confirm no camera permission is requested)

### 3b. Location permission
- [ ] First location use prompts the OS dialog; **Allow While Using** → "Tonight's Sky · Live" positions populate for your real location (Sun/Moon az/alt look plausible)
- [ ] Deny path: deny location → app degrades gracefully (manual location / no crash), and offers a way to re-enable
- [ ] Change in iOS Settings → app reflects the new permission on next foreground

### 3c. Notification permission
- [ ] Trigger a notifications opt-in (Settings in-app, or a reminder feature) → OS dialog appears
- [ ] Allow → a basic sunset/event reminder can be scheduled; Deny → no crash, feature reflects denied state
- [ ] (Premium celestial-event reminders are gated — confirm they open the paywall when not premium)

### 3d. Performance / polish
- [ ] Cold launch < ~3s to first interactive screen
- [ ] Sky Lens rendering + radar animations stay smooth (no obvious jank/stutter)
- [ ] No memory-pressure crash after ~10 min of active use (Sky Lens + tab switching)
- [ ] All five tabs load without flicker: **Home · Sky · Learn · Vault · Settings**
- [ ] Vault write paths (Cosmic Notes, Save+Find, lesson marks) prompt the paywall when non-premium; work when premium
- [ ] Rotate through 2–3 device sizes if available; layout stays intact (already looked good in sim)

---

## Part 4 — Result log & go/no-go

| Area | Result | Notes |
|---|---|---|
| 1a Annual purchase | ☐ pass / ☐ fail | |
| 1b Restore (+ truthful no-purchase) | ☐ / ☐ | |
| 1c Monthly purchase | ☐ / ☐ | |
| 1d Lifetime purchase (no trial) | ☐ / ☐ | |
| 1e Cancel / decline recovery | ☐ / ☐ | |
| 2a Eligible → trial copy | ☐ / ☐ | |
| 2b Ineligible → standard-price copy | ☐ / ☐ | |
| 2c Offline fail-closed | ☐ / ☐ | |
| 3a Compass / motion | ☐ / ☐ | |
| 3b Location permission | ☐ / ☐ | |
| 3c Notification permission | ☐ / ☐ | |
| 3d Performance / tabs / vault | ☐ / ☐ | |

**Submit when:** every Part 1 & 2 row passes (money + truthful trial copy are the App Review risk
areas) and Part 3 shows no crash/permission regressions.

**Before hitting Submit in App Store Connect, re-confirm the review-facing text now matches behavior**
(merged in #202): review notes + Terms say monthly/annual *may* include a 7-day trial for eligible
customers, ineligible customers see standard pricing, lifetime has no trial. Paste a sandbox test
account into **App Review Information** so Apple's reviewer can reproduce the purchase.
