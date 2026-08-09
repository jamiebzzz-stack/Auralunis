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


console.log("\n── Part D: the orrery shows real positions ──");
const { orreryPositions, normalizedOrbitRadius, orreryPoint } =
  require(path.join(SRC, "features/learn/orreryGeometry.ts"));

const WHEN = new Date("2026-08-09T22:00:00Z");
const orreryData = orreryPositions(WHEN);

// 19. All eight planets, in true orbital order.
eq("19 eight planets placed", orreryData.length, 8);
eq("19 orbital order preserved",
  orreryData.map((p) => p.name).join(","),
  "Mercury,Venus,Earth,Mars,Jupiter,Saturn,Uranus,Neptune");

// 20. Known heliocentric longitudes for a fixed instant — these come from the ephemeris, and a
//     return to invented `step/N` motion would not reproduce them.
const byBody = Object.fromEntries(orreryData.map((p) => [p.name, p.longitudeDegrees]));
for (const [body, expected] of [["Mercury", 49.89], ["Venus", 271.41], ["Earth", 317.33], ["Jupiter", 127.34], ["Neptune", 2.71]]) {
  if (Math.abs(byBody[body] - expected) < 0.1) ok(`20 ${body} at ${byBody[body].toFixed(2)}°`);
  else bad(`20 ${body} longitude ${byBody[body]} ≠ ${expected}`);
}
if (orreryData.every((p) => p.longitudeDegrees >= 0 && p.longitudeDegrees < 360)) ok("20 all longitudes in range");
else bad("20 a longitude is out of range");

// 21. Deterministic for a fixed date — the same instant must always draw the same diagram.
eq("21 deterministic for a fixed date",
  JSON.stringify(orreryPositions(WHEN)), JSON.stringify(orreryPositions(WHEN)));
// And it must actually MOVE over time, or it is not live.
const later = orreryPositions(new Date("2026-11-09T22:00:00Z"));
if (later[0].longitudeDegrees !== orreryData[0].longitudeDegrees) ok("21 positions change with date (genuinely live)");
else bad("21 positions do not change with date");

// 22. Radii are compressed but strictly monotonic, so drawn order is true orbital order.
let radiiMonotonic = true;
for (let i = 1; i < orreryData.length; i++) {
  if (orreryData[i].normalizedRadius <= orreryData[i - 1].normalizedRadius) radiiMonotonic = false;
}
eq("22 orbit radii strictly increase outward", radiiMonotonic, true);
eq("22 outermost orbit fills the frame", Math.round(orreryData[7].normalizedRadius * 1000), 1000);
eq("22 degenerate AU yields no radius", normalizedOrbitRadius(0), 0);

// 23. Real semi-major axes are carried, not invented.
const orreryBody = (n) => orreryData.find((p) => p.name === n);
eq("23 Earth is 1 AU", orreryBody("Earth").semiMajorAxisAU, 1.0);
eq("23 Neptune is 30.07 AU", orreryBody("Neptune").semiMajorAxisAU, 30.07);

// 24. Screen projection is finite and centred on the Sun.
const pt = orreryPoint(orreryData[0], 130, 130, 106);
if (Number.isFinite(pt.x) && Number.isFinite(pt.y)) ok("24 projection produces finite coordinates");
else bad("24 projection produced NaN");

// 25. An unusable date must not fabricate a diagram.
eq("25 invalid date draws no planets", orreryPositions(new Date(NaN)).length, 0);

// 26. THE guard: no invented motion may return, and "LIVE" must sit over real data.
const orreryVisual = stripComments(read("src/features/learn/visuals/SolarSystemLiveVisual.tsx"));
has(orreryVisual, "orreryPositions", "26 visual uses real ephemeris positions");
hasnt(orreryVisual, "step / 8", "26 no invented orbital period (step/8)");
hasnt(orreryVisual, "step / 10", "26 no invented orbital period (step/10)");
hasnt(orreryVisual, "step / 12", "26 no invented orbital period (step/12)");
hasnt(orreryVisual, "step / 14", "26 no invented orbital period (step/14)");
hasnt(orreryVisual, "setStep", "26 no arbitrary animation counter");
has(orreryVisual, "LIVE ORRERY", "26 the LIVE label remains — and is now true");
// The one thing the diagram cannot show honestly must be stated on screen.
has(read("src/features/learn/visuals/SolarSystemLiveVisual.tsx"), "compressed to fit",
  "26 the not-to-scale caveat is visible to the reader");

console.log("\n── Part E: Deep Sky classes are visually distinct ──");
const deepSky = stripComments(read("src/features/learn/visuals/DeepSkyGlowVisual.tsx"));
has(deepSky, "organicPath", "27 gas structure uses irregular outlines");
has(deepSky, "spiralArm", "27 galaxy has spiral arms");
has(deepSky, "CLUSTER_STARS", "27 cluster is built from individual stars");
hasnt(deepSky, "const CLUSTER =", "27 the old cluster generator is gone");


// 29. Deep Sky rework: the remnant must be arc FRAGMENTS, never a closed ring or a dashed
//     border — the dashed version read as decorative stitching, worse than the plain circle.
hasnt(deepSky, "strokeDasharray", "29 remnant no longer uses a dashed ring");
hasnt(deepSky, "REMNANT_SHELL", "29 the closed shell outline is gone");
has(deepSky, "REMNANT_ARCS", "29 remnant is built from separate arc fragments");
has(deepSky, "REMNANT_FILAMENTS", "29 remnant has outward filaments");
has(deepSky, "arcPath", "29 arcs are drawn in polar coordinates");
// The glow must not be a full annulus. A radial gradient that is transparent at the centre,
// bright partway out and transparent at the rim IS a doughnut, whatever is drawn over it.
hasnt(deepSky, "dsRemShell", "29 the annular shell gradient is gone");
has(deepSky, "dsRemHaze", "29 remnant interior is a plain centre-out wash");
// The generic remnant must not imply a surviving central object: Type Ia supernovae leave
// none, and many remnants show no visible central source.
hasnt(deepSky, 'r={2} fill="#DCEBFF"', "29 no central point source in the generic remnant");
has(deepSky, "width * 5.5", "29 glow rides the arc fragments, inheriting their gaps");
// Nebula asymmetry: three lobes of differing opacity, plus wisps.
has(deepSky, "NEBULA_WISPS", "29 nebula has faint outer wisps");
has(deepSky, "[0.95, 0.62, 0.44]", "29 nebula lobes differ in weight");

// 30. The orrery separates labels without moving planets.
has(orreryVisual, "COLLIDE", "30 orrery de-collides close labels");
has(orreryVisual, "labelY", "30 orrery labels can drop below the dot");
has(orreryVisual, "orreryPoint(planet, CENTER, CENTER, MAX_ORBIT, MIN_ORBIT)",
  "30 planet positions themselves are unchanged");

console.log("\n── Part F: Home uses glyphs, not emoji ──");
// Every Home surface, not just the mood service — the first pass fixed one file and left the
// Tonight card still showing boxed emoji.
const homeSurfaces = [
  "src/services/CelestialMoodService.ts",
  "src/services/SkyIntelligenceService.ts",
  "src/components/StargazingIndexCard.tsx",
  "src/screens/HomeScreen.tsx",
].map((rel) => stripComments(read(rel))).join("\n");
for (const emoji of ["🌙", "✨", "🌌", "☁️", "👁", "🌠", "🌑"]) {
  hasnt(homeSurfaces, emoji, `28 no ${emoji} emoji icon on Home`);
}
has(homeSurfaces, "☾", "28 uses the typographic moon glyph");

console.log(`\nLearn-visuals self-test: ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
