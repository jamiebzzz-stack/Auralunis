import React, { memo } from "react";

interface Props {
  width: number;
  height: number;
  nightVision?: boolean;
  intensity?: number;
}

// Intentionally retired for the live Sky Lens performance budget.
// PremiumSkyBloomLayer already supplies the atmospheric depth. This component used
// a perpetual full-screen opacity + scale animation over an SVG gradient, adding GPU
// composition work throughout every phone movement. Keeping a no-op component preserves
// the existing mount/API while removing that cost from current builds.
export const AstralBreathingLayer = memo(function AstralBreathingLayer(_props: Props) {
  return null;
});
