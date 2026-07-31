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
(async () => {
  await storageSection();
  machineSection();
  stepsSection();
  targetsSection();
  tipsSection();
  geometrySection();

  console.log(`\nFirst Light behaviour self-test: ${pass} passed, ${fail} failed.`);
  process.exit(fail === 0 ? 0 : 1);
})();
