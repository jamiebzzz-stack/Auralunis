// First Light tutorial state — PURE and VERSIONED. No react-native or storage imports, so
// every default, migration, and transition is unit-testable in plain Node
// (scripts/first-light-selftest.js).
//
// Design rules this file enforces:
//   • Missing or corrupt persisted data yields a valid default — never a throw, never a
//     half-populated object that makes the app think a fresh user already finished the tour.
//   • The state is namespaced to First Light. It never reads or writes onboarding, birth
//     data, entitlement, settings, or Vault state, so a replay cannot disturb them.
//   • A user who SKIPPED is not asked again. Only an explicit replay, or a future tour
//     version that deliberately opts in, brings the offer back.

export const FIRST_LIGHT_VERSION = 1;

export type FirstLightStatus = "notStarted" | "inProgress" | "completed" | "skipped";

export type FirstLightState = {
  firstLightVersion: number;
  status: FirstLightStatus;
  /** Step id the user was on, so an interrupted tour can resume instead of restarting. */
  currentStep: string | null;
  contextualTipsSeen: string[];
  lastUpdatedAt: string | null;
};

export const DEFAULT_FIRST_LIGHT_STATE: FirstLightState = {
  firstLightVersion: FIRST_LIGHT_VERSION,
  status: "notStarted",
  currentStep: null,
  contextualTipsSeen: [],
  lastUpdatedAt: null,
};

const VALID_STATUSES: ReadonlyArray<FirstLightStatus> = [
  "notStarted",
  "inProgress",
  "completed",
  "skipped",
];

/**
 * Tour versions whose arrival should re-offer First Light to users who already finished or
 * skipped an older version. Deliberately EMPTY for v1: shipping a new version must be an
 * explicit product decision, never an accident of bumping a number.
 */
export const VERSIONS_REQUIRING_REPROMPT: ReadonlyArray<number> = [];

function sanitizeTips(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry === "string" && entry.trim().length > 0) seen.add(entry);
  }
  return [...seen];
}

/**
 * Turn anything at all — `null`, a truncated write, a string, an object from a future schema —
 * into a valid FirstLightState. Unknown fields are dropped; recognisable fields are kept.
 */
export function parseFirstLightState(raw: unknown): FirstLightState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_FIRST_LIGHT_STATE };
  }
  const candidate = raw as Partial<Record<keyof FirstLightState, unknown>>;

  const version =
    typeof candidate.firstLightVersion === "number" && Number.isFinite(candidate.firstLightVersion)
      ? Math.max(0, Math.trunc(candidate.firstLightVersion))
      : 0;

  const status =
    typeof candidate.status === "string" && VALID_STATUSES.includes(candidate.status as FirstLightStatus)
      ? (candidate.status as FirstLightStatus)
      : "notStarted";

  const currentStep =
    typeof candidate.currentStep === "string" && candidate.currentStep.trim().length > 0
      ? candidate.currentStep
      : null;

  const lastUpdatedAt =
    typeof candidate.lastUpdatedAt === "string" && candidate.lastUpdatedAt.trim().length > 0
      ? candidate.lastUpdatedAt
      : null;

  return {
    firstLightVersion: version,
    status,
    currentStep,
    contextualTipsSeen: sanitizeTips(candidate.contextualTipsSeen),
    lastUpdatedAt,
  };
}

/**
 * Bring a parsed state up to the current tour version.
 *
 * Migration is deliberately conservative: it only stamps the new version number and, when a
 * version is listed in VERSIONS_REQUIRING_REPROMPT, returns a finished user to "notStarted" so
 * the offer can appear again. Tips already seen are preserved — a version bump is not a reason
 * to re-teach everything.
 */
export function migrateFirstLightState(state: FirstLightState): FirstLightState {
  return migrateToVersion(state, FIRST_LIGHT_VERSION, VERSIONS_REQUIRING_REPROMPT);
}

/**
 * The migration rule itself, with the target version and the reprompt list as parameters so
 * BOTH branches are exercisable by a test — including the "a future version deliberately
 * re-offers the tour" path that no shipped version currently takes.
 */
export function migrateToVersion(
  state: FirstLightState,
  targetVersion: number,
  repromptVersions: ReadonlyArray<number>
): FirstLightState {
  if (state.firstLightVersion === targetVersion) return state;

  const crossed = repromptVersions.some(
    (version) => version > state.firstLightVersion && version <= targetVersion
  );

  if (!crossed) {
    return { ...state, firstLightVersion: targetVersion };
  }
  return {
    ...state,
    firstLightVersion: targetVersion,
    status: "notStarted",
    currentStep: null,
  };
}

/** Load path in one call: parse whatever was stored, then migrate it. */
export function hydrateFirstLightState(raw: unknown): FirstLightState {
  return migrateFirstLightState(parseFirstLightState(raw));
}

/**
 * Whether the app may offer First Light unprompted.
 *
 * "inProgress" counts, so a tour interrupted by a crash or a force-quit is offered again as a
 * resume. "skipped" and "completed" never do — that is the promise made to a user who said no.
 */
export function shouldOfferFirstLight(state: FirstLightState): boolean {
  return state.status === "notStarted" || state.status === "inProgress";
}

/** True when the offer should read as "pick up where you left off". */
export function isResumable(state: FirstLightState): boolean {
  return state.status === "inProgress" && typeof state.currentStep === "string";
}

export function markStarted(state: FirstLightState, stepId: string, nowISO: string): FirstLightState {
  return {
    ...state,
    firstLightVersion: FIRST_LIGHT_VERSION,
    status: "inProgress",
    currentStep: stepId,
    lastUpdatedAt: nowISO,
  };
}

export function markStep(state: FirstLightState, stepId: string, nowISO: string): FirstLightState {
  if (state.status !== "inProgress" && state.status !== "notStarted") return state;
  return {
    ...state,
    firstLightVersion: FIRST_LIGHT_VERSION,
    status: "inProgress",
    currentStep: stepId,
    lastUpdatedAt: nowISO,
  };
}

export function markSkipped(state: FirstLightState, nowISO: string): FirstLightState {
  return {
    ...state,
    firstLightVersion: FIRST_LIGHT_VERSION,
    status: "skipped",
    currentStep: null,
    lastUpdatedAt: nowISO,
  };
}

export function markCompleted(state: FirstLightState, nowISO: string): FirstLightState {
  return {
    ...state,
    firstLightVersion: FIRST_LIGHT_VERSION,
    status: "completed",
    currentStep: null,
    lastUpdatedAt: nowISO,
  };
}

/**
 * Replay: a clean tour run. Everything OUTSIDE the tour is untouched, and even inside the tour
 * the record of contextual tips already seen survives — replaying the guided tour is not a
 * request to be shown every one-time tip again.
 */
export function resetForReplay(state: FirstLightState, nowISO: string): FirstLightState {
  return {
    firstLightVersion: FIRST_LIGHT_VERSION,
    status: "inProgress",
    currentStep: null,
    contextualTipsSeen: [...state.contextualTipsSeen],
    lastUpdatedAt: nowISO,
  };
}

/**
 * The step id a resumed tour should open on, or null to start from the beginning.
 *
 * Total and defensive: a document that is not `inProgress`, has no pointer, or points at a step
 * that does not exist in THIS user's mission (capabilities differ, or the persisted id is
 * corrupt / from a future version) resolves to null, and the caller opens at Welcome. A tutorial
 * must never fail to start because of a bad pointer.
 */
export function resolveResumeStepId(
  state: FirstLightState,
  availableStepIds: ReadonlyArray<string>
): string | null {
  if (!isResumable(state)) return null;
  const pointer = state.currentStep;
  if (!pointer) return null;
  return availableStepIds.includes(pointer) ? pointer : null;
}

export function hasSeenTip(state: FirstLightState, tipId: string): boolean {
  return state.contextualTipsSeen.includes(tipId);
}

export function markTipSeen(state: FirstLightState, tipId: string, nowISO: string): FirstLightState {
  if (!tipId || state.contextualTipsSeen.includes(tipId)) return state;
  return {
    ...state,
    firstLightVersion: FIRST_LIGHT_VERSION,
    contextualTipsSeen: [...state.contextualTipsSeen, tipId],
    lastUpdatedAt: nowISO,
  };
}
