// Sky Lens projection self-test.
//
// Projection is verified against the REAL shipping implementation in
// src/features/sky-lens/ar/SkyLensProjection.ts. The .ts file is transpiled to CommonJS at
// runtime (with the repo's own `typescript` dependency) and executed directly, so there is
// NO second copy of the projection math and a regression in the shipping `projectTarget`
// is caught here. Runtime transpile — rather than Node's native TS type-stripping — keeps
// this working on CI's Node 20, which does not strip types.
//
// Orientation (`pointingFromSensors`) is outside the scope of this projection test; those
// three cases are retained unchanged so orientation coverage is not lost.

const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const Module = require("module");

// Load a .ts module by transpiling it to CommonJS in memory and executing it — this runs
// the ACTUAL source on disk, not a copy. No type-check (behaviour is not type-dependent).
function requireTs(absPath) {
  const source = fs.readFileSync(absPath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
    fileName: absPath
  });
  const m = new Module(absPath, module);
  m.filename = absPath;
  m.paths = Module._nodeModulePaths(path.dirname(absPath));
  m._compile(outputText, absPath);
  return m.exports;
}

const PROJ_PATH = path.resolve(__dirname, "../src/features/sky-lens/ar/SkyLensProjection.ts");
const { projectTarget, DEFAULT_FOV, effectiveVerticalFov, effectiveVerticalHalfFov } = requireTs(PROJ_PATH);

const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;
const signed = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

let failed = 0;
function assert(label, ok, detail) {
  const line = label + (detail ? " — " + detail : "");
  if (ok) console.log("PASS", line);
  else {
    failed += 1;
    console.error("FAIL", line);
  }
}
const near = (a, b, eps) => Math.abs(a - b) <= eps;

// Representative screen dimensions (logical points).
const IP16PM = { width: 430, height: 932 }; // iPhone 16 Pro Max
const IPSE = { width: 375, height: 667 }; // iPhone SE (smaller width)

console.log("Sky Lens projection self-test — real ENU projectTarget\n");

// ── 0. We are exercising the real module, not the old flat approximation ──────────
assert(
  "loaded the real SkyLensProjection.ts (projectTarget + DEFAULT_FOV exported)",
  typeof projectTarget === "function" &&
    DEFAULT_FOV &&
    DEFAULT_FOV.horizontalDegrees === 60 &&
    DEFAULT_FOV.verticalDegrees === 45
);
const P = (pointing, az, alt, box, fov = DEFAULT_FOV) => projectTarget(pointing, az, alt, fov, box);

// ── 1. Target aligned with view center maps to screen center (both screen sizes) ──
for (const box of [IP16PM, IPSE]) {
  const r = P({ azimuthDegrees: 180, altitudeDegrees: 20, rollDegrees: 0 }, 180, 20, box);
  assert(
    `center maps to screen center @${box.width}x${box.height}`,
    near(r.x, box.width / 2, 0.01) && near(r.y, box.height / 2, 0.01) && r.onScreen && !r.behind,
    `x=${r.x.toFixed(2)} y=${r.y.toFixed(2)}`
  );
}

// ── 2. Target behind the viewing hemisphere is rejected/off-screen ────────────────
{
  const r = P({ azimuthDegrees: 180, altitudeDegrees: 0, rollDegrees: 0 }, 0, 0, IP16PM); // 180° away
  assert("target behind viewing hemisphere is rejected", r.behind === true && r.onScreen === false);
}

// ── 3. Target above / outside the configured FOV is clipped ───────────────────────
{
  // Vertical FOV is DERIVED from the horizontal FOV and viewport aspect so both axes share
  // one angular scale; clipping must therefore use the effective value, not fov.verticalDegrees.
  // Aim the camera low so that clearing the effective vertical half-FOV still lands on a
  // valid altitude (a full effective FOV above the axis would pass the zenith and read as
  // "behind", which is a different case tested separately).
  const camAlt = -30;
  const r = P(
    { azimuthDegrees: 180, altitudeDegrees: camAlt, rollDegrees: 0 },
    180,
    camAlt + effectiveVerticalHalfFov(DEFAULT_FOV, IP16PM) + 6, // just past the effective edge
    IP16PM
  );
  assert(
    "target above vertical FOV is clipped (off-screen, above center)",
    r.onScreen === false && r.y < IP16PM.height / 2 && r.behind === false,
    `y=${r.y.toFixed(1)}`
  );
}
{
  const r = P(
    { azimuthDegrees: 180, altitudeDegrees: 0, rollDegrees: 0 },
    180 + DEFAULT_FOV.horizontalDegrees, // one full horizontal-FOV to the side
    0,
    IP16PM
  );
  assert(
    "target beyond horizontal FOV is clipped (off-screen)",
    r.onScreen === false && Math.abs(r.x - IP16PM.width / 2) > 1 && r.behind === false,
    `x=${r.x.toFixed(1)}`
  );
}

// ── 4. Roll rotates screen-space orientation correctly ────────────────────────────
// Use a square box + equal FOV so the angle→pixel scale is identical on both axes; then a
// pure rotation is directly checkable. A target 10° above the optical axis:
//   roll   0° → straight above center,
//   roll  90° → same magnitude, now a horizontal offset (y back at center),
//   roll 180° → mirrored straight below center.
{
  const SQ = { width: 400, height: 400 };
  const SQFOV = { horizontalDegrees: 60, verticalDegrees: 60 };
  const cx = 200;
  const cy = 200;
  const up = projectTarget({ azimuthDegrees: 180, altitudeDegrees: 0, rollDegrees: 0 }, 180, 10, SQFOV, SQ);
  const r90 = projectTarget({ azimuthDegrees: 180, altitudeDegrees: 0, rollDegrees: 90 }, 180, 10, SQFOV, SQ);
  const r180 = projectTarget({ azimuthDegrees: 180, altitudeDegrees: 0, rollDegrees: 180 }, 180, 10, SQFOV, SQ);
  const dV = up.y - cy; // negative: above center
  assert("roll 0°: target above axis renders above center", dV < -1 && near(up.x, cx, 0.5), `dy=${dV.toFixed(2)}`);
  assert(
    "roll 90°: 'above' rotates to a horizontal offset of equal magnitude",
    near(r90.y, cy, 0.5) && near(Math.abs(r90.x - cx), Math.abs(dV), 0.5),
    `x-off=${(r90.x - cx).toFixed(2)}`
  );
  assert(
    "roll 180°: 'above' flips to below center, same magnitude",
    near(r180.x, cx, 0.5) && near(r180.y - cy, -dV, 0.5),
    `dy=${(r180.y - cy).toFixed(2)}`
  );
}

// ── 5. Zenith and near-zenith behave (no dead zone; azimuth degenerate but handled) ─
{
  // Both view direction and target AT the zenith — azimuth is undefined there; must still center.
  const zc = P({ azimuthDegrees: 0, altitudeDegrees: 90, rollDegrees: 0 }, 137, 90, IP16PM);
  assert(
    "zenith: target at zenith maps to center regardless of azimuth",
    near(zc.x, IP16PM.width / 2, 0.5) && near(zc.y, IP16PM.height / 2, 0.5) && zc.onScreen,
    `x=${zc.x.toFixed(2)} y=${zc.y.toFixed(2)}`
  );
  // Near zenith, small true separation across a large azimuth gap must stay on-screen/finite.
  const nz = P({ azimuthDegrees: 0, altitudeDegrees: 89, rollDegrees: 0 }, 120, 89, IP16PM);
  assert(
    "near-zenith: small angular separation across wide azimuth stays on-screen & finite",
    nz.onScreen && Number.isFinite(nz.x) && Number.isFinite(nz.y) && nz.behind === false
  );
}

// ── 6. Near-North azimuth wraparound (values around 359°/0°) ───────────────────────
{
  const rRight = P({ azimuthDegrees: 359, altitudeDegrees: 0, rollDegrees: 0 }, 1, 0, IP16PM); // 2° across north
  assert(
    "wraparound 359°→1°: 2° across north stays near center, on-screen, not behind",
    rRight.onScreen &&
      rRight.behind === false &&
      Math.abs(rRight.x - IP16PM.width / 2) > 0.5 &&
      Math.abs(rRight.x - IP16PM.width / 2) < 40,
    `x-off=${(rRight.x - IP16PM.width / 2).toFixed(2)}`
  );
  const rLeft = P({ azimuthDegrees: 1, altitudeDegrees: 0, rollDegrees: 0 }, 359, 0, IP16PM);
  assert(
    "wraparound 1°→359°: symmetric small offset on the opposite side (no seam discontinuity)",
    rLeft.onScreen &&
      rLeft.behind === false &&
      Math.sign(rLeft.x - IP16PM.width / 2) === -Math.sign(rRight.x - IP16PM.width / 2)
  );
}

// ── 7. A case where the OLD flat approximation and the real ENU implementation diverge ─
// Two points near the zenith, 180° apart in azimuth, are only ~4° apart on the sky, so the
// real projection keeps the target on-screen. The retired approximation used
// `behind = |Δazimuth| > 90`, which misclassifies this as behind the view direction. We assert the
// REAL result and record the legacy predicate purely as a divergence witness (a single
// boolean, not the projection math).
{
  const pointing = { azimuthDegrees: 0, altitudeDegrees: 88, rollDegrees: 0 };
  const r = P(pointing, 180, 88, IP16PM);
  const legacyWouldSayBehind = Math.abs(signed(180 - pointing.azimuthDegrees)) > 90; // old |Δaz|>90 gate
  assert(
    "divergence: near-zenith 180°-azimuth target is on-screen in real ENU (old |Δaz|>90 said 'behind')",
    r.onScreen === true && r.behind === false && legacyWouldSayBehind === true,
    `real onScreen=${r.onScreen} behind=${r.behind}; legacy-behind=${legacyWouldSayBehind}`
  );
}

// ── Orientation (retained, unchanged — out of scope for #160, kept for coverage) ──
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const norm = (a) => scale(a, 1 / (Math.sqrt(dot(a, a)) || 1));
function pointingFromSensors(accel, mag) {
  const up = norm(accel);
  const north = norm(sub(mag, scale(up, dot(mag, up))));
  const east = norm(cross(north, up));
  const cam = { x: 0, y: 0, z: -1 };
  const az = (toDeg(Math.atan2(dot(cam, east), dot(cam, north))) + 360) % 360;
  const alt = toDeg(Math.asin(Math.max(-1, Math.min(1, dot(cam, up)))));
  return { azimuthDegrees: az, altitudeDegrees: alt, rollDegrees: toDeg(Math.atan2(accel.x, accel.y)) };
}
{
  const dip = toRad(60);
  const flat = pointingFromSensors({ x: 0, y: 0, z: 1 }, { x: 0, y: 1, z: 0 });
  assert("flat screen-up -> view altitude ~ -90", Math.abs(flat.altitudeDegrees + 90) < 1);
  const zenith = pointingFromSensors({ x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 });
  assert("tilted back -> view altitude ~ +90", Math.abs(zenith.altitudeDegrees - 90) < 1);
  const north = pointingFromSensors({ x: 0, y: 1, z: 0 }, { x: 0, y: -Math.sin(dip), z: -Math.cos(dip) });
  assert("vertical facing north -> azimuth ~ 0", Math.abs(signed(north.azimuthDegrees)) < 1);
}

// ── Pointing follow factors + stillness freeze ───────────────────────────────────────
//
// Sky Lens must feel deliberate: the sky moves only when the phone clearly moves, trails
// the hand in a controlled way, and settles quickly enough to tap what you are looking at.
// These assertions run against the REAL exported helpers in useDevicePointing.ts, so a
// future edit that speeds the camera back up fails here rather than on device.
// Follow math comes from the pure module; the stillness freeze is asserted against the
// hook source, which owns the gyro gating.
const FOLLOW_PATH = path.resolve(__dirname, "../src/features/sky-lens/ar/pointingFollow.ts");
const HOOK_PATH = path.resolve(__dirname, "../src/features/sky-lens/ar/useDevicePointing.ts");
const motion = requireTs(FOLLOW_PATH);
const motionSrc = fs.readFileSync(HOOK_PATH, "utf8");
const followSrc = fs.readFileSync(FOLLOW_PATH, "utf8");
// Banned-behaviour scans look at CODE only — the comments in these files legitimately
// use words like "recentering" to document that the behaviour is absent.
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const motionCode = stripComments(motionSrc) + stripComments(followSrc);

const inRange = (v, lo, hi) => v >= lo && v <= hi;

console.log("");
assert("small movement follow factor is 0.10–0.12",
  inRange(motion.FOLLOW_FACTOR_SMALL, 0.10, 0.12), `got ${motion.FOLLOW_FACTOR_SMALL}`);
assert("medium movement follow factor is 0.16–0.18",
  inRange(motion.FOLLOW_FACTOR_MEDIUM, 0.16, 0.18), `got ${motion.FOLLOW_FACTOR_MEDIUM}`);
assert("large movement follow factor is 0.22–0.24",
  inRange(motion.FOLLOW_FACTOR_LARGE, 0.22, 0.24), `got ${motion.FOLLOW_FACTOR_LARGE}`);
assert("follow factors increase with movement size",
  motion.FOLLOW_FACTOR_SMALL < motion.FOLLOW_FACTOR_MEDIUM &&
  motion.FOLLOW_FACTOR_MEDIUM < motion.FOLLOW_FACTOR_LARGE);

// Movement-size banding selects the right base factor.
assert("a 2° nudge uses the small factor", motion.baseFollowFactor(2) === motion.FOLLOW_FACTOR_SMALL);
assert("a 12° turn uses the medium factor", motion.baseFollowFactor(12) === motion.FOLLOW_FACTOR_MEDIUM);
assert("a 40° sweep uses the large factor", motion.baseFollowFactor(40) === motion.FOLLOW_FACTOR_LARGE);

// Exact band boundaries. The thresholds are strict (>), so a delta sitting exactly ON a
// threshold belongs to the SLOWER band — the safer side. These pin the comparison operator:
// flipping > to >= would move a whole band and this would catch it.
const EPS = 1e-9;
assert("zero movement uses the small factor", motion.baseFollowFactor(0) === motion.FOLLOW_FACTOR_SMALL);
assert("exactly at the medium threshold stays small",
  motion.baseFollowFactor(motion.MEDIUM_MOVEMENT_DEGREES) === motion.FOLLOW_FACTOR_SMALL,
  `${motion.MEDIUM_MOVEMENT_DEGREES}° → small`);
assert("just past the medium threshold becomes medium",
  motion.baseFollowFactor(motion.MEDIUM_MOVEMENT_DEGREES + EPS) === motion.FOLLOW_FACTOR_MEDIUM);
assert("exactly at the large threshold stays medium",
  motion.baseFollowFactor(motion.LARGE_MOVEMENT_DEGREES) === motion.FOLLOW_FACTOR_MEDIUM,
  `${motion.LARGE_MOVEMENT_DEGREES}° → medium`);
assert("just past the large threshold becomes large",
  motion.baseFollowFactor(motion.LARGE_MOVEMENT_DEGREES + EPS) === motion.FOLLOW_FACTOR_LARGE);
assert("band thresholds are ordered and positive",
  motion.MEDIUM_MOVEMENT_DEGREES > 0 &&
  motion.LARGE_MOVEMENT_DEGREES > motion.MEDIUM_MOVEMENT_DEGREES);
assert("the banding is monotonic across the whole range",
  [0, 3, 7, 7.5, 12, 18, 18.5, 40, 180].every((d, i, a) =>
    i === 0 || motion.baseFollowFactor(d) >= motion.baseFollowFactor(a[i - 1])));

// Zoom damping: stronger as zoom climbs, never zero, never above 1.
assert("no extra damping at 1× zoom", motion.zoomDampingMultiplier(1) === 1);
assert("damping increases with zoom",
  motion.zoomDampingMultiplier(4) < motion.zoomDampingMultiplier(2) &&
  motion.zoomDampingMultiplier(2) < motion.zoomDampingMultiplier(1));
assert("damping is floored so high zoom stays responsive",
  motion.zoomDampingMultiplier(50) === motion.ZOOM_DAMPING_FLOOR);
assert("damping floor is a usable fraction", inRange(motion.ZOOM_DAMPING_FLOOR, 0.3, 0.6));
assert("invalid zoom degrades to undamped", motion.zoomDampingMultiplier(NaN) === 1);
assert("zoom below 1 cannot amplify", motion.zoomDampingMultiplier(0.2) === 1);

// Resolved factors are strictly slower at zoom than at 1×, on every movement size.
for (const delta of [2, 12, 40]) {
  const at1 = motion.resolveFollowFactors(delta, 1).follow;
  const at8 = motion.resolveFollowFactors(delta, 8).follow;
  assert(`zoomed follow is slower than 1× at ${delta}°`, at8 < at1, `${at8.toFixed(4)} < ${at1.toFixed(4)}`);
  assert(`follow factor stays positive at ${delta}°`, at8 > 0);
}

// Roll never outruns its ceiling — a tipping frame is what makes labels unreadable.
assert("roll is capped at the roll ceiling",
  motion.resolveFollowFactors(40, 1).roll <= motion.ROLL_FOLLOW_CEILING + 1e-9,
  `got ${motion.resolveFollowFactors(40, 1).roll}`);
assert("roll never exceeds the pointing follow factor",
  [1, 4, 12].every((z) => [2, 12, 40].every((d) => {
    const { follow, roll } = motion.resolveFollowFactors(d, z);
    return roll <= follow + 1e-9;
  })));

// The stillness freeze must survive this change untouched.
//
// The hook itself cannot be required under Node (it imports expo-sensors), so the freeze is
// asserted against its source. Presence alone is not enough — ORDER is what makes it a
// freeze: the early return must sit before the dead-zone test and before any follow
// computation, or a still phone would still publish drift.
assert("gyro stillness freeze is still present",
  motionSrc.includes("if (!movingRef.current) return;"));
{
  const freezeAt = motionSrc.indexOf("if (!movingRef.current) return;");
  const deadZoneAt = motionSrc.indexOf("azimuthDelta < AZIMUTH_DEAD_ZONE");
  const followAt = motionSrc.indexOf("resolveFollowFactors(");
  const publishAt = motionSrc.lastIndexOf("publishedRef.current = next;");
  assert("the freeze returns before the dead-zone check", freezeAt > 0 && freezeAt < deadZoneAt);
  assert("the freeze returns before any follow factor is resolved",
    freezeAt > 0 && freezeAt < followAt);
  assert("the freeze returns before the pointing is published",
    freezeAt > 0 && freezeAt < publishAt);
  // Only the gyroscope may clear the freeze — magnetometer drift must not unlock it.
  const gyroBlock = motionSrc.slice(
    motionSrc.indexOf("Sensors.Gyroscope.addListener"),
    motionSrc.indexOf("Sensors.Magnetometer.addListener")
  );
  assert("only the gyroscope listener clears the moving flag",
    /movingRef\.current = false/.test(gyroBlock) &&
    !/movingRef\.current = (true|false)/.test(motionSrc.slice(motionSrc.indexOf("Sensors.Magnetometer.addListener"))));
}
assert("stillness is confirmed over a dwell window",
  /STILLNESS_CONFIRM_MS\s*=\s*\d+/.test(motionSrc) &&
  motionSrc.includes("now - lastMotionAtRef.current >= STILLNESS_CONFIRM_MS"));
assert("start/stop thresholds keep hysteresis (start > stop)",
  /GYRO_START_THRESHOLD\s*=\s*([\d.]+)/.exec(motionSrc)[1] * 1 >
  /GYRO_STOP_THRESHOLD\s*=\s*([\d.]+)/.exec(motionSrc)[1] * 1);
assert("dead zones still suppress sub-degree jitter",
  motionSrc.includes("AZIMUTH_DEAD_ZONE") && motionSrc.includes("ALTITUDE_DEAD_ZONE"));

// Explicitly banned motion behaviours.
assert("no automatic recentering", !/recenter|autoCenter|snapTo/i.test(motionCode));
assert("no animation chase loop in the pointing hook",
  !/requestAnimationFrame|setInterval|withTiming|withSpring/.test(motionCode));
assert("no velocity amplification or acceleration term",
  !/accelerationFactor|velocityBoost|\bmomentum\b/i.test(motionCode));
assert("zoom is read via a ref, so zooming does not resubscribe the sensors",
  motionSrc.includes("zoomRef.current = zoomLevel"));

// ── Heading fusion: the sky must not drift while the phone is held steady ─────────────
const FUSION_PATH = path.resolve(__dirname, "../src/features/sky-lens/ar/orientationFusion.ts");
const fusion = requireTs(FUSION_PATH);
const orientation = requireTs(path.resolve(__dirname, "../src/features/sky-lens/ar/SkyLensOrientation.ts"));

console.log("");
// Shortest-angle math across the 0/360 seam.
assert("359° → 1° travels +2° the short way", fusion.shortestAngleDelta(359, 1) === 2);
assert("1° → 359° travels −2° the short way", fusion.shortestAngleDelta(1, 359) === -2);
assert("shortest delta never exceeds 180°",
  [[0, 180], [10, 350], [270, 90], [45, 225]].every(([f, t]) =>
    Math.abs(fusion.shortestAngleDelta(f, t)) <= 180));

const moving = { conditioning: 1, gyroSpeed: 0.5, isMoving: true, currentTrim: 0 };

// ── Correction envelope: the magnetometer may trim, never redefine north ──────────────
{
  // The device defect, replayed: magnetometer stuck 44° away while the user gently pans.
  // Before the envelope this walked heading 150° -> 106° in about ten seconds.
  const GENTLE = 0.20; // rad/s — a gentle pan
  let heading = 150;
  let trim = 0;
  let envelopeHits = 0;
  let outliers = 0;
  for (let k = 0; k < 4000; k += 1) {
    const r = fusion.correctHeading({
      currentHeading: heading, measuredHeading: 106,
      conditioning: 1, gyroSpeed: GENTLE, isMoving: true, currentTrim: trim
    });
    heading = r.heading; trim = r.trim;
    if (r.reason === "envelope") envelopeHits += 1;
    if (r.reason === "outlier") outliers += 1;
  }
  assert("gentle panning does NOT disable outlier protection", outliers > 0, `${outliers} rejected`);
  assert("a persistent 44° bad reading cannot drag heading from 150° toward 106°",
    Math.abs(fusion.shortestAngleDelta(150, heading)) < 1, `heading held at ${heading.toFixed(1)}°`);
  assert("cumulative trim stays inside the ±12° envelope",
    Math.abs(trim) <= fusion.MAX_TOTAL_TRIM_DEGREES + 1e-9, `trim ${trim.toFixed(2)}°`);
}
{
  // A disagreement small enough to be believed still saturates at the envelope, never beyond.
  let heading = 0, trim = 0, hits = 0;
  for (let k = 0; k < 4000; k += 1) {
    const r = fusion.correctHeading({
      currentHeading: heading, measuredHeading: 40,
      conditioning: 1, gyroSpeed: 0.6, isMoving: true, currentTrim: trim
    });
    heading = r.heading; trim = r.trim;
    if (r.reason === "envelope") hits += 1;
  }
  assert("a believable but persistent offset saturates at the envelope",
    Math.abs(trim - fusion.MAX_TOTAL_TRIM_DEGREES) < 1e-6 && hits > 0, `trim ${trim.toFixed(3)}°`);
  assert("fused heading never moves more than the envelope from where it started",
    Math.abs(fusion.shortestAngleDelta(0, heading)) <= fusion.MAX_TOTAL_TRIM_DEGREES + 1e-6,
    `moved ${fusion.shortestAngleDelta(0, heading).toFixed(2)}°`);
  assert("the envelope is ±12°", fusion.MAX_TOTAL_TRIM_DEGREES === 12);
}
{
  // Outlier allowance scales with gyro speed and never switches off.
  assert("outlier allowance grows with gyro speed",
    fusion.outlierAllowanceDegrees(1.5) > fusion.outlierAllowanceDegrees(0.2) &&
    fusion.outlierAllowanceDegrees(0.2) > fusion.outlierAllowanceDegrees(0.01));
  assert("a 44° disagreement is rejected during a gentle pan",
    44 > fusion.outlierAllowanceDegrees(0.20),
    `allowance ${fusion.outlierAllowanceDegrees(0.2).toFixed(1)}°`);
  assert("a fast deliberate turn is still permitted to outrun the magnetometer",
    fusion.outlierAllowanceDegrees(1.5) > 60);
  assert("rejection is active even at very high gyro speed (never disabled)",
    fusion.correctHeading({
      currentHeading: 0, measuredHeading: 179,
      conditioning: 1, gyroSpeed: 1.0, isMoving: true, currentTrim: 0
    }).reason === "outlier");
}

// 1. Magnetometer drift cannot move a stationary view.
{
  let heading = 100;
  let unlocked = false;
  for (let i = 0; i < 400; i += 1) {
    const noisy = 100 + Math.sin(i * 0.7) * 9 + (i % 5) * 1.4; // sustained magnetic wander
    const r = fusion.correctHeading({
      currentHeading: heading, measuredHeading: noisy,
      conditioning: 1, gyroSpeed: 0.01, isMoving: false, currentTrim: 0
    });
    heading = r.heading;
    if (r.reason !== "frozen" || r.appliedDegrees !== 0) unlocked = true;
  }
  assert("400 noisy magnetometer samples move a still view exactly 0°",
    heading === 100 && !unlocked, `heading=${heading}`);
}

// 2. A single large outlier cannot spin the camera.
{
  const r = fusion.correctHeading({
    currentHeading: 10, measuredHeading: 190, conditioning: 1, gyroSpeed: 0.01, isMoving: true, currentTrim: 0
  });
  assert("a 180° magnetic outlier while barely turning is rejected",
    r.reason === "outlier" && r.heading === 10);
  // Even an accepted correction is hard-capped.
  const capped = fusion.correctHeading({ currentHeading: 0, measuredHeading: 20, ...moving });
  assert("any single correction is capped per sample",
    Math.abs(capped.appliedDegrees) <= fusion.MAX_HEADING_CORRECTION_PER_SAMPLE + 1e-9,
    `applied ${capped.appliedDegrees.toFixed(3)}°`);
  assert("the per-sample cap is under half a degree",
    fusion.MAX_HEADING_CORRECTION_PER_SAMPLE <= 0.5);
}

// 3. Correction is gradual — it takes seconds, not one frame, and it converges.
{
  let heading = 0;
  let samples = 0;
  while (Math.abs(fusion.shortestAngleDelta(heading, 15)) > 0.5 && samples < 5000) {
    heading = fusion.correctHeading({ currentHeading: heading, measuredHeading: 15, ...moving }).heading;
    samples += 1;
  }
  assert("a 15° magnetic disagreement takes many samples to absorb", samples > 30, `${samples} samples`);
  assert("bounded correction still converges", Math.abs(fusion.shortestAngleDelta(heading, 15)) <= 0.5);
}

// 4. Correction crosses the seam the short way, never the long way round.
{
  const r = fusion.correctHeading({ currentHeading: 359, measuredHeading: 1, ...moving });
  assert("correction across 0/360 moves forward, not backward",
    r.appliedDegrees > 0 && (r.heading > 359 - 1e-9 || r.heading < 1),
    `359° → ${r.heading.toFixed(3)}°`);
}

// 5. Near-vertical camera: the magnetometer heading is ignored, not fed in noisily.
{
  const r = fusion.correctHeading({
    currentHeading: 40, measuredHeading: 55, conditioning: 0.05, gyroSpeed: 0.5, isMoving: true, currentTrim: 0
  });
  assert("an ill-conditioned (near-zenith) heading is ignored",
    r.reason === "ill-conditioned" && r.heading === 40);
  assert("conditioning falls as the camera tilts toward the zenith", (() => {
    const flat = orientation.headingConditioning({ x: 0, y: 1, z: 0 }, { x: 0, y: -0.5, z: -0.87 });
    const up = orientation.headingConditioning({ x: 0, y: 0, z: -1 }, { x: 0, y: -0.5, z: -0.87 });
    return up < flat;
  })());
}

// 6. Gyro-confirmed turning resumes movement, and its direction is consistent.
{
  const up = { x: 0, y: 1, z: 0 };
  const left = fusion.gyroHeadingDelta({ x: 0, y: 0.5, z: 0 }, up, 1);
  const right = fusion.gyroHeadingDelta({ x: 0, y: -0.5, z: 0 }, up, 1);
  assert("gyro rotation about gravity moves heading", Math.abs(left) > 1);
  assert("opposite gyro rotation moves heading the opposite way", Math.sign(left) === -Math.sign(right));
  assert("gyro heading delta scales with time",
    Math.abs(fusion.gyroHeadingDelta({ x: 0, y: 0.5, z: 0 }, up, 2)) >
    Math.abs(fusion.gyroHeadingDelta({ x: 0, y: 0.5, z: 0 }, up, 1)));
  assert("rotation perpendicular to gravity does not change heading",
    Math.abs(fusion.gyroHeadingDelta({ x: 0.5, y: 0, z: 0 }, up, 1)) < 1e-9);
  assert("non-finite gyro input cannot corrupt heading",
    fusion.gyroHeadingDelta({ x: NaN, y: 0, z: 0 }, up, 1) === 0);
  // Once moving, a correction is applied again — the freeze is not sticky.
  assert("gyro-confirmed movement resumes magnetometer correction",
    fusion.correctHeading({ currentHeading: 0, measuredHeading: 5, ...moving }).reason === "applied");
}

// 7. The stationary guard is checked FIRST — before conditioning and before outlier tests.
{
  const r = fusion.correctHeading({
    currentHeading: 0, measuredHeading: 190, conditioning: 0.01, gyroSpeed: 9, isMoving: false, currentTrim: 0
  });
  assert("stillness wins over every other correction rule", r.reason === "frozen" && r.appliedDegrees === 0);
}

// 8. The hook no longer reorients absolutely from the magnetometer each sample.
{
  const hookSrc = fs.readFileSync(HOOK_PATH, "utf8");
  assert("heading is the fused value, not a fresh magnetometer azimuth",
    hookSrc.includes("azimuthDegrees: fusedHeadingRef.current"));
  assert("the magnetometer path routes through bounded correction",
    hookSrc.includes("correctHeading({"));
  assert("gyro yaw is integrated for short-term motion",
    hookSrc.includes("gyroHeadingDelta("));
  assert("gyro integration is skipped while frozen",
    /if \(!movingRef\.current \|\| !previousAt \|\| fusedHeadingRef\.current === null\) return;/.test(hookSrc));
}

// ── Constellation geometry must stay rigid ────────────────────────────────────────────
const CON_PATH = path.resolve(__dirname, "../src/features/sky-lens/layers/ConstellationLayer.tsx");
const conSrc = fs.readFileSync(CON_PATH, "utf8");
const { isPlausibleSegment } = requireTs(
  path.resolve(__dirname, "../src/features/sky-lens/layers/constellationGeometry.ts")
);

console.log("");
// All stars in a pattern come from ONE projection pass over ONE pointing snapshot.
assert("every star in a pattern is projected in a single pass",
  conSrc.includes("c.points.map((pt) => project(pt.azimuthDegrees, pt.altitudeDegrees))"));
assert("no per-star smoothing exists in the constellation layer",
  !/lerp|smooth|ease|prevPoint|lastPoint|withTiming|withSpring/i.test(
    conSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")));

// Rigidity: the same camera state must give identical coordinates, and rotating the camera
// must preserve every internal distance and angle in the pattern.
{
  const BOX = { width: 430, height: 932 };
  // A Big-Dipper-like pattern in (az, alt).
  const PATTERN = [[160, 50], [166, 53], [172, 55], [178, 54], [184, 50], [188, 45], [182, 42]];
  const projectAll = (pointing) =>
    PATTERN.map(([az, alt]) => projectTarget(pointing, az, alt, DEFAULT_FOV, BOX));
  const base = { azimuthDegrees: 172, altitudeDegrees: 50, rollDegrees: 0 };

  const first = projectAll(base);
  const again = projectAll({ ...base });
  assert("identical camera state yields identical coordinates",
    first.every((p, i) => p.x === again[i].x && p.y === again[i].y));

  const dist = (pts, i, j) => Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);

  // RIGIDITY UNDER AN ISOTROPIC MAPPING.
  // With equal degrees-per-pixel on both axes, rotating the camera must preserve every
  // internal edge length in the pattern. This proves the projection itself is rigid and
  // that nothing in the render path bends a pattern.
  {
    const SQ = { width: 600, height: 600 };
    const SQFOV = { horizontalDegrees: 50, verticalDegrees: 50 };
    const p0 = PATTERN.map(([az, alt]) => projectTarget(base, az, alt, SQFOV, SQ));
    const p37 = PATTERN.map(([az, alt]) => projectTarget({ ...base, rollDegrees: 37 }, az, alt, SQFOV, SQ));
    const r = [];
    for (let i = 0; i < PATTERN.length - 1; i += 1) r.push(dist(p37, i, i + 1) / dist(p0, i, i + 1));
    const spread = Math.max(...r) - Math.min(...r);
    assert("roll rotates the pattern without bending it (isotropic mapping)",
      spread < 0.02, `edge-ratio spread ${spread.toFixed(4)}`);
  }

  // ISOTROPY: equal angular offsets must project at equal pixel scale on both axes.
  // This is the fix for patterns shearing as they rotate. DEFAULT_FOV is 60x45 on a 430x932
  // viewport; before the fix a degree was worth 2.86x more pixels vertically than
  // horizontally, so a rotating pattern genuinely stretched.
  {
    const c0 = projectTarget(base, 172, 50, DEFAULT_FOV, BOX);
    // 5 degrees of TRUE angle horizontally at this altitude, and 5 degrees vertically.
    const hStep = projectTarget(base, 172 + 5 / Math.cos(50 * Math.PI / 180), 50, DEFAULT_FOV, BOX);
    const vStep = projectTarget(base, 172, 55, DEFAULT_FOV, BOX);
    const hpx = Math.hypot(hStep.x - c0.x, hStep.y - c0.y);
    const vpx = Math.hypot(vStep.x - c0.x, vStep.y - c0.y);
    const ratio = vpx / hpx;
    assert("equal 5° angular offsets project at equal scale on both axes",
      Math.abs(ratio - 1) < 0.05, `vertical/horizontal px-per-degree = ${ratio.toFixed(3)}x`);
    assert("vertical FOV is derived from horizontal FOV and viewport aspect", (() => {
      const derived = effectiveVerticalFov(DEFAULT_FOV, BOX);
      const expected = DEFAULT_FOV.horizontalDegrees * (BOX.height / BOX.width);
      return Math.abs(derived - expected) < 1e-6;
    })());
    assert("a tall viewport therefore sees more sky vertically than horizontally",
      effectiveVerticalFov(DEFAULT_FOV, BOX) > DEFAULT_FOV.horizontalDegrees);
  }

  // Roll on the REAL shipping FOV/viewport must now also preserve edge ratios.
  {
    const rotated = PATTERN.map(([az, alt]) => projectTarget({ ...base, rollDegrees: 37 }, az, alt, DEFAULT_FOV, BOX));
    const r = [];
    for (let i = 0; i < PATTERN.length - 1; i += 1) r.push(dist(rotated, i, i + 1) / dist(first, i, i + 1));
    const spread = Math.max(...r) - Math.min(...r);
    assert("roll preserves pattern proportions on the SHIPPING viewport",
      spread < 0.02, `edge-ratio spread ${spread.toFixed(4)}`);
  }

  // Zoom scales the whole pattern uniformly.
  const ZOOMED = { horizontalDegrees: DEFAULT_FOV.horizontalDegrees / 3, verticalDegrees: DEFAULT_FOV.verticalDegrees / 3 };
  const zoomed = PATTERN.map(([az, alt]) => projectTarget(base, az, alt, ZOOMED, BOX));
  const zRatios = [];
  for (let i = 0; i < PATTERN.length - 1; i += 1) zRatios.push(dist(zoomed, i, i + 1) / dist(first, i, i + 1));
  const zSpread = Math.max(...zRatios) - Math.min(...zRatios);
  assert("zoom scales every edge by the same factor",
    zSpread / Math.max(...zRatios) < 0.05, `relative spread ${(zSpread / Math.max(...zRatios)).toFixed(4)}`);
  assert("zoom magnifies rather than shrinks the pattern", Math.min(...zRatios) > 1.5);
}

// Seam handling: a wrap artefact is dropped, real geometry is kept at every zoom.
{
  const BOX = { width: 430, height: 932 };
  const diagonal = Math.hypot(BOX.width, BOX.height);
  assert("a seam-spanning segment is dropped, not drawn across the viewport",
    isPlausibleSegment({ x: -4000, y: 400 }, { x: 4200, y: 420 }, BOX) === false);
  assert("a long but real zoomed segment is kept",
    isPlausibleSegment({ x: 20, y: 60 }, { x: 400, y: 880 }, BOX) === true);
  assert("the cull limit scales with the viewport, not a fixed 260px",
    isPlausibleSegment({ x: 0, y: 0 }, { x: 0, y: diagonal * 0.9 }, BOX) === true);
  assert("the old fixed 260px cull is gone", !/>\s*260/.test(conSrc));
  assert("non-finite coordinates are dropped",
    isPlausibleSegment({ x: NaN, y: 0 }, { x: 10, y: 10 }, BOX) === false);
}

// ── Labels stay anchored to their object after collision adjustment ──────────────────
// The "separate layers" impression is most likely explained by the projection anisotropy
// fixed above (vertical and horizontal screen motion differed by 2.86x, so objects at
// different screen positions appeared to move at different rates). The placer itself only
// nudges within a bounded set of candidates — pinned here so it cannot start drifting.
{
  const layout = requireTs(path.resolve(__dirname, "../src/features/sky-lens/labelLayout.ts"));
  const BOX = { width: 430, height: 932 };
  const place = layout.makeLabelPlacer(BOX, { top: 40, bottom: 110 });
  const anchors = [[120, 300], [122, 305], [124, 310], [126, 315], [128, 320]];
  let worst = 0;
  for (const [x, y] of anchors) {
    const p1 = place(x, y, "SIRIUS", 13, { x, y, r: 8 });
    if (!Number.isFinite(p1.x)) continue;
    worst = Math.max(worst, Math.hypot(p1.x - x, p1.y - y));
  }
  assert("a collision-nudged label stays close to its object", worst < 120, `worst offset ${worst.toFixed(0)}px`);

  // Centred labels may only move vertically — moving them horizontally would misrepresent
  // which pattern they name.
  const fresh = layout.makeLabelPlacer(BOX, { top: 40, bottom: 110 });
  const c1 = fresh(200, 400, "URSA MAJOR", 13, undefined, true, { weight: 500, letterSpacing: 1.6 });
  const c2 = fresh(200, 400, "URSA MINOR", 13, undefined, true, { weight: 500, letterSpacing: 1.6 });
  assert("a centred label never shifts horizontally off its pattern",
    c1.x === 200 && (!Number.isFinite(c2.x) || c2.x === 200));
  assert("a displaced centred label is still vertically near its anchor",
    !Number.isFinite(c2.y) || Math.abs(c2.y - 400) < 120);
}

console.log("");
if (failed) {
  console.error(`Sky Lens projection self-test: ${failed} failure(s).`);
  process.exit(1);
}
console.log(
  "Sky Lens projection self-test passed: real ENU projectTarget verified (center, behind, FOV clip, roll, zenith, wraparound, divergence) + orientation + follow factors, zoom damping and the stillness freeze."
);
