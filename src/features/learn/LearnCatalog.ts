import type { DeepSkySubject, LearnLevel, LearnTopic } from "./LearnTypes";

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
    deepSkySubject: "nebulae",
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
    deepSkySubject: "galaxies",
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
    deepSkySubject: "clusters",
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
    deepSkySubject: "remnants",
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
  },

  // ── Solar System: intermediate + advanced ───────────────────────────────────
  // The category previously held only the beginner lesson, so an Intermediate or
  // Advanced learner saw an empty Solar System list.
  {
    id: "solar-system-orbits-scale",
    categoryId: "solar_system",
    title: "Orbits, Kepler’s Laws, and Solar System Scale",
    level: "intermediate",
    summary: "Kepler’s three laws describe how planets actually move, and scale models show why the Solar System is mostly empty space.",
    body: "Planets do not travel in perfect circles. Kepler’s first law states that each orbit is an ellipse with the Sun at one focus, so a planet's distance changes over its year. The point closest to the Sun is perihelion, the farthest is aphelion.\n\nHis second law says a line drawn from the Sun to a planet sweeps equal areas in equal times — which means planets move fastest at perihelion and slowest at aphelion. Earth is actually closest to the Sun in early January, so northern winter is a slightly faster season than northern summer.\n\nThe third law ties period to distance: the square of the orbital period is proportional to the cube of the semi-major axis. Double a planet's distance and its year grows by about 2.8 times. That single relationship lets you predict any orbit's period from its size alone.\n\nScale is the part diagrams always distort. If Earth's orbit were a circle one metre across, Neptune's would be 30 metres wide and the nearest star would sit roughly 270 kilometres away. The Solar System is overwhelmingly empty.",
    keyFacts: [
      "Orbits are ellipses with the Sun at one focus, not circles.",
      "Planets move fastest at perihelion and slowest at aphelion.",
      "Period squared is proportional to semi-major axis cubed.",
      "An astronomical unit is the average Earth–Sun distance, about 150 million km."
    ],
    skyLensAction: "Trace planetary orbits",
    archiveAction: "Open Solar System"
  },
  {
    id: "solar-system-formation-small-bodies",
    categoryId: "solar_system",
    title: "Formation, Migration, and Small-Body Populations",
    level: "advanced",
    summary: "The Solar System’s architecture records disk formation, giant-planet migration, and the reservoirs of small bodies left behind.",
    body: "The Solar System condensed from a collapsing molecular cloud core about 4.57 billion years ago. Angular momentum flattened the infalling material into a protoplanetary disk, and a temperature gradient across that disk set the composition of everything built inside it. Inside the snow line only rock and metal could condense; beyond it, water ice was solid and available in bulk, so cores there grew fast enough to capture hydrogen and helium before the gas dispersed.\n\nThe planets did not stay where they formed. Interactions with the gas disk and later with planetesimals moved the giants substantially. Models such as the Nice model and the Grand Tack reproduce features that a static Solar System cannot: the mass deficit of Mars, the excited and depleted asteroid belt, Jupiter's Trojan populations, and the resonant structure of the Kuiper Belt where Pluto sits locked in a 3:2 resonance with Neptune.\n\nThree reservoirs of leftovers survive. The main asteroid belt holds rocky and metallic bodies stirred by Jupiter's resonances into Kirkwood gaps. The Kuiper Belt beyond Neptune holds icy bodies including the dwarf planets. The Oort Cloud, inferred rather than imaged, extends perhaps a fifth of the way to the nearest star and supplies long-period comets when passing stars and the galactic tide perturb it.\n\nMeteorites let us date all of this directly. Calcium–aluminium-rich inclusions in chondrites are the oldest solids known, and radiometric ages of 4.567 billion years anchor the timeline of the entire system.",
    keyFacts: [
      "The snow line divided rocky inner bodies from ice-rich outer ones.",
      "Giant-planet migration explains the belt’s depletion and Kuiper resonances.",
      "Kirkwood gaps are cleared by orbital resonances with Jupiter.",
      "Radiometric dating of chondrites gives an age near 4.567 billion years."
    ],
    skyLensAction: "Study Solar System architecture",
    archiveAction: "Open Solar System"
  },

  // ── Deep Sky · Nebulae: intermediate + advanced ─────────────────────────────
  {
    id: "nebulae-types-structure",
    categoryId: "deep_sky",
    deepSkySubject: "nebulae",
    title: "Emission, Reflection, and Dark Nebulae",
    level: "intermediate",
    summary: "Nebulae are classified by how they interact with starlight — emitting it, scattering it, or blocking it entirely.",
    body: "An emission nebula glows under its own power. Hot young stars flood the surrounding hydrogen with ultraviolet photons energetic enough to strip electrons from atoms. When those electrons recombine they cascade back down and emit light at fixed wavelengths, most famously the deep red hydrogen-alpha line at 656.3 nanometres. These regions are called H II regions, and the Lagoon Nebula in Sagittarius is a fine summer example.\n\nA reflection nebula produces no light of its own. Its dust grains simply scatter the light of nearby stars, and because short wavelengths scatter more efficiently the result is characteristically blue — the same physics that makes the daytime sky blue. The wisps around the Pleiades are the classic case.\n\nA dark nebula is the same cold dust seen without any convenient star behind or within it. It registers only as a silhouette against a brighter background, like the Horsehead in Orion or the Great Rift splitting the summer Milky Way.\n\nThese are not separate objects so much as separate viewing geometries. One cloud can be an emission nebula where a hot star has carved into it, a reflection nebula along its illuminated flank, and a dark nebula in its cold shielded interior.",
    keyFacts: [
      "Emission nebulae glow by recombination after ultraviolet ionization.",
      "Reflection nebulae look blue because short wavelengths scatter more.",
      "Dark nebulae are seen only in silhouette against brighter background light.",
      "One physical cloud can show all three appearances at once."
    ],
    skyLensAction: "Find the Lagoon Nebula in Sky Lens",
    archiveAction: "Open Nebulae",
    skyTarget: { raHours: 18.06, decDegrees: -24.38, name: "Lagoon Nebula", subtitle: "Emission Nebula · M8", description: "A bright summer H II region in Sagittarius, carved by hot young stars." }
  },
  {
    id: "nebulae-ionization-astrophysics",
    categoryId: "deep_sky",
    deepSkySubject: "nebulae",
    title: "Ionization Fronts, Line Emission, and Nebular Diagnostics",
    level: "advanced",
    summary: "Nebular spectra encode temperature, density, and composition through recombination lines and forbidden transitions.",
    body: "A hot star embedded in neutral hydrogen carves out a roughly spherical ionized volume whose size follows from balancing ionizing photon output against recombination. That idealized boundary is the Strömgren sphere, and its radius scales with the cube root of the ionizing photon rate divided by the square of the gas density. Real nebulae are messier — density varies, radiation leaks through low-density channels — but the concept sets the scale.\n\nThe boundary itself is an ionization front, a thin transition where the gas changes state over a short distance. Because ionized gas is far hotter than the neutral material it displaces, the pressure imbalance drives champagne flows that break the nebula open and let ionized gas stream away.\n\nSpectra are the real diagnostic. Recombination lines of hydrogen and helium measure the amount of ionized gas. Collisionally excited forbidden lines — [O III] at 495.9 and 500.7 nm, [N II], [S II] — arise from transitions too slow to occur at laboratory densities but common in gas thousands of times thinner than the best vacuum on Earth. Their intensity ratios give electron temperature and density directly, and the [S II] doublet ratio is a standard density probe.\n\nThose same ratios separate excitation mechanisms. Plotting [O III]/Hβ against [N II]/Hα on a BPT diagram distinguishes gas photoionized by hot stars from gas excited by shocks or by an active galactic nucleus.",
    keyFacts: [
      "The Strömgren radius follows from ionization–recombination balance.",
      "Forbidden lines like [O III] require densities far below laboratory vacuum.",
      "Line ratios yield electron temperature and density directly.",
      "BPT diagrams separate photoionization from shock and AGN excitation."
    ],
    skyLensAction: "Find the Ring Nebula in Sky Lens",
    archiveAction: "Open Nebulae",
    skyTarget: { raHours: 18.893, decDegrees: 33.03, name: "Ring Nebula", subtitle: "Planetary Nebula · M57", description: "An ionized shell in Lyra, textbook for forbidden-line emission." }
  },

  // ── Deep Sky · Galaxies: beginner + intermediate ────────────────────────────
  {
    id: "galaxies-first-look",
    categoryId: "deep_sky",
    deepSkySubject: "galaxies",
    title: "Galaxies: Islands of Stars",
    level: "beginner",
    summary: "A galaxy is an enormous family of stars held together by gravity — and one of them is visible to your unaided eye.",
    body: "Every star you can see by eye belongs to our own galaxy, the Milky Way. A galaxy is a vast collection of stars, gas, and dust bound together by gravity, and the universe holds hundreds of billions of them.\n\nThe remarkable part is that you can see another one without any equipment at all. On a dark autumn night the Andromeda Galaxy appears as a faint elongated smudge, dimmer than a star but noticeably fuzzy. That smudge is about 2.5 million light-years away, which means the light entering your eye left before our species existed.\n\nUse averted vision to find it. Look slightly to one side of where you expect it to be and it brightens noticeably, because the outer part of your retina is more sensitive to faint light than the centre. Binoculars turn it into an obvious oval glow.\n\nGalaxies come in a few broad shapes. Spirals like Andromeda and our own have flat disks with curving arms. Ellipticals are smooth and rounded. Irregulars have no tidy shape at all.",
    keyFacts: [
      "A galaxy is a gravitationally bound family of stars, gas, and dust.",
      "Andromeda is visible to the unaided eye from a dark site.",
      "Its light takes about 2.5 million years to reach us.",
      "Averted vision makes faint galaxies noticeably easier to see."
    ],
    skyLensAction: "Find the Andromeda Galaxy in Sky Lens",
    archiveAction: "Open Galaxies",
    skyTarget: { raHours: 0.712, decDegrees: 41.27, name: "Andromeda Galaxy", subtitle: "Spiral Galaxy · M31", description: "The nearest large spiral galaxy, and the most distant object visible to the unaided eye." }
  },
  {
    id: "galaxies-types-local-group",
    categoryId: "deep_sky",
    deepSkySubject: "galaxies",
    title: "Galaxy Types and the Local Group",
    level: "intermediate",
    summary: "Hubble’s classification sorts galaxies by shape, and our own Local Group shows how they cluster and interact.",
    body: "Edwin Hubble sorted galaxies into a sequence still used today. Ellipticals, labelled E0 through E7, are smooth spheroids of mostly old red stars with little gas and almost no ongoing star formation. Spirals, labelled Sa through Sc, have a central bulge and a disk whose arms grow more open and more actively star-forming along the sequence. Barred spirals, SBa through SBc, run a straight bar through the centre — our Milky Way is one. Lenticulars sit between the two, with a disk but no arms, and irregulars defy the scheme entirely.\n\nThe old picture of this as an evolutionary track was wrong. Hubble's sequence describes appearance, not age. What actually drives shape is formation history and merging.\n\nOur galaxy belongs to the Local Group, a loose collection of more than eighty galaxies spanning roughly ten million light-years. Two large spirals dominate it: the Milky Way and Andromeda. The Triangulum Galaxy is a distant third, and everything else is a dwarf — including the Large and Small Magellanic Clouds, visible to the unaided eye from southern latitudes.\n\nGalaxies interact. Andromeda is approaching us at about 110 kilometres per second and will merge with the Milky Way in roughly four billion years. Because galaxies are mostly empty space, almost no stars will collide; the gas clouds will, triggering a burst of star formation.",
    keyFacts: [
      "Hubble’s sequence classifies by appearance, not evolutionary age.",
      "The Milky Way is a barred spiral, not a simple spiral.",
      "The Local Group holds 80+ galaxies, mostly dwarfs.",
      "Andromeda and the Milky Way will merge in about four billion years."
    ],
    skyLensAction: "Find the Triangulum Galaxy in Sky Lens",
    archiveAction: "Open Galaxies",
    skyTarget: { raHours: 1.564, decDegrees: 30.66, name: "Triangulum Galaxy", subtitle: "Spiral Galaxy · M33", description: "The third-largest Local Group galaxy — a face-on spiral needing dark skies." }
  },

  // ── Deep Sky · Star Clusters: beginner + advanced ───────────────────────────
  {
    id: "clusters-first-look",
    categoryId: "deep_sky",
    deepSkySubject: "clusters",
    title: "Spotting Star Clusters",
    level: "beginner",
    summary: "Star clusters are families of stars born together, and the brightest are among the easiest targets in the sky.",
    body: "Most stars do not form alone. They condense in groups from the same cloud of gas, and many of those groups stay loosely together for millions of years afterwards. Those are star clusters, and several are bright enough to find on your first night out.\n\nThe Pleiades in Taurus is the standout. Most people see six stars in a tiny dipper-shaped knot; sharp eyes under dark skies catch more. Binoculars transform it into dozens of blue-white stars. It is often mistaken for the Little Dipper, but it is far smaller and more compact.\n\nNearby sits the Hyades, a looser V-shaped group forming the face of Taurus. The bright orange star Aldebaran appears to belong to it but does not — it lies about half as far away and merely falls along the same line of sight.\n\nClusters are useful for learning the sky because every star in one is genuinely at the same distance and the same age. They are the closest astronomy gets to a controlled experiment.",
    keyFacts: [
      "Cluster stars form together from a single cloud.",
      "The Pleiades shows six stars to most eyes, dozens in binoculars.",
      "Aldebaran only appears to sit in the Hyades — it is much closer.",
      "All stars in a cluster share one age and one distance."
    ],
    skyLensAction: "See the Pleiades in Sky Lens",
    archiveAction: "Open Clusters",
    skyTarget: { raHours: 3.79, decDegrees: 24.11, name: "Pleiades", subtitle: "Open Cluster · M45", description: "A glittering knot of hot blue stars in Taurus — the easiest cluster to find." }
  },
  {
    id: "clusters-dynamics-ages",
    categoryId: "deep_sky",
    deepSkySubject: "clusters",
    title: "Cluster Dynamics, Turnoff Ages, and Populations",
    level: "advanced",
    summary: "Main-sequence turnoff dates a cluster, while relaxation, mass segregation, and evaporation govern how it dissolves.",
    body: "Because a cluster's stars share an age, distance, and initial composition, its colour–magnitude diagram is a direct read-out of stellar evolution. The most massive stars burn through their hydrogen fastest and peel away from the main sequence first. The point where the cluster's sequence bends toward the giant branch — the main-sequence turnoff — corresponds to the mass whose main-sequence lifetime equals the cluster's age. Locate the turnoff and you have dated the cluster.\n\nThat method splits clusters cleanly. Open clusters show turnoffs high on the main sequence, giving ages from a few million to a couple of billion years. Globular clusters turn off near one solar mass, implying ages above twelve billion years, which makes them among the oldest bound structures known and a hard lower limit on the age of the universe.\n\nDynamics decide how long a cluster survives. Two-body encounters gradually push the system toward energy equipartition over a relaxation timescale, so massive stars sink toward the centre while low-mass stars drift outward — mass segregation. Stars pushed past escape velocity leave entirely, and the cluster evaporates. Tidal shear from the galactic disk and passing molecular clouds accelerate the loss, which is why open clusters rarely survive long while globulars in the halo persist.\n\nCluster cores can also undergo core collapse, contracting until binary star interactions inject enough energy to halt it. Blue stragglers — stars sitting above the turnoff where none should remain — are the visible fingerprint of those collisions and mergers.",
    keyFacts: [
      "Main-sequence turnoff mass gives the cluster’s age directly.",
      "Globular turnoffs imply ages above twelve billion years.",
      "Mass segregation sinks heavy stars toward the core over a relaxation time.",
      "Blue stragglers mark stellar mergers and close encounters."
    ],
    skyLensAction: "Find the Hercules Cluster in Sky Lens",
    archiveAction: "Open Clusters",
    skyTarget: { raHours: 16.695, decDegrees: 36.46, name: "Hercules Cluster", subtitle: "Globular Cluster · M13", description: "A dense ancient swarm of hundreds of thousands of stars in Hercules." }
  },

  // ── Deep Sky · Supernova Remnants: beginner + intermediate ──────────────────
  {
    id: "remnants-first-look",
    categoryId: "deep_sky",
    deepSkySubject: "remnants",
    title: "What Happens When a Star Explodes?",
    level: "beginner",
    summary: "A dying massive star detonates as a supernova, and the glowing wreckage it leaves behind seeds space with new elements.",
    body: "Stars shine by fusing light elements into heavier ones. A massive star eventually builds an iron core, and iron is where the process stops paying — fusing it consumes energy instead of releasing it. Without that outward push the core collapses in under a second, and the star tears itself apart in a supernova.\n\nFor a few weeks the explosion can outshine its entire host galaxy. What remains is a supernova remnant: an expanding shell of gas ploughing into the surrounding space, glowing as it goes.\n\nThe famous example is the Crab Nebula in Taurus. Chinese and Japanese astronomers recorded a new star there in the year 1054, bright enough to be seen in daylight for weeks. Nearly a thousand years later we can still watch the debris expanding.\n\nThese explosions matter to us directly. Elements heavier than iron are forged in them and flung outward. The calcium in your bones and the iron in your blood were made inside stars and scattered by supernovae long before the Sun formed.",
    keyFacts: [
      "An iron core cannot support the star, so it collapses.",
      "A supernova can briefly outshine its whole galaxy.",
      "The Crab Nebula was recorded exploding in the year 1054.",
      "Supernovae scatter the heavy elements life is built from."
    ],
    skyLensAction: "Find the Crab Nebula in Sky Lens",
    archiveAction: "Open Remnants",
    skyTarget: { raHours: 5.575, decDegrees: 22.01, name: "Crab Nebula", subtitle: "Supernova Remnant · M1", description: "The expanding wreckage of a star seen to explode in 1054." }
  },
  {
    id: "remnants-types-observing",
    categoryId: "deep_sky",
    deepSkySubject: "remnants",
    title: "Supernova Types and Observing Remnants",
    level: "intermediate",
    summary: "Spectra and light curves separate core-collapse from thermonuclear supernovae, and remnants fall into distinct structural classes.",
    body: "Supernovae divide first by spectrum. Type I events show no hydrogen lines; Type II do. The physically important split, though, cuts across that scheme. Type Ia supernovae are thermonuclear: a white dwarf in a binary system gains mass until runaway carbon fusion destroys it entirely. Because that ignition happens near a consistent mass limit, Type Ia events reach a consistent peak luminosity, which is what makes them standard candles for measuring cosmic distances.\n\nEverything else — Types II, Ib, and Ic — is core collapse in a massive star. The subtypes reflect how much of the outer envelope the star had already shed. Type II keeps its hydrogen, Ib has lost it, Ic has lost hydrogen and helium both.\n\nThe remnants they leave sort into three structural classes. Shell remnants, like the Veil Nebula in Cygnus, show a hollow expanding rim brightest along the edges where the line of sight passes through the most material. Pulsar wind nebulae, like the Crab, are filled in rather than hollow, energized from within by a spinning neutron star. Composite remnants show both.\n\nFor observing, a narrowband filter is the difference between frustration and success. Remnant light is concentrated in a few emission lines, especially [O III] and hydrogen-alpha, so an O III filter suppresses the continuum of light pollution while passing the nebula. The Veil in particular goes from nearly invisible to strikingly detailed.",
    keyFacts: [
      "Type Ia is thermonuclear; Types II, Ib, and Ic are core collapse.",
      "Consistent Type Ia peak luminosity makes them standard candles.",
      "Shell, pulsar-wind, and composite are the three remnant classes.",
      "O III narrowband filters dramatically improve remnant visibility."
    ],
    skyLensAction: "Find the Veil Nebula in Sky Lens",
    archiveAction: "Open Remnants",
    skyTarget: { raHours: 20.76, decDegrees: 30.72, name: "Veil Nebula", subtitle: "Supernova Remnant · NGC 6960/6992", description: "A large shell remnant in Cygnus, spectacular through an O III filter." }
  }
];

/**
 * Deep Sky subjects in the order the Deep Sky visual renders its tabs
 * (Nebula · Galaxy · Cluster · Remnant). The tab index maps into this array —
 * never into a list of hardcoded lesson ids.
 */
export const DEEP_SKY_SUBJECTS = ["nebulae", "galaxies", "clusters", "remnants"] as const;

export const LEARN_LEVELS = ["beginner", "intermediate", "advanced"] as const;

/**
 * The Deep Sky lesson for a given tab + level. Every (subject, level) pair has
 * exactly one lesson, so a Deep Sky tab can never render blank — see the
 * 4 × 3 coverage matrix asserted in scripts/learn-gate-selftest.js.
 */
export function findDeepSkyLesson(
  subject: DeepSkySubject,
  level: LearnLevel
): LearnTopic | undefined {
  return learnTopics.find(
    (topic) =>
      topic.categoryId === "deep_sky" &&
      topic.deepSkySubject === subject &&
      topic.level === level
  );
}

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
