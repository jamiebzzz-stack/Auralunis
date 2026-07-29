// Reduced-motion self-test.
// Active decorative Sky Lens motion must respect the system Reduce Motion setting.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

let failed = 0;
const check = (name, condition, detail) => {
  console.log(`${condition ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
  if (!condition) failed += 1;
};

const hook = read("src/hooks/useReducedMotion.ts");
check("hook reads AccessibilityInfo.isReduceMotionEnabled", hook.includes("AccessibilityInfo.isReduceMotionEnabled"));
check("hook subscribes to reduceMotionChanged", /addEventListener\(\s*["']reduceMotionChanged["']/.test(hook));
check("hook removes the subscription on unmount", /\.remove\(\)/.test(hook) && hook.includes("return () =>"));
check("hook guards the async initial read against unmount", hook.includes("mounted"));

const REANIMATED = {
  TwinkleOverlay: "src/features/sky-lens/TwinkleOverlay.tsx",
  PremiumSkyBloomLayer: "src/features/sky-lens/layers/PremiumSkyBloomLayer.tsx",
  AstralBreathingLayer: "src/features/sky-lens/layers/AstralBreathingLayer.tsx",
  LunarGodRayLayer: "src/features/sky-lens/layers/LunarGodRayLayer.tsx",
  AuroraCurtainLayer: "src/features/sky-lens/layers/AuroraCurtainLayer.tsx"
};

for (const [name, relativePath] of Object.entries(REANIMATED)) {
  const source = read(relativePath);
  check(`${name} consumes useReducedMotion`, source.includes("useReducedMotion"));
  check(`${name} has an explicit reduced-motion static branch`, /if \(reduced\)/.test(source));
  check(`${name} cancels the running loop on live change`, source.includes("cancelAnimation"));
  check(`${name} preserves the normal withRepeat loop`, source.includes("withRepeat"));
  check(`${name} adds no debug/console copy`, !/console\.(log|debug)/.test(source));
}

const shootingStar = read("src/features/sky-lens/layers/ShootingStarLayer.tsx");
check("ShootingStarLayer consumes useReducedMotion", shootingStar.includes("useReducedMotion"));
const reducedIndex = shootingStar.indexOf("if (reduced)");
const clearIndex = shootingStar.indexOf("setMeteor(null)");
check(
  "shooting stars clear on reduced motion and render is guarded",
  reducedIndex > 0 && clearIndex > reducedIndex && clearIndex - reducedIndex < 400 && /if \(reduced \|\|/.test(shootingStar)
);
check(
  "no scheduling begins under reduced motion",
  reducedIndex > 0 && reducedIndex < shootingStar.indexOf("setTimeout(") && reducedIndex < shootingStar.indexOf("requestAnimationFrame(")
);
check("ShootingStarLayer preserves normal scheduling", shootingStar.includes("requestAnimationFrame") && shootingStar.includes("setTimeout"));

for (const [name, relativePath] of [
  ["TargetPulse", "src/features/sky-lens/TargetPulse.tsx"],
  ["SelectionRing", "src/features/sky-lens/SelectionRing.tsx"],
  ["HeroSpotlight", "src/features/sky-lens/HeroSpotlight.tsx"]
]) {
  check(`${name} remains interaction feedback`, !read(relativePath).includes("useReducedMotion"));
}

console.log("");
if (failed) {
  console.error(`Reduced-motion self-test: ${failed} FAILED.`);
  process.exit(1);
}
console.log("Reduced-motion self-test passed: all active ambient layers, including the released breathing layer, respect Reduce Motion.");
