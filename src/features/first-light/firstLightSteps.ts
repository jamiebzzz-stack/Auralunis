// The First Light tutorial — PURE step definitions. No react-native imports, so the whole flow
// is unit-testable in plain Node (scripts/first-light-selftest.js).
//
// WHAT THIS IS NOW, AND WHY IT CHANGED
//
// First Light used to be a hands-on mission: look around, find a live object, tap it, lock the
// sky, drag it, save to the Vault. Each of those steps gated Continue on observing the real
// action, and on a physical device that turned out to be a trap. The tour would nominate an
// object that was genuinely up but behind the user ("Turn around for Venus"), and Continue
// stayed disabled until they happened to turn around — which, in testing, they did not. Earlier
// rounds also had it ringing the HUD and calling it a planet, because the projection ran before
// the viewport and the observer location were real.
//
// Those were symptoms of one decision: a TUTORIAL that cannot finish unless the SKY cooperates.
// Clouds, a ceiling, a denied location permission, a device with no magnetometer, or simply
// facing the wrong way were all enough to strand a first-time user inside onboarding.
//
// So the tutorial is now purely informational: five screens, four buttons, no conditions. It
// explains what the app does and gets out of the way. Everything it describes — Sky Lens, the
// sky map, object cards, Learn, the Vault — is still there to be used the moment the tutorial
// closes; the tutorial simply no longer insists on watching you do it.
//
// INVARIANTS (asserted in the self-tests):
//   • Exactly five screens, all informational, all hosted at the app root.
//   • No step has requiresAction, so Continue is ALWAYS enabled.
//   • No step has a targetKey, so nothing is measured, spotlit, or highlighted.
//   • Nothing here reads sensors, location, entitlement, the Vault, or StoreKit.

export type FirstLightStepId =
  | "welcome"
  | "exploreSky"
  | "learnAstronomy"
  | "saveDiscoveries"
  | "ready";

/**
 * Where a step is presented. Every tutorial screen is "root" — it renders over the app shell
 * and never inside Sky Lens, so the tutorial cannot intercept a Sky Lens gesture or depend on
 * that screen being mounted. The type is kept because TourOverlay hosts are a general idea.
 */
export type FirstLightHost = "root" | "skyLens";

/**
 * Retained only for compatibility with the persisted document shape. The save step no longer
 * exists, so nothing produces a variant; FirstLightContext resolves it to null.
 */
export type SaveStepVariant = "vault" | "learn";

/**
 * Registered tour-target keys.
 *
 * The TUTORIAL no longer uses these — no screen highlights a control. They remain because the
 * TourTargetRegistry is reusable infrastructure and Sky Lens still registers these controls
 * (SkyLensScreen, SkyLensInfoCard), so any future guided flow has them available. Registering a
 * target is inert unless something asks to measure it.
 */
export const FIRST_LIGHT_TARGETS = {
  /** The existing "Lock Sky" chip in Sky Lens. */
  lockSky: "skyLens.lockSky",
  /** The existing time-travel (🕐) button in the Sky Lens top HUD. */
  timeTravel: "skyLens.timeTravel",
  /** The existing "Save to Vault" button inside the object info card. */
  infoCardSave: "skyLens.infoCard.save",
} as const;

export type FirstLightTargetKey = (typeof FIRST_LIGHT_TARGETS)[keyof typeof FIRST_LIGHT_TARGETS];

export type FirstLightStep = {
  id: FirstLightStepId;
  host: FirstLightHost;
  heading: string;
  copy: string;
  /**
   * Always false for every tutorial screen. The field is kept because the shared tour machine
   * understands it, and keeping it makes "no screen requires an action" a directly assertable
   * property rather than an absence.
   */
  requiresAction: boolean;
  /** Never set by the tutorial — no screen spotlights a control. */
  targetKey?: FirstLightTargetKey;
  continueLabel?: string;
  variant?: SaveStepVariant;
};

/**
 * Capability inputs. The tutorial is identical for everyone now, so nothing here changes its
 * shape — no screen is added or removed for premium, sensors, or anything else. The type and the
 * reporting path are kept because FirstLightContext still waits for capabilities to RESOLVE
 * before presenting the offer, which is what stops the progress indicator opening on a
 * provisional total.
 */
export type FirstLightCapabilities = {
  isPremium: boolean;
  motionAvailable: boolean;
  timeControlAvailable: boolean;
  vaultSaveAvailable: boolean;
  learnAvailable: boolean;
};

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
  heading: "Welcome to AuraLunis",
  copy:
    "AuraLunis turns your phone into a window on the real sky above you. Track the Sun, Moon, planets and stars in real time, learn the astronomy behind them, and keep the discoveries that matter to you. This quick tour takes about a minute — you can leave it at any point.",
  requiresAction: false,
  continueLabel: "Next",
};

const EXPLORE_SKY: FirstLightStep = {
  id: "exploreSky",
  host: "root",
  heading: "Explore the sky",
  copy:
    "Sky Lens renders the sky as it is right now, aligned to where you point. Planets, bright stars and constellation patterns are drawn in their true positions, and there is a manual sky map for browsing without moving at all. Tap any object while you explore and its card opens with the details behind it. Nothing to do now — it is all waiting when the tour ends.",
  requiresAction: false,
  continueLabel: "Next",
};

const LEARN_ASTRONOMY: FirstLightStep = {
  id: "learnAstronomy",
  host: "root",
  heading: "Learn astronomy",
  copy:
    "The Learn tab holds short, readable lessons that start from the beginning and build up to deeper material. Your progress is remembered as you go, so you can read one lesson at a time and pick the thread back up whenever you like.",
  requiresAction: false,
  continueLabel: "Next",
};

const SAVE_DISCOVERIES: FirstLightStep = {
  id: "saveDiscoveries",
  host: "root",
  heading: "Save your discoveries",
  copy:
    "Found something you want to remember? Your Vault keeps sky notes and saved objects encrypted on your device, alongside the lessons you have marked. The Vault is a Premium feature, and nothing is ever saved unless you choose to save it.",
  requiresAction: false,
  continueLabel: "Next",
};

const READY: FirstLightStep = {
  id: "ready",
  host: "root",
  heading: "You’re ready",
  copy:
    "That is everything you need to start. Head to the Sky tab whenever you are ready to look up — and if you want this tour again, it is in Settings under Replay First Light.",
  requiresAction: false,
  continueLabel: "Finish",
};

/** The tutorial, in order. Deliberately fixed: the same five screens for every user. */
export const FIRST_LIGHT_STEPS: ReadonlyArray<FirstLightStep> = [
  WELCOME,
  EXPLORE_SKY,
  LEARN_ASTRONOMY,
  SAVE_DISCOVERIES,
  READY,
];

/** How many screens the tutorial has. Exported so the total can be asserted directly. */
export const FIRST_LIGHT_STEP_COUNT = FIRST_LIGHT_STEPS.length;

/**
 * The tutorial for these capabilities.
 *
 * The parameter is accepted and ignored: every user gets the same five screens. It is kept so
 * FirstLightContext's capability-resolution gate — which exists to stop "Step 1 of 5" opening on
 * a provisional total — keeps working without special-casing.
 */
export function buildFirstLightSteps(
  _capabilities: Partial<FirstLightCapabilities> = {}
): FirstLightStep[] {
  return [...FIRST_LIGHT_STEPS];
}

/** The steps this host is responsible for rendering. */
export function stepsForHost(
  steps: ReadonlyArray<FirstLightStep>,
  host: FirstLightHost
): FirstLightStep[] {
  return steps.filter((step) => step.host === host);
}

export function findStepIndex(steps: ReadonlyArray<FirstLightStep>, stepId: string): number {
  return steps.findIndex((step) => step.id === stepId);
}
