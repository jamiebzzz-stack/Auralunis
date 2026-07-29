// Reduced-motion self-test.
//
// Active ambient decorative Sky Lens motion (twinkle, bloom, god-ray/aurora drift,
// shooting stars) must respect the system "Reduce Motion" setting via useReducedMotion.
// Retired animation layers must remain inert. Static source guard, matching the other
// qa:* scripts.

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failed += 1;
};

// ── Hook lifecycle ────────────────────────────────────────────────────────────────
const hook = read("src/hooks/useReducedMotion.ts");
check("hook reads AccessibilityInfo.isReduceMotionEnabled", hook.includes("AccessibilityInfo.isReduceMotionEnabled"));
check("hook subscribes to reduceMotionChanged", /addEventListener\(\s*["']reduceMotionChanged["']/.test(hook));
check("hook removes the subscription on unmount", /\.remove\(\)/.test(hook) && hook.includes("return () =>"));
check("hook guards the async initial read against unmount", hook.includes("mounted"));

// ── Active Reanimated ambient layers: static branch + cancelAnimation ─────────────
const REANIMATED = {
  TwinkleOverlay: "src/features/sky-lens/TwinkleOverlay.tsx",
  PremiumSkyBloomLayer: "src/features/sky-lens/layers/PremiumSkyBloomLayer.tsx",
  LunarGodRayLayer: "src/features/sky-lens/layers/LunarGodRayLayer.tsx",
  AuroraCurtainLayer: "src/features/sky-lens/layers/AuroraCurtainLayer.tsx"
};
for (const [name, rel] of Object.entries(REANIMATED)) {
  const src = read(rel);
  check(`${name} consumes useReducedMotion`, src.includes("useReducedMotion"));
  check(`${name} has an explicit reduced-motion static branch`, /if \(reduced\)/.test(src));
  check(`${name} cancels the running loop on live change (cancelAnimation)`, src.includes("cancelAnimation"));
  check(`${name} preserves the normal withRepeat loop`, src.includes("withRepeat"));
  check(`${name} adds no debug/console copy`, !/console\.(log|debug)/.test(src));
}

// ── Retired breathing layer: must remain a true no-op ─────────────────────────────
const breathing = read("src/features/sky-lens/layers/AstralBreathingLayer.tsx");
check("AstralBreathingLayer stays retired (returns null)", /return null;/.test(breathing));
check(
  "AstralBreathingLayer has no perpetual animation machinery",
  !breathing.includes("withRepeat") &&
    !breathing.includes("withTiming") &&
    !breathing.includes("useSharedValue") &&
    !breathing.includes("useAnimatedStyle")
);
check("AstralBreathingLayer adds no debug/console copy", !/console\.(log|debug)/.test(breathing));

// ── ShootingStarLayer: suppressed entirely under reduced motion ───────────────────
const shoot = read("src/features/sky-lens/layers/ShootingStarLayer.tsx");
check("ShootingStarLayer consumes useReducedMotion", shoot.includes("useReducedMotion"));
const reducedIdx = shoot.indexOf("if (reduced)"); // the effect guard (render guard is "if (reduced ||")
const clearIdx = shoot.indexOf("setMeteor(null)");
check(
  "shooting stars clear on reduced motion + render is guarded",
  reducedIdx > 0 && clearIdx > reducedIdx && clearIdx - reducedIdx < 400 && /if \(reduced \|\|/.test(shoot)
);
check(
  "no rAF/timer scheduling begins in reduced motion (reduced check precedes the scheduling calls)",
  reducedIdx > 0 && reducedIdx < shoot.indexOf("setTimeout(") && reducedIdx < shoot.indexOf("requestAnimationFrame(")
);
check("ShootingStarLayer preserves normal scheduling", shoot.includes("requestAnimationFrame") && shoot.includes("setTimeout"));
check("ShootingStarLayer adds no debug/console copy", !/console\.(log|debug)/.test(shoot));

// ── Out-of-scope interaction feedback must NOT have been touched ──────────────────
for (const [name, rel] of [
  ["TargetPulse", "src/features/sky-lens/TargetPulse.tsx"],
  ["SelectionRing", "src/features/sky-lens/SelectionRing.tsx"],
  ["HeroSpotlight", "src/features/sky-lens/HeroSpotlight.tsx"]
]) {
  check(`${name} was not modified (no reduced-motion hook)`, !read(rel).includes("useReducedMotion"));
}

console.log("");
if (failed) {
  console.error(`Reduced-motion self-test: ${failed} FAILED.`);
  process.exit(1);
}
console.log(
  "Reduced-motion self-test passed: hook lifecycle correct; active ambient layers are gated; retired breathing layer is inert; shooting stars suppressed; interaction feedback untouched."
);
