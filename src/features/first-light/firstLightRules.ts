// Vault-safety rule shared with Sky Lens — PURE, so it can be asserted in plain Node
// (scripts/first-light-selftest.js).
//
// This file used to hold the First Light STEP-SATISFACTION rules: whether "find your first
// object", "tap its card", and "save it" could be treated as done. Those rules are gone with the
// interactive mission — the tutorial is now five informational screens with no conditions at
// all, so there is nothing left to satisfy. Removing them removes, by construction, every way a
// tutorial screen could refuse to advance.
//
// isAlreadySavedToVault is NOT part of that mission. It is a Vault correctness fix used by
// Sky Lens itself (SkyLensScreen) to stop a second identical archive entry being written when
// the same object is saved twice across mounts, and it stays exactly as it was.

/** The subset of a Vault entry the duplicate check needs. */
export type SavedEntry = { type: string; title: string };

/**
 * Whether this object is already in the Vault.
 *
 * The Sky Lens "saved" set only remembers the current mount, so re-opening Sky Lens used to
 * write a second identical archive entry. This is a read-only check: it never edits, merges, or
 * overwrites an existing entry, and it does not touch Vault encryption or the premium gate that
 * runs before it.
 */
export function isAlreadySavedToVault(
  entries: ReadonlyArray<SavedEntry>,
  objectName: string
): boolean {
  if (!objectName) return false;
  return entries.some((entry) => entry.type === "archive" && entry.title === objectName);
}
