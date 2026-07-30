// useSkyOrientation.ts — the orientation actually rendered by Sky Lens.
//
// Combines the live DeviceMotion quaternion with two user controls:
//
//   LOCK SKY   The current orientation is captured and held EXACTLY. Sensor samples keep
//             arriving but are ignored, so the sky cannot move at all. Zoom and object taps
//             are unaffected — they never touched orientation.
//
//   DRAG       While locked, a drag composes a user offset onto the frozen orientation:
//             yaw about world up, pitch about the camera's own right axis. Because the offset
//             is a quaternion composition rather than an azimuth adjustment, panning behaves
//             identically everywhere, including at the zenith where an azimuth-based pan is
//             undefined. The sky is still one rigid orientation, so geometry cannot distort.
//
// UNLOCKING does not snap. The device has usually moved while locked, so jumping straight to
// the live attitude would tear the scene. Instead the orientation slerps from the frozen
// value to live over a short transition — one whole-orientation blend along the shortest arc.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  cameraBasisFromQuaternion,
  composeDragOffset,
  slerp,
  type CameraBasis,
  type Quaternion
} from "./orientationQuaternion";
import { useQuaternionPointing } from "./useQuaternionPointing";
import { logOrientationSample } from "./pointingDiagnostics";

/** How long the unlock blend takes. Long enough to read as motion, short enough to feel direct. */
export const UNLOCK_BLEND_MS = 450;

/** Degrees of yaw/pitch per screen point dragged. */
export const DRAG_DEGREES_PER_POINT = 0.12;

/**
 * Movement in points beyond which a gesture is a drag rather than a tap. Below this a touch
 * still selects an object, so drag-to-pan never steals taps.
 */
export const DRAG_ACTIVATION_POINTS = 12;

export interface SkyOrientationState {
  /** The immutable basis for this render. Every layer and hit test must use this one value. */
  basis: CameraBasis;
  /** The orientation the basis came from. */
  orientation: Quaternion;
  available: boolean;
  isLocked: boolean;
  isStill: boolean;
  toggleLock: () => void;
  /** Apply a drag delta in screen points. Ignored unless locked. */
  applyDrag: (deltaXPoints: number, deltaYPoints: number) => void;
}

export function useSkyOrientation(enabled: boolean = true): SkyOrientationState {
  const { orientation: live, available, isStill, readLiveOrientation } = useQuaternionPointing(enabled);

  const [isLocked, setIsLocked] = useState(false);
  const [frozen, setFrozen] = useState<Quaternion | null>(null);
  const [drag, setDrag] = useState({ yaw: 0, pitch: 0 });

  // Unlock blend state. `from` is the orientation at the moment of unlocking.
  const blendFromRef = useRef<Quaternion | null>(null);
  const blendStartRef = useRef(0);
  const [blendProgress, setBlendProgress] = useState(1);

  const toggleLock = useCallback(() => {
    setIsLocked((wasLocked) => {
      if (!wasLocked) {
        // Locking: capture exactly what is on screen right now, including any drag already
        // applied, so the transition into the locked state is invisible.
        setFrozen((current) => {
          const base = current ?? readLiveOrientation();
          return composeDragOffset(base, drag.yaw, drag.pitch);
        });
        setDrag({ yaw: 0, pitch: 0 });
        return true;
      }
      // Unlocking: blend from what is displayed toward the live attitude.
      setFrozen((current) => {
        blendFromRef.current = current ? composeDragOffset(current, drag.yaw, drag.pitch) : null;
        return null;
      });
      setDrag({ yaw: 0, pitch: 0 });
      blendStartRef.current = Date.now();
      setBlendProgress(0);
      return false;
    });
  }, [drag.yaw, drag.pitch, readLiveOrientation]);

  const applyDrag = useCallback(
    (deltaXPoints: number, deltaYPoints: number) => {
      if (!isLocked) return; // drag-to-pan is a locked-only affordance
      if (!Number.isFinite(deltaXPoints) || !Number.isFinite(deltaYPoints)) return;
      setDrag((previous) => ({
        // Dragging right should sweep the sky left, matching direct manipulation.
        yaw: previous.yaw + deltaXPoints * DRAG_DEGREES_PER_POINT,
        pitch: previous.pitch - deltaYPoints * DRAG_DEGREES_PER_POINT
      }));
    },
    [isLocked]
  );

  // Drive the unlock blend to completion.
  useEffect(() => {
    if (blendProgress >= 1 || !blendFromRef.current) return;
    const id = setInterval(() => {
      const elapsed = Date.now() - blendStartRef.current;
      const t = Math.min(1, elapsed / UNLOCK_BLEND_MS);
      setBlendProgress(t);
      if (t >= 1) {
        blendFromRef.current = null;
        clearInterval(id);
      }
    }, 16);
    return () => clearInterval(id);
  }, [blendProgress]);

  // Resolve the orientation to render. Exactly one value per render, used by every layer.
  let orientation: Quaternion;
  let source: "live" | "locked" | "drag" | "unlock-blend";
  if (isLocked && frozen) {
    const dragged = drag.yaw !== 0 || drag.pitch !== 0;
    orientation = dragged ? composeDragOffset(frozen, drag.yaw, drag.pitch) : frozen;
    source = dragged ? "drag" : "locked";
  } else if (blendFromRef.current && blendProgress < 1) {
    orientation = slerp(blendFromRef.current, live, blendProgress);
    source = "unlock-blend";
  } else {
    orientation = live;
    source = "live";
  }

  if (__DEV__) {
    logOrientationSample({
      orientation,
      step: 0,
      still: isStill,
      source,
      dragYaw: drag.yaw,
      dragPitch: drag.pitch,
      blend: blendProgress
    });
  }

  return {
    basis: cameraBasisFromQuaternion(orientation),
    orientation,
    available,
    isLocked,
    isStill,
    toggleLock,
    applyDrag
  };
}
