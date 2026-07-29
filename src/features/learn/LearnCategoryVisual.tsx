import React from "react";
import type { LearnCategoryId } from "./LearnTypes";
import { SolarSystemLiveVisual } from "./visuals/SolarSystemLiveVisual";
import { MoonPhaseLiveVisual } from "./visuals/MoonPhaseLiveVisual";
import { ConstellationIgnitionVisual } from "./visuals/ConstellationIgnitionVisual";
import { StarBrightnessVisual } from "./visuals/StarBrightnessVisual";
import { DeepSkyGlowVisual } from "./visuals/DeepSkyGlowVisual";
import { MilkyWayBandVisual } from "./visuals/MilkyWayBandVisual";
import { ThirtyNightsProgressVisual } from "./visuals/ThirtyNightsProgressVisual";

export function LearnVisualForCategory({
  categoryId,
  onDeepSkyTabChange,
  deepSkySelectedIndex
}: {
  categoryId: LearnCategoryId;
  onDeepSkyTabChange?: (index: number) => void;
  deepSkySelectedIndex?: number;
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
          onTabChange={onDeepSkyTabChange}
          selectedIndex={deepSkySelectedIndex}
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
