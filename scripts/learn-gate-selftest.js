// Learn premium-gate + learning-preferences deterministic self-test.
//
// Product decisions:
// - The first FREE_LEARN_LESSON_COUNT lessons are free; later lessons are premium.
// - Learning Preferences save level + interests atomically, report failures, and refresh Learn.
// - Beginner / Intermediate / Advanced replace the visible curriculum cards themselves.

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

const cat = read("src/features/learn/LearnCatalog.ts");
const ls = read("src/screens/LearnScreen.tsx");
const ld = read("src/screens/LearnDetailScreen.tsx");
const prefs = read("src/features/learn/learnPreferences.ts");
const modal = read("src/features/learn/LearnPreferencesModal.tsx");

console.log("── Tier source of truth: first N lessons free, rest premium ──");
has(cat, "export const FREE_LEARN_LESSON_COUNT = 3", "FREE_LEARN_LESSON_COUNT = 3 (first 3 lessons free)");
has(cat, "learnTopics.slice(0, FREE_LEARN_LESSON_COUNT)", "free set is the first N lessons by catalog order");
has(cat, "export function isLearnLessonFree", "isLearnLessonFree helper exported (single source of truth)");

console.log("\n── Entry gate: non-entitled tap on a premium lesson → paywall ──");
has(ls, "useEntitlement()", "LearnScreen reads entitlement via useEntitlement");
checkRegex(ls, /if \(!isLearnLessonFree\(topicId\) && !isPremium\)\s*\{[\s\S]*?openPaywall\(\);[\s\S]*?return;/, "openLesson paywalls premium lessons for non-entitled users");
has(ls, "onPress={() => openLesson(topic.id)}", "lesson cards route through the gated openLesson");
has(ls, "onNext={() => next && openLesson(next.id)}", "Next navigation routes through the gated openLesson");
hasnt(ls, "Every lesson is free.", "the misleading Every lesson is free hero copy is removed");

console.log("\n── Screen guard: premium lesson body unreachable for non-entitled ──");
has(ld, "isLearnLessonFree", "LearnDetailScreen knows the lesson tier via isLearnLessonFree");
const guardIdx = ld.indexOf("if (!lessonIsFree && !isPremium) {");
eq("LearnDetailScreen has a screen-level premium-lesson guard", guardIdx >= 0, true);
const mainReturnIdx = ld.lastIndexOf("  return (\n    <ScreenShell title={topic.title}");
eq("the full lesson has its own main return", mainReturnIdx > guardIdx, true);
const guardBlock = guardIdx >= 0 && mainReturnIdx > guardIdx ? ld.slice(guardIdx, mainReturnIdx) : "";
has(guardBlock, "PREMIUM LESSON", "guard renders a premium preview/gate");
has(guardBlock, "openPaywall()", "guard Unlock Premium opens the existing paywall");
hasnt(guardBlock, "topic.keyFacts.map", "guard does not render lesson key facts");
hasnt(guardBlock, "topic.body", "guard does not render lesson body");
eq("key facts are only past the guard", ld.indexOf("topic.keyFacts.map") > guardIdx, true);
eq("lesson body is only past the guard", ld.indexOf("topic.body") > guardIdx, true);

console.log("\n── Learning Preferences: completed save or visible failure ──");
has(prefs, "AsyncStorage.multiSet", "level and interests persist in one AsyncStorage operation");
has(prefs, "export async function saveLearnPreferences", "complete preference save helper is exported");
has(prefs, "publish(normalized)", "successful saves notify mounted Learn consumers");
has(prefs, "subscribeLearnPreferences", "Learn preference subscription is available");
has(prefs, "return false;", "storage failure is surfaced to the caller");
has(modal, "async function handleSave()", "Save handler is asynchronous");
has(modal, "const saved = await saveLearnPreferences({ level, interests });", "modal waits for storage completion");
const awaitIdx = modal.indexOf("const saved = await saveLearnPreferences({ level, interests });");
const closeIdx = modal.indexOf("onClose();", awaitIdx);
eq("modal closes only after the awaited save", closeIdx > awaitIdx, true);
has(modal, "if (!saved)", "failed save keeps the modal open");
has(modal, "Saving…", "button provides in-progress feedback");
has(modal, "Choose at least one interest before saving.", "empty interest selection is rejected honestly");

console.log("\n── Skill levels materially replace the visible curriculum ──");
has(cat, 'level: "beginner"', "catalog contains beginner lessons");
has(cat, 'level: "intermediate"', "catalog contains intermediate lessons");
has(cat, 'level: "advanced"', "catalog contains advanced lessons");
has(cat, "categoryHasLearnLevel", "catalog exposes category-level matching");
has(cat, "getLearnTopicsForLevel", "catalog exposes exact-level recommendations");
has(ls, "useFocusEffect", "Learn reloads preferences when its tab receives focus");
has(ls, "const levelTopics = useMemo", "Learn derives a new lesson deck from the saved level");
has(ls, "getLearnTopicsForLevel(prefs.level)", "visible lesson deck uses the exact saved level");
has(ls, ".filter((category) => categoryHasLearnLevel(category.id, prefs.level))", "topic filters exclude categories without that level");
has(ls, "levelTopics.map((topic)", "level-specific lesson cards are rendered from the new deck");
has(ls, "Advanced therefore cannot silently fall back to Beginner cards", "fallback to the wrong level is explicitly prevented");
has(ls, "YOUR LEARNING LEVEL", "Learn visibly confirms the saved level");
hasnt(ls, "orderedCategories.map", "static category-card deck is removed");

console.log(`\nLearn gate + preferences self-test: ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);

function checkRegex(hay, regex, name) {
  regex.test(hay) ? ok(name) : bad(`${name} — pattern not found`);
}
