// astrologyInterpretation.ts — traditional Western astrological readings for computed placements.
//
// SYMBOLIC, NOT MEASURED. Everything in this file is cultural interpretation. The placements it
// reads are computed from real ephemeris (see tropicalZodiac.ts), but what those placements are
// said to MEAN is tradition, not measurement, and the screen labels it that way. The measured
// astronomy lives in birthSkyExplanations.ts and the two are never mixed in one section.
//
// Readings are COMPOSED, not stored: each planet contributes what it traditionally governs and
// how it tends to show up, each sign contributes how it colours whatever occupies it, and the
// two are woven per paragraph. 10 bodies × 12 signs is 120 combinations; hand-writing those as
// separate blocks would guarantee that most were thin, and a lookup table of canned paragraphs
// is precisely the pattern the rest of Birth Sky just removed. Composition keeps every reading
// derived from the actual chart.
//
// Deterministic and bundled: no network, no generated text, same chart in → same words out.
//
// Tone rules, applied throughout: nothing is asserted about the person. Phrasing stays on
// "may", "can", "often", "tends to", and claims are attributed to tradition rather than stated
// as fact. No prediction, no destiny, no fortune-cookie lines.

import { ZODIAC_SIGNS, type ZodiacSign } from "./tropicalZodiac";

export interface PlacementReading {
  id: string;
  /** e.g. "Sun in Gemini" */
  title: string;
  /** e.g. "Core identity" */
  subtitle: string;
  /** 2–4 paragraphs. */
  body: string[];
}

export interface ReadingGroup {
  heading: string;
  readings: PlacementReading[];
}

interface PlanetLore {
  /** Display order within its group. */
  body: string;
  subtitle: string;
  /** What the planet traditionally governs. */
  governs: string;
  /** Sentence fragment: "the Sun is traditionally read as ___". */
  traditionally: string;
  /** The arena this planet's strengths tend to appear in. */
  arena: string;
  /** How the tension characteristically bites for this planet. */
  tensionFraming: string;
}

const PLANETS: Record<string, PlanetLore> = {
  Sun: {
    body: "Sun", subtitle: "Core identity",
    governs: "core identity, vitality and the sense of what a life is fundamentally for",
    traditionally: "the centre of the chart — the self a person is growing toward rather than the one they start with",
    arena: "how someone shows up when they are most themselves",
    tensionFraming: "Because the Sun is about identity, this tension tends to be felt as a question of authenticity",
  },
  Moon: {
    body: "Moon", subtitle: "Emotional nature",
    governs: "emotional needs, instinct, and what feels like safety",
    traditionally: "the private interior — the reactions that arrive before thought does",
    arena: "how someone processes feeling, and what they need in order to rest",
    tensionFraming: "Moon tensions are usually felt inwardly first, and often only noticed by others later",
  },
  Ascendant: {
    body: "Ascendant", subtitle: "How you meet the world",
    governs: "first impressions, outward manner and the instinctive approach to anything new",
    traditionally: "the doorway to the chart — the style someone leads with, which need not match what is behind it",
    arena: "how someone comes across before they are known well",
    tensionFraming: "Rising-sign tensions tend to show up as a gap between how someone is read and how they feel",
  },
  Mercury: {
    body: "Mercury", subtitle: "Mind & communication",
    governs: "thinking, language, learning and the mechanics of exchange",
    traditionally: "the messenger — how information is gathered, sorted and passed on",
    arena: "conversation, study, and how someone reasons out loud",
    tensionFraming: "Mercury tensions usually appear in communication before they appear anywhere else",
  },
  Venus: {
    body: "Venus", subtitle: "Love & values",
    governs: "affection, taste, and what is found worth wanting",
    traditionally: "the principle of attraction — what draws someone, and how they draw others",
    arena: "close relationships, aesthetics, and the terms on which someone connects",
    tensionFraming: "Venus tensions tend to surface in relationship, where the cost of the pattern becomes visible",
  },
  Mars: {
    body: "Mars", subtitle: "Drive & assertion",
    governs: "drive, appetite, anger and the capacity to push",
    traditionally: "the will in motion — how someone pursues what they want and defends what is theirs",
    arena: "conflict, ambition, and the moment action is required",
    tensionFraming: "Mars tensions announce themselves under pressure, when patience has run out",
  },
  Jupiter: {
    body: "Jupiter", subtitle: "Growth & opportunity",
    governs: "growth, meaning, faith and the appetite for more",
    traditionally: "the principle of expansion — where someone reaches beyond what they already have",
    arena: "learning, belief, risk and the wider view",
    tensionFraming: "Jupiter's difficulty is rarely lack; it is excess, and knowing when enough has been reached",
  },
  Saturn: {
    body: "Saturn", subtitle: "Discipline & life lessons",
    governs: "structure, limit, responsibility and earned competence",
    traditionally: "the principle of form — what has to be built slowly and cannot be shortcut",
    arena: "work, commitment and the long consequences of choices",
    tensionFraming: "Saturn tends to be felt as pressure long before it is felt as mastery",
  },
  Uranus: {
    body: "Uranus", subtitle: "Change & individuality",
    governs: "disruption, independence and the refusal to be standard",
    traditionally: "the break in the pattern — where convention stops being obeyed",
    arena: "originality, and the willingness to be the odd one out",
    tensionFraming: "Uranus moves slowly through each sign, so this reads as a generational current more than a personal trait",
  },
  Neptune: {
    body: "Neptune", subtitle: "Imagination & ideals",
    governs: "imagination, longing, compassion and the dissolving of edges",
    traditionally: "the principle of merging — where the boundary between self and world softens",
    arena: "art, faith, empathy, and the pull of what might be",
    tensionFraming: "Neptune's difficulty is clarity: idealisation is hard to tell apart from vision while inside it",
  },
  Pluto: {
    body: "Pluto", subtitle: "Transformation & power",
    governs: "depth, power, and what survives being taken apart",
    traditionally: "the principle of transformation — what cannot be kept, and what is rebuilt afterwards",
    arena: "crisis, intensity and the handling of power",
    tensionFraming: "Pluto's tension is control: holding on tightest to exactly what has to be released",
  },
};

const SIGN_BY_NAME: Record<string, ZodiacSign> = Object.fromEntries(
  ZODIAC_SIGNS.map((s) => [s.name, s])
);

const GROUPS: ReadonlyArray<{ heading: string; bodies: string[] }> = [
  { heading: "THE BIG THREE", bodies: ["Sun", "Moon", "Ascendant"] },
  { heading: "PERSONAL PLANETS", bodies: ["Mercury", "Venus", "Mars"] },
  { heading: "GROWTH & STRUCTURE", bodies: ["Jupiter", "Saturn"] },
  { heading: "OUTER PLANETS", bodies: ["Uranus", "Neptune", "Pluto"] },
];

const MODALITY_NOTE: Record<ZodiacSign["modality"], string> = {
  Cardinal: "As a cardinal sign it tends to initiate — the impulse is to start something and set a direction.",
  Fixed: "As a fixed sign it tends to sustain — once a position is taken it is held, for better and worse.",
  Mutable: "As a mutable sign it tends to adapt — the shape shifts readily to meet whatever the situation asks.",
};

/** One placement's reading, composed from the planet's lore and the sign's colouring. */
export function readingFor(bodyName: string, signName: string): PlacementReading | null {
  const planet = PLANETS[bodyName];
  const sign = SIGN_BY_NAME[signName];
  if (!planet || !sign) return null;

  const isAscendant = bodyName === "Ascendant";
  const title = isAscendant ? `${sign.name} Rising` : `${bodyName} in ${sign.name}`;
  const subject = isAscendant ? "the rising sign" : `the ${bodyName}`;

  const opening =
    `In traditional Western astrology ${subject} governs ${planet.governs}, and is read as ${planet.traditionally}. ` +
    `Placed in ${sign.name}, that is expressed ${sign.expression}. ${MODALITY_NOTE[sign.modality]}`;

  const article = /^[aeiou]/i.test(sign.element) ? "an" : "a";
  const strengths =
    `${sign.name} is ${article} ${sign.element.toLowerCase()} sign traditionally ruled by ${sign.ruler}, and the ` +
    `strengths tradition associates with it are ${sign.strength}. Carried by ${subject}, those qualities tend to ` +
    `surface in ${planet.arena} — often most visibly when the situation calls for exactly what ${sign.name} does ` +
    `well, and least so when it calls for the opposite.`;

  const tensions =
    `${planet.tensionFraming}. The difficulty tradition attaches to ${sign.name} is ${sign.tension}, and with ` +
    `${subject} it can show up as the strength above pushed slightly too far. Astrological practice generally treats ` +
    `this as something to work with rather than a fixed flaw.`;

  return { id: `${bodyName.toLowerCase()}-${sign.name.toLowerCase()}`, title, subtitle: planet.subtitle, body: [opening, strengths, tensions] };
}

/**
 * All readings the chart supports, grouped. Bodies without a computed placement are omitted —
 * a reading is never produced for a position that was not calculated.
 *
 * @param placements body name → tropical sign, from computeBirthSky
 * @param ascendantSign the separately-computed rising sign
 */
export function buildInterpretationGroups(
  placements: Record<string, string>,
  ascendantSign: string
): ReadingGroup[] {
  const resolved: Record<string, string> = { ...placements, Ascendant: ascendantSign };
  const groups: ReadingGroup[] = [];
  for (const group of GROUPS) {
    const readings = group.bodies
      .map((body) => (resolved[body] ? readingFor(body, resolved[body]) : null))
      .filter((r): r is PlacementReading => r !== null);
    if (readings.length > 0) groups.push({ heading: group.heading, readings });
  }
  return groups;
}

// ── Personality portrait ─────────────────────────────────────────────────────
//
// A synthesis, not a re-listing. The interaction logic is real: elements and modalities are
// compared across the six personal placements, and the text describes where they reinforce one
// another and where they pull in different directions.

const ELEMENT_PAIR: Record<string, string> = {
  "Fire|Air": "traditionally read as an easy pairing — enthusiasm and ideas feed each other",
  "Air|Fire": "traditionally read as an easy pairing — ideas and enthusiasm feed each other",
  "Earth|Water": "traditionally read as an easy pairing — practicality and feeling steady one another",
  "Water|Earth": "traditionally read as an easy pairing — feeling and practicality steady one another",
  "Fire|Water": "traditionally read as an awkward pairing — drive and sensitivity operate at different speeds",
  "Water|Fire": "traditionally read as an awkward pairing — sensitivity and drive operate at different speeds",
  "Earth|Air": "traditionally read as an awkward pairing — concrete and abstract want different kinds of proof",
  "Air|Earth": "traditionally read as an awkward pairing — abstract and concrete want different kinds of proof",
  "Fire|Earth": "traditionally read as a working contrast — momentum meets the thing that asks it to be practical",
  "Earth|Fire": "traditionally read as a working contrast — practicality meets the thing that asks it to move",
  "Air|Water": "traditionally read as a working contrast — the wish to analyse a feeling meets the feeling itself",
  "Water|Air": "traditionally read as a working contrast — the feeling itself meets the wish to analyse it",
};

export function buildPersonalityPortrait(
  placements: Record<string, string>,
  ascendantSign: string,
  exactTimeUsed: boolean
): string[] {
  const get = (name: string) => SIGN_BY_NAME[name === "Ascendant" ? ascendantSign : placements[name]];
  const sun = get("Sun");
  const moon = get("Moon");
  const rising = get("Ascendant");
  if (!sun || !moon) return [];

  const paragraphs: string[] = [];

  // 1. Sun / Moon — the classic identity-versus-instinct comparison.
  const sunMoon = sun.element === moon.element
    ? `Sun and Moon both fall in ${sun.element.toLowerCase()} signs here, which tradition reads as an unusually consistent chart: what this person wants and what they need tend to point the same way. The risk it names is a blind spot — with little internal friction, there is less to prompt a second look.`
    : `The Sun in ${sun.name} and the Moon in ${moon.name} put identity and instinct in different elements — ${ELEMENT_PAIR[`${sun.element}|${moon.element}`] ?? "a combination tradition reads as a genuine internal contrast"}. Astrologically this is often described as wanting one thing and needing another, which can read as complexity from inside and as range from outside.`;
  paragraphs.push(sunMoon);

  // 2. Rising against the Sun — the outward/inward gap.
  if (rising) {
    paragraphs.push(
      rising.element === sun.element
        ? `With ${rising.name} rising, the outward manner runs in the same element as the Sun, so first impressions tend to be a fair guide to what is underneath — people usually meet roughly who is there.`
        : `${rising.name} rising sets an outward manner in a different element from the Sun in ${sun.name}. Tradition reads this as a gap between how someone is met and how they experience themselves — often described as being consistently misjudged in one particular direction until better known.`
    );
  }

  // 3. Elemental balance across the six personal placements — computed, not asserted.
  const personal = ["Sun", "Moon", "Ascendant", "Mercury", "Venus", "Mars"]
    .map(get)
    .filter((s): s is ZodiacSign => Boolean(s));
  const counts = personal.reduce<Record<string, number>>((acc, s) => {
    acc[s.element] = (acc[s.element] ?? 0) + 1;
    return acc;
  }, {});
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const missing = (["Fire", "Earth", "Air", "Water"] as const).filter((e) => !counts[e]);
  const [topElement, topCount] = ranked[0];

  let balance = `Across the six personal placements, ${topElement.toLowerCase()} appears ${topCount} time${topCount === 1 ? "" : "s"}`;
  const rest = ranked.slice(1).map(([e, n]) => `${e.toLowerCase()} (${n})`);
  const restList = rest.length > 1 ? `${rest.slice(0, -1).join(", ")} and ${rest[rest.length - 1]}` : rest[0];
  balance += rest.length ? `, ahead of ${restList}.` : ".";
  balance += missing.length
    ? ` ${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} unrepresented, which tradition tends to read not as absence but as the quality most likely to be sought out in other people.`
    : ` All four elements are represented, which is usually read as a chart with access to several different modes rather than one dominant style.`;
  paragraphs.push(balance);

  // 4. Modality — how change tends to be handled.
  const modalities = personal.reduce<Record<string, number>>((acc, s) => {
    acc[s.modality] = (acc[s.modality] ?? 0) + 1;
    return acc;
  }, {});
  const topModality = Object.entries(modalities).sort((a, b) => b[1] - a[1])[0][0];
  const MODALITY_SYNTHESIS: Record<string, string> = {
    Cardinal: "Cardinal signs dominate, which is read as a preference for starting things and setting direction, with follow-through the part that may need deliberate attention.",
    Fixed: "Fixed signs dominate, read as staying power and consistency — with the corresponding difficulty being changing course once committed.",
    Mutable: "Mutable signs dominate, read as adaptability and comfort with shifting conditions — with the corresponding difficulty being holding one line long enough to see it through.",
  };
  paragraphs.push(MODALITY_SYNTHESIS[topModality]);

  if (!exactTimeUsed) {
    paragraphs.push(
      "One caveat: no exact birth time was given, so the rising sign — and anything above that depends on it — is indicative rather than precise. The rising sign changes roughly every two hours."
    );
  }

  return paragraphs;
}

/** The one-line disclosure shown at the top of the interpretation section. */
export const ASTROLOGY_DISCLOSURE =
  "Based on traditional Western astrology. These interpretations are symbolic rather than scientific measurements.";

/** Short explanation of why the two frames disagree. Kept brief on purpose. */
export const FRAME_DIFFERENCE_NOTE =
  "Astronomy and astrology use different maps of the same sky. IAU constellations are irregular regions with ragged official boundaries — there are 13 along the Sun's path, including Ophiuchus. Tropical zodiac signs are twelve exactly equal 30° divisions measured from the March equinox. Because the equinox drifts about one degree every 72 years, the two have separated by roughly a full sign since the zodiac was named, so a planet's constellation and its sign usually differ.";
