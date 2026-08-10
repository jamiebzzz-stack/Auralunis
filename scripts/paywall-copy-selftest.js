// Paywall-copy deterministic self-test.
//
// Current new-customer contract: Lifetime only, one-time, App Store price fallback $29.99.
// Monthly/Annual copy logic remains tested only as legacy-safe helper behavior; those plans must
// not appear as selectable new-customer options in ThreeTierPaywallModal.

const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");

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
    for (const cand of [base + ".ts", base + ".tsx", path.join(base, "index.ts")]) {
      if (fs.existsSync(cand)) return cand;
    }
  }
  return origResolve.call(this, request, ...rest);
};

const { resolvePlanCopy } = require(path.join(SRC, "features/paywall/paywallCopy.ts"));

let pass = 0, fail = 0;
const ok = (m) => { pass += 1; console.log("PASS " + m); };
const bad = (m) => { fail += 1; console.log("FAIL " + m); };
const eq = (n, a, b) => (a === b ? ok(n) : bad(`${n} — got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`));
const has = (hay, needle, n) => (hay.includes(needle) ? ok(n) : bad(`${n} — expected present: ${needle}`));
const hasnt = (hay, needle, n) => (!hay.includes(needle) ? ok(n) : bad(`${n} — should be absent: ${needle}`));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const eligible = { status: "eligible", durationText: "7 days" };
const unavailable = { status: "unavailable" };
const loading = { status: "loading" };
const ineligible = { status: "ineligible" };
const TRIAL_RE = /free trial|7-day|7 days free|\btrial\b/i;

console.log("── Lifetime new-customer contract ──");
for (const [label, state] of [["eligible", eligible], ["ineligible", ineligible], ["loading", loading], ["unavailable", unavailable]]) {
  const life = resolvePlanCopy("lifetime", "$29.99", null, state);
  eq(`${label}: lifetime is never trial`, life.isTrial, false);
  eq(`${label}: lifetime CTA`, life.ctaLabel, "Unlock Lifetime");
  eq(`${label}: lifetime detail`, life.detailText, "One-time purchase · $29.99");
  eq(`${label}: lifetime price`, life.priceText, "$29.99 one-time");
  eq(`${label}: lifetime has no renewal disclosure`, life.disclosure, null);
  TRIAL_RE.test([life.heading, life.detailText, life.ctaLabel, life.disclosure ?? ""].join(" "))
    ? bad(`${label}: lifetime leaked trial wording`)
    : ok(`${label}: lifetime has no trial wording`);
}

const localized = resolvePlanCopy("lifetime", "$29.99", "£24.99", loading);
eq("localized StoreKit price overrides fallback", localized.priceText, "£24.99 one-time");
eq("localized StoreKit detail overrides fallback", localized.detailText, "One-time purchase · £24.99");

console.log("\n── Legacy subscription helper remains fail-closed ──");
const monthlyEligible = resolvePlanCopy("monthly", "$9.99/month", null, eligible);
eq("legacy monthly eligible helper can describe confirmed offer", monthlyEligible.isTrial, true);
const annualUnavailable = resolvePlanCopy("annual", "$49.99/year", null, unavailable);
eq("legacy annual unavailable helper is paid", annualUnavailable.isTrial, false);
eq("legacy annual unavailable CTA", annualUnavailable.ctaLabel, "Subscribe Annually");

console.log("\n── Runtime modal is Lifetime only ──");
const modal = read("src/features/paywall/ThreeTierPaywallModal.tsx");
const catalog = read("src/features/paywall/MonetizationCatalog.ts");
has(modal, 'plans.find(p => p.id === "lifetime")', "modal selects Lifetime plan");
has(modal, "onPurchase(lifetime.id)", "modal purchases Lifetime plan");
has(modal, "Restore Purchases", "restore remains available for legacy customers");
has(modal, "localizedPrice", "modal consumes localized StoreKit/RevenueCat price");
hasnt(modal, 'id === "premium_monthly"', "modal does not select Monthly");
hasnt(modal, 'id === "premium_annual"', "modal does not select Annual");
TRIAL_RE.test(modal) ? bad("modal contains new-customer trial language") : ok("modal contains no new-customer trial language");
has(catalog, 'displayPrice: "$29.99"', "catalog Lifetime fallback is $29.99");
hasnt(catalog, "$129.99", "retired $129.99 fallback is absent from catalog");
has(catalog, 'entitlement: "AuraLunis Premium"', "legacy/shared entitlement identifier is unchanged");

console.log(`\nPaywall-copy self-test: ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
