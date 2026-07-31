// Persistence for First Light. Deliberately tiny: one namespaced AsyncStorage key holding one
// versioned JSON document, read and written through the pure helpers in firstLightState.
//
// It never touches any other key. Onboarding's flag, birth data, settings, entitlement, and the
// Vault are all somebody else's storage, so a replay — or a corrupt tutorial document — cannot
// disturb them. Every operation swallows storage errors: a tutorial must never be the reason
// the app fails to start.

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_FIRST_LIGHT_STATE,
  hydrateFirstLightState,
  type FirstLightState,
} from "./firstLightState";

/** Stable key — the schema version lives INSIDE the document so migrations can read it. */
export const FIRST_LIGHT_STORAGE_KEY = "auralunis.firstLight.state";

export async function loadFirstLightState(): Promise<FirstLightState> {
  try {
    const raw = await AsyncStorage.getItem(FIRST_LIGHT_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_FIRST_LIGHT_STATE };
    // Corrupt / truncated JSON falls through to the safe default rather than throwing.
    return hydrateFirstLightState(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_FIRST_LIGHT_STATE };
  }
}

export async function saveFirstLightState(state: FirstLightState): Promise<void> {
  try {
    await AsyncStorage.setItem(FIRST_LIGHT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Keep the tour usable for this session even if it cannot be remembered.
  }
}

/** Removes ONLY the First Light document. No other preference or data is affected. */
export async function clearFirstLightState(): Promise<void> {
  try {
    await AsyncStorage.removeItem(FIRST_LIGHT_STORAGE_KEY);
  } catch {
    // No-op.
  }
}
