// Sky Lens label-avoidance self-test.
//
// Verifies that celestial labels never render under or behind Sky Lens UI chrome. It loads
// the REAL implementations by transpiling them to CommonJS at runtime (with the repo's own
// `typescript` dependency) — the shared label placer (labelLayout.ts), the chrome geometry
// (skyLensChromeLayout.ts), and the ENU projection (SkyLensProjection.ts) — so there is NO
// duplicated placement or projection math and a real regression is caught here. Runtime
// transpile keeps this working on CI's Node 20, which does not strip TS types.
//
// Sky Lens is a fully rendered, sensor-aligned planetarium — the "chrome" here is ordinary
// on-screen UI (close button, HUD, screenshot button, banners, dock) layered over the sky.

const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const Module = require("module");

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

const R = (rel) => path.resolve(__dirname, "..", rel);
const { makeLabelPlacer, labelRect, overlaps, unitFootprint } = requireTs(R("src/features/sky-lens/labelLayout.ts"));
const { chromeAvoidRects, chromeTopInset } = requireTs(R("src/features/sky-lens/skyLensChromeLayout.ts"));
const { projectTarget, DEFAULT_FOV } = requireTs(R("src/features/sky-lens/ar/SkyLensProjection.ts"));

let failed = 0;
function assert(label, ok, detail) {
  const line = label + (detail ? " — " + detail : "");
  if (ok) console.log("PASS", line);
  else {
    failed += 1;
    console.error("FAIL", line);
  }
}

// Devices + safe-area variants (portrait — Sky Lens is portrait-locked).
const DEVICES = [
  { name: "iPhone 16 Pro Max (notch)", box: { width: 430, height: 932 }, insets: { top: 59, bottom: 34, left: 0, right: 0 } },
  { name: "iPhone SE (no notch)", box: { width: 375, height: 667 }, insets: { top: 20, bottom: 0, left: 0, right: 0 } },
  { name: "iPhone 16 Pro Max (zero insets)", box: { width: 430, height: 932 }, insets: { top: 0, bottom: 0, left: 0, right: 0 } }
];
const DOCK_H = 58; // collapsed dock = LAYER_BAR_HEIGHT(52) + 6

// Full chrome rectangle set for a device: the top HUD band, the bottom dock band (both
// enforced by the placer's safe bands) plus the floating controls (reserved rects).
function chromeSetup(box, insets, dockHeight, visible) {
  const topInset = chromeTopInset(insets);
  const bottomInset = dockHeight + insets.bottom + 12;
  const floating = chromeAvoidRects({ box, insets, dockHeight, visible });
  const bands = [
    { x: 0, y: 0, w: box.width, h: topInset },
    { x: 0, y: box.height - bottomInset, w: box.width, h: bottomInset }
  ];
  return { topInset, bottomInset, floating, allChrome: bands.concat(floating) };
}

// A placer wired exactly like SkyLensCanvas: derived top/bottom bands + reserved chrome.
function makePlacer(box, setup) {
  const p = makeLabelPlacer(box, { top: setup.topInset, bottom: setup.bottomInset });
  for (const r of setup.floating) p.reserve(r.x, r.y, r.w, r.h);
  return p;
}

const ALL_VISIBLE = { shutter: true, finder: true, zoomChip: true };

console.log("Sky Lens label-avoidance self-test — real placer + chrome geometry + ENU projection\n");

// ── 1. Sanity: modules loaded, chrome rects produced ──────────────────────────────
assert(
  "loaded real placer/chrome/projection modules",
  typeof makeLabelPlacer === "function" && typeof chromeAvoidRects === "function" && typeof projectTarget === "function"
);

// ── 2. No label lands on chrome, across a dense grid, on every device/inset variant ─
for (const d of DEVICES) {
  const setup = chromeSetup(d.box, d.insets, DOCK_H, ALL_VISIBLE);
  assert(`${d.name}: has floating chrome rects to avoid`, setup.floating.length >= 2, `${setup.floating.length} rects`);
  let placed = 0;
  let suppressed = 0;
  let intrusions = 0;
  for (let gx = 20; gx <= d.box.width - 20; gx += 30) {
    for (let gy = 20; gy <= d.box.height - 20; gy += 30) {
      const placer = makePlacer(d.box, setup); // fresh placer: chrome-only constraint
      const res = placer(gx, gy, "Regulus", 15); // a representative low-priority star label
      if (!Number.isFinite(res.x)) {
        suppressed += 1;
        continue;
      }
      placed += 1;
      const rect = labelRect(res.x, res.y, "Regulus", 15, false);
      if (setup.allChrome.some((c) => overlaps(c, rect))) intrusions += 1;
    }
  }
  assert(`${d.name}: NO label intersects any chrome rect (grid)`, intrusions === 0, `${placed} placed, ${suppressed} suppressed, ${intrusions} intrusions`);
}

// ── 3. Real ENU projection: a target that projects onto the shutter is avoided ─────
{
  const d = DEVICES[0];
  const setup = chromeSetup(d.box, d.insets, DOCK_H, ALL_VISIBLE);
  const shutter = setup.floating[0]; // shutter is first when visible
  const pointing = { azimuthDegrees: 180, altitudeDegrees: 20, rollDegrees: 0 };
  // Search a small target grid for one whose real projection lands inside the shutter rect.
  let hit = null;
  // Search the FULL effective field of view. The vertical FOV is derived from the horizontal
  // FOV and the viewport aspect (both axes share one degrees-to-pixels scale), so on a tall
  // phone the vertical extent is much larger than the old fixed 45° — a 34° search no longer
  // reaches the bottom-of-screen shutter.
  for (let dAz = 0; dAz <= 34 && !hit; dAz += 1) {
    for (let dAlt = 0; dAlt >= -80 && !hit; dAlt -= 1) {
      const pr = projectTarget(pointing, 180 + dAz, 20 + dAlt, DEFAULT_FOV, d.box);
      if (pr.onScreen && pr.x >= shutter.x && pr.x <= shutter.x + shutter.w && pr.y >= shutter.y && pr.y <= shutter.y + shutter.h) {
        hit = pr;
      }
    }
  }
  assert("real projection can land a target inside the shutter rect", !!hit, hit ? `x=${hit.x.toFixed(0)} y=${hit.y.toFixed(0)}` : "no hit");
  if (hit) {
    const placer = makePlacer(d.box, setup);
    const res = placer(hit.x, hit.y, "Regulus", 15);
    const ok = !Number.isFinite(res.x) || !overlaps(shutter, labelRect(res.x, res.y, "Regulus", 15, false));
    assert("label at a shutter-projected point is suppressed or moved clear of the shutter", ok, Number.isFinite(res.x) ? `moved to x=${res.x.toFixed(0)} y=${res.y.toFixed(0)}` : "suppressed");
  }
}

// ── 4. Priority: a planet/Moon label claimed first keeps its slot; a star yields ───
{
  const d = DEVICES[0];
  const setup = chromeSetup(d.box, d.insets, DOCK_H, ALL_VISIBLE);
  const placer = makePlacer(d.box, setup);
  const px = 215;
  const py = 500; // clear of all chrome
  const planet = placer(px, py, "Jupiter", 17); // planets claim before stars (canvas order)
  const planetRect = labelRect(planet.x, planet.y, "Jupiter", 17, false);
  const star = placer(px, py, "Regulus", 15); // same spot, after the planet
  assert("planet label is placed at its natural slot", Number.isFinite(planet.x) && Math.abs(planet.x - px) < 1 && Math.abs(planet.y - py) < 1);
  const starRect = Number.isFinite(star.x) ? labelRect(star.x, star.y, "Regulus", 15, false) : null;
  assert(
    "lower-priority star yields (moved off the planet's slot or suppressed)",
    !starRect || !overlaps(planetRect, starRect),
    starRect ? `star at x=${star.x.toFixed(0)} y=${star.y.toFixed(0)}` : "suppressed"
  );
}

// ── 5. Moon/planet DISC reservations still keep labels off the artwork ────────────
{
  const d = DEVICES[0];
  const setup = chromeSetup(d.box, d.insets, DOCK_H, ALL_VISIBLE);
  const placer = makePlacer(d.box, setup);
  const mx = 215;
  const my = 500;
  placer.reserveCircle(mx, my, 40); // Moon disc up front (as the canvas does)
  const res = placer(mx, my, "Moon", 17);
  const discRect = { x: mx - 40, y: my - 40, w: 80, h: 80 };
  const ok = !Number.isFinite(res.x) || !overlaps(discRect, labelRect(res.x, res.y, "Moon", 17, false));
  assert("a reserved disc keeps its own label off the artwork", ok);
}

// ── 6. Suppression: when every candidate collides, the label is dropped (NaN) ──────
{
  const d = DEVICES[0];
  const setup = chromeSetup(d.box, d.insets, DOCK_H, ALL_VISIBLE);
  const placer = makePlacer(d.box, setup);
  // Reserve the entire usable interior so no candidate can be placed anywhere.
  placer.reserve(0, 0, d.box.width, d.box.height);
  const res = placer(215, 500, "Regulus", 15);
  assert("fully-blocked label is suppressed (NaN), never overlapped", !Number.isFinite(res.x));
}

// ── 7. Hidden chrome is not reserved (no needless suppression) ────────────────────
{
  const d = DEVICES[0];
  const none = chromeAvoidRects({ box: d.box, insets: d.insets, dockHeight: DOCK_H, visible: {} });
  assert("no visible chrome → no floating rects reserved", none.length === 0);
}

// ── 8. Zodiac labels (centered, LOWEST priority) route through the same placer ────
// In production ZodiacLayer places its sign name via placeLabel(cx, cy, name, 15, /*avoid*/
// undefined, /*centered*/ true) in a labels-only pass mounted after every higher-priority
// layer — so the test exercises the exact same call shape.
{
  const d = DEVICES[0];
  const setup = chromeSetup(d.box, d.insets, DOCK_H, ALL_VISIBLE);
  const zsign = "Sagittarius";
  const zlabel = (placer, cx, cy) => placer(cx, cy, zsign, 15, undefined, true);
  const zrect = (res) => labelRect(res.x, res.y, zsign, 15, true);

  // 8a. A zodiac label whose sign center falls on chrome must not overlap chrome.
  {
    const shutter = setup.floating[0];
    const cx = shutter.x + shutter.w / 2;
    const cy = shutter.y + shutter.h / 2;
    const res = zlabel(makePlacer(d.box, setup), cx, cy);
    const ok = !Number.isFinite(res.x) || !setup.allChrome.some((c) => overlaps(c, zrect(res)));
    assert("zodiac label over chrome is suppressed or moved clear of all chrome", ok, Number.isFinite(res.x) ? "moved clear" : "suppressed");
  }

  // 8b. Zodiac yields to a higher-priority planet/Moon label claimed first.
  {
    const placer = makePlacer(d.box, setup);
    const px = 215;
    const py = 520;
    const planet = placer(px, py, "Jupiter", 17); // planet claims first (canvas order)
    const planetRect = labelRect(planet.x, planet.y, "Jupiter", 17, false);
    const moon = placer(px + 60, py, "Moon", 17); // Moon also outranks zodiac
    const moonRect = labelRect(moon.x, moon.y, "Moon", 17, false);
    const z1 = zlabel(placer, px, py); // same spot as Jupiter
    const z2 = zlabel(placer, px + 60, py); // same spot as Moon
    const clears = (res, rect) => !Number.isFinite(res.x) || !overlaps(rect, zrect(res));
    assert("zodiac label yields to a planet label (moved off or suppressed)", clears(z1, planetRect));
    assert("zodiac label yields to the Moon label (moved off or suppressed)", clears(z2, moonRect));
  }

  // 8c. Zodiac suppresses when there is no valid slot.
  {
    const placer = makePlacer(d.box, setup);
    placer.reserve(0, 0, d.box.width, d.box.height); // block the whole interior
    const res = zlabel(placer, 215, 500);
    assert("zodiac label suppresses (NaN) when no clean slot exists", !Number.isFinite(res.x));
  }

  // 8d. Dense zodiac/constellation cluster stays collision-safe (no label overlaps another
  //     or any chrome). Twelve centered labels crowded into one small region.
  {
    const placer = makePlacer(d.box, setup);
    const placedRects = [];
    let overlapsFound = 0;
    for (let i = 0; i < 12; i += 1) {
      const res = placer(200 + (i % 3) * 8, 460 + Math.floor(i / 3) * 6, i % 2 ? "Sagittarius" : "Ophiuchus", 15, undefined, true);
      if (!Number.isFinite(res.x)) continue;
      const rect = zrect(res);
      if (placedRects.some((r) => overlaps(r, rect)) || setup.allChrome.some((c) => overlaps(c, rect))) overlapsFound += 1;
      placedRects.push(rect);
    }
    assert("dense zodiac/constellation cluster: no placed label overlaps another or chrome", overlapsFound === 0, `${placedRects.length} placed, ${overlapsFound} overlaps`);
  }
}

// ── 9. #165 device-reproduced collisions (TEST-FIRST — these FAIL until the fix lands) ──
// Conservative model of ACTUAL rendered text width — a fixed reference the placer's reserved
// box must cover: bold ≈ 0.615 em/char, regular ≈ 0.60, plus letterSpacing between glyphs.
// `labelBoxSize` currently uses 0.58 with no weight/letterSpacing term, so bold and
// letter-spaced labels render WIDER than the box the placer reserved for them.
function renderedRect(x, y, text, fontSize, { bold = false, ls = 0, centered = false } = {}) {
  const w = text.length * fontSize * (bold ? 0.615 : 0.6) + Math.max(0, text.length - 1) * ls;
  const h = fontSize * 1.25;
  return { x: centered ? x - w / 2 : x, y: y - h, w, h };
}
// The FULL zodiac label unit as it actually renders: glyph 20px ABOVE the name baseline and a
// long context banner 7px BELOW it. Today only the name box is reserved, so the glyph and
// context escape collision checking. This models the whole footprint that must be covered.
function zodiacUnitRects(ax, ay, name, contextText) {
  return [
    renderedRect(ax, ay - 20, "♏", 18, { centered: true }), // glyph (single symbol)
    renderedRect(ax, ay, name, 15, { ls: 1, centered: true }), // name (letterSpacing 1)
    ...(contextText ? [renderedRect(ax, ay + 7, contextText, 8, { bold: true, centered: true })] : [])
  ];
}

// 9a. Planet label adjacent to a bright-star label must not overlap at TRUE (bold) width.
// Callers pass their real weights (planet 700, star 600), as production now does.
{
  const box = { width: 430, height: 932 };
  const placer = makeLabelPlacer(box, { top: 100, bottom: 150 });
  const merc = placer(160, 300, "Mercury", 17, undefined, false, { weight: 700 }); // planet label, bold 700
  const mBox = labelRect(merc.x, merc.y, "Mercury", 17, false, { weight: 700 });
  const proc = placer(mBox.x + mBox.w + 1, 300, "Procyon", 16, undefined, false, { weight: 600 }); // star label, bold 600
  const mR = renderedRect(merc.x, merc.y, "Mercury", 17, { bold: true });
  const pR = renderedRect(proc.x, proc.y, "Procyon", 16, { bold: true });
  assert(
    "[#165-1] planet & star labels do not overlap at true rendered (bold) width",
    !overlaps(mR, pR),
    `rendered gap ${(pR.x - (mR.x + mR.w)).toFixed(2)}px`
  );
}

// 9b. Zodiac current-sign unit (incl. its long context banner) must clear the shutter.
{
  const box = { width: 430, height: 932 };
  const insets = { top: 59, bottom: 34, left: 0, right: 0 };
  const dock = 58;
  const chrome = chromeAvoidRects({ box, insets, dockHeight: dock, visible: { shutter: true, finder: false, zoomChip: true } });
  const shutter = chrome[0];
  const placer = makeLabelPlacer(box, { top: chromeTopInset(insets), bottom: dock + insets.bottom + 12 });
  for (const r of chrome) placer.reserve(r.x, r.y, r.w, r.h);
  const cx = shutter.x - 40;
  const cy = shutter.y + 12; // sign center just left of + into the shutter's vertical band
  // Production reserves the WHOLE unit footprint (glyph + name + context), not just the name.
  const fp = unitFootprint([
    { text: "♋", fontSize: 22, dy: -20 },
    { text: "Cancer", fontSize: 15, dy: 0, weight: 600, letterSpacing: 1 },
    { text: "☀ Sun is here · Cancer season", fontSize: 8, dy: 7, weight: 800 }
  ]);
  const placed = placer(cx, cy, "Cancer", 15, undefined, true, { weight: 600, letterSpacing: 1, footprint: fp });
  const unit = Number.isFinite(placed.x) ? zodiacUnitRects(placed.x, placed.y, "Cancer", "☀ Sun is here · Cancer season") : [];
  const hit = unit.some((r) => overlaps(r, shutter));
  assert("[#165-2] zodiac current-sign unit (name+glyph+context) clears the screenshot button", !Number.isFinite(placed.x) || !hit);
}

// 9c. Zodiac unit (incl. glyph) must yield FULLY to a higher-priority constellation label.
{
  const box = { width: 430, height: 932 };
  const placer = makeLabelPlacer(box, { top: 100, bottom: 150 });
  const con = placer(215, 500, "VIRGO", 13, undefined, true, { weight: 500, letterSpacing: 1.6 }); // constellation first
  const conBox = labelRect(con.x, con.y, "VIRGO", 13, true, { weight: 500, letterSpacing: 1.6 });
  const fp = unitFootprint([
    { text: "♍", fontSize: 18, dy: -20 },
    { text: "Virgo", fontSize: 15, dy: 0, weight: 600, letterSpacing: 1 }
  ]);
  const placed = placer(215, 520, "Virgo", 15, undefined, true, { weight: 600, letterSpacing: 1, footprint: fp }); // name anchor (c.y+20)
  const unit = Number.isFinite(placed.x) ? zodiacUnitRects(placed.x, placed.y, "Virgo", null) : [];
  const hit = unit.some((r) => overlaps(r, conBox));
  assert("[#165-3] zodiac unit (incl. glyph) does not overlap a higher-priority constellation label", !Number.isFinite(placed.x) || !hit);
}

console.log("");
if (failed) {
  console.error(`Sky Lens label-avoidance self-test: ${failed} failure(s).`);
  process.exit(1);
}
console.log(
  "Sky Lens label-avoidance self-test passed: no label intersects UI chrome across devices/insets; precedence, disc reservations, and suppression all hold."
);
