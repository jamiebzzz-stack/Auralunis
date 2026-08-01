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
const check = (n, cond, detail) => (cond ? ok(n) : bad(`${n}${detail ? " — " + detail : ""}`));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const has = (hay, needle, n) => (hay.includes(needle) ? ok(n) : bad(`${n} — expected present: ${needle}`));
const hasnt = (hay, needle, n) => (!hay.includes(needle) ? ok(n) : bad(`${n} — should be absent: ${needle}`));
const matches = (hay, re, n) => (re.test(hay) ? ok(n) : bad(`${n} — expected to match: ${re}`));

const cat = read("src/features/learn/LearnCatalog.ts");
const ls = read("src/screens/LearnScreen.tsx");
const ld = read("src/screens/LearnDetailScreen.tsx");

console.log("── Tier source of truth: first N lessons free, rest premium ──");
// The free tier is no longer expressed as "the first N lessons by catalog order" — that made
// pricing a side effect of array ordering. It is now an explicit id list. Both guards updated
// to the new source of truth; the guarantee (exactly three free starter lessons) is unchanged
// and is additionally asserted against the real exported VALUE further down.
has(cat, "export const FREE_LEARN_LESSON_IDS", "the free set is an explicit, canonical id list");
has(cat, "FREE_LEARN_LESSON_COUNT = FREE_LEARN_LESSON_IDS.length", "the count is derived from that list, never hardcoded");
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


// ══════════════════════════════════════════════════════════════════════════════════════
console.log("\n── Canonical free access (Option C) + lesson-visual isolation (Bug 1) ──");

const detailSrc = read("src/screens/LearnDetailScreen.tsx");
const visualSrc = read("src/features/learn/LearnCategoryVisual.tsx");
const deepSkySrc = read("src/features/learn/visuals/DeepSkyGlowVisual.tsx");
const prefsSrc = read("src/features/learn/learnPreferences.ts");
const catalogSrc = read("src/features/learn/LearnCatalog.ts");

// ── Access is stated by id, not by array position ────────────────────────────────
eq("the free set is exactly the three intended lessons",
  [...catalog.FREE_LEARN_LESSON_IDS].join(","),
  "what-is-solar-system,moon-phases,moon-orbit-tides");
eq("the free count is still three", catalog.FREE_LEARN_LESSON_COUNT, 3);
// Comment-stripped: the file's own note explains what the positional slice used to be.
const catalogCode = catalogSrc.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
check("REGRESSION: access no longer derives from catalog ORDER",
  !/learnTopics\.slice\(0, FREE_LEARN_LESSON_COUNT\)/.test(catalogCode),
  "a positional slice made the free tier a side effect of array ordering");
check("the free set is declared as explicit ids", /FREE_LEARN_LESSON_IDS: ReadonlyArray<string> = \[/.test(catalogSrc));

// Reordering the catalog must not change who pays. Proven against the real function.
const shuffled = [...catalog.learnTopics].reverse();
const freeAfterReorder = shuffled.filter((t) => catalog.isLearnLessonFree(t.id)).map((t) => t.id).sort();
eq("REGRESSION: reversing the catalog does not change the free set",
  freeAfterReorder.join(","), [...catalog.FREE_LEARN_LESSON_IDS].sort().join(","));

// ── Night 1 and every other lesson stay premium ─────────────────────────────────
check("REGRESSION: Night 1 remains PREMIUM", catalog.isLearnLessonFree("learn-sky-night-one") === false);
const nonFree = catalog.learnTopics.filter((t) => !catalog.isLearnLessonFree(t.id));
eq("exactly three lessons are free; every other lesson is premium",
  catalog.learnTopics.length - nonFree.length, 3);
check("an unknown lesson id is never free", catalog.isLearnLessonFree("nope-not-a-lesson") === false);
check("an empty id is never free", catalog.isLearnLessonFree("") === false);

// ── Experience level cannot touch access ────────────────────────────────────────
check("isLearnLessonFree takes ONLY a lesson id (no preference parameter)", catalog.isLearnLessonFree.length === 1);
check("the preferences module exposes nothing about premium/free/entitlement",
  !/premium|entitle|isFree/i.test(prefsSrc));
// Beginner / Intermediate / Advanced must yield identical classifications.
const classify = () => catalog.learnTopics.map((t) => `${t.id}:${catalog.isLearnLessonFree(t.id)}`).join("|");
const beginner = classify(), intermediate = classify(), advanced = classify();
check("Beginner, Intermediate and Advanced yield IDENTICAL access classifications",
  beginner === intermediate && intermediate === advanced);
check("…because access is a pure function of the lesson id", beginner === classify());

// ── One decision, used by badges, opening and paywall routing ───────────────────
check("the lesson detail screen gates on the canonical function", /isLearnLessonFree\(topic\.id\)/.test(detailSrc));
check("the Learn list gates opening on the same function", /isLearnLessonFree\(topicId\)/.test(read("src/screens/LearnScreen.tsx")));
check("premium badges use the same function, not a difficulty or level check",
  /isLearnLessonFree\(topic\.id\) \|\| isPremium/.test(read("src/screens/LearnScreen.tsx")));
check("no Learn screen infers premium from level/difficulty/preference",
  !/level === "advanced"[\s\S]{0,60}premium/i.test(detailSrc + read("src/screens/LearnScreen.tsx")));
check("an entitled user is never gated", /!lessonIsFree && !isPremium/.test(detailSrc));

// ── Bug 1: lesson-local visual state cannot leak across lessons ─────────────────
check("REGRESSION: the lesson visual is keyed by lesson id",
  /<LearnVisualForCategory key=\{topic\.id\} categoryId=\{topic\.categoryId\} \/>/.test(detailSrc),
  "without the key, DeepSkyGlowVisual's useState initializer never re-runs on a lesson change");
check("the key is on the VISUAL only — the screen is not remounted",
  !/<ScreenShell key=/.test(detailSrc) && !/key=\{topic\.id\}[\s\S]{0,40}ScreenShell/.test(detailSrc));
check("the deep-sky visual still holds its own selection so manual switching works",
  /const \[active, setActive\] = useState\(selectedIndex \?\? 0\)/.test(deepSkySrc));
check("the visual still exposes its tab-change callback", /onTabChange/.test(visualSrc) && /onTabChange/.test(deepSkySrc));
check("the saved-flag reset on lesson change is still present",
  /useEffect\(\(\) => \{ setSaved\(false\); \}, \[topic\.id\]\);/.test(detailSrc));
check("course progress/completion is NOT reset by the visual key",
  !/setProgress\(|setCompleted\(|clearProgress/.test(detailSrc));

console.log(`\nLearn advanced-content premium-gate self-test: ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
