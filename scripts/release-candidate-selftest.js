// Release-candidate hardening self-test (pre-Build-5).
//
// Freezes the four App-Store-readiness fixes so they can't regress:
//   1. The "Native Device QA" Settings section is __DEV__-gated (absent from release binaries).
//   2. The Manual Sky Map fallback carries no unfinished / developer wording.
//   3. The fabricated $239.76 lifetime strike-through anchor price is gone (data, render, style).
//   4. iOS is iPhone-only (supportsTablet: false).
// Plus: the monetization contract (prices, entitlement, product IDs) is unchanged.
// Static scans + a require() of the node-safe MonetizationCatalog. No RN runtime.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");

// transpile-require for the node-safe catalog
const ts = require(path.join(ROOT, "node_modules/typescript"));
const Module = require("module");
require.extensions[".ts"] = function (module, filename) {
  const src = fs.readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(src, {
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

const { RevenueCatIds, plans } = require(path.join(SRC, "features/paywall/MonetizationCatalog.ts"));

let pass = 0, fail = 0;
const ok = (m) => { pass += 1; console.log("PASS " + m); };
const bad = (m) => { fail += 1; console.log("FAIL " + m); };
const eq = (n, a, b) => (a === b ? ok(n) : bad(`${n} — got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const has = (hay, needle, n) => (hay.includes(needle) ? ok(n) : bad(`${n} — expected present: ${needle}`));
const hasnt = (hay, needle, n) => (!hay.includes(needle) ? ok(n) : bad(`${n} — should be absent: ${needle}`));

console.log("── 1. Native Device QA is __DEV__-gated (absent from release) ──");
const settings = read("src/screens/SettingsScreen.tsx");
const qaIdx = settings.indexOf('title="Native Device QA"');
if (qaIdx === -1) {
  bad("Native Device QA section not found (unexpected)");
} else {
  const devIdx = settings.lastIndexOf("__DEV__", qaIdx);
  if (devIdx !== -1 && qaIdx - devIdx < 200) ok("Native Device QA section is wrapped in a __DEV__ guard");
  else bad("Native Device QA section is NOT __DEV__-gated (would ship to App Store users)");
}

console.log("\n── 2. Manual Sky Map has no unfinished/dev wording ──");
const manual = read("src/features/sky-lens/ManualSkyMap.tsx").toLowerCase();
for (const term of ["production will", "placeholder", "mock", "coming later", "will connect", "wip", "prototype", "todo"]) {
  hasnt(manual, term, `Manual Sky Map has no "${term}" wording`);
}

console.log("\n── 3. Fabricated lifetime anchor price removed ──");
const catalog = read("src/features/paywall/MonetizationCatalog.ts");
hasnt(catalog, "anchorPrice", "MonetizationCatalog has no anchorPrice field");
hasnt(catalog, "$239.76", "MonetizationCatalog has no $239.76 value");
const modal = read("src/features/paywall/ThreeTierPaywallModal.tsx");
hasnt(modal, "plan.anchorPrice", "Paywall modal no longer renders an anchor price");
hasnt(modal, "line-through", "Paywall modal has no line-through strike style");
const lifetime = plans.find((p) => p.id === "lifetime");
eq("lifetime plan carries no anchorPrice", lifetime && lifetime.anchorPrice, undefined);

console.log("\n── 4. iOS is iPhone-only ──");
const app = JSON.parse(read("app.json"));
eq("app.json ios.supportsTablet === false", app.expo.ios.supportsTablet, false);

console.log("\n── Monetization contract preserved ──");
eq("entitlement is exactly \"AuraLunis Premium\"", RevenueCatIds.entitlement, "AuraLunis Premium");
eq("monthly product id", RevenueCatIds.products.premiumMonthly, "com.ocoeestudios.auralunis.premium.monthly");
eq("annual product id", RevenueCatIds.products.premiumAnnual, "com.ocoeestudios.auralunis.premium.annual");
eq("lifetime product id", RevenueCatIds.products.lifetime, "com.ocoeestudios.auralunis.lifetime");
eq("lifetime fallback price", lifetime && lifetime.displayPrice, "$29.99");
// Lifetime-only: monthly/annual were removed from the RevenueCat Offering, so they must not
// appear as purchasable plans. Their PRODUCT IDs above deliberately remain — existing
// subscribers still hold the entitlement through them and classifyAuraLunisMembership()
// needs those exact IDs to tell a subscriber from a lifetime owner.
eq("exactly one purchasable plan", plans.length, 1);
if (!plans.find((p) => p.interval === "monthly")) ok("monthly is not a purchasable plan"); else bad("monthly still offered but is not in the Offering");
if (!plans.find((p) => p.interval === "annual")) ok("annual is not a purchasable plan"); else bad("annual still offered but is not in the Offering");

console.log(`\nRelease-candidate self-test: ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
