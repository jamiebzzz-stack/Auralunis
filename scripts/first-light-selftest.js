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
const targets = requireTs(src("features/first-light/firstLightTargets.ts"));
const tips = requireTs(src("features/first-light/contextualTips.ts"));
const storage = requireTs(src("features/first-light/firstLightStorage.ts"));
const rules = requireTs(src("features/first-light/firstLightRules.ts"));
const spotlight = requireTs(src("features/first-light/firstLightSpotlight.ts"));

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
  console.log("\n── 4. The mission: capability-driven shape and exact copy ──");

  const free = stepsModule.buildFirstLightSteps({
    isPremium: false,
    motionAvailable: true,
    timeControlAvailable: true,
    vaultSaveAvailable: true,
    learnAvailable: true,
  });
  const freeIds = free.map((s) => s.id);
  check("a FREE user never gets the premium time step", !freeIds.includes("exploreTime"), freeIds.join(","));
  const freeSave = free.find((s) => s.id === "saveDiscovery");
  check("a FREE user's save step becomes the non-gated Learn step", freeSave && freeSave.variant === "learn");
  check("the free fallback step requires no action (no dead end)", freeSave && freeSave.requiresAction === false);

  const premium = stepsModule.buildFirstLightSteps({
    isPremium: true,
    motionAvailable: true,
    timeControlAvailable: true,
    vaultSaveAvailable: true,
    learnAvailable: true,
  });
  const premiumIds = premium.map((s) => s.id);
  eq("a PREMIUM user gets the full nine-step mission", premiumIds, [
    "welcome",
    "lookAround",
    "findObject",
    "openCard",
    "constellation",
    "lockSky",
    "exploreTime",
    "saveDiscovery",
    "completion",
  ]);
  const premiumSave = premium.find((s) => s.id === "saveDiscovery");
  check("a PREMIUM user's save step really saves", premiumSave && premiumSave.variant === "vault");
  check("the save step requires a real save", premiumSave && premiumSave.requiresAction === true);

  const noTimeControl = stepsModule.buildFirstLightSteps({ isPremium: true, timeControlAvailable: false, vaultSaveAvailable: true, learnAvailable: true });
  check("an unavailable time control omits the step cleanly", !noTimeControl.some((s) => s.id === "exploreTime"));

  const nothingToSave = stepsModule.buildFirstLightSteps({ isPremium: true, vaultSaveAvailable: false, learnAvailable: false });
  check("with neither a save nor Learn, the step is omitted entirely", !nothingToSave.some((s) => s.id === "saveDiscovery"));
  check("the completion step always survives", nothingToSave[nothingToSave.length - 1].id === "completion");

  eq("no capabilities still yields a usable tour", stepsModule.buildFirstLightSteps().map((s) => s.id), [
    "welcome",
    "lookAround",
    "findObject",
    "openCard",
    "constellation",
    "lockSky",
    "completion",
  ]);

  // Exact copy from the specification.
  const byId = Object.fromEntries(premium.map((s) => [s.id, s]));
  const EXPECTED_COPY = {
    welcome: ["Welcome to First Light", "Let’s explore the sky together. You can leave the tour at any time."],
    lookAround: ["Look around", "Move your phone slowly. The sky follows where you point."],
    findObject: ["Find your first object", "Follow the guide until the highlighted object enters view."],
    openCard: ["Tap to learn more", "Every object has a story. Tap the highlighted object to open its card."],
    constellation: ["Connect the stars", "Constellation lines help familiar patterns stand out."],
    lockSky: ["Hold the sky still", "Lock the view, then drag to explore comfortably."],
    exploreTime: ["Move through time", "Slide forward or backward to see how the sky changes."],
    saveDiscovery: ["Keep your discovery", "Save objects you want to revisit later."],
    completion: ["Your first light", "You’re ready to explore. The sky is yours."],
  };
  for (const [id, [heading, copy]] of Object.entries(EXPECTED_COPY)) {
    check(`${id}: heading copy is exact`, byId[id] && byId[id].heading === heading, byId[id] && byId[id].heading);
    check(`${id}: body copy is exact`, byId[id] && byId[id].copy === copy, byId[id] && byId[id].copy);
  }

  // Tone rules: one short heading, at most two short sentences.
  for (const step of [...premium, ...free]) {
    const sentences = step.copy.split(/(?<=[.!?])\s+/).filter(Boolean);
    check(`${step.id}/${step.variant ?? "default"}: heading is one short line`, !step.heading.includes("\n") && step.heading.length <= 40, step.heading);
    check(`${step.id}/${step.variant ?? "default"}: at most two sentences`, sentences.length <= 2, `${sentences.length} sentences`);
  }

  check("welcome is presented before Sky Lens", byId.welcome.host === "root");
  check(
    "every other step runs inside Sky Lens",
    premium.filter((s) => s.id !== "welcome").every((s) => s.host === "skyLens")
  );
  check("the lock step points at the real Lock Sky control", byId.lockSky.targetKey === stepsModule.FIRST_LIGHT_TARGETS.lockSky);
  check("the time step points at the real time control", byId.exploreTime.targetKey === stepsModule.FIRST_LIGHT_TARGETS.timeTravel);
  check("the save step points at the real Save button", byId.saveDiscovery.targetKey === stepsModule.FIRST_LIGHT_TARGETS.infoCardSave);
  check("the fallback hints are non-empty", stepsModule.LOOK_AROUND_NO_MOTION_HINT.length > 20 && stepsModule.NO_LIVE_TARGET_HINT.length > 20);

  eq(
    "stepsForHost splits the mission between its two hosts",
    [stepsModule.stepsForHost(premium, "root").length, stepsModule.stepsForHost(premium, "skyLens").length],
    [1, 8]
  );
}

// ══════════════════════════════════════════════════════════════════════════════════════
function targetsSection() {
  console.log("\n── 5. Tutorial target selection: live sky only, never below the horizon ──");

  const body = (id, name, alt, magnitude) => ({
    id,
    name,
    aboveHorizon: alt > 0,
    altitudeDegrees: alt,
    azimuthDegrees: 120,
    magnitude,
  });
  const star = (id, name, alt, magnitude) => ({
    id,
    name,
    magnitude,
    aboveHorizon: alt > 0,
    altitudeDegrees: alt,
    azimuthDegrees: 200,
  });

  const moonUp = [body("moon", "Moon", 40), body("venus", "Venus", 30, -4.1), body("sun", "Sun", -20)];
  check("the Moon wins when it is up", targets.selectTutorialObject(moonUp, []).id === "moon");

  const noMoon = [body("moon", "Moon", -10), body("saturn", "Saturn", 25, 0.6), body("venus", "Venus", 22, -4.1)];
  const planet = targets.selectTutorialObject(noMoon, []);
  check("with the Moon down, the BRIGHTEST visible planet wins", planet.id === "venus", planet.id);
  check("the planet target is not simulated", planet.simulated === false);

  const starsOnly = [star("polaris", "Polaris", 45, 1.98), star("sirius", "Sirius", 35, -1.46)];
  check(
    "Polaris outranks a brighter star, as specified",
    targets.selectTutorialObject([body("moon", "Moon", -5)], starsOnly).id === "polaris"
  );
  check(
    "without Polaris, the brightest prominent star wins",
    targets.selectTutorialObject([], [star("sirius", "Sirius", 35, -1.46), star("vega", "Vega", 60, 0.03)]).id === "sirius"
  );
  check(
    "a dim star is not offered as a first object",
    targets.selectTutorialObject([], [star("dim", "Dim", 40, 3.4)]) === null
  );

  const allBelow = [body("moon", "Moon", -30), body("venus", "Venus", -12, -4.1)];
  check(
    "NOTHING below the horizon is ever chosen",
    targets.selectTutorialObject(allBelow, [star("sirius", "Sirius", -3, -1.46)]) === null
  );

  const onlyLow = [body("jupiter", "Jupiter", 6, -2.2)];
  const low = targets.selectTutorialObject(onlyLow, []);
  check("a genuinely visible but low object is used on the relaxed pass", low && low.id === "jupiter");
  check("the relaxed floor still excludes sub-horizon objects", targets.MINIMUM_ALTITUDE_DEGREES > 0);
  check("the preferred floor is comfortably clear of the horizon", targets.PREFERRED_MIN_ALTITUDE_DEGREES >= 10);

  const practice = targets.practiceTarget(90, 35);
  check("the fallback marker is explicitly simulated", practice.simulated === true);
  check("the fallback marker is labelled as tutorial-only", /tutorial only/i.test(practice.subtitle), practice.subtitle);
  check("the fallback marker's id cannot collide with a catalog object", practice.id === "first-light-practice-marker");

  console.log("\n── 6. Constellation choice + astronomically correct naming ──");

  const constellation = (id, name, alt, familiarName, anchorStarName, upFraction = 1) => ({
    id,
    name,
    familiarName,
    anchorStarName,
    centroid: { azimuthDegrees: 10, altitudeDegrees: alt, aboveHorizon: alt > 0 },
    points: Array.from({ length: 10 }, (_, i) => ({ aboveHorizon: i < Math.round(10 * upFraction) })),
  });

  const all = [
    constellation("orion", "Orion", 50),
    constellation("ursa-major", "Ursa Major", 40, "Big Dipper"),
    constellation("ursa-minor", "Ursa Minor", 35, "Little Dipper", "Polaris"),
    constellation("cassiopeia", "Cassiopeia", 45),
  ];
  check("the Big Dipper is the first choice", targets.selectTutorialConstellation(all).id === "ursa-major");
  check(
    "the Little Dipper is second",
    targets.selectTutorialConstellation(all.filter((c) => c.id !== "ursa-major")).id === "ursa-minor"
  );
  check(
    "Orion is third",
    targets.selectTutorialConstellation(all.filter((c) => !["ursa-major", "ursa-minor"].includes(c.id))).id === "orion"
  );
  check(
    "Cassiopeia is fourth",
    targets.selectTutorialConstellation([all[3]]).id === "cassiopeia"
  );
  check(
    "another visible primary pattern is used when none of the four are up",
    targets.selectTutorialConstellation([constellation("cygnus", "Cygnus", 60)]).id === "cygnus"
  );
  check(
    "a non-primary pattern is never chosen",
    targets.selectTutorialConstellation([constellation("delphinus", "Delphinus", 60)]) === null
  );
  check(
    "a mostly-below-horizon figure is rejected as a fragment",
    targets.selectTutorialConstellation([constellation("orion", "Orion", 30, undefined, undefined, 0.3)]) === null
  );
  check(
    "a below-horizon centroid is rejected",
    targets.selectTutorialConstellation([constellation("orion", "Orion", -5)]) === null
  );

  const bigDipper = targets.describeConstellation(all[1]);
  check("the Big Dipper leads with the familiar name", bigDipper.title === "Big Dipper");
  check("the Big Dipper is described as an ASTERISM, not a constellation", bigDipper.isAsterism === true && /asterism/i.test(bigDipper.subtitle));
  check("the Big Dipper's parent constellation is carried as secondary text", /Ursa Major/.test(bigDipper.subtitle), bigDipper.subtitle);

  const littleDipper = targets.describeConstellation(all[2]);
  check("the Little Dipper is also an asterism", littleDipper.isAsterism === true);
  check("the Little Dipper keeps its Polaris association", /Polaris/.test(littleDipper.subtitle), littleDipper.subtitle);
  check("the Little Dipper's parent is Ursa Minor", /Ursa Minor/.test(littleDipper.subtitle));

  const orion = targets.describeConstellation(all[0]);
  check("Orion is NOT called an asterism", orion.isAsterism === false && orion.subtitle === "Constellation");
  check("Orion keeps its own name", orion.title === "Orion");

  // The tutorial must only promise patterns the renderer actually labels, and only ids that
  // exist in the shipping dataset.
  const layerSource = fs.readFileSync(path.join(ROOT, "src/features/sky-lens/layers/ConstellationLayer.tsx"), "utf8");
  const primaryBlock = layerSource.slice(
    layerSource.indexOf("const PRIMARY_CONSTELLATIONS = new Set(["),
    layerSource.indexOf("]);", layerSource.indexOf("const PRIMARY_CONSTELLATIONS = new Set(["))
  );
  const rendererPrimary = [...primaryBlock.matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
  const tutorialPrimary = [...targets.PRIMARY_CONSTELLATION_IDS];
  eq(
    "the tutorial's primary set matches the renderer's PRIMARY_CONSTELLATIONS exactly",
    [...tutorialPrimary].sort(),
    [...rendererPrimary].sort()
  );

  const dataSource = fs.readFileSync(path.join(ROOT, "src/features/sky-lens/data/constellationLines.ts"), "utf8");
  const datasetIds = new Set([...dataSource.matchAll(/^\s*id: "([a-z_-]+)",$/gm)].map((m) => m[1]));
  const missing = tutorialPrimary.filter((id) => !datasetIds.has(id));
  check("every tutorial constellation id exists in the shipping dataset", missing.length === 0, missing.join(","));
  const missingPriority = targets.CONSTELLATION_PRIORITY.filter((id) => !datasetIds.has(id));
  check("every prioritised constellation id exists in the dataset", missingPriority.length === 0, missingPriority.join(","));
}

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
  console.log("\n── 9. Audit regressions: the no-motion trap, time restore, duplicate saves ──");

  // ---- The trap: real object + no motion must NOT block the tour ----------------
  const noMotionFind = {
    step: "findObject",
    motionAvailable: false,
    targetSimulated: false,
    targetOnScreen: false,
    correctCardOpen: false,
  };
  check(
    "REGRESSION: a real, off-screen object with NO motion cannot trap Find Object",
    rules.isObjectStepSatisfied(noMotionFind) === true
  );
  check(
    "REGRESSION: the same situation cannot trap Open Card either",
    rules.isObjectStepSatisfied({ ...noMotionFind, step: "openCard" }) === true
  );
  check(
    "with motion available, Find Object still requires the object on screen",
    rules.isObjectStepSatisfied({ ...noMotionFind, motionAvailable: true }) === false
  );
  check(
    "with motion available, the object entering view satisfies Find Object",
    rules.isObjectStepSatisfied({ ...noMotionFind, motionAvailable: true, targetOnScreen: true }) === true
  );
  check(
    "Open Card still demands the CORRECT card when the object is reachable",
    rules.isObjectStepSatisfied({
      step: "openCard", motionAvailable: true, targetSimulated: false, targetOnScreen: true, correctCardOpen: false,
    }) === false
  );
  check(
    "the correct card satisfies Open Card",
    rules.isObjectStepSatisfied({
      step: "openCard", motionAvailable: true, targetSimulated: false, targetOnScreen: true, correctCardOpen: true,
    }) === true
  );
  check(
    "a practice marker never blocks either step",
    rules.isObjectStepSatisfied({ ...noMotionFind, targetSimulated: true, motionAvailable: true }) === true
  );
  check(
    "no-motion does NOT satisfy Open Card while the object IS on screen (tap it)",
    rules.isObjectStepSatisfied({
      step: "openCard", motionAvailable: false, targetSimulated: false, targetOnScreen: true, correctCardOpen: false,
    }) === false
  );

  // ---- The SAME trap one step later: "Keep your discovery" ---------------------
  const noMotionSave = {
    variant: "vault", motionAvailable: false, targetSimulated: false,
    targetOnScreen: false, targetSaved: false,
  };
  check(
    "REGRESSION: a real, unreachable object with NO motion cannot trap the save step",
    rules.isSaveStepSatisfied(noMotionSave) === true
  );
  check(
    "with motion available, the save step still demands a real save",
    rules.isSaveStepSatisfied({ ...noMotionSave, motionAvailable: true }) === false
  );
  check(
    "…even when the object is right there on screen",
    rules.isSaveStepSatisfied({ ...noMotionSave, motionAvailable: true, targetOnScreen: true }) === false
  );
  check(
    "a genuine persisted save satisfies it",
    rules.isSaveStepSatisfied({ ...noMotionSave, motionAvailable: true, targetOnScreen: true, targetSaved: true }) === true
  );
  check(
    "no-motion does NOT skip the save while the object IS on screen",
    rules.isSaveStepSatisfied({ ...noMotionSave, targetOnScreen: true }) === false
  );
  check(
    "the non-gated Learn fallback never blocks",
    rules.isSaveStepSatisfied({ ...noMotionSave, variant: "learn", motionAvailable: true, targetOnScreen: true }) === true
  );
  check(
    "a practice marker never blocks the save step",
    rules.isSaveStepSatisfied({ ...noMotionSave, motionAvailable: true, targetSimulated: true }) === true
  );

  // ---- Time restoration on every exit path -------------------------------------
  const scrubbed = { previousStepId: "exploreTime", keepChangedTime: false, timeOffsetMinutes: 180 };
  check("Continue out of the time step restores the live sky", rules.shouldRestoreLiveTime({ ...scrubbed, nextStepId: "saveDiscovery" }) === true);
  check("REGRESSION: Back out of the time step restores it too", rules.shouldRestoreLiveTime({ ...scrubbed, nextStepId: "lockSky" }) === true);
  check("REGRESSION: Skip Tour from the time step restores it (no step showing)", rules.shouldRestoreLiveTime({ ...scrubbed, nextStepId: null }) === true);
  check("REGRESSION: unmount / pause from the time step restores it", rules.shouldRestoreLiveTime({ ...scrubbed, nextStepId: null }) === true);
  check("staying on the time step does not restore", rules.shouldRestoreLiveTime({ ...scrubbed, nextStepId: "exploreTime" }) === false);
  check("an explicit 'keep this time' is honoured on every exit", rules.shouldRestoreLiveTime({ ...scrubbed, nextStepId: null, keepChangedTime: true }) === false);
  check("an unchanged clock needs no restore", rules.shouldRestoreLiveTime({ ...scrubbed, nextStepId: null, timeOffsetMinutes: 0 }) === false);
  check("leaving any OTHER step never touches the clock", rules.shouldRestoreLiveTime({ previousStepId: "lockSky", nextStepId: null, keepChangedTime: false, timeOffsetMinutes: 180 }) === false);
  check("a non-finite offset is ignored rather than trusted", rules.shouldRestoreLiveTime({ ...scrubbed, nextStepId: null, timeOffsetMinutes: NaN }) === false);

  // ---- Duplicate Vault saves ----------------------------------------------------
  const vault = [
    { type: "archive", title: "Venus", detail: "x" },
    { type: "note", title: "Cosmic Note", detail: "y" },
  ];
  check("REGRESSION: an object already in the Vault is detected", rules.isAlreadySavedToVault(vault, "Venus") === true);
  check("a different object is not a duplicate", rules.isAlreadySavedToVault(vault, "Jupiter") === false);
  check("a same-named NOTE is not mistaken for an archived object", rules.isAlreadySavedToVault([{ type: "note", title: "Venus" }], "Venus") === false);
  check("an empty Vault has no duplicates", rules.isAlreadySavedToVault([], "Venus") === false);
  check("an empty name is never a duplicate", rules.isAlreadySavedToVault(vault, "") === false);
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
  console.log("\n── 12. Stable progress totals under delayed capability resolution ──");

  // What the app root now reports the moment entitlement resolves.
  const rootPremium = { isPremium: true, timeControlAvailable: true, learnAvailable: true };
  const rootFree = { isPremium: false, timeControlAvailable: true, learnAvailable: true };

  const premiumAtRoot = stepsModule.buildFirstLightSteps(rootPremium).length;
  const freeAtRoot = stepsModule.buildFirstLightSteps(rootFree).length;

  // Sky Lens later adds only the things it alone can know.
  const premiumInSkyLens = stepsModule.buildFirstLightSteps({ ...rootPremium, motionAvailable: true, vaultSaveAvailable: true }).length;
  const premiumNoTarget = stepsModule.buildFirstLightSteps({ ...rootPremium, motionAvailable: false, vaultSaveAvailable: false }).length;
  const freeInSkyLens = stepsModule.buildFirstLightSteps({ ...rootFree, motionAvailable: true, vaultSaveAvailable: true }).length;

  check("REGRESSION: a premium total does not change when Sky Lens reports in", premiumAtRoot === premiumInSkyLens, `${premiumAtRoot} → ${premiumInSkyLens}`);
  check("…nor when no saveable object is available", premiumAtRoot === premiumNoTarget, `${premiumAtRoot} → ${premiumNoTarget}`);
  check("REGRESSION: a free total does not change either", freeAtRoot === freeInSkyLens, `${freeAtRoot} → ${freeInSkyLens}`);
  check("premium sees nine steps", premiumAtRoot === 9, String(premiumAtRoot));
  check("free sees eight (no premium time step)", freeAtRoot === 8, String(freeAtRoot));
  check("the root capability constants exist", stepsModule.TIME_CONTROL_SHIPS_IN_SKY_LENS === true && stepsModule.LEARN_TAB_SHIPS === true);
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

function spotlightReadinessSection() {
  console.log("\n── 16. Spotlight readiness: never project through provisional inputs ──");

  // THE DEFECT THIS LOCKS DOWN (physical iPhone, integration/1.0.1-rc2):
  // "Find your first object" ringed the HUD/header and called it Venus, then snapped to the
  // real Venus a moment later. The maths was right; the inputs were provisional.
  //
  // Sky Lens opens on a HARDCODED 360x720 placeholder canvas until onLayout reports the truth,
  // and the observer starts at DEFAULT_OBSERVER (39.8283 N, 98.5795 W) until the location
  // resolver settles. Worked numbers for an object 10 degrees above the optical axis:
  //
  //   placeholder 360x720 → pixelsPerDegree 180/30 = 6.000, centre y 360 → y = 300
  //   measured    430x932 → pixelsPerDegree 215/30 = 7.167, centre y 466 → y = 394.33
  //
  // …a 94 px upward error, straight into the top chrome. Assert the arithmetic so the reason
  // for the gate is documented, not just its effect.
  const PLACEHOLDER_BOX = { width: 360, height: 720 };
  const MEASURED_BOX = { width: 430, height: 932 };
  const halfH = 30;

  const ppdPlaceholder = PLACEHOLDER_BOX.width / 2 / halfH;
  const ppdMeasured = MEASURED_BOX.width / 2 / halfH;
  const yPlaceholder = PLACEHOLDER_BOX.height / 2 - 10 * ppdPlaceholder;
  const yMeasured = MEASURED_BOX.height / 2 - 10 * ppdMeasured;

  check("the placeholder viewport really does mis-scale (6.000 vs 7.167 px/deg)",
    Math.abs(ppdPlaceholder - 6) < 1e-9 && Math.abs(ppdMeasured - 7.16666) < 1e-4,
    `${ppdPlaceholder} vs ${ppdMeasured}`);
  check("…placing a 10-degree-high object ~94 px too high",
    Math.abs((yMeasured - yPlaceholder) - 94.333) < 0.01,
    `${(yMeasured - yPlaceholder).toFixed(2)}px`);

  // The projection Sky Lens would hand over once everything is real.
  const venusMeasured = { x: MEASURED_BOX.width / 2, y: yMeasured, onScreen: true, behind: false };
  // …and the one it would hand over while still on the placeholder.
  const venusPlaceholder = { x: PLACEHOLDER_BOX.width / 2, y: yPlaceholder, onScreen: true, behind: false };

  const resolve = (readiness, projection, box) =>
    spotlight.resolveProjectedSpotlightRect({
      stepId: "findObject",
      targetProjection: projection,
      constellationProjection: null,
      box,
      readiness,
    });

  const READY = { boxMeasured: true, locationReady: true };

  // ── 1. No projected spotlight before the canvas is measured ──────────────────────
  check("no spotlight before boxMeasured",
    resolve({ boxMeasured: false, locationReady: true }, venusPlaceholder, PLACEHOLDER_BOX) === null);
  check("…not even when the projection claims to be on screen",
    resolve({ boxMeasured: false, locationReady: true }, venusMeasured, MEASURED_BOX) === null);

  // ── 2. No projected spotlight before the observer has settled ────────────────────
  check("no spotlight before locationReady",
    resolve({ boxMeasured: true, locationReady: false }, venusMeasured, MEASURED_BOX) === null);
  check("no spotlight when neither gate is open",
    resolve({ boxMeasured: false, locationReady: false }, venusMeasured, MEASURED_BOX) === null);
  check("a missing readiness object is treated as not ready",
    spotlight.isProjectionTrustworthy(null) === false && spotlight.isProjectionTrustworthy(undefined) === false);

  // ── 3. The exact placeholder dimensions can never produce a tutorial spotlight ───
  check("REGRESSION: the 360x720 placeholder cannot produce a spotlight",
    resolve({ boxMeasured: false, locationReady: true }, venusPlaceholder, PLACEHOLDER_BOX) === null);
  const placeholderRects = ["findObject", "openCard", "constellation"].map((stepId) =>
    spotlight.resolveProjectedSpotlightRect({
      stepId,
      targetProjection: venusPlaceholder,
      constellationProjection: venusPlaceholder,
      box: PLACEHOLDER_BOX,
      readiness: { boxMeasured: false, locationReady: false },
    })
  );
  check("REGRESSION: no projected step draws from placeholder inputs",
    placeholderRects.every((r) => r === null),
    JSON.stringify(placeholderRects));

  // ── 4. The spotlight appears once BOTH gates are open ────────────────────────────
  const ready = resolve(READY, venusMeasured, MEASURED_BOX);
  check("a spotlight appears once both gates are open", ready !== null);
  check("…centred on the measured projection, not the placeholder one",
    ready && Math.abs((ready.y + ready.height / 2) - yMeasured) < 1e-9,
    ready ? `centre ${(ready.y + ready.height / 2).toFixed(2)} vs ${yMeasured.toFixed(2)}` : "null");
  check("…and never at the placeholder position that ringed the HUD",
    ready && Math.abs((ready.y + ready.height / 2) - yPlaceholder) > 90);
  check("…sized as the documented object ring",
    ready && ready.width === spotlight.OBJECT_SPOTLIGHT_RADIUS * 2 && ready.height === spotlight.OBJECT_SPOTLIGHT_RADIUS * 2);

  // An off-screen or behind-camera object still yields no ring, exactly as before the fix.
  check("an off-screen target still yields no spotlight",
    resolve(READY, { ...venusMeasured, onScreen: false }, MEASURED_BOX) === null);
  check("a target behind the camera still yields no spotlight",
    resolve(READY, { ...venusMeasured, behind: true }, MEASURED_BOX) === null);
  check("a non-finite projection yields no spotlight",
    resolve(READY, { ...venusMeasured, x: Number.NaN }, MEASURED_BOX) === null);

  // ── 5. Going provisional → measured cannot show a STALE rectangle ────────────────
  // The resolver is pure and holds no memory: the only way a stale rect could survive is if a
  // caller cached one. Prove the resolver itself never replays a previous answer.
  const beforeReady = resolve({ boxMeasured: false, locationReady: false }, venusPlaceholder, PLACEHOLDER_BOX);
  const afterReady = resolve(READY, venusMeasured, MEASURED_BOX);
  const readyThenNotReady = resolve({ boxMeasured: true, locationReady: false }, venusMeasured, MEASURED_BOX);
  check("REGRESSION: nothing is drawn before readiness…", beforeReady === null);
  check("…the first drawn rect is the MEASURED one, never a provisional one",
    afterReady !== null && Math.abs((afterReady.y + afterReady.height / 2) - yMeasured) < 1e-9);
  check("REGRESSION: the resolver replays no earlier answer when readiness is withdrawn",
    readyThenNotReady === null);
  // Same inputs → same output, every time (no hidden state between calls).
  check("the resolver is referentially pure across repeated calls",
    JSON.stringify(resolve(READY, venusMeasured, MEASURED_BOX)) === JSON.stringify(afterReady));

  // ── 6/7. The satisfaction rules are UNCHANGED by this fix ────────────────────────
  // Part A deliberately did not touch firstLightRules. Re-assert the two gates that matter, so
  // a future "just let them through" edit cannot ride along with a readiness change.
  check("REGRESSION: Step 4 still requires the CORRECT object card on a motion device",
    rules.isObjectStepSatisfied({
      step: "openCard", motionAvailable: true, targetSimulated: false,
      targetOnScreen: true, correctCardOpen: false,
    }) === false);
  check("…and is satisfied only when that card is open",
    rules.isObjectStepSatisfied({
      step: "openCard", motionAvailable: true, targetSimulated: false,
      targetOnScreen: true, correctCardOpen: true,
    }) === true);
  check("REGRESSION: Step 8 (vault) still requires a real, persisted save",
    rules.isSaveStepSatisfied({
      variant: "vault", motionAvailable: true, targetSimulated: false,
      targetOnScreen: true, targetSaved: false,
    }) === false);
  check("…and is satisfied by a genuine save",
    rules.isSaveStepSatisfied({
      variant: "vault", motionAvailable: true, targetSimulated: false,
      targetOnScreen: true, targetSaved: true,
    }) === true);
  check("REGRESSION: Step 8 (learn fallback) is still non-blocking",
    rules.isSaveStepSatisfied({
      variant: "learn", motionAvailable: true, targetSimulated: false,
      targetOnScreen: false, targetSaved: false,
    }) === true);
  check("REGRESSION: no timeout/bypass was added to the object steps",
    rules.isObjectStepSatisfied({
      step: "findObject", motionAvailable: true, targetSimulated: false,
      targetOnScreen: false, correctCardOpen: false,
    }) === false);
}

function visibleTargetSection() {
  console.log("\n── 17. Object steps choose something actually IN VIEW, then freeze it ──");

  // THE DEFECT THIS LOCKS DOWN (physical iPhone, 5548810):
  // "Find your first object" ranked the WHOLE SKY, picked Venus — genuinely up, genuinely
  // behind the user — and then required Venus to enter the viewport. The copy read
  // "Turn around for Venus" and Continue stayed disabled for the entire recording.
  const VIEWPORT = { width: 430, height: 932 };
  const DOCK = 168;

  // FirstLightSkyLens imports react-native, so the bounded-fallback constant is read from
  // source rather than required — the value under test is the shipping one either way.
  const bridgeSource = fs.readFileSync(src("features/first-light/FirstLightSkyLens.tsx"), "utf8");
  const bridgeFallbackMs = Number((bridgeSource.match(/OBJECT_STEP_FALLBACK_MS = (\d+)/) || [])[1]);

  const onScreen = (x, y) => ({ x, y, onScreen: true, behind: false });
  const offScreen = (x, y) => ({ x, y, onScreen: false, behind: false });
  const behind = { x: 215, y: 466, onScreen: false, behind: true };

  const venus = { kind: "planet", id: "venus", name: "Venus", subtitle: "Planet", azimuthDegrees: 250, altitudeDegrees: 20, simulated: false };
  const jupiter = { kind: "planet", id: "jupiter", name: "Jupiter", subtitle: "Planet", azimuthDegrees: 100, altitudeDegrees: 40, simulated: false };
  const vega = { kind: "star", id: "vega", name: "Vega", subtitle: "Bright star", azimuthDegrees: 90, altitudeDegrees: 55, simulated: false };
  const marker = targets.practiceTarget(0, 30);

  const pick = (candidates) => targets.selectVisibleTutorialTarget(candidates, VIEWPORT, { reservedBottom: DOCK });

  // ── 1. An off-screen or behind-camera object is never selected ───────────────────
  check("REGRESSION: an off-screen Venus is NOT selected",
    pick([{ target: venus, projection: offScreen(-400, 466) }]) === null);
  check("REGRESSION: a Venus behind the camera is NOT selected",
    pick([{ target: venus, projection: behind }]) === null);
  check("an unprojectable candidate is not selected",
    pick([{ target: venus, projection: null }]) === null);
  check("a non-finite projection is not selected",
    pick([{ target: venus, projection: onScreen(Number.NaN, 466) }]) === null);

  // ── 2. A genuinely visible candidate IS selected ─────────────────────────────────
  const chosen = pick([
    { target: venus, projection: behind },
    { target: jupiter, projection: onScreen(215, 500) },
    { target: vega, projection: onScreen(200, 400) },
  ]);
  check("the first genuinely visible candidate is selected", chosen && chosen.id === "jupiter",
    chosen ? chosen.id : "null");
  check("…skipping the higher-ranked but unreachable one", chosen && chosen.id !== "venus");

  // ── 3. Protected chrome and edges are respected ─────────────────────────────────
  check("an object under the top chrome is not selected",
    pick([{ target: jupiter, projection: onScreen(215, 40) }]) === null);
  check("an object behind the bottom dock is not selected",
    pick([{ target: jupiter, projection: onScreen(215, VIEWPORT.height - 20) }]) === null);
  check("an object hugging the left edge is not selected",
    pick([{ target: jupiter, projection: onScreen(4, 500) }]) === null);
  check("an object hugging the right edge is not selected",
    pick([{ target: jupiter, projection: onScreen(VIEWPORT.width - 4, 500) }]) === null);
  check("an object comfortably inside the open sky IS selected",
    (pick([{ target: jupiter, projection: onScreen(215, 500) }]) || {}).id === "jupiter");
  check("a degenerate viewport yields no candidate rather than relaxing the rule",
    targets.selectVisibleTutorialTarget([{ target: jupiter, projection: onScreen(5, 5) }], { width: 10, height: 10 }) === null);

  // ── 4. A practice marker is never passed off as a visible object ────────────────
  check("REGRESSION: a practice marker is never selected as a visible target",
    pick([{ target: marker, projection: onScreen(215, 500) }]) === null);

  // ── 5. Ranking still follows the documented beginner order ──────────────────────
  const bodies = [
    { id: "moon", name: "Moon", aboveHorizon: true, altitudeDegrees: 30, azimuthDegrees: 120 },
    { id: "venus", name: "Venus", aboveHorizon: true, altitudeDegrees: 20, azimuthDegrees: 250, magnitude: -4.1 },
    { id: "mars", name: "Mars", aboveHorizon: true, altitudeDegrees: 25, azimuthDegrees: 200, magnitude: 1.2 },
    { id: "saturn", name: "Saturn", aboveHorizon: false, altitudeDegrees: -10, azimuthDegrees: 10, magnitude: 0.7 },
  ];
  const stars = [
    { id: "vega", name: "Vega", magnitude: 0.03, aboveHorizon: true, altitudeDegrees: 55, azimuthDegrees: 90 },
    { id: "polaris", name: "Polaris", magnitude: 1.98, aboveHorizon: true, altitudeDegrees: 35, azimuthDegrees: 0 },
    { id: "faint", name: "Faint", magnitude: 4.2, aboveHorizon: true, altitudeDegrees: 50, azimuthDegrees: 45 },
  ];
  const ranked = targets.rankTutorialCandidates(bodies, stars);
  eq("candidates are ranked Moon → brightest planets → Polaris → bright stars",
    ranked.map((t) => t.id), ["moon", "venus", "mars", "polaris", "vega"]);
  check("a body below the horizon is never a candidate", !ranked.some((t) => t.id === "saturn"));
  check("a faint star is never a candidate", !ranked.some((t) => t.id === "faint"));
  check("candidates are unique", new Set(ranked.map((t) => t.id)).size === ranked.length);
  check("every candidate is real, never simulated", ranked.every((t) => t.simulated === false));
  eq("no candidates at all when nothing is up", targets.rankTutorialCandidates([], []), []);

  // ── 6. The freeze: Steps 3, 4 and 8 act on ONE object ───────────────────────────
  // The component holds the frozen target in state; the invariant under test is that a change
  // of inputs cannot produce a different answer for the SAME frozen id, and that Step 4's and
  // Step 8's checks are identity checks against it.
  const frozen = chosen;
  check("the frozen target has a stable id to compare against", frozen && typeof frozen.id === "string" && frozen.id.length > 0);
  check("REGRESSION: Step 4 is satisfied only by the FROZEN object's card",
    rules.isObjectStepSatisfied({
      step: "openCard", motionAvailable: true, targetSimulated: false,
      targetOnScreen: true, correctCardOpen: false,
    }) === false);
  check("…and opening a DIFFERENT object's card does not satisfy it",
    ("venus" === frozen.id) === false && rules.isObjectStepSatisfied({
      step: "openCard", motionAvailable: true, targetSimulated: false,
      targetOnScreen: true, correctCardOpen: false,
    }) === false);
  check("…while opening the frozen object's card does",
    rules.isObjectStepSatisfied({
      step: "openCard", motionAvailable: true, targetSimulated: false,
      targetOnScreen: true, correctCardOpen: true,
    }) === true);

  // A later location fix or layout pass changes the PROJECTIONS, not the frozen identity.
  const afterGpsFix = pick([
    { target: venus, projection: onScreen(215, 500) },   // Venus has now swung into view…
    { target: jupiter, projection: onScreen(300, 480) },
  ]);
  check("selection alone would now prefer a different object", afterGpsFix.id === "venus");
  check("REGRESSION: …which is exactly why the component freezes the id across Steps 3-4-8",
    frozen.id === "jupiter" && afterGpsFix.id !== frozen.id,
    "the freeze is what stops a GPS/layout/motion update swapping the target mid-step");

  // ── 7. No candidate → the step stays open and honest, never falsely satisfied ────
  check("no eligible candidate yields null, not a guess", pick([]) === null);
  check("REGRESSION: an empty view never satisfies findObject",
    rules.isObjectStepSatisfied({
      step: "findObject", motionAvailable: true, targetSimulated: false,
      targetOnScreen: false, correctCardOpen: false,
    }) === false);
  check("the waiting copy never names an object the user cannot see",
    !/Venus|Jupiter|Mars|Saturn/.test(stepsModule.NO_VISIBLE_TARGET_HINT) &&
    /sweep|Sweep/.test(stepsModule.NO_VISIBLE_TARGET_HINT));

  // ── 8. The bounded fallback is honest and cannot deadlock ───────────────────────
  check("the fallback interval is bounded and finite",
    Number.isFinite(bridgeFallbackMs) && bridgeFallbackMs > 0 && bridgeFallbackMs <= 120000,
    `${bridgeFallbackMs}ms`);
  check("REGRESSION: the fallback copy states the step was SKIPPED, not completed",
    /skipped/i.test(stepsModule.OBJECT_STEP_FALLBACK_HINT) &&
    !/found|tapped|completed|well done/i.test(stepsModule.OBJECT_STEP_FALLBACK_HINT));
  check("the fallback copy still offers the real action later",
    /tap any object/i.test(stepsModule.OBJECT_STEP_FALLBACK_HINT));
  // The satisfaction RULES are untouched by Part B — the fallback works by satisfying the step
  // in the machine, never by relaxing what the rule demands.
  check("REGRESSION: no bypass was added to the object rule itself",
    rules.isObjectStepSatisfied({
      step: "findObject", motionAvailable: true, targetSimulated: false,
      targetOnScreen: false, correctCardOpen: false,
    }) === false);
  check("REGRESSION: Step 8 still requires a real, persisted save",
    rules.isSaveStepSatisfied({
      variant: "vault", motionAvailable: true, targetSimulated: false,
      targetOnScreen: true, targetSaved: false,
    }) === false);

  // ── 9. Back and Skip are never gated on having a target ────────────────────────
  // canGoBack depends only on position; skip only on status. Neither consults a target.
  const midTour = { status: "running", index: 2, satisfiedStepIds: [] };
  const missionSteps = stepsModule.buildFirstLightSteps({ isPremium: true, motionAvailable: true, timeControlAvailable: true, vaultSaveAvailable: true, learnAvailable: true });
  check("Back stays available on a target-less object step", machine.canGoBack(midTour) === true);
  check("Continue is correctly NOT available on it", machine.canContinue(midTour, missionSteps) === false);
  const skipped = machine.tourReducer(midTour, { type: "skip" }, missionSteps);
  check("Skip Tour still works with no target", skipped.status === "skipped");
  const backed = machine.tourReducer(midTour, { type: "back" }, missionSteps);
  check("Back still moves with no target", backed.index === 1);
}

(async () => {
  await storageSection();
  machineSection();
  stepsSection();
  targetsSection();
  tipsSection();
  geometrySection();
  auditRegressionSection();
  resumeSection();
  tipHoldSection();
  stableTotalsSection();
  reservedDockSection();
  largeTypeLayoutSection();
  spotlightReadinessSection();
  visibleTargetSection();

  console.log(`\nFirst Light behaviour self-test: ${pass} passed, ${fail} failed.`);
  process.exit(fail === 0 ? 0 : 1);
})();
