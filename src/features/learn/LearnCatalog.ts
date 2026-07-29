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
    id: "moon-orbit-tides",
    categoryId: "moon",
    title: "The Moon’s Orbit and Tides",
    level: "intermediate",
    summary: "The Moon’s orbit controls its changing position, rise times, tidal effects, and the geometry behind eclipses.",
    body: "The Moon travels eastward around Earth, so it rises roughly 50 minutes later from one day to the next. Its orbit is tilted by about five degrees to Earth’s path around the Sun, which is why eclipses do not happen every month.\n\nThe Moon’s gravity produces tidal bulges in Earth’s oceans. When the Sun, Earth, and Moon line up near New or Full Moon, their tidal effects combine into stronger spring tides. Near First and Third Quarter, they partially oppose one another and create weaker neap tides.",
    keyFacts: [
      "The Moon rises later on successive days.",
      "Its tilted orbit prevents monthly eclipses.",
      "Spring and neap tides depend on Sun–Moon geometry."
    ],
    skyLensAction: "Track the Moon",
    archiveAction: "Open Moon card"
  },
  {
    id: "moon-geology-eclipses",
    categoryId: "moon",
    title: "Lunar Geology and Eclipse Geometry",
    level: "advanced",
    summary: "Lunar basins, highlands, regolith, orbital nodes, and shadow geometry reveal the Moon’s history and eclipse behavior.",
    body: "The dark lunar maria are ancient impact basins later flooded by basaltic lava, while the brighter highlands preserve older, heavily cratered crust. Billions of years of impacts have ground the surface into a powdery regolith.\n\nEclipses occur only when the Moon is near one of the two nodes where its tilted orbit crosses the ecliptic. During a lunar eclipse, the Moon passes through Earth’s shadow. During a solar eclipse, the Moon’s much smaller shadow sweeps across part of Earth.",
    keyFacts: [
      "Maria are basalt-filled impact basins.",
      "The highlands are older and more heavily cratered.",
      "Eclipses require alignment near an orbital node."
    ],
    skyLensAction: "Inspect the Moon",
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
    id: "planet-atmospheres-weather",
    categoryId: "planets",
    title: "Planetary Atmospheres and Weather",
    level: "intermediate",
    summary: "Atmospheric composition, pressure, sunlight, rotation, and internal heat create dramatically different planetary climates.",
    body: "Venus has a dense carbon-dioxide atmosphere and runaway greenhouse heating, while Mars has a thin atmosphere that cannot retain much warmth. Jupiter and Saturn generate powerful jet streams and storms within deep hydrogen-rich atmospheres.\n\nA planet’s temperature depends on more than distance from the Sun. Reflectivity, atmospheric thickness, chemistry, rotation rate, and internal heat all shape the weather. Comparing worlds shows why similar starting materials can produce radically different climates.",
    keyFacts: [
      "Venus is hotter than Mercury because of its atmosphere.",
      "Mars loses heat quickly through its thin air.",
      "Giant-planet weather is powered by sunlight and internal heat."
    ],
    skyLensAction: "Compare visible planets",
    archiveAction: "Open Planets"
  },
  {
    id: "planet-formation-dynamics",
    categoryId: "planets",
    title: "Planet Formation and Orbital Dynamics",
    level: "advanced",
    summary: "Protoplanetary disks, migration, resonance, impacts, and atmospheric loss explain how planetary systems acquire their architecture.",
    body: "Planets grow inside rotating disks of gas and dust around young stars. Dust grains collide into larger bodies, planetesimals merge into protoplanets, and giant planets capture gas before the disk disperses.\n\nThe final arrangement is not static. Planets can migrate, enter orbital resonances, scatter smaller bodies, and alter one another’s eccentricities and inclinations. Comparing our Solar System with exoplanet systems reveals that planetary architecture can follow many different paths.",
    keyFacts: [
      "Planets form through growth inside a protoplanetary disk.",
      "Migration can move planets far from their birthplaces.",
      "Orbital resonances can stabilize or destabilize systems."
    ],
    skyLensAction: "Study planetary paths",
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
    skyTarget: { raHours: 5.6, decDegrees: 0, name: "Orion", subtitle: "Constellation", description: "The Hunter — find the three belt stars in a row, with Betelgeuse and Rigel marking opposite corners." }
  },
  {
    id: "seasonal-sky-navigation",
    categoryId: "constellations",
    title: "Seasonal Sky Navigation",
    level: "intermediate",
    summary: "Anchor constellations, circumpolar stars, seasonal motion, and star-hopping turn patterns into a practical sky map.",
    body: "The night sky changes with both hour and season. Circumpolar constellations remain above the horizon all year at many northern latitudes, while other patterns rise and set seasonally.\n\nStar-hopping uses bright patterns as landmarks. The Big Dipper points toward Polaris, Orion’s Belt leads toward Sirius, and the Summer Triangle links Vega, Deneb, and Altair. Once these anchors are familiar, dimmer objects become much easier to locate.",
    keyFacts: [
      "Circumpolar stars never set from some latitudes.",
      "Seasonal visibility comes from Earth’s orbit around the Sun.",
      "Star-hopping uses bright patterns to reach fainter targets."
    ],
    skyLensAction: "Practice star-hopping",
    archiveAction: "Open Constellations"
  },
  {
    id: "coordinates-precession",
    categoryId: "constellations",
    title: "Celestial Coordinates and Precession",
    level: "advanced",
    summary: "Right ascension, declination, local sidereal time, and precession provide a precise framework for mapping the sky.",
    body: "Astronomers describe positions with right ascension and declination, a coordinate grid projected onto the celestial sphere. Local sidereal time tells which right ascension is crossing the meridian at a given moment.\n\nEarth’s rotational axis slowly precesses over roughly 26,000 years, changing the identity of the pole star and gradually shifting equatorial coordinates. Accurate catalogs therefore specify a reference epoch for their coordinates.",
    keyFacts: [
      "Right ascension is analogous to celestial longitude.",
      "Declination is analogous to celestial latitude.",
      "Precession slowly changes the direction of Earth’s axis."
    ],
    skyLensAction: "Explore the coordinate grid",
    archiveAction: "Open Constellations"
  },
  {
    id: "reading-star-color",
    categoryId: "stars",
    title: "Reading Star Color and Brightness",
    level: "beginner",
    summary: "A star’s apparent color and brightness offer simple clues about temperature, distance, and observing conditions.",
    body: "Stars are not all white. Hot stars often look blue-white, Sun-like stars appear yellow-white, and cooler stars can look orange or red. Their apparent brightness depends on both true luminosity and distance.\n\nAtmospheric turbulence makes stars twinkle, especially near the horizon. Comparing stars high in the sky under dark conditions makes their colors easier to notice.",
    keyFacts: [
      "Blue-white stars are generally hotter than red stars.",
      "Apparent brightness is not the same as true luminosity.",
      "Stars twinkle more strongly near the horizon."
    ],
    skyLensAction: "Compare bright stars",
    archiveAction: "Open Stars"
  },
  {
    id: "star-brightness",
    categoryId: "stars",
    title: "Why are some stars brighter?",
    level: "intermediate",
    summary: "A star looks bright because of its true luminosity, distance from Earth, color, and atmospheric conditions.",
    body: "How bright a star looks — its apparent magnitude — depends on both how much light it truly puts out and how far away it is. A modest nearby star can easily outshine a brilliant distant one. The scale runs backward: lower numbers are brighter, and each step of 1 magnitude is about 2.5 times in brightness.\n\nColor is a thermometer. Blue-white stars like Rigel are scorching hot; yellow stars like our Sun are middling; orange and red stars like Betelgeuse are comparatively cool. Sirius, the brightest star in the night sky, is both genuinely luminous and close — just 8.6 light-years away.",
    keyFacts: [
      "Magnitude measures apparent brightness.",
      "Sirius is the brightest star in the night sky.",
      "Star color gives clues about temperature."
    ],
    skyLensAction: "Find Sirius in Sky Lens",
    archiveAction: "Open Stars",
    skyTarget: { raHours: 6.752, decDegrees: -16.716, name: "Sirius", subtitle: "Brightest star", description: "The Dog Star — a hot blue-white star just 8.6 light-years away." }
  },
  {
    id: "stellar-evolution-hr",
    categoryId: "stars",
    title: "Stellar Evolution and the H–R Diagram",
    level: "advanced",
    summary: "Mass determines a star’s path through the Hertzsprung–Russell diagram and ultimately controls how it ends its life.",
    body: "The Hertzsprung–Russell diagram organizes stars by luminosity and temperature. Most spend the majority of their lives on the main sequence, steadily fusing hydrogen in their cores.\n\nWhen core hydrogen runs low, stars expand and move away from the main sequence. Sun-like stars become red giants and end as white dwarfs. Massive stars evolve rapidly, fuse heavier elements, and may explode as supernovae, leaving neutron stars or black holes.",
    keyFacts: [
      "Main-sequence position depends strongly on stellar mass.",
      "Sun-like stars end as white dwarfs.",
      "Massive stars can produce supernovae and compact remnants."
    ],
    skyLensAction: "Compare stellar colors",
    archiveAction: "Open Stars"
  },
  {
    id: "nebulae",
    categoryId: "deep_sky",
    title: "What are Nebulae?",
    level: "beginner",
    summary: "Nebulae are clouds of gas and dust. Some are star nurseries, some are the remains of dying stars, and some block light behind them.",
    body: "Nebulae are vast clouds of gas and dust drifting between the stars. Emission nebulae like the Orion Nebula glow because hot young stars energize their gas; reflection nebulae shine by scattering nearby starlight; dark nebulae are dense enough to blot out the light behind them.\n\nMany are stellar nurseries, where gravity slowly pulls gas together into new stars. Others mark endings — planetary nebulae are glowing shells puffed off by dying Sun-like stars, and supernova remnants are the wreckage of massive stars that exploded.",
    keyFacts: [
      "The Orion Nebula is a bright stellar nursery.",
      "Dark nebulae block background light.",
      "Planetary nebulae are shells from dying stars."
    ],
    skyLensAction: "See the Orion Nebula in Sky Lens",
    archiveAction: "Open Nebulae",
    skyTarget: { raHours: 5.588, decDegrees: -5.39, name: "Orion Nebula", subtitle: "Emission Nebula · M42", description: "A glowing stellar nursery in Orion's sword." }
  },
  {
    id: "galaxies",
    categoryId: "deep_sky",
    title: "What are Galaxies?",
    level: "advanced",
    summary: "Galaxies are vast islands of stars — millions to trillions of them — bound by gravity, often spiralling around a bright core.",
    body: "A galaxy is an enormous gravitationally bound system of stars, gas, dust, and dark matter. Spiral galaxies like our Milky Way and the Andromeda Galaxy have flat rotating disks with curving arms; elliptical galaxies are smooth, rounded swarms of older stars; irregular galaxies have no clear shape.\n\nThey range from dwarf galaxies of a few million stars to giants holding many trillions. The nearest large spiral, Andromeda, is about 2.5 million light-years away.",
    keyFacts: [
      "The Andromeda Galaxy is the nearest large spiral to us.",
      "Spiral, elliptical, and irregular are the main shapes.",
      "Galaxies hold millions to trillions of stars."
    ],
    skyLensAction: "Find the Andromeda Galaxy in Sky Lens",
    archiveAction: "Open Galaxies",
    skyTarget: { raHours: 0.712, decDegrees: 41.27, name: "Andromeda Galaxy", subtitle: "Spiral Galaxy · M31", description: "The nearest large spiral galaxy, 2.5 million light-years away." }
  },
  {
    id: "clusters",
    categoryId: "deep_sky",
    title: "What are Star Clusters?",
    level: "intermediate",
    summary: "Star clusters are groups of stars born together from one cloud — loose open clusters of young stars, or dense globular clusters of ancient ones.",
    body: "Star clusters are families of stars that formed together from a single collapsing cloud of gas, so they share an age and a starting chemistry. Open clusters like the Pleiades are loose groups of young stars, while globular clusters are dense spherical swarms of ancient stars.\n\nBecause a cluster’s stars are all the same distance and age, astronomers use them to study how stars evolve.",
    keyFacts: [
      "The Pleiades is a bright open cluster in Taurus.",
      "Open clusters are young; globular clusters are ancient.",
      "A cluster's stars share one age and birthplace."
    ],
    skyLensAction: "See the Pleiades in Sky Lens",
    archiveAction: "Open Clusters",
    skyTarget: { raHours: 3.79, decDegrees: 24.11, name: "Pleiades", subtitle: "Open Cluster · M45", description: "A glittering knot of hot blue stars in Taurus." }
  },
  {
    id: "remnants",
    categoryId: "deep_sky",
    title: "What are Supernova Remnants?",
    level: "advanced",
    summary: "Supernova remnants are the expanding shells of glowing gas left behind when a massive star ends its life in a colossal explosion.",
    body: "When a massive star runs out of fuel, its core collapses and the star detonates as a supernova. The blast hurls the star's outer layers into space, sweeping up surrounding gas into an expanding shell.\n\nThese remnants seed the galaxy with heavy elements. The Crab Nebula in Taurus is the wreckage of a star seen to explode in the year 1054; at its heart spins a pulsar.",
    keyFacts: [
      "The Crab Nebula is the remnant of a star seen to explode in 1054.",
      "Remnants enrich space with heavy elements.",
      "A pulsar can be left spinning at the centre."
    ],
    skyLensAction: "Find the Crab Nebula in Sky Lens",
    archiveAction: "Open Remnants",
    skyTarget: { raHours: 5.575, decDegrees: 22.01, name: "Crab Nebula", subtitle: "Supernova Remnant · M1", description: "The expanding wreckage of a star seen to explode in 1054." }
  },
  {
    id: "finding-milky-way",
    categoryId: "milky_way",
    title: "Finding the Milky Way",
    level: "beginner",
    summary: "Dark skies, low moonlight, and the right season reveal the Milky Way as a faint river of unresolved starlight.",
    body: "The Milky Way is easiest to see far from city lights, after your eyes have adapted to darkness, and when the Moon is absent or only a thin crescent. It appears as a pale band rather than a sharp object.\n\nIn the Northern Hemisphere, the richer central region is best placed during summer evenings. Let your eyes adapt for at least 20 minutes and avoid bright phone screens while observing.",
    keyFacts: [
      "Dark adaptation makes faint detail easier to see.",
      "Moonlight can wash out the Milky Way.",
      "The brightest central region lies toward Sagittarius."
    ],
    skyLensAction: "Find the Milky Way band",
    archiveAction: "Open Milky Way"
  },
  {
    id: "milky-way-band",
    categoryId: "milky_way",
    title: "The Milky Way Band",
    level: "intermediate",
    summary: "The Milky Way band is the glowing plane of our galaxy seen from inside it, filled with stars, dust lanes, and deep-sky regions.",
    body: "The Milky Way band is our own galaxy seen edge-on from the inside. We sit about two-thirds of the way out in a flat spiral disk, so when we look along the plane we see the merged glow of billions of distant stars.\n\nIts brightest stretch lies toward Sagittarius. Crossing the band are dark dust lanes such as the Great Rift, which block the starlight behind them.",
    keyFacts: [
      "The Milky Way Core is toward Sagittarius.",
      "The Great Rift is a dark dust lane crossing the band.",
      "Best views require dark skies and low moon brightness."
    ],
    skyLensAction: "See the Galactic Core in Sky Lens",
    archiveAction: "Open Milky Way",
    skyTarget: { raHours: 17.76, decDegrees: -28.94, name: "Galactic Core", subtitle: "Center of the Milky Way", description: "The richest visible direction through our galaxy." }
  },
  {
    id: "galactic-structure-dark-matter",
    categoryId: "milky_way",
    title: "Galactic Structure and Dark Matter",
    level: "advanced",
    summary: "The Milky Way’s disk, bulge, bar, halo, spiral structure, and unseen mass reveal a dynamic galaxy shaped by gravity.",
    body: "The Milky Way contains a thin disk of gas and young stars, a thicker older disk, a central bulge and bar, and a vast halo containing globular clusters. Spiral structure organizes star-forming regions without behaving like fixed material arms.\n\nStars orbit faster at large distances than visible matter alone can explain. This rotation curve is one of the major lines of evidence for a massive dark-matter halo surrounding the galaxy.",
    keyFacts: [
      "The Milky Way is a barred spiral galaxy.",
      "Its halo extends far beyond the bright stellar disk.",
      "Galaxy rotation provides evidence for dark matter."
    ],
    skyLensAction: "Explore the Galactic Center",
    archiveAction: "Open Milky Way"
  },
  {
    id: "learn-sky-night-one",
    categoryId: "beginner_path",
    title: "Night 1: Find the Moon",
    level: "beginner",
    summary: "The first step in learning the sky is learning to locate, observe, and describe the Moon.",
    body: "Start with the easiest target in the sky: the Moon. On your first night, simply find it and notice three things — its phase, its brightness, and roughly where it sits above the horizon.\n\nThen check tomorrow's moonrise and moonset times so you know when to look again. Save one observation to your Vault — that small habit is the foundation of everything that follows.",
    keyFacts: [
      "Notice phase, brightness, and position.",
      "Check moonrise and moonset.",
      "Save one Moon note to your Vault."
    ],
    skyLensAction: "Start Night 1",
    archiveAction: "Open 30 Nights"
  }
];

export const FREE_LEARN_LESSON_COUNT = 3;
const freeLearnLessonIds = new Set(
  learnTopics.slice(0, FREE_LEARN_LESSON_COUNT).map((topic) => topic.id)
);

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
