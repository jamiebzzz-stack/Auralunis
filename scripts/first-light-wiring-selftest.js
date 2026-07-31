// First Light INTEGRATION guards.
//
// The behaviour of the tour is tested against the real modules in
// scripts/first-light-selftest.js. This file guards the things that are properties of the
// WIRING rather than of a function — that the tour only ever observes Sky Lens, that no overlay
// can swallow a tap, that the release-critical Sky Lens invariants are still byte-for-byte what
// they were, and that premium gating was neither bypassed nor duplicated.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
let pass = 0;
let fail = 0;
const ok = (m) => { pass += 1; console.log("PASS " + m); };
const bad = (m) => { fail += 1; console.log("FAIL " + m); };
const check = (name, condition, detail) => (condition ? ok(name) : bad(`${name}${detail ? " — " + detail : ""}`));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const has = (haystack, needle, name) => check(name, haystack.includes(needle), `expected present: ${needle}`);
const hasnt = (haystack, needle, name) => check(name, !haystack.includes(needle), `should be absent: ${needle}`);

const skyLens = read("src/features/sky-lens/SkyLensScreen.tsx");
const bridge = read("src/features/first-light/FirstLightSkyLens.tsx");
const overlay = read("src/features/tour/TourOverlay.tsx");
const registry = read("src/features/tour/TourTargetRegistry.tsx");
const tipHost = read("src/features/first-light/ContextualTipHost.tsx");
const rootOverlay = read("src/features/first-light/FirstLightRootOverlay.tsx");
const context = read("src/features/first-light/FirstLightContext.tsx");
const analytics = read("src/services/AnalyticsService.ts");
const app = read("App.tsx");
const settings = read("src/screens/SettingsScreen.tsx");
const skyScreen = read("src/screens/SkyScreen.tsx");
const infoCard = read("src/features/sky-lens/SkyLensInfoCard.tsx");

console.log("── 1. The tour OBSERVES Sky Lens; it never drives it ──");
for (const forbidden of [
  "setSelected",
  "toggleLock",
  "applyDrag",
  "setZoom",
  "setActive(",
  "setTimeOffsetMin",
  "addItem",
  "openPaywall",
  "updateSetting",
]) {
  hasnt(bridge, forbidden, `the Sky Lens tour bridge never calls ${forbidden}`);
}
hasnt(bridge, "astronomy-engine", "the tour computes no astronomy of its own");
hasnt(bridge, "SkyLensProjection", "the tour does not re-implement the projection");
has(bridge, "project(", "the tour uses the SHARED projection passed in from Sky Lens");
has(bridge, "angleBetweenQuaternions", "movement is measured from the rendered orientation, not from a new sensor hook");
hasnt(bridge, "useDevicePointing", "the tour never opens its own sensor subscription");
hasnt(bridge, "useSkyOrientation", "the tour never instantiates a second orientation source");
hasnt(bridge, "react-native-svg", "the tour draws no sky geometry of its own");
hasnt(bridge, "SvgText", "the tour renders no sky labels — production labels are never duplicated");
hasnt(bridge, "ConstellationLines", "the tour adds no constellation geometry");
has(bridge, "selectedId === target.id", "step 4 requires the CORRECT object's card, by identity");
has(bridge, "savedIds.has(target.id)", "step 8 waits for a real persisted save, never a simulated one");

console.log("\n── 2. No overlay can swallow a tap or be left behind ──");
has(overlay, 'if (!visible) return null;', "the tour overlay renders nothing at all when hidden");
has(overlay, '<View style={StyleSheet.absoluteFill} pointerEvents="box-none">', "the overlay root is box-none");
check(
  "every dim band is pointerEvents=none",
  /key={`band-\$\{i\}`}\s*\n\s*pointerEvents="none"/.test(overlay),
  "dim bands must not receive touches"
);
check(
  "the focus ring is pointerEvents=none",
  /\{spot && \(\s*\n\s*<View\s*\n\s*pointerEvents="none"/.test(overlay),
  "the ring must not cover the control"
);
has(overlay, "dimBands", "dimming is drawn AROUND the spotlight, not as a scrim over it");
has(bridge, 'pointerEvents="none"', "the tour's directional cue never catches touches");
check(
  "NO view is ever mounted over the tutorial object",
  !/style=\{\[styles\.marker/.test(bridge) && !bridge.includes("tutorialObject"),
  "sky objects are spotlighted by rect, not by covering them with a marker view"
);
has(bridge, "spotlightRect={spotlightRect}", "the sky-object spotlight is an explicit rect");
has(overlay, "spotlightFor(spotlightRect ?? target, screen)", "an explicit rect takes precedence over measurement");
check(
  "a moving sky object never invalidates the layout registry",
  !/onLayout=\{objectMarker|onLayout=\{constellationMarker/.test(bridge),
  "measuring a per-frame-moving view would re-register targets 60x/second"
);
check(
  "an off-screen or behind-camera object yields NO spotlight rather than a wrong one",
  /const visible = \(p: Projected \| null\) => !!p && p\.onScreen && !p\.behind;/.test(bridge)
);
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

console.log("\n── 4. Premium gating: not bypassed, not duplicated, not in the required path ──");
has(skyLens, "if (!isPremium) { openPaywall(); return; }", "the existing premium gates are still in place");
check(
  "Sky Lens still gates the Vault save on entitlement",
  /Saving to the \(premium\) Vault requires entitlement[\s\S]{0,200}if \(!isPremium\) \{ openPaywall\(\); return; \}/.test(skyLens),
  "the save gate must be unchanged"
);
check(
  "Sky Lens still gates time travel on entitlement",
  /Time Travel[\s\S]{0,240}if \(!isPremium\) \{ openPaywall\(\); return; \}/.test(skyLens),
  "the time-travel gate must be unchanged"
);
const stepsSource = read("src/features/first-light/firstLightSteps.ts");
has(stepsSource, "if (caps.timeControlAvailable && caps.isPremium) steps.push(EXPLORE_TIME);", "the time step is premium-only, so a free user never dead-ends on a paywall");
has(stepsSource, "if (caps.vaultSaveAvailable && caps.isPremium) steps.push(SAVE_TO_VAULT);", "the save step is premium-only");
has(stepsSource, "else if (caps.learnAvailable) steps.push(OPEN_LEARN);", "free users get a non-gated Learn step instead");
hasnt(stepsSource, "isPremium = true", "entitlement is never hardcoded");
for (const source of [bridge, context, rootOverlay, stepsSource, tipHost]) {
  hasnt(source, "AuraLunis Premium", "First Light never hardcodes the entitlement identifier");
  hasnt(source, "revenuecat", "First Light never touches RevenueCat");
  hasnt(source, "Purchases.", "First Light never calls the purchase SDK");
}
has(bridge, "isPremium,", "entitlement reaches the tour as a reported capability from useEntitlement()");

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
has(context, "trackTutorialEvent(\"first_light_started\")", "starting the tour is recorded");
has(context, "trackTutorialEvent(\"first_light_completed\")", "completing the tour is recorded");
has(context, "trackTutorialEvent(\"first_light_replayed\")", "replaying the tour is recorded");

console.log("\n── 6. Accessibility ──");
check("Back has an accessibility label", /accessibilityLabel="Go back to the previous step"/.test(overlay));
check("Skip has an accessibility label", /accessibilityLabel="Skip the tour"/.test(overlay));
check("Continue carries its label and disabled state", /accessibilityLabel=\{continueLabel\}/.test(overlay) && /accessibilityState=\{\{ disabled: !canContinue \}\}/.test(overlay));
check("a blocked Continue explains itself to VoiceOver", /accessibilityHint=/.test(overlay));
has(overlay, 'accessibilityRole="header"', "the step heading is a header for VoiceOver");
has(overlay, "AccessibilityInfo.announceForAccessibility", "each step is announced");
has(overlay, "AccessibilityInfo.setAccessibilityFocus", "focus moves to the instruction card");
check(
  "the announcement effect is keyed on the step, so it fires once per step",
  /\}, \[visible, stepId, heading, copy, index, total\]\);/.test(overlay)
);
hasnt(overlay, "accessibilityViewIsModal", "the card must NOT trap VoiceOver — the highlighted control stays reachable");
check(
  "grouping is on the instruction TEXT, not the whole card",
  /<View\s*\n\s*ref=\{cardRef\}\s*\n\s*accessible\s*\n\s*accessibilityLabel=/.test(overlay),
  "a card-level `accessible` would make Back / Skip / Continue unreachable"
);
has(overlay, "Step {index + 1} of {total}", "progress is stated in words, not only in colour");
has(overlay, "accessibilityElementsHidden", "decorative dimming is hidden from screen readers");
check("controls meet a 44pt minimum", (overlay.match(/minHeight: 44/g) || []).length >= 2);
has(overlay, "maxHeight: 210", "long Dynamic Type copy scrolls inside the card instead of clipping");
has(overlay, "ScrollView", "the copy area scrolls");
for (const [rel, source] of [
  ["TourOverlay", overlay],
  ["FirstLightSkyLens", bridge],
  ["ContextualTipHost", tipHost],
  ["FirstLightRootOverlay", rootOverlay],
]) {
  has(source, "useReducedMotion", `${rel} respects Reduce Motion`);
}
check(
  "Reduce Motion short-circuits the overlay animation entirely",
  /if \(reduceMotion\) \{\s*\n\s*fade\.setValue\(1\);\s*\n\s*return;/.test(overlay)
);
check(
  "Reduce Motion short-circuits the completion flourish",
  /if \(reduceMotion\) \{\s*\n\s*celebrate\.setValue\(1\);\s*\n\s*return;/.test(bridge)
);
has(tipHost, "accessibilityLabel={`Dismiss tip:", "the tip's dismiss control is labelled");

console.log("\n── 7. Listeners, timers, and layout survive interruption ──");
has(overlay, "return () => subscription.remove();", "the AppState listener is removed");
has(registry, "return () => subscription.remove();", "the Dimensions listener is removed");
has(registry, "clearTimeout(timer)", "the measure timeout is always cleared");
has(registry, "MEASURE_TIMEOUT_MS", "a native measure that never calls back cannot hang the overlay");
has(overlay, "return () => animation.stop();", "the entrance animation is stopped on unmount");
has(bridge, "return () => clearInterval(id);", "the target-refresh interval is cleared");
has(overlay, "cancelled = true;", "a measurement resolving after unmount is discarded");
has(context, "active = false;", "hydration resolving after unmount is discarded");
check(
  "the overlay re-measures after returning from the background",
  /AppState\.addEventListener\("change", \(state\) => \{\s*\n\s*if \(state === "active"\) invalidateLayout\(\);/.test(overlay)
);
check(
  "the overlay re-measures when the window changes size (rotation)",
  /layoutNonce, screen\.width, screen\.height\]/.test(overlay)
);
has(registry, "registerTarget?.(key, null);", "targets unregister when their host unmounts");
hasnt(overlay, "Dimensions.get(", "no screen size is captured once at module load");

console.log("\n── 8. State updates are StrictMode-safe ──");
has(context, "setMachine((current) => tourReducer(current, action, steps));", "the machine updater is the pure reducer");
// Brace-matched scan: pull out the body of every `setX((prev) => { … })` updater and prove no
// other setter is called inside it. A nested setState in an updater is exactly the bug the
// existing useSkyOrientation comments describe, and it misbehaves under StrictMode.
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
check("the updater scan actually found updaters to inspect", updaterBodies(context).length >= 1);
has(context, "reanchorIndex(current, previous, steps)", "a changed step list re-anchors by id, not by index");

console.log("\n── 9. Wiring ──");
has(app, "<TourTargetProvider>", "the tour target registry is mounted at the app root");
has(app, "<FirstLightProvider enabled={route === \"app\"}>", "First Light is only enabled once the app proper is on screen");
has(app, "<FirstLightRootOverlay onEnterSky={goToSkyTab} />", "the offer + welcome step are mounted at the root");
has(app, "ref={navigationRef}", "the navigator exposes a ref for the tab jump");
has(app, "navigationRef.isReady()", "navigation is guarded until the tree is ready");
has(settings, "Replay Tutorial", "the EXISTING tutorial is still available as the quick reference");
has(settings, "Replay First Light", "First Light can be replayed from Settings");
has(skyLens, "<FirstLightSkyLens", "Sky Lens hosts the hands-on steps");
has(skyLens, "<ContextualTipHost", "Sky Lens hosts the contextual tips");
has(skyLens, "useTourTarget(FIRST_LIGHT_TARGETS.lockSky)", "the real Lock Sky chip is registered as a target");
has(skyLens, "useTourTarget(FIRST_LIGHT_TARGETS.timeTravel)", "the real time control is registered as a target");
has(infoCard, "useTourTarget(FIRST_LIGHT_TARGETS.infoCardSave)", "the real Save to Vault button is registered as a target");
has(infoCard, "ref={saveTarget.ref}", "the Save button target is attached to the real control");
check(
  "Sky Lens opens once on entering the hands-on phase, and is never forced open again",
  /if \(tourNeedsSkyLens && !tourNeededSkyLensRef\.current\) setSkyLensOpen\(true\);/.test(skyScreen)
);
has(rootOverlay, "Skip for now", "the offer has a genuine decline");
has(rootOverlay, "Begin First Light", "the offer has a clear start");
has(rootOverlay, "firstLight.declineOffer", "declining is remembered");
has(context, "shouldOfferFirstLight(document)", "the offer respects the persisted decision");

console.log("\n── 10. First Light owns exactly one storage key ──");
const storageSource = read("src/features/first-light/firstLightStorage.ts");
const keys = [...storageSource.matchAll(/"(auralunis\.[a-zA-Z0-9._]+)"/g)].map((m) => m[1]);
check("only one AsyncStorage key is referenced", keys.length === 1 && keys[0].startsWith("auralunis.firstLight"), keys.join(","));
for (const source of [context, bridge, rootOverlay, tipHost]) {
  hasnt(source, "AsyncStorage", "only the storage module touches AsyncStorage");
}
hasnt(storageSource, "multiRemove", "clearing never removes a set of keys");
hasnt(storageSource, "clear()", "the tutorial never wipes storage");

console.log(`\nFirst Light wiring self-test: ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
