// The First Light mission — PURE step definitions plus the capability-driven builder that
// decides which steps this particular user actually gets. No react-native imports, so the
// whole flow is unit-testable in plain Node (scripts/first-light-selftest.js).
//
// Two product rules shape the builder, and both exist to keep a purchase out of the required
// tutorial path:
//
//   TIME TRAVEL is premium in Sky Lens (the 🕐 control opens the paywall for a free user).
//   Highlighting it during First Light would hand a free user a paywall as the only way to
//   finish a step, so the step is OMITTED for non-entitled users rather than shown and blocked.
//
//   SAVING TO THE VAULT is premium (every Vault write entry point is). The step therefore has
//   two shapes: the real save for entitled users, and a non-gated "open Learn" step otherwise.
//   Nothing here weakens, bypasses, or duplicates the existing gates — it only chooses which
//   step to show.

export type FirstLightStepId =
  | "welcome"
  | "lookAround"
  | "findObject"
  | "openCard"
  | "constellation"
  | "lockSky"
  | "exploreTime"
  | "saveDiscovery"
  | "completion";

/** Where a step is presented. The welcome step precedes Sky Lens; the rest live inside it. */
export type FirstLightHost = "root" | "skyLens";

/** Which shape the save step took — reported back so the summary can be honest about it. */
export type SaveStepVariant = "vault" | "learn";

/** Registered tour-target keys. Controls opt in with `useTourTarget(<key>)`. */
export const FIRST_LIGHT_TARGETS = {
  /** The existing "Lock Sky" chip in Sky Lens. */
  lockSky: "skyLens.lockSky",
  /** The existing time-travel (🕐) button in the Sky Lens top HUD. */
  timeTravel: "skyLens.timeTravel",
  /** The existing "Save to Vault" button inside the object info card. */
  infoCardSave: "skyLens.infoCard.save",
} as const;

// Sky objects are NOT registered targets. Their position comes from the live projection, which
// changes every frame, and registering a continuously-moving view would invalidate the whole
// layout registry sixty times a second. The Sky Lens host instead hands the overlay an explicit
// spotlight rect (TourOverlay's `spotlightRect`), computed from the same projection the scene
// is drawn with.

export type FirstLightTargetKey = (typeof FIRST_LIGHT_TARGETS)[keyof typeof FIRST_LIGHT_TARGETS];

export type FirstLightStep = {
  id: FirstLightStepId;
  host: FirstLightHost;
  heading: string;
  copy: string;
  /** Continue stays disabled until the real action is observed. */
  requiresAction: boolean;
  targetKey?: FirstLightTargetKey;
  continueLabel?: string;
  variant?: SaveStepVariant;
};

export type FirstLightCapabilities = {
  /** From the shared useEntitlement() — the single source of truth. Never inferred. */
  isPremium: boolean;
  /** Device motion is delivering orientation (false on a simulator or with motion denied). */
  motionAvailable: boolean;
  /** The existing Sky Lens time control is mounted and intended for release. */
  timeControlAvailable: boolean;
  /** An object can actually be saved through the existing Vault flow. */
  vaultSaveAvailable: boolean;
  /** The Learn tab is reachable, so the non-gated fallback step has somewhere to go. */
  learnAvailable: boolean;
};

/**
 * Whether the Sky Lens time control ships and is release-intended. Declared here rather than
 * discovered when Sky Lens mounts, so the app root can resolve the FULL mission length before
 * the tour starts — otherwise the progress indicator opens at "Step 1 of 7" and jumps to
 * "of 9" the moment Sky Lens reports in.
 */
export const TIME_CONTROL_SHIPS_IN_SKY_LENS = true;
/** The Learn tab is part of the locked navigation, so the non-gated fallback always has a home. */
export const LEARN_TAB_SHIPS = true;

export const DEFAULT_CAPABILITIES: FirstLightCapabilities = {
  isPremium: false,
  motionAvailable: false,
  timeControlAvailable: false,
  vaultSaveAvailable: false,
  learnAvailable: false,
};

const WELCOME: FirstLightStep = {
  id: "welcome",
  host: "root",
  heading: "Welcome to First Light",
  copy: "Let’s explore the sky together. You can leave the tour at any time.",
  requiresAction: false,
  continueLabel: "Begin",
};

const LOOK_AROUND: FirstLightStep = {
  id: "lookAround",
  host: "skyLens",
  heading: "Look around",
  copy: "Move your phone slowly. The sky follows where you point.",
  requiresAction: true,
};

const FIND_OBJECT: FirstLightStep = {
  id: "findObject",
  host: "skyLens",
  heading: "Find your first object",
  copy: "Follow the guide until the highlighted object enters view.",
  requiresAction: true,
};

const OPEN_CARD: FirstLightStep = {
  id: "openCard",
  host: "skyLens",
  heading: "Tap to learn more",
  copy: "Every object has a story. Tap the highlighted object to open its card.",
  requiresAction: true,
};

const CONSTELLATION: FirstLightStep = {
  id: "constellation",
  host: "skyLens",
  heading: "Connect the stars",
  copy: "Constellation lines help familiar patterns stand out.",
  requiresAction: false,
};

const LOCK_SKY: FirstLightStep = {
  id: "lockSky",
  host: "skyLens",
  heading: "Hold the sky still",
  copy: "Lock the view, then drag to explore comfortably.",
  requiresAction: true,
  targetKey: FIRST_LIGHT_TARGETS.lockSky,
};

const EXPLORE_TIME: FirstLightStep = {
  id: "exploreTime",
  host: "skyLens",
  heading: "Move through time",
  copy: "Slide forward or backward to see how the sky changes.",
  requiresAction: true,
  targetKey: FIRST_LIGHT_TARGETS.timeTravel,
};

const SAVE_TO_VAULT: FirstLightStep = {
  id: "saveDiscovery",
  host: "skyLens",
  heading: "Keep your discovery",
  copy: "Save objects you want to revisit later.",
  requiresAction: true,
  targetKey: FIRST_LIGHT_TARGETS.infoCardSave,
  variant: "vault",
};

const OPEN_LEARN: FirstLightStep = {
  id: "saveDiscovery",
  host: "skyLens",
  heading: "Go deeper",
  copy: "Learn has short guides to tonight’s sky. Open it whenever you want more.",
  requiresAction: false,
  variant: "learn",
};

const COMPLETION: FirstLightStep = {
  id: "completion",
  host: "skyLens",
  heading: "Your first light",
  copy: "You’re ready to explore. The sky is yours.",
  requiresAction: false,
  continueLabel: "Finish",
};

/**
 * The ordered mission for these capabilities. Steps that the app cannot support safely are
 * omitted entirely — never shown as a dead end, and never replaced by a new release-critical
 * control invented for the tutorial.
 */
export function buildFirstLightSteps(
  capabilities: Partial<FirstLightCapabilities> = {}
): FirstLightStep[] {
  const caps: FirstLightCapabilities = { ...DEFAULT_CAPABILITIES, ...capabilities };
  const steps: FirstLightStep[] = [WELCOME, LOOK_AROUND, FIND_OBJECT, OPEN_CARD, CONSTELLATION, LOCK_SKY];

  // Premium-only control: omitted for a free user so the tour never dead-ends on a paywall.
  if (caps.timeControlAvailable && caps.isPremium) steps.push(EXPLORE_TIME);

  if (caps.vaultSaveAvailable && caps.isPremium) steps.push(SAVE_TO_VAULT);
  else if (caps.learnAvailable) steps.push(OPEN_LEARN);

  steps.push(COMPLETION);
  return steps;
}

/** The steps this host is responsible for rendering. */
export function stepsForHost(steps: ReadonlyArray<FirstLightStep>, host: FirstLightHost): FirstLightStep[] {
  return steps.filter((step) => step.host === host);
}

export function findStepIndex(steps: ReadonlyArray<FirstLightStep>, stepId: string): number {
  return steps.findIndex((step) => step.id === stepId);
}

/**
 * Fallback copy for "Look around" when the device cannot supply orientation (simulator, or
 * motion unavailable/denied). The sky is still explorable by locking and dragging, so the step
 * explains that and lets the user continue instead of stranding them.
 */
export const LOOK_AROUND_NO_MOTION_HINT =
  "Motion isn’t available on this device, so the sky won’t follow your phone. Lock the sky and drag to explore instead — you can continue either way.";

/** Shown on the find/tap steps when no live object could be resolved (see firstLightTargets). */
export const NO_LIVE_TARGET_HINT =
  "Nothing bright is above your horizon right now, so this step uses a practice marker instead of a real object. You can continue whenever you like.";

/**
 * Shown while the object steps are waiting for something worth pointing at.
 *
 * The tour used to nominate the best object in the WHOLE SKY, which could be behind the user —
 * "Turn around for Venus", with Continue disabled until they did. It now waits for an object
 * that is genuinely in view, and says so, rather than naming one they cannot see.
 */
export const NO_VISIBLE_TARGET_HINT =
  "Nothing bright is in view yet. Sweep your phone slowly across the sky — the moment something suitable comes into frame, it will be highlighted here.";

/**
 * Shown once an object step has given up waiting. It states plainly that the step was NOT
 * completed: nothing here claims the user found or tapped anything.
 */
export const OBJECT_STEP_FALLBACK_HINT =
  "We couldn’t find a bright object in view for this step, so it’s being skipped rather than leaving you stuck. You can tap any object in Sky Lens to open its card whenever you like.";
