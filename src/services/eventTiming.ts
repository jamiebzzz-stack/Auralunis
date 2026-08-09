// eventTiming.ts — truthful phrasing for how close a celestial event is.
//
// Pure date arithmetic: no React, no data imports, so every phrase is testable in plain Node.
//
// THE BUG THIS EXISTS TO FIX. The Home hero pulled everything happening within the next SEVEN
// DAYS and labelled all of it "<event> is happening now." On 9 August it therefore announced
// that the Perseids were happening now, while the peak was 12–13 August — and paired that with
// "up to 100 meteors per hour at peak". The underlying event data was correct; only the copy
// lied about when.
//
// Rule applied throughout: "now" is reserved for a date genuinely inside the event window.
// Everything else states the real distance in nights.

/** Where today sits relative to an event's window. */
export type EventProximity =
  | "active"      // inside the window (single-day event today, or mid multi-day event)
  | "tonight"     // begins today
  | "tomorrow"
  | "soon"        // 2–6 nights out
  | "this-week"   // 7+ nights but still inside the surfaced window
  | "past";       // window has closed

export interface EventTiming {
  proximity: EventProximity;
  /** Nights from today until the event opens. Negative once it has started. */
  nightsUntil: number;
  /** Sentence-ready phrase, e.g. "peaks in 3 nights". */
  phrase: string;
}

/** Midnight-anchored day index, so partial days never shift the count. */
function dayNumber(value: Date | string): number {
  const date = typeof value === "string" ? new Date(`${value}T00:00:00`) : value;
  if (Number.isNaN(date.getTime())) return NaN;
  return Math.floor(
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 86400000
  );
}

/**
 * Resolve how to speak about an event's timing.
 *
 * @param startDate ISO date the event begins (its peak date for showers)
 * @param endDate   ISO date it ends; omit for single-day events
 * @param now       evaluation date
 */
export function resolveEventTiming(
  startDate: string,
  endDate: string | undefined,
  now: Date = new Date()
): EventTiming {
  const today = dayNumber(now);
  const start = dayNumber(startDate);
  const end = endDate ? dayNumber(endDate) : start;

  if (Number.isNaN(today) || Number.isNaN(start)) {
    // Unparseable dates must not produce a confident claim.
    return { proximity: "this-week", nightsUntil: 0, phrase: "coming up" };
  }

  const nightsUntil = start - today;

  // Inside the window — the only case that may say "now".
  if (today >= start && today <= end) {
    const multiDay = end > start;
    return {
      proximity: today === start ? "tonight" : "active",
      nightsUntil,
      phrase: multiDay && today > start ? "happening now" : "peaks tonight",
    };
  }

  if (today > end) return { proximity: "past", nightsUntil, phrase: "has passed" };
  if (nightsUntil === 1) return { proximity: "tomorrow", nightsUntil, phrase: "peaks tomorrow" };
  if (nightsUntil <= 6) return { proximity: "soon", nightsUntil, phrase: `peaks in ${nightsUntil} nights` };
  return { proximity: "this-week", nightsUntil, phrase: "coming this week" };
}

/**
 * The Home hero headline for an event.
 *
 * Only a genuinely active event gets "is happening now"; everything else names the real
 * distance, so the headline can never contradict the "at peak" figures in the detail line.
 */
export function eventHeadline(
  name: string,
  startDate: string,
  endDate: string | undefined,
  now: Date = new Date()
): string {
  const timing = resolveEventTiming(startDate, endDate, now);
  switch (timing.proximity) {
    case "active":
      return `${name} is happening now.`;
    case "tonight":
      return `${name} peaks tonight.`;
    case "tomorrow":
      return `${name} peaks tomorrow.`;
    case "soon":
      return `${name} peaks in ${timing.nightsUntil} nights.`;
    case "past":
      return `${name} has passed.`;
    default:
      return `${name} is coming this week.`;
  }
}
