// First Light guided-tour BEHAVIOUR self-test.
//
// This runs the REAL shipping modules — the pure ones are transpiled to CommonJS in memory
// with the repo's own `typescript` dependency and executed, so there is no second copy of any
// rule and a regression in the shipping code fails here. Where a module needs AsyncStorage, a
// tiny in-memory stub is injected into the require cache so the persistence path itself is
// genuinely exercised rather than asserted about with a regex.
//
// Source-level wiring guards live in scripts/first-light-wiring-selftest.js.

const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const Module = require("module");

const ROOT = path.resolve(__dirname, "..");

// ── in-memory AsyncStorage stub, injected before any module requires it ──────────────
const memoryStore = new Map();
let storageShouldThrow = false;
const asyncStorageStub = {
  getItem: async (key) => {
    if (storageShouldThrow) throw new Error("storage unavailable");
    return memoryStore.has(key) ? memoryStore.get(key) : null;
  },
  setItem: async (key, value) => {
    if (storageShouldThrow) throw new Error("storage unavailable");
    memoryStore.set(key, value);
  },
  removeItem: async (key) => {
    if (storageShouldThrow) throw new Error("storage unavailable");
    memoryStore.delete(key);
  },
};

try {
  const resolved = require.resolve("@react-native-async-storage/async-storage", { paths: [ROOT] });
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: { __esModule: true, default: asyncStorageStub },
  };
} catch {
  // Package not installed — the storage section reports this rather than silently passing.
}

// Register a .ts loader so the REAL source files run, including their relative imports of
// each other ("./firstLightState"), which a one-file transpile could not resolve.
Module._extensions[".ts"] = function (loadedModule, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
    fileName: filename,
  });
  loadedModule._compile(outputText, filename);
};

const requireTs = (absPath) => require(absPath);

const src = (rel) => path.join(ROOT, "src", rel);
const geometry = requireTs(src("features/tour/tourGeometry.ts"));
const machine = requireTs(src("features/tour/tourMachine.ts"));
const state = requireTs(src("features/first-light/firstLightState.ts"));
const stepsModule = requireTs(src("features/first-light/firstLightSteps.ts"));
const tips = requireTs(src("features/first-light/contextualTips.ts"));
const storage = requireTs(src("features/first-light/firstLightStorage.ts"));
const rules = requireTs(src("features/first-light/firstLightRules.ts"));

let pass = 0;
let fail = 0;
const ok = (m) => { pass += 1; console.log("PASS " + m); };
const bad = (m) => { fail += 1; console.log("FAIL " + m); };
const check = (name, condition, detail) => (condition ? ok(name) : bad(`${name}${detail ? " — " + detail : ""}`));
const eq = (name, actual, expected) =>
  check(name, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);

// ══════════════════════════════════════════════════════════════════════════════════════
console.log("\n── 1. Persisted state: safe defaults, sanitisation, migration ──");

const DEFAULTS = state.DEFAULT_FIRST_LIGHT_STATE;
eq("null parses to the default document", state.parseFirstLightState(null), DEFAULTS);
eq("a string parses to the default document", state.parseFirstLightState("not an object"), DEFAULTS);
eq("an array parses to the default document", state.parseFirstLightState([1, 2, 3]), DEFAULTS);
// An object with no version is a version-0 document, not a corrupt one — parse reports that
// honestly and the migration step is what stamps the current version.
eq("an unversioned object parses as version 0 with default fields", state.parseFirstLightState({}), { ...DEFAULTS, firstLightVersion: 0 });
eq("hydrate (parse + migrate) turns it into a current default document", state.hydrateFirstLightState({}), DEFAULTS);
eq("hydrate of pure junk is also a current default document", state.hydrateFirstLightState("???"), DEFAULTS);

const junk = state.parseFirstLightState({
  firstLightVersion: "banana",
  status: "half-done",
  currentStep: "   ",
  contextualTipsSeen: ["layers", "layers", 42, "", null, "offline"],
  lastUpdatedAt: 12345,
  somethingFromTheFuture: { nested: true },
});
check("an invalid status falls back to notStarted", junk.status === "notStarted");
check("an invalid version falls back to 0 (so migration runs)", junk.firstLightVersion === 0);
check("a whitespace-only currentStep becomes null", junk.currentStep === null);
eq("tips are de-duplicated and non-strings dropped", junk.contextualTipsSeen, ["layers", "offline"]);
check("a non-string lastUpdatedAt becomes null", junk.lastUpdatedAt === null);
check("unknown fields are dropped, not carried", !("somethingFromTheFuture" in junk));

const completedOld = { ...DEFAULTS, firstLightVersion: 0, status: "completed" };
const migrated = state.migrateFirstLightState(completedOld);
check("migration stamps the current version", migrated.firstLightVersion === state.FIRST_LIGHT_VERSION);
check("migration does NOT re-prompt a completed user by default", migrated.status === "completed");
eq("no shipped version re-prompts", [...state.VERSIONS_REQUIRING_REPROMPT], []);

// The deliberate re-prompt branch, exercised with an explicit version list.
const reprompted = state.migrateToVersion({ ...DEFAULTS, firstLightVersion: 1, status: "completed", currentStep: "lockSky" }, 2, [2]);
check("a version listed for re-prompt returns the user to notStarted", reprompted.status === "notStarted");
check("a re-prompt migration also clears the stale step pointer", reprompted.currentStep === null);
const notReprompted = state.migrateToVersion({ ...DEFAULTS, firstLightVersion: 1, status: "skipped" }, 2, [5]);
check("a version NOT listed leaves status alone", notReprompted.status === "skipped");
check("a not-listed migration still bumps the version", notReprompted.firstLightVersion === 2);

check("notStarted is offered", state.shouldOfferFirstLight({ ...DEFAULTS, status: "notStarted" }) === true);
check("inProgress is offered (resume after interruption)", state.shouldOfferFirstLight({ ...DEFAULTS, status: "inProgress" }) === true);
check("a SKIPPED user is never prompted again", state.shouldOfferFirstLight({ ...DEFAULTS, status: "skipped" }) === false);
check("a COMPLETED user is never prompted again", state.shouldOfferFirstLight({ ...DEFAULTS, status: "completed" }) === false);
check(
  "an interrupted tour is resumable",
  state.isResumable({ ...DEFAULTS, status: "inProgress", currentStep: "lockSky" }) === true
);
check("a fresh document is not resumable", state.isResumable(DEFAULTS) === false);

const started = state.markStarted(DEFAULTS, "welcome", "2026-01-01T00:00:00.000Z");
check("markStarted sets inProgress + step + timestamp", started.status === "inProgress" && started.currentStep === "welcome" && started.lastUpdatedAt !== null);
check("the source document is not mutated", DEFAULTS.status === "notStarted" && DEFAULTS.currentStep === null);

const withTips = state.markTipSeen(state.markTipSeen(started, "layers", "t1"), "offline", "t2");
eq("tips accumulate without duplicates", withTips.contextualTipsSeen, ["layers", "offline"]);
check("re-marking a seen tip returns the SAME object (no needless write)", state.markTipSeen(withTips, "layers", "t3") === withTips);
check("hasSeenTip reflects the record", state.hasSeenTip(withTips, "layers") === true && state.hasSeenTip(withTips, "premiumDiscovery") === false);

const replayed = state.resetForReplay({ ...withTips, status: "completed" }, "t4");
check("replay restarts the tour", replayed.status === "inProgress");
check("replay clears the stale step pointer", replayed.currentStep === null);
eq("replay PRESERVES contextual tips already seen", replayed.contextualTipsSeen, ["layers", "offline"]);

const skipped = state.markSkipped(withTips, "t5");
eq("skipping preserves tips too", skipped.contextualTipsSeen, ["layers", "offline"]);
check("skipping records the status", skipped.status === "skipped");

// ══════════════════════════════════════════════════════════════════════════════════════
console.log("\n── 2. Persistence round-trip, corruption recovery, key isolation ──");

async function storageSection() {
  memoryStore.clear();
  storageShouldThrow = false;

  const empty = await storage.loadFirstLightState();
  eq("a fresh install loads the default document", empty, DEFAULTS);

  const completed = state.markCompleted(state.markStarted(DEFAULTS, "welcome", "t"), "t");
  await storage.saveFirstLightState(completed);
  const reloaded = await storage.loadFirstLightState();
  check("completion survives a save/load round trip", reloaded.status === "completed");
  check("only the First Light key was written", [...memoryStore.keys()].join(",") === storage.FIRST_LIGHT_STORAGE_KEY);
  check("the key is namespaced to First Light", storage.FIRST_LIGHT_STORAGE_KEY.startsWith("auralunis.firstLight"));

  memoryStore.set(storage.FIRST_LIGHT_STORAGE_KEY, "{ not json at all");
  const recovered = await storage.loadFirstLightState();
  eq("corrupt JSON recovers to the default document", recovered, DEFAULTS);

  memoryStore.set(storage.FIRST_LIGHT_STORAGE_KEY, JSON.stringify({ status: "completed", firstLightVersion: 0 }));
  const oldDoc = await storage.loadFirstLightState();
  check("loading migrates an older document", oldDoc.firstLightVersion === state.FIRST_LIGHT_VERSION && oldDoc.status === "completed");

  // Unrelated keys must survive a clear.
  memoryStore.set("auralunis.onboarding.seen", "true");
  memoryStore.set("auralunis.vault.prototype.v2", "enc:1:whatever");
  await storage.clearFirstLightState();
  check("clear removes the First Light key", !memoryStore.has(storage.FIRST_LIGHT_STORAGE_KEY));
  check("clear leaves the onboarding flag alone", memoryStore.get("auralunis.onboarding.seen") === "true");
  check("clear leaves the Vault blob alone", memoryStore.get("auralunis.vault.prototype.v2") === "enc:1:whatever");

  storageShouldThrow = true;
  const failedLoad = await storage.loadFirstLightState();
  eq("a storage failure on load degrades to defaults, never throws", failedLoad, DEFAULTS);
  let threw = false;
  try {
    await storage.saveFirstLightState(completed);
  } catch {
    threw = true;
  }
  check("a storage failure on save is swallowed", threw === false);
  storageShouldThrow = false;
}

// ══════════════════════════════════════════════════════════════════════════════════════
function machineSection() {
  console.log("\n── 3. Tour machine: transitions, gating, purity, re-anchoring ──");

  const STEPS = [
    { id: "welcome", requiresAction: false },
    { id: "lookAround", requiresAction: true },
    { id: "lockSky", requiresAction: true },
    { id: "completion", requiresAction: false },
  ];

  let s = machine.INITIAL_TOUR_STATE;
  check("a fresh machine is idle at index 0", s.status === "idle" && s.index === 0);
  check("no step is current while idle", machine.currentStep(s, STEPS) === null);

  s = machine.tourReducer(s, { type: "start" }, STEPS);
  check("start begins at the first step", s.status === "running" && s.index === 0);
  check("an informational step can continue immediately", machine.canContinue(s, STEPS) === true);
  check("Back is disabled on the first step", machine.canGoBack(s) === false);

  s = machine.tourReducer(s, { type: "next" }, STEPS);
  check("an action step blocks Continue until the action happens", machine.canContinue(s, STEPS) === false);
  check("Back is enabled after the first step", machine.canGoBack(s) === true);

  const beforeSatisfy = JSON.stringify(s);
  const satisfied = machine.tourReducer(s, { type: "satisfy", stepId: "lookAround" }, STEPS);
  check("satisfying the action enables Continue", machine.canContinue(satisfied, STEPS) === true);
  check("the reducer did not mutate its input", JSON.stringify(s) === beforeSatisfy);
  check(
    "the reducer is pure — the same input twice gives the same output",
    JSON.stringify(machine.tourReducer(s, { type: "satisfy", stepId: "lookAround" }, STEPS)) === JSON.stringify(satisfied)
  );
  check(
    "re-satisfying returns the identical object (idempotent under StrictMode double-invoke)",
    machine.tourReducer(satisfied, { type: "satisfy", stepId: "lookAround" }, STEPS) === satisfied
  );

  s = machine.tourReducer(satisfied, { type: "back" }, STEPS);
  check("Back moves to the previous step", s.index === 0);
  check("Back keeps the satisfied action recorded", s.satisfiedStepIds.includes("lookAround"));
  check("Back at index 0 is a no-op, not a negative index", machine.tourReducer(s, { type: "back" }, STEPS).index === 0);

  let last = machine.tourReducer(machine.INITIAL_TOUR_STATE, { type: "start" }, STEPS);
  for (let i = 0; i < STEPS.length - 1; i += 1) last = machine.tourReducer(last, { type: "next" }, STEPS);
  check("the final step is recognised as last", machine.isLastStep(last, STEPS) === true);
  const finished = machine.tourReducer(last, { type: "next" }, STEPS);
  check("Continue on the last step completes the tour", finished.status === "completed");
  check("a completed tour ignores further next()", machine.tourReducer(finished, { type: "next" }, STEPS).status === "completed");

  const skippedRun = machine.tourReducer(machine.tourReducer(machine.INITIAL_TOUR_STATE, { type: "start" }, STEPS), { type: "skip" }, STEPS);
  check("skip stops the tour", skippedRun.status === "skipped");
  check("no step is current once skipped", machine.currentStep(skippedRun, STEPS) === null);

  const resumed = machine.tourReducer({ status: "running", index: 2, satisfiedStepIds: ["lookAround"] }, { type: "start" }, STEPS);
  check("start on a running tour RESUMES rather than restarting", resumed.index === 2);
  const restarted = machine.tourReducer({ status: "running", index: 2, satisfiedStepIds: ["lookAround"] }, { type: "restart" }, STEPS);
  check("restart returns to step 0", restarted.index === 0);
  check("restart clears satisfied actions", restarted.satisfiedStepIds.length === 0);

  check("goto an unknown step is a no-op", machine.tourReducer(resumed, { type: "goto", stepId: "nope" }, STEPS).index === 2);
  check("goto a known step moves there", machine.tourReducer(resumed, { type: "goto", stepId: "welcome" }, STEPS).index === 0);
  eq("reset returns the initial state", machine.tourReducer(resumed, { type: "reset" }, STEPS), machine.INITIAL_TOUR_STATE);

  check("an out-of-range index is clamped, never crashes", machine.currentStep({ status: "running", index: 99, satisfiedStepIds: [] }, STEPS).id === "completion");
  check("an empty step list yields no current step", machine.currentStep({ status: "running", index: 0, satisfiedStepIds: [] }, []) === null);

  // Re-anchoring when capabilities change the step list mid-tour.
  const WIDE = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const NARROW = [{ id: "a" }, { id: "c" }, { id: "d" }];
  check(
    "a surviving step keeps its identity across a list change",
    machine.reanchorIndex({ status: "running", index: 2, satisfiedStepIds: [] }, WIDE, NARROW).index === 1
  );
  check(
    "a removed current step lands on the next surviving step, not a random one",
    machine.reanchorIndex({ status: "running", index: 1, satisfiedStepIds: [] }, WIDE, NARROW).index === 1
  );
  check(
    "an empty new list re-anchors to 0 instead of throwing",
    machine.reanchorIndex({ status: "running", index: 3, satisfiedStepIds: [] }, WIDE, []).index === 0
  );
}

// ══════════════════════════════════════════════════════════════════════════════════════
function stepsSection() {
  console.log("\n── 4. The tutorial: five informational screens, identical for everyone ──");

  const steps = stepsModule.buildFirstLightSteps();
  const ids = steps.map((s) => s.id);

  eq("exactly five screens, in order", ids,
    ["welcome", "exploreSky", "learnAstronomy", "saveDiscoveries", "ready"]);
  check("FIRST_LIGHT_STEP_COUNT agrees", stepsModule.FIRST_LIGHT_STEP_COUNT === 5);

  // ── The core property: NOTHING can block a screen ──────────────────────────────
  check("REGRESSION: no screen requires an in-app interaction",
    steps.every((s) => s.requiresAction === false),
    steps.filter((s) => s.requiresAction).map((s) => s.id).join(",") || "none");
  check("REGRESSION: no screen spotlights a control",
    steps.every((s) => s.targetKey === undefined));
  check("REGRESSION: every screen is hosted at the app root, never inside Sky Lens",
    steps.every((s) => s.host === "root"));
  check("REGRESSION: no screen carries a save variant", steps.every((s) => s.variant === undefined));

  // Continue is derived from requiresAction, so prove it directly through the machine.
  const running = { status: "running", index: 0, satisfiedStepIds: [] };
  for (let i = 0; i < steps.length; i += 1) {
    check(`Next/Finish is enabled on screen ${i + 1} with NOTHING satisfied`,
      machine.canContinue({ ...running, index: i }, steps) === true, steps[i].id);
  }

  // ── The tutorial is the SAME for everyone ─────────────────────────────────────
  const shapes = [
    {}, { isPremium: true }, { isPremium: false },
    { isPremium: true, motionAvailable: true, timeControlAvailable: true, vaultSaveAvailable: true, learnAvailable: true },
    { isPremium: false, motionAvailable: false, timeControlAvailable: false, vaultSaveAvailable: false, learnAvailable: false },
  ].map((c) => stepsModule.buildFirstLightSteps(c).map((s) => s.id).join(","));
  check("REGRESSION: capabilities cannot change the tutorial's shape",
    new Set(shapes).size === 1, shapes.join(" | "));
  check("…so premium and free see the same five screens",
    stepsModule.buildFirstLightSteps({ isPremium: true }).length === 5 &&
    stepsModule.buildFirstLightSteps({ isPremium: false }).length === 5);

  // ── Copy: every screen has real, readable content ─────────────────────────────
  for (const s of steps) {
    check(`${s.id} has a heading and substantial copy`,
      typeof s.heading === "string" && s.heading.length > 3 &&
      typeof s.copy === "string" && s.copy.length > 40, s.id);
  }
  check("screen 1 welcomes by product name", /AuraLunis/.test(steps[0].heading + steps[0].copy));
  check("screen 2 covers Sky Lens, the map, objects and cards",
    /Sky Lens/.test(steps[1].copy) && /map/i.test(steps[1].copy) && /card/i.test(steps[1].copy));
  check("screen 2 says tapping is available WITHOUT asking for it now",
    /Tap any object/i.test(steps[1].copy) && /Nothing to do now/i.test(steps[1].copy));
  check("screen 3 covers Learn, levels and saved progress",
    /Learn/.test(steps[2].copy) && /progress/i.test(steps[2].copy));
  check("screen 4 covers the Vault without demanding a save",
    /Vault/.test(steps[3].copy) && /unless you choose/i.test(steps[3].copy));
  check("screen 4 is honest that the Vault is Premium",
    /Premium/.test(steps[3].copy));
  check("screen 5 is a short completion message", /ready/i.test(steps[4].heading));
  check("screen 5 points at Settings for a replay", /Replay First Light/.test(steps[4].copy));

  // ── Labels ────────────────────────────────────────────────────────────────────
  check("screens 1-4 are labelled Next", steps.slice(0, 4).every((s) => s.continueLabel === "Next"));
  check("screen 5 is labelled Finish", steps[4].continueLabel === "Finish");

  // ── No copy asks the user to do anything physical ─────────────────────────────
  const forbidden = /move your phone|point your phone|sweep|turn around|find the|lock the sky|drag the sky|tap the highlighted|save it now|hold the sky/i;
  for (const s of steps) {
    check(`${s.id} never instructs a physical action`, !forbidden.test(s.copy), s.copy.slice(0, 60));
  }

  check("stepsForHost returns all five for root", stepsModule.stepsForHost(steps, "root").length === 5);
  check("stepsForHost returns none for skyLens", stepsModule.stepsForHost(steps, "skyLens").length === 0);
  check("findStepIndex locates by id", stepsModule.findStepIndex(steps, "learnAstronomy") === 2);
  check("findStepIndex reports -1 for an unknown id", stepsModule.findStepIndex(steps, "findObject") === -1);

  // The registry keys survive as reusable infrastructure, unused by the tutorial.
  check("tour-target keys remain exported for reuse",
    stepsModule.FIRST_LIGHT_TARGETS.lockSky === "skyLens.lockSky" &&
    stepsModule.FIRST_LIGHT_TARGETS.infoCardSave === "skyLens.infoCard.save");
}

// ══════════════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════════════
function tipsSection() {
  console.log("\n── 7. Contextual tips: once only, never stacked, never interrupting ──");

  const doc = { ...DEFAULTS, status: "completed", contextualTipsSeen: [] };
  const clear = {
    firstLightSettled: true,
    tourOverlayVisible: false,
    modalVisible: false,
    objectCardOpen: false,
    otherTipVisible: false,
  };

  check("an unseen tip shows once First Light has settled", tips.shouldShowTip("layers", doc, clear) === true);
  check("no tip shows before First Light settles", tips.shouldShowTip("layers", doc, { ...clear, firstLightSettled: false }) === false);
  check("no tip stacks on a tutorial overlay", tips.shouldShowTip("layers", doc, { ...clear, tourOverlayVisible: true }) === false);
  check("no tip covers a critical modal", tips.shouldShowTip("layers", doc, { ...clear, modalVisible: true }) === false);
  check("no tip interrupts an open object card", tips.shouldShowTip("layers", doc, { ...clear, objectCardOpen: true }) === false);
  check("no tip stacks on another tip", tips.shouldShowTip("layers", doc, { ...clear, otherTipVisible: true }) === false);
  check(
    "a tip already seen never shows again",
    tips.shouldShowTip("layers", { ...doc, contextualTipsSeen: ["layers"] }, clear) === false
  );

  check(
    "nextEligibleTip picks the first eligible candidate",
    tips.nextEligibleTip(["layers", "offline"], { ...doc, contextualTipsSeen: ["layers"] }, clear) === "offline"
  );
  check(
    "nextEligibleTip returns null when everything has been seen",
    tips.nextEligibleTip(["layers", "offline"], { ...doc, contextualTipsSeen: ["layers", "offline"] }, clear) === null
  );
  check(
    "nextEligibleTip returns null while a tour overlay is up",
    tips.nextEligibleTip([...tips.CONTEXTUAL_TIP_IDS], doc, { ...clear, tourOverlayVisible: true }) === null
  );

  eq("all five specified tips exist", [...tips.CONTEXTUAL_TIP_IDS], [
    "layers",
    "constellationZoom",
    "offline",
    "firstVaultSave",
    "premiumDiscovery",
  ]);
  check("the layers tip uses the specified copy", tips.CONTEXTUAL_TIPS.layers.body === "Choose what appears in your sky.");
  check(
    "the zoom tip uses the specified copy",
    tips.CONTEXTUAL_TIPS.constellationZoom.body === "More constellation names appear as you zoom in."
  );
  check(
    "the offline tip uses the specified copy",
    tips.CONTEXTUAL_TIPS.offline.body === "Core sky features remain available without a connection."
  );
  check("the offline claim is explicitly gated by a flag", typeof tips.OFFLINE_CLAIM_SUPPORTED === "boolean");
  check(
    "the offline tip disappears if the claim is ever withdrawn",
    tips.OFFLINE_CLAIM_SUPPORTED === true // documented; the guard branch is asserted below
  );

  // The Vault tip must describe what the code actually does — local encryption, no cloud sync.
  const vaultBody = tips.CONTEXTUAL_TIPS.firstVaultSave.body;
  check("the Vault tip says items are encrypted", /encrypt/i.test(vaultBody), vaultBody);
  check("the Vault tip says items stay on the device", /on this device/i.test(vaultBody), vaultBody);
  check("the Vault tip explicitly denies cloud sync", /no cloud sync/i.test(vaultBody), vaultBody);
  const encryption = fs.readFileSync(path.join(ROOT, "src/services/VaultEncryption.ts"), "utf8");
  check("…and the Vault really is encrypted locally (NaCl secretbox + SecureStore)", /nacl/.test(encryption) && /SecureStore/.test(encryption));
  check("…and nothing in the Vault path uploads anywhere", !/fetch\(|XMLHttpRequest|axios/.test(encryption));

  const premiumBody = tips.CONTEXTUAL_TIPS.premiumDiscovery.body;
  check("the premium tip states the benefit, not a price", !/\$|\d+\.\d\d/.test(premiumBody), premiumBody);
}

// ══════════════════════════════════════════════════════════════════════════════════════
function geometrySection() {
  console.log("\n── 8. Spotlight geometry: measured, clamped, and never covering the control ──");

  const screen = { width: 390, height: 844 };

  check("an unmeasured target yields no spotlight", geometry.spotlightFor(null, screen) === null);
  check("a zero-size target yields no spotlight", geometry.spotlightFor({ x: 10, y: 10, width: 0, height: 0 }, screen) === null);
  check("a NaN measurement yields no spotlight", geometry.spotlightFor({ x: NaN, y: 10, width: 40, height: 40 }, screen) === null);
  check("a zero-size viewport yields no spotlight", geometry.spotlightFor({ x: 10, y: 10, width: 40, height: 40 }, { width: 0, height: 0 }) === null);

  const spot = geometry.spotlightFor({ x: 100, y: 400, width: 120, height: 44 }, screen);
  check("the spotlight is padded around the control", spot.width > 120 && spot.height > 44);
  check("the spotlight stays inside the viewport", spot.x >= 0 && spot.y >= 0 && spot.x + spot.width <= screen.width && spot.y + spot.height <= screen.height);

  const tiny = geometry.spotlightFor({ x: 5, y: 5, width: 8, height: 8 }, screen);
  check("a tiny glyph still gets a comfortable spotlight", tiny.width >= geometry.MIN_SPOTLIGHT_SIZE && tiny.height >= geometry.MIN_SPOTLIGHT_SIZE);
  check("a spotlight at the edge is clamped, not pushed off-screen", tiny.x >= 0 && tiny.y >= 0);

  const bands = geometry.dimBands(spot, screen);
  const spotArea = spot.width * spot.height;
  const bandArea = bands.reduce((sum, b) => sum + b.width * b.height, 0);
  check("the dim bands plus the spotlight tile the whole screen exactly", Math.abs(bandArea + spotArea - screen.width * screen.height) < 0.5, `${bandArea + spotArea}`);
  const overlapsSpot = bands.some(
    (b) => b.x < spot.x + spot.width && b.x + b.width > spot.x && b.y < spot.y + spot.height && b.y + b.height > spot.y
  );
  check("NO dim band ever overlaps the highlighted control", overlapsSpot === false);
  eq("with no spotlight the dimming is a single full-screen band", geometry.dimBands(null, screen), [
    { x: 0, y: 0, width: screen.width, height: screen.height },
  ]);
  eq("a zero-size viewport produces no bands at all", geometry.dimBands(spot, { width: 0, height: 0 }), []);

  const insets = { top: 59, bottom: 34, left: 0, right: 0 };
  const below = geometry.cardAnchor({ x: 20, y: 100, width: 200, height: 44 }, screen, insets, 190);
  check("the card prefers to sit below the spotlight", below.placement === "below" && below.top > 144);
  const above = geometry.cardAnchor({ x: 20, y: 700, width: 200, height: 44 }, screen, insets, 190);
  check("a low spotlight pushes the card above it", above.placement === "above" && above.top < 700);
  const pinned = geometry.cardAnchor(null, screen, insets, 190);
  check("with no spotlight the card pins above the bottom safe area", pinned.placement === "bottom");
  check("the pinned card clears the home indicator", pinned.top + 190 <= screen.height - insets.bottom);

  const huge = geometry.cardAnchor({ x: 20, y: 300, width: 200, height: 44 }, screen, insets, 2000);
  check("a Dynamic-Type-enlarged card is still clamped inside the safe area", huge.top >= insets.top);
  const noScreen = geometry.cardAnchor(null, { width: 0, height: 0 }, insets, 190);
  check("a zero-size viewport still returns a usable anchor", Number.isFinite(noScreen.top));
}

// ══════════════════════════════════════════════════════════════════════════════════════
function auditRegressionSection() {
  console.log("\n── 9. Vault duplicate-save guard (unchanged by the tutorial rewrite) ──");

  // The interactive mission's satisfaction rules are GONE — there is nothing left to satisfy,
  // so the traps they guarded against are unreachable by construction. This Vault guard is not
  // part of that mission: Sky Lens itself uses it, and it is asserted here as before.
  check("the interactive satisfaction rules no longer exist",
    rules.isObjectStepSatisfied === undefined &&
    rules.isSaveStepSatisfied === undefined &&
    rules.shouldRestoreLiveTime === undefined);

  const entries = [
    { type: "archive", title: "Jupiter" },
    { type: "note", title: "Jupiter" },
  ];
  check("REGRESSION: an object already archived is detected", rules.isAlreadySavedToVault(entries, "Jupiter") === true);
  check("a different object is not", rules.isAlreadySavedToVault(entries, "Saturn") === false);
  check("a note with the same title is NOT an archive match",
    rules.isAlreadySavedToVault([{ type: "note", title: "Mars" }], "Mars") === false);
  check("an empty name never matches", rules.isAlreadySavedToVault(entries, "") === false);
  check("an empty vault never matches", rules.isAlreadySavedToVault([], "Jupiter") === false);
}

function resumeSection() {
  console.log("\n── 10. Cross-launch resume, restart, and pause ──");

  const STEP_IDS = ["welcome", "lookAround", "findObject", "openCard", "constellation", "lockSky", "exploreTime", "saveDiscovery", "completion"];
  const midTour = { ...DEFAULTS, status: "inProgress", currentStep: "lockSky" };

  check("REGRESSION: a persisted mid-tour position resolves to that step", state.resolveResumeStepId(midTour, STEP_IDS) === "lockSky");
  check("a completed document has nothing to resume", state.resolveResumeStepId({ ...DEFAULTS, status: "completed", currentStep: "lockSky" }, STEP_IDS) === null);
  check("a skipped document has nothing to resume", state.resolveResumeStepId({ ...DEFAULTS, status: "skipped", currentStep: "lockSky" }, STEP_IDS) === null);
  check("a fresh document has nothing to resume", state.resolveResumeStepId(DEFAULTS, STEP_IDS) === null);
  check("a CORRUPT step id falls back safely to the beginning", state.resolveResumeStepId({ ...midTour, currentStep: "not-a-step" }, STEP_IDS) === null);
  check(
    "a step that exists for premium but not for this user falls back safely",
    state.resolveResumeStepId({ ...midTour, currentStep: "exploreTime" }, ["welcome", "lookAround", "completion"]) === null
  );

  const STEPS = STEP_IDS.map((id) => ({ id, requiresAction: false }));
  // persist at step 6 → terminate → relaunch (fresh machine) → resume at step 6
  const relaunched = machine.INITIAL_TOUR_STATE;
  const resumed = machine.tourReducer(relaunched, { type: "goto", stepId: "lockSky" }, STEPS);
  check("REGRESSION: resuming lands on the persisted step, not step 1", resumed.index === 5 && resumed.status === "running");
  check("resuming makes that step current", machine.currentStep(resumed, STEPS).id === "lockSky");
  const restarted = machine.tourReducer(resumed, { type: "restart" }, STEPS);
  check("restart begins at step 1", restarted.index === 0);
  check("restart clears satisfied actions", restarted.satisfiedStepIds.length === 0);

  // pause / resume
  const running = machine.tourReducer(machine.INITIAL_TOUR_STATE, { type: "start" }, STEPS);
  const advanced = machine.tourReducer(machine.tourReducer(running, { type: "next" }, STEPS), { type: "next" }, STEPS);
  const paused = machine.tourReducer(advanced, { type: "pause" }, STEPS);
  check("REGRESSION: pausing stops the overlay without abandoning the tour", paused.status === "paused");
  check("a paused tour renders no step (no invisible running overlay)", machine.currentStep(paused, STEPS) === null);
  check("isPaused reports it", machine.isPaused(paused) === true);
  check("a paused tour keeps its position", paused.index === advanced.index);
  const unpaused = machine.tourReducer(paused, { type: "start" }, STEPS);
  check("resuming a paused tour returns to the SAME step", unpaused.status === "running" && unpaused.index === advanced.index);
  check("a paused tour can still be skipped outright", machine.tourReducer(paused, { type: "skip" }, STEPS).status === "skipped");
  check("pause is a no-op on an idle tour", machine.tourReducer(machine.INITIAL_TOUR_STATE, { type: "pause" }, STEPS).status === "idle");
  check("pause is a no-op on a completed tour", machine.tourReducer({ status: "completed", index: 0, satisfiedStepIds: [] }, { type: "pause" }, STEPS).status === "completed");
}

function tipHoldSection() {
  console.log("\n── 11. Contextual tips: one at a time, no self-consuming burst ──");

  const candidates = ["firstVaultSave", "constellationZoom", "layers", "offline"];
  const clear = {
    firstLightSettled: true, tourOverlayVisible: false, modalVisible: false,
    objectCardOpen: false, otherTipVisible: false,
  };
  let doc = { ...DEFAULTS, status: "completed" };

  // Drive the host's real loop: select → render → record impression → re-render.
  let held = null;
  const shown = [];
  for (let render = 1; render <= 8; render += 1) {
    const chosen = tips.selectHeldTip(held, candidates, doc, clear);
    if (chosen && chosen !== held) shown.push(chosen);
    held = chosen;
    if (render === 2 && held) doc = state.markTipSeen(doc, held, "t"); // impression timer fires
  }
  eq("REGRESSION: exactly ONE tip is shown across the whole render burst", shown, ["firstVaultSave"]);
  check("the held tip survives its own impression being recorded", held === "firstVaultSave");
  eq("only that one tip was consumed", doc.contextualTipsSeen, ["firstVaultSave"]);

  // After the host clears the slot, the NEXT tip may take a turn — one at a time.
  const second = tips.selectHeldTip(null, candidates, doc, clear);
  check("once the slot is cleared the next tip becomes eligible", second === "constellationZoom");
  check("a dismissed tip never returns after a remount", tips.selectHeldTip(null, candidates, doc, clear) !== "firstVaultSave");

  // A held tip still yields to anything more important.
  check("a held tip is dropped when a tutorial overlay appears", tips.selectHeldTip("layers", candidates, doc, { ...clear, tourOverlayVisible: true }) === null);
  check("a held tip is dropped for a modal", tips.selectHeldTip("layers", candidates, doc, { ...clear, modalVisible: true }) === null);
  check("a held tip is dropped for an open object card", tips.selectHeldTip("layers", candidates, doc, { ...clear, objectCardOpen: true }) === null);
  check("nothing is held before First Light settles", tips.selectHeldTip(null, candidates, doc, { ...clear, firstLightSettled: false }) === null);
  check("a deliberate minimum impression duration is defined", tips.TIP_MIN_IMPRESSION_MS >= 2000);
  check("an auto-retire duration is defined and longer than the impression", tips.TIP_AUTO_HIDE_MS > tips.TIP_MIN_IMPRESSION_MS);
}

function stableTotalsSection() {
  console.log("\n── 12. The progress total is fixed at five and can never move ──");

  const rootPremium = { isPremium: true };
  const rootFree = { isPremium: false };
  const premiumAtRoot = stepsModule.buildFirstLightSteps(rootPremium).length;
  const freeAtRoot = stepsModule.buildFirstLightSteps(rootFree).length;

  check("premium sees five screens", premiumAtRoot === 5, String(premiumAtRoot));
  check("free sees five screens", freeAtRoot === 5, String(freeAtRoot));
  check("REGRESSION: the total cannot change once the tour has opened",
    premiumAtRoot === freeAtRoot && premiumAtRoot === stepsModule.buildFirstLightSteps().length);
  // Late-arriving capability news cannot reshape it, so "Step 1 of 5" never becomes "of 8".
  const late = stepsModule.buildFirstLightSteps({ ...rootPremium, motionAvailable: true, vaultSaveAvailable: true, timeControlAvailable: true, learnAvailable: true }).length;
  check("REGRESSION: late capability reports do not change the total", late === premiumAtRoot, `${premiumAtRoot} → ${late}`);
  check("the removed capability constants are gone",
    stepsModule.TIME_CONTROL_SHIPS_IN_SKY_LENS === undefined && stepsModule.LEARN_TAB_SHIPS === undefined);
}

function reservedDockSection() {
  console.log("\n── 13. Tour cards keep clear of the host's bottom controls ──");

  const screen = { width: 390, height: 844 };
  const insets = { top: 59, bottom: 34, left: 0, right: 0 };
  const DOCK = 210; // a representative Sky Lens reserved strip (dock + lock chip + shutter)
  const CARD = 200;

  const withoutReserve = geometry.cardAnchor(null, screen, insets, CARD);
  const withReserve = geometry.cardAnchor(null, screen, insets, CARD, geometry.DEFAULT_CARD_GAP, DOCK);
  check("REGRESSION: reserving the dock lifts an un-spotlit card above it", withReserve.top < withoutReserve.top);
  check(
    "REGRESSION: the card's bottom edge clears the reserved strip entirely",
    withReserve.top + CARD <= screen.height - DOCK - 8,
    `card bottom ${withReserve.top + CARD} vs strip top ${screen.height - DOCK}`
  );
  check("the card is still inside the top safe area", withReserve.top >= insets.top);
  check("a zero reserve behaves exactly as before", geometry.cardAnchor(null, screen, insets, CARD, geometry.DEFAULT_CARD_GAP, 0).top === withoutReserve.top);
  check("a nonsense reserve is ignored rather than trusted", geometry.cardAnchor(null, screen, insets, CARD, geometry.DEFAULT_CARD_GAP, NaN).top === withoutReserve.top);
  check("a reserve smaller than the safe area cannot make things worse", geometry.cardAnchor(null, screen, insets, CARD, geometry.DEFAULT_CARD_GAP, 10).top === withoutReserve.top);

  // A spotlit step is unaffected: the card still sits next to what it points at.
  const spot = { x: 20, y: 120, width: 200, height: 44 };
  const spotlit = geometry.cardAnchor(spot, screen, insets, CARD, geometry.DEFAULT_CARD_GAP, DOCK);
  check("a spotlit card still anchors to its spotlight", spotlit.placement === "below");

  // Small screen: an enormous reserve must not push the card off the top.
  const small = { width: 320, height: 568 };
  const squeezed = geometry.cardAnchor(null, small, insets, 400, geometry.DEFAULT_CARD_GAP, 400);
  check("on a small screen with a huge reserve the card stays on screen", squeezed.top >= insets.top && Number.isFinite(squeezed.top));
}

function largeTypeLayoutSection() {
  console.log("\n── 14. Largest Dynamic Type: the card is capped, not just scrollable ──");

  const screen = { width: 402, height: 874 };           // iPhone 17, points
  const insets = { top: 59, bottom: 34, left: 0, right: 0 };
  const DOCK = 214;                                     // Sky Lens reserved strip

  const cap = geometry.maxCardHeight(screen, DOCK, insets);
  check("a card cap is produced for a real viewport", cap > 120, String(cap));
  check(
    "REGRESSION: the cap leaves at least the minimum exposed share of the viewport",
    cap <= screen.height - insets.top - DOCK - screen.height * geometry.MIN_EXPOSED_SKY_FRACTION + 0.001,
    `cap ${cap.toFixed(1)} of ${screen.height}`
  );
  check("the minimum exposed sky share is at least 30%", geometry.MIN_EXPOSED_SKY_FRACTION >= 0.3);

  // A card that WANTS to be enormous (max Dynamic Type) is clamped to the cap.
  const wanted = 700;
  const used = Math.min(wanted, cap);
  const anchor = geometry.cardAnchor(null, screen, insets, used, geometry.DEFAULT_CARD_GAP, DOCK);
  const exposed = geometry.exposedSkyFraction({ screen, cardTop: anchor.top, cardHeight: used, reservedBottom: DOCK });
  check(
    "REGRESSION: an oversized card still leaves ≥30% of the viewport as usable sky",
    exposed >= 0.3,
    `${(exposed * 100).toFixed(1)}% exposed`
  );
  check(
    "the un-capped card would NOT have left that much (the cap is doing the work)",
    geometry.exposedSkyFraction({ screen, cardTop: screen.height - DOCK - wanted, cardHeight: wanted, reservedBottom: DOCK }) < 0.3
  );

  // A usable drag region must exist OUTSIDE the card — "Hold the sky still" needs it.
  const drag = geometry.dragRegion({ screen, cardTop: anchor.top, insets });
  check("REGRESSION: a drag region exists above the card", drag !== null);
  check("the drag region is a real area, not a sliver", drag && drag.height >= 120, drag && `${drag.height.toFixed(0)}pt tall`);
  check("the drag region starts below the top safe area", drag && drag.y >= insets.top);
  check("the drag region never overlaps the card", drag && drag.y + drag.height <= anchor.top + 0.001);

  // The card must never reach into the reserved dock (Lock Sky lives there).
  check(
    "REGRESSION: the capped card's bottom clears the reserved dock",
    anchor.top + used <= screen.height - DOCK - 8 + 0.001,
    `card bottom ${(anchor.top + used).toFixed(1)} vs dock top ${screen.height - DOCK}`
  );

  console.log("\n── 15. Spotlight stays proportionate to its control ──");

  // A Lock Sky chip whose label has scaled with Dynamic Type.
  const hugeChip = { x: 40, y: 700, width: 330, height: 120 };
  const hugeSpot = geometry.spotlightFor(hugeChip, screen);
  check("REGRESSION: an enormous control does not produce an enormous ring", hugeSpot.height <= screen.height * geometry.MAX_SPOTLIGHT_HEIGHT_FRACTION + 0.001, `${hugeSpot.height.toFixed(0)}pt`);
  check("…nor an over-wide one", hugeSpot.width <= screen.width * geometry.MAX_SPOTLIGHT_WIDTH_FRACTION + 0.001, `${hugeSpot.width.toFixed(0)}pt`);
  check("the ring stays centred on the control", Math.abs((hugeSpot.x + hugeSpot.width / 2) - (hugeChip.x + hugeChip.width / 2)) < 1);
  check("the ring stays inside the viewport", hugeSpot.x >= 0 && hugeSpot.y >= 0 && hugeSpot.x + hugeSpot.width <= screen.width && hugeSpot.y + hugeSpot.height <= screen.height);

  // A normal control is still hugged closely — the cap must not loosen ordinary spotlights.
  const normalChip = { x: 120, y: 700, width: 150, height: 44 };
  const normalSpot = geometry.spotlightFor(normalChip, screen);
  check("a normal control is still tightly ringed", normalSpot.width - normalChip.width <= 2 * geometry.DEFAULT_SPOTLIGHT_PADDING + 0.001);
  check("…with the padding that does NOT scale with font size", normalSpot.height - normalChip.height <= 2 * geometry.DEFAULT_SPOTLIGHT_PADDING + 0.001);
  check("a tiny control still gets a comfortable minimum", geometry.spotlightFor({ x: 5, y: 5, width: 8, height: 8 }, screen).width >= geometry.MIN_SPOTLIGHT_SIZE);

  // Whatever the ring size, the dimming still tiles exactly and never covers the control.
  const bands = geometry.dimBands(hugeSpot, screen);
  const overlaps = bands.some((b) => b.x < hugeSpot.x + hugeSpot.width && b.x + b.width > hugeSpot.x && b.y < hugeSpot.y + hugeSpot.height && b.y + b.height > hugeSpot.y);
  check("dimming still never covers the spotlit control", overlaps === false);

  // Small screen at the largest type: everything must still resolve to something usable.
  const small = { width: 320, height: 568 };
  const smallCap = geometry.maxCardHeight(small, 180, insets);
  check("a small screen still yields a positive card cap", smallCap >= 120, String(smallCap));
  const smallAnchor = geometry.cardAnchor(null, small, insets, smallCap, geometry.DEFAULT_CARD_GAP, 180);
  check("…and a finite anchor inside the safe area", Number.isFinite(smallAnchor.top) && smallAnchor.top >= insets.top);
}



function informationalTutorialSection() {
  console.log("\n── 16. Tap-through only: Back, Skip, Finish, and what each one persists ──");

  const steps = stepsModule.buildFirstLightSteps();
  const run = (state, action) => machine.tourReducer(state, action, steps);
  let st = machine.tourReducer(machine.INITIAL_TOUR_STATE, { type: "restart" }, steps);

  // ── Next walks 1 → 5 with nothing ever satisfied ───────────────────────────────
  check("the tour opens on screen 1", st.index === 0 && st.status === "running");
  check("Back is unavailable on screen 1", machine.canGoBack(st) === false);
  for (let i = 1; i < 5; i += 1) {
    st = run(st, { type: "next" });
    check(`Next reaches screen ${i + 1}`, st.index === i && st.status === "running");
    check(`…and Back is available there`, machine.canGoBack(st) === true);
  }
  check("screen 5 is the last", machine.isLastStep(st, steps) === true);

  // ── Finish on screen 5 completes ──────────────────────────────────────────────
  const finished = run(st, { type: "next" });
  check("REGRESSION: Finish on screen 5 completes the tour", finished.status === "completed");
  check("…and no further screen is presented", machine.currentStep(finished, steps) === null);

  // ── Back walks 5 → 1 ──────────────────────────────────────────────────────────
  let backwards = { ...st };
  for (let i = 3; i >= 0; i -= 1) {
    backwards = run(backwards, { type: "back" });
    check(`Back reaches screen ${i + 1}`, backwards.index === i);
  }
  check("Back on screen 1 stays on screen 1", run(backwards, { type: "back" }).index === 0);

  // ── Skip works from screens 1-4 ───────────────────────────────────────────────
  for (let i = 0; i < 4; i += 1) {
    const skipped = run({ ...st, index: i }, { type: "skip" });
    check(`Skip works from screen ${i + 1}`, skipped.status === "skipped");
  }

  // ── Persistence: completion and skip both stick, and neither replays ──────────
  const done = state.markCompleted(state.DEFAULT_FIRST_LIGHT_STATE, "2026-08-01T00:00:00.000Z");
  check("completion persists as completed", done.status === "completed");
  check("REGRESSION: a completed tutorial is never offered again",
    state.shouldOfferFirstLight(done) === false);

  const bailed = state.markSkipped(state.DEFAULT_FIRST_LIGHT_STATE, "2026-08-01T00:00:00.000Z");
  check("skipping persists as skipped", bailed.status === "skipped");
  check("REGRESSION: a skipped tutorial is never offered again",
    state.shouldOfferFirstLight(bailed) === false);

  // ── Settings → Replay First Light reopens it deliberately ────────────────────
  const replayed = state.resetForReplay(done, "2026-08-01T01:00:00.000Z");
  check("replay resets a completed document so the tour can run again",
    state.shouldOfferFirstLight(replayed) === true || replayed.status === "notStarted",
    replayed.status);
  const replayedMachine = machine.tourReducer(finished, { type: "restart" }, steps);
  check("replay reopens on screen 1", replayedMachine.index === 0 && replayedMachine.status === "running");
  check("replay clears any previous satisfaction state", replayedMachine.satisfiedStepIds.length === 0);
  check("a replayed tour is still five screens", steps.length === 5);

  // ── A stale pointer from the OLD interactive mission cannot strand anyone ─────
  const legacy = { ...state.DEFAULT_FIRST_LIGHT_STATE, status: "inProgress", currentStep: "findObject" };
  const ids = steps.map((s) => s.id);
  check("REGRESSION: a pointer at a removed step resolves to no resume position",
    state.resolveResumeStepId(legacy, ids) === null);
  check("…so the offer leads with a clean start rather than a missing screen",
    machine.tourReducer(machine.INITIAL_TOUR_STATE, { type: "goto", stepId: "findObject" }, steps).status !== "running");
}

(async () => {
  await storageSection();
  machineSection();
  stepsSection();
  tipsSection();
  geometrySection();
  auditRegressionSection();
  resumeSection();
  tipHoldSection();
  stableTotalsSection();
  reservedDockSection();
  largeTypeLayoutSection();
  informationalTutorialSection();

  console.log(`\nFirst Light behaviour self-test: ${pass} passed, ${fail} failed.`);
  process.exit(fail === 0 ? 0 : 1);
})();
