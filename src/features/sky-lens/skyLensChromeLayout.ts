// skyLensChromeLayout.ts
// Pure geometry for Sky Lens UI-chrome label avoidance. Given the overlay box, the
// safe-area insets, and the rendered dock height, it returns the rectangles that on-screen
// chrome occupies so the shared label placer can reserve them — no celestial label is then
// drawn under or behind a control. This is the SINGLE SOURCE OF TRUTH for these numbers;
// they mirror the styles in SkyLensScreen so rendering and avoidance can never drift apart.
//
// Sky Lens is a fully rendered, sensor-aligned planetarium; these are ordinary on-screen
// UI controls layered over the rendered sky. No react-native imports: pure math,
// unit-testable in plain Node (see scripts/skylens-label-selftest.js).

export type ChromeRect = { x: number; y: number; w: number; h: number };
export type ChromeInsets = { top: number; bottom: number; left: number; right: number };
export type ChromeBox = { width: number; height: number };

// ── Centralized chrome constants (mirror SkyLensScreen.tsx styles) ────────────────
// topBar: paddingTop = insets.top + 8; its tallest content is the HUD pill —
// paddingVertical 6 (×2) plus up to three text rows (17 + 13 + 13 pt at ~1.3 line height).
const TOP_BAR_PAD_TOP = 8;
const HUD_PILL_MAX_H = 68; // 12 (pad) + ~56 (three text rows) — covers the tallest HUD

// shutter / screenshot control (styles.shutterBtn): 60×60, right: 20, floats at
// bottom = insets.bottom + dockHeight + 16.
const SHUTTER_SIZE = 60;
const SHUTTER_RIGHT = 20;
const SHUTTER_BOTTOM_GAP = 16;

// guidance banner (styles.finder / finderText): centered, bottom = floatAbove + 72,
// intrinsic height ≈ fontSize 17 (×~1.3) + paddingVertical 9 (×2).
const FINDER_BOTTOM_EXTRA = 72;
const FINDER_H = 44;
const FINDER_MAX_W = 340;

// ── Dynamic Type bounds for DECORATIVE chrome (issue #216) ───────────────────────
//
// These labels had no font-scale ceiling, so at accessibility-extra-extra-extra-large the
// Lock Sky chip grew until it spanned most of the viewport (its own text is what sizes it)
// and the guidance banner drifted into it. Capping the MULTIPLIER — not disabling Dynamic
// Type — keeps them legible while bounded. Accessibility labels are separate strings and are
// unaffected, so VoiceOver still reads the full text.
//
// Values are deliberately generous: 1.6× turns the 12pt chip label into ~19pt, and 1.5× turns
// the 17pt banner into ~26pt. Both stay comfortably readable on a phone.
// These MIRROR theme/dynamicType.CHROME_TEXT_SCALE.lockChip / .finderBanner. They are literals
// rather than an import because this module is deliberately dependency-free — the plain-Node
// self-tests load it directly, and a single import would break them. The self-test asserts the
// two tables stay equal, so they cannot drift.
export const LOCK_CHIP_MAX_FONT_SCALE = 1.6;
export const FINDER_MAX_FONT_SCALE = 1.5;

/** Base type sizes, mirroring styles.lockChipText / styles.finderText. */
const LOCK_CHIP_FONT = 12;
const FINDER_FONT = 17;
/** Rough line box for a bold label at these sizes. */
const LINE_HEIGHT_RATIO = 1.3;
/** The Lock Sky chip wraps to at most two lines before truncating. */
const CHROME_MAX_LINES = 2;
/**
 * The guidance banner gets THREE lines. Its longest sentence — "✦ <name> is below the horizon
 * right now" — does not fit two lines at the capped size, and truncating it would destroy the
 * only thing it exists to say.
 */
export const FINDER_MAX_LINES = 3;
/** paddingVertical 9 (×2) on both. */
const CHROME_PAD_V = 9;

/** Minimum touch target for the Lock Sky control. */
export const LOCK_CHIP_MIN_TOUCH = 44;
/** The chip never spans more than this share of the viewport width. */
export const LOCK_CHIP_MAX_WIDTH_FRACTION = 0.72;
/** styles.lockChip sits at insets.bottom + this. */
export const LOCK_CHIP_BOTTOM_GAP = 96;
/** Clear air between the Lock Sky chip and the guidance banner above it. */
export const FINDER_LOCK_GAP = 10;

const clampScale = (fontScale: number | undefined, cap: number): number => {
  const raw = typeof fontScale === "number" && Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  return Math.min(raw, cap);
};

/**
 * Rendered height of the Lock Sky chip at a given system font scale, with the cap applied.
 * At the default scale this is the height the chip has always had, so nothing moves.
 */
export function lockChipHeight(fontScale: number = 1): number {
  const scale = clampScale(fontScale, LOCK_CHIP_MAX_FONT_SCALE);
  const lines = scale > 1.2 ? CHROME_MAX_LINES : 1;
  const text = LOCK_CHIP_FONT * scale * LINE_HEIGHT_RATIO * lines;
  return Math.max(LOCK_CHIP_MIN_TOUCH, text + CHROME_PAD_V * 2);
}

/** Rendered height of the guidance banner at a given system font scale. */
export function finderHeight(fontScale: number = 1): number {
  const scale = clampScale(fontScale, FINDER_MAX_FONT_SCALE);
  const lines = scale > 1.2 ? FINDER_MAX_LINES : 1;
  return Math.max(FINDER_H, FINDER_FONT * scale * LINE_HEIGHT_RATIO * lines + CHROME_PAD_V * 2);
}

/** Clear air between the centred Lock Sky chip and the shutter parked at the right edge. */
export const LOCK_CHIP_SHUTTER_GAP = 8;

/**
 * Width cap for the Lock Sky chip.
 *
 * Three constraints, whichever bites first: a share of the viewport, the screen edges, and —
 * because the chip is centred while the shutter sits at the right edge — twice the distance
 * from centre to the shutter's leading edge. Without the third the chip ran under the shutter
 * at the largest text sizes.
 */
export function lockChipMaxWidth(box: ChromeBox): number {
  if (!(box.width > 0)) return 0;
  const shutterLane = box.width - SHUTTER_RIGHT - SHUTTER_SIZE - LOCK_CHIP_SHUTTER_GAP;
  const clearOfShutter = 2 * Math.max(0, shutterLane - box.width / 2);
  return Math.max(
    120,
    Math.min(box.width * LOCK_CHIP_MAX_WIDTH_FRACTION, box.width - 2 * EDGE_INSET, clearOfShutter)
  );
}

/** Width cap for the guidance banner. */
export function finderMaxWidth(box: ChromeBox): number {
  if (!(box.width > 0)) return 0;
  return Math.max(120, Math.min(FINDER_MAX_W, box.width - 2 * EDGE_INSET));
}

/**
 * How far above the bottom edge the guidance banner sits.
 *
 * Historically a flat `floatAbove + 72`. That is still the answer at the default text size —
 * so default layout is byte-for-byte unchanged — but when the Lock Sky chip grows the banner
 * is lifted to clear it, instead of the two overlapping. Derived from the live insets, the
 * rendered dock and the system font scale; no device-specific numbers.
 */
export function finderBottomOffset(params: {
  insets: ChromeInsets;
  dockHeight: number;
  fontScale?: number;
}): number {
  const { insets, dockHeight, fontScale = 1 } = params;
  const floatAbove = insets.bottom + dockHeight + SHUTTER_BOTTOM_GAP;
  const historical = floatAbove + FINDER_BOTTOM_EXTRA;
  const aboveLockChip = insets.bottom + LOCK_CHIP_BOTTOM_GAP + lockChipHeight(fontScale) + FINDER_LOCK_GAP;
  return Math.max(historical, aboveLockChip);
}

// zoom chip (styles.zoomChip): top-center, top = insets.top + 58, small pill.
const ZOOM_CHIP_TOP_GAP = 58;
const ZOOM_CHIP_W = 96;
const ZOOM_CHIP_H = 30;

// Horizontal edge inset the placer already enforces (labelLayout.LABEL_SAFE_INSET).
const EDGE_INSET = 26;
// Breathing room so a label never kisses a chrome edge.
const PAD = 6;

/**
 * Top exclusion band (px from the top of the box), derived from the safe-area inset plus
 * the real top-bar height — replaces the old hard-coded 108, which under-covered a tall
 * three-line HUD on notched devices (labels tucked under it).
 */
export function chromeTopInset(insets: ChromeInsets): number {
  return insets.top + TOP_BAR_PAD_TOP + HUD_PILL_MAX_H;
}

export type ChromeVisibility = {
  /** Screenshot/shutter control — premium, hidden when a body is selected or cinematic. */
  shutter?: boolean;
  /** Guidance banner (find-mode / moon-finder). */
  finder?: boolean;
  /** Zoom-level chip, shown while zoomed in. */
  zoomChip?: boolean;
};

/**
 * Floating chrome rectangles NOT already covered by the top/bottom exclusion bands: the
 * shutter/screenshot control, the guidance banner, and the zoom chip. Only currently
 * VISIBLE chrome is returned, so hidden controls never suppress a label. `dockHeight` is the
 * rendered dock height (the screen already derives it); `floatAbove` mirrors the screen.
 */
export function chromeAvoidRects(params: {
  box: ChromeBox;
  insets: ChromeInsets;
  dockHeight: number;
  visible?: ChromeVisibility;
  /** System font scale. Defaults to 1, so existing callers and default-size layout are
   *  unchanged; passing the live scale keeps avoidance honest when the banner grows. */
  fontScale?: number;
}): ChromeRect[] {
  const { box, insets, dockHeight, visible = {}, fontScale = 1 } = params;
  const rects: ChromeRect[] = [];
  const floatAbove = insets.bottom + dockHeight + SHUTTER_BOTTOM_GAP;

  if (visible.shutter) {
    const bottomEdge = box.height - floatAbove; // y of the control's bottom edge
    rects.push({
      x: box.width - SHUTTER_RIGHT - SHUTTER_SIZE - PAD,
      y: bottomEdge - SHUTTER_SIZE - PAD,
      w: SHUTTER_SIZE + PAD * 2,
      h: SHUTTER_SIZE + PAD * 2
    });
  }

  if (visible.finder) {
    const w = Math.min(FINDER_MAX_W, box.width - 2 * EDGE_INSET);
    // Same position and height the banner actually renders at, including the lift that keeps
    // it clear of a font-scaled Lock Sky chip — the two can never drift apart.
    const h = finderHeight(fontScale);
    const bottomEdge = box.height - finderBottomOffset({ insets, dockHeight, fontScale });
    rects.push({
      x: (box.width - w) / 2,
      y: bottomEdge - h,
      w,
      h: h + PAD
    });
  }

  if (visible.zoomChip) {
    rects.push({
      x: (box.width - ZOOM_CHIP_W) / 2,
      y: insets.top + ZOOM_CHIP_TOP_GAP - PAD,
      w: ZOOM_CHIP_W,
      h: ZOOM_CHIP_H + PAD * 2
    });
  }

  return rects;
}
