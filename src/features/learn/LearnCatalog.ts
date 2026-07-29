import type { LearnTopic } from "./LearnTypes";

export const learnTopics: LearnTopic[] = [
  {
    id: "what-is-solar-system",
    categoryId: "solar_system",
    title: "What is the Solar System?",
    level: "beginner",
    summary: "The Solar System is the Sun and everything gravitationally bound to it: planets, moons, asteroids, comets, and dust.",
    body: "Our Solar System formed about 4.6 billion years ago from a collapsing cloud of gas and dust. The Sun ignited at the center, and the leftover material settled into a spinning disk that became the planets.\n\nEverything you watch move against the stars — the planets, the Moon, the occasional comet — belongs to this family, held in orbit by the Sun's gravity. Beyond Neptune lies the Kuiper Belt, and far out in the dark, the Oort Cloud where comets are born.",
    keyFacts: [
      "The Sun contains most of the Solar System’s mass.",
      "Planets orbit the Sun along predictable paths.",
      "Moons orbit planets, while asteroids and comets follow their own paths."
    ],
    skyLensAction: "Show planetary paths",
    archiveAction: "Open Solar System"
  },
  {
    id: "moon-phases",
    categoryId: "moon",
    title: "Moon Phases",
    level: "beginner",
    summary: "Moon phases happen because we see different portions of the Moon’s sunlit half as it orbits Earth.",
    body: "The Moon makes no light of its own — it shines by reflecting sunlight. As it orbits Earth, the angle between the Sun, Earth, and Moon changes, so we see more or less of its lit half. That full cycle from New to Full and back is called a lunation, and it takes about 29.5 days.\n\nA waxing Moon grows fuller night by night and sets after sunset, perfect for early-evening viewing. A waning Moon shrinks and rises late. The terminator — the line dividing lit from shadowed terrain — is where shadows are longest and craters look the most dramatic through binoculars.",
    keyFacts: [
      "New Moon means the sunlit side faces mostly away from Earth.",
      "Full Moon means the sunlit side faces Earth.",
      "The cycle takes about 29.5 days."
    ],
    skyLensAction: "Find the Moon",
    archiveAction: "Open Moon card"
  },
  {
    id: "inner-outer-planets",
    categoryId: "planets",
    title: "Inner vs Outer Planets",
    level: "beginner",
    summary: "Mercury, Venus, Earth, and Mars are rocky inner planets. Jupiter, Saturn, Uranus, and Neptune are large outer planets.",
    body: "The four inner planets — Mercury, Venus, Earth, and Mars — are small, dense, and rocky, close enough to the Sun that they lost most of their light gases long ago. The four outer planets are giants: Jupiter and Saturn are mostly hydrogen and helium, while Uranus and Neptune hold more water, ammonia, and methane ices.\n\nTo the naked eye, Venus and Jupiter are brilliant and unmistakable, Mars glows distinctly orange, and Saturn shines a steady gold. A quick trick: unlike stars, planets barely twinkle — their tiny disks hold steady where a point-like star shimmers.",
    keyFacts: [
      "Inner planets are smaller and rocky.",
      "Outer planets are larger and colder.",
      "Jupiter and Saturn are gas giants; Uranus and Neptune are ice giants."
    ],
    skyLensAction: "Find a planet",
    archiveAction: "Open Planets"
  },
  {
    id: "what-are-constellations",
    categoryId: "constellations",
    title: "What are Constellations?",
    level: "beginner",
    summary: "Constellations are named regions of the sky. Their star patterns helped people navigate, tell stories, and track seasons.",
    body: "A constellation is a pattern the eye links together, but the stars in it usually lie at wildly different distances — they only look close because they fall along the same line of sight. The 88 modern constellations divide the entire sky into regions, like countries on a map.\n\nWhich ones you can see depends on the season and your latitude, because Earth's night side faces different parts of space as we orbit the Sun. Learn a few bright anchor patterns first — Orion in winter, the Summer Triangle overhead in summer, the Big Dipper year-round in the north — and they become signposts to everything else.",
    keyFacts: [
      "There are 88 official constellations.",
      "Stars in a constellation are usually not physically close together.",
      "Constellations change visibility with season and location."
    ],
    skyLensAction: "See Orion in Sky Lens",
    archiveAction: "Open Constellations",
    skyTarget: { raHours: 5.6, decDegrees: 0, name: "Orion", subtitle: "Constellation", description: "The Hunter — find the three belt stars in a row, with Betelgeuse (orange) and Rigel (blue-white) at the shoulders and knees." }
  },
  {
    id: "star-brightness",
    categoryId: "stars",
    title: "Why are some stars brighter?",
    level: "intermediate",
    summary: "A star looks bright because of its true luminosity, distance from Earth, color, and atmospheric conditions.",
    body: "How bright a star looks — its apparent magnitude — depends on both how much light it truly puts out and how far away it is. A modest nearby star can easily outshine a brilliant distant one. The scale runs backward: lower numbers are brighter, and each step of 1 magnitude is about 2.5× in brightness.\n\nColor is a thermometer. Blue-white stars like Rigel are scorching hot; yellow stars like our Sun are middling; orange and red stars like Betelgeuse are comparatively cool. Sirius, the brightest star in the night sky, is both genuinely luminous and close — just 8.6 light-years away.",
    keyFacts: [
      "Magnitude measures apparent brightness.",
      "Sirius is the brightest star in the night sky.",
      "Star color gives clues about temperature."
    ],
    skyLensAction: "Find Sirius in Sky Lens",
    archiveAction: "Open Stars",
    skyTarget: { raHours: 6.752, decDegrees: -16.716, name: "Sirius", subtitle: "Brightest star", description: "The Dog Star — the brightest star in the night sky, a hot blue-white sun just 8.6 light-years away." }
  },
  {
    id: "nebulae",
    categoryId: "deep_sky",
    title: "What are Nebulae?",
    level: "beginner",
    summary: "Nebulae are clouds of gas and dust. Some are star nurseries, some are the remains of dying stars, and some block light behind them.",
    body: "Nebulae are vast clouds of gas and dust drifting between the stars. Emission nebulae like the Orion Nebula glow because hot young stars energize their gas; reflection nebulae shine by scattering nearby starlight; dark nebulae are dense enough to blot out the light behind them.\n\nMany are stellar nurseries, where gravity slowly pulls gas together into new stars. Others mark endings — planetary nebulae are glowing shells puffed off by dying Sun-like stars, and supernova remnants are the wreckage of massive stars that exploded. Under dark skies the Orion Nebula is visible to the naked eye as a faint fuzzy patch in Orion's sword.",
    keyFacts: [
      "The Orion Nebula is a bright stellar nursery.",
      "Dark nebulae block background light.",
      "Planetary nebulae are shells from dying stars."
    ],
    skyLensAction: "See the Orion Nebula in Sky Lens",
    archiveAction: "Open Nebulae",
    skyTarget: { raHours: 5.588, decDegrees: -5.39, name: "Orion Nebula", subtitle: "Emission Nebula · M42", description: "A glowing stellar nursery in Orion's sword — a rosy cloud of hydrogen birthing new suns, faintly visible to the naked eye." }
  },
  {
    id: "galaxies",
    categoryId: "deep_sky",
    title: "What are Galaxies?",
    level: "advanced",
    summary: "Galaxies are vast islands of stars — millions to trillions of them — bound by gravity, often spiralling around a bright core.",
    body: "A galaxy is an enormous gravitationally bound system of stars, gas, dust, and dark matter. Spiral galaxies like our Milky Way and the Andromeda Galaxy have flat rotating disks with curving arms; elliptical galaxies are smooth, rounded swarms of older stars; irregular galaxies have no clear shape, often disturbed by past collisions.\n\nThey range from dwarf galaxies of a few million stars to giants holding many trillions. Most lie far beyond our own — the nearest large spiral, Andromeda, is about 2.5 million light-years away, yet on a dark night it shows to the naked eye as a faint elongated smudge. Through a telescope, galaxies reveal cores, arms, and dust lanes.",
    keyFacts: [
      "The Andromeda Galaxy is the nearest large spiral to us.",
      "Spiral, elliptical, and irregular are the main shapes.",
      "Galaxies hold millions to trillions of stars."
    ],
    skyLensAction: "Find the Andromeda Galaxy in Sky Lens",
    archiveAction: "Open Galaxies",
    skyTarget: { raHours: 0.712, decDegrees: 41.27, name: "Andromeda Galaxy", subtitle: "Spiral Galaxy · M31", description: "The nearest large spiral galaxy, 2.5 million light-years away — a faint elongated glow visible to the naked eye under dark skies." }
  },
  {
    id: "clusters",
    categoryId: "deep_sky",
    title: "What are Star Clusters?",
    level: "intermediate",
    summary: "Star clusters are groups of stars born together from one cloud — loose open clusters of young stars, or dense globular clusters of ancient ones.",
    body: "Star clusters are families of stars that formed together from a single collapsing cloud of gas, so they share an age and a starting chemistry. Open clusters like the Pleiades are loose, irregular groups of a few hundred young, hot stars scattered along the Milky Way's disk. Globular clusters are tight, spherical swarms of hundreds of thousands of very old stars orbiting in the galaxy's halo.\n\nBecause a cluster's stars are all the same distance and age, astronomers use them to study how stars evolve. The Pleiades, in Taurus, is the most famous open cluster — a small dipper-shaped knot of blue stars easily seen with the naked eye.",
    keyFacts: [
      "The Pleiades is a bright open cluster in Taurus.",
      "Open clusters are young; globular clusters are ancient.",
      "A cluster's stars share one age and birthplace."
    ],
    skyLensAction: "See the Pleiades in Sky Lens",
    archiveAction: "Open Clusters",
    skyTarget: { raHours: 3.79, decDegrees: 24.11, name: "Pleiades", subtitle: "Open Cluster · M45", description: "A glittering knot of hot blue stars in Taurus — the most famous open cluster, easily seen with the naked eye." }
  },
  {
    id: "remnants",
    categoryId: "deep_sky",
    title: "What are Supernova Remnants?",
    level: "advanced",
    summary: "Supernova remnants are the expanding shells of glowing gas left behind when a massive star ends its life in a colossal explosion.",
    body: "When a massive star runs out of fuel, its core collapses and the star detonates as a supernova, briefly outshining its entire galaxy. The blast hurls the star's outer layers into space at thousands of kilometres per second, sweeping up surrounding gas into a glowing, expanding shell — a supernova remnant.\n\nThese remnants seed the galaxy with the heavy elements forged in the explosion, the raw material for new stars and planets. The Crab Nebula in Taurus is the wreckage of a star seen to explode in the year 1054; at its heart spins a pulsar, the dense neutron-star core left behind.",
    keyFacts: [
      "The Crab Nebula is the remnant of a star seen to explode in 1054.",
      "Remnants enrich space with heavy elements.",
      "A pulsar can be left spinning at the centre."
    ],
    skyLensAction: "Find the Crab Nebula in Sky Lens",
    archiveAction: "Open Remnants",
    skyTarget: { raHours: 5.575, decDegrees: 22.01, name: "Crab Nebula", subtitle: "Supernova Remnant · M1", description: "The expanding wreckage of a star seen to explode in 1054, with a pulsar spinning at its heart." }
  },
  {
    id: "milky-way-band",
    categoryId: "milky_way",
    title: "The Milky Way Band",
    level: "intermediate",
    summary: "The Milky Way band is the glowing plane of our galaxy seen from inside it, filled with stars, dust lanes, and deep-sky regions.",
    body: "The Milky Way band is our own galaxy seen edge-on from the inside. We sit about two-thirds of the way out in a flat spiral disk, so when we look along the plane of that disk we see the merged glow of billions of distant stars as a soft river of light.\n\nIts brightest, richest stretch lies toward the constellation Sagittarius — the direction of the galactic core. Crossing the band are the dark lanes of the Great Rift, dust clouds that block the starlight behind them. You need genuinely dark skies and little moonlight to see it well; from a city, light pollution washes it out entirely.",
    keyFacts: [
      "The Milky Way Core is toward Sagittarius.",
      "The Great Rift is a dark dust lane crossing the band.",
      "Best views require dark skies and low moon brightness."
    ],
    skyLensAction: "See the Galactic Core in Sky Lens",
    archiveAction: "Open Milky Way",
    skyTarget: { raHours: 17.76, decDegrees: -28.94, name: "Galactic Core", subtitle: "Center of the Milky Way", description: "Toward Sagittarius lies the heart of our galaxy — the brightest, richest stretch of the Milky Way band." }
  },
  {
    id: "learn-sky-night-one",
    categoryId: "beginner_path",
    title: "Night 1: Find the Moon",
    level: "beginner",
    summary: "The first step in learning the sky is learning to locate, observe, and describe the Moon.",
    body: "Start with the easiest target in the sky: the Moon. On your first night, simply find it and notice three things — its phase (how much is lit), its brightness, and roughly where it sits above the horizon.\n\nThen check tomorrow's moonrise and moonset times so you know when to look again. The Moon drifts about 12° east each night and rises roughly 50 minutes later, making it a perfect first lesson in how the whole sky moves. Save one observation to your Vault — that small habit is the foundation of everything that follows.",
    keyFacts: [
      "Notice phase, brightness, and position.",
      "Check moonrise and moonset.",
      "Save one Moon note to your Vault."
    ],
    skyLensAction: "Start Night 1",
    archiveAction: "Open 30 Nights"
  }
];

// The first N lessons (by catalog order) are the free "starter section" of Learn; every lesson
// beyond that is premium ("Advanced Learn content"). Single source of truth for the split.
export const FREE_LEARN_LESSON_COUNT = 3;
const freeLearnLessonIds = new Set(
  learnTopics.slice(0, FREE_LEARN_LESSON_COUNT).map((topic) => topic.id)
);

// True for the free starter lessons; false for premium (advanced) lessons.
export function isLearnLessonFree(topicId: string): boolean {
  return freeLearnLessonIds.has(topicId);
}

export const learnCategories = [
  { id: "solar_system", title: "Solar System", icon: "☉", description: "Sun, planets, moons, orbits, asteroids, and comets." },
  { id: "moon", title: "Moon", icon: "☾", description: "Phases, moonrise, moonset, brightness, and lunar observations." },
  { id: "planets", title: "Planets", icon: "♃", description: "Mercury through Neptune with science, mythology, and visibility." },
  { id: "constellations", title: "Constellations", icon: "✦", description: "Constellation stories, seasons, mythology, and how to trace the sky." },
  { id: "stars", title: "Stars", icon: "★", description: "Bright stars, magnitude, color, distance, and star life cycles." },
  { id: "deep_sky", title: "Deep Sky", icon: "☄", description: "Nebulae, galaxies, star clusters, and supernova remnants." },
  { id: "milky_way", title: "Milky Way", icon: "◎", description: "Galaxy Mode, Milky Way band, core, dust lanes, and viewing conditions." },
  { id: "beginner_path", title: "30 Nights", icon: "◇", description: "A guided beginner course for learning the sky step by step." }
] as const;
