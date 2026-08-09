// One-time contextual mini-guides shown AFTER First Light — PURE catalog + eligibility rules.
//
// Every claim here is checked against the shipping implementation, because a tutorial that
// promises behaviour the app doesn't have is worse than no tutorial:
//
//   • "offline" is true: the sky is computed on-device (astronomy-engine) from bundled star,
//     constellation, and deep-sky catalogs. Weather and live TLE are network extras that fail
//     soft; the planetarium itself needs no connection. Guarded by OFFLINE_CLAIM_SUPPORTED so
//     the claim disappears with one edit if that ever stops being true.
//   • "firstVaultSave" describes what VaultEncryption actually does — a NaCl secretbox key in
//     the device Keychain, ciphertext in local storage, and NO cloud sync of any kind. It
//     claims nothing else.
//   • "premiumDiscovery" states the benefit and leaves the purchase to the existing paywall.

import type { FirstLightState } from "./firstLightState";

export type ContextualTipId =
  | "layers"
  | "constellationZoom"
  | "offline"
  | "firstVaultSave"
  | "premiumDiscovery";

export type ContextualTip = {
  id: ContextualTipId;
  heading: string;
  body: string;
};

/** Flip to false if the sky ever gains a hard network dependency — the tip then stops showing. */
export const OFFLINE_CLAIM_SUPPORTED = true;

export const CONTEXTUAL_TIPS: Record<ContextualTipId, ContextualTip> = {
  layers: {
    id: "layers",
    heading: "Layers",
    body: "Choose what appears in your sky.",
  },
  constellationZoom: {
    id: "constellationZoom",
    heading: "Constellation names",
    body: "More constellation names appear as you zoom in.",
  },
  offline: {
    id: "offline",
    heading: "Works offline",
    body: "Core sky features remain available without a connection.",
  },
  firstVaultSave: {
    id: "firstVaultSave",
    heading: "Your Vault",
    body: "Saved items are encrypted and stay on this device. There is no cloud sync and nothing is uploaded.",
  },
  premiumDiscovery: {
    id: "premiumDiscovery",
    heading: "Premium sky tools",
    body: "Premium adds time travel, night vision, deeper visuals, and the Vault. Have a look whenever you're curious.",
  },
};

export const CONTEXTUAL_TIP_IDS: ReadonlyArray<ContextualTipId> = [
  "layers",
  "constellationZoom",
  "offline",
  "firstVaultSave",
  "premiumDiscovery",
];

/**
 * Everything that can suppress a tip. All of it is state the host already has — nothing here
 * inspects the view tree.
 */
export type TipContext = {
  /** Tips only appear once First Light is settled (completed or skipped) — never during it. */
  firstLightSettled: boolean;
  /** A First Light / tour overlay is on screen: tips must never stack on another tutorial. */
  tourOverlayVisible: boolean;
  /** A critical modal (paywall, layers sheet, legal, onboarding) is up. */
  modalVisible: boolean;
  /** An object info card is open — an active interaction that must not be interrupted. */
  objectCardOpen: boolean;
  /** Another contextual tip is already showing. One at a time, always. */
  otherTipVisible: boolean;
};

/**
 * Whether `tipId` may appear right now. Total and side-effect free: same inputs, same answer.
 * A tip that has been seen once is never eligible again unless the stored state is reset.
 */
export function shouldShowTip(
  tipId: ContextualTipId,
  state: FirstLightState,
  context: TipContext
): boolean {
  if (tipId === "offline" && !OFFLINE_CLAIM_SUPPORTED) return false;
  if (!context.firstLightSettled) return false;
  if (context.tourOverlayVisible) return false;
  if (context.modalVisible) return false;
  if (context.objectCardOpen) return false;
  if (context.otherTipVisible) return false;
  return !state.contextualTipsSeen.includes(tipId);
}

/**
 * How long a tip must stay on screen before it counts as "seen".
 *
 * The original host recorded the impression the instant a tip rendered. Because eligibility is
 * derived from the same `contextualTipsSeen` list, that write made the tip that was showing
 * ineligible on the very next render, the next candidate took its place, and the whole set was
 * consumed in a four-render burst with nothing readable. Impressions are now time-based, and
 * the host holds one tip identity in state, so a tip can never replace itself.
 */
export const TIP_MIN_IMPRESSION_MS = 4000;
/** After this long the tip retires on its own if the user never dismissed it. */
export const TIP_AUTO_HIDE_MS = 12000;

/**
 * The tip a host should be showing, given the one it is already holding.
 *
 * PURE and total. The held tip WINS: once a tip has been chosen it keeps the slot until the
 * host clears it, even after it has been marked seen. That is the property that makes a
 * render-burst impossible — `shouldShowTip` alone cannot express it, because a tip becomes
 * ineligible the moment its impression is recorded.
 *
 * A held tip is dropped only when the context says it must not be on screen at all (a modal, an
 * open object card, a tutorial overlay), so a tip never covers something more important.
 */
export function selectHeldTip(
  held: ContextualTipId | null,
  candidates: ReadonlyArray<ContextualTipId>,
  state: FirstLightState,
  context: TipContext
): ContextualTipId | null {
  const blocked =
    !context.firstLightSettled ||
    context.tourOverlayVisible ||
    context.modalVisible ||
    context.objectCardOpen;
  if (blocked) return null;
  if (held) return held;
  return nextEligibleTip(candidates, state, context);
}

/** The first eligible tip from a candidate list, or null. Keeps hosts from stacking tips. */
export function nextEligibleTip(
  candidates: ReadonlyArray<ContextualTipId>,
  state: FirstLightState,
  context: TipContext
): ContextualTipId | null {
  for (const id of candidates) {
    if (shouldShowTip(id, state, context)) return id;
  }
  return null;
}
