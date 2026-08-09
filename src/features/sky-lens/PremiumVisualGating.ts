// PremiumVisualGating.ts — controls visual quality based on subscription
// FREE = nice sky map. PREMIUM = the living universe.
// 
// This doesn't hide layers — it controls HOW they render.
// Free users see the same sky, just less cinematic.

export interface VisualGateConfig {
  // Stars
  spectralColors: boolean;      // free=all white, premium=blue/gold/orange/red
  starBloom: boolean;            // free=no bloom, premium=bright stars bloom
  
  // Constellations
  goldNodes: boolean;            // free=no nodes, premium=gold dots at junctions
  luxuryLines: boolean;          // free=thin plain lines, premium=tapered glow
  
  // Planets
  planetIllustrations: boolean;  // free=colored dots, premium=Jupiter bands etc
  
  // Moon
  heroMoon: boolean;             // free=simple circle, premium=craters/earthshine/atmospheric glow
  
  // Milky Way
  milkyWayDetail: "basic" | "full"; // free=faint smooth, premium=dust/emission/structure
  milkyWayBoostMultiplier: number;  // free=0.4, premium=1.0
  
  // Effects
  shootingStars: boolean;        // premium only
  hapticDiscovery: boolean;      // premium only
  celestialPoetry: boolean;      // premium only
  
  // Modes
  cinematicMode: boolean;        // premium only
  nightVision: boolean;          // premium only
  skyQualityPresets: boolean;    // premium only
  photoCapture: boolean;         // premium only
  immersiveMode: boolean;        // premium only
}

export function getVisualGate(isPremium: boolean): VisualGateConfig {
  if (isPremium) {
    return {
      spectralColors: true,
      starBloom: true,
      goldNodes: true,
      luxuryLines: true,
      planetIllustrations: true,
      heroMoon: true,
      milkyWayDetail: "full",
      milkyWayBoostMultiplier: 1.0,
      shootingStars: true,
      hapticDiscovery: true,
      celestialPoetry: true,
      cinematicMode: true,
      nightVision: true,
      skyQualityPresets: true,
      photoCapture: true,
      immersiveMode: true,
    };
  }

  // FREE — a good sky map, not the living universe
  return {
    spectralColors: false,        // all stars white
    starBloom: false,             // no bloom effects
    goldNodes: false,             // no junction dots
    luxuryLines: false,           // plain thin lines
    planetIllustrations: false,   // colored dots only
    heroMoon: false,              // simple circle + phase
    milkyWayDetail: "basic",      // faint smooth band
    milkyWayBoostMultiplier: 0.4, // much fainter MW
    shootingStars: false,         // no shooting stars
    hapticDiscovery: false,       // no haptic whispers
    celestialPoetry: false,       // no poetic pauses
    cinematicMode: false,         // no no-UI mode
    nightVision: false,           // no red mode
    skyQualityPresets: false,     // locked to "dark" default
    photoCapture: false,          // no capture button
    immersiveMode: false,         // no 75% darken mode
  };
}
