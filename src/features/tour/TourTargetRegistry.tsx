// TourTargetRegistry — how a guided tour knows WHERE a control is.
//
// Steps never carry screen coordinates. A control opts in with `useTourTarget("some.key")`,
// which hands back a callback ref + onLayout; the overlay later asks the registry to measure
// that key and derives the spotlight from the real, current layout. Rotation, Dynamic Type,
// a taller safe area, or a control that moved because the dock grew are all handled for free,
// because nothing was ever cached as a constant.
//
// Everything here is failure-tolerant: an unregistered key, an unmounted node, or a native
// measure that never calls back all resolve to `null`, and the overlay then renders the step
// without a spotlight rather than pointing at empty sky.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Dimensions } from "react-native";
import type { TourRect } from "./tourGeometry";

/** The slice of a native view the registry actually uses. */
type MeasurableNode = {
  measureInWindow?: (callback: (x: number, y: number, width: number, height: number) => void) => void;
};

/** Native measure is a callback API with no failure channel — never wait on it forever. */
const MEASURE_TIMEOUT_MS = 400;

type TourTargetRegistryValue = {
  registerTarget: (key: string, node: MeasurableNode | null) => void;
  measureTarget: (key: string) => Promise<TourRect | null>;
  hasTarget: (key: string) => boolean;
  /** Bumped whenever a registered layout changes or the screen does — overlays re-measure. */
  layoutNonce: number;
  invalidateLayout: () => void;
};

const TourTargetContext = createContext<TourTargetRegistryValue | undefined>(undefined);

export function TourTargetProvider({ children }: { children: ReactNode }) {
  // Node handles live in a ref: registering a control must never re-render the tree.
  const nodesRef = useRef(new Map<string, MeasurableNode>());
  const [layoutNonce, setLayoutNonce] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const invalidateLayout = useCallback(() => {
    // Guarded so a late onLayout from an unmounting screen can't set state after unmount.
    if (mountedRef.current) setLayoutNonce((n) => n + 1);
  }, []);

  const registerTarget = useCallback((key: string, node: MeasurableNode | null) => {
    if (!key) return;
    if (node) nodesRef.current.set(key, node);
    else nodesRef.current.delete(key);
  }, []);

  const hasTarget = useCallback((key: string) => nodesRef.current.has(key), []);

  const measureTarget = useCallback((key: string): Promise<TourRect | null> => {
    const node = nodesRef.current.get(key);
    if (!node || typeof node.measureInWindow !== "function") return Promise.resolve(null);

    return new Promise<TourRect | null>((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve(null);
      }, MEASURE_TIMEOUT_MS);

      const finish = (rect: TourRect | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(rect);
      };

      try {
        node.measureInWindow!((x, y, width, height) => {
          finish({ x, y, width, height });
        });
      } catch {
        finish(null);
      }
    });
  }, []);

  // Orientation / window-size changes move every target at once.
  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", invalidateLayout);
    return () => subscription.remove();
  }, [invalidateLayout]);

  const value = useMemo<TourTargetRegistryValue>(
    () => ({ registerTarget, measureTarget, hasTarget, layoutNonce, invalidateLayout }),
    [registerTarget, measureTarget, hasTarget, layoutNonce, invalidateLayout]
  );

  return <TourTargetContext.Provider value={value}>{children}</TourTargetContext.Provider>;
}

/**
 * Read the registry. Returns `null` when no provider is mounted — callers degrade to a tour
 * without spotlights instead of throwing, so a control that registers a target can be reused
 * on a screen that has no tour running.
 */
export function useTourTargetRegistry(): TourTargetRegistryValue | null {
  return useContext(TourTargetContext) ?? null;
}

export type TourTargetHandle = {
  ref: (node: MeasurableNode | null) => void;
  onLayout: () => void;
};

/**
 * Register a control as a tour target.
 *
 *   const moon = useTourTarget("skyLens.lockSky");
 *   <Pressable ref={moon.ref} onLayout={moon.onLayout} … />
 *
 * The ref is a CALLBACK ref, so React calls it with `null` on unmount and the entry is removed
 * — no listener, timer, or stale node survives the screen. Safe under StrictMode double-mount:
 * the second registration simply overwrites the first, and the paired null clears it.
 */
export function useTourTarget(key: string): TourTargetHandle {
  const registry = useTourTargetRegistry();
  const registerTarget = registry?.registerTarget;
  const invalidateLayout = registry?.invalidateLayout;

  const ref = useCallback(
    (node: MeasurableNode | null) => {
      registerTarget?.(key, node);
    },
    [key, registerTarget]
  );

  const onLayout = useCallback(() => {
    invalidateLayout?.();
  }, [invalidateLayout]);

  // Unregister when the key changes or the host unmounts, even if React reuses the callback.
  useEffect(() => {
    return () => {
      registerTarget?.(key, null);
    };
  }, [key, registerTarget]);

  return useMemo(() => ({ ref, onLayout }), [ref, onLayout]);
}
