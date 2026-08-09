// Birth Sky premium-gate deterministic self-test.
//
// Product decision: Birth Sky is an ENTIRELY premium feature. A non-entitled user must never
// reach the input form, generate a chart, or see results/narratives/planet-detail/sharing.
// Two layers enforce this:
//   1. Entry gate  — the "Your Birth Sky" Sky card paywalls non-entitled users (never opens it).
//   2. Screen guard — BirthSkyScreen early-returns a premium preview/gate for non-entitled users,
//                     so the form/chart is unreachable even if the screen is opened another way.
// Pure gate logic is executed; the two-layer wiring is asserted by scanning source.

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

const sky = read("src/screens/SkyScreen.tsx");
const bs = read("src/screens/BirthSkyScreen.tsx");

console.log("── 1/2. Entry gate: non-entitled Sky card tap → paywall, never opens Birth Sky ──");
const cardIdx = sky.indexOf('actionLabel="Reveal My Birth Sky"');
eq("the Birth Sky card exists", cardIdx >= 0, true);
const cardRegion = cardIdx >= 0 ? sky.slice(cardIdx, cardIdx + 320) : "";
has(cardRegion, "if (!isPremium) { openPaywall(); return; }", "non-entitled tap opens the paywall and does NOT open Birth Sky");
has(cardRegion, "setBirthSkyOpen(true)", "entitled users still open Birth Sky from the card (enter normally)");

console.log("\n── 3/4/5. Screen guard: form/chart unreachable for non-entitled ──");
const guardIdx = bs.indexOf("if (!isPremium) {");
eq("BirthSkyScreen has a screen-level !isPremium guard", guardIdx >= 0, true);
// The guard block = from the guard to the MAIN return (2-space indent). The guard's own return is
// deeper-indented, so this delimiter uniquely marks where the guard ends and the feature begins.
const mainReturnDelim = '  return (\n    <ScreenShell title="Your Birth Sky"';
const mainReturnIdx = bs.lastIndexOf(mainReturnDelim);
eq("the full feature has its own (main) return", mainReturnIdx > guardIdx, true);
const guardBlock = guardIdx >= 0 && mainReturnIdx > guardIdx ? bs.slice(guardIdx, mainReturnIdx) : "";
has(guardBlock, "PREMIUM FEATURE", "guard renders a premium preview/gate");
has(guardBlock, "openPaywall()", "guard's Unlock Premium opens the existing paywall");
// The guard must NOT render any part of the actual feature.
hasnt(guardBlock, "Generate My Birth Sky", "guard does NOT render the generate button");
hasnt(guardBlock, "TextInput", "guard does NOT render the input form");
hasnt(guardBlock, "YOUR TROPICAL PLACEMENTS", "guard does NOT render the birth-chart placements");
// The feature (form + chart) exists ONLY past the guard — reached only when isPremium is true.
const genIdx = bs.indexOf("Generate My Birth Sky");
// The circular canvas was replaced by the tropical placement table; the gate rule is
// unchanged — the chart result must exist only past the premium guard.
const canvasIdx = bs.indexOf("YOUR TROPICAL PLACEMENTS");
const inputIdx = bs.indexOf("<TextInput");
eq("Generate button is only past the guard (premium-only)", genIdx > guardIdx, true);
eq("birth-chart placements are only past the guard (premium-only)", canvasIdx > guardIdx, true);
eq("input form is only past the guard (premium-only)", inputIdx > guardIdx, true);

console.log("\n── Entitlement uses the single 'AuraLunis Premium' source (no new string) ──");
has(bs, "useEntitlement()", "BirthSkyScreen reads entitlement via useEntitlement");
hasnt(bs, "auralunis_premium", "no snake_case entitlement string introduced");
has(read("src/features/paywall/MonetizationCatalog.ts"), 'entitlement: "AuraLunis Premium"', "canonical entitlement unchanged");

// NOTE: a hardcoded-base git "untouched files" block used to live here (base 6360868, freezing
// MonetizationCatalog / RevenueCatService / EntitlementContext / ThreeTierPaywallModal /
// PaywallNavigationContext). It was removed because it produced false failures the moment a sibling
// paywall PR legitimately touched a listed file (the trial-copy refactor touches
// ThreeTierPaywallModal) — the same fragile-base rot already pruned from photo-planner (#189) and
// that required hotfix PR #185. Birth Sky's own gating is fully covered by sections 1–6 above; the
// monetization contract is guarded by qa:revenuecat and qa:paywall-restore.

console.log(`\nBirth Sky premium-gate self-test: ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
