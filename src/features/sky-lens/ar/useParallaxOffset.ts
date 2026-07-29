import { useEffect, useRef, useState } from "react";
import { Gyroscope } from "expo-sensors";

// expo-sensors' published types under this resolution only surface
// isAvailableAsync; the streaming API exists at runtime. Typed locally to match
// (same pattern as useDevicePointing).
type SensorReading = { x: number; y: number; z: number };
interface SensorModule {
  setUpdateInterval: (intervalMs: number) => void;
  addListener: (listener: (reading: SensorReading) => void) => { remove: () => void };
}
const Gyro = Gyroscope as unknown as SensorModule;

export interface ParallaxOffset {
  x: number;
  y: number;
}

// Celestial-dome depth from the released App Store design.
export function useParallaxOffset(maxPx = 7, updateMs = 50): ParallaxOffset {
  const [offset, setOffset] = useState<ParallaxOffset>({ x: 0, y: 0 });
  const ref = useRef<ParallaxOffset>({ x: 0, y: 0 });

  useEffect(() => {
    const GAIN = 0.6;
    const DECAY = 0.85;
    const clamp = (value: number) => Math.max(-maxPx, Math.min(maxPx, value));

    Gyro.setUpdateInterval(updateMs);
    const subscription = Gyro.addListener((reading) => {
      const nextX = clamp(ref.current.x * DECAY - reading.y * GAIN);
      const nextY = clamp(ref.current.y * DECAY - reading.x * GAIN);
      const previous = ref.current;
      ref.current = { x: nextX, y: nextY };

      const moved = Math.abs(nextX - previous.x) > 0.25 || Math.abs(nextY - previous.y) > 0.25;
      const settling =
        (previous.x !== 0 || previous.y !== 0) &&
        Math.abs(nextX) < 0.25 &&
        Math.abs(nextY) < 0.25;

      if (moved) setOffset({ x: nextX, y: nextY });
      else if (settling) {
        ref.current = { x: 0, y: 0 };
        setOffset({ x: 0, y: 0 });
      }
    });

    return () => subscription.remove();
  }, [maxPx, updateMs]);

  return offset;
}
