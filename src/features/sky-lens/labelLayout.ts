// labelLayout.ts
// Shared cross-layer label collision avoidance. SkyLensCanvas creates ONE placer per
// render and passes it to every label-rendering layer, so labels from different layers
// (Moon / planets / stars / constellations / satellites) can't land on top of each other
// or on top of another object's artwork.
//
// Capabilities:
//   * reserveCircle() — claim the SPACE AN OBJECT'S ARTWORK OCCUPIES, so no label is ever
//     drawn on top of a planet or the Moon.
//   * an `avoid` circle — lets a label orbit its own object (right / left / above / below)
//     instead of only sliding downward into whatever is beneath it.
//   * `centered` — for labels drawn with textAnchor="middle" (see the bug note below).
//   * safe margins + LABEL_SAFE_INSET — keeps labels out of the top HUD, the bottom dock,
//     and away from the screen edges, with a horizontal FLIP rather than a clip.

export type LabelBox = { width: number; height: number };
export type AvoidCircle = { x: number; y: number; r: number };

// Labels must never touch the screen edge. At the old value (4px) a star label near the
// right-hand side was "in bounds" right up to the last few pixels, so its text ran off the
// display — which is exactly the clipped-label problem on device. 26px gives real air.
export const LABEL_SAFE_INSET = 26;

// Optional per-label metrics so the reserved box matches what actually renders.
//   * `weight` widens the box for bold text (planet/star/zodiac labels are 600–700).
//   * `letterSpacing` adds the inter-glyph gap the caller actually draws with.
//   * `footprint` lets a multi-part label (e.g. a zodiac glyph + name + context line) claim
//     its COMPLETE bounding box as one collision object, not just its primary line.
export type LabelFootprint = { w: number; top: number; bottom: number };
export type LabelMetrics = { weight?: number; letterSpacing?: number; footprint?: LabelFootprint };

export type LabelPlacer = ((
  cx: number,
  cy: number,
  text: string,
  fontSize: number,
  avoid?: AvoidCircle,
  centered?: boolean,
  metrics?: LabelMetrics
) => { x: number; y: number }) & {
  reserve: (x: number, y: number, w: number, h: number) => void;
  reserveCircle: (x: number, y: number, r: number) => void;
  /**
   * Claim a display identity for this frame. True the first time, false on every repeat.
   * Guarantees one visible label per identity regardless of how many passes attempt it.
   */
  claimIdentity: (key: string) => boolean;
};

export type Rect = { x: number; y: number; w: number; h: number };

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Small horizontal air so two labels sized right at the estimate still can't kiss. Kept
// modest so it does not "blindly overinflate" — the weight-aware factor does the real work.
// Nudged 4 → 6 for crowding relief: in dense fields (Orion's belt and shoulders, the Gemini
// twins, a planet sitting among named stars) labels were passing the collision test while
// still reading as one clot. This is the SAME collision system with slightly more air, not a
// new placement rule — nothing is dropped that was previously kept.
const LABEL_H_PAD = 6;

// Deterministic label box. Single source of truth so tests, the placer, and the zodiac
// unit-footprint all use the same width math. The per-char factor is weight-aware: regular
// text ≈ 0.58 em/char, and bold renders wider (up to ≈ 0.63 at weight 700), which is why
// bold planet/star labels previously overran their reserved box. `letterSpacing` adds the
// inter-glyph gap the caller draws with (constellation/zodiac labels are letter-spaced).
export function labelBoxSize(text: string, fontSize: number, metrics: LabelMetrics = {}): { w: number; h: number } {
  const { weight = 400, letterSpacing = 0 } = metrics;
  // Range extended 700 → 800 because planet labels now render at weight 800; clamping at 700
  // would have under-reserved their box by a hair and let a neighbour creep in.
  const weightFactor = 0.58 + (Math.max(0, Math.min(400, weight - 400)) / 400) * 0.06; // 400→0.58 … 800→0.64
  const w = text.length * fontSize * weightFactor + Math.max(0, text.length - 1) * letterSpacing + LABEL_H_PAD;
  // 1.25 → 1.32: a touch of vertical air between stacked rows of labels, for the same
  // crowding reason as LABEL_H_PAD above.
  return { w: Math.max(8, w), h: fontSize * 1.32 };
}

export function labelRect(
  x: number,
  y: number,
  text: string,
  fontSize: number,
  centered?: boolean,
  metrics?: LabelMetrics
): Rect {
  const { w, h } = labelBoxSize(text, fontSize, metrics);
  // `x` is the LEFT edge for left-anchored labels, the CENTRE for textAnchor="middle";
  // `y` is the text baseline, so the box top is y - h.
  return { x: centered ? x - w / 2 : x, y: y - h, w, h };
}

// Full footprint of a MULTI-PART label around its primary (name) baseline. Each part is drawn
// with a vertical offset `dy` from that baseline (negative = above it). Returns the widest
// part's width and the vertical extents above (`top`) and below (`bottom`) the baseline, so
// the placer can reserve and collision-check the WHOLE unit — glyph, name, and any context
// line — as one object rather than just the name.
export function unitFootprint(
  parts: Array<{ text: string; fontSize: number; dy: number; weight?: number; letterSpacing?: number }>
): LabelFootprint {
  let w = 0;
  let top = 0;
  let bottom = 0;
  for (const p of parts) {
    const { w: pw, h: ph } = labelBoxSize(p.text, p.fontSize, { weight: p.weight, letterSpacing: p.letterSpacing });
    w = Math.max(w, pw);
    top = Math.max(top, ph - p.dy); // box top = baseline + dy - ph → extent above the baseline
    bottom = Math.max(bottom, p.dy); // box bottom = baseline + dy → extent below the baseline
  }
  return { w, top, bottom };
}

export function makeLabelPlacer(
  box: LabelBox,
  safe: { top?: number; bottom?: number } = {}
): LabelPlacer {
  const safeTop = safe.top ?? 0;
  const safeBottom = safe.bottom ?? 0;
  const claimed: Rect[] = [];
  // Frame-scoped identity registry. The placer is rebuilt on every canvas render and shared
  // by EVERY label mount, so it is the one place that can see all passes at once.
  const identities = new Set<string>();

  const inBounds = (r: Rect): boolean =>
    r.x >= LABEL_SAFE_INSET &&
    r.x + r.w <= box.width - LABEL_SAFE_INSET &&
    r.y >= safeTop &&
    r.y + r.h <= box.height - safeBottom;

  const place = (
    cx: number,
    cy: number,
    text: string,
    fontSize: number,
    avoid?: AvoidCircle,
    centered?: boolean,
    metrics?: LabelMetrics
  ): { x: number; y: number } => {
    const footprint = metrics?.footprint;
    // The candidate-offset math and the reserved rect use the FULL footprint when one is
    // given (a multi-part unit), otherwise the single-line weight/letter-spacing-aware box.
    const { w, h } = footprint
      ? { w: footprint.w, h: footprint.top + footprint.bottom }
      : labelBoxSize(text, fontSize, metrics);

    // BUG FIX. `x` means different things to different callers: for a star label it's the
    // LEFT edge of the text, but ConstellationLayer draws with textAnchor="middle", so for
    // it `x` is the CENTRE. The placer always treated x as the left edge — so every
    // constellation label claimed (and collision-tested) a box sitting half a label-width
    // to the right of where it actually drew. Half its collision detection was fiction.
    const rectAt = (x: number, y: number): Rect =>
      footprint
        ? { x: centered ? x - footprint.w / 2 : x, y: y - footprint.top, w: footprint.w, h: footprint.top + footprint.bottom }
        : labelRect(x, y, text, fontSize, centered, metrics);

    const candidates: Array<[number, number]> = [];

    if (avoid) {
      // Orbit the object: preferred side, opposite side, above, below — then pushed out.
      const gap = avoid.r + 6;
      const mid = avoid.y + fontSize * 0.35;
      for (const push of [0, h, h * 2]) {
        candidates.push([avoid.x + gap, mid + push]);
        candidates.push([avoid.x - gap - w, mid + push]);
        if (push === 0) {
          candidates.push([avoid.x - w / 2, avoid.y - gap]);
          candidates.push([avoid.x - w / 2, avoid.y + gap + fontSize]);
        }
        candidates.push([avoid.x + gap, mid - push]);
        candidates.push([avoid.x - gap - w, mid - push]);
      }
    } else if (centered) {
      // Centred labels can only move vertically without lying about their anchor.
      for (const dy of [0, h, -h, h * 2, -h * 2, h * 3, -h * 3]) candidates.push([cx, cy + dy]);
    } else {
      // FLIP, don't clip. Try the natural (right-of-object) position and its vertical
      // nudges; then MIRROR to the left of the object. A star near the right edge now puts
      // its name on its left instead of running off the display.
      const mirrored = cx - w - 8;
      for (const dy of [0, h, -h, h * 2, -h * 2, h * 3, -h * 3, h * 4]) {
        candidates.push([cx, cy + dy]);
      }
      for (const dy of [0, h, -h, h * 2, -h * 2]) {
        candidates.push([mirrored, cy + dy]);
      }
    }

    for (const [x, y] of candidates) {
      const r = rectAt(x, y);
      if (!inBounds(r)) continue;
      if (claimed.some((c) => overlaps(c, r))) continue;
      claimed.push(r);
      return { x, y };
    }

    return { x: NaN, y: NaN }; // no clean slot — caller suppresses the label
  };

  /**
   * Claim a display identity for this frame. Returns true the FIRST time a key is seen and
   * false for every repeat, so a label can be rendered at most once per frame no matter how
   * many passes or mounts try to draw it.
   *
   * Priority is mount order, so the earliest (highest-priority) pass wins the identity and
   * any later pass is suppressed — which is the behaviour we want if one ever double-claims.
   */
  place.claimIdentity = (key: string): boolean => {
    if (identities.has(key)) return false;
    identities.add(key);
    return true;
  };
  place.reserve = (x: number, y: number, w: number, h: number) => {
    claimed.push({ x, y, w, h });
  };
  place.reserveCircle = (x: number, y: number, r: number) => {
    claimed.push({ x: x - r, y: y - r, w: r * 2, h: r * 2 });
  };

  return place as LabelPlacer;
}
