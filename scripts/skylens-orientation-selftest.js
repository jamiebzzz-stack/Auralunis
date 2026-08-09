// Sky Lens orientation-filter self-test.
//
// Locks the Stage 1 contract: the response of the orientation filter is a function of REAL
// TIME, not of the sensor cadence. The previous implementation smoothed by a fixed 0.16 slerp
// per sample at 80 ms, which made the feel a hidden function of the interval — measured at a
// 459 ms time constant and 1375 ms settle, i.e. a 20.6 deg lag at a 45 deg/s pan.
//
// Part A executes the pure helpers. Part B is a static guard that no per-sample constant
// creeps back in, and that this patch stayed inside its approved blast radius: the projection,
// the camera basis, and Lock/drag were measured as NOT implicated and must not be touched here.

const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");

// ── transpile-require: load node-safe .ts as CommonJS, resolve "@/…" → src/… ──
const ts = require(path.join(ROOT, "node_modules/typescript"));
const Module = require("module");
require.extensions[".ts"] = function (module, filename) {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
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

let pass = 0, fail = 0;
const ok = (m) => { pass += 1; console.log("PASS " + m); };
const bad = (m) => { fail += 1; console.log("FAIL " + m); };
const eq = (n, a, b) => (a === b ? ok(n) : bad(`${n} — got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`));
const near = (n, a, b, tol) =>
  Math.abs(a - b) <= tol ? ok(`${n} (${a.toFixed(1)} ≈ ${b.toFixed(1)})`) : bad(`${n} — got ${a.toFixed(3)} expected ${b.toFixed(3)} ±${tol}`);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const has = (hay, needle, n) => (hay.includes(needle) ? ok(n) : bad(`${n} — expected present: ${needle}`));
const hasnt = (hay, needle, n) => (!hay.includes(needle) ? ok(n) : bad(`${n} — should be absent: ${needle}`));

const HOOK_REL = "src/features/sky-lens/ar/useQuaternionPointing.ts";
const FILTER_REL = "src/features/sky-lens/ar/orientationFilter.ts";
// The filter rules live in a React-free module precisely so they can be executed here.
const {
  smoothingFactor,
  resolveDeltaMs,
  angularRateDegreesPerSecond,
  RESPONSE_TIME_CONSTANT_MS,
  UPDATE_INTERVAL_MS
} = require(path.join(SRC, "features/sky-lens/ar/orientationFilter.ts"));

const TAU = RESPONSE_TIME_CONSTANT_MS;

console.log("── Part A: the filter responds in real time, not in samples ──");

// 1. Exactness: one time constant closes 63.2% of the gap, by definition.
near("1 one tau closes 63.2%", smoothingFactor(TAU, TAU) * 100, 63.2, 0.1);

// 2. THE core property. Simulate a step input at three very different cadences and measure how
//    long the filter takes to cover 63% / 95%. All three must agree, or the sensor interval is
//    still secretly setting the feel.
function settleMs(intervalMs, targetFraction) {
  let value = 0; // 0 → 1 step response
  let elapsed = 0;
  for (let i = 0; i < 100000; i++) {
    value += (1 - value) * smoothingFactor(intervalMs, TAU);
    elapsed += intervalMs;
    if (value >= targetFraction) return elapsed;
  }
  return Infinity;
}
for (const frac of [0.632, 0.95]) {
  const at16 = settleMs(16, frac);
  const at40 = settleMs(40, frac);
  const at80 = settleMs(80, frac);
  const spread = Math.max(at16, at40, at80) - Math.min(at16, at40, at80);
  // Spread is bounded by one sample of the coarsest cadence — i.e. quantisation only.
  if (spread <= 80) ok(`2 ${(frac * 100).toFixed(0)}% settle is cadence-independent (16/40/80ms → ${at16}/${at40}/${at80}ms)`);
  else bad(`2 ${(frac * 100).toFixed(0)}% settle varies with cadence: ${at16}/${at40}/${at80}ms`);
}

// 3. The response must actually be the ~120 ms we asked for, and must be a large improvement
//    on the 459 ms that was measured on device.
const measured63 = settleMs(16, 0.632);
if (measured63 <= 160) ok(`3 63% response is ${measured63}ms (target ~${TAU}ms, was 459ms)`);
else bad(`3 63% response too slow: ${measured63}ms`);

// 4. Resulting pan lag. At 45 deg/s the old filter trailed 20.6 deg (~148 px). Assert the new
//    steady-state lag is far smaller — this is the actual user-visible symptom.
const lagDeg = (TAU / 1000) * 45;
if (lagDeg < 7) ok(`4 lag at 45 deg/s pan is ${lagDeg.toFixed(1)} deg (was 20.6 deg)`);
else bad(`4 lag at 45 deg/s pan still ${lagDeg.toFixed(1)} deg`);

// 5. Degenerate inputs must not produce a filter that jumps or stalls.
eq("5 zero dt → no partial step", smoothingFactor(0, TAU), 1);
eq("5 negative dt → no partial step", smoothingFactor(-5, TAU), 1);
eq("5 zero tau → snap to live", smoothingFactor(16, 0), 1);
if (smoothingFactor(16, TAU) > 0 && smoothingFactor(16, TAU) < 1) ok("5 normal dt → strictly partial step");
else bad("5 normal dt did not produce a partial step");

// 6. Reported interval is trusted only when sane; wild values are clamped, never used raw.
eq("6 sane interval trusted", resolveDeltaMs(16, 16), 16);
eq("6 undefined interval → fallback", resolveDeltaMs(undefined, 16), 16);
eq("6 zero interval → fallback", resolveDeltaMs(0, 16), 16);
eq("6 negative interval → fallback", resolveDeltaMs(-40, 16), 16);
eq("6 NaN interval → fallback", resolveDeltaMs(NaN, 16), 16);
eq("6 stalled-thread interval clamped", resolveDeltaMs(9000, 16), 250);
if (resolveDeltaMs(9000, 16) < 9000) ok("6 a stalled thread cannot snap the sky");
else bad("6 stalled-thread interval reached the filter unclamped");

console.log("\n── Part B: no per-sample constant, and no scope creep ──");
const hook = read(HOOK_REL);
const filter = read(FILTER_REL);

// The named constants must be time- or rate-expressed. A bare per-sample smoothing constant
// is exactly the defect this replaced.
has(filter, "RESPONSE_TIME_CONSTANT_MS", "filter is specified as a time constant");
has(filter, "STILL_THRESHOLD_DEGREES_PER_SECOND", "stillness gate is expressed in deg/s");
has(filter, "STILL_CONFIRM_MS", "stillness confirmation is a duration");
has(filter, "MAX_PLAUSIBLE_RATE_DEGREES_PER_SECOND", "plausibility gate is expressed in deg/s");
hasnt(hook + filter, "const SMOOTHING =", "no fixed per-sample smoothing constant");
hasnt(hook + filter, "STILL_THRESHOLD_DEGREES =", "no per-sample stillness threshold");
hasnt(hook + filter, "STILL_CONFIRM_SAMPLES", "no sample-count stillness confirmation");
hasnt(hook + filter, "MAX_PLAUSIBLE_STEP_DEGREES", "no per-sample plausibility threshold");
has(hook, "resolveDeltaMs(motion?.interval", "real elapsed time drives the filter");

// Scope guard. Stage 1 was approved as a filter change ONLY: the projection measured 0.1%
// shape variation at 25 deg off-axis and Lock was confirmed working on device, so neither is
// implicated. If a later change needs them, update this test deliberately.
const orientation = read("src/features/sky-lens/ar/useSkyOrientation.ts");
has(orientation, "UNLOCK_BLEND_MS = 450", "unlock blend unchanged");
has(orientation, "DRAG_DEGREES_PER_POINT = 0.12", "drag sensitivity unchanged");
const projection = read("src/features/sky-lens/ar/SkyLensProjection.ts");
has(projection, "horizontalDegrees: 60", "projection FOV unchanged");
has(projection, "effectiveVerticalHalfFov", "derived vertical FOV still shared-scale");

console.log(`\nSky Lens orientation self-test: ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
