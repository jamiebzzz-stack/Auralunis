// First Light INTEGRATION guards.
//
// The behaviour of the tutorial is tested against the real modules in
// scripts/first-light-selftest.js. This file guards the things that are properties of the
// WIRING rather than of a function.
//
// THE BIG ONE: there is now exactly ONE app tour, and it is not here. It lives in
// features/onboarding/OnboardingFlow and is asserted in scripts/onboarding-route-selftest.js.
// The entire First Light tour surface is deleted; what remains in this feature folder is
// contextual tips. Section 1 proves that structurally — by the absence of the modules and call
// sites that used to create a second tutorial — because "no second walkthrough can appear" is a
// claim about what is NOT wired up, which a source-level guard can prove and a behaviour test
// cannot.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
let pass = 0;
let fail = 0;
const ok = (m) => { pass += 1; console.log("PASS " + m); };
const bad = (m) => { fail += 1; console.log("FAIL " + m); };
const check = (name, condition, detail) => (condition ? ok(name) : bad(`${name}${detail ? " — " + detail : ""}`));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const has = (haystack, needle, name) => check(name, haystack.includes(needle), `expected present: ${needle}`);
const hasnt = (haystack, needle, name) => check(name, !haystack.includes(needle), `should be absent: ${needle}`);

const skyLens = read("src/features/sky-lens/SkyLensScreen.tsx");
const overlay = read("src/features/tour/TourOverlay.tsx");
const registry = read("src/features/tour/TourTargetRegistry.tsx");
const tipHost = read("src/features/first-light/ContextualTipHost.tsx");
const context = read("src/features/first-light/FirstLightContext.tsx");
const tourTargets = read("src/features/tour/tourTargets.ts");
const analytics = read("src/services/AnalyticsService.ts");
const app = read("App.tsx");
const settings = read("src/screens/SettingsScreen.tsx");
const skyScreen = read("src/screens/SkyScreen.tsx");
const infoCard = read("src/features/sky-lens/SkyLensInfoCard.tsx");
const geometrySource = read("src/features/tour/tourGeometry.ts");
const machineSource = read("src/features/tour/tourMachine.ts");
const rulesSource = read("src/features/first-light/firstLightRules.ts");

// Every file the tutorial itself is made of. Nothing outside this set may be required for a
// screen to advance.
const TUTORIAL_SOURCES = [
  ["FirstLightContext", context],
  ["ContextualTipHost", tipHost],
];

console.log("── 1. The First Light tour is gone; only contextual tips remain ──");

// AuraLunis shipped two tutorials: the onboarding slides, and then a First Light tour that
// offered itself the moment they closed. There is now exactly ONE app tour
// (features/onboarding/OnboardingFlow, asserted in scripts/onboarding-route-selftest.js), and
// the entire First Light tour surface has been deleted. A deleted module cannot be re-mounted
// by accident, which is the strongest available proof that no second tutorial can appear.
for (const rel of [
  "src/features/first-light/FirstLightSkyLens.tsx",
  "src/features/first-light/firstLightTargets.ts",
  "src/features/first-light/firstLightSpotlight.ts",
  "src/features/first-light/firstLightSteps.ts",
  "src/features/first-light/FirstLightRootOverlay.tsx",
]) {
  check(`${rel} no longer exists`, !exists(rel), "the second tutorial must be removed");
}

// What is left of FirstLightContext is tip state only — no machine, no steps, no offer.
for (const gone of [
  "tourReducer", "buildFirstLightSteps", "beginTour", "resumeTour", "restartTour",
  "pauseTour", "declineOffer", "satisfy", "shouldOfferFirstLight", "reportCapabilities",
]) {
  hasnt(context, gone, `the tour machinery (${gone}) is gone from the context`);
}
has(context, "recordTipSeen", "contextual tips keep their state");
has(context, "recordTipDismissed", "…including dismissal");
check(
  "the context can never report a tour screen as showing",
  /overlayVisible: false/.test(context) && /offerVisible: false/.test(context),
  "a tour surface must be structurally impossible"
);
hasnt(app, "FirstLightRootOverlay", "no second tutorial is mounted at the app root");
hasnt(app, "FirstLightCapabilityBridge", "the tour's capability bridge is gone");
hasnt(skyScreen, "pauseTour", "closing Sky Lens no longer pauses a tour");
hasnt(skyScreen, "resumeTour", "…and the Sky tab offers no resume card");
// Comment-stripped: the guard is about user-facing copy, and Settings' own comment explains
// which labels were removed.
const settingsCode = settings.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
hasnt(settingsCode, "Replay First Light", "Settings offers no second replay");
hasnt(settingsCode, "Replay Tutorial", "…nor the old label");
has(settingsCode, "Replay App Tour", "Settings offers exactly one replay, the app tour");

console.log("\n── 2. No overlay can swallow a tap or be left behind ──");
has(overlay, 'if (!visible) return null;', "the tour overlay renders nothing at all when hidden");
has(overlay, '<View style={StyleSheet.absoluteFill} pointerEvents="box-none">', "the overlay root is box-none");
has(tipHost, 'pointerEvents="box-none"', "a contextual tip never blocks the sky around it");
has(tipHost, "if (!firstLight || !tipId) return null;", "a tip with nothing to show renders nothing");

console.log("\n── 3. Sky Lens release invariants are untouched ──");
has(skyLens, "onPress={() => { tapLight(); skyOrientation.toggleLock(); }}", "Lock Sky still toggles the existing lock");
has(skyLens, "skyOrientationRef.current.applyDrag(dx, dy)", "drag-to-pan is unchanged");
has(skyLens, ".minDistance(DRAG_ACTIVATION_POINTS)", "drag activation distance is unchanged");
has(skyLens, "Gesture.Simultaneous(pinch, skyDrag, cinematicTap, objectTap)", "gesture arbitration is unchanged");
has(skyLens, "? projectTargetWithBasis(basis, az, alt, fov, box)", "object hit testing still uses the rendered basis");
has(skyLens, "horizontalDegrees: DEFAULT_FOV.horizontalDegrees / zoom", "the FOV derivation is unchanged");
has(skyLens, "verticalDegrees: DEFAULT_FOV.verticalDegrees / zoom", "the vertical FOV derivation is unchanged");
has(skyLens, "cameraBasisFromQuaternion(", "the camera basis still comes from the quaternion");
has(skyLens, "const PLANET_HIT = 80;", "planet hit radius is unchanged");
has(skyLens, "const STAR_HIT = 50;", "star hit radius is unchanged");
check(
  "the label-avoidance chrome list gained no tutorial entry",
  /visible:\s*\{\s*shutter:[^}]*finder:[^}]*zoomChip:[^}]*\}/s.test(skyLens),
  "chromeAvoidRects must still describe exactly shutter/finder/zoomChip"
);
hasnt(skyLens, "labelPriority", "no label priority was introduced");

// The orientation, projection, label-placement, and constellation modules must not mention the
// tutorial at all — the cheapest possible proof that the feature did not reach into them.
for (const rel of [
  "src/features/sky-lens/ar/useSkyOrientation.ts",
  "src/features/sky-lens/ar/SkyLensProjection.ts",
  "src/features/sky-lens/ar/orientationQuaternion.ts",
  "src/features/sky-lens/ar/useQuaternionPointing.ts",
  "src/features/sky-lens/labelLayout.ts",
  "src/features/sky-lens/layers/ConstellationLayer.tsx",
  "src/features/sky-lens/data/constellationLines.ts",
  "src/features/sky-lens/SkyLensCanvas.tsx",
  "src/services/VaultEncryption.ts",
  "src/state/AuraLunisVaultContext.tsx",
  "src/features/paywall/MonetizationCatalog.ts",
]) {
  const source = read(rel);
  check(
    `${rel} is untouched by First Light`,
    !/first-light|firstLight|FirstLight|useTourTarget/.test(source),
    "the tutorial must not reach into this module"
  );
}

console.log("\n── 4. Premium gating: not bypassed, not duplicated, not in the tutorial ──");
has(skyLens, "if (!isPremium) { openPaywall(); return; }", "the existing premium gates are still in place");
check(
  "Sky Lens still gates the Vault save on entitlement",
  /Saving to the \(premium\) Vault requires entitlement[\s\S]{0,700}if \(!isPremium\) \{ openPaywall\(\); return; \}/.test(skyLens),
  "the save gate must be unchanged"
);
check(
  "Sky Lens still gates time travel on entitlement",
  /Time Travel[\s\S]{0,240}if \(!isPremium\) \{ openPaywall\(\); return; \}/.test(skyLens),
  "the time-travel gate must be unchanged"
);
for (const [name, source] of [...TUTORIAL_SOURCES, ["ContextualTipHost", tipHost]]) {
  hasnt(source, "AuraLunis Premium", `${name} never hardcodes the entitlement identifier`);
  hasnt(source, "revenuecat", `${name} never touches RevenueCat`);
  hasnt(source, "Purchases.", `${name} never calls the purchase SDK`);
}
check(
  "the tutorial can never open the paywall",
  TUTORIAL_SOURCES.every(([, source]) => !source.includes("openPaywall")),
  "no screen may present a purchase"
);
check(
  "the tutorial never writes to the Vault",
  TUTORIAL_SOURCES.every(([, source]) => !/addItem|useAuraLunisVault/.test(source)),
  "no screen may create an entry"
);

console.log("\n── 5. Analytics: existing local infrastructure only ──");
for (const name of [
  "first_light_started",
  "first_light_step_completed",
  "first_light_skipped",
  "first_light_completed",
  "first_light_replayed",
  "contextual_tip_seen",
  "contextual_tip_dismissed",
]) {
  has(analytics, `"${name}"`, `event ${name} is defined`);
}
hasnt(analytics, "fetch(", "no analytics event is transmitted anywhere");
hasnt(analytics, "axios", "no HTTP client was added");
hasnt(analytics, "mixpanel", "no third-party analytics provider was added");
hasnt(analytics, "firebase", "no third-party analytics provider was added");
has(analytics, "ALLOWED_TUTORIAL_EVENT_PROPERTIES", "tutorial event properties are allow-listed");
check(
  "the allow-list carries no location, orientation, or Vault content",
  !/latitude|longitude|azimuth|altitude|quaternion|note|detail|vault/i.test(
    analytics.slice(analytics.indexOf("ALLOWED_TUTORIAL_EVENT_PROPERTIES"), analytics.indexOf("const TUTORIAL_EVENT_LOG_KEY"))
  ),
  "sensitive fields must not be loggable"
);
check(
  "an analytics failure cannot block the tour",
  /trackTutorialEvent[\s\S]*?catch \{[\s\S]*?Analytics must never break the tutorial/.test(analytics),
  "the write must be wrapped in try/catch"
);
// The tour events remain DEFINED (the allow-list and log are shared infrastructure) but the
// retired tour no longer emits them. Contextual tips still do.
has(context, 'trackTutorialEvent("contextual_tip_seen"', "a seen tip is recorded");
has(context, 'trackTutorialEvent("contextual_tip_dismissed"', "a dismissed tip is recorded");

console.log("\n── 6. Accessibility ──");
check("Back has an accessibility label", /accessibilityLabel="Go back to the previous step"/.test(overlay));
check("Skip has an accessibility label", /accessibilityLabel="Skip the tour"/.test(overlay));
check("Continue carries its label and disabled state", /accessibilityLabel=\{continueLabel\}/.test(overlay) && /accessibilityState=\{\{ disabled: !canContinue \}\}/.test(overlay));
has(overlay, 'accessibilityRole="header"', "the step heading is a header for VoiceOver");
has(overlay, "AccessibilityInfo.announceForAccessibility", "each step is announced");
has(overlay, "AccessibilityInfo.setAccessibilityFocus", "focus moves to the instruction card");
check(
  "the announcement effect is keyed on the step, so it fires once per step",
  /\}, \[visible, stepId, heading, copy, index, total\]\);/.test(overlay)
);
hasnt(overlay, "accessibilityViewIsModal", "the card must NOT trap VoiceOver");
check(
  "grouping is on the instruction TEXT, not the whole card",
  /<View\s*\n\s*ref=\{cardRef\}\s*\n\s*accessible\s*\n\s*accessibilityLabel=/.test(overlay),
  "a card-level `accessible` would make Back / Skip / Continue unreachable"
);
has(overlay, "Step {index + 1} of {total}", "progress is stated in words, not only in colour");
has(overlay, "accessibilityElementsHidden", "decorative dimming is hidden from screen readers");
check("controls meet a 44pt minimum", (overlay.match(/minHeight: 44/g) || []).length >= 2);
has(overlay, "ScrollView", "the copy area scrolls");
for (const [name, source] of [
  ["TourOverlay", overlay],
  ["ContextualTipHost", tipHost],
]) {
  has(source, "useReducedMotion", `${name} respects Reduce Motion`);
}
check(
  "Reduce Motion short-circuits the overlay animation entirely",
  /if \(reduceMotion\) \{\s*\n\s*fade\.setValue\(1\);\s*\n\s*return;/.test(overlay)
);
has(tipHost, "accessibilityLabel={`Dismiss tip:", "the tip's dismiss control is labelled");
has(overlay, "useSafeAreaInsets", "the tutorial card respects the safe area");

console.log("\n── 7. Listeners, timers, and layout survive interruption ──");
has(overlay, "return () => subscription.remove();", "the AppState listener is removed");
has(registry, "return () => subscription.remove();", "the Dimensions listener is removed");
has(registry, "clearTimeout(timer)", "the measure timeout is always cleared");
has(registry, "MEASURE_TIMEOUT_MS", "a native measure that never calls back cannot hang the overlay");
has(overlay, "return () => animation.stop();", "the entrance animation is stopped on unmount");
has(overlay, "cancelled = true;", "a measurement resolving after unmount is discarded");
has(context, "active = false;", "hydration resolving after unmount is discarded");
// No timer of any kind remains in the tutorial: the bounded object-step fallback existed only
// because a step could be blocked, and no step can be blocked any more.
check(
  "no tour timer survives in the context",
  !/setTimeout|setInterval/.test(context),
  "the retired tour's refresh interval and fallback countdown must both be gone"
);
has(registry, "registerTarget?.(key, null);", "targets unregister when their host unmounts");
hasnt(overlay, "Dimensions.get(", "no screen size is captured once at module load");

console.log("\n── 8. State updates are StrictMode-safe ──");
has(machineSource, "export function tourReducer", "the reusable tour machine is still a pure reducer");
function updaterBodies(source) {
  const bodies = [];
  const opener = /set[A-Z]\w*\(\([^)]*\)\s*=>\s*\{/g;
  let match;
  while ((match = opener.exec(source)) !== null) {
    let depth = 1;
    let i = opener.lastIndex;
    while (i < source.length && depth > 0) {
      if (source[i] === "{") depth += 1;
      else if (source[i] === "}") depth -= 1;
      i += 1;
    }
    bodies.push(source.slice(opener.lastIndex, i - 1));
  }
  return bodies;
}
const nestedSetters = updaterBodies(context).filter((body) => /\bset[A-Z]\w*\(/.test(body));
check(
  "no setter is called from inside another setter's updater",
  nestedSetters.length === 0,
  `${nestedSetters.length} updater(s) call another setter`
);
// The context now has only simple setters (no `set…((prev) => { … })` block updaters), so the
// scan legitimately finds none. Assert the scanner works against a source that DOES have one.
check(
  "the nested-setter scan is exercised against a real updater",
  updaterBodies(read("src/features/tour/TourTargetRegistry.tsx")).length >= 1
);
has(machineSource, "export function reanchorIndex", "the reusable re-anchor helper is retained");

console.log("\n── 9. Wiring ──");
has(app, "<TourTargetProvider>", "the tour target registry is mounted at the app root");
has(app, "<FirstLightProvider enabled={route === \"app\"}>", "First Light is only enabled once the app proper is on screen");
has(app, "<OnboardingFlow", "the ONE app tour is mounted at the root");
check(
  "the tutorial no longer navigates the user anywhere",
  !/FirstLightRootOverlay|onEnterSky/.test(app),
  "informational screens have no reason to move the user to another tab"
);
has(settings, "onPress={replayTutorial}", "the single replay action is wired");
has(skyLens, "<ContextualTipHost", "Sky Lens hosts the contextual tips");
// The registry keys stay wired as reusable infrastructure even though no screen measures them.
has(skyLens, "useTourTarget(TOUR_TARGETS.lockSky)", "the real Lock Sky chip is still registered as a reusable target");
has(skyLens, "useTourTarget(TOUR_TARGETS.timeTravel)", "the real time control is still registered");
has(infoCard, "useTourTarget(TOUR_TARGETS.infoCardSave)", "the real Save to Vault button is still registered");
has(infoCard, "ref={saveTarget.ref}", "the Save button target is attached to the real control");

console.log("\n── 10. Retained fixes that outlived the interactive mission ──");

// Contextual tips (a separate feature from the tutorial) are unchanged.
has(tipHost, "selectHeldTip", "the host holds one tip identity rather than re-deriving it");
has(tipHost, "const [heldTipId, setHeldTipId]", "the held tip lives in component state");
has(tipHost, "TIP_MIN_IMPRESSION_MS", "the impression is recorded on a timer, not on first render");
check(
  "the impression is NOT recorded during render/effect selection",
  !/announcedRef\.current = tipId;[\s\S]{0,120}recordTipSeen\?\.\(tipId\);/.test(tipHost),
  "recording at selection time is exactly what consumed every tip in a burst"
);
has(tipHost, "clearTimeout(impression)", "the impression timer is cleared on change/unmount");
has(tipHost, "clearTimeout(retire)", "the auto-retire timer is cleared on change/unmount");
has(tipHost, "firstLight.recordTipDismissed(tipId)", "dismissal records the tip so a remount cannot replay it");

// Dynamic Type work on the offer and the card.
check("tour buttons cannot become multi-line blocks", (overlay.match(/maxFontSizeMultiplier/g) || []).length >= 4);
has(overlay, "numberOfLines={1}", "button labels stay on one line");
hasnt(overlay, "allowFontScaling={false}", "Dynamic Type is never disabled");
has(overlay, "maxCardHeight(screen, reservedBottom, insets)", "the card height is capped from the live viewport");
has(overlay, "maxHeight: cardCap", "…and the cap is actually applied to the card");
check("the copy region shrinks while the actions do not",
  /copyScroll: \{ marginTop: 10, flexShrink: 1 \}/.test(overlay) && /buttonRow: \{[^}]*flexShrink: 0/.test(overlay));
check("the progress row and extra actions also hold their size",
  /progressRow: \{[^}]*flexShrink: 0/.test(overlay) && /actions: \{[^}]*flexShrink: 0/.test(overlay));
has(overlay, "paddingBottom: 14", "the last line of copy clears the action row");
check("the heading growth is bounded so it cannot become a billboard",
  /maxFontSizeMultiplier=\{1\.5\}[\s\S]{0,80}\{heading\}/.test(overlay));
check("body copy still scales generously", /style=\{styles\.copy\} maxFontSizeMultiplier=\{1\.9\}/.test(overlay));
has(geometrySource, "MIN_EXPOSED_SKY_FRACTION", "a minimum exposed-sky share is defined");
has(geometrySource, "reservedBottom: number = 0", "cardAnchor takes a host reserve as a parameter");
// The tutorial card runs over the app shell, so the strip it must clear is the tab bar.

// Cross-launch resume.
has(machineSource, '"paused"', "the machine still models a paused tour");

// Duplicate Vault saves — a Sky Lens fix, unaffected by the tutorial rewrite.
has(skyLens, "isAlreadySavedToVault", "the save path checks for an existing entry");
const onSaveBlock = skyLens.slice(skyLens.indexOf("const onSave = useCallback("), skyLens.indexOf("const hud = useMemo("));
check(
  "the premium gate still runs BEFORE the duplicate check",
  onSaveBlock.indexOf("if (!isPremium) { openPaywall(); return; }") >= 0 &&
    onSaveBlock.indexOf("if (!isPremium) { openPaywall(); return; }") < onSaveBlock.indexOf("isAlreadySavedToVault"),
  "gating must not be reordered"
);
check("the duplicate check is inside the save path", onSaveBlock.includes("isAlreadySavedToVault"));
check(
  "the duplicate check never imports or calls Vault cryptography",
  !/from "@\/services\/VaultEncryption"|encryptVault|decryptVault|nacl|SecureStore/.test(rulesSource)
);
check("an existing entry is never mutated or overwritten", !/setItems|splice|\.push\(|entries\[\d/.test(rulesSource));
check(
  "the interactive satisfaction rules are gone from the rules module",
  !/isObjectStepSatisfied|isSaveStepSatisfied|shouldRestoreLiveTime/.test(rulesSource),
  "nothing is left that could refuse to advance a screen"
);

// Navigation readiness helper (unchanged app infrastructure).
has(app, "NAV_READY_MAX_ATTEMPTS", "navigation readiness is retried, not silently dropped");
check("the retry is bounded", /if \(attempt >= NAV_READY_MAX_ATTEMPTS\) return;/.test(app));

console.log("\n── 11. First Light owns exactly one storage key ──");
const storageSource = read("src/features/first-light/firstLightStorage.ts");
const keys = [...storageSource.matchAll(/"(auralunis\.[a-zA-Z0-9._]+)"/g)].map((m) => m[1]);
check("only one AsyncStorage key is referenced", keys.length === 1 && keys[0].startsWith("auralunis.firstLight"), keys.join(","));
for (const [name, source] of [...TUTORIAL_SOURCES, ["ContextualTipHost", tipHost]]) {
  hasnt(source, "AsyncStorage", `${name} does not touch AsyncStorage directly`);
}
hasnt(storageSource, "multiRemove", "clearing never removes a set of keys");
hasnt(storageSource, "clear()", "the tutorial never wipes storage");

console.log(`\nFirst Light wiring self-test: ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
