// Paywall / restore-truthfulness deterministic self-test (Build 5 fix).
//
// Proves the runtime guarantees this PR added:
//   - restore success is shown ONLY when the exact "AuraLunis Premium" entitlement is active
//   - a completed restore with no entitlement does not unlock premium
//   - a genuine restore error is a DISTINCT path (not "not configured")
//   - "Manage Subscription" is shown only for an active auto-renewing legacy subscription
//   - lifetime is classified as lifetime (never a subscription, never trial copy)
//   - new customers get a Lifetime-only CTA; no legacy subscription sales copy leaks into Settings
//   - the entitlement constant is exactly "AuraLunis Premium"
// Pure logic is executed; UI/handler shape is asserted by scanning source (no RN runtime).

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");

// ── transpile-require: load node-safe .ts modules, resolve "@/…" to src/… ──
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

const { hasAuraLunisEntitlement, classifyAuraLunisMembership, resolveMembershipCta } = require(path.join(SRC, "features/paywall/entitlementStatus.ts"));
const { RevenueCatIds } = require(path.join(SRC, "features/paywall/MonetizationCatalog.ts"));

let pass = 0, fail = 0;
const ok = (m) => { pass += 1; console.log("PASS " + m); };
const bad = (m) => { fail += 1; console.log("FAIL " + m); };
const eq = (n, a, b) => (a === b ? ok(n) : bad(`${n} — got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const has = (hay, needle, n) => (hay.includes(needle) ? ok(n) : bad(`${n} — expected present: ${needle}`));
const hasnt = (hay, needle, n) => (!hay.includes(needle) ? ok(n) : bad(`${n} — should be absent: ${needle}`));

const ENT = RevenueCatIds.entitlement;
const MONTHLY = RevenueCatIds.products.premiumMonthly;
const ANNUAL = RevenueCatIds.products.premiumAnnual;
const LIFETIME = RevenueCatIds.products.lifetime;

console.log("── Entitlement identifier (must stay exactly 'AuraLunis Premium') ──");
eq("entitlement constant is exactly \"AuraLunis Premium\"", ENT, "AuraLunis Premium");
eq("entitlement constant is NOT the snake_case slug", ENT === "auralunis_premium", false);

console.log("\n── Restore truthfulness: entitlement drives success, not a bare completed call ──");
eq("no active entitlement → not entitled", hasAuraLunisEntitlement({ entitlements: { active: {} } }), false);
eq("active entitlement → entitled", hasAuraLunisEntitlement({ entitlements: { active: { [ENT]: {} } } }), true);
eq("wrong (snake_case) key active → NOT entitled", hasAuraLunisEntitlement({ entitlements: { active: { auralunis_premium: {} } } }), false);
eq("some other entitlement active → NOT entitled", hasAuraLunisEntitlement({ entitlements: { active: { "Some Other": {} } } }), false);

console.log("\n── Membership classification (subscription vs lifetime, from CustomerInfo) ──");
eq("no entitlement → none", classifyAuraLunisMembership({ entitlements: { active: {} }, activeSubscriptions: [] }), "none");
eq("entitled, no active sub → lifetime", classifyAuraLunisMembership({ entitlements: { active: { [ENT]: {} } }, activeSubscriptions: [] }), "lifetime");
eq("entitled via lifetime product (not a sub) → lifetime", classifyAuraLunisMembership({ entitlements: { active: { [ENT]: {} } }, activeSubscriptions: [LIFETIME] }), "lifetime");
eq("entitled + monthly sub → subscription", classifyAuraLunisMembership({ entitlements: { active: { [ENT]: {} } }, activeSubscriptions: [MONTHLY] }), "subscription");
eq("entitled + annual sub → subscription", classifyAuraLunisMembership({ entitlements: { active: { [ENT]: {} } }, activeSubscriptions: [ANNUAL] }), "subscription");
eq("active sub but NO entitlement → none (fail closed)", classifyAuraLunisMembership({ entitlements: { active: {} }, activeSubscriptions: [MONTHLY] }), "none");

console.log("\n── Restore handlers: gate on entitled + distinct error path ──");
const svc = read("src/services/RevenueCatService.ts");
has(svc, 'status: "error"', "RevenueCatService.restore returns a distinct \"error\" status");
has(svc, "classifyAuraLunisMembership(customerInfo)", "RevenueCatService.restore reports membership");
has(svc, "This is NOT \"not configured\"", "restore catch documents error is not conflated with not_configured");
const settings = read("src/screens/SettingsScreen.tsx");
has(settings, "result.entitled", "SettingsScreen restore success gated on result.entitled");
has(settings, 'result.status === "error"', "SettingsScreen shows a distinct restore error message");
has(settings, "No active AuraLunis purchase was found", "SettingsScreen shows truthful no-purchase message");
const app = read("App.tsx");
has(app, "result.entitled", "App.tsx restore success gated on result.entitled");
has(app, 'result.status === "error"', "App.tsx shows a distinct restore error message");
hasnt(app, "refreshed the membership status for this App Store account", "App.tsx no longer claims vague success");

console.log("\n── Manage Subscription visibility ──");
has(settings, 'membershipCta.ctaKind === "manage"', "Manage Subscription shown only for the resolver's manage state");
has(settings, 'membershipCta.ctaKind === "lifetime"', "Lifetime renders its own non-recurring state, not a manage button");
hasnt(settings, "isPremium ? styles.actionButton : styles.secondaryButton", "Manage Subscription no longer rendered for every premium/non-premium user");

console.log("\n── Trial language ──");
hasnt(settings, "introductory trial may be available", "Settings has no ungated 'trial may be available' sentence");
const offers = read("src/features/paywall/usePaywallOffers.ts");
has(offers, 'p.interval !== "lifetime"', "usePaywallOffers excludes lifetime from intro-offer eligibility");
has(offers, 'status: "unavailable"', "usePaywallOffers marks lifetime trial unavailable");
const modal = read("src/features/paywall/ThreeTierPaywallModal.tsx");
const copyHelper = read("src/features/paywall/paywallCopy.ts");
has(copyHelper, 'interval === "lifetime"', "resolvePlanCopy forces lifetime trial-free");
has(copyHelper, 'trial.status === "eligible"', "resolvePlanCopy renders trial copy only for the eligible branch");
has(modal, "resolvePlanCopy", "Paywall modal delegates all copy to the resolvePlanCopy helper");

console.log("\n── Monetization contract unchanged ──");
const catalog = read("src/features/paywall/MonetizationCatalog.ts");
has(catalog, 'entitlement: "AuraLunis Premium"', "entitlement constant unchanged");
has(catalog, '"com.ocoeestudios.auralunis.premium.monthly"', "monthly product id unchanged");
has(catalog, '"com.ocoeestudios.auralunis.premium.annual"', "annual product id unchanged");
has(catalog, '"com.ocoeestudios.auralunis.lifetime"', "lifetime product id unchanged");

console.log("\n── Settings membership CTA resolver (state matrix A–E) ──");
const SUB_MONTHLY = { entitlements: { active: { [ENT]: {} } }, activeSubscriptions: [MONTHLY] };
const SUB_ANNUAL = { entitlements: { active: { [ENT]: {} } }, activeSubscriptions: [ANNUAL] };
const LIFETIME_INFO = { entitlements: { active: { [ENT]: {} } }, activeSubscriptions: [] };
const NONE_INFO = { entitlements: { active: {} }, activeSubscriptions: [] };
const ctaFor = (info) => resolveMembershipCta(classifyAuraLunisMembership(info));

// A. no entitlement → new-customer Lifetime paywall CTA, never manage
const none = resolveMembershipCta("none");
eq("A none → ctaKind paywall", none.ctaKind, "paywall");
eq("A none → label 'View Lifetime'", none.ctaLabel, "View Lifetime");
eq("A none → Lifetime-only status copy", none.statusCopy, "Unlock AuraLunis Premium for life with one purchase.");
eq("A none → not a manage action", none.ctaKind !== "manage", true);
eq("A none (from CustomerInfo) → paywall", ctaFor(NONE_INFO).ctaKind, "paywall");
// E. loading/unknown/error fail-closed: EntitlementContext yields "none"; unexpected values default to non-subscriber
eq("E unknown/loading value → paywall (fail-closed)", resolveMembershipCta("loading").ctaKind, "paywall");
eq("E unknown value → never manage", resolveMembershipCta("weird").ctaKind !== "manage", true);
// B. active monthly → manage
eq("B monthly → ctaKind manage", ctaFor(SUB_MONTHLY).ctaKind, "manage");
eq("B monthly → label 'Manage Subscription'", ctaFor(SUB_MONTHLY).ctaLabel, "Manage Subscription");
// C. active annual → manage
eq("C annual → ctaKind manage", ctaFor(SUB_ANNUAL).ctaKind, "manage");
eq("C annual → label 'Manage Subscription'", ctaFor(SUB_ANNUAL).ctaLabel, "Manage Subscription");
// D. lifetime → non-recurring active state, never manage
const life = resolveMembershipCta("lifetime");
eq("D lifetime → ctaKind lifetime", life.ctaKind, "lifetime");
eq("D lifetime → never manage", life.ctaKind !== "manage", true);
eq("D lifetime → truthful active label", life.ctaLabel, "Lifetime Access");
eq("D lifetime (from CustomerInfo) → lifetime", ctaFor(LIFETIME_INFO).ctaKind, "lifetime");
eq("manage kind only for subscription states", [none, life].every((c) => c.ctaKind !== "manage"), true);
eq("paywall kind only for non-subscriber", resolveMembershipCta("subscription").ctaKind !== "paywall" && life.ctaKind !== "paywall", true);

console.log("\n── SettingsScreen renders from the resolver (no unconditional subscriber copy) ──");
const set = read("src/screens/SettingsScreen.tsx");
hasnt(set, "Subscribe when you're ready", "no unconditional 'Subscribe when you're ready' copy");
has(set, "resolveMembershipCta(membershipKind)", "SettingsScreen derives the card from resolveMembershipCta");
has(set, "membershipCta.statusCopy", "card copy comes from the resolver (never contradictory)");
has(set, 'membershipCta.ctaKind === "manage"', "Manage action gated on ctaKind manage");
has(set, 'membershipCta.ctaKind === "paywall"', "paywall action gated on ctaKind paywall");
has(set, 'membershipCta.ctaKind === "lifetime"', "lifetime renders its own non-recurring state");
has(set, "New purchases are Lifetime only.", "Settings explicitly states Lifetime-only new purchases");
hasnt(set, "AuraLunisPricing.monthly", "Settings does not advertise legacy Monthly pricing");
hasnt(set, "AuraLunisPricing.annual", "Settings does not advertise legacy Annual pricing");
const lifeIdx = set.indexOf('membershipCta.ctaKind === "lifetime"');
const lifeWindow = lifeIdx >= 0 ? set.slice(lifeIdx, lifeIdx + 220) : "";
hasnt(lifeWindow, "handleManageSubscription", "lifetime state never calls handleManageSubscription");

console.log(`\nPaywall/restore self-test: ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
