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
const { projectTarget, projectTargetWithBasis, DEFAULT_FOV, effectiveVerticalFov, effectiveVerticalHalfFov } = requireTs(PROJ_PATH);

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

// ── Quaternion orientation: singularity-free camera path ─────────────────────────────
const Q = requireTs(path.resolve(__dirname, "../src/features/sky-lens/ar/orientationQuaternion.ts"));
const DEG = Math.PI / 180;
const qlen = (q) => Math.hypot(q.w, q.x, q.y, q.z);

console.log("");
// Normalization and validity.
{
  const q = Q.quaternionFromDeviceMotion(0.3, 1.0, -0.4);
  assert("DeviceMotion attitude yields a unit quaternion", Math.abs(qlen(q) - 1) < 1e-12,
    `|q| = ${qlen(q).toFixed(15)}`);
  assert("non-finite attitude degrades to identity",
    Q.quaternionFromDeviceMotion(NaN, 1, 0).w === 1);
  assert("a malformed quaternion is rejected", Q.isValidQuaternion({ w: NaN, x: 0, y: 0, z: 0 }) === false);
  assert("a zero quaternion is rejected", Q.isValidQuaternion({ w: 0, x: 0, y: 0, z: 0 }) === false);
  assert("normalizing garbage yields identity, not NaN",
    Q.normalizeQuaternion({ w: 0, x: 0, y: 0, z: 0 }).w === 1);
}

// Equivalent Euler representations must describe the SAME orientation.
{
  // q and -q are the same rotation.
  const q = Q.quaternionFromDeviceMotion(0.5, 0.9, 0.2);
  const neg = { w: -q.w, x: -q.x, y: -q.y, z: -q.z };
  // acos loses precision near 1, so an exact-zero comparison is not meaningful here;
  // 1e-4 degrees is far below any physically observable difference.
  assert("q and -q describe the same orientation",
    Q.angleBetweenQuaternions(q, neg) < 1e-4, `${Q.angleBetweenQuaternions(q, neg).toFixed(9)}°`);
  // alpha wrapped by 2π is the same attitude.
  const wrapped = Q.quaternionFromDeviceMotion(0.5 + 2 * Math.PI, 0.9, 0.2);
  assert("alpha + 2π is the same orientation",
    Q.angleBetweenQuaternions(q, wrapped) < 1e-4);
  // The device's own Euler flip: beta past 90° flips alpha and gamma by π.
  const preFlip = Q.quaternionFromDeviceMotion(37.4 * DEG, 89.9 * DEG, -1.5 * DEG);
  const postFlip = Q.quaternionFromDeviceMotion((37.4 - 180) * DEG, 90.1 * DEG, (-1.5 - 180) * DEG);
  assert("the real device Euler flip is a small orientation change, not a 180° jump",
    Q.angleBetweenQuaternions(preFlip, postFlip) < 1.0,
    `${Q.angleBetweenQuaternions(preFlip, postFlip).toFixed(3)}° apart`);
}

// Slerp: shortest arc, endpoints exact, always unit length.
{
  const a = Q.quaternionFromDeviceMotion(0, 0, 0);
  const b = Q.quaternionFromDeviceMotion(350 * DEG, 0, 0);
  const mid = Q.slerp(a, b, 0.5);
  // 0 -> 350 the short way passes through 355, NOT through 175.
  assert("slerp takes the shortest arc across the 0/360 wrap",
    Q.angleBetweenQuaternions(mid, Q.quaternionFromDeviceMotion(355 * DEG, 0, 0)) < 1e-6);
  assert("slerp(t=0) returns the start exactly", Q.angleBetweenQuaternions(Q.slerp(a, b, 0), a) < 1e-9);
  assert("slerp(t=1) returns the end exactly", Q.angleBetweenQuaternions(Q.slerp(a, b, 1), b) < 1e-9);
  assert("slerp output is always unit length",
    [0, 0.25, 0.5, 0.75, 1].every((t) => Math.abs(qlen(Q.slerp(a, b, t)) - 1) < 1e-12));
  assert("slerp clamps out-of-range t", Q.angleBetweenQuaternions(Q.slerp(a, b, 5), b) < 1e-9);
  assert("slerp with a negated endpoint still takes the short arc", (() => {
    const nb = { w: -b.w, x: -b.x, y: -b.y, z: -b.z };
    return Q.angleBetweenQuaternions(Q.slerp(a, nb, 0.5), mid) < 1e-6;
  })());
}

// THE DECISIVE TEST: crossing the zenith must stay continuous.
{
  const BOX = { width: 430, height: 932 };
  const star = { az: 45, alt: 80 };
  // Sweep pitch straight through the zenith in fine steps, holding yaw and roll fixed.
  const eulerJumps = [];
  const quatJumps = [];
  let prevE = null;
  let prevQ = null;
  for (let beta = 170; beta <= 190; beta += 0.5) {
    const q = Q.quaternionFromDeviceMotion(30 * DEG, beta * DEG, 0);
    const basis = Q.cameraBasisFromQuaternion(q);
    const pq = projectTargetWithBasis(basis, star.az, star.alt, DEFAULT_FOV, BOX);
    // Same sweep through the Euler path, via the diagnostics readout.
    const e = Q.eulerReadoutFromQuaternion(q);
    const pe = projectTarget(
      { azimuthDegrees: e.azimuthDegrees, altitudeDegrees: e.altitudeDegrees, rollDegrees: 0 },
      star.az, star.alt, DEFAULT_FOV, BOX
    );
    if (prevQ) quatJumps.push(Math.hypot(pq.x - prevQ.x, pq.y - prevQ.y));
    if (prevE) eulerJumps.push(Math.hypot(pe.x - prevE.x, pe.y - prevE.y));
    prevQ = pq;
    prevE = pe;
  }
  const maxQ = Math.max(...quatJumps);
  const maxE = Math.max(...eulerJumps);
  assert("zenith crossing is CONTINUOUS on the quaternion path",
    maxQ < 40, `max step ${maxQ.toFixed(1)}px across the zenith`);
  assert("the quaternion path is far smoother than the Euler path at the zenith",
    maxQ < maxE, `quaternion ${maxQ.toFixed(1)}px vs euler ${maxE.toFixed(1)}px`);
}

// No azimuth/roll swap: a small physical rotation near the zenith is a small orientation change.
{
  const near = Q.quaternionFromDeviceMotion(30 * DEG, 179 * DEG, 0);
  const nudged = Q.quaternionFromDeviceMotion(30 * DEG, 181 * DEG, 0);
  assert("a 2° physical rotation through the zenith is a 2° orientation change",
    Math.abs(Q.angleBetweenQuaternions(near, nudged) - 2) < 0.01,
    `${Q.angleBetweenQuaternions(near, nudged).toFixed(3)}°`);
  // The same nudge read through Euler angles swings azimuth wildly — that is the defect.
  const a = Q.eulerReadoutFromQuaternion(near);
  const b = Q.eulerReadoutFromQuaternion(nudged);
  let dAz = Math.abs(((b.azimuthDegrees - a.azimuthDegrees + 540) % 360) - 180);
  assert("the same nudge swings the EULER azimuth (documents why quaternions are used)",
    dAz > 100, `euler azimuth moved ${dAz.toFixed(1)}° for a 2° physical rotation`);
}

// Freeze and lock: the exact quaternion survives.
{
  const q = Q.quaternionFromDeviceMotion(0.4, 1.1, -0.2);
  const frozen = { ...q };
  // "Sensor updates" while locked must not be applied at all.
  const later = Q.quaternionFromDeviceMotion(1.9, 0.3, 2.2);
  assert("a frozen orientation is preserved bit-for-bit",
    frozen.w === q.w && frozen.x === q.x && frozen.y === q.y && frozen.z === q.z);
  assert("a locked orientation ignores a new sensor sample entirely",
    Q.angleBetweenQuaternions(frozen, q) === 0 && Q.angleBetweenQuaternions(frozen, later) > 1);
  assert("slerp with t=0 is the freeze operation", Q.angleBetweenQuaternions(Q.slerp(q, later, 0), q) < 1e-9);
}

// Drag composes onto a frozen orientation.
{
  const base = Q.quaternionFromDeviceMotion(0, 90 * DEG, 0);
  const zeroDrag = Q.composeDragOffset(base, 0, 0);
  assert("zero drag leaves the orientation unchanged",
    Q.angleBetweenQuaternions(base, zeroDrag) < 1e-9);
  const yawed = Q.composeDragOffset(base, 20, 0);
  assert("drag yaw rotates the orientation", Q.angleBetweenQuaternions(base, yawed) > 5);
  assert("drag output stays unit length", Math.abs(qlen(yawed) - 1) < 1e-12);
  assert("drag yaw is reversible",
    Q.angleBetweenQuaternions(Q.composeDragOffset(yawed, -20, 0), base) < 1e-6);
  assert("non-finite drag is ignored rather than corrupting orientation",
    Q.angleBetweenQuaternions(Q.composeDragOffset(base, NaN, NaN), base) < 1e-9);
  // Drag works at the zenith, where an azimuth-based pan would be undefined.
  const zenith = Q.quaternionFromDeviceMotion(0, 180 * DEG, 0);
  assert("drag still works when pointing at the zenith",
    Q.angleBetweenQuaternions(zenith, Q.composeDragOffset(zenith, 15, 0)) > 5);
}

// One immutable snapshot -> identical coordinates, and rigid constellations.
{
  const BOX = { width: 430, height: 932 };
  const PATTERN = [[160, 50], [166, 53], [172, 55], [178, 54], [184, 50], [188, 45], [182, 42]];
  const project = (q) => {
    const basis = Q.cameraBasisFromQuaternion(q);
    return PATTERN.map(([az, alt]) => projectTargetWithBasis(basis, az, alt, DEFAULT_FOV, BOX));
  };
  const q = Q.quaternionFromDeviceMotion(20 * DEG, 130 * DEG, 5 * DEG);
  const a = project(q);
  const b = project({ ...q });
  assert("an identical orientation snapshot yields identical coordinates",
    a.every((p, i) => p.x === b[i].x && p.y === b[i].y));

  const dist = (pts, i, j) => Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);

  // RIGIDITY = the pattern must not BEND. Measured under pure roll about the optical axis,
  // which keeps the pattern in the same region of the frame.
  //
  // Yaw/pitch are deliberately NOT asserted this way: moving a pattern to a different part
  // of the frame legitimately changes screen-space edge lengths in ANY flat projection
  // (angle-to-pixel distortion grows off-axis). Asserting constant edge ratios there would
  // be asserting that a flat map of a sphere has no distortion, which is false for the
  // shipping projection too. Bending is what we care about, and roll isolates it.
  const rollInDeviceFrame = (base, degrees) =>
    Q.normalizeQuaternion(
      Q.multiplyQuaternions(base, Q.quaternionFromAxisAngle({ x: 0, y: 0, z: 1 }, degrees * DEG))
    );

  // Camera CENTRED on the pattern in each case, so the pattern occupies the same region of
  // the frame and only bending would show up.
  for (const [label, baseQ, pattern] of [
    ["roll at mid altitude", Q.quaternionLookingAt(174, 49), PATTERN],
    // Near the zenith — the posture that broke the Euler path entirely.
    ["roll at the zenith", Q.quaternionLookingAt(0, 88),
      [[0, 84], [40, 86], [90, 85], [140, 86], [180, 84], [220, 86]]]
  ]) {
    const basis0 = Q.cameraBasisFromQuaternion(baseQ);
    const p0 = pattern.map(([az, alt]) => projectTargetWithBasis(basis0, az, alt, DEFAULT_FOV, BOX));
    for (const deg of [15, 40, 90]) {
      const basisR = Q.cameraBasisFromQuaternion(rollInDeviceFrame(baseQ, deg));
      const pR = pattern.map(([az, alt]) => projectTargetWithBasis(basisR, az, alt, DEFAULT_FOV, BOX));
      const ratios = [];
      for (let i = 0; i < pattern.length - 1; i += 1) ratios.push(dist(pR, i, i + 1) / dist(p0, i, i + 1));
      const spread = Math.max(...ratios) - Math.min(...ratios);
      assert(`pattern does not bend under ${deg}° ${label}`, spread < 0.02,
        `edge-ratio spread ${spread.toFixed(4)}`);
    }
  }

  // A pattern crossing the zenith must not tear: consecutive frames stay close together.
  {
    let worst = 0;
    let prev = null;
    for (let beta = 172; beta <= 188; beta += 0.5) {
      const basisZ = Q.cameraBasisFromQuaternion(Q.quaternionFromDeviceMotion(20 * DEG, beta * DEG, 0));
      const pts = PATTERN.map(([az, alt]) => projectTargetWithBasis(basisZ, az, alt, DEFAULT_FOV, BOX));
      if (prev) {
        for (let i = 0; i < pts.length; i += 1) {
          worst = Math.max(worst, Math.hypot(pts[i].x - prev[i].x, pts[i].y - prev[i].y));
        }
      }
      prev = pts;
    }
    assert("a pattern sweeping through the zenith moves continuously", worst < 40,
      `worst per-frame star movement ${worst.toFixed(1)}px`);
  }

  // Zoom scales the whole pattern uniformly on the quaternion path too.
  const ZOOMED = { horizontalDegrees: DEFAULT_FOV.horizontalDegrees / 3, verticalDegrees: DEFAULT_FOV.verticalDegrees / 3 };
  const basis = Q.cameraBasisFromQuaternion(q);
  const zoomed = PATTERN.map(([az, alt]) => projectTargetWithBasis(basis, az, alt, ZOOMED, BOX));
  const zr = [];
  for (let i = 0; i < PATTERN.length - 1; i += 1) zr.push(dist(zoomed, i, i + 1) / dist(a, i, i + 1));
  assert("zoom scales every edge by the same factor (quaternion path)",
    (Math.max(...zr) - Math.min(...zr)) / Math.max(...zr) < 0.05);
  assert("zoom magnifies on the quaternion path", Math.min(...zr) > 1.5);
}

// Targets remain projectable (i.e. tappable) — the basis path never returns NaN.
{
  const BOX = { width: 430, height: 932 };
  let bad = 0;
  for (let beta = 0; beta <= 360; beta += 7) {
    for (let alpha = 0; alpha < 360; alpha += 37) {
      const basis = Q.cameraBasisFromQuaternion(Q.quaternionFromDeviceMotion(alpha * DEG, beta * DEG, 0));
      for (const [az, alt] of [[0, 0], [90, 45], [180, 89], [270, -30], [45, 90]]) {
        const p = projectTargetWithBasis(basis, az, alt, DEFAULT_FOV, BOX);
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) bad += 1;
      }
    }
  }
  assert("every orientation projects finite coordinates (taps stay hit-testable)", bad === 0,
    `${bad} non-finite projections`);
}

// ── Wiring: the quaternion path actually drives the render ───────────────────────────
{
  const screenSrc = fs.readFileSync(path.resolve(__dirname, "../src/features/sky-lens/SkyLensScreen.tsx"), "utf8");
  const canvasSrc = fs.readFileSync(path.resolve(__dirname, "../src/features/sky-lens/SkyLensCanvas.tsx"), "utf8");
  const nebulaSrc = fs.readFileSync(path.resolve(__dirname, "../src/features/sky-lens/layers/NebulaImageLayer.tsx"), "utf8");
  const clusterSrc = fs.readFileSync(path.resolve(__dirname, "../src/features/sky-lens/layers/ClusterLayer.tsx"), "utf8");

  console.log("");
  assert("Sky Lens mounts the quaternion orientation hook", screenSrc.includes("useSkyOrientation("));
  assert("one camera basis is computed per render", screenSrc.includes("const cameraBasis = useMemo("));
  assert("the canvas receives that basis", screenSrc.includes("basis={cameraBasis}"));

  // Every layer must share the ONE basis — the canvas project callback feeds them all.
  assert("the canvas project callback uses projectTargetWithBasis",
    canvasSrc.includes("projectTargetWithBasis(basis, az, alt, fov, box)"));
  assert("the shared project callback depends on the basis", canvasSrc.includes("[basis, pointing, box, fov]"));
  assert("horizon glow and grid centre on the basis, not a separate azimuth",
    !canvasSrc.includes("centerAzimuth={pointing.azimuthDegrees}") &&
    canvasSrc.includes("centerAzimuth={centerAzimuth}"));

  // Layers that project independently must ALSO take the basis, or they would disagree
  // with everything else about where the camera is looking.
  for (const [name, src] of [["NebulaImageLayer", nebulaSrc], ["ClusterLayer", clusterSrc]]) {
    assert(`${name} accepts the shared basis`, src.includes("basis?: CameraBasis;"));
    assert(`${name} projects through the basis when present`,
      src.includes("projectTargetWithBasis(basis, az, alt, fov, box)"));
    assert(`${name} no longer calls projectTarget(pointing, ...) directly`,
      !/projectTarget\(pointing,\s*\w+\.azimuthDegrees/.test(src));
  }
  assert("both independent layers are given the basis",
    (screenSrc.match(/basis=\{cameraBasis\}/g) || []).length >= 3);

  // Hit testing shares the same projection: object taps read the layers' projected
  // positions, which now come from the basis.
  assert("object selection is still wired", screenSrc.includes("objectTap"));
  assert("pinch zoom is still wired", screenSrc.includes("Gesture.Pinch()"));
  assert("zoom range is unchanged", screenSrc.includes("Math.max(1, Math.min(12,"));

  // Lock Sky + drag.
  assert("a Lock Sky control exists", screenSrc.includes("skyOrientation.toggleLock()"));
  assert("the lock control is labelled for accessibility",
    screenSrc.includes("Lock the sky so it stops moving") &&
    screenSrc.includes("Unlock the sky and resume live tracking"));
  assert("drag-to-pan is a distinct gesture", screenSrc.includes("Gesture.Pan()"));
  assert("drag uses an activation distance so taps still select",
    screenSrc.includes(".minDistance(DRAG_ACTIVATION_POINTS)"));
  assert("drag and pinch run simultaneously with taps",
    /Gesture\.Simultaneous\(pinch, skyDrag, cinematicTap, objectTap\)/.test(screenSrc));

  // The legacy paths must still exist, but no longer feed the projection.
  const fsExists = (rel) => fs.existsSync(path.resolve(__dirname, "..", rel));
  assert("legacy useDevicePointing.ts is still present",
    fsExists("src/features/sky-lens/ar/useDevicePointing.ts"));
  assert("legacy orientationFusion.ts is still present",
    fsExists("src/features/sky-lens/ar/orientationFusion.ts"));
  assert("legacy Euler projectTarget is still exported",
    /export function projectTarget\(/.test(fs.readFileSync(PROJ_PATH, "utf8")));
  assert("the legacy hook is still mounted as a fallback", screenSrc.includes("useDevicePointing(120, 0, zoom)"));
  // The Euler call is still present ON PURPOSE, as the fallback branch. What matters is
  // that it is unreachable whenever a basis is supplied — and the screen always supplies one.
  assert("the legacy Euler projection is only a conditional fallback",
    /basis\s*\?\s*projectTargetWithBasis\([\s\S]{0,120}?:\s*projectTarget\(pointing,/.test(canvasSrc));
  assert("the screen always supplies a basis, so the fallback is unused in production",
    screenSrc.includes("basis={cameraBasis}") && screenSrc.includes("const cameraBasis = useMemo("));
}

// ── Lock / drag / unlock behaviour, against the real orientation helpers ──────────────
{
  const base = Q.quaternionLookingAt(120, 40);

  // Locked: a completely different sensor sample must not move the rendered orientation.
  const sensorLater = Q.quaternionLookingAt(310, -20);
  assert("locking preserves the exact quaternion",
    Q.angleBetweenQuaternions(base, base) === 0);
  assert("a locked orientation ignores sensor movement",
    Q.angleBetweenQuaternions(base, sensorLater) > 90);

  // Drag only composes onto the frozen orientation.
  const dragged = Q.composeDragOffset(base, 25, -10);
  assert("drag moves the locked orientation", Q.angleBetweenQuaternions(base, dragged) > 5);
  assert("drag is reversible back to the frozen orientation",
    Q.angleBetweenQuaternions(Q.composeDragOffset(dragged, -25, 10), base) < 1e-3);

  // Unlock blend: monotone, no jump, ends exactly on live.
  const live = Q.quaternionLookingAt(150, 55);
  let previous = base;
  let worstStep = 0;
  for (let i = 1; i <= 30; i += 1) {
    const blended = Q.slerp(base, live, i / 30);
    worstStep = Math.max(worstStep, Q.angleBetweenQuaternions(previous, blended));
    previous = blended;
  }
  const direct = Q.angleBetweenQuaternions(base, live);
  assert("the unlock blend never jumps the whole gap in one frame",
    worstStep < direct / 5, `worst step ${worstStep.toFixed(2)}° vs ${direct.toFixed(2)}° total`);
  // acos loses precision near 1; 1e-3 degrees is far below anything observable.
  assert("the unlock blend lands on the live orientation",
    Q.angleBetweenQuaternions(previous, live) < 1e-3,
    `${Q.angleBetweenQuaternions(previous, live).toExponential(2)}°`);

  // Drag must not distort geometry: it is a rigid rotation of the whole sky.
  const BOX = { width: 430, height: 932 };
  const PAT = [[118, 38], [122, 41], [126, 43], [130, 42]];
  const proj = (q) => {
    const b = Q.cameraBasisFromQuaternion(q);
    return PAT.map(([az, alt]) => projectTargetWithBasis(b, az, alt, DEFAULT_FOV, BOX));
  };
  const before = proj(base);
  const after = proj(Q.composeDragOffset(base, 6, 0));
  const d = (p, i, j) => Math.hypot(p[i].x - p[j].x, p[i].y - p[j].y);
  const r = [];
  for (let i = 0; i < PAT.length - 1; i += 1) r.push(d(after, i, i + 1) / d(before, i, i + 1));
  assert("dragging does not distort constellation geometry",
    Math.max(...r) - Math.min(...r) < 0.02, `edge-ratio spread ${(Math.max(...r) - Math.min(...r)).toFixed(4)}`);
}

// ── Tap regression: hit testing must use the SAME projection as rendering ────────────
{
  const screenSrc = fs.readFileSync(path.resolve(__dirname, "../src/features/sky-lens/SkyLensScreen.tsx"), "utf8");
  console.log("");

  // THE BUG: objects were DRAWN through the quaternion basis but HIT-TESTED through the
  // legacy Euler pointing, so a tap measured its distance to where the old projection
  // thought the planet was. Those disagree by design, so no card ever opened.
  assert("tap hit-testing projects through the camera basis",
    screenSrc.includes("const projectHit = (az: number, alt: number) =>") &&
    /projectHit[\s\S]{0,160}?projectTargetWithBasis\(basis, az, alt, fov, box\)/.test(screenSrc));
  assert("planets and the Moon are hit-tested with projectHit",
    screenSrc.includes("projectHit(body.azimuthDegrees, body.altitudeDegrees)"));
  assert("stars are hit-tested with projectHit",
    screenSrc.includes("projectHit(star.azimuthDegrees, star.altitudeDegrees)"));
  assert("no hit test still uses the legacy Euler pointing",
    !/const p = projectTarget\(pointing,/.test(screenSrc));
  assert("guidance and overlays outside the canvas share the same basis",
    screenSrc.includes("const projectShared = useCallback(") &&
    screenSrc.includes("projectTargetWithBasis(cameraBasis, az, alt, fov, box)"));

  // Generous finger radii are what make a tap forgiving; they must survive.
  assert("planet touch radius is unchanged", screenSrc.includes("const PLANET_HIT = 80;"));
  assert("star touch radius is unchanged", screenSrc.includes("const STAR_HIT = 50;"));
  assert("the tap gesture still opens the info card", screenSrc.includes("Gesture.Tap()"));

  // Drag must not steal taps: it only activates past the threshold, and runs simultaneously.
  assert("drag activates only past the 12-point threshold",
    screenSrc.includes(".minDistance(DRAG_ACTIVATION_POINTS)"));
  assert("drag, pinch and taps are simultaneous, not exclusive",
    /Gesture\.Simultaneous\(pinch, skyDrag, cinematicTap, objectTap\)/.test(screenSrc));
  assert("gestures do not cancel touches in the view (SVG press targets keep working)",
    (screenSrc.match(/cancelsTouchesInView\(false\)/g) || []).length >= 3);
}

// ── Unlock state machine is StrictMode-safe ──────────────────────────────────────────
{
  const hookSrc = fs.readFileSync(path.resolve(__dirname, "../src/features/sky-lens/ar/useSkyOrientation.ts"), "utf8");
  console.log("");

  // The defect: blendFrom was assigned INSIDE a setFrozen updater. React may invoke an
  // updater twice; the second call received the null the first returned, wiped blendFrom,
  // and the unlock skipped its blend entirely and snapped.
  assert("the blend start orientation is state, not a ref",
    hookSrc.includes("const [blendFrom, setBlendFrom] = useState<Quaternion | null>(null);") &&
    !hookSrc.includes("blendFromRef"));
  assert("lock and unlock are explicit callbacks", /const lock = useCallback\(/.test(hookSrc) &&
    /const unlock = useCallback\(/.test(hookSrc));

  // No setter may be called from inside another setter's updater, and no ref written there.
  const updaterBodies = hookSrc.match(/set[A-Z]\w*\(\([^)]*\)\s*=>\s*\{[\s\S]*?\n  \}\)/g) || [];
  assert("no state updater calls another setter",
    updaterBodies.every((b) => !/\bset[A-Z]\w*\(/.test(b.replace(/^set[A-Z]\w*\(/, ""))),
    `${updaterBodies.length} updater bodies checked`);
  assert("no state updater writes to a ref",
    updaterBodies.every((b) => !/Ref\.current\s*=/.test(b)));
  assert("unlock captures the displayed orientation including drag",
    /const unlock = useCallback\(\(\) => \{[\s\S]*?composeDragOffset\(base, drag\.yaw, drag\.pitch\)[\s\S]*?setBlendFrom\(displayed\)/.test(hookSrc));

  // Behavioural: repeated invocation of the same callback must not erase the blend start.
  const base = Q.quaternionLookingAt(100, 30);
  const live = Q.quaternionLookingAt(190, 60);
  // Simulate the previous bug: deriving blendFrom from a value that a second invocation
  // would see as null. With blendFrom captured up-front this cannot happen.
  let blendFrom = null;
  const unlockOnce = () => { const displayed = base; blendFrom = displayed; };
  unlockOnce();
  unlockOnce(); // idempotent — a second invocation recomputes the SAME value
  assert("repeated unlock invocation cannot erase the blend start",
    blendFrom !== null && Q.angleBetweenQuaternions(blendFrom, base) < 1e-3);

  // lock -> device moves -> unlock: the blend starts from what was displayed, not from live.
  const first = Q.slerp(blendFrom, live, 0);
  assert("the blend starts from the frozen displayed orientation",
    Q.angleBetweenQuaternions(first, base) < 1e-3);
  const gap = Q.angleBetweenQuaternions(base, live);
  let previous = base;
  let worst = 0;
  for (let i = 1; i <= 28; i += 1) {
    const step = Q.slerp(blendFrom, live, i / 28);
    worst = Math.max(worst, Q.angleBetweenQuaternions(previous, step));
    previous = step;
  }
  assert("lock, move the device, unlock -> no hard snap", worst < gap / 5,
    `largest single frame ${worst.toFixed(2)}° of a ${gap.toFixed(1)}° gap`);
  assert("the transition lands on the live orientation",
    Q.angleBetweenQuaternions(previous, live) < 1e-3);
}

// ── Constellation names ──────────────────────────────────────────────────────────────
{
  const catSrc = fs.readFileSync(path.resolve(__dirname, "../src/features/sky-lens/data/constellationLines.ts"), "utf8");
  const layerSrc = fs.readFileSync(path.resolve(__dirname, "../src/features/sky-lens/layers/ConstellationLayer.tsx"), "utf8");
  const starSrc = fs.readFileSync(path.resolve(__dirname, "../src/features/sky-lens/ephemeris/StarPositions.ts"), "utf8");
  const screenSrcForTaps = fs.readFileSync(path.resolve(__dirname, "../src/features/sky-lens/SkyLensScreen.tsx"), "utf8");
  console.log("");

  assert("Ursa Major carries the familiar name Big Dipper",
    /id: "ursa-major"[\s\S]{0,120}?familiarName: "Big Dipper"/.test(catSrc));
  assert("Ursa Minor carries the familiar name Little Dipper",
    /id: "ursa-minor"[\s\S]{0,160}?familiarName: "Little Dipper"/.test(catSrc));
  assert("Polaris is identified as Ursa Minor's anchor star",
    /id: "ursa-minor"[\s\S]{0,220}?anchorStarName: "Polaris"/.test(catSrc));
  assert("Polaris is the FIRST star of Ursa Minor (end of the handle)",
    /id: "ursa-minor"[\s\S]{0,200}?anchorStarIndex: 0/.test(catSrc) &&
    /anchorStarIndex: 0[\s\S]{0,400}?raHours: 2\.5302, decDegrees: 89\.264/.test(catSrc));
  assert("the horizontal projection carries the names through",
    starSrc.includes("familiarName: c.familiarName") &&
    starSrc.includes("anchorStarName: c.anchorStarName"));

  // Both names still appear — now stacked (familiar leads, official supports) rather than
  // joined on one line.
  assert("asterisms show BOTH names, stacked rather than joined",
    layerSrc.includes("const label = (c.familiarName ?? c.name).toUpperCase();") &&
    layerSrc.includes("const subLabel = c.familiarName ? c.name.toUpperCase() : null;"));
  assert("labels are hidden when no member star is above the horizon",
    layerSrc.includes("const anyStarUp = c.points.some((pt) => pt.aboveHorizon);"));
  assert("labels are hidden when the anchor projects off-screen or behind",
    layerSrc.includes("!centroid.behind") && layerSrc.includes("centroid.x < box.width - 14"));
  assert("the anchor star label is only drawn when that star is up",
    layerSrc.includes("anchorPoint && (anchorPoint.aboveHorizon || fullSphere)"));
  assert("labels use the SAME project function as the line geometry",
    (layerSrc.match(/project\(/g) || []).length >= 3 && !layerSrc.includes("projectTarget("));
  assert("collision avoidance is preserved", layerSrc.includes("placeLabel"));

  // The label text a user actually sees.
  const label = (familiar, name) => (familiar ? `${familiar} · ${name}` : name).toUpperCase();
  assert("Big Dipper label reads 'BIG DIPPER · URSA MAJOR'",
    label("Big Dipper", "Ursa Major") === "BIG DIPPER · URSA MAJOR");
  assert("Little Dipper label reads 'LITTLE DIPPER · URSA MINOR'",
    label("Little Dipper", "Ursa Minor") === "LITTLE DIPPER · URSA MINOR");
  assert("a normal constellation is unchanged", label(undefined, "Orion") === "ORION");

  // ── Readability ──
  assert("primary constellations are emphasised over the rest",
    layerSrc.includes("const PRIMARY_CONSTELLATIONS = new Set([") &&
    /PRIMARY_OPACITY = (1|0\.9\d)/.test(layerSrc) &&
    /SECONDARY_OPACITY_FAR = 0\.\d/.test(layerSrc));
  assert("primary names are larger than secondary names", (() => {
    const p = Number(/PRIMARY_FONT_SIZE = ([\d.]+)/.exec(layerSrc)[1]);
    const q = Number(/SECONDARY_FONT_SIZE = ([\d.]+)/.exec(layerSrc)[1]);
    return p > q && p >= 14;
  })());
  assert("labels have a multi-pass dark backing so they stay legible over the Milky Way",
    (layerSrc.match(/stroke="#03060E"/g) || []).length >= 3);
  assert("the backing is drawn behind the fill, not over it", (() => {
    // Scoped to the three-pass block so the Polaris anchor label (which appears earlier in
    // the JSX and has its own backing) cannot satisfy this by accident.
    const block = layerSrc.slice(layerSrc.indexOf("THREE-PASS BACKING"));
    const firstStroke = block.indexOf('stroke="#03060E"');
    const fill = block.indexOf("fill={nightMode ? palette.conLabel : CON_LABEL_GOLD}");
    return firstStroke > 0 && fill > firstStroke;
  })());
  // Every requested pattern is labelled; the tier only decides emphasis, not presence.
  assert("every requested constellation is in a named tier", (() => {
    const want = ["ursa-major", "ursa-minor", "orion", "cassiopeia", "leo", "gemini",
      "taurus", "scorpius", "sagittarius", "cygnus", "lyra", "aquila"];
    const primary = /PRIMARY_CONSTELLATIONS = new Set\(\[([\s\S]*?)\]\)/.exec(layerSrc)[1];
    const secondary = /SECONDARY_CONSTELLATIONS = new Set\(\[([\s\S]*?)\]\)/.exec(layerSrc)[1];
    return want.every((id) => primary.includes(`"${id}"`) || secondary.includes(`"${id}"`));
  })());
  assert("every requested constellation exists in the dataset", (() => {
    const want = ["ursa-major", "ursa-minor", "orion", "cassiopeia", "leo", "gemini",
      "taurus", "scorpius", "sagittarius", "cygnus", "lyra", "aquila"];
    return want.every((id) => catSrc.includes(`id: "${id}"`));
  })());

  // ── Clutter control ──
  assert("a label nudged too far from its pattern is dropped, not shown detached",
    layerSrc.includes("MAX_LABEL_DETACHMENT_PX") &&
    layerSrc.includes("> MAX_LABEL_DETACHMENT_PX"));
  assert("the detachment leash is tighter than half the short screen edge", (() => {
    const px = Number(/MAX_LABEL_DETACHMENT_PX = (\d+)/.exec(layerSrc)[1]);
    return px > 0 && px < 430 / 2;
  })());

  // ── Labels must never take a tap from a planet or the Moon ──
  assert("tap hit-testing considers only bodies and stars, so labels cannot steal a tap",
    screenSrcForTaps.includes("for (const body of sky.bodies)") &&
    screenSrcForTaps.includes("for (const star of sky.stars)") &&
    !/for \(const c of sky\.constellations\)[\s\S]{0,400}?setSelected/.test(screenSrcForTaps));
  assert("planets are hit-tested before stars and win ties",
    screenSrcForTaps.indexOf("for (const body of sky.bodies)") <
    screenSrcForTaps.indexOf("for (const star of sky.stars)") &&
    screenSrcForTaps.includes("const planetLocked = closest !== null && closest.dist < 40;"));
  assert("label text is pointerEvents=none so it cannot intercept a touch",
    layerSrc.includes('pointerEvents="none"'));

  // ── Familiar-name coverage across the requested set ──
  const REQUESTED = [
    ["ursa-major", "Ursa Major"], ["ursa-minor", "Ursa Minor"], ["orion", "Orion"],
    ["cassiopeia", "Cassiopeia"], ["leo", "Leo"], ["gemini", "Gemini"], ["taurus", "Taurus"],
    ["scorpius", "Scorpius"], ["sagittarius", "Sagittarius"], ["cygnus", "Cygnus"],
    ["lyra", "Lyra"], ["aquila", "Aquila"], ["pegasus", "Pegasus"], ["andromeda", "Andromeda"],
    ["canis_major", "Canis Major"], ["canis-minor", "Canis Minor"], ["bootes", "Boo"],
    ["corona-borealis", "Corona Borealis"]
  ];
  for (const [id] of REQUESTED) {
    assert(`dataset has geometry for ${id}`, catSrc.includes(`id: "${id}"`));
  }
  // Cancer was requested but the dataset has no line geometry for it; inventing one is
  // explicitly out of scope, so this records the gap rather than hiding it.
  assert("Virgo is present and labelled", catSrc.includes('id: "virgo"'));

  // ── Cancer and Libra: real geometry, not approximations ──
  for (const [id, name, starCount, lineCount] of [
    ["cancer", "Cancer", 5, 4],
    ["libra", "Libra", 4, 4]
  ]) {
    // lines: [[4, 2], [2, 1], ...] is nested, so match to the end of that line rather than
    // to the first closing bracket.
    const block = new RegExp(`id: "${id}"[\\s\\S]*?lines: \\[.*\\]`).exec(catSrc);
    assert(`${name} exists in the dataset`, !!block);
    if (!block) continue;
    const body = block[0];
    assert(`${name} declares its official name`, body.includes(`name: "${name}"`));
    assert(`${name} has ${starCount} anchor stars`,
      (body.match(/raHours:/g) || []).length === starCount,
      `${(body.match(/raHours:/g) || []).length} stars`);
    assert(`${name} has ${lineCount} line pairs`,
      (body.match(/\[\d+, \d+\]/g) || []).length === lineCount);
    assert(`${name} carries season and myth metadata`,
      body.includes("season:") && body.includes("myth:"));
    // Every line index must point at a real star.
    const idx = [...body.matchAll(/\[(\d+), (\d+)\]/g)].flatMap((m) => [Number(m[1]), Number(m[2])]);
    assert(`${name} line indices are all in range`, idx.every((i) => i >= 0 && i < starCount));
    assert(`${name} lines reference every star (no orphans)`,
      new Set(idx).size === starCount, `${new Set(idx).size}/${starCount} stars connected`);
  }

  // Coordinates must be plausible sky positions, and match the real constellations.
  {
    const cancerBlock = /id: "cancer"[\s\S]*?lines:/.exec(catSrc)[0];
    const libraBlock = /id: "libra"[\s\S]*?lines:/.exec(catSrc)[0];
    const ras = (b) => [...b.matchAll(/raHours: ([\d.]+)/g)].map((m) => Number(m[1]));
    const decs = (b) => [...b.matchAll(/decDegrees: (-?[\d.]+)/g)].map((m) => Number(m[1]));
    assert("Cancer sits in the 8h-9h RA range (between Gemini and Leo)",
      ras(cancerBlock).every((r) => r > 8 && r < 9.1));
    assert("Cancer is a northern pattern (dec +9 to +29)",
      decs(cancerBlock).every((d) => d > 8 && d < 30));
    assert("Libra sits in the 14h-16h RA range (between Virgo and Scorpius)",
      ras(libraBlock).every((r) => r > 14.5 && r < 16));
    assert("Libra is a southern pattern (dec -9 to -26)",
      decs(libraBlock).every((d) => d < -9 && d > -26));
    assert("all RA values are valid hours", [...ras(cancerBlock), ...ras(libraBlock)].every((r) => r >= 0 && r < 24));
    assert("all Dec values are valid degrees",
      [...decs(cancerBlock), ...decs(libraBlock)].every((d) => d >= -90 && d <= 90));
  }
  assert("Cancer and Libra are primary-priority labels", (() => {
    const block = /PRIMARY_CONSTELLATIONS = new Set\(\[([\s\S]*?)\]\)/.exec(layerSrc)[1];
    return block.includes('"cancer"') && block.includes('"libra"');
  })());
  // They inherit the shared visibility rule — nothing pattern-specific.
  assert("Cancer and Libra are hidden below the horizon by the shared rule",
    layerSrc.includes("const anyStarUp = c.points.some((pt) => pt.aboveHorizon);"));

  // ── Constellation names must not read as star names ──
  const starSrcForStyle = fs.readFileSync(path.resolve(__dirname, "../src/features/sky-lens/layers/StarLayer.tsx"), "utf8");
  const starFont = Number(/<SvgText[^>]*?fontSize=\{(\d+)\}[^>]*?fontWeight="600"/.exec(starSrcForStyle)?.[1] ?? 16);
  const conFont = Number(/PRIMARY_FONT_SIZE = ([\d.]+)/.exec(layerSrc)[1]);
  assert("constellation names are LARGER than star names",
    conFont > starFont, `constellation ${conFont}px vs star ${starFont}px`);
  assert("constellation names are heavier than star names", /LABEL_WEIGHT = "800"/.test(layerSrc));
  assert("constellation names are widely tracked, unlike star names", (() => {
    const t = Number(/LABEL_TRACKING = ([\d.]+)/.exec(layerSrc)[1]);
    return t >= 2;
  })());
  assert("constellation names are centred on the pattern, star names are not",
    layerSrc.includes('textAnchor="middle"') && !starSrcForStyle.includes('textAnchor="middle"'));
  assert("constellation names are drawn at full opacity when primary",
    /PRIMARY_OPACITY = 1\b/.test(layerSrc));

  // ── Every requested pattern that EXISTS is a primary (prominent) label ──
  assert("all 17 available requested patterns are primary", (() => {
    const want = ["ursa-major", "ursa-minor", "orion", "cassiopeia", "leo", "gemini", "taurus",
      "virgo", "scorpius", "sagittarius", "cygnus", "lyra", "aquila", "pegasus", "andromeda",
      "bootes", "corona-borealis"];
    const block = /PRIMARY_CONSTELLATIONS = new Set\(\[([\s\S]*?)\]\)/.exec(layerSrc)[1];
    return want.every((id) => block.includes(`"${id}"`));
  })());

  // ── Asterism handling: familiar name leads, official name supports ──
  assert("an asterism's primary label is the familiar name alone",
    layerSrc.includes("const label = (c.familiarName ?? c.name).toUpperCase();"));
  assert("the official constellation name is a smaller second line",
    layerSrc.includes("const subLabel = c.familiarName ? c.name.toUpperCase() : null;") &&
    /SUBLABEL_FONT_SIZE = ([\d.]+)/.test(layerSrc));
  assert("the sub-label is smaller than the primary label", (() => {
    const sub = Number(/SUBLABEL_FONT_SIZE = ([\d.]+)/.exec(layerSrc)[1]);
    const pri = Number(/PRIMARY_FONT_SIZE = ([\d.]+)/.exec(layerSrc)[1]);
    return sub < pri;
  })());
  assert("neither Dipper is labelled as an official constellation on its own",
    !/familiarName: "Big Dipper"[\s\S]{0,60}?name: "Big Dipper"/.test(catSrc));
  // What a user actually reads:
  const render = (familiar, name) => [(familiar ?? name).toUpperCase(), familiar ? name.toUpperCase() : null];
  assert("Big Dipper renders as BIG DIPPER over URSA MAJOR",
    JSON.stringify(render("Big Dipper", "Ursa Major")) === JSON.stringify(["BIG DIPPER", "URSA MAJOR"]));
  assert("Little Dipper renders as LITTLE DIPPER over URSA MINOR",
    JSON.stringify(render("Little Dipper", "Ursa Minor")) === JSON.stringify(["LITTLE DIPPER", "URSA MINOR"]));
  assert("a normal constellation has no second line",
    JSON.stringify(render(undefined, "Orion")) === JSON.stringify(["ORION", null]));

  // ── Duplicate suppression ──
  const geoSrc = fs.readFileSync(path.resolve(__dirname, "../src/features/sky-lens/layers/constellationGeometry.ts"), "utf8");
  const canvasSrcLabels = fs.readFileSync(path.resolve(__dirname, "../src/features/sky-lens/SkyLensCanvas.tsx"), "utf8");
  assert("zodiac-duplicated constellations are enumerated", geoSrc.includes("ZODIAC_CONSTELLATION_IDS"));
  assert("Leo is in the zodiac duplicate set (the reported case)", /ZODIAC_CONSTELLATION_IDS[\s\S]*?"leo"/.test(geoSrc));
  // The CONSTELLATION name now wins the duplicate. The zodiac keeps its glyph — which is
  // what makes it a zodiac layer — but drops its near-identical uppercase name text.
  const zodiacSrc = fs.readFileSync(path.resolve(__dirname, "../src/features/sky-lens/layers/ZodiacLayer.tsx"), "utf8");
  assert("the zodiac layer can suppress its own sign names", zodiacSrc.includes("hideNames"));
  assert("the zodiac keeps its glyph when names are hidden",
    /\{!hideNames && \(/.test(zodiacSrc) &&
    zodiacSrc.includes("{sign.symbol}"));
  assert("zodiac names are hidden whenever the constellation layer is on",
    canvasSrcLabels.includes('hideNames={activeLayers.has("constellations")}'));
  assert("the constellation layer no longer yields its names to the zodiac",
    !canvasSrcLabels.includes("suppressNameIds={"));

  // ── Zoom-dependent priority ──
  assert("three priority tiers exist",
    layerSrc.includes("PRIMARY_CONSTELLATIONS") && layerSrc.includes("SECONDARY_CONSTELLATIONS"));
  assert("the ten default-zoom priorities are all primary", (() => {
    const want = ["ursa-major", "ursa-minor", "orion", "cassiopeia", "leo", "gemini",
      "taurus", "scorpius", "sagittarius"];
    const block = /PRIMARY_CONSTELLATIONS = new Set\(\[([\s\S]*?)\]\)/.exec(layerSrc)[1];
    return want.every((id) => block.includes(`"${id}"`));
  })());
  // ── Zoom ladder: default -> medium -> high ──
  assert("secondary names appear only at medium zoom",
    layerSrc.includes('if (band === "secondary" && zoom < MEDIUM_ZOOM) return null;'));
  assert("the rest of the catalogue appears only at high zoom",
    layerSrc.includes('if (band === "tertiary" && zoom < HIGH_ZOOM) return null;'));
  assert("the zoom thresholds are ordered and above default zoom", (() => {
    const m = Number(/MEDIUM_ZOOM = ([\d.]+)/.exec(layerSrc)[1]);
    const h = Number(/HIGH_ZOOM = ([\d.]+)/.exec(layerSrc)[1]);
    return m > 1 && h > m;
  })());
  assert("secondary names strengthen when zoomed in", (() => {
    const far = Number(/SECONDARY_OPACITY_FAR = ([\d.]+)/.exec(layerSrc)[1]);
    const near = Number(/SECONDARY_OPACITY_NEAR = ([\d.]+)/.exec(layerSrc)[1]);
    const pri = Number(/PRIMARY_OPACITY = ([\d.]+)/.exec(layerSrc)[1]);
    return far < near && near <= pri;
  })());


  // ── Edge fade instead of abrupt clipping ──
  assert("labels fade toward the viewport edge", layerSrc.includes("const edgeFade = Math.max(0, Math.min(1, edgeDistance / EDGE_FADE_PX));"));
  assert("a fully faded label is dropped rather than drawn invisible",
    layerSrc.includes("if (labelOpacity < 0.06) return null;"));
}

// ── The Dark/Clear brightness control is gone ────────────────────────────────────────
{
  const screenSrc = fs.readFileSync(path.resolve(__dirname, "../src/features/sky-lens/SkyLensScreen.tsx"), "utf8");
  console.log("");

  // Sky Lens is a rendered planetarium, not a camera pass-through, so a "see through the
  // scene" dimmer had nothing to control. The whole affordance is removed, not just hidden.
  assert("no Slider is imported into Sky Lens", !screenSrc.includes("@react-native-community/slider"));
  assert("no Slider element is rendered", !/<Slider\b/.test(screenSrc));
  assert("the Dark and Clear labels are gone",
    !screenSrc.includes("☾ Dark") && !screenSrc.includes("☀ Clear"));
  assert("the brightness toggle button is gone",
    !screenSrc.includes('accessibilityLabel="Sky brightness"'));
  assert("its visibility state is gone", !screenSrc.includes("brightnessVisible"));
  assert("its thumb-position ref is gone", !screenSrc.includes("sliderValueRef"));
  assert("its animated scrim value is gone", !screenSrc.includes("scrimOpacity"));
  assert("its styles are gone",
    !screenSrc.includes("skySliderWrap") && !screenSrc.includes("skySliderLabel") &&
    !screenSrc.includes("skySlider:"));
  assert("its reserved layout height is gone", !screenSrc.includes("BRIGHTNESS_H"));

  // The DEFAULT APPEARANCE must not change. The slider's default thumb sat mid-track, which
  // produced a scrim opacity of 0.35; that exact value is now a constant.
  assert("the sky scrim is a fixed constant", screenSrc.includes("const SKY_SCRIM_OPACITY = 0.35;"));
  assert("the scrim still renders at that opacity",
    screenSrc.includes("opacity: SKY_SCRIM_OPACITY"));
  assert("the scrim keeps its original colour", screenSrc.includes('backgroundColor: "#030816"'));
  assert("the scrim is still non-interactive", (() => {
    const i = screenSrc.indexOf("opacity: SKY_SCRIM_OPACITY");
    return screenSrc.slice(i, i + 200).includes('pointerEvents="none"');
  })());

  // Nothing else in the bottom chrome may shift as a side effect.
  assert("dock height no longer reserves brightness space",
    /const dockHeight =\s*LAYER_BAR_HEIGHT \+\s*6 \+\s*\(scrubVisible && !selected \? SCRUB_H : 0\);/.test(screenSrc));
  assert("the time scrub bar is untouched", screenSrc.includes("const SCRUB_H = 71;"));
  assert("Lock Sky is still mounted", screenSrc.includes("skyOrientation.toggleLock()"));
  assert("layer controls are still mounted", screenSrc.includes("LAYER_BAR_HEIGHT"));
  assert("object cards still open", screenSrc.includes("setSelected(closest.obj)"));
  assert("safe-area spacing is still applied to the dock",
    screenSrc.includes("paddingBottom: insets.bottom + 6"));
}

// ── Label priority ladder ────────────────────────────────────────────────────────────
// The shared placer is first-come-first-served, so PRIORITY IS MOUNT ORDER in the canvas.
// These assertions pin that order, which is the only thing that actually decides which
// label wins a contested slot.
{
  const canvasSrc = fs.readFileSync(path.resolve(__dirname, "../src/features/sky-lens/SkyLensCanvas.tsx"), "utf8");
  const layerSrc = fs.readFileSync(path.resolve(__dirname, "../src/features/sky-lens/layers/ConstellationLayer.tsx"), "utf8");
  console.log("");

  const at = (needle) => canvasSrc.indexOf(needle);
  const moonReserve = at("placeLabel.reserveCircle(moonProj.x, moonProj.y");
  const planetLabels = at("<PlanetLayer");
  const primaryCon = at('bands={["primary"]}');
  const starLabels = at("<StarLayer stars={sky.stars}");
  const secondaryCon = at('bands={["secondary", "tertiary"]}');
  const zodiacLabels = canvasSrc.lastIndexOf("<ZodiacLayer");

  assert("the Moon's disc is reserved before ANY label is placed",
    moonReserve > 0 && moonReserve < planetLabels);
  assert("planet labels are claimed before constellation names",
    planetLabels > 0 && planetLabels < primaryCon);
  assert("primary constellation names outrank bright-star names",
    primaryCon > 0 && primaryCon < starLabels, `primary@${primaryCon} < stars@${starLabels}`);
  assert("bright-star names outrank SECONDARY constellation names",
    starLabels < secondaryCon, `stars@${starLabels} < secondary@${secondaryCon}`);
  assert("zodiac text is last in the ladder",
    zodiacLabels > secondaryCon, `zodiac@${zodiacLabels} > secondary@${secondaryCon}`);

  // Two mounts are what make the split possible — one pass cannot hold two priorities.
  assert("constellation names are mounted in two priority passes",
    (canvasSrc.match(/bands=\{\[/g) || []).length === 2);
  assert("the two passes cover every band without overlapping", (() => {
    const bands = [...canvasSrc.matchAll(/bands=\{\[([^\]]*)\]\}/g)].map((m) => m[1]);
    const all = bands.join(",").replace(/["\s]/g, "").split(",").filter(Boolean);
    return new Set(all).size === all.length &&
      ["primary", "secondary", "tertiary"].every((b) => all.includes(b));
  })());
  assert("a mount only draws its own bands",
    layerSrc.includes("if (bands && !bands.includes(band)) return null;"));

  // Clutter: Gemini sits beside Castor/Pollux, Canis Minor beside Procyon. Gemini is a
  // primary name (wins its slot); Canis Minor is secondary, so Procyon's name wins and
  // Canis Minor yields — which is the requested behaviour, not an accident.
  assert("Gemini is primary, so it wins against nearby bright stars", (() => {
    const block = /PRIMARY_CONSTELLATIONS = new Set\(\[([\s\S]*?)\]\)/.exec(layerSrc)[1];
    return block.includes('"gemini"');
  })());
  assert("Canis Minor is secondary, so Procyon's name outranks it", (() => {
    const block = /SECONDARY_CONSTELLATIONS = new Set\(\[([\s\S]*?)\]\)/.exec(layerSrc)[1];
    return block.includes('"canis-minor"');
  })());
  assert("a label with no clean slot is suppressed rather than overlapped",
    layerSrc.includes("if (!Number.isFinite(position.x)) return null;"));
}

// ── Long labels stay readable and attached ───────────────────────────────────────────
{
  const layout = requireTs(path.resolve(__dirname, "../src/features/sky-lens/labelLayout.ts"));
  const layerSrc = fs.readFileSync(path.resolve(__dirname, "../src/features/sky-lens/layers/ConstellationLayer.tsx"), "utf8");
  const BOX = { width: 430, height: 932 };
  const fontSize = Number(/PRIMARY_FONT_SIZE = ([\d.]+)/.exec(layerSrc)[1]);
  const tracking = Number(/LABEL_TRACKING = ([\d.]+)/.exec(layerSrc)[1]);
  const leash = Number(/MAX_LABEL_DETACHMENT_PX = (\d+)/.exec(layerSrc)[1]);
  console.log("");

  for (const text of ["LITTLE DIPPER", "CORONA BOREALIS", "BIG DIPPER", "SAGITTARIUS", "CANCER", "LIBRA"]) {
    const { w } = layout.labelBoxSize(text, fontSize, { weight: 800, letterSpacing: tracking });
    assert(`"${text}" fits within the viewport width`, w < BOX.width - 28,
      `${Math.round(w)}px of ${BOX.width - 28}px usable`);
  }
  // A centred label may only move vertically, so the leash must exceed a couple of line
  // heights or long names would be dropped the moment anything crowds them.
  assert("the detachment leash allows a few line-heights of nudge",
    leash > fontSize * 2, `leash ${leash}px vs line height ~${fontSize}px`);
  assert("type was not shrunk back down", fontSize >= 18, `${fontSize}px`);
  assert("the warm-gold fill is preserved", layerSrc.includes('CON_LABEL_GOLD = "#F0D9A0"'));
  assert("the dark halo is preserved", (layerSrc.match(/stroke="#03060E"/g) || []).length >= 3);
  assert("the heavier weight is preserved", /LABEL_WEIGHT = "800"/.test(layerSrc));
}

console.log("");
if (failed) {
  console.error(`Sky Lens projection self-test: ${failed} failure(s).`);
  process.exit(1);
}
console.log(
  "Sky Lens projection self-test passed: real ENU projectTarget verified (center, behind, FOV clip, roll, zenith, wraparound, divergence) + orientation + follow factors, zoom damping and the stillness freeze."
);
