// vaultPersistence.ts — the pure decisions behind Vault storage.
//
// Extracted from AuraLunisVaultContext so the data-integrity rules can be exercised directly
// by a deterministic self-test (scripts/vault-recovery-selftest.js). The provider owns the
// React state and the AsyncStorage/crypto I/O; everything that decides WHAT gets written and
// WHERE lives here, with no React and no storage dependency.

export type VaultItemType = "note" | "lifesky" | "capture" | "seal" | "lesson" | "archive";

export type VaultItem = {
  id: string;
  type: VaultItemType;
  title: string;
  detail: string;
  createdAtISO: string;
};

export const VAULT_STORAGE_KEY = "auralunis.vault.prototype.v2";
export const VAULT_RECOVERY_STORAGE_KEY = "auralunis.vault.recovery.v1";
// Items created during a session whose load FAILED land here, never over the main blob. The
// next healthy launch folds them back in. This is what makes a transient decrypt failure
// non-destructive.
export const VAULT_PENDING_STORAGE_KEY = "auralunis.vault.pending.v1";

const validItemTypes = new Set<VaultItemType>([
  "note",
  "lifesky",
  "capture",
  "seal",
  "lesson",
  "archive"
]);

export function isVaultItem(item: unknown): item is VaultItem {
  if (!item || typeof item !== "object") return false;

  const candidate = item as Partial<VaultItem>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.type === "string" &&
    validItemTypes.has(candidate.type as VaultItemType) &&
    typeof candidate.title === "string" &&
    typeof candidate.detail === "string" &&
    typeof candidate.createdAtISO === "string"
  );
}

/**
 * Split stored entries into the ones this build understands and the ones it does not, in a
 * SINGLE pass.
 *
 * Deliberately NOT `sanitize()` + `raw.filter(e => !new Set(valid).has(e))`: that infers the
 * rejected set from object-reference identity, which only holds while the sanitizer is
 * implemented with `.filter()`. A later refactor to `.map()` — to normalise a field, say —
 * would silently reclassify every entry as rejected and quietly duplicate the whole vault.
 * Data-integrity code must not rest on a hidden reference-identity contract.
 */
export function splitVaultItems(value: unknown): { valid: VaultItem[]; rejected: unknown[] } {
  if (!Array.isArray(value)) return { valid: [], rejected: [] };

  const valid: VaultItem[] = [];
  const rejected: unknown[] = [];
  for (const entry of value) {
    if (isVaultItem(entry)) valid.push(entry);
    else rejected.push(entry);
  }
  return { valid, rejected };
}

/** Back-compat helper: the valid entries only. */
export function sanitizeVaultItems(value: unknown): VaultItem[] {
  return splitVaultItems(value).valid;
}

/**
 * Where a save goes. While a load failure stands the MAIN blob is untouchable for the whole
 * session — the next healthy launch may still be able to read it, and overwriting it would
 * turn a transient failure into permanent loss.
 */
export function selectWriteTarget(loadFailed: boolean): string {
  return loadFailed ? VAULT_PENDING_STORAGE_KEY : VAULT_STORAGE_KEY;
}

/**
 * What a main-blob write contains: the live items PLUS every entry this build could not
 * parse, carried verbatim. This is what makes main-blob writes lossless, and therefore why
 * an unparsable entry no longer needs to block persistence or suppress recovery merges.
 *
 * A pending write carries items only — the unparsable entries still live in the main blob,
 * which that session never touches.
 */
export function composeWritePayload(
  items: VaultItem[],
  unknownEntries: unknown[],
  loadFailed: boolean
): unknown[] {
  return loadFailed ? [...items] : [...items, ...unknownEntries];
}

/**
 * Fold one auxiliary slot (pending / recovery) into the vault.
 *
 * Runs on EVERY healthy load. It is deliberately not gated on "did this load drop entries?":
 * unparsable entries are captured and carried through every write, so there is nothing left
 * to protect by skipping — and skipping would strand a pending note indefinitely whenever the
 * vault contains a single unparsable entry, because that entry re-fails parsing every launch.
 */
export function foldAuxiliarySlot(
  base: VaultItem[],
  slot: { valid: VaultItem[]; rejected: unknown[] },
  unknownEntries: unknown[]
): { items: VaultItem[]; unknownEntries: unknown[]; changed: boolean } {
  const known = new Set(base.map((item) => item.id));
  const extras = slot.valid.filter((item) => !known.has(item.id));
  const changed = extras.length > 0 || slot.rejected.length > 0;

  return {
    items: extras.length > 0 ? [...extras, ...base] : base,
    unknownEntries:
      slot.rejected.length > 0 ? [...unknownEntries, ...slot.rejected] : unknownEntries,
    changed
  };
}
