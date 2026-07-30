// useDeviceMotionProbe.ts — TEMPORARY dev-only DeviceMotion attitude probe.
//
// PURPOSE
// -------
// expo-sensors exposes only Euler angles (alpha/beta/gamma), not a quaternion or rotation
// matrix, so deviceMotionOrientation.ts has to RECONSTRUCT the rotation matrix — and that
// reconstruction encodes an assumption about Core Motion's composition order. At gamma = 0
// two candidate orders (Rz·Rx·Ry and Rz·Ry·Rx) produce identical output, so offline tests
// cannot tell them apart. Only real attitude values from a handset can.
//
// This probe subscribes to DeviceMotion, runs the mapping, and LOGS. It deliberately does
// NOT drive the rendered camera — Sky Lens still uses the existing orientation path — so
// nothing on screen changes while the convention is being confirmed.
//
// NOT IN RELEASE: every entry point is behind `__DEV__`, so this compiles to dead code and
// logs nothing in a Release build. Remove once the mapping is confirmed.

import { useEffect } from "react";
import { DeviceMotion } from "expo-sensors";
import { pointingFromDeviceMotion, isUsableRotation } from "./deviceMotionOrientation";

const PROBE_INTERVAL_MS = 200;
const LOG_THROTTLE_MS = 500;

/**
 * Subscribe to DeviceMotion and log raw attitude alongside the derived camera pointing.
 * Returns nothing and affects no rendering state.
 */
export function useDeviceMotionProbe(enabled: boolean = true): void {
  useEffect(() => {
    if (!__DEV__ || !enabled) return;

    let cancelled = false;
    let lastLoggedAt = 0;
    let subscription: { remove: () => void } | null = null;

    const start = async () => {
      // Availability is not guaranteed (simulator, unusual hardware).
      let available = false;
      try {
        available = await DeviceMotion.isAvailableAsync();
      } catch {
        available = false;
      }
      if (cancelled) return;
      if (!available) {
        // eslint-disable-next-line no-console
        console.log("[SkyLensProbe] DeviceMotion is NOT available on this device");
        return;
      }

      // eslint-disable-next-line no-console
      console.log(
        "[SkyLensProbe] DeviceMotion available — probing attitude. " +
          "Sky Lens camera is NOT driven by this; it only logs."
      );

      DeviceMotion.setUpdateInterval(PROBE_INTERVAL_MS);
      subscription = DeviceMotion.addListener((motion) => {
        const rotation = motion?.rotation;
        if (!isUsableRotation(rotation)) return;

        const now = Date.now();
        if (now - lastLoggedAt < LOG_THROTTLE_MS) return;
        lastLoggedAt = now;

        const derived = pointingFromDeviceMotion({
          alpha: rotation.alpha,
          beta: rotation.beta,
          gamma: rotation.gamma
        });

        const deg = (radians: number) => ((radians * 180) / Math.PI).toFixed(1).padStart(7);
        const fixed = (value: number) => value.toFixed(1).padStart(7);

        // eslint-disable-next-line no-console
        console.log(
          "[SkyLensProbe]" +
            ` alphaRad=${rotation.alpha.toFixed(4).padStart(8)}` +
            ` betaRad=${rotation.beta.toFixed(4).padStart(8)}` +
            ` gammaRad=${rotation.gamma.toFixed(4).padStart(8)}` +
            ` | alphaDeg=${deg(rotation.alpha)}` +
            ` betaDeg=${deg(rotation.beta)}` +
            ` gammaDeg=${deg(rotation.gamma)}` +
            ` | az=${fixed(derived.azimuthDegrees)}` +
            ` alt=${fixed(derived.altitudeDegrees)}` +
            ` roll=${fixed(derived.rollDegrees)}` +
            ` | screenOrientation=${String(motion?.orientation ?? "n/a").padStart(4)}` +
            ` t=${now}`
        );
      });
    };

    void start();

    return () => {
      cancelled = true;
      subscription?.remove();
      subscription = null;
    };
  }, [enabled]);
}
