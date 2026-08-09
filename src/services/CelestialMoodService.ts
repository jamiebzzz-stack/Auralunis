// CelestialMoodService.ts — "How does the sky feel tonight?"
//
// Generates poetic one-line descriptions of sky conditions instead of
// raw data. Transforms "Moon 61%, clouds 12%, seeing good" into
// "A luminous half-moon commands the southern sky. Saturn gleams
// in steady air. An excellent night for quiet observation."
//
// Uses existing ephemeris + weather data. No AI API calls needed —
// this is template-based poetic text generation.

import type { ObserverLocation } from "@/features/sky-lens/accuracy/SkyLensAccuracyTypes";

export interface CelestialMood {
  headline: string;      // "Quiet celestial conditions"
  description: string;   // 2-3 sentence poetic summary
  suggestion: string;    // "Best for: deep sky photography"
  /**
   * Typographic glyph, not an emoji. Emoji render as a boxed colour sticker that reads as
   * clip-art next to AuraLunis's gold-on-midnight type; Learn and Sky Lens already use this
   * glyph set (✦ ☄ ◎ ◇ ☆ ●), so Home was the one screen out of step.
   */
  emoji: string;
  intensity: "serene" | "active" | "spectacular" | "cloudy";
}

interface SkyState {
  moonIllumination: number;
  moonAltitude: number;
  visiblePlanets: string[];
  cloudCover: number;
  seeingScore: number;        // 1-5
  tonightScore: number;       // 0-100
  isGoldenHour: boolean;
  isTwilight: boolean;
  isDarkNight: boolean;
  activeMeteorShower: string | null;
  auroraKp: number;
}

// ─── Moon descriptions by illumination ────────────────────────────────────────

const MOON_MOODS: Array<{ max: number; phrases: string[] }> = [
  { max: 5,   phrases: [
    "A new moon hides in darkness — the stars have the sky to themselves.",
    "The moon is absent tonight, leaving the Milky Way to unfold.",
    "No moonlight competes with the stars. Perfect deep-sky darkness.",
  ]},
  { max: 25,  phrases: [
    "A slender crescent moon hangs low, barely whispering its light.",
    "A thin crescent glows with earthshine on its dark face.",
    "The young moon sets early, giving way to starlight.",
  ]},
  { max: 50,  phrases: [
    "A half-moon divides light and shadow, balanced in the sky.",
    "The quarter moon illuminates the western sky with silver light.",
    "Moonlight softens the darker constellations but planets stand firm.",
  ]},
  { max: 75,  phrases: [
    "A gibbous moon floods the sky with silver, dimming fainter stars.",
    "The waxing moon grows bright — best for planetary observation tonight.",
    "Moonlight washes across the sky. The brightest stars and planets endure.",
  ]},
  { max: 100, phrases: [
    "A full moon reigns, turning night to silver twilight.",
    "The full moon commands the sky — even the Milky Way bows to its light.",
    "Brilliant moonlight tonight. The Moon itself becomes the show.",
  ]},
];

// ─── Sky condition phrases ────────────────────────────────────────────────────

const PLANET_PHRASES: Record<string, string[]> = {
  Venus: [
    "Venus blazes near the horizon, the evening star at her brightest.",
    "The evening star Venus dominates the twilight.",
  ],
  Mars: [
    "Mars glows red, steady and unwavering.",
    "The red planet holds its ground in the constellation.",
  ],
  Jupiter: [
    "Jupiter shines with commanding brilliance.",
    "The king of planets anchors the sky tonight.",
  ],
  Saturn: [
    "Saturn gleams with golden patience in the south.",
    "The ringed planet glows steadily — a jewel even in binoculars.",
  ],
  Mercury: [
    "Elusive Mercury appears briefly near the horizon.",
    "Mercury makes a rare appearance in the twilight.",
  ],
};

const SEEING_PHRASES: string[] = [
  "Unsteady air blurs the view — planets shimmer restlessly.",       // 1
  "Hazy skies soften the starlight.",                                // 2
  "Fair seeing tonight — details emerge with patience.",              // 3
  "Steady air reveals fine detail. A good night to look closely.",    // 4
  "Crystalline seeing — the atmosphere is glass. Exceptional night.", // 5
];

const CLOUD_PHRASES: string[] = [
  "Overcast. The sky is hidden tonight.",
  "Gaps open between the clouds — patience may be rewarded.",
  "Scattered clouds drift through, but clear windows abound.",
  "Mostly clear with wisps of high cloud.",
  "Perfectly clear. Every photon reaches the ground.",
];

const SUGGESTIONS: Record<string, string[]> = {
  deepsky: [
    "Best for: deep sky objects and the Milky Way.",
    "Ideal conditions for nebulae and galaxies.",
    "A dark-sky treasure hunt awaits.",
  ],
  planetary: [
    "Best for: planetary observation and Moon detail.",
    "Planets and the Moon are tonight's main attraction.",
    "Point a telescope at the planets tonight.",
  ],
  photo: [
    "Best for: astrophotography — long exposures will reward you.",
    "Great conditions for Milky Way photography.",
    "Grab your camera — the sky is performing tonight.",
  ],
  casual: [
    "Best for: a quiet evening under the stars.",
    "Step outside and just look up. That's enough.",
    "A gentle night for easy stargazing.",
  ],
  cloudy: [
    "Best for: planning tomorrow's observation.",
    "The clouds will clear — check back in a few hours.",
    "A night for indoor astronomy: research your next target.",
  ],
};

// ─── Mood generation ──────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getMoonPhrase(illum: number): string {
  const bracket = MOON_MOODS.find(b => illum <= b.max) ?? MOON_MOODS[4];
  return pick(bracket.phrases);
}

function getCloudPhrase(cover: number): string {
  if (cover > 80) return CLOUD_PHRASES[0];
  if (cover > 60) return CLOUD_PHRASES[1];
  if (cover > 35) return CLOUD_PHRASES[2];
  if (cover > 15) return CLOUD_PHRASES[3];
  return CLOUD_PHRASES[4];
}

function getSeeingPhrase(score: number): string {
  return SEEING_PHRASES[Math.min(4, Math.max(0, score - 1))];
}

/**
 * Generate a poetic mood description from sky state data.
 * No API calls needed — this is deterministic template generation
 * with randomized phrase selection for variety.
 */
export function generateCelestialMood(sky: SkyState): CelestialMood {
  const parts: string[] = [];

  // Moon
  parts.push(getMoonPhrase(sky.moonIllumination));

  // Best visible planet
  if (sky.visiblePlanets.length > 0) {
    const best = sky.visiblePlanets[0];
    const phrases = PLANET_PHRASES[best];
    if (phrases) parts.push(pick(phrases));
  }

  // Seeing or clouds
  if (sky.cloudCover > 60) {
    parts.push(getCloudPhrase(sky.cloudCover));
  } else {
    parts.push(getSeeingPhrase(sky.seeingScore));
  }

  // Special events
  if (sky.activeMeteorShower) {
    parts.push(`The ${sky.activeMeteorShower} are active — watch for streaks across the sky.`);
  }
  if (sky.auroraKp >= 5) {
    parts.push("Aurora conditions are elevated — scan the northern horizon.");
  }

  // Headline
  let headline: string;
  let emoji: string;
  let intensity: CelestialMood["intensity"];

  if (sky.cloudCover > 70) {
    headline = "Cloudy skies";
    emoji = "◍";
    intensity = "cloudy";
  } else if (sky.tonightScore >= 80) {
    headline = "Spectacular celestial conditions";
    emoji = "✦";
    intensity = "spectacular";
  } else if (sky.tonightScore >= 50) {
    headline = "Good observing conditions";
    emoji = "☾";
    intensity = "active";
  } else {
    headline = "Quiet celestial conditions";
    emoji = "✧";
    intensity = "serene";
  }

  // Suggestion
  let suggestionCategory: string;
  if (sky.cloudCover > 70) {
    suggestionCategory = "cloudy";
  } else if (sky.moonIllumination < 25 && sky.tonightScore >= 70) {
    suggestionCategory = "deepsky";
  } else if (sky.visiblePlanets.length >= 2) {
    suggestionCategory = "planetary";
  } else if (sky.moonIllumination < 30 && sky.seeingScore >= 4) {
    suggestionCategory = "photo";
  } else {
    suggestionCategory = "casual";
  }

  return {
    headline,
    description: parts.join(" "),
    suggestion: pick(SUGGESTIONS[suggestionCategory]),
    emoji,
    intensity,
  };
}
