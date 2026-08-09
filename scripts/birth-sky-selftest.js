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


console.log("\n── Part C: explanations are derived, and symbolism stays separate ──");
const {
  buildExplanationCards,
  buildSkyStory,
  directionFor,
} = require(path.join(SRC, "features/birthsky/birthSkyExplanations.ts"));

const cards = buildExplanationCards(orlando, true);
const cardBlob = cards.map((c) => `${c.title} ${c.summary} ${c.body.join(" ")}`).join(" ");

// 10. Cards must carry THIS chart's values, not generic prose.
if (cards.length >= 7) ok(`10 ${cards.length} explanation cards generated`);
else bad(`10 too few explanation cards: ${cards.length}`);
has(cardBlob, orlando.sunSign, "10 explanation names the computed Sun sign");
has(cardBlob, orlando.dominantConstellation, "10 explanation names the Moon's measured constellation");
has(cardBlob, orlando.risingSign, "10 explanation names the computed ascendant");
has(cardBlob, String(orlando.moonIllumination), "10 explanation quotes the computed illumination");
has(cardBlob, orlando.lightState.toLowerCase(), "10 explanation reflects the computed light state");
if (cards.every((c) => c.body.length > 0)) ok("10 every card has body text");
else bad("10 a card has no body text");

// 11. Derived, not canned: a different birthplace must yield different explanation text.
const sydneyCards = buildExplanationCards(sydney, true);
const sydneyBlob = sydneyCards.map((c) => c.body.join(" ")).join(" ");
if (sydneyBlob !== cardBlob) ok("11 explanations differ by birthplace (derived, not canned)");
else bad("11 explanations are identical for different birthplaces");
has(sydneyBlob, "winter", "11 southern-hemisphere card says winter");

// 12. The ascendant card must disclose an assumed birth time.
const approx = buildExplanationCards(orlando, false);
const ascApprox = approx.find((c) => c.id === "ascendant");
has(ascApprox.body.join(" "), "local noon", "12 unknown birth time is disclosed on the ascendant card");
const ascExact = cards.find((c) => c.id === "ascendant");
hasnt(ascExact.body.join(" "), "local noon", "12 an exact time does not claim noon was used");

// 13. One card per visible planet, each with its own measured constellation.
const planetCards = cards.filter((c) => c.id.startsWith("planet-"));
eq("13 one card per above-horizon planet", planetCards.length, orlando.planets.filter((p) => p.visible).length);

// 14. THE separation rule. Astrology vocabulary must not appear in the measured sections.
const ASTROLOGY_WORDS = /personality|destiny|fate|your future|horoscope|soul/i;
if (!ASTROLOGY_WORDS.test(cardBlob)) ok("14 explanation cards contain no astrological claims");
else bad(`14 astrological language leaked into the measured cards: ${cardBlob.match(ASTROLOGY_WORDS)}`);
const story = buildSkyStory(orlando, true).join(" ");
if (!ASTROLOGY_WORDS.test(story)) ok("14 the sky story stays astronomical");
else bad("14 astrological language leaked into the sky story");


// 16. The story is real prose built from the values.
const paragraphs = buildSkyStory(orlando, true);
if (paragraphs.length >= 2) ok(`16 sky story has ${paragraphs.length} paragraphs`);
else bad("16 sky story is too thin");
has(story, orlando.locationName, "16 story names the birthplace");

// 17. Direction helper maps azimuth to compass words.
eq("17 azimuth 0 is north", directionFor(0), "north");
eq("17 azimuth 90 is east", directionFor(90), "east");
eq("17 azimuth 180 is south", directionFor(180), "south");
eq("17 azimuth 270 is west", directionFor(270), "west");

// 18. The screen must render the symbolic section under its own heading, separated.
const screen = read("src/screens/BirthSkyScreen.tsx");
has(screen, "YOUR BIRTH SKY EXPLAINED", "18 explained section is rendered");
has(screen, "YOUR SKY STORY", "18 sky story section is rendered");
has(screen, "YOUR ASTROLOGICAL INTERPRETATION", "18 astrology section has its own heading");
has(screen, "ASTROLOGY_DISCLOSURE", "18 astrology section carries the symbolic-not-scientific disclosure");


console.log("\n── Part D: tropical zodiac is separate from IAU constellation ──");
const Z = require(path.join(SRC, "features/birthsky/tropicalZodiac.ts"));
const A = require(path.join(SRC, "features/birthsky/astrologyInterpretation.ts"));

// 19. Sign boundaries are exact 30 degree buckets from the equinox point.
eq("19 0deg is Aries", Z.signFromLongitude(0).name, "Aries");
eq("19 29.99deg is still Aries", Z.signFromLongitude(29.99).name, "Aries");
eq("19 30deg is Taurus", Z.signFromLongitude(30).name, "Taurus");
eq("19 359.9deg is Pisces", Z.signFromLongitude(359.9).name, "Pisces");
eq("19 wraps past 360", Z.signFromLongitude(361).name, "Aries");
eq("19 handles negative longitude", Z.signFromLongitude(-1).name, "Pisces");
eq("19 twelve signs exactly", Z.ZODIAC_SIGNS.length, 12);

// 20. Known fixed-date placements, from geocentric ecliptic longitude.
const MOMENT_UTC = new Date("1990-06-15T18:30:00Z");
for (const [body, expected] of [["Sun","Gemini"],["Moon","Pisces"],["Mars","Aries"],["Jupiter","Cancer"],["Saturn","Capricorn"],["Pluto","Scorpio"]]) {
  eq(`20 ${body} tropical sign`, Z.tropicalSignFor(body, MOMENT_UTC).name, expected);
}

// 21. Pluto is covered — it has no az/alt entry but does have a tropical placement.
const utc = computeBirthSky("1990-06-15T18:30:00Z", ORLANDO, "Orlando");
has(Object.keys(utc.zodiacPlacements).join(","), "Pluto", "21 Pluto has a placement");
eq("21 all ten bodies placed", Object.keys(utc.zodiacPlacements).length, 10);

// 22. THE separation. constellation and zodiacSign are different fields and usually differ.
const differing = utc.planets.filter((p) => p.constellation && p.zodiacSign && p.constellation !== p.zodiacSign);
if (differing.length >= 5) ok(`22 ${differing.length} planets differ between constellation and sign`);
else bad(`22 frames suspiciously similar: only ${differing.length} differ`);
const mars = utc.planets.find((p) => p.name === "Mars");
eq("22 Mars constellation is Cetus", mars.constellation, "Cetus");
eq("22 Mars zodiac sign is Aries, not Cetus", mars.zodiacSign, "Aries");

// 23. Mars/Cetus can never become an interpretation — Cetus is not a sign.
eq("23 no reading exists for Cetus", A.readingFor("Mars", "Cetus"), null);
const allSigns = Z.ZODIAC_SIGNS.map((s) => s.name);
if (!allSigns.includes("Cetus") && !allSigns.includes("Ophiuchus")) ok("23 constellations are not in the sign list");
else bad("23 a constellation leaked into the zodiac sign list");

// 24. The Sun uses the SAME machinery as the planets, so they cannot disagree.
eq("24 sunSign matches the tropical placements map", utc.sunSign, utc.zodiacPlacements.Sun);
hasnt(stripComments(read("src/services/BirthSkyService.ts")), "0.9856474", "24 hand-rolled solar formula is gone");

// 25. Every group and reading is generated from the actual placements.
const groups = A.buildInterpretationGroups(utc.zodiacPlacements, utc.risingSign);
eq("25 four reading groups", groups.length, 4);
const readings = groups.flatMap((g) => g.readings);
eq("25 eleven placements read", readings.length, 11);
if (readings.every((r) => r.body.length >= 3)) ok("25 every reading has at least three paragraphs");
else bad("25 a reading is too thin");
has(readings.map((r) => r.title).join(" | "), `Sun in ${utc.zodiacPlacements.Sun}`, "25 Sun reading names the computed sign");
has(readings.map((r) => r.title).join(" | "), `${utc.risingSign} Rising`, "25 rising reading uses the computed ascendant");

// 26. Tone: attributed to tradition, never deterministic about the person.
const prose = readings.flatMap((r) => r.body).join(" ");
if (!/\byou will\b|\byou are destined\b|\byour destiny\b|guarantees/i.test(prose)) ok("26 no deterministic claims");
else bad("26 deterministic language found in readings");
has(prose, "traditional", "26 readings attribute claims to tradition");

// 27. Bundled and deterministic — same chart in, identical words out; no network.
const again = A.buildInterpretationGroups(utc.zodiacPlacements, utc.risingSign);
eq("27 readings are deterministic", JSON.stringify(again), JSON.stringify(groups));
hasnt(read("src/features/birthsky/astrologyInterpretation.ts"), "fetch(", "27 no network calls in interpretation");

// 28. Portrait synthesises rather than repeating, and discloses an assumed birth time.
const portrait = A.buildPersonalityPortrait(utc.zodiacPlacements, utc.risingSign, true);
if (portrait.length >= 4) ok(`28 portrait has ${portrait.length} paragraphs`);
else bad("28 portrait too thin");
has(portrait.join(" "), "personal placements", "28 portrait reasons over the six personal placements");
has(A.buildPersonalityPortrait(utc.zodiacPlacements, utc.risingSign, false).join(" "), "no exact birth time",
  "28 portrait discloses an assumed birth time");

// 29. Disclosure text is present and the frame difference is explained.
has(A.ASTROLOGY_DISCLOSURE, "symbolic rather than scientific", "29 disclosure states symbolic, not scientific");
has(A.FRAME_DIFFERENCE_NOTE, "Ophiuchus", "29 frame note explains the 13th constellation");
const screen2 = read("src/screens/BirthSkyScreen.tsx");
has(screen2, "YOUR ASTROLOGICAL INTERPRETATION", "29 interpretation section rendered");
has(screen2, "YOUR PERSONALITY PORTRAIT", "29 portrait section rendered");
has(screen2, "ASTROLOGY_DISCLOSURE", "29 disclosure rendered at the top of the section");

// 30. No month lookup and no premium bypass may survive anywhere in this feature.
for (const rel of ["src/services/BirthSkyService.ts", "src/features/birthsky/tropicalZodiac.ts", "src/features/birthsky/astrologyInterpretation.ts"]) {
  hasnt(stripComments(read(rel)), "CONSTELLATIONS_BY_MONTH", `30 no month lookup in ${rel.split("/").pop()}`);
}
hasnt(read("src/context/EntitlementContext.tsx"), "TEMPORARY_QA_PREMIUM_OVERRIDE", "30 no temporary premium bypass survives");
hasnt(read("src/context/EntitlementContext.tsx"), "isPremium: true, kind", "30 no forced premium return survives");


console.log("\n── Part E: tropical placement table ──");
const { signPositionFromLongitude, signFromLongitude: sfl } = Z;

// 31. Every supported body has a longitude, and none is invented.
for (const body of Z.ZODIAC_BODIES) {
  if (typeof utc.zodiacLongitudes[body] === "number") ok(`31 ${body} has a tropical longitude`);
  else bad(`31 ${body} missing a longitude`);
}
eq("31 exactly the supported bodies", Object.keys(utc.zodiacLongitudes).length, Z.ZODIAC_BODIES.length);

// 32. Degrees and arcminutes must always be in range — the values a table prints.
for (const body of Z.ZODIAC_BODIES) {
  const pos = signPositionFromLongitude(utc.zodiacLongitudes[body]);
  if (pos.degree >= 0 && pos.degree <= 29) ok(`32 ${body} degree in 0–29 (${pos.degree})`);
  else bad(`32 ${body} degree out of range: ${pos.degree}`);
  if (pos.minutes >= 0 && pos.minutes <= 59) ok(`32 ${body} minutes in 0–59 (${pos.minutes})`);
  else bad(`32 ${body} minutes out of range: ${pos.minutes}`);
}

// 33. The split must agree with the sign the rest of the app already computed.
for (const body of Z.ZODIAC_BODIES) {
  eq(`33 ${body} table sign matches placement`,
    signPositionFromLongitude(utc.zodiacLongitudes[body]).sign, utc.zodiacPlacements[body]);
}

// 34. Boundary carry: 29°59.6′ must roll into the next sign, not print 29°60′.
const carry = signPositionFromLongitude(30 - 0.4 / 60);
eq("34 29°59.6′ carries into the next sign", carry.sign, "Taurus");
eq("34 carried degree resets to 0", carry.degree, 0);
eq("34 carried minutes reset to 0", carry.minutes, 0);
eq("34 exact 0° is Aries 0°00′", signPositionFromLongitude(0).display, "0°00′");
eq("34 just under 360° stays in Pisces", signPositionFromLongitude(359.99).sign, "Pisces");
eq("34 non-finite longitude degrades", Number.isFinite(signPositionFromLongitude(NaN).degree), true);

// 35. The ascendant exposes a real degree rather than a sign-only guess.
if (utc.risingLongitude >= 0 && utc.risingLongitude < 360) ok(`35 ascendant longitude in range (${utc.risingLongitude.toFixed(2)}°)`);
else bad(`35 ascendant longitude out of range: ${utc.risingLongitude}`);
eq("35 ascendant degree matches its sign", signPositionFromLongitude(utc.risingLongitude).sign, utc.risingSign);

// 36. THE frame rule: no IAU constellation may appear as a sign in this table. Mars sat in
//     Cetus on this date, which is not a zodiac sign at all.
const tableSigns = Z.ZODIAC_BODIES.map((b) => signPositionFromLongitude(utc.zodiacLongitudes[b]).sign);
const signNames = Z.ZODIAC_SIGNS.map((x) => x.name);
if (tableSigns.every((sign) => signNames.includes(sign))) ok("36 every table value is one of the twelve signs");
else bad(`36 a non-sign leaked into the table: ${tableSigns.filter((x) => !signNames.includes(x))}`);
if (!tableSigns.includes("Cetus") && !tableSigns.includes("Ophiuchus")) ok("36 no constellation names in the table");
else bad("36 a constellation name appears in the tropical table");

// 37. No fabricated points. Lilith and the lunar nodes are NOT supported by this ephemeris
//     build, so they must not appear anywhere rather than be approximated.
const screenSrc = read("src/screens/BirthSkyScreen.tsx");
for (const fake of ["Lilith", "North Node", "South Node", "Chiron"]) {
  hasnt(screenSrc, fake, `37 no fabricated ${fake}`);
  hasnt(svcCode, fake, `37 ${fake} not invented in the service`);
}

// 38. The circular chart is gone from the result screen; the table took its place.
has(screenSrc, "YOUR TROPICAL PLACEMENTS", "38 placement table is rendered");
hasnt(screenSrc, "BirthSkyCanvas", "38 the circular chart is gone from the result screen");
has(screenSrc, "signPositionFromLongitude", "38 table derives degrees from longitude");
has(screenSrc, "profile.risingLongitude", "38 ascendant row uses the real longitude");

// 39. Everything built earlier must survive this swap.
for (const section of [
  "YOUR BIRTH SKY EXPLAINED", "YOUR SKY STORY", "YOUR ASTROLOGICAL INTERPRETATION",
  "YOUR PERSONALITY PORTRAIT", "WHY THE TWO DIFFER", "Share Quick Card", "Share Full Report",
]) {
  has(screenSrc, section, `39 ${section} still present`);
}

console.log(`\nBirth Sky self-test: ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
