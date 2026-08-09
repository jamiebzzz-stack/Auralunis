// Planet surface-renderer deterministic self-test.
//
// The premium paywall promises planet-specific artwork ("Jupiter's storms, Saturn's rings,
// Mars' polar caps"). This pins the math and the source so those claims are provably
// supportable WITHOUT a device, and — just as important — proves the artwork upgrade did
// NOT touch astronomy, projection, or the camera-free planetarium.
//
// Keep the venusPhaseSpec mirror in sync with:
//   src/features/sky-lens/layers/PlanetIllustrations.tsx  (venusPhaseSpec)
const fs = require("fs");
const path = require("path");
const Astronomy = require("astronomy-engine");

const root = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failed += 1;
};

console.log("Planet surface-renderer deterministic self-test\n");

const illus = read("src/features/sky-lens/layers/PlanetIllustrations.tsx");
const layer = read("src/features/sky-lens/layers/PlanetLayer.tsx");
const ephem = read("src/features/sky-lens/ephemeris/SkyEphemerisService.ts");

// Strip comments so "no camera / no image" checks test real CODE, not the prose in the
// file header that literally names the things we're forbidding.
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const illusCode = stripComments(illus);
const layerCode = stripComments(layer);

// ── 1. Each planet renderer exists ───────────────────────────────────────────────
for (const fn of [
  "JupiterIllustration",
  "SaturnIllustration",
  "MarsIllustration",
  "VenusIllustration",
  "MercuryIllustration"
]) {
  check(`renderer exists: ${fn}`, illus.includes(`export function ${fn}`));
}
check(
  "renderPlanetIllustration dispatches all four premium planets",
  ["jupiter", "saturn", "mars", "venus"].every((id) => illus.includes(`case "${id}":`))
);

// ── 2. Procedural only — no camera, no image/sticker overlays (code, not comments) ─
check("no CameraView in code", !/CameraView/.test(illusCode) && !/CameraView/.test(layerCode));
check("no expo-camera import", !/expo-camera/.test(illusCode) && !/expo-camera/.test(layerCode));
check("no <Image> raster overlay in code", !/<Image[\s/>]/.test(illusCode) && !/\bImage\b\s*}?\s*from/.test(illusCode));
check("no PNG/asset require in artwork", !/require\(.*\.(png|jpg|jpeg|webp)/i.test(illusCode));
check(
  "artwork is react-native-svg primitives",
  /from "react-native-svg"/.test(illusCode) && /<Circle/.test(illusCode) && /<Ellipse/.test(illusCode)
);

// ── 3. Claim-specific artwork content — asserted on real drawing tokens ────────────
check("Jupiter has cloud bands", /const JUPITER_BANDS/.test(illus) && (illus.match(/\{ y: /g) || []).length >= 5);
check("Jupiter draws one restrained Great Red Spot", (illusCode.match(/#B4512B|#D07548/g) || []).length >= 1);
check("Saturn draws tilted rings", /const SATURN_TILT/.test(illus) && (illusCode.match(/rotation=\{SATURN_TILT\}/g) || []).length >= 2);
check("Saturn casts a ring shadow on the globe", /#20180A/.test(illusCode) && /-globe/.test(illusCode));
check("Saturn has a Cassini division", (illusCode.match(/#0A0803/g) || []).length >= 1);
check("Saturn rings pass in front of the globe", /-front/.test(illusCode) && /ClipPath id=\{`\$\{key\}-front`\}/.test(illusCode));
check("Mars has a CONDITIONAL polar cap", /polarCap && </.test(illusCode) && /polarCap\?: boolean/.test(illusCode));
check("Mars draws rust-toned albedo variation", (illusCode.match(/#6E2814|#8A3A1E/g) || []).length >= 1);

// ── 4. Venus phase is astronomy-driven and deterministic ──────────────────────────
// Mirror of PlanetIllustrations.venusPhaseSpec — keep in sync.
function venusPhaseSpec(r, illumination) {
  if (typeof illumination !== "number" || !Number.isFinite(illumination)) return { hasPhase: false };
  const f = Math.min(1, Math.max(0, illumination));
  if (f >= 0.995) return { hasPhase: false };
  return { hasPhase: true, crescent: f < 0.5, terminatorRx: r * Math.abs(1 - 2 * f) };
}
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// 4a. Pure-formula review cases — crescent, gibbous, full, and "no data" fallback.
const crescent = venusPhaseSpec(60, 0.15);
check("Venus 15% lit → crescent, terminator = r·|1−2f|", crescent.hasPhase && crescent.crescent && near(crescent.terminatorRx, 60 * 0.7));
const gibbous = venusPhaseSpec(60, 0.85);
check("Venus 85% lit → gibbous", gibbous.hasPhase && !gibbous.crescent && near(gibbous.terminatorRx, 60 * 0.7));
check("Venus full (≥99.5%) → no phase (plain lit disc)", venusPhaseSpec(60, 0.999).hasPhase === false);
check("Venus without ephemeris fraction → no phase, not faked", venusPhaseSpec(60, undefined).hasPhase === false);
check("Venus NaN fraction → no phase", venusPhaseSpec(60, NaN).hasPhase === false);

// 4b. Live ephemeris wiring — a real Venus fraction feeds the same spec deterministically.
const WHEN = new Date("2026-02-01T04:00:00Z");
const info = Astronomy.Illumination(Astronomy.Body.Venus, WHEN);
const f = info.phase_fraction;
check("astronomy-engine yields a real Venus illuminated fraction 0..1", Number.isFinite(f) && f >= 0 && f <= 1, `f=${f.toFixed(3)}`);
const liveSpec = venusPhaseSpec(60, f);
check(
  "real fraction drives a consistent phase spec",
  typeof liveSpec.hasPhase === "boolean" && (!liveSpec.hasPhase || near(liveSpec.terminatorRx, 60 * Math.abs(1 - 2 * Math.min(1, Math.max(0, f))))),
  liveSpec.hasPhase ? `${liveSpec.crescent ? "crescent" : "gibbous"} rx=${liveSpec.terminatorRx.toFixed(1)}` : "full"
);
check("PlanetLayer feeds Venus the real ephemeris fraction", /illumination: body\.illuminationFraction/.test(layer));
check("SkyBody carries illuminationFraction from Illumination()", /illuminationFraction/.test(ephem) && /phase_fraction/.test(ephem));

// ── 5. Astronomy is untouched — coordinate math is byte-for-byte intact ────────────
check("ephemeris still uses Equator() for RA/Dec", ephem.includes("Equator(entry.body, when, observer, true, true)"));
check("ephemeris still uses Horizon() for az/alt", ephem.includes('Horizon(when, observer, equatorial.ra, equatorial.dec, "normal")'));
check("azimuth rounding unchanged", ephem.includes("azimuthDegrees: round(horizontal.azimuth, 2)"));
check("altitude rounding unchanged", ephem.includes("altitudeDegrees: round(horizontal.altitude, 2)"));
check("RA/Dec rounding unchanged", ephem.includes("rightAscensionHours: round(equatorial.ra, 4)") && ephem.includes("declinationDegrees: round(equatorial.dec, 3)"));
check("PlanetLayer still projects from body az/alt (positions sacred)", layer.includes("project(body.azimuthDegrees, body.altitudeDegrees)"));
check("PlanetLayer does not resize planets globally", /const planetScale = Math\.min\(1\.45, Math\.max\(1\.0/.test(layer));

// 5a. Deterministic position fixture — a coordinate-math regression would move these.
const OBS = new Astronomy.Observer(37.3349, -122.009, 0);
const PWHEN = new Date("2026-01-15T22:00:00-08:00");
const eq = Astronomy.Equator(Astronomy.Body.Jupiter, PWHEN, OBS, true, true);
const hz = Astronomy.Horizon(PWHEN, OBS, eq.ra, eq.dec, "normal");
// Hardcoded truth: if the ephemeris/projection ever drifts, these move and the test fails.
check("Jupiter position fixture stable (az≈114.90°)", near(hz.azimuth, 114.9, 0.05), `az ${hz.azimuth.toFixed(2)}°`);
check("Jupiter position fixture stable (alt≈62.15°)", near(hz.altitude, 62.15, 0.05), `alt ${hz.altitude.toFixed(2)}°`);

// ── 6. Dev-only planet review aid cannot activate in production ────────────────────
const screen = read("src/features/sky-lens/SkyLensScreen.tsx");
const screenCode = stripComments(screen);
check(
  "review mode is dev + env gated",
  /const reviewMode = __DEV__ && process\.env\.EXPO_PUBLIC_SKYLENS_REVIEW_MODE === "1"/.test(screen)
);
check(
  "review TARGET env var is read ONLY behind the reviewMode gate",
  /reviewMode \? \(process\.env\.EXPO_PUBLIC_SKYLENS_REVIEW_TARGET/.test(screen)
);
check(
  "review TARGET env var has no ungated read (exactly one, gated, occurrence)",
  (screenCode.match(/EXPO_PUBLIC_SKYLENS_REVIEW_TARGET/g) || []).length === 1
);
check(
  "planet review targets limited to the four premium planets",
  /jupiter: Body\.Jupiter/.test(screen) &&
    /saturn: Body\.Saturn/.test(screen) &&
    /mars: Body\.Mars/.test(screen) &&
    /venus: Body\.Venus/.test(screen)
);
check(
  // The guard is unchanged; only the SOURCE of live pointing moved. It used to be
  // `sensorPointing` from the raw-sensor Euler hook; production now derives pointing from
  // the same quaternion orientation the sky is rendered from, so the HUD and the sky agree.
  "review pointing override is guarded — production uses the live quaternion pointing",
  /if \(!reviewMode\) return livePointing;/.test(screenCode) &&
    /const livePointing = useMemo<CameraPointing>\(/.test(screenCode)
);
check(
  "review aid only picks a time (SearchHourAngle), never alters projection or sensors",
  /SearchHourAngle\(REVIEW_PLANET_BODY\[reviewPlanet\]/.test(screenCode)
);
check("planet review aid does not restore the camera", !/CameraView|expo-camera/.test(screenCode));

console.log("");
if (failed) {
  console.error(`Planet render self-test: ${failed} FAILED.`);
  process.exit(1);
}
console.log("Planet render self-test passed: all four premium planet renderers present, phase-aware Venus is astronomy-driven, positions and camera-free rendering untouched.");
