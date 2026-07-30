// Learn advanced-content premium-gate deterministic self-test.
//
// Product decision: the first FREE_LEARN_LESSON_COUNT lessons (by catalog order) are the free
// "starter section"; every lesson beyond that is premium ("Advanced Learn content"). A non-entitled
// user must not open a premium lesson. Two layers enforce this:
//   1. Entry gate  — LearnScreen.openLesson() paywalls a non-entitled tap on an advanced lesson.
//   2. Screen guard — LearnDetailScreen early-returns a premium preview/gate for advanced lessons,
//                     so the lesson body is unreachable even via "Next".

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
let pass = 0, fail = 0;
const ok = (m) => { pass += 1; console.log("PASS " + m); };
const bad = (m) => { fail += 1; console.log("FAIL " + m); };
const eq = (n, a, b) => (a === b ? ok(n) : bad(`${n} — got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const has = (hay, needle, n) => (hay.includes(needle) ? ok(n) : bad(`${n} — expected present: ${needle}`));
const hasnt = (hay, needle, n) => (!hay.includes(needle) ? ok(n) : bad(`${n} — should be absent: ${needle}`));
const matches = (hay, re, n) => (re.test(hay) ? ok(n) : bad(`${n} — expected to match: ${re}`));

const cat = read("src/features/learn/LearnCatalog.ts");
const ls = read("src/screens/LearnScreen.tsx");
const ld = read("src/screens/LearnDetailScreen.tsx");

console.log("── Tier source of truth: first N lessons free, rest premium ──");
has(cat, "export const FREE_LEARN_LESSON_COUNT = 3", "FREE_LEARN_LESSON_COUNT = 3 (first 3 lessons free)");
has(cat, "learnTopics.slice(0, FREE_LEARN_LESSON_COUNT)", "free set is the first N lessons by catalog order");
has(cat, "export function isLearnLessonFree", "isLearnLessonFree helper exported (single source of truth)");

console.log("\n── Entry gate: non-entitled tap on an advanced lesson → paywall ──");
has(ls, "useEntitlement()", "LearnScreen reads entitlement via useEntitlement");
has(ls, "if (!isLearnLessonFree(topicId) && !isPremium) { openPaywall(); return; }", "openLesson paywalls advanced lessons for non-entitled users");
has(ls, "onPress={() => openLesson(topic.id)}", "lesson card routes through the gated openLesson");
// What matters is that "Next" routes through the gated openLesson — not how the handler is
// written. Accept both the terse one-liner and the null-guarded block form
// (`onNext={() => { if (next) openLesson(next.id); }}`), which is the safer shape.
matches(ls, /onNext=\{\(\)\s*=>\s*\{?[\s\S]{0,80}?openLesson\(next\.id\)/,
  "'Next' navigation also routes through the gated openLesson");
hasnt(ls, "Every lesson is free.", "the misleading 'Every lesson is free' hero copy is removed");

console.log("\n── Screen guard: advanced lesson body unreachable for non-entitled ──");
has(ld, "isLearnLessonFree", "LearnDetailScreen knows the lesson tier via isLearnLessonFree");
const guardIdx = ld.indexOf("if (!lessonIsFree && !isPremium) {");
eq("LearnDetailScreen has a screen-level premium-lesson guard", guardIdx >= 0, true);
const mainReturnIdx = ld.lastIndexOf("  return (\n    <ScreenShell title={topic.title}");
eq("the full lesson has its own (main) return", mainReturnIdx > guardIdx, true);
const guardBlock = guardIdx >= 0 && mainReturnIdx > guardIdx ? ld.slice(guardIdx, mainReturnIdx) : "";
has(guardBlock, "PREMIUM LESSON", "guard renders a premium preview/gate");
has(guardBlock, "openPaywall()", "guard's Unlock Premium opens the existing paywall");
hasnt(guardBlock, "topic.keyFacts.map", "guard does NOT render the lesson key facts");
hasnt(guardBlock, "topic.body", "guard does NOT render the lesson body");
// The lesson body (key facts + body paragraphs) exists ONLY past the guard.
eq("key facts are only past the guard (premium lesson body)", ld.indexOf("topic.keyFacts.map") > guardIdx, true);
eq("lesson body is only past the guard (premium lesson body)", ld.indexOf("topic.body") > guardIdx, true);

// ── Curriculum coverage: no category/level combination may render blank ──────────────
//
// LearnScreen filters lessons by BOTH the selected category (and, for Deep Sky, the active
// subject tab) AND the saved level preference. Any (subject, level) cell with no lesson
// renders an empty screen — the defect where an Advanced learner saw blank Nebulae and
// Clusters tabs. These assertions run against the REAL catalog data, transpiled from the
// shipping .ts source, so a future edit that drops a lesson fails here rather than on device.
const ts = require("typescript");
const Module = require("module");

function requireTs(absPath) {
  const source = fs.readFileSync(absPath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
    fileName: absPath
  });
  const m = new Module(absPath, module);
  m.filename = absPath;
  m.paths = Module._nodeModulePaths(path.dirname(absPath));
  m._compile(outputText, absPath);
  return m.exports;
}

const catalog = requireTs(path.join(ROOT, "src/features/learn/LearnCatalog.ts"));
const { learnTopics, DEEP_SKY_SUBJECTS, LEARN_LEVELS, findDeepSkyLesson } = catalog;

console.log("\n── Deep Sky: every subject × level resolves to exactly one lesson ──");
eq("DEEP_SKY_SUBJECTS matches the Deep Sky tab order", DEEP_SKY_SUBJECTS.join(","),
  "nebulae,galaxies,clusters,remnants");

// The tab lookup must be driven by DEEP_SKY_SUBJECTS, not by the four old exact lesson ids.
has(ls, "DEEP_SKY_SUBJECTS[deepSkyTabIndex]", "Deep Sky tab index maps through DEEP_SKY_SUBJECTS");
has(ls, "topic.deepSkySubject === subject && topic.level === prefs.level",
  "Deep Sky lesson is selected by (subject, level), not by lesson id");
hasnt(ls, '["nebulae", "galaxies", "clusters", "remnants"][deepSkyTabIndex]',
  "the old hardcoded four-id tab lookup is gone");

for (const subject of DEEP_SKY_SUBJECTS) {
  for (const level of LEARN_LEVELS) {
    const matches = learnTopics.filter(
      (t) => t.categoryId === "deep_sky" && t.deepSkySubject === subject && t.level === level
    );
    eq(`deep_sky · ${subject} · ${level} → exactly one lesson`, matches.length, 1);
    // The same cell must resolve through the shipping helper the screen relies on.
    const viaHelper = findDeepSkyLesson(subject, level);
    eq(`deep_sky · ${subject} · ${level} resolves via findDeepSkyLesson()`,
      viaHelper ? viaHelper.id : null, matches.length === 1 ? matches[0].id : null);
  }
}

console.log("\n── Solar System: one lesson at each level (was beginner-only) ──");
for (const level of LEARN_LEVELS) {
  const matches = learnTopics.filter((t) => t.categoryId === "solar_system" && t.level === level);
  eq(`solar_system · ${level} → exactly one lesson`, matches.length, 1);
}

console.log("\n── Every level-filtered category has content at all three levels ──");
// beginner_path is intentionally exempt: LearnScreen returns its whole guided sequence
// without applying the level filter, so it cannot render blank.
const LEVEL_FILTERED = [...new Set(learnTopics.map((t) => t.categoryId))].filter(
  (id) => id !== "beginner_path"
);
has(ls, 'if (selectedCategory === "beginner_path") return inCategory;',
  "beginner_path bypasses the level filter (exempt by design)");
for (const categoryId of LEVEL_FILTERED) {
  for (const level of LEARN_LEVELS) {
    const count = learnTopics.filter((t) => t.categoryId === categoryId && t.level === level).length;
    eq(`${categoryId} · ${level} is not blank`, count >= 1, true);
  }
}

console.log("\n── Lesson data integrity ──");
const ids = learnTopics.map((t) => t.id);
eq("every lesson id is unique", ids.length, new Set(ids).size);
const badFacts = learnTopics.filter((t) => !Array.isArray(t.keyFacts) || t.keyFacts.length < 3);
eq("every lesson has at least three key facts", badFacts.map((t) => t.id).join(",") || "none", "none");
const badBody = learnTopics.filter((t) => !t.body || t.body.trim().length < 200);
eq("every lesson has a substantial body", badBody.map((t) => t.id).join(",") || "none", "none");
const badSummary = learnTopics.filter((t) => !t.summary || t.summary.trim().length < 40);
eq("every lesson has a meaningful summary", badSummary.map((t) => t.id).join(",") || "none", "none");
const deepSkyUntagged = learnTopics.filter((t) => t.categoryId === "deep_sky" && !t.deepSkySubject);
eq("every deep_sky lesson declares a subject", deepSkyUntagged.map((t) => t.id).join(",") || "none", "none");
const subjectOutsideDeepSky = learnTopics.filter(
  (t) => t.deepSkySubject && t.categoryId !== "deep_sky"
);
eq("deepSkySubject is only used inside deep_sky",
  subjectOutsideDeepSky.map((t) => t.id).join(",") || "none", "none");

console.log("\n── Free starter set is unchanged by the new lessons ──");
eq("FREE_LEARN_LESSON_COUNT is still 3", catalog.FREE_LEARN_LESSON_COUNT, 3);
eq("the first three lessons are unchanged", learnTopics.slice(0, 3).map((t) => t.id).join(","),
  "what-is-solar-system,moon-phases,moon-orbit-tides");

console.log(`\nLearn advanced-content premium-gate self-test: ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
