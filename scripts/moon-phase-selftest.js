// Moon-phase deterministic self-test.
//
// The Learn "LIVE MOON PHASE" card used to cycle eight hardcoded phase names every 900 ms with
// a fixed illumination array, while claiming to show the current phase for the reader's date
// and location. This test locks the replacement: the state comes from astronomy-engine, and the
// disc geometry is a continuous function of that state rather than a lookup of static images.
//
// Part A executes the real ephemeris across a full lunation. Part B checks the pure disc
// geometry against phases whose shape is known by definition. Part C is a static guard that the
// fake demo cannot return, and that this task stayed out of Sky Lens.

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
  Math.abs(a - b) <= tol ? ok(`${n} (${a.toFixed(2)} ≈ ${b.toFixed(2)})`) : bad(`${n} — got ${a} expected ${b} ±${tol}`);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const has = (hay, needle, n) => (hay.includes(needle) ? ok(n) : bad(`${n} — expected present: ${needle}`));
const hasnt = (hay, needle, n) => (!hay.includes(needle) ? ok(n) : bad(`${n} — should be absent: ${needle}`));

const { lunarState, moonDiscGeometry, moonLitRegionPath, moonPhaseName } =
  require(path.join(SRC, "services/MoonPhase.ts"));

console.log("── Part A: state comes from real ephemeris ──");

// Walk a full synodic month at 2-hour steps from a fixed epoch, so the test is deterministic.
const EPOCH = new Date("2026-01-01T00:00:00Z");
const STEP_HOURS = 2;
const STEPS = (30 * 24) / STEP_HOURS;
const samples = [];
for (let i = 0; i < STEPS; i++) {
  samples.push(lunarState(new Date(EPOCH.getTime() + i * STEP_HOURS * 3600_000)));
}

// 1. A real lunation must actually reach both extremes within 30 days.
const maxIll = Math.max(...samples.map((s) => s.illuminationPercent));
const minIll = Math.min(...samples.map((s) => s.illuminationPercent));
if (maxIll > 99) ok(`1 reaches full moon (max ${maxIll.toFixed(1)}%)`); else bad(`1 never reaches full: ${maxIll}`);
if (minIll < 1) ok(`1 reaches new moon (min ${minIll.toFixed(1)}%)`); else bad(`1 never reaches new: ${minIll}`);

// 2. Independent cross-check. phase_fraction and the elongation are two separate calls; if the
//    helper ever paired a fraction with a mismatched direction, this diverges.
let worstDelta = 0;
for (const s of samples) {
  const fromAngle = ((1 - Math.cos((s.phaseAngleDegrees * Math.PI) / 180)) / 2) * 100;
  worstDelta = Math.max(worstDelta, Math.abs(fromAngle - s.illuminationPercent));
}
if (worstDelta < 2.5) ok(`2 illumination agrees with phase angle (worst ${worstDelta.toFixed(2)}%)`);
else bad(`2 illumination disagrees with phase angle by ${worstDelta.toFixed(2)}%`);

// 3. Direction must match what the illumination is actually doing, not be asserted separately.
let wrongDirection = 0;
for (let i = 1; i < samples.length; i++) {
  const rising = samples[i].illuminationPercent > samples[i - 1].illuminationPercent;
  // Skip the two turning points, where a 2-hour step straddles the extreme.
  const nearTurn = samples[i].illuminationPercent > 99.5 || samples[i].illuminationPercent < 0.5;
  if (!nearTurn && rising !== samples[i].isWaxing) wrongDirection += 1;
}
eq("3 waxing flag matches the illumination trend at every step", wrongDirection, 0);

// 4. Elongation stays in range and the name matches the shared namer.
const inRange = samples.every((s) => s.phaseAngleDegrees >= 0 && s.phaseAngleDegrees < 360);
eq("4 phase angle within 0–360", inRange, true);
const namesAgree = samples.every((s) => s.name === moonPhaseName(s.illuminationPercent, s.isWaxing));
eq("4 name matches the shared moonPhaseName", namesAgree, true);

// 5. Degrades rather than throwing on an unusable date.
const bogus = lunarState(new Date(NaN));
eq("5 invalid date degrades to new moon", bogus.illuminationPercent, 0);
eq("5 invalid date still names a phase", typeof bogus.name, "string");

console.log("\n── Part B: disc geometry is continuous, not a lookup ──");
const R = 100;

// 6. Terminator width by definition: full disc at new and full, zero at the quarters.
near("6 new moon terminator = radius", moonDiscGeometry(R, 0, true).terminatorRadius, R, 0.001);
near("6 full moon terminator = radius", moonDiscGeometry(R, 100, false).terminatorRadius, R, 0.001);
near("6 first quarter terminator = 0", moonDiscGeometry(R, 50, true).terminatorRadius, 0, 0.001);
near("6 25% terminator = half radius", moonDiscGeometry(R, 25, true).terminatorRadius, R / 2, 0.001);
near("6 75% terminator = half radius", moonDiscGeometry(R, 75, false).terminatorRadius, R / 2, 0.001);

// 7. Crescent vs gibbous decides which way the terminator bows.
eq("7 under half lit is a crescent", moonDiscGeometry(R, 30, true).crescent, true);
eq("7 over half lit is gibbous", moonDiscGeometry(R, 70, true).crescent, false);

// 8. THE mirror-image case. A 30% waxing and a 30% waning crescent are different shapes; the
//    previous renderer drew both identically because it never knew the direction.
eq("8 waxing lights the right limb", moonDiscGeometry(R, 30, true).litOnRight, true);
eq("8 waning lights the left limb", moonDiscGeometry(R, 30, false).litOnRight, false);
const waxPath = moonLitRegionPath(R, R, R, 30, true);
const wanePath = moonLitRegionPath(R, R, R, 30, false);
if (waxPath !== wanePath) ok("8 waxing and waning crescents render different paths");
else bad("8 waxing and waning crescents render identically");

// 9. Continuity: no jump between adjacent illuminations, which a static-image lookup would show.
let maxJump = 0;
for (let p = 0; p < 100; p += 0.5) {
  const a = moonDiscGeometry(R, p, true).terminatorRadius;
  const b = moonDiscGeometry(R, p + 0.5, true).terminatorRadius;
  maxJump = Math.max(maxJump, Math.abs(a - b));
}
if (maxJump <= 1.01) ok(`9 terminator moves continuously (max step ${maxJump.toFixed(2)}px per 0.5%)`);
else bad(`9 terminator jumps ${maxJump}px`);

// 10. Paths are well-formed and degenerate inputs cannot produce NaN in the SVG.
for (const [label, p, wax] of [["new", 0, true], ["crescent", 18, true], ["quarter", 50, true], ["gibbous", 80, false], ["full", 100, false]]) {
  const d = moonLitRegionPath(R, R, R, p, wax);
  if (/NaN|undefined/.test(d)) bad(`10 ${label} path contains NaN/undefined`);
  else if (!/^M .* A .* A .* Z$/.test(d)) bad(`10 ${label} path is malformed: ${d}`);
  else ok(`10 ${label} path is well-formed`);
}
const degenerate = moonLitRegionPath(R, R, 0, 50, true);
if (!/NaN/.test(degenerate)) ok("10 zero radius does not produce NaN"); else bad("10 zero radius produced NaN");

console.log("\n── Part C: the demo cannot come back, and Sky Lens is untouched ──");
const visual = read("src/features/learn/visuals/MoonPhaseLiveVisual.tsx");
const disc = read("src/features/learn/visuals/MoonDisc.tsx");

has(visual, "lunarState", "card reads the live lunar state");
has(visual, "MoonDisc", "card renders the real disc");
hasnt(visual, "const PHASES = [", "no hardcoded phase-name list");
hasnt(visual, "[2, 18, 50, 74, 100, 76, 50, 20]", "no hardcoded illumination array");
hasnt(visual, "(i + 1) % PHASES.length", "no demo phase cycling");
has(disc, "moonLitRegionPath", "disc geometry comes from the shared helper");
hasnt(disc, "require(", "no static phase image lookup");

// Scope guard: this task was explicitly approved as Learn-only. MoonLayer keeps its own
// (separately tracked) behaviour and must not be edited here.
const moonLayer = read("src/features/sky-lens/layers/MoonLayer.tsx");
has(moonLayer, "const shadowCx = p.x + f * 2 * R", "Sky Lens MoonLayer left untouched");

console.log(`\nMoon-phase self-test: ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
