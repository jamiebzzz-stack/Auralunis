// Event-timing deterministic self-test.
//
// The defect this locks out: the Home hero pulled every event within the next SEVEN DAYS and
// labelled all of them "<event> is happening now". On 9 August it announced that the Perseids
// were happening now while their peak was 12–13 August, and paired that with "up to 100 meteors
// per hour at peak". The curated event data was correct; only the copy lied about when.

const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");

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

const { resolveEventTiming, eventHeadline } =
  require(path.join(SRC, "services/eventTiming.ts"));

const at = (iso) => new Date(`${iso}T20:00:00`);
// The exact case that shipped wrong: a two-night shower peaking 12–13 August.
const PEAK = "2026-08-12";
const END = "2026-08-13";

console.log("── Multi-day event window (Perseids 12–13 Aug) ──");

// 1. BEFORE the peak — must never claim it is happening.
eq("1 three nights out states the distance",
  eventHeadline("Perseids", PEAK, END, at("2026-08-09")), "Perseids peaks in 3 nights.");
eq("1 two nights out states the distance",
  eventHeadline("Perseids", PEAK, END, at("2026-08-10")), "Perseids peaks in 2 nights.");
eq("1 the night before says tomorrow",
  eventHeadline("Perseids", PEAK, END, at("2026-08-11")), "Perseids peaks tomorrow.");

// 2. ON the peak.
eq("2 peak night says tonight",
  eventHeadline("Perseids", PEAK, END, at(PEAK)), "Perseids peaks tonight.");

// 3. INSIDE the window past the first night — the only "happening now" case.
eq("3 second night of the window is happening now",
  eventHeadline("Perseids", PEAK, END, at(END)), "Perseids is happening now.");

// 4. AFTER the window.
eq("4 the night after is past",
  eventHeadline("Perseids", PEAK, END, at("2026-08-14")), "Perseids has passed.");

console.log("\n── Single-day event ──");
eq("5 single-day event on the day says tonight",
  eventHeadline("Eclipse", "2026-03-14", undefined, at("2026-03-14")), "Eclipse peaks tonight.");
eq("5 single-day event the day before says tomorrow",
  eventHeadline("Eclipse", "2026-03-14", undefined, at("2026-03-13")), "Eclipse peaks tomorrow.");
eq("5 single-day event the day after is past",
  eventHeadline("Eclipse", "2026-03-14", undefined, at("2026-03-15")), "Eclipse has passed.");

console.log("\n── The core rule ──");

// 6. "happening now" may ONLY appear when today is genuinely inside the window.
let wrongNow = 0;
for (let offset = -10; offset <= 10; offset += 1) {
  const day = new Date(at(PEAK).getTime() + offset * 86400000);
  const headline = eventHeadline("X", PEAK, END, day);
  const inside = offset >= 0 && offset <= 1; // 12th and 13th
  if (headline.includes("happening now") && !inside) wrongNow += 1;
}
eq("6 'happening now' never appears outside the event window", wrongNow, 0);

// 7. Nights-until arithmetic is exact and unaffected by time of day.
eq("7 nights until is exact", resolveEventTiming(PEAK, END, at("2026-08-09")).nightsUntil, 3);
eq("7 early morning counts the same day",
  resolveEventTiming(PEAK, END, new Date("2026-08-09T00:30:00")).nightsUntil, 3);
eq("7 late night counts the same day",
  resolveEventTiming(PEAK, END, new Date("2026-08-09T23:45:00")).nightsUntil, 3);

// 8. Month and year boundaries must not break the count.
eq("8 crosses a month boundary",
  resolveEventTiming("2026-09-01", undefined, at("2026-08-30")).nightsUntil, 2);
eq("8 crosses a year boundary",
  resolveEventTiming("2027-01-02", undefined, at("2026-12-31")).nightsUntil, 2);

// 9. Unparseable dates must not produce a confident claim.
const bogus = resolveEventTiming("not-a-date", undefined, at(PEAK));
hasnt(bogus.phrase, "now", "9 an unparseable date never claims 'now'");

console.log("\n── Wiring ──");
const svc = stripComments(read("src/services/SkyIntelligenceService.ts"));
has(svc, "eventHeadline(event.name", "10 the hero headline comes from the timing helper");
hasnt(svc, '" is happening now."', "10 the unconditional 'happening now' string is gone");
has(svc, 'timing.proximity === "past"', "10 events already finished are dropped");
// The curated dataset must not have been edited to make the copy work.
const data = read("src/data/CelestialEvents.ts");
has(data, '"perseids", name: "Perseid Meteor Shower", month: 8, day: 12, endDay: 13',
  "10 curated event data is unchanged");

console.log(`\nEvent-timing self-test: ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
