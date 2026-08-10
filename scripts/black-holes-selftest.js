// Black Holes module self-test.
//
// The risk with this subject is not layout, it is CONFIDENT WRONGNESS. Popular science
// routinely states that black holes suck things in, that every supernova leaves one, that they
// all have accretion disks and jets, and that the singularity is understood. Each of those is
// false or unsettled, and each is easy to reintroduce while "improving" the copy. This test
// exists to make that reintroduction fail loudly.
//
// It also guards the commercial surface: the module must use the existing Learn gating and the
// current Lifetime wording, and must not invent an entitlement or reintroduce subscription copy.

const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");

const ts = require(path.join(ROOT, "node_modules/typescript"));
const Module = require("module");
require.extensions[".ts"] = function (module, filename) {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
    fileName: filename,
  });
  module._compile(outputText, filename);
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith("@/")) {
    const base = path.resolve(SRC, request.slice(2));
    for (const c of [base + ".ts", base + ".tsx", path.join(base, "index.ts")]) {
      if (fs.existsSync(c)) return c;
    }
  }
  return origResolve.call(this, request, ...rest);
};

let pass = 0, fail = 0;
const ok = (m) => { pass += 1; console.log("PASS " + m); };
const bad = (m) => { fail += 1; console.log("FAIL " + m); };
const eq = (n, a, b) => (a === b ? ok(n) : bad(`${n} — got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const has = (hay, needle, n) => (hay.includes(needle) ? ok(n) : bad(`${n} — expected present: ${needle}`));
const hasnt = (hay, needle, n) => (!hay.includes(needle) ? ok(n) : bad(`${n} — should be absent: ${needle}`));

const { learnTopics, learnCategories, isLearnLessonFree, FREE_LEARN_LESSON_IDS } =
  require(path.join(SRC, "features/learn/LearnCatalog.ts"));
const { keepBlackHolesAfterStars } =
  require(path.join(SRC, "features/learn/learnCategoryOrder.ts"));
const { premiumFeatures } =
  require(path.join(SRC, "features/paywall/MonetizationCatalog.ts"));

const topics = learnTopics.filter((t) => t.categoryId === "black_holes");
const prose = topics.map((t) => `${t.title} ${t.summary} ${t.body ?? ""} ${t.keyFacts.join(" ")}`).join("\n");

console.log("── Registry ──");

// 1. The category exists and sits between Stars and Deep Sky — stellar life cycles into what
//    some of those stars leave behind.
const ids = learnCategories.map((c) => c.id);
if (ids.includes("black_holes")) ok("1 Black Holes is registered as a Learn category");
else bad("1 Black Holes missing from the category registry");
eq("1 sits directly after Stars", ids[ids.indexOf("black_holes") - 1], "stars");
eq("1 sits directly before Deep Sky", ids[ids.indexOf("black_holes") + 1], "deep_sky");

const category = learnCategories.find((c) => c.id === "black_holes");
// Typographic glyph, matching the rest of Learn — no emoji.
if (!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}️]/u.test(category.icon)) ok(`1 icon is a plain glyph (${category.icon})`);
else bad(`1 icon uses emoji presentation: ${category.icon}`);

// Existing saved Learn preferences predate Black Holes, so personalization can otherwise push
// the new unranked category to the tail. The post-pass must preserve every category while
// keeping Stars → Black Holes adjacent.
for (const sample of [
  ["planets", "stars", "constellations", "deep_sky", "moon", "milky_way", "solar_system", "black_holes", "beginner_path"],
  ["black_holes", "moon", "stars", "planets", "deep_sky"],
  ["stars", "black_holes", "deep_sky"],
]) {
  const ordered = keepBlackHolesAfterStars(sample.map((id) => ({ id })));
  const orderedIds = ordered.map((item) => item.id);
  eq("1 personalized order keeps Black Holes directly after Stars", orderedIds.indexOf("black_holes"), orderedIds.indexOf("stars") + 1);
  eq("1 personalized order drops no category", orderedIds.length, sample.length);
  eq("1 personalized order duplicates no category", new Set(orderedIds).size, sample.length);
}

// 2. Lesson coverage.
if (topics.length >= 10) ok(`2 ${topics.length} lessons`);
else bad(`2 only ${topics.length} lessons`);
for (const required of [
  "What Is a Black Hole?", "How Black Holes Form", "Types of Black Holes", "The Event Horizon",
  "Accretion Disks", "Gravitational Lensing", "How We Detect Black Holes", "Sagittarius A*",
  "Black Hole Mergers", "What Black Holes Do Not Do", "Time, Tides & Spaghettification",
]) {
  if (topics.some((t) => t.title === required)) ok(`2 lesson present: ${required}`);
  else bad(`2 missing lesson: ${required}`);
}
if (topics.every((t) => t.body && t.body.length > 400)) ok("2 every lesson has substantial body text");
else bad("2 a lesson has thin or missing body text");
if (topics.every((t) => t.keyFacts.length >= 3)) ok("2 every lesson has at least three key facts");
else bad("2 a lesson has too few key facts");

console.log("\n── Gating ──");

// 3. Uses the EXISTING Learn gating. No new entitlement, no bespoke rule.
if (topics.every((t) => !isLearnLessonFree(t.id))) ok("3 every Black Holes lesson is premium");
else bad("3 a Black Holes lesson is unexpectedly free");
const freeIds = FREE_LEARN_LESSON_IDS.join(",");
hasnt(freeIds, "bh-", "3 no Black Holes lesson was added to the free set");
eq("3 the free-lesson count is unchanged", FREE_LEARN_LESSON_IDS.length, 3);

// 4. No new entitlement identifier anywhere in the feature.
const catalogSrc = read("src/features/learn/LearnCatalog.ts");
const visualSrc = read("src/features/learn/visuals/BlackHoleVisual.tsx");
// Scoped to the Black Holes block: the rest of the catalog legitimately discusses entitlement
// in the shared gating documentation, which this feature did not add.
const bhBlock = catalogSrc.slice(catalogSrc.indexOf("// ── Black Holes"), catalogSrc.indexOf("export const DEEP_SKY_SUBJECTS"));
for (const src of [bhBlock, visualSrc]) {
  hasnt(src, "entitlement", "4 no entitlement string introduced");
  hasnt(src, "RevenueCat", "4 no RevenueCat reference introduced");
}

// 5. No subscription wording — the current model is a one-time Lifetime purchase.
const commercial = `${prose}\n${visualSrc}`;
for (const word of ["Subscribe", "subscription", "Monthly", "Annual", "free trial", "7-day", "$9.99", "$49.99"]) {
  hasnt(commercial, word, `5 no "${word}" wording`);
}
const blackHolePaywallLine = premiumFeatures.find((feature) => /Black Holes/.test(feature));
if (blackHolePaywallLine) ok("5 Lifetime paywall names the Black Holes guide");
else bad("5 Lifetime paywall does not mention the Black Holes guide");
hasnt(blackHolePaywallLine ?? "", "subscription", "5 Black Holes paywall line does not reintroduce subscription wording");

console.log("\n── Scientific accuracy ──");

// 6. THE myths. Each of these is a claim popular science makes that is false.
const MYTHS = [
  [/black holes suck/i, "black holes suck things in"],
  [/vacuum cleaner/i, "cosmic vacuum cleaner framing"],
  [/every supernova (creates|produces|leaves)/i, "every supernova makes a black hole"],
  [/all black holes have/i, "all black holes have <feature>"],
  [/every black hole has (a disk|an accretion|jets)/i, "every black hole has a disk or jets"],
];
// Markers that the surrounding sentence is refuting the claim rather than making it.
const DEBUNK = /\bmyth\b|\bdo not\b|\bdoes not\b|\bnot every\b|\bnever\b|\bfalse\b|\bwrong\b|\bnot a property\b/i;
const sentences = prose.split(/(?<=[.!?])\s+/);
for (const [pattern, description] of MYTHS) {
  const asserted = sentences.filter((sentence, i) => {
    if (!pattern.test(sentence)) return false;
    // Allow the refutation to land in the following sentence: "…black holes suck things in.
    // They do not." is correct writing, and the correction is the whole point of the lesson.
    return !DEBUNK.test(sentence) && !DEBUNK.test(sentences[i + 1] ?? "");
  });
  if (asserted.length === 0) ok(`6 never asserts: ${description}`);
  else bad(`6 asserts a myth: ${description} — "${asserted[0].trim().slice(0, 90)}"`);
}

// 7. The corrections must be stated positively, not merely avoided.
has(prose, "Not every supernova produces one", "7 states that not every supernova leaves a black hole");
has(prose, "Not every black hole has one", "7 states that not every black hole has a disk");
has(prose, "not a property every black hole has", "7 states that jets are not universal");
has(prose, "Earth's orbit would be essentially unchanged", "7 includes the equal-mass Sun thought experiment");
has(prose, "boundary, not a physical surface", "7 describes the horizon as a boundary, not a surface");

// 8. Speculative and unsettled material must be labelled as such.
has(prose, "classical general relativity predicts", "8 singularity framed as a classical prediction");
has(prose, "quantum gravity", "8 notes the interior needs a theory we do not have");
has(prose, "hypothetical", "8 primordial black holes labelled hypothetical");
has(prose, "open research question", "8 supermassive formation flagged as unresolved");
has(prose, "no observational evidence", "8 wormholes flagged as unevidenced");

// 9. Hawking radiation, if present, must be framed as a prediction and kept distinct from
//    accretion-disk light.
if (prose.includes("Hawking radiation")) {
  has(prose, "theoretical prediction", "9 Hawking radiation framed as a prediction");
  has(prose, "distinct from the light emitted by an accretion disk", "9 distinguished from disk emission");
  has(prose, "vastly exceeds the current age of the universe", "9 evaporation timescale stated honestly");
} else {
  ok("9 Hawking radiation omitted (acceptable)");
}

// 10. The event-horizon lesson must not claim an infalling observer literally freezes.
const horizon = topics.find((t) => t.id === "bh-event-horizon");
has(horizon.body, "locally uneventful", "10 crossing is described as locally uneventful");
has(horizon.body, "not what the falling observer experiences", "10 corrects the 'freezes in time' misreading");

// 11. Sagittarius A* figures.
const sgr = topics.find((t) => t.id === "bh-sagittarius-a-star");
has(sgr.body, "four million", "11 Sgr A* mass stated as ~4 million solar masses");
has(sgr.body, "26,000 light-years", "11 distance stated");
// No hardcoded merger counts, which would go stale.
const mergers = topics.find((t) => t.id === "bh-mergers");
if (!/\b\d{2,}\s+(detections|mergers|events)\b/i.test(mergers.body)) ok("11 no hardcoded merger count");
else bad("11 hardcoded merger count will go stale");

console.log("\n── Hero visual ──");

// 12. It must not present itself as an image, and must state its limits.
has(visualSrc, "Scientific visualization — not to scale", "12 carries the not-to-scale disclaimer");
has(visualSrc, "not a telescope image", "12 states it is not a telescope image");
hasnt(visualSrc, "photograph of", "12 makes no photographic claim");
// No fake live data.
hasnt(visualSrc, "setInterval", "12 no animation implying live data");
hasnt(visualSrc, "LIVE", "12 no LIVE label on a schematic");

// 13. The teaching elements are present and the shadow is not conflated with the horizon.
for (const [needle, description] of [
  ["Shadow", "shadow region"],
  ["Accretion disk", "accretion disk"],
  ["Lensed far side", "gravitational lensing"],
  ["Jets", "jets"],
]) {
  has(visualSrc, needle, `13 shows ${description}`);
}
has(visualSrc, "not every black hole", "13 jets labelled as not universal");
has(visualSrc, "visible light comes from the gas, not the hole", "13 distinguishes disk light from the hole");
has(visualSrc, "larger than the event horizon itself", "13 says the apparent shadow is larger than the horizon");
hasnt(visualSrc, "horizon casts", "13 does not describe the shadow as something the horizon literally casts");

// 14. Learn-owned: it must not reach into Sky Lens rendering.
hasnt(visualSrc, "sky-lens", "14 does not import Sky Lens code");
hasnt(visualSrc, "SkyLens", "14 does not reference Sky Lens components");

console.log(`\nBlack Holes self-test: ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
