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

  // Unlock blend timing. The blend START orientation is state (see below), not a ref.
  const blendStartRef = useRef(0);
  const [blendProgress, setBlendProgress] = useState(1);

  // Lock / unlock are plain callbacks that compute their next state from values already in
  // scope. NOTHING is written to a ref and no other setter is called from inside a state
  // updater: React may invoke an updater more than once, and the previous version assigned
  // blendFrom inside a setFrozen updater. A second invocation received the null that the
  // first had returned, wiped blendFrom, and the unlock skipped its blend and snapped.
  //
  // blendFrom is now STATE, set once from the value already displayed, so repeated renders
  // and StrictMode double-invocation cannot erase it.
  const [blendFrom, setBlendFrom] = useState<Quaternion | null>(null);

  const lock = useCallback(() => {
    // Capture exactly what is displayed, including any drag already applied.
    const base = frozen ?? readLiveOrientation();
    const displayed = drag.yaw !== 0 || drag.pitch !== 0
      ? composeDragOffset(base, drag.yaw, drag.pitch)
      : base;
    setFrozen(displayed);
    setDrag({ yaw: 0, pitch: 0 });
    setBlendFrom(null);
    setBlendProgress(1);
    setIsLocked(true);
  }, [frozen, drag.yaw, drag.pitch, readLiveOrientation]);

  const unlock = useCallback(() => {
    // The displayed orientation at this instant becomes the blend start. Computed here,
    // from current values, and stored as state — never derived inside an updater.
    const base = frozen ?? readLiveOrientation();
    const displayed = drag.yaw !== 0 || drag.pitch !== 0
      ? composeDragOffset(base, drag.yaw, drag.pitch)
      : base;
    setBlendFrom(displayed);
    blendStartRef.current = Date.now();
    setBlendProgress(0);
    setFrozen(null);
    setDrag({ yaw: 0, pitch: 0 });
    setIsLocked(false);
  }, [frozen, drag.yaw, drag.pitch, readLiveOrientation]);

  const toggleLock = useCallback(() => {
    if (isLocked) unlock();
    else lock();
  }, [isLocked, lock, unlock]);

  const applyDrag = useCallback(
    (deltaXPoints: number, deltaYPoints: number) => {
      if (!isLocked) return; // drag-to-pan is a locked-only affordance
      if (!Number.isFinite(deltaXPoints) || !Number.isFinite(deltaYPoints)) return;
      setDrag((previous) => ({
        // Pure state derivation — no refs written, no other setters called.
        yaw: previous.yaw + deltaXPoints * DRAG_DEGREES_PER_POINT,
        pitch: previous.pitch - deltaYPoints * DRAG_DEGREES_PER_POINT
      }));
    },
    [isLocked]
  );

  // Drive the unlock blend to completion.
  useEffect(() => {
    if (blendProgress >= 1 || !blendFrom) return;
    const id = setInterval(() => {
      const elapsed = Date.now() - blendStartRef.current;
      const t = Math.min(1, elapsed / UNLOCK_BLEND_MS);
      setBlendProgress(t);
      if (t >= 1) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [blendProgress, blendFrom]);

  // Resolve the orientation to render. Exactly one value per render, used by every layer.
  let orientation: Quaternion;
  let source: "live" | "locked" | "drag" | "unlock-blend";
  if (isLocked && frozen) {
    const dragged = drag.yaw !== 0 || drag.pitch !== 0;
    orientation = dragged ? composeDragOffset(frozen, drag.yaw, drag.pitch) : frozen;
    source = dragged ? "drag" : "locked";
  } else if (blendFrom && blendProgress < 1) {
    // Slerp toward the CURRENT live orientation each frame, so the blend converges even if
    // the device keeps moving during the transition.
    orientation = slerp(blendFrom, live, blendProgress);
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
