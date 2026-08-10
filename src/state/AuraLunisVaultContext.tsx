import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { decryptVault, encryptVault, isEncrypted } from "@/services/VaultEncryption";
import {
  VAULT_STORAGE_KEY,
  VAULT_RECOVERY_STORAGE_KEY,
  VAULT_PENDING_STORAGE_KEY,
  splitVaultItems,
  selectWriteTarget,
  composeWritePayload,
  foldAuxiliarySlot,
  type VaultItem
} from "./vaultPersistence";

type VaultContextValue = {
  items: VaultItem[];
  hydrated: boolean;
  addItem: (item: Omit<VaultItem, "id" | "createdAtISO">) => void;
  addNote: (detail: string) => void;
  clearPrototypeVault: () => Promise<void>;
};

export type { VaultItem, VaultItemType } from "./vaultPersistence";

const VaultContext = createContext<VaultContextValue | undefined>(undefined);

export function AuraLunisVaultProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<VaultItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  // When stored data could not be fully recovered, automatic persistence is blocked
  // until the original blob has been copied to a recovery slot.
  const loadFailedRef = useRef(false);
  const recoveryPreservedRef = useRef(false);
  const writeChainRef = useRef<Promise<void>>(Promise.resolve());
  const revisionRef = useRef(0);
  // Entries this build cannot parse (older or newer schema). They are held verbatim and
  // re-appended to every main-blob write, so a sanitising read can never silently erase
  // them. This is what makes main-blob writes LOSSLESS even when the stored data contains
  // entries we do not understand — and therefore why an unparsable entry no longer needs to
  // block persistence or suppress recovery merges.
  const unknownEntriesRef = useRef<unknown[]>([]);

  useEffect(() => {
    let active = true;

    async function preserveRecovery(saved: string): Promise<boolean> {
      try {
        await AsyncStorage.setItem(VAULT_RECOVERY_STORAGE_KEY, saved);
        recoveryPreservedRef.current = true;
        return true;
      } catch {
        recoveryPreservedRef.current = false;
        return false;
      }
    }

    /**
     * Read one auxiliary slot (pending / recovery). Returns null when the slot is absent or
     * cannot be read YET — the caller then leaves it in place for a future launch rather
     * than deleting data it could not understand.
     */
    async function readAuxSlot(
      key: string
    ): Promise<{ valid: VaultItem[]; rejected: unknown[] } | null> {
      try {
        const stored = await AsyncStorage.getItem(key);
        if (!stored) return null;
        const decrypted = await decryptVault(stored);
        if (!decrypted) return null;
        return splitVaultItems(JSON.parse(decrypted) as unknown);
      } catch {
        return null;
      }
    }

    /**
     * Fold pending-session and preserved-recovery entries back into the main vault.
     *
     * Runs on EVERY healthy load. It is deliberately not gated on "did this load drop
     * entries?": once unparsable entries are captured in unknownEntriesRef they are carried
     * through every write, so there is no longer any reason to suppress the merge — and
     * suppressing it would strand a pending note indefinitely whenever the vault happens to
     * contain one unparsable entry (that entry re-fails parsing on every future launch).
     *
     * A slot is deleted only after its contents are durably written into the main blob.
     */
    async function mergeAuxiliarySlots(base: VaultItem[]): Promise<VaultItem[]> {
      let merged = base;

      for (const key of [VAULT_PENDING_STORAGE_KEY, VAULT_RECOVERY_STORAGE_KEY]) {
        try {
          const slot = await readAuxSlot(key);
          if (!slot) continue; // unreadable or absent — keep it for a later launch

          const folded = foldAuxiliarySlot(merged, slot, unknownEntriesRef.current);

          if (folded.changed) {
            // Persist BEFORE deleting the only other copy. If this throws, the catch below
            // leaves the slot intact and the next launch retries.
            const encrypted = await encryptVault(
              JSON.stringify(composeWritePayload(folded.items, folded.unknownEntries, false))
            );
            await AsyncStorage.setItem(VAULT_STORAGE_KEY, encrypted);
            merged = folded.items;
            unknownEntriesRef.current = folded.unknownEntries;
          }

          await AsyncStorage.removeItem(key);
        } catch {
          // Leave this slot for the next launch; keep whatever merged successfully.
        }
      }

      return merged;
    }

    async function hydrate() {
      try {
        const saved = await AsyncStorage.getItem(VAULT_STORAGE_KEY);

        if (saved) {
          const decrypted = await decryptVault(saved);
          if (decrypted) {
            const { valid, rejected } = splitVaultItems(JSON.parse(decrypted) as unknown);

            // Hold unparsable entries verbatim so later writes carry them through. Also keep
            // a byte-exact recovery copy as belt-and-braces for a future schema migration.
            unknownEntriesRef.current = rejected;
            if (rejected.length > 0) await preserveRecovery(saved);

            // Always merge: writes are lossless now, so nothing here justifies skipping it.
            const merged = await mergeAuxiliarySlots(valid);
            if (active) setItems(merged);

            // Seamless migration of unencrypted legacy data. Safe even with unparsable
            // entries present, because they are written back alongside the parsed ones.
            if (!isEncrypted(saved)) {
              const encrypted = await encryptVault(
                JSON.stringify(composeWritePayload(merged, unknownEntriesRef.current, false))
              );
              await AsyncStorage.setItem(VAULT_STORAGE_KEY, encrypted);
            }
          } else {
            // Decrypt failed (transient Keychain outage, tamper, or a wrong key). Preserve
            // the unreadable ciphertext and block ALL main-blob writes for the whole
            // session — a later launch may still read it. New items go to the pending slot.
            const preserved = await preserveRecovery(saved);
            loadFailedRef.current = true;
            recoveryPreservedRef.current = preserved;
          }
        } else {
          // No main blob: restore anything earlier sessions left in the auxiliary slots.
          const merged = await mergeAuxiliarySlots([]);
          if (active && merged.length > 0) setItems(merged);
        }
      } catch {
        // Storage/decryption/parse failure: keep the current blob untouched.
        loadFailedRef.current = true;
      } finally {
        if (active) setHydrated(true);
      }
    }

    hydrate();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    // While a load failure stands the MAIN blob is untouchable for the entire session: the
    // next healthy launch may still read it, and overwriting it would turn a transient
    // failure into permanent loss. Items created now go to the PENDING slot instead and are
    // folded in on the next healthy launch (see mergeAuxiliarySlots).
    const failed = loadFailedRef.current;
    if (failed && items.length === 0) return; // nothing new to save this session
    const targetKey = selectWriteTarget(failed);

    const revision = ++revisionRef.current;
    // Unparsable entries ride along on every main-blob write so a sanitising read never
    // erases them. The pending slot holds only this session's new items.
    const snapshot = JSON.stringify(
      composeWritePayload(items, unknownEntriesRef.current, failed)
    );

    // Recover from any unexpected prior rejection, then serialize writes. Revision
    // checks prevent an older snapshot from landing after a newer user action.
    writeChainRef.current = writeChainRef.current
      .catch(() => {})
      .then(async () => {
        if (revision !== revisionRef.current) return;
        const encrypted = await encryptVault(snapshot);
        if (revision !== revisionRef.current) return;
        await AsyncStorage.setItem(targetKey, encrypted);
      })
      .catch(() => {
        // Encryption, Keychain, or storage failure: leave the existing ciphertext intact.
      });
  }, [hydrated, items]);

  const value = useMemo<VaultContextValue>(() => {
    const addItem = (item: Omit<VaultItem, "id" | "createdAtISO">) => {
      const now = new Date().toISOString();

      // NOTE, deliberately absent: adding an item must NOT clear loadFailedRef. The previous
      // version unblocked persistence here whenever a recovery copy existed, which let the
      // effect overwrite the main blob with just the new item — stranding the user's existing
      // notes in a slot nothing ever read. New items now persist to the pending slot for the
      // rest of this session and are merged in on the next healthy launch.

      setItems((previous) => [
        {
          ...item,
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          createdAtISO: now
        },
        ...previous
      ]);
    };

    return {
      items,
      hydrated,
      addItem,
      addNote: (detail) =>
        addItem({
          type: "note",
          title: "Cosmic Note",
          detail
        }),
      clearPrototypeVault: async () => {
        revisionRef.current += 1;
        setItems([]);
        loadFailedRef.current = false;
        recoveryPreservedRef.current = false;
        unknownEntriesRef.current = [];
        await AsyncStorage.multiRemove([
          VAULT_STORAGE_KEY,
          VAULT_RECOVERY_STORAGE_KEY,
          VAULT_PENDING_STORAGE_KEY
        ]);
      }
    };
  }, [hydrated, items]);

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useAuraLunisVault() {
  const context = useContext(VaultContext);

  if (!context) {
    throw new Error("useAuraLunisVault must be used inside AuraLunisVaultProvider");
  }

  return context;
}
