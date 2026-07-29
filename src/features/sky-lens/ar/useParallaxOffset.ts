// Sky Lens parallax is intentionally retired from the live render path.
//
// The original implementation streamed the gyroscope into React state every 50 ms.
// Because the offset is passed into SkyLensCanvas, every tiny cosmetic movement forced
// the full SVG sky (thousands of stars plus labels and atmosphere) to rebuild independently
// of the real compass/tilt update. That competing render loop caused visible frame pacing
// stutter while customers moved the phone.
//
// Keep the hook and its public type so callers remain source-compatible. A future version
// can restore depth with a UI-thread transform that does not invalidate the celestial scene.

export interface ParallaxOffset {
  x: number;
  y: number;
}

const ZERO_PARALLAX: ParallaxOffset = Object.freeze({ x: 0, y: 0 });

export function useParallaxOffset(_maxPx = 7, _updateMs = 50): ParallaxOffset {
  return ZERO_PARALLAX;
}
