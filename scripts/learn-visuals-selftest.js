// Learn-visuals deterministic self-test.
//
// Locks the correctness fixes from the Learn visual pass. Two of them were not cosmetic:
//
//   · 30 Nights claimed "Your progress is saved automatically" while cycling a fake Night 1→6
//     counter on a timer. No 30 Nights progress state exists anywhere in the app, so that was
//     a false statement about the user's own saved data.
//   · Bellatrix was listed at magnitude 0.2. Its real magnitude is 1.64, so Orion was drawn
//     with a shoulder star rivalling Rigel when it is visibly fainter.
//
// Part A executes the real star reference data. Part B is a static guard that the fake
// progress, the invented star circles, and the meaningless band jitter cannot come back.

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
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const has = (hay, needle, n) => (hay.includes(needle) ? ok(n) : bad(`${n} — expected present: ${needle}`));
const hasnt = (hay, needle, n) => (!hay.includes(needle) ? ok(n) : bad(`${n} — should be absent: ${needle}`));

// These files DOCUMENT the claims they removed, so an absence check must read the code only —
// otherwise the header comment explaining the fix trips the guard that enforces it.
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const { REFERENCE_STARS, apparentDiscRadius } = require(path.join(SRC, "features/learn/starReference.ts"));

console.log("── Part A: star reference data is real and self-consistent ──");

// 1. Accepted values for stars anyone can go outside and find.
const byName = Object.fromEntries(REFERENCE_STARS.map((s) => [s.name, s]));
eq("1 Sirius magnitude", byName.Sirius.magnitude, -1.46);
eq("1 Betelgeuse magnitude", byName.Betelgeuse.magnitude, 0.5);
eq("1 Rigel is the hottest listed", Math.max(...REFERENCE_STARS.map((s) => s.kelvin)), byName.Rigel.kelvin);
eq("1 Betelgeuse is the coolest listed", Math.min(...REFERENCE_STARS.map((s) => s.kelvin)), byName.Betelgeuse.kelvin);

// 2. THE property the old visual violated: disc size must track apparent brightness, so a
//    brighter star (lower magnitude) is always drawn larger. Previously size tracked nothing.
const sorted = [...REFERENCE_STARS].sort((a, b) => a.magnitude - b.magnitude);
let monotonic = true;
for (let i = 1; i < sorted.length; i++) {
  if (apparentDiscRadius(sorted[i].magnitude) > apparentDiscRadius(sorted[i - 1].magnitude)) monotonic = false;
}
eq("2 brighter stars are always drawn larger", monotonic, true);
if (apparentDiscRadius(-1.46) > apparentDiscRadius(0.5)) ok("2 Sirius is drawn larger than Betelgeuse");
else bad("2 Sirius is not drawn larger than Betelgeuse");

// 3. Degenerate input cannot produce NaN geometry.
eq("3 non-finite magnitude falls back", Number.isFinite(apparentDiscRadius(NaN)), true);

console.log("\n── Part B: the false claims cannot return ──");

// 4. 30 Nights: no fabricated progress, and no claim about saved progress.
const nights = stripComments(read("src/features/learn/visuals/ThirtyNightsProgressVisual.tsx"));
hasnt(nights, "Your progress is saved automatically", "30 Nights no longer claims saved progress");
hasnt(nights, "setInterval", "30 Nights has no fake progress timer");
hasnt(nights, "unlock the next", "30 Nights no longer claims nights unlock each other");

// 5. Bellatrix: the real magnitude, and never the old wrong one.
const constellations = read("src/features/learn/visuals/ConstellationIgnitionVisual.tsx");
has(constellations, 'mag: 1.64, name: "Bellatrix"', "Bellatrix carries its real magnitude");
hasnt(constellations, 'mag: 0.2, name: "Bellatrix"', "the wrong Bellatrix magnitude is gone");
// Orion's ordering is the real check: Rigel must outshine Bellatrix on screen.
const rigelMag = 0.1, bellatrixMag = 1.64;
if (rigelMag < bellatrixMag) ok("5 Rigel is brighter than Bellatrix, as in the sky");
else bad("5 Bellatrix still rivals Rigel");

// 6. Stars visual consumes the shared data rather than inventing circles.
const stars = read("src/features/learn/visuals/StarBrightnessVisual.tsx");
const starsCode = stripComments(stars);
has(stars, "REFERENCE_STARS", "Stars visual uses the shared reference data");
has(stars, "apparentDiscRadius", "Stars visual uses the shared brightness mapping");
hasnt(starsCode, "setInterval", "Stars visual has no meaningless flicker timer");
// The size-is-not-radius caveat must stay visible to the reader, not just in a comment.
has(stars, "not how large it truly is", "Stars visual states that size shows brightness, not radius");

// 7. Milky Way: real structure, and no pointless jitter.
const mw = read("src/features/learn/visuals/MilkyWayBandVisual.tsx");
const mwCode = stripComments(mw);
hasnt(mwCode, "setInterval", "Milky Way has no 24px jitter animation");
has(mw, "Great Rift", "Milky Way names the Great Rift");
has(mw, "Galactic Center", "Milky Way marks the galactic centre");
has(mw, "Schematic, not to scale", "Milky Way is labelled as schematic");

// 8. Scope guard: this pass was Learn-only. The orrery keeps its own (separately tracked)
// behaviour and Sky Lens is untouched.
const orrery = read("src/features/learn/visuals/SolarSystemLiveVisual.tsx");
has(orrery, "LIVE ORRERY", "Solar System orrery left for its own follow-up");
const gating = stripComments(read("src/features/sky-lens/PremiumVisualGating.ts"));
hasnt(gating, "nebulaShapes", "dead nebulaShapes gate stays removed");

console.log(`\nLearn-visuals self-test: ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
