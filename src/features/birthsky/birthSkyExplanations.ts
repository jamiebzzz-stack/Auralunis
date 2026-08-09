// birthSkyExplanations.ts — turns a computed BirthSkyProfile into plain-language explanation.
//
// Pure: no React, no react-native, so every string can be generated and checked in plain Node.
//
// TWO RULES GOVERN THIS FILE.
//
// 1. Everything is DERIVED. No month lookup tables, no canned paragraphs chosen by date. Each
//    sentence is built from the values the ephemeris actually produced for that birth moment,
//    which is why the same date in Orlando and Sydney reads differently.
//
// 2. ASTRONOMY AND SYMBOLISM ARE SEPARATE. This file contains ONLY measured sky. Every
//    astrological claim lives in astrologyInterpretation.ts, is attributed to tradition rather
//    than stated as fact, and is rendered under its own heading with a symbolic-not-scientific
//    disclosure. AuraLunis computes real positions; presenting symbolic meaning in the same
//    voice as a measured altitude would quietly undermine all of it.

import type { BirthSkyProfile, BirthPlanet } from "@/services/BirthSkyService";

export interface ExplanationCard {
  id: string;
  /** Card heading — carries the user's own value, e.g. "Moon in Pisces". */
  title: string;
  /** One line visible while collapsed. */
  summary: string;
  /** Paragraphs revealed when expanded. */
  body: string[];
}

const DIRECTIONS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

/** Compass direction for an azimuth in degrees. */
export function directionFor(azimuth: number): string {
  if (!Number.isFinite(azimuth)) return "the horizon";
  const index = Math.round((((azimuth % 360) + 360) % 360) / 45) % 8;
  return DIRECTIONS[index];
}

/** How high something sat, in words a non-astronomer can picture. */
function heightWords(altitude: number): string {
  if (altitude >= 80) return "almost directly overhead";
  if (altitude >= 55) return "high in the sky";
  if (altitude >= 30) return "well clear of the horizon";
  if (altitude > 0) return "low, close to the horizon";
  return "below the horizon";
}

const STATUS_EXPLANATION: Record<BirthPlanet["status"], string> = {
  rising: "It was east of the meridian, so it was still climbing — it would keep getting higher for a while yet.",
  culminating: "It was crossing the meridian, the imaginary line from due north through the zenith to due south. That is the highest a body gets on any given day.",
  setting: "It was west of the meridian, so it had already passed its high point and was sinking toward setting.",
  below: "It was beneath the horizon, on the far side of the Earth from that spot.",
};

const LIGHT_EXPLANATION: Record<string, string> = {
  Daylight: "The Sun was above the horizon, so the sky was blue and only the Moon and the very brightest planets could have been picked out.",
  "Civil twilight": "The Sun was just below the horizon. The brightest stars and planets were beginning to appear while there was still usable light.",
  "Nautical twilight": "The Sun was 6–12° below the horizon. The horizon was still faintly visible and most bright stars were out.",
  "Astronomical twilight": "The Sun was 12–18° below the horizon. To the eye this is essentially night, though the faintest objects were still washed out.",
  Night: "The Sun was more than 18° below the horizon — full astronomical darkness, with the whole sky available.",
};

/**
 * The explanation cards, in reading order. Every card is built from `profile`, so removing a
 * value from the computation removes its explanation rather than leaving stale prose behind.
 *
 * @param exactTimeUsed false when the birth time was unknown and noon was substituted. The
 *        ascendant card says so plainly, because that is the value it most affects.
 */
export function buildExplanationCards(profile: BirthSkyProfile, exactTimeUsed: boolean): ExplanationCard[] {
  const cards: ExplanationCard[] = [];
  const visible = profile.planets.filter((p) => p.visible);

  cards.push({
    id: "sun-sign",
    title: `Sun in ${profile.sunSign}`,
    summary: "Where the Sun sat along the ecliptic",
    body: [
      `On your birth date the Sun's position along the ecliptic — the path it traces against the background stars through the year — fell in the sign of ${profile.sunSign}.`,
      "This is computed from the Sun's actual ecliptic longitude at that moment, not from fixed calendar dates. Those printed date ranges drift by about a day from year to year, which is why people born near a boundary are often told two different signs.",
      "Worth knowing: the tropical signs are measured from the March equinox, and precession has shifted them roughly one sign away from the constellations that share their names. Your Sun was in the sign of " + profile.sunSign + ", which is not necessarily the constellation it appeared in front of.",
    ],
  });

  cards.push({
    id: "moon",
    title: `Moon in ${profile.dominantConstellation}`,
    summary: `${profile.moonPhase} · ${profile.moonIllumination}% lit`,
    body: [
      `At your birth moment the Moon lay in front of the constellation ${profile.dominantConstellation}. That is its real position among the stars, measured from where it actually was, not inferred from the month.`,
      `It was a ${profile.moonPhase.toLowerCase()}, with ${profile.moonIllumination}% of the disc lit as seen from Earth. ${moonPhaseNote(profile)}`,
      "The Moon moves about 13° a day — roughly its own width every hour — so it drifts through the whole sky in a month. The constellation it occupies changes every two or three days.",
    ],
  });

  cards.push({
    id: "ascendant",
    title: `${profile.risingSign} rising in the east`,
    summary: exactTimeUsed ? "The sign on the eastern horizon" : "Approximate — birth time was unknown",
    body: [
      `${profile.risingSign} was climbing over the eastern horizon at that instant. This is the ascendant, and it is the single most time-sensitive value on this page.`,
      "The whole sky turns once a day, so the eastern horizon sweeps through all twelve signs in 24 hours — a new one roughly every two hours. Four minutes of clock time moves it a full degree.",
      exactTimeUsed
        ? "You gave an exact birth time, so this is computed for that moment from local sidereal time and your birthplace's latitude."
        : "No birth time was entered, so local noon was used. The ascendant shown is therefore indicative only — a birth a few hours either side would put a different sign on the horizon.",
    ],
  });

  cards.push({
    id: "light",
    title: `${profile.lightState} at that moment`,
    summary: `Sun ${profile.sunAltitude > 0 ? "+" : ""}${profile.sunAltitude}° relative to the horizon`,
    body: [
      `The Sun was ${Math.abs(profile.sunAltitude)}° ${profile.sunAltitude > 0 ? "above" : "below"} the horizon at your birthplace, which puts that moment in ${profile.lightState.toLowerCase()}.`,
      LIGHT_EXPLANATION[profile.lightState] ?? "",
      "This matters for reading the chart: the positions shown are where those objects genuinely were, but whether anyone could have SEEN them depends on how far the Sun had dropped.",
    ].filter(Boolean),
  });

  cards.push({
    id: "sidereal",
    title: `Local sidereal time ${formatSidereal(profile.localSiderealTimeHours)}`,
    summary: "Which part of the sky faced your meridian",
    body: [
      "Sidereal time is a clock kept by the stars rather than the Sun. A sidereal day is about four minutes shorter than a solar one, because Earth has to turn slightly further each day to bring the Sun back to the same place.",
      `Its practical use: the local sidereal time equals the right ascension currently crossing your meridian. At ${formatSidereal(profile.localSiderealTimeHours)}, that is the part of the celestial sphere that stood due south — highest and best placed — over your birthplace.`,
      "It is also what makes the ascendant computable at all, and why two people born at the same instant in different places see different skies.",
    ],
  });

  cards.push({
    id: "place",
    title: `A ${profile.seasonalSky} sky over ${profile.locationName}`,
    summary: "Why the birthplace changes the chart",
    body: [
      `It was ${profile.seasonalSky} at ${profile.locationName}. Season follows hemisphere, not the calendar — the same date is midsummer north of the equator and midwinter south of it.`,
      "Latitude sets which half of the celestial sphere is ever visible and how steeply objects rise; longitude sets what time of day it was there. Together they decide the entire orientation of this chart.",
      "Two people born at the very same instant, one in Orlando and one in Sydney, get genuinely different charts — different horizon, different ascendant, often one in daylight while the other is in full night.",
    ],
  });

  cards.push({
    id: "above-horizon",
    title: visible.length === 0
      ? "No major planets above your horizon"
      : `${visible.length} planet${visible.length === 1 ? "" : "s"} above your horizon`,
    summary: visible.length === 0
      ? `All ${profile.planets.length} were beneath the horizon`
      : visible.map((p) => p.name).join(", "),
    body: [
      visible.length === 0
        ? `All ${profile.planets.length} major planets were below the horizon at that moment — on the other side of the Earth from your birthplace.`
        : `Of the ${profile.planets.length} major planets, ${visible.length} stood above your local horizon: ${visible.map((p) => p.name).join(", ")}. The rest were beneath it.`,
      "Above the horizon means geometrically in your sky. Whether it was actually visible is a separate question — daylight, altitude and brightness all decide that.",
    ],
  });

  for (const planet of visible) {
    cards.push({
      id: `planet-${planet.name.toLowerCase()}`,
      title: `${planet.name} in ${planet.constellation || "your sky"}`,
      summary: `${planet.altitude}° above the ${directionFor(planet.azimuth)} horizon`,
      body: [
        `${planet.name} stood ${planet.altitude}° above the horizon toward the ${directionFor(planet.azimuth)} — ${heightWords(planet.altitude)}. Altitude is measured from the horizon at 0° to the zenith directly overhead at 90°.`,
        planet.constellation
          ? `It lay in front of the constellation ${planet.constellation}, measured from its real position rather than assumed from the date.`
          : "",
        STATUS_EXPLANATION[planet.status],
      ].filter(Boolean),
    });
  }

  return cards;
}

function moonPhaseNote(profile: BirthSkyProfile): string {
  const pct = profile.moonIllumination;
  if (pct >= 97) return "A full Moon rises as the Sun sets and is up all night, washing out fainter stars.";
  if (pct <= 3) return "A new Moon sits close to the Sun in the sky, leaving the night at its darkest.";
  if (pct >= 45 && pct <= 55) return "At around half lit, the terminator — the day/night line — runs almost straight down the disc, and crater shadows there are at their most dramatic.";
  if (pct > 55) return "A gibbous Moon is more than half lit and bright enough to noticeably brighten the night sky.";
  return "A crescent Moon stays near the Sun, so it is visible only for a while after sunset or before sunrise.";
}

function formatSidereal(hours: number): string {
  if (!Number.isFinite(hours)) return "—";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  const carry = m === 60;
  return `${String(carry ? h + 1 : h).padStart(2, "0")}h ${String(carry ? 0 : m).padStart(2, "0")}m`;
}

/**
 * A short narrative built entirely from the computed values. Returns paragraphs so the screen
 * can space them properly instead of rendering one block.
 */
export function buildSkyStory(profile: BirthSkyProfile, exactTimeUsed: boolean): string[] {
  const visible = profile.planets.filter((p) => p.visible);
  const highest = visible.slice().sort((a, b) => b.altitude - a.altitude)[0];

  const opening = `At that moment over ${profile.locationName}, the sky was in ${profile.lightState.toLowerCase()} — the Sun ${profile.sunAltitude > 0 ? `${profile.sunAltitude}° above` : `${Math.abs(profile.sunAltitude)}° below`} the horizon on a ${profile.seasonalSky} ${profile.sunAltitude > 0 ? "afternoon or morning" : "night"}.`;

  const moon = `The Moon was ${profile.moonIllumination}% lit in its ${profile.moonPhase.toLowerCase()} phase, lying in front of ${profile.dominantConstellation}.`;

  const planets = visible.length === 0
    ? `None of the major planets were above your horizon; every one of them sat on the far side of the Earth.`
    : highest
      ? `${visible.length === 1 ? `${highest.name} was the only major planet above your horizon` : `${visible.length} major planets stood above your horizon, ${highest.name} highest among them`}, ${highest.altitude}° up toward the ${directionFor(highest.azimuth)} in ${highest.constellation || "your sky"}.`
      : "";

  const rising = exactTimeUsed
    ? `${profile.risingSign} was rising in the east, which fixes the orientation of everything on this chart, with local sidereal time at ${formatSidereal(profile.localSiderealTimeHours)}.`
    : `Without an exact birth time this chart uses local noon, so the rising sign — shown as ${profile.risingSign} — is indicative rather than precise.`;

  return [opening, `${moon} ${planets}`.trim(), rising].filter(Boolean);
}

