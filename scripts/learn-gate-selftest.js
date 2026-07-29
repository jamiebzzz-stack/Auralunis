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

console.log(`\nLearn advanced-content premium-gate self-test: ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
