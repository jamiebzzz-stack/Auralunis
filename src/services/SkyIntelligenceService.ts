// SkyIntelligenceService.ts — "Tonight is special"
// Surfaces the ONE most interesting thing in the sky right now.
// Not a list. Not data. A single compelling insight.

import { getUpcomingEvents, getThisWeekEvents } from "@/data/CelestialEvents";
import { eventHeadline, resolveEventTiming } from "@/services/eventTiming";

export interface SkyInsight {
  headline: string;    // "Tonight the Milky Way is magnificent."
  detail: string;      // "The galactic core rises at 9:42 PM..."
  /**
   * Typographic glyph, not emoji. An emoji renders as a boxed colour sticker that reads as
   * clip-art beside AuraLunis's gold-on-midnight type; Learn and Sky Lens already use this set.
   */
  icon: string;
  priority: number;    // higher = more important
  action?: string;     // "Open Sky Lens" / "See in Sky Lens"
}

export function getTonightInsight(
  moonIllumination: number,
  moonAltitude: number,
  cloudCover: number,
  visiblePlanets: string[],
  stargazingScore: number,
): SkyInsight {
  const insights: SkyInsight[] = [];

  // Check for events this week
  // Events within the next week — but the headline states the REAL distance. This loop used to
  // label everything it found "is happening now", so a shower three nights away was announced
  // as active while its detail line quoted the peak rate. The dataset was right; the copy was
  // not. An event already past its window is dropped rather than described.
  const weekEvents = getThisWeekEvents();
  for (const event of weekEvents) {
    if (event.rating < 4) continue;
    const timing = resolveEventTiming(event.date, event.endDate);
    if (timing.proximity === "past") continue;
    insights.push({
      headline: eventHeadline(event.name, event.date, event.endDate),
      detail: event.description,
      icon: event.type === "meteor" ? "✧" : event.type === "eclipse" ? "◐" : "✦",
      // An event actually under way outranks one still days out.
      priority: event.rating * 20 + (timing.proximity === "active" || timing.proximity === "tonight" ? 10 : 0),
      action: "See in Sky Lens",
    });
  }

  // Magnificent night
  if (stargazingScore >= 90) {
    insights.push({
      headline: "Tonight is one of the best nights this month.",
      detail: "Clear skies, minimal moonlight. The Milky Way will be stunning after 10 PM.",
      icon: "✧",
      priority: 95,
      action: "Open Sky Lens",
    });
  } else if (stargazingScore >= 80) {
    insights.push({
      headline: "Tonight is excellent for stargazing.",
      detail: "Good conditions for deep sky observation and astrophotography.",
      icon: "✦",
      priority: 80,
      action: "Open Sky Lens",
    });
  }

  // New moon = dark sky opportunity
  if (moonIllumination < 5) {
    insights.push({
      headline: "New Moon tonight — the darkest sky this month.",
      detail: "Perfect conditions for the Milky Way, faint nebulae, and meteor watching.",
      icon: "◐",
      priority: 85,
    });
  }

  // Bright planets
  if (visiblePlanets.includes("jupiter") && visiblePlanets.includes("saturn")) {
    insights.push({
      headline: "Jupiter and Saturn are both visible tonight.",
      detail: "Two gas giants in one sky. Point your phone south to find them.",
      icon: "🪐",
      priority: 70,
      action: "See in Sky Lens",
    });
  } else if (visiblePlanets.includes("venus")) {
    insights.push({
      headline: "Venus is brilliant tonight.",
      detail: "The brightest planet. Look west after sunset — you can't miss it.",
      icon: "💫",
      priority: 65,
      action: "See in Sky Lens",
    });
  } else if (visiblePlanets.includes("mars")) {
    insights.push({
      headline: "Mars is visible tonight.",
      detail: "The Red Planet glows with an unmistakable amber light.",
      icon: "🔴",
      priority: 60,
      action: "See in Sky Lens",
    });
  }

  // Moon high and bright
  if (moonIllumination > 95 && moonAltitude > 20) {
    insights.push({
      headline: "Full Moon tonight — the sky's main character.",
      detail: "Brilliant and commanding. Deep sky objects will be washed out, but the Moon itself is spectacular.",
      icon: "🌕",
      priority: 75,
    });
  }

  // Cloudy = honest
  if (cloudCover > 70) {
    insights.push({
      headline: "Clouds are blocking the view tonight.",
      detail: "Not ideal for stargazing. Explore Planetarium mode instead.",
      icon: "◍",
      priority: 50,
      action: "Open Planetarium",
    });
  }

  // Sort by priority, return the best one
  insights.sort((a, b) => b.priority - a.priority);

  return insights[0] || {
    headline: "The stars are waiting.",
    detail: "Step outside and look up. AuraLunis will show you what's there.",
    icon: "✦",
    priority: 10,
    action: "Open Sky Lens",
  };
}
