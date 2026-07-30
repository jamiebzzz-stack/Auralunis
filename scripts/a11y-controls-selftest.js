// Sky Lens accessibility-controls self-test.
//
// Every icon-only Sky Lens control must carry an accessibilityLabel so VoiceOver names it —
// most importantly the screenshot/shutter button, which WITHOUT a label falls back to the
// emoji's name "camera", violating the product contract (Sky Lens is a fully rendered
// planetarium, not a camera). Icon buttons are a compact 38pt visual by design, so they must
// expand their touch target to >= 44pt via hitSlop. Toggle state must be exposed to VoiceOver
// (not conveyed by glyph/tint alone).

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failed += 1;
};

const screen = read("src/features/sky-lens/SkyLensScreen.tsx");
const card = read("src/features/sky-lens/SkyLensInfoCard.tsx");

// Every top-bar / shutter control has an accessibilityLabel.
const labeled = [
  ['accessibilityLabel="Close Sky Lens"', "close button labeled"],
  ['accessibilityLabel="Time travel"', "time-travel button labeled"],
  ['accessibilityLabel="Night vision"', "night-vision button labeled"],
  ['accessibilityLabel="Capture a photo of the sky"', "shutter button labeled (capture)"]
];
for (const [needle, name] of labeled) check(name, screen.includes(needle));

// The shutter (and every control) must NOT be announced as a camera / AR (product contract).
const labels = [...screen.matchAll(/accessibilityLabel="([^"]*)"/g)].map((m) => m[1]);
check("no control is labeled 'camera' or 'AR'", !labels.some((l) => /camera|augmented|\bAR\b/i.test(l)), labels.join(" | "));

// Toggle state is exposed to VoiceOver (not glyph/tint only).
check("night-vision exposes selected state", /accessibilityLabel="Night vision"[\s\S]{0,140}accessibilityState=\{\{ selected: nightMode \}\}/.test(screen));
check("time-travel exposes selected state", /accessibilityLabel="Time travel"[\s\S]{0,140}accessibilityState=\{\{ selected: scrubVisible \}\}/.test(screen));

// The 38pt icon buttons expand to >= 44pt effective touch via hitSlop (close + 2 toggles).
// Was >= 4 when a Sky brightness toggle also lived here; that control was removed with the
// Dark/Clear slider, since a rendered planetarium has no pass-through scene to dim.
const hitSlops = (screen.match(/hitSlop=\{\{ top: 8, bottom: 8, left: 8, right: 8 \}\}/g) || []).length;
check("icon buttons carry hitSlop (>=44pt effective touch)", hitSlops >= 3, `${hitSlops} hitSlop props`);

// Info-card modal close is labeled.
check("info-card close button labeled", card.includes('accessibilityLabel="Close"'));

console.log("");
if (failed) {
  console.error(`Sky Lens a11y-controls self-test: ${failed} FAILED.`);
  process.exit(1);
}
console.log(
  "Sky Lens a11y-controls self-test passed: all icon controls labeled; shutter is not 'camera'; toggle state exposed; touch targets expanded."
);
