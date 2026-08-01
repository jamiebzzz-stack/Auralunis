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
    passes.push(label);
    console.log("PASS", label);
  } else {
    failures.push(`${label}${detail ? `: ${detail}` : ""}`);
    console.error("FAIL", label, detail);
  }
}

const packageJson = read("package.json");
const app = read("App.tsx");
const rootTabs = read("src/navigation/RootTabs.tsx");
const home = read("src/screens/HomeScreen.tsx");
const sky = read("src/screens/SkyScreen.tsx");
const skyLens = read("src/features/sky-lens/SkyLensScreen.tsx");
const birthSky = read("src/screens/BirthSkyScreen.tsx");
const onboarding = read("src/features/onboarding/OnboardingFlow.tsx");
const monetization = read("src/features/paywall/MonetizationCatalog.ts");
const weather = read("src/services/WeatherService.ts");

check("RevenueCat startup rejection guarded", app.includes("configureRevenueCat().catch"));
check("purchase result handles cancellation", app.includes('result.status === "cancelled"'));
check("purchase result handles unavailable configuration", app.includes('result.status === "not_configured"') && app.includes('result.status === "not_available"'));
check("restore errors are user-visible and guarded", app.includes("handleRestorePurchases") && app.includes("Restore could not be completed"));
check(
  "purchase/restore error copy is user-facing (no StoreKit/RevenueCat dev jargon)",
  !/StoreKit sandbox|RevenueCat offering|offering configuration|sandbox account/.test(app),
  "purchase/restore failure Alerts must not surface StoreKit/RevenueCat/sandbox internals to users"
);
check("entitlement refresh follows purchases", app.includes("await refreshEntitlement()"));

const liveTabs = [...rootTabs.matchAll(/<Tab\.Screen name="([^"]+)" component=\{(\w+Screen)\}/g)].map((match) => ({
  name: match[1],
  component: match[2]
}));
check("live navigation has five tabs", liveTabs.length === 5, liveTabs.map((tab) => tab.name).join(", "));
check("live navigation matches launch tabs", JSON.stringify(liveTabs.map((tab) => tab.name)) === JSON.stringify(["Home", "Sky", "Learn", "Vault", "Settings"]));
for (const tab of liveTabs) {
  check(`live screen present: ${tab.component}`, exists(`src/screens/${tab.component}.tsx`));
}

check("Home uses real ephemeris", home.includes("computeTonightSky"));
check("Home weather request is guarded", home.includes("fetchCurrentWeather(location).then(setWeather).catch"));
check("Home tonight score uses live inputs", home.includes("computeTonightScore(sky, weather, settings.skyQuality)"));
check("Home notification scheduling is guarded", home.includes("scheduleSkyEventNotifications") && home.includes(".catch(() => {})"));
check("Home hardcoded moonrise is absent", !home.includes("Moonrise 8:12 PM"));

check("weather service uses Open-Meteo", weather.includes("api.open-meteo.com"));
check("weather service has safe fallback", weather.includes("const FALLBACK") && weather.includes("return FALLBACK"));
check("weather service sends no API key", !weather.includes("appid=") && !weather.includes("openweathermap"));

const ephemeris = read("src/features/sky-lens/ephemeris/SkyEphemerisService.ts");
check("ephemeris uses astronomy-engine", ephemeris.includes('from "astronomy-engine"'));
check("ephemeris computes horizontal coordinates", ephemeris.includes("Horizon(") && ephemeris.includes("Equator("));
check("ephemeris self-test exists", exists("scripts/ephemeris-selftest.js"));
check("astronomy-engine dependency declared", packageJson.includes('"astronomy-engine"'));

check("Sky screen routes to Sky Lens", sky.includes("<SkyLensScreen"));
check("Sky screen wraps Sky Lens in ErrorBoundary", sky.includes("<ErrorBoundary>") && sky.includes("<SkyLensScreen"));
check("Sky screen routes to accurate Birth Sky", sky.includes("<BirthSkyScreen"));
check("Sky screen restores tab bar after full-screen destinations", sky.includes("TAB_BAR_STYLE"));

check("Sky Lens is planetarium-only", skyLens.includes("const planetarium = true"));
check("Sky Lens camera feed removed", !skyLens.includes("CameraView"));
check("Sky Lens uses cinematic background image", skyLens.includes("SolidSkyBackgroundLayer"));
check("Sky Lens uses image-backed nebulae", skyLens.includes("NebulaImageLayer"));
check("Sky Lens aurora bands disabled", skyLens.includes("visible={false}") && skyLens.includes("intensity={0}"));
check("Sky Lens projection module exists", exists("src/features/sky-lens/ar/SkyLensProjection.ts"));
check("Sky Lens orientation module exists", exists("src/features/sky-lens/ar/SkyLensOrientation.ts"));
check("Sky Lens self-test exists", exists("scripts/skylens-selftest.js"));

check("Birth Sky does not use current observer location", !birthSky.includes("useObserverLocation"));
check("Birth Sky geocodes birthplace", birthSky.includes("findBirthplace") && birthSky.includes("geocoding-api.open-meteo.com"));
check("Birth Sky birthplace search ranks state or country", birthSky.includes("scorePlace") && birthSky.includes("US_STATE_NAMES"));
check("Birth Sky accepts AM/PM input", birthSky.includes("meridiemMatch"));
check("Birth Sky accepts 24-hour input", birthSky.includes("twentyFourHourMatch"));
check("Birth Sky rejects invalid times", birthSky.includes("return null") && birthSky.includes("Enter a valid birth time"));
check("Birth Sky converts local time with birthplace timezone", birthSky.includes("resolveBirthMoment") && birthSky.includes("savedPlace.timezone"));
check("Birth Sky never guesses a chart from a missing time zone or DST-edge time", birthSky.includes("nonexistent-local-time") && birthSky.includes("ambiguous-local-time") && !birthSky.includes('|| "UTC"'));
check("Birth Sky saves local date separately from UTC instant", birthSky.includes("BIRTH_DATE_LOCAL_STORAGE_KEY"));
check("Birth Sky saves local time separately from UTC instant", birthSky.includes("BIRTH_TIME_LOCAL_STORAGE_KEY"));
check("Birth Sky chart uses resolved location", birthSky.includes("location={profile.location}"));
check("Birth Sky unknown time is labeled approximate", birthSky.includes('"Approx. eastern sky"'));
check("Birth Sky network failure is user-visible", birthSky.includes("We couldn't find that birthplace"));

// Birth-chart setup is no longer a screen inside the app tour — it is a separate, optional
// prompt. The honesty guards move WITH the copy: wherever the chart is offered, it must still
// say plainly what an unknown birth time costs.
const birthPrompt = read("src/features/onboarding/BirthChartPrompt.tsx");
check("birth-chart prompt is truthful about unknown birth time limits", birthPrompt.includes("rising sign") && birthPrompt.includes("time-sensitive"));
check("onboarding avoids exact horizon claims", !onboarding.includes("Above the horizon:"));
check("birth-chart prompt explains birthplace and birth time are needed", birthPrompt.includes("birthplace") && birthPrompt.includes("birth time"));
check("birth-chart setup is optional, not a tour screen", birthPrompt.includes("Maybe Later") && birthPrompt.includes("Entirely optional"));
check("onboarding no longer advertises camera AR", !onboarding.includes("Point your phone at the sky"));

check("current monthly price is $9.99", monetization.includes("$9.99/month"));
check("current annual price is $49.99", monetization.includes("$49.99/year"));
check("current lifetime price is $129.99", monetization.includes("$129.99"));
// The old "No free trials on any plan" claim is retired: a 7-day Apple intro trial may be
// offered to eligible new subscribers. Guard that the trial is described as CONDITIONAL
// (eligibility-gated), never as an unconditional promise every user receives.
check(
  "trial copy is conditional (eligibility-gated), not unconditional",
  monetization.includes("may be available to eligible new subscribers") &&
    !/No free trials on any plan/.test(monetization)
);
check("lifetime package identifier is correct", monetization.includes('"$rc_lifetime"'));
check("entitlement identifier is exact", monetization.includes('"AuraLunis Premium"'));
check("retired founder pricing is absent", !monetization.includes("$24.99") && !monetization.includes("FOUNDER OFFER"));

const satellite = read("src/features/aura-pro/SatelliteFeedService.ts");
check("satellite cache read guarded", satellite.includes("async function readCachedElements"));
check("satellite cache write guarded", satellite.includes("async function writeCachedElements"));
check("satellite cached elements sanitized", satellite.includes("function isElementSet"));
check("satellite cache expiry validated", satellite.includes("Number.isFinite(Date.parse(parsed.expiresAtISO))"));
check("satellite uses SGP4", satellite.includes('from "satellite.js"') && satellite.includes("twoline2satrec") && satellite.includes("ecfToLookAngles"));
check("satellite filters below-horizon objects", satellite.includes("elevationDegrees <= 0"));
check("satellite self-test exists", exists("scripts/satellite-selftest.js"));

const vault = read("src/state/AuraLunisVaultContext.tsx");
const vaultEncryption = read("src/services/VaultEncryption.ts");
check("vault uses encrypted storage", vault.includes("encryptVault") && vault.includes("decryptVault"));
check("vault migration handles legacy data", vault.includes("isEncrypted"));
check("vault encryption uses NaCl secretbox", vaultEncryption.includes("nacl.secretbox"));
check("vault key is stored securely", vaultEncryption.includes("SecureStore") || vaultEncryption.includes("SecureStorage"));

const screenShell = read("src/components/ScreenShell.tsx");
check("ScreenShell respects safe-area inset", screenShell.includes("useSafeAreaInsets") && screenShell.includes("insets.top"));
check("app is wrapped in GestureHandlerRootView", app.includes("GestureHandlerRootView"));
check("app has root ErrorBoundary", app.includes("<ErrorBoundary>"));
check("privacy policy exists", exists("docs/PRIVACY_POLICY.md"));
check("App Store listing exists", exists("docs/APP_STORE_LISTING.md"));
check("app version is not prototype version", !read("app.json").includes('"version": "0.1.0"'));

// ── Premium planet surface renderers ─────────────────────────────────────────────
// The paywall promises planet-specific artwork. Guard that the renderers exist, stay
// procedural (no camera / no raster stickers), that Venus is phase-aware from real
// ephemeris, and that the artwork upgrade did not touch coordinate math.
const planetArt = read("src/features/sky-lens/layers/PlanetIllustrations.tsx");
const planetLayer = read("src/features/sky-lens/layers/PlanetLayer.tsx");
const skyEphem = read("src/features/sky-lens/ephemeris/SkyEphemerisService.ts");
check("planet renderers exist for all four premium planets",
  ["Jupiter", "Saturn", "Mars", "Venus"].every((p) => planetArt.includes(`export function ${p}Illustration`)));
check("planet artwork is camera-free (no CameraView / expo-camera)",
  !/CameraView|expo-camera/.test(planetArt.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1")));
check("planet artwork uses procedural SVG, not raster stickers",
  planetArt.includes('from "react-native-svg"') && !/require\(.*\.(png|jpg|jpeg|webp)/i.test(planetArt));
check("Venus phase is astronomy-driven (illuminationFraction threaded from ephemeris)",
  skyEphem.includes("illuminationFraction") && skyEphem.includes("phase_fraction") &&
  planetLayer.includes("illumination: body.illuminationFraction"));
check("Venus does not fake a phase without ephemeris data",
  planetArt.includes("venusPhaseSpec") && /hasPhase: false/.test(planetArt));
check("Mars polar cap is conditional", planetArt.includes("polarCap?: boolean") && planetArt.includes("polarCap && <"));
check("planet position math untouched — ephemeris still uses Equator + Horizon",
  skyEphem.includes("Equator(entry.body, when, observer, true, true)") &&
  skyEphem.includes('Horizon(when, observer, equatorial.ra, equatorial.dec, "normal")'));
check("planet positions untouched — PlanetLayer projects straight from body az/alt",
  planetLayer.includes("project(body.azimuthDegrees, body.altitudeDegrees)"));
check("planet render self-test exists", exists("scripts/planet-render-selftest.js"));

// Dev-only planet review aid must be inert in production: the env target is read only
// behind the __DEV__ + review-mode gate, and the aim override falls back to live sensor
// pointing whenever review mode is off.
const skyLensScreen = read("src/features/sky-lens/SkyLensScreen.tsx");
check("planet review target env var is read only behind the reviewMode gate",
  skyLensScreen.includes('reviewMode ? (process.env.EXPO_PUBLIC_SKYLENS_REVIEW_TARGET') &&
  (skyLensScreen.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1").match(/EXPO_PUBLIC_SKYLENS_REVIEW_TARGET/g) || []).length === 1);
check("review mode stays dev + explicit-flag gated",
  skyLensScreen.includes('const reviewMode = __DEV__ && process.env.EXPO_PUBLIC_SKYLENS_REVIEW_MODE === "1"'));
// Same guard, new source: live pointing is now derived from the quaternion orientation the
// sky is rendered from, not from the separate raw-sensor Euler hook.
check("review pointing override falls back to live pointing off review mode",
  skyLensScreen.includes("if (!reviewMode) return livePointing;"));

// Dev-only "Preview Paywall" button in Settings — lets QA inspect trial/pricing states
// without altering release behavior. It MUST stay guarded by __DEV__ so it is stripped
// from production builds, and it MUST open the real paywall (openPaywall), not a stub.
const settingsScreen = read("src/screens/SettingsScreen.tsx");
const devPaywallGuarded = /__DEV__\s*&&\s*\(\s*<Pressable[^>]*onPress=\{openPaywall\}[\s\S]*?Preview Paywall \(Dev Only\)/.test(settingsScreen);
check(
  "dev Preview Paywall button is guarded by __DEV__ and opens the real paywall",
  devPaywallGuarded,
  "expected a __DEV__-guarded <Pressable onPress={openPaywall}> labeled 'Preview Paywall (Dev Only)' in SettingsScreen"
);
check(
  "dev Preview Paywall button does not appear outside a __DEV__ guard",
  !/Preview Paywall \(Dev Only\)/.test(settingsScreen) || devPaywallGuarded,
  "the 'Preview Paywall (Dev Only)' label must only exist inside the __DEV__ block"
);

// Sky Lens label-avoidance for UI chrome (#161) — labels must never render under/behind
// on-screen controls, sourced from centralized geometry, and covered by a self-test.
const chromeLayout = exists("src/features/sky-lens/skyLensChromeLayout.ts")
  ? read("src/features/sky-lens/skyLensChromeLayout.ts")
  : "";
const skyLensCanvas = read("src/features/sky-lens/SkyLensCanvas.tsx");
check("chrome-avoidance geometry module exists", exists("src/features/sky-lens/skyLensChromeLayout.ts"));
check(
  "chrome geometry is a single source of truth (exports rect + top-inset helpers)",
  /export function chromeAvoidRects/.test(chromeLayout) && /export function chromeTopInset/.test(chromeLayout)
);
check(
  "canvas reserves UI-chrome rects before placing labels",
  /reservedRects/.test(skyLensCanvas) && /placeLabel\.reserve\(/.test(skyLensCanvas)
);
check(
  "screen sources chrome avoid-rects from the shared geometry and passes them down",
  /chromeAvoidRects/.test(skyLens) && /chromeTopInset/.test(skyLens) && /reservedRects=\{/.test(skyLens)
);
check("Sky Lens label-avoidance self-test exists", exists("scripts/skylens-label-selftest.js"));
check("label-avoidance self-test is wired into qa:all", /qa:labels/.test(packageJson) && /skylens-label-selftest\.js/.test(packageJson));
check(
  "chrome layout uses no AR / camera-feed framing",
  !/\bAR\b|augmented reality|CameraView|live camera|camera feed/i.test(chromeLayout)
);

// Zodiac labels must participate in the shared placer (avoid chrome + higher-priority
// labels, suppress when blocked) — not draw independently.
const zodiacLayer = exists("src/features/sky-lens/layers/ZodiacLayer.tsx")
  ? read("src/features/sky-lens/layers/ZodiacLayer.tsx")
  : "";
check(
  "ZodiacLayer routes sign names through the shared placer",
  /placeLabel\?:\s*LabelPlacer/.test(zodiacLayer) && /labelsOnly/.test(zodiacLayer) && /placeLabel\(/.test(zodiacLayer)
);
check(
  "ZodiacLayer suppresses a sign name when the placer returns no slot",
  /!Number\.isFinite\(placed\.x\)/.test(zodiacLayer)
);
check(
  "SkyLensCanvas mounts a zodiac labels-only pass through the shared placer",
  /<ZodiacLayer[\s\S]*labelsOnly/.test(skyLensCanvas) && /<ZodiacLayer[\s\S]*placeLabel=\{placeLabel\}/.test(skyLensCanvas)
);

console.log("");
console.log(`Fresh bug check: ${passes.length} pass, ${failures.length} fail.`);

const result = {
  generated_at: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
  package: "auralunis",
  overall_status: failures.length ? "FAIL" : "PASS WITH DEVICE VERIFICATION REQUIRED",
  checks_passed: passes.length,
  checks_failed: failures.length,
  live_navigation: liveTabs.map((tab) => tab.name),
  screen_files: liveTabs.map((tab) => ({ file: `src/screens/${tab.component}.tsx`, exists: exists(`src/screens/${tab.component}.tsx`) })),
  failures,
  native_limitations: [
    "The cinematic Sky Lens is implemented and statically tested; final sensor motion, gestures, haptics, and image composition still require an iPhone run.",
    "Ephemeris positions are calculated by astronomy-engine and covered by the ephemeris self-test.",
    "Satellite positions use satellite.js SGP4 and are covered by the satellite self-test.",
    "Birth Sky uses birthplace geocoding and local timezone conversion; network and historical timezone edge cases require device testing.",
    "Vault encryption uses NaCl secretbox with its key in secure device storage.",
    "Weather uses keyless Open-Meteo and falls back safely when offline.",
    "RevenueCat flows are guarded in code; StoreKit sandbox purchase and restore still require an iPhone/TestFlight environment.",
    "Notifications require device permission and should be verified on physical hardware."
  ]
};

fs.writeFileSync(path.join(root, "qa/FRESH_BUG_CHECK_RESULTS.json"), JSON.stringify(result, null, 2) + "\n");
console.log("Wrote qa/FRESH_BUG_CHECK_RESULTS.json from this run.");

if (failures.length) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
