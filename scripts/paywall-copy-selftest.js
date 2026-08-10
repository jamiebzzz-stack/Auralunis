// Paywall-copy deterministic self-test.
//
// Locks the fail-closed trial-copy behavior: free-trial wording is produced ONLY for a
// store-confirmed eligible subscription offer. Every other state (ineligible / unavailable /
// loading — and, upstream, unknown / no-offer / error, which usePaywallOffers folds into
// "unavailable") and lifetime in ALL states resolve to plan-accurate PAID copy with no trial
// wording. Part A executes the pure `resolvePlanCopy` helper across the full matrix; Part B is a
// static guard that no trial string can leak from a non-eligible/lifetime state, plus source
// invariants on the (unchanged) eligibility derivation and purchase/restore wiring.

const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");

// ── transpile-require: load node-safe .ts as CommonJS, resolve "@/…" → src/… ──
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

const { resolvePlanCopy, DEFAULT_HEADLINE } = require(path.join(SRC, "features/paywall/paywallCopy.ts"));

let pass = 0, fail = 0;
const ok = (m) => { pass += 1; console.log("PASS " + m); };
const bad = (m) => { fail += 1; console.log("FAIL " + m); };
const eq = (n, a, b) => (a === b ? ok(n) : bad(`${n} — got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const has = (hay, needle, n) => (hay.includes(needle) ? ok(n) : bad(`${n} — expected present: ${needle}`));
const hasnt = (hay, needle, n) => (!hay.includes(needle) ? ok(n) : bad(`${n} — should be absent: ${needle}`));

const MONTHLY = ["monthly", "$9.99/month", null];
const ANNUAL = ["annual", "$49.99/year", null];
const LIFETIME = ["lifetime", "$29.99", null];
const eligible = { status: "eligible", durationText: "7 days" };
const ineligible = { status: "ineligible" };
const unavailable = { status: "unavailable" }; // also represents unknown / no-offer / error upstream
const loading = { status: "loading" };
const c = (plan, trial) => resolvePlanCopy(plan[0], plan[1], plan[2], trial);

const TRIAL_RE = [/free trial/i, /7-day/i, /7 days free/i, /\bfree\b/i, /\btrial\b/i];
const noTrial = (copy, label) => {
  const blob = [copy.heading, copy.detailText, copy.ctaLabel, copy.disclosure ?? ""].join(" || ");
  const hit = TRIAL_RE.find((re) => re.test(blob));
  hit ? bad(`${label} — trial wording leaked: ${hit} in ${JSON.stringify(blob)}`) : ok(`${label} — no trial wording`);
};

console.log("── Part A: behavioral matrix (pure resolvePlanCopy) ──");

// 1. Monthly eligible — trial copy PRESERVED exactly.
{
  const m = c(MONTHLY, eligible);
  eq("1 monthly eligible: isTrial", m.isTrial, true);
  eq("1 monthly eligible: heading", m.heading, "Start your 7-day free trial");
  eq("1 monthly eligible: detail", m.detailText, "7 days free, then $9.99/month");
  eq("1 monthly eligible: cta", m.ctaLabel, "Start 7-Day Free Trial");
}
// 2/3/4/5/6/7. Monthly ineligible / unknown(→unavailable) / loading / unavailable / no-offer(→unavailable) / error(→unavailable)
for (const [label, st] of [["2 ineligible", ineligible], ["3 unknown→unavailable", unavailable], ["4 loading", loading], ["5 unavailable", unavailable], ["6 no-offer→unavailable", unavailable], ["7 error→unavailable", unavailable]]) {
  const m = c(MONTHLY, st);
  eq(`monthly ${label}: isTrial`, m.isTrial, false);
  eq(`monthly ${label}: cta`, m.ctaLabel, "Subscribe Monthly");
  eq(`monthly ${label}: detail`, m.detailText, "$9.99 per month");
  eq(`monthly ${label}: heading`, m.heading, DEFAULT_HEADLINE);
  noTrial(m, `monthly ${label}`);
}
// 8. Annual eligible.
{
  const a = c(ANNUAL, eligible);
  eq("8 annual eligible: isTrial", a.isTrial, true);
  eq("8 annual eligible: heading", a.heading, "Start your 7-day free trial");
  eq("8 annual eligible: detail", a.detailText, "7 days free, then $49.99/year");
  eq("8 annual eligible: cta", a.ctaLabel, "Start 7-Day Free Trial");
}
// 9/10/11. Annual ineligible / unknown(→unavailable) / loading.
for (const [label, st] of [["9 ineligible", ineligible], ["10 unknown→unavailable", unavailable], ["11 loading", loading]]) {
  const a = c(ANNUAL, st);
  eq(`annual ${label}: cta`, a.ctaLabel, "Subscribe Annually");
  eq(`annual ${label}: detail`, a.detailText, "$49.99 per year");
  noTrial(a, `annual ${label}`);
}
// 12. Switch eligible monthly → ineligible annual (stateless: new inputs).
{
  const before = c(MONTHLY, eligible); const after = c(ANNUAL, ineligible);
  eq("12 switch: before is trial", before.isTrial, true);
  eq("12 switch: after annual cta", after.ctaLabel, "Subscribe Annually");
  noTrial(after, "12 switch → ineligible annual");
}
// 13. Switch eligible annual → monthly unknown(→unavailable).
{
  const after = c(MONTHLY, unavailable);
  eq("13 switch → monthly unknown cta", after.ctaLabel, "Subscribe Monthly");
  noTrial(after, "13 switch → monthly unknown");
}
// 14/15. Switch eligible subscription → lifetime; lifetime never shows trial (even if an eligible trial state is passed).
for (const [label, st] of [["14 lifetime (from eligible)", eligible], ["15 lifetime ineligible", ineligible], ["15 lifetime loading", loading], ["15 lifetime unavailable", unavailable]]) {
  const l = c(LIFETIME, st);
  // The CTA states the price so the commitment is legible before the tap.
  eq(`${label}: cta`, l.ctaLabel, "Unlock Lifetime — $29.99");
  eq(`${label}: detail`, l.detailText, "One-time purchase · No subscription · No recurring charges");
  eq(`${label}: price`, l.priceText, "$29.99 one-time");
  eq(`${label}: disclosure null`, l.disclosure, null);
  eq(`${label}: isTrial`, l.isTrial, false);
  noTrial(l, label);
}
// 14b. The live localized store price must WIN over the catalog fallback everywhere it appears,
// so an App Store Connect price change needs no app update.
{
  const l = resolvePlanCopy("lifetime", "$29.99", "£24.99", unavailable);
  eq("14b lifetime live price: cta", l.ctaLabel, "Unlock Lifetime — £24.99");
  eq("14b lifetime live price: priceText", l.priceText, "£24.99 one-time");
}
// 18. Offering unavailable → live price null → catalog fallback, no trial.
{
  const m = c(MONTHLY, unavailable);
  eq("18 offering unavailable: price falls back to catalog", m.priceText, "$9.99/month");
  noTrial(m, "18 offering unavailable");
}

console.log("\n── Part B: static guards (derivation + wiring unchanged; no leak from the modal) ──");
const offers = read("src/features/paywall/usePaywallOffers.ts");
const modal = read("src/features/paywall/ThreeTierPaywallModal.tsx");
// 16/17. Eligibility derivation still requires BOTH positive eligibility AND a real intro offer.
has(offers, 'elig === "eligible" && pkg?.introOffer', "usePaywallOffers requires eligible AND an intro offer (offer≠eligibility)");
has(offers, 'p.interval === "lifetime"', "usePaywallOffers forces lifetime to no-trial");
has(offers, 'trial = { status: "unavailable" }', "unknown/no-offer/error fold to unavailable (no trial)");
// 19/20. Purchase/restore wiring unchanged.
has(modal, "onPurchase(lifetimePlan.id)", "purchase handler wired to the lifetime package");
has(modal, "onRestore", "restore handler still wired");
// The modal delegates ALL copy to the pure helper (behavioral leak-proofing is Part A, above —
// no fragile source-text matching of rendered strings, which would false-match code comments).
has(modal, "resolvePlanCopy", "modal consumes the pure resolvePlanCopy helper");
has(modal, "copy.detailText", "CTA supporting line comes from the helper, not re-derived");

console.log("\n── Part C: lifetime-only contract ──");
// The paywall must offer exactly what the RevenueCat Offering can actually sell. A card whose
// package is absent from the Offering resolves to `not_available` and yields a dead button —
// which is precisely the defect this replaced. If subscriptions are ever re-added to the
// Offering, add them back to `plans` AND update these assertions together.
const { plans, lifetimePlan, freeFeatures } = require(path.join(SRC, "features/paywall/MonetizationCatalog.ts"));
eq("C plans contains exactly one purchasable plan", plans.length, 1);
eq("C the only plan is lifetime", plans[0].interval, "lifetime");
eq("C lifetimePlan points at that plan", lifetimePlan.id, "lifetime");
eq("C lifetime uses the $rc_lifetime package", lifetimePlan.revenueCatPackageId, "$rc_lifetime");
eq("C lifetime product id unchanged", lifetimePlan.productId, "com.ocoeestudios.auralunis.lifetime");
// No monthly/annual card can be rendered, so no subscription price can be advertised.
for (const stale of ["$9.99", "$49.99", "$129.99"]) {
  hasnt(read("src/features/paywall/MonetizationCatalog.ts"), stale, `C catalog no longer advertises ${stale}`);
}
hasnt(read("src/theme/tokens.ts"), "$9.99", "C pricing tokens no longer carry a monthly price");
hasnt(read("src/theme/tokens.ts"), "$49.99", "C pricing tokens no longer carry an annual price");

// The Free column must not over-promise. `freeFeatures` says "Three starter Learn lessons";
// that number has to equal the real gate, or the paywall advertises access the code denies.
const { FREE_LEARN_LESSON_IDS } = require(path.join(SRC, "features/learn/LearnCatalog.ts"));
const WORD = { 1: "One", 2: "Two", 3: "Three", 4: "Four", 5: "Five" };
const lessonLine = freeFeatures.find((f) => /Learn lessons/.test(f));
eq(
  "C free-lesson copy matches FREE_LEARN_LESSON_IDS",
  lessonLine,
  `${WORD[FREE_LEARN_LESSON_IDS.length]} starter Learn lessons`
);

console.log("\n── Part D: every user-facing monetization surface ──");
// Parts A–C cover the paywall itself. This part exists because the regression that actually
// shipped elsewhere was NOT in the paywall: a premium gate screen rendered
// "From $4.17/month, billed annually" next to an Unlock CTA, because the monthly/annual
// pricing tokens were still reachable. These guards scan the surfaces a new customer can
// reach, so retired subscription pricing cannot reappear anywhere that sells to them.
//
// IMPORTANT: legacy-subscriber identifiers, entitlement recognition, restore and Apple
// subscription-management logic are REQUIRED and must never be flagged here. Only
// new-customer SALES language and retired PRICES are prohibited.

const gate = read("src/components/PremiumModeGate.tsx");
const entitlement = read("src/features/paywall/entitlementStatus.ts");
const settings = read("src/screens/SettingsScreen.tsx");
const terms = read("src/screens/TermsScreen.tsx");
const appRoot = read("App.tsx");
const publicTerms = read("public/TERMS.md");
const claudeMd = read("CLAUDE.md");

// D1. Premium gate — the exact surface that regressed on the other lineage.
has(gate, "AuraLunisPricing.lifetime", "gate quotes the Lifetime price token");
hasnt(gate, "annualMonthly", "gate does not quote the retired annual-monthly token");
hasnt(gate, "AuraLunisPricing.monthly", "gate does not quote a monthly price");
hasnt(gate, "AuraLunisPricing.annual", "gate does not quote an annual price");
hasnt(gate, "billed annually", "gate does not advertise annual billing");

// D2. Retired prices and new-customer sales phrases, across every reachable surface.
const SALES_SURFACES = [
  ["PremiumModeGate", gate],
  ["SettingsScreen", settings],
  ["TermsScreen", terms],
  ["App.tsx", appRoot],
  ["entitlementStatus", entitlement],
  ["public/TERMS.md", publicTerms],
  ["CLAUDE.md", claudeMd],
];
const RETIRED = ["$129.99", "$4.17", "$9.99/month", "$49.99/year", "Most Popular", "Cancel anytime"];
for (const [label, blob] of SALES_SURFACES) {
  for (const stale of RETIRED) hasnt(blob, stale, `D ${label} free of retired "${stale}"`);
}

// D3. Pre-launch wording is no longer true — the app ships.
for (const [label, blob] of [["App.tsx", appRoot], ["SettingsScreen", settings]]) {
  hasnt(blob, "once AuraLunis is live", `D ${label} has no pre-launch purchase wording`);
  hasnt(blob, "Subscriptions available after launch", `D ${label} has no retired subscription alert`);
}

// D4. Non-subscriber CTA points at Lifetime; legacy CTA preserved.
has(entitlement, 'ctaLabel: "View Lifetime"', "D non-subscriber CTA points to Lifetime");
has(entitlement, 'ctaLabel: "Manage Subscription"', "D legacy subscriber keeps Apple management CTA");
has(entitlement, "activeSubscriptions", "D legacy subscription recognition preserved");

// D5. Legacy product IDs must survive — required to recognize existing subscribers.
const catalogSrc = read("src/features/paywall/MonetizationCatalog.ts");
for (const id of [
  "com.ocoeestudios.auralunis.lifetime",
  "com.ocoeestudios.auralunis.premium.monthly",
  "com.ocoeestudios.auralunis.premium.annual",
]) {
  has(catalogSrc, id, `D product id preserved: ${id}`);
}
has(catalogSrc, 'entitlement: "AuraLunis Premium"', "D entitlement identifier is exact");

// D6. Legal/user-facing terms state the current contract.
has(terms, "$29.99", "D in-app Terms quote the current Lifetime price");
has(terms, "not a subscription", "D in-app Terms state Lifetime is not a subscription");
has(terms, "no free trial", "D in-app Terms state Lifetime has no trial");
has(publicTerms, "$29.99", "D published Terms quote the current Lifetime price");
has(claudeMd, "$29.99", "D agent-facing contract quotes the current Lifetime price");

console.log(`\nPaywall-copy self-test: ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
