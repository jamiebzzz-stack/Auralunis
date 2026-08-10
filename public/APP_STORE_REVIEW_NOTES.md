# App Store Review Notes — AuraLunis

> Paste the block below verbatim into the **App Review Information → Notes** field in App Store Connect before submitting.

---

## Notes for App Reviewer

AuraLunis is an astronomy companion app that computes real-time positions of celestial objects and orbital targets (ISS, planets, Moon) relative to the reviewer's physical location using on-device GPS and motion sensors.

**Testing in a static review environment:**

1. On first launch, the app will request Location Services and Motion sensor permissions. Please grant both.

2. The **Orbital Alignment** screen (Sky tab → "Open Alignment") is the primary sensor-dependent feature. Because it relies on live GPS and device orientation, it includes a built-in **Simulation Mode** for testing in a static lab environment.

3. To activate Simulation Mode: on the "Acquiring telemetry…" loading screen, tap **"Enable Simulation Mode"**. This injects synthetic GPS coordinates and a slowly rotating orientation stream so that the 2D radar scope, alignment score, and proximity haptics can all be evaluated without physical movement or outdoor GPS signal.

4. All other tabs are fully functional without sensor access.

**Purchase testing:**
- New customers are offered **AuraLunis Lifetime** only: `com.ocoeestudios.auralunis.lifetime`, a non-consumable one-time purchase. The U.S. storefront price is $29.99; localized StoreKit pricing is displayed in-app. Lifetime has no trial and no recurring charge.
- Existing legacy Monthly (`com.ocoeestudios.auralunis.premium.monthly`) and Annual (`com.ocoeestudios.auralunis.premium.annual`) subscribers continue to retain access, restore purchases, and manage their existing subscriptions. These legacy subscription products are not presented as selectable new-customer purchases in the app.
- Lifetime and eligible legacy subscription purchases unlock the single RevenueCat entitlement `AuraLunis Premium`.
- Restore Purchases remains available for customers with prior eligible purchases.

**Demo credentials:** None required — the app does not use email/password sign-in.
