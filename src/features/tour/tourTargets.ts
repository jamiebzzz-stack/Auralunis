// Registered tour-target keys — the stable names Sky Lens controls opt in under.
//
// These used to live in firstLightSteps.ts, back when the First Light mission spotlighted them.
// That mission is gone and the app tour highlights nothing, but the TourTargetRegistry is
// reusable infrastructure and these controls still register themselves, so any future guided
// flow has them available. Registering a target is inert unless something asks to measure it.
export const TOUR_TARGETS = {
  /** The "Lock Sky" chip in Sky Lens. */
  lockSky: "skyLens.lockSky",
  /** The time-travel (🕐) button in the Sky Lens top HUD. */
  timeTravel: "skyLens.timeTravel",
  /** The "Save to Vault" button inside the object info card. */
  infoCardSave: "skyLens.infoCard.save",
} as const;

export type TourTargetKey = (typeof TOUR_TARGETS)[keyof typeof TOUR_TARGETS];
