import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { decryptVault, encryptVault, isEncrypted } from "@/services/VaultEncryption";

const VAULT_STORAGE_KEY = "auralunis.vault.prototype.v2";
const VAULT_RECOVERY_STORAGE_KEY = "auralunis.vault.recovery.v1";

export type VaultItemType = "note" | "lifesky" | "capture" | "seal" | "lesson" | "archive";

export type VaultItem = {
  id: string;
  type: VaultItemType;
  title: string;
  detail: string;
  createdAtISO: string;
};

type VaultContextValue = {
  items: VaultItem[];
  hydrated: boolean;
  addItem: (item: Omit<VaultItem, "id" | "createdAtISO">) => void;
  addNote: (detail: string) => void;
  clearPrototypeVault: () => Promise<void>;
};

const VaultContext = createContext<VaultContextValue | undefined>(undefined);
const validItemTypes = new Set<VaultItemType>([
  "note",
  "lifesky",
  "capture",
  "seal",
  "lesson",
  "archive"
]);

function sanitizeVaultItems(value: unknown): VaultItem[] {
  if (!Array.isArray(value)) return [];

  return value.filter((item): item is VaultItem => {
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
  });
}

export function AuraLunisVaultProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<VaultItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  // When stored data could not be fully recovered, automatic persistence is blocked
  // until the original blob has been copied to a recovery slot.
  const loadFailedRef = useRef(false);
  const recoveryPreservedRef = useRef(false);
  const writeChainRef = useRef<Promise<void>>(Promise.resolve());
  const revisionRef = useRef(0);

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

    async function hydrate() {
      try {
        const saved = await AsyncStorage.getItem(VAULT_STORAGE_KEY);

        if (active && saved) {
          const decrypted = await decryptVault(saved);
          if (decrypted) {
            const raw = JSON.parse(decrypted) as unknown;
            const parsed = sanitizeVaultItems(raw);
            const droppedEntries = Array.isArray(raw) && parsed.length !== raw.length;

            if (droppedEntries) {
              // Keep the exact original blob available for recovery before exposing the
              // sanitized subset. Never silently erase older-schema or malformed entries.
              const preserved = await preserveRecovery(saved);
              loadFailedRef.current = !preserved;
            }

            if (active) setItems(parsed);

            // Seamless migration for valid legacy data only. If sanitization removed
            // anything, retain the original main blob; a later intentional user save can
            // replace it only after the recovery copy exists.
            if (!isEncrypted(saved) && !droppedEntries) {
              const encrypted = await encryptVault(JSON.stringify(parsed));
              await AsyncStorage.setItem(VAULT_STORAGE_KEY, encrypted);
            }
          } else {
            // Preserve unreadable ciphertext before blocking writes. This protects the
            // original data while allowing a future recovery path or app update.
            const preserved = await preserveRecovery(saved);
            loadFailedRef.current = true;
            recoveryPreservedRef.current = preserved;
          }
        }
      } catch {
        // Storage/decryption/parse failure: keep the current blob untouched. We cannot
        // safely persist replacement data unless a recovery copy was already made.
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
    if (loadFailedRef.current && !recoveryPreservedRef.current) return;
    if (loadFailedRef.current && items.length === 0) return;

    const revision = ++revisionRef.current;
    const snapshot = JSON.stringify(items);

    // Recover from any unexpected prior rejection, then serialize writes. Revision
    // checks prevent an older snapshot from landing after a newer user action.
    writeChainRef.current = writeChainRef.current
      .catch(() => {})
      .then(async () => {
        if (revision !== revisionRef.current) return;
        const encrypted = await encryptVault(snapshot);
        if (revision !== revisionRef.current) return;
        await AsyncStorage.setItem(VAULT_STORAGE_KEY, encrypted);
        if (revision === revisionRef.current) loadFailedRef.current = false;
      })
      .catch(() => {
        // Encryption, Keychain, or storage failure: leave the existing ciphertext intact.
      });
  }, [hydrated, items]);

  const value = useMemo<VaultContextValue>(() => {
    const addItem = (item: Omit<VaultItem, "id" | "createdAtISO">) => {
      const now = new Date().toISOString();

      // A genuine user add may start a new main Vault only after the previous blob has
      // been preserved. If preservation failed, state remains usable for this session but
      // the persistence effect stays blocked rather than destroying recoverable data.
      if (recoveryPreservedRef.current) loadFailedRef.current = false;

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
        await AsyncStorage.multiRemove([VAULT_STORAGE_KEY, VAULT_RECOVERY_STORAGE_KEY]);
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
