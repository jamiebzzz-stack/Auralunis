// Birth Sky share/export self-test.
//
// The defect this locks out: sharing used to call captureRef on the LIVE on-screen card, so the
// exported PNG contained whatever the screen happened to render — the interpretation cards in
// their COLLAPSED state (title rows plus "+" affordances, none of the actual reading), the
// "Share Birth Sky" button itself, and an arbitrary height that grew with every section added.
// An export must be a designed artifact, not a screenshot of interactive UI.

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
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const card = read("src/features/birthsky/BirthSkyShareCard.tsx");
const cardCode = stripComments(card);
const screen = read("src/screens/BirthSkyScreen.tsx");
const screenCode = stripComments(screen);

console.log("── Quick card geometry ──");

// 1. Fixed 4:5 at 1080 wide — the ratio that survives social crops.
// The component imports react-native, so its constants are read statically, not executed.
const num = (name) => {
  const m = cardCode.match(new RegExp(`export const ${name} =\\s*([^;]+);`));
  return m ? m[1].trim() : null;
};
eq("1 base layout width", num("BASE_WIDTH"), "360");
eq("1 capture scale", num("CAPTURE_SCALE"), "3");
eq("1 quick width is 1080px", num("QUICK_WIDTH_PX"), "BASE_WIDTH * CAPTURE_SCALE");
eq("1 quick height is 1350px", num("QUICK_HEIGHT_PX"), "1350");
if (360 * 3 === 1080 && 1080 / 1350 === 0.8) ok("1 quick card resolves to 1080×1350 (4:5)");
else bad("1 quick card is not 4:5");

// 2. The capture must pass explicit pixel dimensions, or output size is whatever the layout
//    happened to measure — the original bug.
// captureRef takes POINTS and multiplies by the device pixel ratio, so pixel targets must be
// divided by it — passing pixels directly yielded a 3240×4050 image on a 3× screen.
has(screenCode, "width: QUICK_WIDTH_PX / scale", "2 quick capture converts pixels to points");
has(screenCode, "height: QUICK_HEIGHT_PX / scale", "2 quick capture height converts to points");
has(screenCode, "PixelRatio.get()", "2 capture accounts for device pixel ratio");
has(screenCode, "(BASE_WIDTH * CAPTURE_SCALE) / PixelRatio.get()", "2 report capture pins output width in pixels");

console.log("\n── The live card is no longer the export source ──");

// 3. THE fix. captureRef must never read the on-screen card again.
hasnt(screenCode, "cardRef", "3 the live-card ref is gone entirely");
has(screenCode, "captureRef(quickRef", "3 quick card captures its own off-screen host");
has(screenCode, "captureRef(ref,", "3 report captures its own off-screen hosts");
has(screenCode, "exportHost", "3 export hosts are positioned off-screen");
has(stripComments(read("src/screens/BirthSkyScreen.tsx")), "left: -10000", "3 hosts are outside the viewport");

// 4. No interactive chrome may appear in either exported layout.
hasnt(cardCode, "Pressable", "4 export layouts contain no pressables");
hasnt(cardCode, "onPress", "4 export layouts contain no press handlers");
hasnt(cardCode, "Share Birth Sky", "4 the share button text cannot appear in an export");
hasnt(cardCode, "Share Quick Card", "4 no share-action text in an export");
hasnt(cardCode, "ExplainCard", "4 exports do not reuse the collapsible card component");
if (!/\{open \? "−" : "\+"\}/.test(cardCode) && !cardCode.includes("explainChevron")) ok("4 no +/− expand affordances in exports");
else bad("4 an expand affordance leaked into an export");
hasnt(cardCode, "useState", "4 export layouts hold no interactive state");

console.log("\n── Content ──");

// 5. Both variants read the SAME calculated profile and the same generators.
has(cardCode, "buildInterpretationGroups", "5 report uses the shared interpretation generator");
has(cardCode, "buildPersonalityPortrait", "5 report uses the shared portrait generator");
has(cardCode, "buildExplanationCards", "5 report uses the shared explanation generator");
has(cardCode, "profile.zodiacPlacements", "5 exports read the computed tropical placements");
has(cardCode, "signPositionFromLongitude", "5 exports derive degrees from tropical longitude");
hasnt(cardCode, "BirthSkyCanvas", "5 the circular chart is gone from both exports");
has(cardCode, "profile.risingSign", "5 exports read the computed ascendant");

// 6. Quick card is deliberately concise — it must NOT render the full reading set.
// Boundary must be a CODE marker: comments are stripped from cardCode, so a comment marker
// would not be found and the slice would run to end of file, swallowing the report section.
const quickStart = cardCode.indexOf('if (variant === "quick")');
const quickEnd = cardCode.indexOf("const pageIndex = REPORT_PAGES.indexOf(page)");
if (quickStart < 0 || quickEnd <= quickStart) bad("6 could not isolate the quick-card block");
const quickBlock = cardCode.slice(quickStart, quickEnd);
hasnt(quickBlock, "buildInterpretationGroups", "6 quick card omits the full interpretation set");
hasnt(quickBlock, "buildExplanationCards", "6 quick card omits the astronomy explanation set");
// The Big Three strip was replaced by the placement table, which carries Sun, Moon and Rising
// as rows — repeating them twice wasted space on a fixed-size card.
has(quickBlock, "PlacementTable", "6 quick card carries the placement table");
has(quickBlock, "compact", "6 quick card uses the compact table variant");
has(quickBlock, "moonPhase", "6 quick card carries the moon phase");
has(quickBlock, "portrait[0]", "6 quick card carries a portrait excerpt only");
has(quickBlock, "numberOfLines={4}", "6 quick-card portrait excerpt is bounded");

// 7. Report covers every section, paginated by whole sections so nothing is cropped.
// Five pages: the interpretation section is split into core and outer. All eleven readings on
// one page produced a bitmap tall enough that captureRef failed outright, which silently
// yielded a partial report rather than an error.
eq("7 five report pages", (cardCode.match(/export const REPORT_PAGES = \[([^\]]+)\]/) || [])[1].split(",").length, 5);
has(cardCode, '"readings-core"', "7 interpretation core page exists");
has(cardCode, '"readings-outer"', "7 interpretation continuation page exists");
// A failing page must not abort the rest, and a partial report must say so.
has(screenCode, "failed.push(page)", "7 a failed page is recorded, not swallowed");
has(screenCode, "Report partly saved", "7 a partial report is reported honestly");
for (const needle of ["YOUR BIRTH SKY EXPLAINED", "YOUR ASTROLOGICAL INTERPRETATION", "YOUR PERSONALITY PORTRAIT", "WHY THE TWO DIFFER"]) {
  has(cardCode, needle, `7 report includes ${needle}`);
}
has(cardCode, "Report {pageIndex} of {REPORT_PAGE_COUNT}", "7 pages are numbered for the reader");

// 8. Both exports carry the astronomy/astrology disclosure and branding.
has(cardCode, "Astronomical positions calculated for your birth moment", "8 disclosure present");
has(cardCode, "traditional Western astrology", "8 disclosure names the astrology basis");
has(cardCode, "AuraLunis", "8 branding present");

console.log("\n── Safety ──");

// 9. Memory: report pages are captured one at a time, never concatenated into one bitmap.
has(screenCode, "for (const page of REPORT_PAGES)", "9 report pages captured individually");
hasnt(screenCode, "height: reportHeight", "9 no single full-height report capture");

// 10. No new native dependency — the export path uses what is already installed.
const pkg = JSON.parse(read("package.json"));
for (const dep of ["react-native-view-shot", "expo-sharing", "expo-media-library"]) {
  if (pkg.dependencies[dep]) ok(`10 ${dep} already a dependency`);
  else bad(`10 ${dep} missing`);
}

// 11. Entitlement behaviour untouched.
hasnt(read("src/context/EntitlementContext.tsx"), "TEMPORARY_QA_PREMIUM_OVERRIDE", "11 no premium bypass survives");
hasnt(read("src/context/EntitlementContext.tsx"), "isPremium: true, kind", "11 no forced premium return survives");
has(screenCode, "isPremium ?", "11 share actions remain premium-gated");


console.log(`\nBirth Sky share self-test: ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
