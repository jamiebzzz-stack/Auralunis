const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const failures = [];
const passes = [];

function check(label, condition, detail = "") {
  if (condition) {
    passes.push(label);
    console.log("PASS", label);
  } else {
    failures.push(`${label}${detail ? `: ${detail}` : ""}`);
    console.error("FAIL", label, detail);
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const app = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8"));
const catalog = fs.readFileSync(
  path.join(root, "src/features/paywall/MonetizationCatalog.ts"),
  "utf8"
);
const service = fs.readFileSync(
  path.join(root, "src/services/RevenueCatService.ts"),
  "utf8"
);
const paywall = fs.readFileSync(
  path.join(root, "src/features/paywall/ThreeTierPaywallModal.tsx"),
  "utf8"
);
// Paywall copy (trial gating, CTA, disclosure) lives in the pure, node-tested resolvePlanCopy
// helper; the modal consumes it. Trial-gating assertions read the helper, not the modal.
const copy = fs.readFileSync(
  path.join(root, "src/features/paywall/paywallCopy.ts"),
  "utf8"
);

check(
  "react-native-purchases dependency",
  Boolean(pkg.dependencies && pkg.dependencies["react-native-purchases"])
);
check(
  "RevenueCat iOS public key placeholder",
  Boolean(app.expo.extra && app.expo.extra.revenueCatIosApiKey)
);
// (No Android RevenueCat key check — AuraLunis ships iOS-only; app.json carries only the
// iOS key. Requiring an Android key audited a platform the app doesn't target.)

// The pricing was migrated off the old `chronaura` Horizon/Aura/Sovereign product model
// to the shipped AuraLunis Premium model. Assert the REAL product IDs + entitlement that
// live in MonetizationCatalog.ts today (CLAUDE.md: premium monthly/annual + founders
// lifetime, all unlocking one entitlement). This audits the pricing that ships — it does
// not change it.
for (const term of [
  "com.ocoeestudios.auralunis.premium.monthly",
  "com.ocoeestudios.auralunis.premium.annual",
  "com.ocoeestudios.auralunis.lifetime",
  "AuraLunis Premium"
]) {
  check(`catalog: ${term}`, catalog.includes(term));
}

for (const term of [
  "Purchases.configure",
  "Purchases.getOfferings",
  "Purchases.purchasePackage",
  "Purchases.restorePurchases",
  "Purchases.getCustomerInfo",
  "managementURL"
]) {
  check(`RevenueCat service: ${term}`, service.includes(term));
}

// Real three-tier paywall: Monthly, Annual, Lifetime, plus Restore Purchases. (The old
// "Horizon Free / Aura Pro / Sovereign Coming Later" tier gating belonged to the retired
// chronaura model and is no longer part of the shipped paywall.)
check("paywall copy: Monthly tier", paywall.includes("Monthly"));
check("paywall copy: Annual tier", paywall.includes("Annual"));
check("paywall copy: Lifetime tier", paywall.includes("Lifetime"));
check("paywall copy: Restore Purchases", paywall.includes("Restore Purchases"));

// ── 7-day introductory trial wiring ────────────────────────────────────────────
// The trial is Apple-owned (an introductory offer on the monthly/annual products). The app
// must only REFLECT it — read the real offer + eligibility from StoreKit/RevenueCat, gate
// all trial copy on confirmed eligibility, keep lifetime trial-free, and never fabricate a
// local trial timer or locally granted entitlement. These assertions lock that contract.
const offersHook = fs.readFileSync(
  path.join(root, "src/features/paywall/usePaywallOffers.ts"),
  "utf8"
);

// 1. Purchasing still goes through RevenueCat packages (no fake local unlock).
check("purchase still uses RevenueCat packages", service.includes("Purchases.purchasePackage"));

// 2. Eligibility is read from the supported RevenueCat API, not assumed.
check(
  "reads introductory-offer eligibility from RevenueCat",
  service.includes("checkTrialOrIntroductoryPriceEligibility")
);

// 3. Offer details are read from live StoreKit product data (introPrice), and localized
//    store prices remain the source of truth.
check("reads intro offer from live product data (introPrice)", service.includes("introPrice"));
check(
  "localized StoreKit prices are the source of truth",
  service.includes("priceString") && paywall.includes("localizedPrice")
);

// 4. A trial is promised ONLY when BOTH the store reports an offer AND the account is
//    eligible — never on eligibility alone.
check(
  "trial requires an actual offer AND eligibility",
  offersHook.includes('elig === "eligible" && pkg?.introOffer')
);

// 5. Trial copy is CONDITIONAL: the pure copy helper produces trial wording ONLY for the
//    store-confirmed eligible branch; the modal delegates every string to it (no re-derivation).
check(
  "paywall trial copy is gated on confirmed eligibility",
  copy.includes('trial.status === "eligible"') && paywall.includes("resolvePlanCopy")
);

// 6. Lifetime never shows trial wording.
check(
  "lifetime is forced trial-free",
  offersHook.includes('p.interval === "lifetime"') &&
    offersHook.includes("lifetime is one-time — NEVER a trial")
);

// 7. No fabricated local trial: no timer, no locally granted entitlement, no fake unlock.
const trialSurfaces = `${service}\n${offersHook}\n${paywall}`;
check(
  "no local trial timer",
  !/setTimeout\s*\([^)]*trial/i.test(trialSurfaces) && !/trialEndsAt|trialExpires/i.test(trialSurfaces)
);
check(
  "no locally granted premium entitlement for trials",
  !/grantPremium|setPremium\s*\(\s*true|entitlements\.active\[[^\]]+\]\s*=/.test(trialSurfaces)
);

// 8. Failed eligibility must not block purchasing — the lookup degrades to {} / normal price.
check(
  "eligibility failure degrades gracefully (never blocks purchase)",
  service.includes("return {}") && offersHook.includes('status: "unavailable"')
);

// 9. Renewal / trial-renewal disclosure is present (in the copy helper) and rendered by the modal.
check(
  "renewal disclosure present",
  copy.includes("renews automatically") &&
    copy.includes("After the free trial") &&
    paywall.includes("{disclosure}")
);


// ══════════════════════════════════════════════════════════════════════════════════════
// NO PREMIUM BYPASS. Premium must be granted by exactly one thing: an active entitlement
// returned by RevenueCat.
//
// A dev flag (ALLOW_DEV_PREMIUM) and a build-time env override (EXPO_PUBLIC_FORCE_PREMIUM,
// set by the EAS "preview" profile) used to short-circuit fetchMembership to premium. Both
// were dead-code-eliminated from the App Store bundle, so no shipped build was ever
// unlocked — but their correctness depended entirely on which EAS profile produced the
// submission. These guards make a reintroduction fail here rather than in review.
const entitlement = fs.readFileSync(path.join(root, "src/context/EntitlementContext.tsx"), "utf8");
const easRaw = fs.readFileSync(path.join(root, "eas.json"), "utf8");
const eas = JSON.parse(easRaw);
// Comment-stripped: the file documents what was removed, and that prose must not trip the guard.
const entitlementCode = entitlement
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");

check("no development constant can force premium", !/ALLOW_DEV_PREMIUM/.test(entitlementCode));
check("no bypass helper survives", !/devPremium/.test(entitlementCode));
check("no environment variable can force premium", !/FORCE_PREMIUM|process\.env\.EXPO_PUBLIC_FORCE/.test(entitlementCode));
check("no __DEV__ short-circuit grants premium", !/__DEV__[\s\S]{0,120}isPremium: true/.test(entitlementCode));
check(
  "premium is derived ONLY from an active RevenueCat entitlement",
  /const isPremium = Boolean\(info\.entitlements\.active\[RevenueCatIds\.entitlement\]\)/.test(entitlementCode) &&
    !/isPremium: true/.test(entitlementCode),
  "the only `true` must come from the entitlements map"
);
check(
  "missing RevenueCat SDK fails CLOSED",
  /if \(!Purchases\) return \{ isPremium: false, kind: "none" \}/.test(entitlementCode)
);
check(
  "unconfigured RevenueCat fails CLOSED",
  /configuration\.status !== "configured"\) return \{ isPremium: false, kind: "none" \}/.test(entitlementCode)
);
check(
  "an SDK error fails CLOSED",
  /catch \{[\s\S]{0,120}return \{ isPremium: false, kind: "none" \}/.test(entitlementCode)
);
check(
  "configuration is awaited BEFORE CustomerInfo is queried",
  entitlementCode.indexOf("await configureRevenueCat()") > 0 &&
    entitlementCode.indexOf("await configureRevenueCat()") < entitlementCode.indexOf("getCustomerInfo()")
);

// eas.json — no profile may carry a premium-unlock flag.
const profiles = Object.entries(eas.build || {});
check("eas.json still defines its build profiles", profiles.length >= 2, `${profiles.length} profiles`);
for (const [name, profile] of profiles) {
  const env = profile && profile.env ? Object.keys(profile.env) : [];
  check(
    `eas profile "${name}" carries no premium-unlock env flag`,
    !env.some((k) => /PREMIUM|UNLOCK|ENTITLE/i.test(k)),
    env.join(",")
  );
}
check("EXPO_PUBLIC_FORCE_PREMIUM appears nowhere in eas.json", !/FORCE_PREMIUM/.test(easRaw));
// The production profile must still EXIST and carry no premium-unlock flag (that is what this
// guard is for). It originally pinned autoIncrement === true; the 1.0.1 release deliberately
// sets it to FALSE so EAS cannot advance past the intended build number, so the assertion now
// pins that release requirement instead — strictly stronger than "unchanged".
check("the production profile still exists", !!eas.build.production);
// Build numbers come from EAS's REMOTE counter (cli.appVersionSource === "remote"), not from
// app.json — EAS ignores ios.buildNumber entirely in that mode. With remote as the source of
// truth, autoIncrement must be ON: the remote counter holds the last uploaded build and
// autoIncrement advances it by exactly one per production build. It is the PAIR that makes the
// next build deterministic, so assert both rather than either alone.
check(
  "EAS build numbers come from the remote counter, not app config",
  eas.cli && eas.cli.appVersionSource === "remote",
  String(eas.cli && eas.cli.appVersionSource)
);
check(
  "production autoIncrement is ON so the remote counter advances exactly one per build",
  eas.build.production.autoIncrement === true,
  String(eas.build.production.autoIncrement)
);
check(
  "the production profile carries no env block at all",
  eas.build.production.env === undefined
);
check("submission config is untouched", eas.submit && eas.submit.production && eas.submit.production.ios.ascAppId === "6784049770");

// The in-flight guards must survive this edit untouched.
check("purchase-tier in-flight guard intact", /_purchaseTierInFlight/.test(service));
check("package-purchase in-flight guard intact", /_purchasePackageInFlight/.test(service));
check("restore in-flight guard intact", /_restoreInFlight/.test(service));
check(
  "every latch clears on BOTH success and failure",
  (service.match(/run\.catch\(\(\) => \{\}\)\.then\(\(\) => \{ _\w+ = null; \}\)/g) || []).length >= 3
);

console.log("");
console.log(`RevenueCat preflight: ${passes.length} pass, ${failures.length} fail.`);

if (failures.length) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
