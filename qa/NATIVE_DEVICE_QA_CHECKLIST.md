# AuraLunis 1.0.1 Native Device QA Checklist

Tester:
Device:
iOS version:
Build profile:
Build number:
Test date:
Location:

> Current shipping model: **AuraLunis Lifetime — $29.99 one-time**. No subscription, no renewal, no free trial.
> Sky Lens is a sensor-aligned cinematic planetarium; it does **not** use a live camera feed.

## Install and launch
- [ ] App installs successfully
- [ ] AuraLunis launches without a crash
- [ ] App icon and splash screen render correctly
- [ ] Bottom navigation shows Home / Sky / Learn / Vault / Settings
- [ ] Fresh install shows the current app tour exactly once
- [ ] Completing or skipping the tour enters the app normally
- [ ] Relaunch does not replay the tour unexpectedly

## Home
- [ ] Home loads without blocking overlays
- [ ] Celestial Dial renders and time scrub responds
- [ ] Tonight / Stargazing information renders
- [ ] Home shortcuts navigate to Sky
- [ ] Cosmic Notes free-user gate opens the Lifetime paywall
- [ ] Premium user can save a Cosmic Note to the Vault

## Sky hub
- [ ] Open Sky Lens responds
- [ ] Manual Sky Map opens and closes
- [ ] Orbital Alignment opens and closes
- [ ] Celestial Calendar opens and closes
- [ ] Your Birth Sky opens for Premium and gates correctly for Free
- [ ] Astro Weather opens for Premium and gates correctly for Free
- [ ] Photo Planner opens for Premium and gates correctly for Free
- [ ] Share Your Sky opens
- [ ] Celestial Archive opens for Premium and gates correctly for Free
- [ ] All visible Sky cards perform the action their label promises

## Sky Lens — physical iPhone gate
- [ ] Sky follows physical phone motion continuously
- [ ] Heading / altitude readout agrees with the rendered sky
- [ ] Close button responds immediately
- [ ] Lock Sky responds immediately
- [ ] Locked sky can be dragged to explore
- [ ] Unlock returns to live tracking without a broken jump or freeze
- [ ] Pinch-to-zoom responds
- [ ] Zoom reset responds
- [ ] Primary layer pills respond to taps
- [ ] Layers button opens the Layers sheet
- [ ] Layers sheet rows respond without feeling dead or delayed
- [ ] Layers sheet Done button closes the sheet
- [ ] Tapping a visible planet / Moon / bright star opens its info card
- [ ] Info card Close responds
- [ ] Save to Vault gates correctly for Free and saves for Premium
- [ ] Time Travel gates correctly and responds for Premium
- [ ] Night Vision gates correctly and responds for Premium
- [ ] Photo capture/share works for Premium
- [ ] No screen-fixed overlay blocks normal Sky Lens taps
- [ ] No crash while moving the phone rapidly

## Birth Sky
- [ ] Birth date entry works
- [ ] Local birth time entry works in AM/PM flow
- [ ] 24-hour edge cases display correctly where applicable
- [ ] Birthplace lookup works on Wi-Fi
- [ ] Birthplace lookup works on cellular data
- [ ] Planet / constellation information renders
- [ ] Astronomy context and traditional/symbolic astrology remain clearly separated
- [ ] Quick Card share works
- [ ] Full Report share works

## Learn
- [ ] Learn opens without layout regression
- [ ] Solar System Live Orrery renders correctly
- [ ] Moon lesson visual/data renders correctly
- [ ] Stars lesson renders correctly
- [ ] Milky Way lesson renders correctly
- [ ] Deep Sky lesson renders correctly
- [ ] Constellations lesson renders correctly
- [ ] 30 Nights content renders correctly
- [ ] Locked lessons open the Lifetime paywall for Free users
- [ ] See in Sky Lens deep-links to the expected target

## Lifetime purchase / RevenueCat
- [ ] Paywall says AuraLunis Lifetime
- [ ] Paywall shows one purchasable option only
- [ ] Live localized StoreKit price is shown when available
- [ ] Fallback price is $29.99
- [ ] Copy says one-time purchase / no subscription / no recurring charges
- [ ] No free-trial or renewal wording appears
- [ ] Continue Free closes the paywall
- [ ] Terms opens
- [ ] Privacy opens
- [ ] Lifetime purchase completes in Apple sandbox
- [ ] Premium entitlement unlocks immediately after purchase
- [ ] Restore Purchases restores an eligible purchase
- [ ] Restore with no eligible purchase does not falsely claim success
- [ ] Legacy subscriber entitlement remains recognized if available for testing

## Settings
- [ ] AuraLunis Lifetime membership card is correct
- [ ] No retired monthly/annual pricing is offered to new customers
- [ ] Appearance choices respond and persist after relaunch
- [ ] Night Vision setting persists
- [ ] Notification permission is requested only after explicit user action
- [ ] Denied notification permission does not leave Notifications shown as enabled
- [ ] Sky Quality selection persists
- [ ] Compass Calibration Guide opens
- [ ] Manage App Permissions opens iOS Settings
- [ ] Privacy-Safe Sky Map copy matches the actual Open-Meteo location disclosure
- [ ] Learning Preferences opens
- [ ] Replay App Tour works without erasing user data
- [ ] Privacy Policy opens
- [ ] Terms of Use opens
- [ ] Contact Support opens mail composer / mail app

## Vault and local data
- [ ] Existing Vault data loads after relaunch
- [ ] New Vault item persists after force-close and relaunch
- [ ] Duplicate Sky Lens save is handled correctly
- [ ] Clear Vault Data clears only when explicitly tapped
- [ ] No normal launch unexpectedly clears Vault data

## Location / network / sensors
- [ ] Location permission is requested only from an explicit user action
- [ ] Exact-location sky updates after permission is granted
- [ ] Fallback/default-location state is clearly labelled when location is unavailable
- [ ] Weather failure falls back without crashing the app
- [ ] Motion permission text is correct
- [ ] DeviceMotion stream works on physical iPhone
- [ ] Haptics are physically felt where expected

## Notifications
- [ ] Notification permission prompt appears only from Settings toggle
- [ ] Basic sky-event notifications schedule when enabled
- [ ] Premium event reminders are gated correctly
- [ ] Disabling notifications stops future app scheduling behavior as expected

## Accessibility / layout
- [ ] No controls are hidden behind the Dynamic Island / status area
- [ ] No controls are hidden behind the home indicator
- [ ] Bottom tab bar does not overlap full-screen modes
- [ ] Text remains readable with larger Dynamic Type
- [ ] Important controls have sensible accessibility labels
- [ ] No modal or invisible overlay blocks the rest of the app

## Final release gate
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run qa:all` passes
- [ ] Expo Doctor passes at the expected project baseline
- [ ] Final build tested on a physical iPhone
- [ ] Lifetime purchase tested on the final build
- [ ] Restore Purchases tested on the final build
- [ ] Fresh App Store IAP review screenshot captured from the final paywall
- [ ] App Store Connect metadata matches Lifetime-only $29.99 offer
- [ ] PASS for 1.0.1 submission

## Blockers / notes
- [ ] BLOCKED — issue log attached (only check if release cannot proceed)
