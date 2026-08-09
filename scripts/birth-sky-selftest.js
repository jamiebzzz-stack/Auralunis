// Birth Sky deterministic self-test.
//
// The defect this locks out: BirthPlanet.constellation was typed "which constellation it was
// in" and then assigned EVERY planet the same month-indexed lookup — invented data shown to
// the reader as measurement. Alongside it, dominantConstellation came from the same table and
// seasonalSky hardcoded northern-hemisphere seasons, so a June birth in Sydney was reported as
// a summer sky when it was midwinter there.
//
// Part A executes the real ephemeris at fixed instants. Part B is a static guard that neither
// the lookup tables nor the "exact" overclaim can return.

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
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const { computeBirthSky } = require(path.join(SRC, "services/BirthSkyService.ts"));

const ORLANDO = { latitudeDegrees: 28.54, longitudeDegrees: -81.38 };
const SYDNEY = { latitudeDegrees: -33.87, longitudeDegrees: 151.21 };
const MOMENT = "1990-06-15T14:30:00Z";

console.log("── Part A: every value is measured for the birth moment ──");

const orlando = computeBirthSky(MOMENT, ORLANDO, "Orlando");

// 1. THE fix. Planets must carry their OWN constellations, not one shared placeholder.
const constellations = orlando.planets.map((p) => p.constellation);
if (constellations.every((c) => c && c.length > 0)) ok("1 every planet has a constellation");
else bad(`1 a planet has no constellation: ${JSON.stringify(constellations)}`);
const distinct = new Set(constellations).size;
if (distinct > 1) ok(`1 planets occupy ${distinct} different constellations, not one shared value`);
else bad("1 every planet shares one constellation — the fabricated lookup is back");

// 2. Spot-check against the real 1990 sky: the outer planets were clustered in Sagittarius,
//    and Jupiter was in Gemini. A month-indexed table could not produce this.
const byName = Object.fromEntries(orlando.planets.map((p) => [p.name, p]));
eq("2 Jupiter was in Gemini", byName.Jupiter.constellation, "Gemini");
eq("2 Saturn was in Sagittarius", byName.Saturn.constellation, "Sagittarius");
eq("2 Neptune was in Sagittarius", byName.Neptune.constellation, "Sagittarius");

// 3. Horizon state must agree with the reported altitude — no independent "visible" flag.
const agree = orlando.planets.every((p) => p.visible === p.altitude > 0);
eq("3 visible flag matches altitude everywhere", agree, true);
eq("3 status is 'below' exactly when not visible",
  orlando.planets.every((p) => (p.status === "below") === !p.visible), true);

// 4. Hour angle sign convention: east of the meridian (still climbing) is negative.
const climbing = orlando.planets.filter((p) => p.status === "rising");
eq("4 every rising planet has a negative hour angle",
  climbing.every((p) => p.hourAngleHours < 0), true);
eq("4 hour angles stay within ±12h",
  orlando.planets.every((p) => p.hourAngleHours >= -12 && p.hourAngleHours <= 12), true);

// 5. Light state must follow the Sun's actual altitude, not a clock.
eq("5 Orlando mid-afternoon is daylight", orlando.lightState, "Daylight");
if (orlando.sunAltitude > 0) ok(`5 Sun was above the horizon (${orlando.sunAltitude}°)`);
else bad(`5 Sun altitude disagrees with daylight: ${orlando.sunAltitude}`);

// 6. THE hemisphere fix: the same instant is a different season and a different sky in Sydney.
const sydney = computeBirthSky(MOMENT, SYDNEY, "Sydney");
eq("6 June is summer in the north", orlando.seasonalSky, "summer");
eq("6 June is winter in the south", sydney.seasonalSky, "winter");
if (sydney.lightState !== orlando.lightState) ok(`6 same instant, different light state (${orlando.lightState} vs ${sydney.lightState})`);
else bad("6 light state ignores longitude");

// 7. Local sidereal time is a real clock value and depends on longitude.
if (orlando.localSiderealTimeHours >= 0 && orlando.localSiderealTimeHours < 24) ok("7 LST within 0–24h");
else bad(`7 LST out of range: ${orlando.localSiderealTimeHours}`);
if (Math.abs(orlando.localSiderealTimeHours - sydney.localSiderealTimeHours) > 0.1) ok("7 LST differs by longitude");
else bad("7 LST does not depend on longitude");

// 8. Moon constellation is measured, and the two sites agree — the Moon is in one place.
eq("8 Moon constellation is measured, not a month lookup",
  orlando.dominantConstellation, sydney.dominantConstellation);
if (orlando.dominantConstellation && orlando.dominantConstellation !== "—") ok(`8 Moon was in ${orlando.dominantConstellation}`);
else bad("8 Moon constellation missing");

// 9. An unparseable date must be REFUSED with a clear, identifiable error — never allowed to
//    reach the ephemeris (obscure crash) and never silently substituted (a confident chart of
//    the wrong sky, which is worse than an error).
let message = "";
try { computeBirthSky("not-a-date", ORLANDO, "X"); } catch (e) { message = String(e.message || e); }
eq("9 an invalid birth date is refused with a clear error", message, "INVALID_BIRTH_DATE");
// A valid date must still compute, so the guard cannot be over-broad.
let validWorks = true;
try { computeBirthSky(MOMENT, ORLANDO, "Orlando"); } catch { validWorks = false; }
eq("9 a valid birth date still computes", validWorks, true);

console.log("\n── Part B: the fabricated data cannot return ──");
const svc = read("src/services/BirthSkyService.ts");
const svcCode = stripComments(svc);

hasnt(svcCode, "CONSTELLATIONS_BY_MONTH", "month-indexed constellation table is gone");
hasnt(svcCode, "constellation: dominantConstellation", "planets no longer share one constellation");
hasnt(svcCode, "// simplified", "the 'simplified' placeholder is gone");
hasnt(svcCode, "Summer Triangle", "hardcoded northern-hemisphere season strings are gone");
hasnt(svc, "exact celestial configuration", "the 'exact' overclaim is gone from the header");
has(svcCode, "Constellation(eq.ra, eq.dec)", "constellations come from the ephemeris");
has(svcCode, "false, true", "Constellation is fed J2000 coordinates, per its contract");
has(svcCode, "latitudeDegrees >= 0", "season is derived from the birthplace hemisphere");

// Preserved behaviour: the parts that were already good must survive untouched.
has(svcCode, "SiderealTime(", "true ascendant still uses sidereal time");
has(svcCode, "Math.tan(phi)", "ascendant still depends on latitude");
has(svcCode, "computePlanetaryTargets(location, birthDate)", "planet positions still computed at the birth moment");

console.log(`\nBirth Sky self-test: ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
