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
const spotlightSrc = read("src/features/first-light/firstLightSpotlight.ts");
const registry = read("src/features/tour/TourTargetRegistry.tsx");
const tipHost = read("src/features/first-light/ContextualTipHost.tsx");
const rootOverlay = read("src/features/first-light/FirstLightRootOverlay.tsx");
const context = read("src/features/first-light/FirstLightContext.tsx");
const analytics = read("src/services/AnalyticsService.ts");
const app = read("App.tsx");
const settings = read("src/screens/SettingsScreen.tsx");
const skyScreen = read("src/screens/SkyScreen.tsx");
const infoCard = read("src/features/sky-lens/SkyLensInfoCard.tsx");
const geometrySource = read("src/features/tour/tourGeometry.ts");
const machineSource = read("src/features/tour/tourMachine.ts");
const rulesSource = read("src/features/first-light/firstLightRules.ts");

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

// ── Readiness gates (the "Venus is the HUD" defect) ──────────────────────────────────
// Sky Lens opens on a hardcoded 360x720 placeholder canvas and at DEFAULT_OBSERVER. Projecting
// through either put the spotlight ~94 px too high, in the top chrome, until the real values
// arrived asynchronously. Both gates must stay wired, or the defect returns silently.
has(skyLens, "boxMeasured={boxMeasured}", "Sky Lens tells the tour when its canvas is really measured");
has(skyLens, 'locationReady={status !== "loading"}', "…and when the observer location has settled");
has(skyLens, "setBoxMeasured(true)", "boxMeasured is set from a real onLayout, never assumed");
check(
  "readiness is only granted for a positive, finite layout",
  /width > 0 && height > 0\)\s*\{\s*\n\s*setBoxMeasured\(true\)/.test(skyLens),
  "a zero/NaN layout must not count as measured"
);
has(bridge, "resolveProjectedSpotlightRect({", "the bridge uses the PURE, gated spotlight resolver");
has(bridge, "readiness,", "…and passes readiness into it");
check(
  "the projection itself is withheld until readiness, not just the rectangle",
  /if \(!projectionTrustworthy\) return null;/.test(bridge),
  "a placeholder viewport can report an object as on screen when it is not"
);
check(
  "the old ungated local resolver is gone",
  !bridge.includes("function resolveSpotlightRect"),
  "two resolvers would let an ungated one be reintroduced"
);
has(overlay, "spotlightFor(spotlightRect ?? target, screen)", "an explicit rect takes precedence over measurement");
check(
  "a moving sky object never invalidates the layout registry",
  !/onLayout=\{objectMarker|onLayout=\{constellationMarker/.test(bridge),
  "measuring a per-frame-moving view would re-register targets 60x/second"
);
// The visibility rule moved OUT of the bridge into the pure, unit-tested resolver so the
// readiness gate and the visibility gate live in one place. The guarantee is unchanged; only
// its home is. Behaviour is asserted directly in scripts/first-light-selftest.js section 16.
check(
  "an off-screen or behind-camera object yields NO spotlight rather than a wrong one",
  /return projection\.onScreen && !projection\.behind;/.test(spotlightSrc)
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
// Window widened from 200 to 700 chars ONLY because the duplicate-save guard added an
// explanatory comment between the intent line and the gate. What matters — that the gate runs
// before the write — is measured guard-to-write by scripts/vault-write-gate-selftest.js, which
// still uses its original 260-char window and still passes.
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
has(app, "<FirstLightRootOverlay onEnterSky={() => goToSkyTab()} />", "the offer + welcome step are mounted at the root");
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

console.log("\n── 10. Audit-fix wiring ──");

// F1 — the no-motion trap
has(bridge, "isObjectStepSatisfied", "object-step completion goes through the pure, tested rule");
hasnt(bridge, "if (targetProjection?.onScreen && !targetProjection.behind) satisfy", "the raw on-screen-only rule that trapped the tour is gone");
check(
  "the no-motion hint never claims motion was detected",
  /without motion the sky can’t follow your phone/.test(bridge),
  "the copy must state the opposite"
);

has(bridge, "isSaveStepSatisfied", "the save step uses the pure, tested rule too");
hasnt(bridge, "if (target && savedIds.has(target.id)) satisfy", "the raw save-only rule that trapped step 8 is gone");
check(
  "the save-step no-motion hint tells the truth about why",
  /Saving needs the object on screen, which this device can’t reach without motion/.test(bridge)
);

// F2 — contextual tips
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

// F3 — reserved dock region
has(skyLens, "const tourReservedBottom = Math.max(", "Sky Lens measures the strip the tour must avoid");
has(skyLens, "reservedBottom={tourReservedBottom}", "…and hands it to the tour");
has(overlay, "reservedBottom", "the overlay honours a host-reserved bottom strip");
has(geometrySource, "reservedBottom: number = 0", "cardAnchor takes the reserve as a parameter");
check(
  "the reserve is derived from the live dock/insets, not hardcoded pixels",
  /Math\.max\(\s*\n\s*box\.height - dockTop,\s*\n\s*insets\.bottom \+ LOCK_CHIP_RESERVE/.test(skyLens)
);

// F4 — Dynamic Type
has(rootOverlay, "ScrollView", "the offer card scrolls instead of overflowing the screen");
has(rootOverlay, 'maxHeight: "84%"', "the offer card is bounded to the viewport");
check("offer text is bounded but still scales", (rootOverlay.match(/maxFontSizeMultiplier/g) || []).length >= 5);
check("tour buttons cannot become multi-line blocks", (overlay.match(/maxFontSizeMultiplier/g) || []).length >= 4);
has(overlay, "numberOfLines={1}", "button labels stay on one line");
hasnt(rootOverlay, "allowFontScaling={false}", "Dynamic Type is never disabled");
hasnt(overlay, "allowFontScaling={false}", "Dynamic Type is never disabled");

// F11 — large Dynamic Type comfort
has(overlay, "maxCardHeight(screen, reservedBottom, insets)", "the card height is capped from the live viewport");
has(overlay, "maxHeight: cardCap", "…and the cap is actually applied to the card");
check("the copy region shrinks while the actions do not",
  /copyScroll: \{ marginTop: 10, flexShrink: 1 \}/.test(overlay) && /buttonRow: \{[^}]*flexShrink: 0/.test(overlay));
check("the progress row and extra actions also hold their size",
  /progressRow: \{[^}]*flexShrink: 0/.test(overlay) && /actions: \{[^}]*flexShrink: 0/.test(overlay));
has(overlay, "paddingBottom: 14", "the last line of copy clears the action row");
has(overlay, "showsVerticalScrollIndicator\n", "the scroll indicator signals there is more to read");
check("the heading growth is bounded so it cannot become a billboard",
  /maxFontSizeMultiplier=\{1\.5\}[\s\S]{0,80}\{heading\}/.test(overlay));
check("body copy still scales generously", /style=\{styles\.copy\} maxFontSizeMultiplier=\{1\.9\}/.test(overlay));
hasnt(overlay, "screen.height * 0.32", "the fixed fractional copy height is replaced by the card cap");
has(geometrySource, "MIN_EXPOSED_SKY_FRACTION", "a minimum exposed-sky share is defined");
has(geometrySource, "MAX_SPOTLIGHT_WIDTH_FRACTION", "spotlight width is capped");
has(geometrySource, "MAX_SPOTLIGHT_HEIGHT_FRACTION", "spotlight height is capped");
check("spotlight padding is a constant, never font-derived",
  /const pad = finite\(padding\) && padding >= 0 \? padding : DEFAULT_SPOTLIGHT_PADDING;/.test(geometrySource));

// F5 — stable totals
has(app, "FirstLightCapabilityBridge", "capabilities resolve at the app root");
has(app, "markCapabilitiesResolved()", "the root marks resolution so the offer can wait for it");
has(app, "TIME_CONTROL_SHIPS_IN_SKY_LENS", "the time-control capability is known without mounting Sky Lens");
has(context, "capabilitiesResolved &&", "the offer waits for a final mission length");

// F6 — cross-launch resume
has(context, "resolveResumeStepId", "the persisted pointer is actually read back");
has(context, "dispatch({ type: \"goto\", stepId: resumeStepId })", "resuming jumps to the persisted step");
has(rootOverlay, "Resume First Light", "the offer leads with Resume when appropriate");
has(rootOverlay, "Start from the beginning", "a clean restart is always offered too");
has(context, "restartTour", "restart is a distinct action from resume");

// F7 — time restoration
has(bridge, "shouldRestoreLiveTime", "time restoration goes through the pure, tested rule");
check(
  "restoration is driven by leaving the step, not by the Continue button",
  /previousStepRef/.test(bridge) && !/if \(stepId === "exploreTime" && !keepChangedTime\) onRestoreLiveTime/.test(bridge)
);
check("unmount restores too", /\(\) => \(\) => \{[\s\S]{0,400}shouldRestoreLiveTime/.test(bridge));

// F8 — no orphaned invisible tour
has(context, "pauseTour", "the tour can be paused");
has(skyScreen, "firstLight?.pauseTour()", "closing Sky Lens mid-tour pauses instead of orphaning");
has(skyScreen, "First Light is paused", "a paused tour is visible and recoverable from the Sky tab");
has(skyScreen, "firstLight.resumeTour()", "…with a Resume action");
has(skyScreen, "firstLight.dismissPausedTour()", "…and a dismiss");
has(machineSource, '"paused"', "the machine models a paused tour");

// F9 — duplicate Vault saves
has(skyLens, "isAlreadySavedToVault", "the save path checks for an existing entry");
// Compare positions INSIDE onSave — the file-level import of the helper appears near the top
// and would otherwise make this comparison meaningless.
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

// F10 — navigation readiness
has(app, "NAV_READY_MAX_ATTEMPTS", "navigation readiness is retried, not silently dropped");
check("the retry is bounded", /if \(attempt >= NAV_READY_MAX_ATTEMPTS\) return;/.test(app));

// The locally mirrored tab-bar height must not drift from the real one.
const rootTabs = read("src/navigation/RootTabs.tsx");
const realHeight = /height:\s*(\d+)/.exec(rootTabs);
const mirrored = /ROOT_TAB_BAR_HEIGHT = (\d+)/.exec(rootOverlay);
check(
  "the mirrored tab-bar height matches TAB_BAR_STYLE.height",
  !!realHeight && !!mirrored && realHeight[1] === mirrored[1],
  `${mirrored && mirrored[1]} vs ${realHeight && realHeight[1]}`
);

console.log("\n── 11. First Light owns exactly one storage key ──");
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
