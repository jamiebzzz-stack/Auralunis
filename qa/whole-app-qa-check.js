const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const failures = [];
const passes = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function check(label, condition, detail = "") {
  if (condition) {
    passes.push({ label, detail });
    console.log("PASS", label);
  } else {
    failures.push({ label, detail });
    console.error("FAIL", label, detail);
  }
}

const required = [
  "App.tsx",
  "src/navigation/RootTabs.tsx",
  "src/screens/HomeScreen.tsx",
  "src/screens/SkyScreen.tsx",
  "src/screens/LearnScreen.tsx",
  "src/screens/VaultScreen.tsx",
  "src/screens/SettingsScreen.tsx",
  "src/screens/BirthSkyScreen.tsx",
  "src/features/onboarding/OnboardingFlow.tsx",
  "src/features/paywall/ThreeTierPaywallModal.tsx",
  "src/features/paywall/MonetizationCatalog.ts",
  "src/features/sky-lens/SkyLensScreen.tsx",
  "src/features/sky-lens/SkyLensCanvas.tsx",
  "src/features/sky-lens/SolidSkyBackgroundLayer.tsx",
  "src/features/sky-lens/layers/NebulaImageLayer.tsx",
  "src/features/sky-lens/ManualSkyMap.tsx",
  "src/features/archive/DeepSkyCatalog.ts",
  "src/features/learn/LearnCatalog.ts",
  "src/state/AuraLunisSettingsContext.tsx",
  "src/state/AuraLunisVaultContext.tsx",
  "src/services/VaultEncryption.ts",
  "src/services/RevenueCatService.ts",
  "src/components/LogoMark.tsx",
  "assets/logo/auralunis-app-icon.png",
  "assets/logo/auralunis-splash.png",
  "assets/sky-backgrounds/sky-background-cool-violet.png"
];

for (const rel of required) check(`required file: ${rel}`, exists(rel));

const app = read("App.tsx");
check("app root is protected by ErrorBoundary", app.includes("<ErrorBoundary>"));
check("app root uses GestureHandlerRootView", app.includes("GestureHandlerRootView"));
check("first-open onboarding uses current storage key", app.includes('const ONBOARDING_SEEN_KEY = "auralunis.onboarding.seen"'));
check("RevenueCat startup failure is guarded", app.includes("configureRevenueCat().catch"));
check("purchase and restore flows are present", app.includes("purchaseAuraLunisPackage") && app.includes("restoreAuraLunisPurchases"));
check("entitlement refreshes after purchase and restore", (app.match(/refreshEntitlement\(\)/g) || []).length >= 2);
check("paywall renders outside NavigationContainer", app.indexOf("</NavigationContainer>") < app.indexOf("<ThreeTierPaywallModal"));

const tabs = read("src/navigation/RootTabs.tsx");
const approvedTabs = ["Home", "Sky", "Learn", "Vault", "Settings"];
for (const tab of approvedTabs) check(`active tab: ${tab}`, tabs.includes(`<Tab.Screen name="${tab}"`));
for (const retired of ["Now", "Explore", "Watch", "Time", "Insights", "More"]) {
  check(`retired tab absent: ${retired}`, !tabs.includes(`<Tab.Screen name="${retired}"`));
}
const tabScreenMatches = [...tabs.matchAll(/<Tab\.Screen name="([^"]+)" component=\{(\w+Screen)\}/g)];
check("exactly five tab screens registered", tabScreenMatches.length === 5, String(tabScreenMatches.length));
for (const [, tabName, componentName] of tabScreenMatches) {
  check(`tab component exists: ${tabName}`, exists(`src/screens/${componentName}.tsx`), componentName);
}

const home = read("src/screens/HomeScreen.tsx");
for (const term of ["CelestialDial", "computeTonightSky", "fetchCurrentWeather", "computeTonightScore", "scheduleSkyEventNotifications", "StargazingIndexCard"]) {
  check(`Home integration: ${term}`, home.includes(term));
}
check("Home weather rejection is guarded", home.includes("fetchCurrentWeather(location).then(setWeather).catch"));
check("Home notification scheduling is guarded", home.includes("scheduleSkyEventNotifications") && home.includes(".catch(() => {})"));

const sky = read("src/screens/SkyScreen.tsx");
for (const term of ["SkyLensScreen", "ManualSkyMap", "BirthSkyScreen", "AstroWeatherScreen", "PhotoPlannerScreen", "CelestialCalendarScreen", "CelestialArchiveScreen"]) {
  check(`Sky destination wired: ${term}`, sky.includes(term));
}
check("Sky full-screen destinations hide the tab bar", sky.includes('tabBarStyle: immersive ? { display: "none" } : TAB_BAR_STYLE'));

const skyLens = read("src/features/sky-lens/SkyLensScreen.tsx");
check("Sky Lens is permanent planetarium", skyLens.includes("const planetarium = true"));
check("Sky Lens no longer imports CameraView", !skyLens.includes('from "expo-camera"') && !skyLens.includes("<CameraView"));
check("cinematic background is wired", skyLens.includes("SolidSkyBackgroundLayer"));
check("image-backed nebula layer is wired", skyLens.includes("NebulaImageLayer"));
check("aurora curtain visual bands stay disabled", skyLens.includes("visible={false}") && skyLens.includes("intensity={0}"));

const nebulaLayer = read("src/features/sky-lens/layers/NebulaImageLayer.tsx");
// Nebulae are now PROCEDURAL (an `ART` record of SVG art directions), not PNG assets.
// The whole project direction moved off image "stickers" to restrained procedural
// clouds, so the old `${id}: require(...png)` expectation is obsolete. Verify each hero
// still has an art-direction entry instead.
for (const id of ["m42", "m8", "m16", "ngc3372", "ngc7000", "m17", "m20", "ngc2237", "m27", "m57", "m1", "ngc6960"]) {
  check(`nebula art mapping: ${id}`, nebulaLayer.includes(`${id}: { scale`));
}

const birthSky = read("src/screens/BirthSkyScreen.tsx");
check("Birth Sky does not use current device location", !birthSky.includes("useObserverLocation"));
check("Birth Sky requires a birthplace", birthSky.includes("BIRTHPLACE") && birthSky.includes("findBirthplace"));
check("Birth Sky accepts AM/PM time", birthSky.includes("parseBirthTime") && birthSky.includes("meridiemMatch"));
check("Birth Sky supports 24-hour time", birthSky.includes("twentyFourHourMatch"));
check("Birth Sky converts local time using birthplace timezone", birthSky.includes("resolveBirthMoment") && birthSky.includes("savedPlace.timezone"));
check("Birth Sky handles DST-edge / missing-timezone without guessing a chart", birthSky.includes("nonexistent-local-time") && birthSky.includes("ambiguous-local-time") && birthSky.includes("invalid-time-zone"));
check("Birth Sky renders chart from resolved birthplace", birthSky.includes("location={profile.location}"));
check("Birth Sky stores local date and time separately", birthSky.includes("BIRTH_DATE_LOCAL_STORAGE_KEY") && birthSky.includes("BIRTH_TIME_LOCAL_STORAGE_KEY"));
check("Birth Sky labels unknown-time horizon as approximate", birthSky.includes('"Approx. eastern sky"') && birthSky.includes("approximationNote"));

const onboarding = read("src/features/onboarding/OnboardingFlow.tsx");
// Birth-chart setup is no longer a screen inside the app tour — it is a separate, optional
// prompt. The truthfulness guards move WITH the copy: wherever the chart is offered, it must
// still say plainly that an unknown birth time costs the rising sign and other time-sensitive
// detail.
const birthPrompt = read("src/features/onboarding/BirthChartPrompt.tsx");
check("birth-chart prompt is truthful that unknown birth time limits time-sensitive detail", birthPrompt.includes("rising sign") && birthPrompt.includes("time-sensitive"));
check("birth-chart prompt explains exact birthplace and time are still needed", birthPrompt.includes("birthplace") && birthPrompt.includes("birth time"));
check("birth-chart setup stays optional and skippable", birthPrompt.includes("Maybe Later"));
check("onboarding does not advertise removed camera AR", !onboarding.includes("Point your phone at the sky"));

const monetization = read("src/features/paywall/MonetizationCatalog.ts");
for (const price of ["$9.99/month", "$49.99/year", "$129.99"]) {
  check(`current price present: ${price}`, monetization.includes(price));
}
// A 7-day Apple intro trial may be offered to eligible new subscribers. The claim must be
// CONDITIONAL (eligibility-gated), never an unconditional "everyone gets a trial".
check(
  "trial claim is conditional (eligibility-gated)",
  monetization.includes("may be available to eligible new subscribers") &&
    !monetization.includes("No free trials on any plan")
);
check("lifetime RevenueCat package id is canonical", monetization.includes('lifetime:          "$rc_lifetime"'));
check("premium entitlement identifier is exact", monetization.includes('entitlement: "AuraLunis Premium"'));

const settingsContext = read("src/state/AuraLunisSettingsContext.tsx");
check("settings persist with AsyncStorage", settingsContext.includes("AsyncStorage"));
check("settings sanitize restored data", settingsContext.includes("sanitizeSettings"));

const vaultContext = read("src/state/AuraLunisVaultContext.tsx");
check("vault persists with AsyncStorage", vaultContext.includes("AsyncStorage"));
check("vault uses encrypted read/write boundary", vaultContext.includes("encryptVault") && vaultContext.includes("decryptVault"));
const vaultEncryption = read("src/services/VaultEncryption.ts");
check("vault encryption uses NaCl secretbox", vaultEncryption.includes("nacl.secretbox"));
check("vault encryption key uses SecureStore", vaultEncryption.includes("SecureStore") || vaultEncryption.includes("SecureStorage"));

const weather = read("src/services/WeatherService.ts");
check("weather uses disclosed keyless Open-Meteo", weather.includes("api.open-meteo.com"));
check("weather failure returns fallback", weather.includes("catch") && weather.includes("return FALLBACK"));
check("weather no longer calls OpenWeatherMap", !weather.includes("api.openweathermap.org"));

const featureCard = read("src/components/FeatureCard.tsx");
check("haptics cannot block FeatureCard action", featureCard.includes("selectionAsync().catch") && featureCard.indexOf("selectionAsync().catch") < featureCard.indexOf("onPress?.()"));

const shell = read("src/components/ScreenShell.tsx");
check("ScreenShell respects safe area", shell.includes("useSafeAreaInsets") && shell.includes("insets.top"));
// The real usage casts the tuple: `colors={palette.gradient as unknown as ...}`. Match
// the prefix, not an exact `}`, so the (correct) cast does not fail this check.
check("theme gradient tuple is preserved", shell.includes("colors={palette.gradient"));

const appConfig = JSON.parse(read("app.json"));
check("app version is launch version or newer", /^\d+\.\d+\.\d+$/.test(appConfig.expo.version) && appConfig.expo.version !== "0.1.0", appConfig.expo.version);
check("app icon configured", appConfig.expo.icon === "./assets/logo/auralunis-app-icon.png");
check("splash configured", appConfig.expo.splash && appConfig.expo.splash.image === "./assets/logo/auralunis-splash.png");

const allTsFiles = [];
function collect(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) allTsFiles.push(full);
  }
}
collect(path.join(root, "src"));
const unsupportedWeights = [];
for (const full of allTsFiles) {
  const text = fs.readFileSync(full, "utf8");
  if (text.includes('fontWeight: "850"')) unsupportedWeights.push(path.relative(root, full));
}
check("no unsupported fontWeight 850 values", unsupportedWeights.length === 0, unsupportedWeights.join(", "));

console.log("");
console.log(`Whole-app QA: ${passes.length} pass, ${failures.length} fail.`);
if (failures.length) {
  for (const failure of failures) console.error(`- ${failure.label}${failure.detail ? `: ${failure.detail}` : ""}`);
  process.exit(1);
}

console.log("AuraLunis whole-app QA passed.");
