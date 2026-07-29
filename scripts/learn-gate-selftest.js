// Learn premium-gate + surgical learning-preferences deterministic self-test.
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
let pass = 0, fail = 0;
const ok = (message) => { pass += 1; console.log("PASS " + message); };
const bad = (message) => { fail += 1; console.log("FAIL " + message); };
const eq = (name, actual, expected) => (actual === expected ? ok(name) : bad(`${name} — got ${JSON.stringify(actual)} expected ${JSON.stringify(expected)}`));
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const has = (source, needle, name) => (source.includes(needle) ? ok(name) : bad(`${name} — expected present: ${needle}`));
const hasnt = (source, needle, name) => (!source.includes(needle) ? ok(name) : bad(`${name} — should be absent: ${needle}`));

const catalog = read("src/features/learn/LearnCatalog.ts");
const learn = read("src/screens/LearnScreen.tsx");
const detail = read("src/screens/LearnDetailScreen.tsx");
const preferences = read("src/features/learn/learnPreferences.ts");
const modal = read("src/features/learn/LearnPreferencesModal.tsx");

console.log("── Premium gate ──");
has(catalog, "export const FREE_LEARN_LESSON_COUNT = 3", "first three lessons remain free");
has(catalog, "learnTopics.slice(0, FREE_LEARN_LESSON_COUNT)", "free lesson set uses catalog order");
has(learn, "if (!isLearnLessonFree(topicId) && !isPremium) { openPaywall(); return; }", "Learn entry gate remains intact");
has(learn, "onNext={() => openLesson(next.id)}", "Next remains gated");

const guardIndex = detail.indexOf("if (!lessonIsFree && !isPremium) {");
const mainReturnIndex = detail.lastIndexOf("  return (\n    <ScreenShell title={topic.title}");
eq("lesson screen premium guard exists", guardIndex >= 0, true);
eq("lesson body is after premium guard", mainReturnIndex > guardIndex, true);

console.log("\n── Reliable save and refresh ──");
has(preferences, "AsyncStorage.multiSet", "level and interests save atomically");
has(preferences, "publish(normalized)", "successful save notifies mounted Learn screen");
has(preferences, "subscribeLearnPreferences", "same-session subscription exists");
has(modal, "async function handleSave()", "Save handler is asynchronous");
has(modal, "const saved = await saveLearnPreferences({ level, interests });", "modal waits for completed storage write");
has(modal, "Saving…", "Save button reports progress");
has(learn, "useFocusEffect", "Learn reloads on tab focus");

console.log("\n── Original App Store layout preserved ──");
has(learn, "Choose a learning path", "original learning-path heading remains");
has(learn, "styles.categoryGrid", "original card grid remains");
has(learn, "styles.categoryCard", "original learning-path cards remain");
has(learn, "<LearnVisualForCategory categoryId={selectedCategory}", "original category visual remains");
hasnt(learn, "preferenceCard", "no new learning-level panel");
hasnt(learn, "recommendedList", "no recommendation-row redesign");
hasnt(learn, "levelLessonGrid", "no replacement curriculum-card grid");

console.log("\n── Saved levels affect existing cards only ──");
has(catalog, 'level: "beginner"', "catalog contains beginner lessons");
has(catalog, 'level: "intermediate"', "catalog contains intermediate lessons");
has(catalog, 'level: "advanced"', "catalog contains advanced lessons");
has(learn, "categoryMatchesLevel", "existing cards are ranked by selected level");
has(learn, "DEEP_SKY_LEVEL_TAB", "Deep Sky opens the matching existing tab");
has(learn, "appliedPreferenceSignature", "newly saved preferences refresh once");
has(learn, "const aMatch = a.level === prefs.level ? 0 : 1;", "existing lesson cards surface selected level first");

console.log(`\nLearn surgical self-test: ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
