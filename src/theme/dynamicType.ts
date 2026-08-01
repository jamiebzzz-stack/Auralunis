// Shared Dynamic Type policy for DECORATIVE chrome — issue #216.
//
// Dynamic Type stays enabled everywhere. What this file adds is a ceiling for text whose job is
// to label a control or head a screen, so a user at accessibility-extra-extra-extra-large gets
// a legible interface instead of a four-line page title and a card whose heading eats the card.
//
// BODY COPY IS DELIBERATELY ABSENT. Descriptions, lesson text, and instructions scale without a
// ceiling: capping them would trade away the accessibility the setting exists to provide. Only
// chrome — titles, labels, and button captions — is bounded.
//
// Pure module (no react-native imports) so the fit estimates are unit-testable in plain Node
// (see scripts/skylens-dynamic-type-selftest.js).

/**
 * The one table of ceilings. Every decorative label in the app should take its multiplier from
 * here rather than inventing a local number.
 */
export const CHROME_TEXT_SCALE = {
  /** ScreenShell page title, e.g. "Sky Lens + Archive" (29pt). */
  screenTitle: 1.3,
  /** ScreenShell eyebrow above the title, e.g. "SKY" (11pt). */
  screenSubtitle: 1.6,
  /** FeatureCard heading, e.g. "AuraLunis Sky Lens" (18pt). */
  cardTitle: 1.4,
  /** FeatureCard status pill, e.g. "Ready" (11pt). */
  cardStatus: 1.4,
  /** FeatureCard call-to-action caption (15pt default). */
  cardAction: 1.5,
  /** Sky Lens Lock Sky chip label (12pt). */
  lockChip: 1.6,
  /** Sky Lens guidance / finder banner (17pt). */
  finderBanner: 1.5,
} as const;

/** Minimum touch target for any control carrying one of these labels. */
export const CHROME_MIN_TOUCH = 44;

// ── Layout constants these estimates depend on (mirroring the components) ─────────
/** ScreenShell contentContainer padding (styles.content). */
export const SCREEN_CONTENT_PADDING = 18;
/** FeatureCard padding (styles.card). */
export const CARD_PADDING = 16;
/** Width the status pill and its gap reserve inside a card's top row. */
export const CARD_STATUS_LANE = 82;

/**
 * Average glyph advance as a fraction of font size for the app's bold display faces. Chosen on
 * the generous side so the fit checks stay a real constraint rather than a formality.
 */
const AVG_GLYPH_RATIO = 0.55;

const clampScale = (scale: number | undefined, cap: number): number => {
  const raw = typeof scale === "number" && Number.isFinite(scale) && scale > 0 ? scale : 1;
  return Math.min(raw, cap);
};

/** Rendered point size of a label at a given system scale, with its ceiling applied. */
export function cappedFontSize(baseSize: number, systemScale: number, cap: number): number {
  return baseSize * clampScale(systemScale, cap);
}

/** Estimated rendered width of a run of text. */
export function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * AVG_GLYPH_RATIO;
}

/**
 * Estimated line count with greedy word wrapping — and, crucially, mid-word breaking when a
 * single word is wider than the line. That last case is what produced the four-line
 * "AuraL / unis / Sky / Lens" title: no ceiling meant "AuraLunis" alone overflowed the width.
 */
export function estimateLines(text: string, fontSize: number, availableWidth: number): number {
  if (!text || !(availableWidth > 0) || !(fontSize > 0)) return 0;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;

  let lines = 1;
  let used = 0;
  const spaceWidth = estimateTextWidth(" ", fontSize);

  for (const word of words) {
    const wordWidth = estimateTextWidth(word, fontSize);
    if (wordWidth > availableWidth) {
      // The word itself does not fit: it breaks across however many lines it needs.
      if (used > 0) lines += 1;
      lines += Math.ceil(wordWidth / availableWidth) - 1;
      used = wordWidth % availableWidth;
      continue;
    }
    const needed = used === 0 ? wordWidth : used + spaceWidth + wordWidth;
    if (needed <= availableWidth) {
      used = needed;
    } else {
      lines += 1;
      used = wordWidth;
    }
  }
  return lines;
}

/** Usable width for a ScreenShell page title on a given screen. */
export function screenTitleWidth(screenWidth: number): number {
  return Math.max(0, screenWidth - SCREEN_CONTENT_PADDING * 2);
}

/** Usable width for a FeatureCard heading, which shares its row with the status pill. */
export function cardTitleWidth(screenWidth: number): number {
  return Math.max(0, screenWidth - SCREEN_CONTENT_PADDING * 2 - CARD_PADDING * 2 - CARD_STATUS_LANE);
}

/** Usable width for a FeatureCard description, which spans the full card. */
export function cardBodyWidth(screenWidth: number): number {
  return Math.max(0, screenWidth - SCREEN_CONTENT_PADDING * 2 - CARD_PADDING * 2);
}

export type CardHeightInput = {
  title: string;
  description: string;
  screenWidth: number;
  systemScale: number;
  /** Lines the title is allowed before it truncates. */
  titleMaxLines?: number;
};

/**
 * Rough rendered height of a FeatureCard. Used to prove the card stays within a sane bound at
 * the largest text size — the heading and action are capped, while the description is free to
 * grow, which is the intended trade.
 */
export function estimateCardHeight(input: CardHeightInput): number {
  const { title, description, screenWidth, systemScale, titleMaxLines = 2 } = input;
  const titleSize = cappedFontSize(18, systemScale, CHROME_TEXT_SCALE.cardTitle);
  const bodySize = 13 * (Number.isFinite(systemScale) && systemScale > 0 ? systemScale : 1);
  const actionSize = cappedFontSize(15, systemScale, CHROME_TEXT_SCALE.cardAction);

  const titleLines = Math.min(titleMaxLines, estimateLines(title, titleSize, cardTitleWidth(screenWidth)));
  const bodyLines = estimateLines(description, bodySize, cardBodyWidth(screenWidth));

  const titleH = Math.max(titleSize * 1.25 * titleLines, CHROME_MIN_TOUCH * 0);
  const bodyH = bodySize * 1.55 * bodyLines;
  const actionH = Math.max(CHROME_MIN_TOUCH, actionSize * 1.3 + 24);
  return CARD_PADDING * 2 + titleH + 8 + bodyH + 14 + actionH;
}
