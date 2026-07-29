// Static guard for the exact regressions found in the AuraLunis 1.0.1 TestFlight build.
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

console.log("── Learn visual correctness ──");
check("lesson maps nebula, galaxy, cluster and remnant tabs", detail.includes("DEEP_SKY_TOPIC_TAB") && detail.includes("galaxies: 1") && detail.includes("clusters: 2") && detail.includes("remnants: 3"));
check("lesson locks deep-sky visual to lesson content", detail.includes("deepSkyInteractive={false}"));
check("Learn category controls the visual tab", learn.includes("deepSkyActiveIndex={deepSkyTabIndex}"));
check("shared visual forwards controlled index", visual.includes("activeIndex={deepSkyActiveIndex}"));
check("deep-sky visual supports controlled selection", deepSky.includes("activeIndex?: number") && deepSky.includes("activeIndex === undefined"));

console.log("\n── Safe layout ──");
check("ScreenShell uses a top SafeAreaView", shell.includes("<SafeAreaView") && shell.includes('edges={["top"]}'));
check("ScreenShell no longer relies on top content padding alone", !shell.includes("paddingTop: insets.top + 12"));
check("normal tab bar is not absolute", !/TAB_BAR_STYLE[\s\S]*position:\s*["']absolute["']/.test(tabs));
check("tab bar participates in layout", tabs.includes('backgroundColor: "#070A13"'));

console.log("\n── Sky Lens movement budget ──");
check("pointing state identifies deliberate movement", pointing.includes("moving: boolean") && pointing.includes("SETTLE_DELAY_MS"));
check("pointing ignores tiny stationary noise", pointing.includes("azDelta >= 0.1") && pointing.includes("altDelta >= 0.08"));
check("canvas auto-detects a physical pan", canvas.includes("useAutomaticReducedDetail"));
check("canvas reduces stars during movement", canvas.includes("magnitude <= 2.7") && canvas.includes("lightScene"));
check("canvas suppresses labels and ambient animation during movement", canvas.includes("const showLabels = !cinematic && !lightScene") && canvas.includes("vg.shootingStars && !lightScene"));

console.log(`\nDevice regression self-test: ${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
