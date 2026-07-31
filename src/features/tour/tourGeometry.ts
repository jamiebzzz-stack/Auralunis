// Guided-tour geometry — PURE. No react-native, storage, or native imports, so every
// placement decision is unit-testable in plain Node (scripts/first-light-selftest.js).
//
// The tour never hardcodes screen coordinates. A step points at a REGISTERED TARGET whose
// on-screen rect is measured at runtime (TourTargetRegistry), and everything here derives
// from that measurement plus the viewport and safe-area insets. If a target cannot be
// measured the helpers degrade to "no spotlight" rather than inventing a position.

export type TourRect = { x: number; y: number; width: number; height: number };
export type TourSize = { width: number; height: number };
export type TourInsets = { top: number; bottom: number; left: number; right: number };

/** Breathing room drawn around the measured control. */
export const DEFAULT_SPOTLIGHT_PADDING = 12;
/** A spotlight is never smaller than a comfortable touch target, even around a tiny glyph. */
export const MIN_SPOTLIGHT_SIZE = 44;
/** Gap between the spotlight and the instruction card. */
export const DEFAULT_CARD_GAP = 14;

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** A measurement is usable only when every component is finite and the box has real area. */
export function isMeasuredRect(rect: Partial<TourRect> | null | undefined): rect is TourRect {
  if (!rect) return false;
  return (
    finite(rect.x) &&
    finite(rect.y) &&
    finite(rect.width) &&
    finite(rect.height) &&
    rect.width > 0 &&
    rect.height > 0
  );
}

/** A viewport is usable only when it has real area — a zero-size layout yields no spotlight. */
export function isUsableSize(size: Partial<TourSize> | null | undefined): size is TourSize {
  if (!size) return false;
  return finite(size.width) && finite(size.height) && size.width > 0 && size.height > 0;
}

function clamp(value: number, low: number, high: number): number {
  if (high < low) return low;
  return Math.min(high, Math.max(low, value));
}

/**
 * The spotlight rect for a measured target: padded, grown to a minimum size, and clamped
 * inside the viewport. Returns null when either the measurement or the viewport is unusable
 * — the caller then renders the step WITHOUT a spotlight (graceful degradation) instead of
 * highlighting an arbitrary corner of the screen.
 */
export function spotlightFor(
  target: Partial<TourRect> | null | undefined,
  screen: Partial<TourSize> | null | undefined,
  padding: number = DEFAULT_SPOTLIGHT_PADDING
): TourRect | null {
  if (!isMeasuredRect(target) || !isUsableSize(screen)) return null;
  const pad = finite(padding) && padding >= 0 ? padding : DEFAULT_SPOTLIGHT_PADDING;

  const centerX = target.x + target.width / 2;
  const centerY = target.y + target.height / 2;
  const width = Math.min(screen.width, Math.max(MIN_SPOTLIGHT_SIZE, target.width + pad * 2));
  const height = Math.min(screen.height, Math.max(MIN_SPOTLIGHT_SIZE, target.height + pad * 2));

  const x = clamp(centerX - width / 2, 0, screen.width - width);
  const y = clamp(centerY - height / 2, 0, screen.height - height);
  return { x, y, width, height };
}

/**
 * Whether a spotlight is worth drawing: it must intersect the viewport meaningfully. A target
 * that has scrolled or animated off-screen produces a degenerate band set, so the caller falls
 * back to the no-spotlight presentation.
 */
export function isSpotlightVisible(spot: TourRect | null, screen: Partial<TourSize>): boolean {
  if (!spot || !isUsableSize(screen)) return false;
  return spot.x < screen.width && spot.y < screen.height && spot.x + spot.width > 0 && spot.y + spot.height > 0;
}

/**
 * The four dimming bands that surround the spotlight (top, bottom, left, right). Rendering
 * dimming as bands rather than a full-screen scrim with a "hole" means the highlighted control
 * is never covered by anything at all — not even a transparent view — so the underlying tap
 * target and its VoiceOver element stay reachable.
 *
 * With no spotlight the result is a single full-viewport band.
 */
export function dimBands(spot: TourRect | null, screen: Partial<TourSize>): TourRect[] {
  if (!isUsableSize(screen)) return [];
  if (!spot || !isSpotlightVisible(spot, screen)) {
    return [{ x: 0, y: 0, width: screen.width, height: screen.height }];
  }
  const left = clamp(spot.x, 0, screen.width);
  const right = clamp(spot.x + spot.width, 0, screen.width);
  const top = clamp(spot.y, 0, screen.height);
  const bottom = clamp(spot.y + spot.height, 0, screen.height);

  const bands: TourRect[] = [
    { x: 0, y: 0, width: screen.width, height: top },
    { x: 0, y: bottom, width: screen.width, height: screen.height - bottom },
    { x: 0, y: top, width: left, height: bottom - top },
    { x: right, y: top, width: screen.width - right, height: bottom - top },
  ];
  return bands.filter((b) => b.width > 0 && b.height > 0);
}

export type CardPlacement = "below" | "above" | "bottom";

/**
 * Where the instruction card sits. Preference order: below the spotlight, above it, then
 * pinned above the bottom safe area. Always inside the safe area, and always clamped so a
 * long (Dynamic Type) card can never be pushed off-screen.
 */
export function cardAnchor(
  spot: TourRect | null,
  screen: Partial<TourSize>,
  insets: Partial<TourInsets> | null | undefined,
  cardHeight: number,
  gap: number = DEFAULT_CARD_GAP
): { top: number; placement: CardPlacement } {
  const safeTop = finite(insets?.top) ? (insets as TourInsets).top : 0;
  const safeBottom = finite(insets?.bottom) ? (insets as TourInsets).bottom : 0;
  const height = finite(cardHeight) && cardHeight > 0 ? cardHeight : 0;
  const space = finite(gap) && gap >= 0 ? gap : DEFAULT_CARD_GAP;

  if (!isUsableSize(screen)) return { top: safeTop, placement: "bottom" };

  const minTop = safeTop + 8;
  const maxTop = Math.max(minTop, screen.height - safeBottom - 8 - height);

  if (spot && isSpotlightVisible(spot, screen)) {
    const below = spot.y + spot.height + space;
    if (below + height <= screen.height - safeBottom - 8) {
      return { top: clamp(below, minTop, maxTop), placement: "below" };
    }
    const above = spot.y - space - height;
    if (above >= minTop) {
      return { top: clamp(above, minTop, maxTop), placement: "above" };
    }
  }
  return { top: maxTop, placement: "bottom" };
}
