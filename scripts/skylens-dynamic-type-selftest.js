// Sky Lens chrome / Dynamic Type deterministic self-test — issue #216.
//
// At accessibility-extra-extra-extra-large the Lock Sky chip grew until it spanned most of the
// viewport (its own label is what sizes it) and the guidance banner drifted into it. The fix
// bounds the DECORATIVE text multiplier and derives the banner's position from the chip's real
// height, so the two can never overlap.
//
// The geometry lives in skyLensChromeLayout.ts (pure), so it is exercised here for real rather
// than asserted about; the wiring that consumes it is checked against the source.

const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const Module = require("module");

const ROOT = path.resolve(__dirname, "..");
Module._extensions[".ts"] = function (m, filename) {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
    fileName: filename,
  });
  m._compile(outputText, filename);
};
const chrome = require(path.join(ROOT, "src/features/sky-lens/skyLensChromeLayout.ts"));
const screenSource = fs.readFileSync(path.join(ROOT, "src/features/sky-lens/SkyLensScreen.tsx"), "utf8");

let pass = 0, fail = 0;
const ok = (m) => { pass += 1; console.log("PASS " + m); };
const bad = (m) => { fail += 1; console.log("FAIL " + m); };
const check = (n, c, d) => (c ? ok(n) : bad(`${n}${d ? " — " + d : ""}`));
const has = (h, n, label) => check(label, h.includes(n), `expected present: ${n}`);

// iOS system font scales: default, a large non-accessibility size, and the largest.
const SCALES = [1, 1.35, 2.35, 3.1];
const INSET_SETS = [
  { name: "notched", insets: { top: 59, bottom: 34, left: 0, right: 0 } },
  { name: "flat", insets: { top: 20, bottom: 0, left: 0, right: 0 } },
  { name: "tall", insets: { top: 62, bottom: 48, left: 0, right: 0 } },
];
const DOCK = 58; // LAYER_BAR_HEIGHT (52) + 6, the default dock

console.log("── 1. Decorative chrome has a bounded font multiplier ──");
check("Lock Sky label multiplier is capped", chrome.LOCK_CHIP_MAX_FONT_SCALE > 1 && chrome.LOCK_CHIP_MAX_FONT_SCALE <= 2, String(chrome.LOCK_CHIP_MAX_FONT_SCALE));
check("guidance banner multiplier is capped", chrome.FINDER_MAX_FONT_SCALE > 1 && chrome.FINDER_MAX_FONT_SCALE <= 2, String(chrome.FINDER_MAX_FONT_SCALE));
has(screenSource, "maxFontSizeMultiplier={LOCK_CHIP_MAX_FONT_SCALE}", "the Lock Sky label uses the shared cap");
has(screenSource, "maxFontSizeMultiplier={FINDER_MAX_FONT_SCALE}", "the guidance banner uses the shared cap");
check("Dynamic Type is never disabled anywhere in Sky Lens", !/allowFontScaling=\{false\}/.test(screenSource));

console.log("\n── 2. Lock Sky keeps a real touch target and a bounded footprint ──");
for (const scale of SCALES) {
  const h = chrome.lockChipHeight(scale);
  check(`fontScale ${scale}: Lock Sky is at least ${chrome.LOCK_CHIP_MIN_TOUCH}pt tall`, h >= chrome.LOCK_CHIP_MIN_TOUCH, `${h.toFixed(1)}pt`);
}
has(screenSource, "minHeight: 44", "the chip declares a real 44pt minimum height");
check(
  "REGRESSION: the chip height stops growing past the cap",
  Math.abs(chrome.lockChipHeight(2.35) - chrome.lockChipHeight(3.1)) < 0.001,
  `${chrome.lockChipHeight(2.35).toFixed(1)} vs ${chrome.lockChipHeight(3.1).toFixed(1)}`
);
for (const box of [{ width: 402, height: 874 }, { width: 320, height: 568 }, { width: 440, height: 956 }]) {
  const w = chrome.lockChipMaxWidth(box);
  check(
    `REGRESSION: on a ${box.width}pt screen the chip cannot span the viewport`,
    w <= box.width * chrome.LOCK_CHIP_MAX_WIDTH_FRACTION + 0.001 && w < box.width,
    `${w.toFixed(1)} of ${box.width}`
  );
  check(`…and still leaves a usable label width on ${box.width}pt`, w >= 120, `${w.toFixed(1)}pt`);
  // The chip is centred; the shutter is parked at the right edge.
  const chipRight = box.width / 2 + w / 2;
  const shutterLeft = box.width - 20 - 60;
  check(
    `REGRESSION: on ${box.width}pt the chip clears the shutter`,
    chipRight <= shutterLeft - chrome.LOCK_CHIP_SHUTTER_GAP + 0.001,
    `chip right ${chipRight.toFixed(1)} vs shutter left ${shutterLeft}`
  );
}
has(screenSource, "maxWidth: lockChipWidthCap", "the width cap is applied to the chip");

console.log("\n── 3. The banner never overlaps Lock Sky, at any text size or inset ──");
for (const { name, insets } of INSET_SETS) {
  for (const scale of SCALES) {
    const banner = chrome.finderBottomOffset({ insets, dockHeight: DOCK, fontScale: scale });
    const lockTop = insets.bottom + chrome.LOCK_CHIP_BOTTOM_GAP + chrome.lockChipHeight(scale);
    check(
      `${name} insets, fontScale ${scale}: banner clears the Lock Sky chip`,
      banner >= lockTop + chrome.FINDER_LOCK_GAP - 0.001,
      `banner ${banner.toFixed(1)} vs chip top ${lockTop.toFixed(1)}`
    );
  }
}
check(
  "REGRESSION: the banner is lifted as the chip grows",
  chrome.finderBottomOffset({ insets: INSET_SETS[0].insets, dockHeight: DOCK, fontScale: 3.1 }) >
    chrome.finderBottomOffset({ insets: INSET_SETS[0].insets, dockHeight: DOCK, fontScale: 1 })
);
check(
  "the banner also clears the shutter row it always did",
  chrome.finderBottomOffset({ insets: INSET_SETS[0].insets, dockHeight: DOCK, fontScale: 1 }) >=
    INSET_SETS[0].insets.bottom + DOCK + 16 + 72 - 0.001
);
has(screenSource, "bottom: finderBottom", "the banner's position comes from the shared helper");
check("both banner variants use it", (screenSource.match(/bottom: finderBottom/g) || []).length >= 2);

console.log("\n── 4. Default text size stays where it was ──");
const defaultBanner = chrome.finderBottomOffset({ insets: INSET_SETS[0].insets, dockHeight: DOCK, fontScale: 1 });
const historical = INSET_SETS[0].insets.bottom + DOCK + 16 + 72;
check(
  "the default banner position is within a few points of the historical value",
  Math.abs(defaultBanner - historical) <= 6,
  `${defaultBanner.toFixed(1)} vs historical ${historical} (the delta is the chip's new 44pt floor)`
);
check("default chip height is exactly the 44pt touch floor", Math.abs(chrome.lockChipHeight(1) - 44) < 0.001);
check("default banner height is unchanged", Math.abs(chrome.finderHeight(1) - 44) < 0.001);

console.log("\n── 5. Both label variants fit the capped width ──");
// Rough advance width for a bold label; generous enough to be a real constraint, not a tautology.
const fits = (text, fontSize, scaleCap, maxWidth, lines) =>
  text.length * fontSize * scaleCap * 0.62 <= maxWidth * lines;
const box = { width: 402, height: 874 };
const chipW = chrome.lockChipMaxWidth(box) - 32; // paddingHorizontal 16 ×2
for (const [label, text] of [["unlocked", "🔓  Lock Sky"], ["locked", "🔒  Sky Locked · drag to explore"]]) {
  check(`the ${label} Lock Sky label fits within two capped lines`, fits(text, 12, chrome.LOCK_CHIP_MAX_FONT_SCALE, chipW, 2), `${text.length} chars in ${chipW.toFixed(0)}pt`);
}
const finderW = chrome.finderMaxWidth(box) - 32;
for (const [label, text] of [
  ["Moon pan", "☾  Pan → to the Moon"],
  ["Moon turn-around", "☾  Turn around for the Moon ↻"],
  ["object pan", "✦  Pan ↗ to Betelgeuse"],
  ["object below horizon", "✦  Sirius is below the horizon right now"],
]) {
  check(`the ${label} banner fits within its capped lines`, fits(text, 17, chrome.FINDER_MAX_FONT_SCALE, finderW, chrome.FINDER_MAX_LINES), `${text.length} chars in ${finderW.toFixed(0)}pt × ${chrome.FINDER_MAX_LINES} lines`);
}
check("the Lock Sky label wraps rather than clips", (screenSource.match(/numberOfLines=\{2\}/g) || []).length >= 1);
check("both banner variants wrap rather than clip", (screenSource.match(/numberOfLines=\{FINDER_MAX_LINES\}/g) || []).length >= 2);
check("the banner allows a third line for its longest sentence", chrome.FINDER_MAX_LINES >= 3);

console.log("\n── 6. Label avoidance follows the real banner ──");
for (const scale of [1, 3.1]) {
  const rects = chrome.chromeAvoidRects({ box, insets: INSET_SETS[0].insets, dockHeight: DOCK, visible: { finder: true }, fontScale: scale });
  const banner = rects[0];
  const expectedBottom = box.height - chrome.finderBottomOffset({ insets: INSET_SETS[0].insets, dockHeight: DOCK, fontScale: scale });
  check(`fontScale ${scale}: the reserved rect sits where the banner renders`, Math.abs(banner.y + banner.h - 6 - expectedBottom) < 0.001);
  check(`fontScale ${scale}: the reserved rect is as tall as the banner`, banner.h >= chrome.finderHeight(scale));
}
check(
  "existing callers that pass no fontScale get the default-size behaviour",
  JSON.stringify(chrome.chromeAvoidRects({ box, insets: INSET_SETS[0].insets, dockHeight: DOCK, visible: { finder: true } })) ===
    JSON.stringify(chrome.chromeAvoidRects({ box, insets: INSET_SETS[0].insets, dockHeight: DOCK, visible: { finder: true }, fontScale: 1 }))
);

console.log("\n── 7. No behaviour was changed ──");
has(screenSource, "onPress={() => { tapLight(); skyOrientation.toggleLock(); }}", "Lock Sky still toggles the existing lock");
has(screenSource, "skyOrientationRef.current.applyDrag(dx, dy)", "drag-to-pan is unchanged");
has(screenSource, ".minDistance(DRAG_ACTIVATION_POINTS)", "the drag activation threshold is unchanged");
has(screenSource, "Gesture.Simultaneous(pinch, skyDrag, cinematicTap, objectTap)", "gesture arbitration is unchanged");
has(screenSource, "? projectTargetWithBasis(basis, az, alt, fov, box)", "object hit testing is unchanged");
has(screenSource, "horizontalDegrees: DEFAULT_FOV.horizontalDegrees / zoom", "the FOV derivation is unchanged");
has(screenSource, "eulerReadoutFromQuaternion(", "the HUD still reads the quaternion");
check(
  "the accessibility labels still describe both states",
  /accessibilityLabel=\{skyOrientation\.isLocked \? "Unlock the sky and resume live tracking" : "Lock the sky so it stops moving"\}/.test(screenSource)
);
check("the chip still exposes its selected state", /accessibilityState=\{\{ selected: skyOrientation\.isLocked \}\}/.test(screenSource));
check("the moon-finder text itself is untouched", /Turn around for the Moon ↻|☾  Turn around for the Moon/.test(screenSource));

console.log(`\nSky Lens Dynamic Type self-test: ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
