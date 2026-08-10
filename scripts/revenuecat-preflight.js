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
const offersHook = fs.readFileSync(
  path.join(root, "src/features/paywall/usePaywallOffers.ts"),
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

// Keep all three store product IDs in the catalog because Monthly/Annual remain valid legacy
// subscriptions and must continue restoring/unlocking the shared AuraLunis Premium entitlement.
// The NEW-CUSTOMER offering/paywall is lifetime-only; product retention != product saleability.
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

// New-customer paywall contract: Lifetime only. Monthly/Annual are intentionally retained in
// the catalog + entitlement for legacy subscribers, but must not be rendered as selectable
// new purchases. Restore remains visible so legacy customers can recover access.
check("paywall copy: Lifetime tier", paywall.includes("Lifetime"));
check("paywall copy: Restore Purchases", paywall.includes("Restore Purchases"));
check(
  "new-customer paywall does not render Monthly tier",
  !paywall.includes("plan={monthly}") && !paywall.includes('id === "premium_monthly"')
);
check(
  "new-customer paywall does not render Annual tier",
  !paywall.includes("plan={annual}") && !paywall.includes('id === "premium_annual"')
);

// Purchasing must still go through RevenueCat packages; no fake/local unlocks.
check("purchase still uses RevenueCat packages", service.includes("Purchases.purchasePackage"));

// Legacy subscription support remains wired in the RevenueCat service. This preserves existing
// subscribers and restore/manage behavior even though those plans are no longer shown for sale.
check(
  "legacy introductory-offer eligibility support remains available",
  service.includes("checkTrialOrIntroductoryPriceEligibility")
);
check("reads intro offer from live product data (introPrice)", service.includes("introPrice"));
check(
  "localized StoreKit prices are the source of truth",
  service.includes("priceString") && paywall.includes("localizedPrice")
);

// If a legacy subscription surface ever uses trial metadata, it must still require BOTH a real
// StoreKit intro offer and positive account eligibility; retaining this guard prevents regressions.
check(
  "legacy trial requires an actual offer AND eligibility",
  offersHook.includes('elig === "eligible" && pkg?.introOffer')
);
check(
  "lifetime is forced trial-free",
  offersHook.includes('p.interval === "lifetime"') &&
    offersHook.includes("lifetime is one-time — NEVER a trial")
);

const trialSurfaces = `${service}\n${offersHook}\n${paywall}`;
check(
  "no local trial timer",
  !/setTimeout\s*\([^)]*trial/i.test(trialSurfaces) && !/trialEndsAt|trialExpires/i.test(trialSurfaces)
);
check(
  "no locally granted premium entitlement for trials",
  !/grantPremium|setPremium\s*\(\s*true|entitlements\.active\[[^\]]+\]\s*=/.test(trialSurfaces)
);
check(
  "eligibility failure degrades gracefully (never blocks purchase)",
  service.includes("return {}") && offersHook.includes('status: "unavailable"')
);

// The lifetime-only new-customer paywall must not advertise subscription or trial terms.
check(
  "new-customer paywall has no trial language",
  !/free trial|7-day|7 days free/i.test(paywall)
);
check(
  "new-customer paywall has no auto-renewal disclosure",
  !/renews automatically|After the free trial/i.test(paywall)
);

console.log("");
console.log(`RevenueCat preflight: ${passes.length} pass, ${failures.length} fail.`);

if (failures.length) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
