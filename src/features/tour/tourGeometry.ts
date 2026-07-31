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

/**
 * The share of the viewport that must stay clear of the instruction card.
 *
 * At the largest Dynamic Type sizes the card grew until it owned almost the whole screen: the
 * copy was technically scrollable, but "Hold the sky still" then asked the user to drag a sky
 * that had nowhere left to be dragged. Reachable is not the same as usable, so the card is
 * capped and the remainder is guaranteed to the scene.
 */
export const MIN_EXPOSED_SKY_FRACTION = 0.34;

/**
 * A spotlight indicates a control; it does not have to enclose one at any size. A Sky Lens chip
 * whose own label scales with Dynamic Type can become enormous, and a ring drawn tightly around
 * it swallowed most of the dock. These caps keep the ring proportionate and centred on the
 * control. The PADDING never scales with font size — only the measured control does.
 */
export const MAX_SPOTLIGHT_WIDTH_FRACTION = 0.66;
export const MAX_SPOTLIGHT_HEIGHT_FRACTION = 0.18;

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
  // Padded, floored at a comfortable touch size, then CAPPED so an enormous (font-scaled)
  // control cannot produce a ring that covers unrelated chrome.
  const widthCap = Math.max(MIN_SPOTLIGHT_SIZE, screen.width * MAX_SPOTLIGHT_WIDTH_FRACTION);
  const heightCap = Math.max(MIN_SPOTLIGHT_SIZE, screen.height * MAX_SPOTLIGHT_HEIGHT_FRACTION);
  const width = Math.min(screen.width, widthCap, Math.max(MIN_SPOTLIGHT_SIZE, target.width + pad * 2));
  const height = Math.min(screen.height, heightCap, Math.max(MIN_SPOTLIGHT_SIZE, target.height + pad * 2));

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
  gap: number = DEFAULT_CARD_GAP,
  /**
   * Height of a host-owned control strip at the bottom of the screen that the card must not
   * cover (in Sky Lens: the Lock Sky chip, shutter, layer bar, and time panel). The host
   * measures this from its own layout — no screen coordinate is ever hardcoded here.
   */
  reservedBottom: number = 0
): { top: number; placement: CardPlacement } {
  const safeTop = finite(insets?.top) ? (insets as TourInsets).top : 0;
  const rawSafeBottom = finite(insets?.bottom) ? (insets as TourInsets).bottom : 0;
  const reserved = finite(reservedBottom) && reservedBottom > 0 ? reservedBottom : 0;
  // The reserved strip is measured from the screen edge and already includes the home
  // indicator, so the effective floor is whichever of the two reaches higher.
  const safeBottom = Math.max(rawSafeBottom, reserved);
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

/**
 * The tallest the instruction card may be on this viewport, so at least
 * MIN_EXPOSED_SKY_FRACTION of it stays visible once the host's reserved bottom strip is also
 * accounted for. Returns a positive height even on absurdly small viewports.
 */
export function maxCardHeight(
  screen: Partial<TourSize>,
  reservedBottom: number = 0,
  insets: Partial<TourInsets> | null | undefined = null
): number {
  if (!isUsableSize(screen)) return 0;
  const safeTop = finite(insets?.top) ? (insets as TourInsets).top : 0;
  const reserved = finite(reservedBottom) && reservedBottom > 0 ? reservedBottom : 0;
  const mustStayClear = screen.height * MIN_EXPOSED_SKY_FRACTION;
  // The reserved dock is chrome, not sky, so it does not count toward the exposed share.
  const available = screen.height - safeTop - reserved - mustStayClear;
  return Math.max(120, available);
}

/**
 * The share of the viewport that is neither the instruction card nor the host's reserved
 * bottom strip — i.e. the scene the user can actually see and interact with.
 */
export function exposedSkyFraction(args: {
  screen: Partial<TourSize>;
  cardTop: number;
  cardHeight: number;
  reservedBottom?: number;
}): number {
  const { screen, cardTop, cardHeight } = args;
  if (!isUsableSize(screen)) return 0;
  const reserved = finite(args.reservedBottom) && (args.reservedBottom as number) > 0 ? (args.reservedBottom as number) : 0;
  const top = finite(cardTop) ? cardTop : 0;
  const height = finite(cardHeight) && cardHeight > 0 ? cardHeight : 0;

  const cardTopClamped = clamp(top, 0, screen.height);
  const cardBottomClamped = clamp(top + height, 0, screen.height);
  const dockTop = clamp(screen.height - reserved, 0, screen.height);

  // Everything above the card, minus any part of it hidden under the reserved strip.
  const above = Math.max(0, Math.min(cardTopClamped, dockTop));
  // Anything between the card's bottom and the reserved strip (rare, but real when the card
  // is anchored above a low spotlight).
  const below = Math.max(0, dockTop - Math.max(cardBottomClamped, 0));
  return (above + below) / screen.height;
}

/**
 * The usable drag region: the sky above the instruction card and below the top safe area.
 * "Hold the sky still" asks for a drag, and the drag must not have to start on the card.
 */
export function dragRegion(args: {
  screen: Partial<TourSize>;
  cardTop: number;
  insets?: Partial<TourInsets> | null;
}): TourRect | null {
  const { screen, cardTop } = args;
  if (!isUsableSize(screen)) return null;
  const safeTop = finite(args.insets?.top) ? (args.insets as TourInsets).top : 0;
  const top = clamp(finite(cardTop) ? cardTop : screen.height, 0, screen.height);
  const height = top - safeTop;
  if (height <= 0) return null;
  return { x: 0, y: safeTop, width: screen.width, height };
}
