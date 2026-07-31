// Guided-tour state machine — PURE. No react-native / storage imports, so every transition
// is unit-testable in plain Node (scripts/first-light-selftest.js).
//
// The reducer is total: any (state, action, steps) triple returns a valid state. It never
// calls another setter, never writes a ref, and never reads anything outside its arguments —
// so React may invoke it twice (StrictMode) with identical results.

/**
 * "paused" exists so a tour whose host screen went away (e.g. the user closed Sky Lens
 * mid-step) stops rendering WITHOUT being silently abandoned or silently left running with no
 * UI. A paused tour keeps its position and its satisfied actions, and "start" resumes it.
 */
export type TourStatus = "idle" | "running" | "paused" | "completed" | "skipped";

export type TourStepSpec = {
  id: string;
  /**
   * When true the user must actually DO the thing (move the phone, tap the object, lock the
   * sky…) before Continue is enabled. Steps that only explain are advanced by Continue alone.
   */
  requiresAction?: boolean;
};

export type TourMachineState = {
  status: TourStatus;
  /** Index into the CURRENT step list. Always clamped to a valid position while running. */
  index: number;
  /** Ids of steps whose required action has been observed. Ids, not indices, so a step list
   *  that changes shape (a capability-omitted step) cannot mark the wrong step complete. */
  satisfiedStepIds: string[];
};

export const INITIAL_TOUR_STATE: TourMachineState = {
  status: "idle",
  index: 0,
  satisfiedStepIds: [],
};

export type TourAction =
  | { type: "start" }
  | { type: "restart" }
  | { type: "pause" }
  | { type: "next" }
  | { type: "back" }
  | { type: "skip" }
  | { type: "complete" }
  | { type: "satisfy"; stepId: string }
  | { type: "goto"; stepId: string }
  | { type: "reset" };

function clampIndex(index: number, steps: ReadonlyArray<TourStepSpec>): number {
  if (steps.length === 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.min(steps.length - 1, Math.max(0, Math.trunc(index)));
}

export function currentStep(
  state: TourMachineState,
  steps: ReadonlyArray<TourStepSpec>
): TourStepSpec | null {
  if (state.status !== "running" || steps.length === 0) return null;
  return steps[clampIndex(state.index, steps)] ?? null;
}

export function isStepSatisfied(state: TourMachineState, step: TourStepSpec | null): boolean {
  if (!step) return false;
  if (!step.requiresAction) return true;
  return state.satisfiedStepIds.includes(step.id);
}

/** Whether Continue is enabled for the step now showing. */
export function canContinue(
  state: TourMachineState,
  steps: ReadonlyArray<TourStepSpec>
): boolean {
  return isStepSatisfied(state, currentStep(state, steps));
}

export function canGoBack(state: TourMachineState): boolean {
  return state.status === "running" && state.index > 0;
}

/** A paused tour is resumable: it has a position to come back to. */
export function isPaused(state: TourMachineState): boolean {
  return state.status === "paused";
}

export function isLastStep(
  state: TourMachineState,
  steps: ReadonlyArray<TourStepSpec>
): boolean {
  return steps.length > 0 && clampIndex(state.index, steps) === steps.length - 1;
}

export function tourReducer(
  state: TourMachineState,
  action: TourAction,
  steps: ReadonlyArray<TourStepSpec>
): TourMachineState {
  switch (action.type) {
    case "start":
      // Resume where the user left off when the tour is already running OR paused; otherwise
      // open at the first step. Never clears satisfied steps, so a resumed tour keeps progress.
      if (state.status === "running" || state.status === "paused") {
        return { ...state, status: "running", index: clampIndex(state.index, steps) };
      }
      return { status: "running", index: 0, satisfiedStepIds: state.satisfiedStepIds };

    case "restart":
      // Replay: a clean run from step one. Satisfied actions are cleared because the user is
      // deliberately doing the tour again.
      return { status: "running", index: 0, satisfiedStepIds: [] };

    case "next": {
      if (state.status !== "running" || steps.length === 0) return state;
      const index = clampIndex(state.index, steps);
      if (index >= steps.length - 1) {
        return { ...state, index, status: "completed" };
      }
      return { ...state, index: index + 1 };
    }

    case "back": {
      if (state.status !== "running") return state;
      const index = clampIndex(state.index, steps);
      if (index === 0) return { ...state, index };
      return { ...state, index: index - 1 };
    }

    case "pause":
      // Only a running tour can pause. Position and satisfied actions are preserved.
      if (state.status !== "running") return state;
      return { ...state, status: "paused" };

    case "skip":
      if (state.status !== "running" && state.status !== "paused") return state;
      return { ...state, status: "skipped" };

    case "complete":
      if (state.status !== "running") return state;
      return { ...state, status: "completed" };

    case "satisfy": {
      if (state.satisfiedStepIds.includes(action.stepId)) return state;
      return { ...state, satisfiedStepIds: [...state.satisfiedStepIds, action.stepId] };
    }

    case "goto": {
      const target = steps.findIndex((s) => s.id === action.stepId);
      if (target < 0) return state;
      return { ...state, status: "running", index: target };
    }

    case "reset":
      return INITIAL_TOUR_STATE;

    default:
      return state;
  }
}

/**
 * Re-anchor an index after the step list changes shape.
 *
 * Capability-driven steps (premium time travel, the Vault save) are omitted from the list
 * entirely rather than shown and then blocked. When that list is rebuilt mid-tour a raw index
 * would silently point at a different step, so the position is carried across BY ID: the same
 * step if it survived, otherwise the nearest surviving step at or after the old position.
 */
export function reanchorIndex(
  state: TourMachineState,
  previousSteps: ReadonlyArray<TourStepSpec>,
  nextSteps: ReadonlyArray<TourStepSpec>
): TourMachineState {
  if (nextSteps.length === 0) return { ...state, index: 0 };
  const previous = previousSteps[clampIndex(state.index, previousSteps)];
  if (!previous) return { ...state, index: clampIndex(state.index, nextSteps) };

  const same = nextSteps.findIndex((s) => s.id === previous.id);
  if (same >= 0) return { ...state, index: same };

  // The current step no longer exists — land on the first surviving step that used to come
  // after it, else the last step.
  const previousIndex = previousSteps.findIndex((s) => s.id === previous.id);
  for (let i = previousIndex + 1; i < previousSteps.length; i += 1) {
    const candidate = nextSteps.findIndex((s) => s.id === previousSteps[i].id);
    if (candidate >= 0) return { ...state, index: candidate };
  }
  return { ...state, index: nextSteps.length - 1 };
}
