// Static guard for the exact physical-device regressions found during AuraLunis 1.0.1 testing.
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
let passed = 0;
let failed = 0;
const check = (name, condition) => {
  if (condition) { passed += 1; console.log(`PASS ${name}`); }
  else { failed += 1; console.error(`FAIL ${name}`); }
};

const detail = read("src/screens/LearnDetailScreen.tsx");
const learn = read("src/screens/LearnScreen.tsx");
const visual = read("src/features/learn/LearnCategoryVisual.tsx");
const deepSky = read("src/features/learn/visuals/DeepSkyGlowVisual.tsx");
const shell = read("src/components/ScreenShell.tsx");
const tabs = read("src/navigation/RootTabs.tsx");
const pointing = read("src/features/sky-lens/ar/useDevicePointing.ts");
const canvas = read("src/features/sky-lens/SkyLensCanvas.tsx");
const zodiac = read("src/features/sky-lens/layers/ZodiacLayer.tsx");

console.log("── Learn visual correctness ──");
check("lesson maps nebula, galaxy, cluster and remnant tabs", detail.includes("DEEP_SKY_TOPIC_TAB") && detail.includes("galaxies: 1") && detail.includes("clusters: 2") && detail.includes("remnants: 3"));
check("lesson locks deep-sky visual to lesson content", detail.includes("deepSkyInteractive={false}"));
check("Learn category controls the visual tab", learn.includes("deepSkyActiveIndex={deepSkyTabIndex}"));
check("shared visual forwards controlled index", visual.includes("activeIndex={deepSkyActiveIndex}"));
check("deep-sky visual supports controlled selection", deepSky.includes("activeIndex?: number") && deepSky.includes("activeIndex === undefined"));

console.log("\n── Learning level changes the actual cards ──");
check("visible lesson deck is sourced from exact saved level", learn.includes("getLearnTopicsForLevel(prefs.level)"));
check("level lesson cards replace the static category-card deck", learn.includes("levelTopics.map((topic)") && !learn.includes("orderedCategories.map"));
check("lesson cards use one fixed height", /levelLessonCard:\s*\{[\s\S]*height:\s*184/.test(learn));
check("lesson titles and summaries are clamped", learn.includes('style={styles.levelLessonTitle} numberOfLines={2}') && learn.includes('style={styles.levelLessonSummary} numberOfLines={3}'));
check("topic filters only show categories available at the selected level", learn.includes("categoryHasLearnLevel(category.id, prefs.level)"));

console.log("\n── Safe layout ──");
check("ScreenShell uses a top SafeAreaView", shell.includes("<SafeAreaView") && shell.includes('edges={["top"]}'));
check("ScreenShell no longer relies on top content padding alone", !shell.includes("paddingTop: insets.top + 12"));
check("normal tab bar is not absolute", !/TAB_BAR_STYLE[\s\S]*position:\s*["']absolute["']/.test(tabs));
check("tab bar participates in layout", tabs.includes('backgroundColor: "#070A13"'));

console.log("\n── Sky Lens stationary stability ──");
check("pointing has an explicit stationary lock delay", pointing.includes("STATIONARY_LOCK_DELAY_MS"));
check("pointing holds an exact stationary anchor", pointing.includes("stationaryAnchorRef") && pointing.includes("Keep the exact last rendered frame while the phone is still"));
check("stationary compass drift is ignored inside a hysteresis window", pointing.includes("STATIONARY_HOLD_AZIMUTH") && pointing.includes("STATIONARY_HOLD_ALTITUDE") && pointing.includes("STATIONARY_HOLD_ROLL"));
check("full SVG scene ignores sub-pixel sensor changes", pointing.includes("azimuthDelta >= 0.28") && pointing.includes("altitudeDelta >= 0.2"));
check("canvas never swaps to an automatic reduced-detail scene", !canvas.includes("useAutomaticReducedDetail") && !canvas.includes("lightScene"));
check("labels stay present while panning", canvas.includes("const showLabels = !cinematic"));
check("zodiac uses glyph-only labels to prevent doubled constellation names", zodiac.includes("Zodiac figures intentionally use glyph-only labels") && !zodiac.includes("sign.name.toUpperCase()"));

console.log(`\nDevice regression self-test: ${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
