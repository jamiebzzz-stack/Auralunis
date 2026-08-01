// When to offer birth-chart setup — PURE, so the rule is testable in plain Node
// (scripts/onboarding-route-selftest.js). Named …Rules so it cannot collide with the component
// file on a case-insensitive filesystem.
//
// Birth-chart setup used to be the FINAL SCREEN of onboarding: the tour ended on a
// "Create My Birth Chart" button, so every new user was funnelled into one feature before they
// had seen the app. It is now separate and entirely optional.
//
// Two rules keep it from becoming another wall:
//
//   1. IT NEVER FOLLOWS THE TOUR IMMEDIATELY. Showing it the moment the tour closes would just
//      recreate the back-to-back-prompts problem the tour rewrite exists to remove. It waits
//      until a LATER launch — one where onboarding was already complete when the app booted.
//   2. IT IS ANSWERED ONCE. "Maybe Later" is remembered exactly as firmly as "Create Chart";
//      neither is asked again, and neither blocks anything.
//
// It also never appears for someone who already has birth data — they have answered it by doing.

/** AsyncStorage key for the answer. Namespaced and owned solely by this prompt. */
export const BIRTH_CHART_PROMPT_KEY = "auralunis.birthChartPrompt.answered";

export type BirthChartPromptSignals = {
  /**
   * Onboarding was ALREADY complete when the app booted — i.e. this is not the launch on which
   * the tour was just finished or skipped. This is what keeps the prompt from stacking onto the
   * end of the tour.
   */
  onboardingCompleteAtBoot: boolean;
  /** The user has already answered the prompt, either way. */
  promptAnswered: boolean;
  /** Durable birth data already exists, so there is nothing to ask. */
  hasBirthData: boolean;
  /** The app proper is on screen (not onboarding, not the boot splash). */
  appReady: boolean;
};

/**
 * Whether to offer birth-chart setup now.
 *
 * Fails toward NOT asking: any missing or ambiguous signal means the prompt stays away. An
 * onboarding prompt that appears when it should not is far more damaging than one that never
 * appears at all — the feature remains reachable from the Sky tab regardless.
 */
export function shouldShowBirthChartPrompt(signals: Partial<BirthChartPromptSignals>): boolean {
  if (!signals) return false;
  if (signals.appReady !== true) return false;
  if (signals.onboardingCompleteAtBoot !== true) return false;
  if (signals.promptAnswered === true) return false;
  if (signals.hasBirthData === true) return false;
  return true;
}
