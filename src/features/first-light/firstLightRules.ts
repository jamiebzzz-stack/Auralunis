// Decision rules that used to live inside effects — PURE, so the exact situations the audit
// caught can be asserted in plain Node (scripts/first-light-selftest.js) instead of only being
// reachable by driving a simulator.
//
// Each function here exists because a bug got through: the no-motion trap on "Find your first
// object", the sky left frozen when the time step was exited by Back or Skip, and duplicate
// Vault entries on replay.

/** Steps that ask the user to interact with a specific sky object. */
export type ObjectStepId = "findObject" | "openCard";

export type ObjectStepSituation = {
  step: ObjectStepId;
  /** Device motion is delivering orientation. False on a simulator / when motion is denied. */
  motionAvailable: boolean;
  /** The chosen target is the tutorial-only practice marker, not live astronomy. */
  targetSimulated: boolean;
  /** The target is currently projected on screen and in front of the camera. */
  targetOnScreen: boolean;
  /** The object card that is open belongs to the tutorial target. */
  correctCardOpen: boolean;
};

/**
 * Whether an object step may be treated as satisfied.
 *
 * THE RULE THAT WAS MISSING: without DeviceMotion the rendered orientation is frozen, and
 * drag-to-pan only works once the sky is locked — so an off-screen object can never be brought
 * into view. Requiring it meant Continue stayed disabled forever (observed on the simulator:
 * "Turn around for Venus", Continue permanently dim). A user who CAN reach the object still
 * satisfies these steps the real way; the no-motion path simply is not blocked by them.
 *
 * Nothing here claims motion was detected — the copy for this case says the opposite.
 */
export function isObjectStepSatisfied(situation: ObjectStepSituation): boolean {
  const { step, motionAvailable, targetSimulated, targetOnScreen, correctCardOpen } = situation;

  // A practice marker has no real position to hunt for.
  if (targetSimulated) return true;

  if (step === "findObject") {
    if (!motionAvailable) return true;
    return targetOnScreen;
  }

  // openCard: the genuine completion is always the correct card opening.
  if (correctCardOpen) return true;
  // …but with no motion an off-screen object cannot be tapped, so it cannot be required.
  return !motionAvailable && !targetOnScreen;
}

export type TimeStepExit = {
  /** The step that was showing before this change (null if none). */
  previousStepId: string | null;
  /** The step showing now — null when the tour ended, was skipped, or unmounted. */
  nextStepId: string | null;
  /** The user explicitly asked to keep the changed time. */
  keepChangedTime: boolean;
  /** Current scrub offset in minutes; 0 means the sky is already live. */
  timeOffsetMinutes: number;
};

/**
 * Whether leaving the time step must restore the live sky.
 *
 * Wiring the restore to the Continue handler alone left the sky frozen hours away whenever the
 * user pressed Back or Skip Tour instead. Expressed as "the time step is no longer showing",
 * this covers Continue, Back, Skip, pause, and unmount with one rule.
 */
export function shouldRestoreLiveTime(exit: TimeStepExit): boolean {
  if (exit.previousStepId !== "exploreTime") return false;
  if (exit.nextStepId === "exploreTime") return false;
  if (exit.keepChangedTime) return false;
  return Number.isFinite(exit.timeOffsetMinutes) && exit.timeOffsetMinutes !== 0;
}

/** The subset of a Vault entry the duplicate check needs. */
export type SavedEntry = { type: string; title: string };

/**
 * Whether this object is already in the Vault.
 *
 * The Sky Lens "saved" set only remembers the current mount, so re-opening Sky Lens — or
 * replaying First Light — used to write a second identical archive entry. This is a read-only
 * check: it never edits, merges, or overwrites an existing entry, and it does not touch Vault
 * encryption or the premium gate that runs before it.
 */
export function isAlreadySavedToVault(
  entries: ReadonlyArray<SavedEntry>,
  objectName: string
): boolean {
  if (!objectName) return false;
  return entries.some((entry) => entry.type === "archive" && entry.title === objectName);
}
