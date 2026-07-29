import React from "react";
import type { LearnCategoryId } from "./LearnTypes";
import { SolarSystemLiveVisual } from "./visuals/SolarSystemLiveVisual";
import { MoonPhaseLiveVisual } from "./visuals/MoonPhaseLiveVisual";
import { ConstellationIgnitionVisual } from "./visuals/ConstellationIgnitionVisual";
import { StarBrightnessVisual } from "./visuals/StarBrightnessVisual";
import { DeepSkyGlowVisual } from "./visuals/DeepSkyGlowVisual";
import { MilkyWayBandVisual } from "./visuals/MilkyWayBandVisual";
import { ThirtyNightsProgressVisual } from "./visuals/ThirtyNightsProgressVisual";

// The live visual that pairs with each learning category. Shared by the Learn
// catalog and the full-screen lesson so they always show the same illustration.
export function LearnVisualForCategory({
  categoryId,
  deepSkyActiveIndex,
  deepSkyInteractive = true,
  onDeepSkyTabChange
}: {
  categoryId: LearnCategoryId;
  deepSkyActiveIndex?: number;
  deepSkyInteractive?: boolean;
  onDeepSkyTabChange?: (index: number) => void;
}) {
  switch (categoryId) {
    case "solar_system":
    case "planets":
      return <SolarSystemLiveVisual />;
    case "moon":
      return <MoonPhaseLiveVisual />;
    case "constellations":
      return <ConstellationIgnitionVisual />;
    case "stars":
      return <StarBrightnessVisual />;
    case "deep_sky":
      return (
        <DeepSkyGlowVisual
          activeIndex={deepSkyActiveIndex}
          interactive={deepSkyInteractive}
          onTabChange={onDeepSkyTabChange}
        />
      );
    case "milky_way":
      return <MilkyWayBandVisual />;
    case "beginner_path":
      return <ThirtyNightsProgressVisual />;
    default:
      return null;
  }
}