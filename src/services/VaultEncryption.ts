// Vault encryption layer. Stores a 256-bit NaCl secretbox key in
// expo-secure-store (Keychain/Keystore) and uses it to encrypt the vault JSON
// before writing to AsyncStorage. Authenticated encryption (XSalsa20-Poly1305)
// detects tampering. Unencrypted legacy data is transparently migrated on first
// read after upgrade.

import * as SecureStore from "expo-secure-store";
import * as ExpoCrypto from "expo-crypto";
import nacl from "tweetnacl";

// Typed accessors: expo-secure-store and expo-crypto's published types under
// classic module resolution may only surface a subset. The runtime API matches
// Expo SDK 51 documentation.
const SecureStorage = SecureStore as unknown as {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};
const Random = ExpoCrypto as unknown as {
  getRandomBytes: (byteCount: number) => Uint8Array;
};

const VAULT_KEY_ID = "auralunis.vault.encryptionKey";
const ENCRYPTED_PREFIX = "enc:1:"; // format version marker
let cachedKey: Uint8Array | null = null;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function utf8ToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

async function getOrCreateKey(): Promise<Uint8Array> {
  if (cachedKey) return cachedKey;

  // A thrown SecureStore read is not the same as a missing key. Generating a
  // replacement after a temporary Keychain failure would permanently orphan all
  // ciphertext written with the original key, so fail without modifying storage.
  const stored = await SecureStorage.getItemAsync(VAULT_KEY_ID);
  if (stored) {
    const decoded = fromBase64(stored);
    if (decoded.length !== nacl.secretbox.keyLength) {
      throw new Error("VAULT_KEY_INVALID");
    }
    cachedKey = decoded;
    return decoded;
  }

  // This is a genuine first-use path. The key must be durably stored before it is
  // ever returned to encryptVault; otherwise the resulting ciphertext could become
  // undecryptable on the next launch.
  const key = Random.getRandomBytes(nacl.secretbox.keyLength);
  await SecureStorage.setItemAsync(VAULT_KEY_ID, toBase64(key));
  cachedKey = key;
  return key;
}

export async function encryptVault(plaintext: string): Promise<string> {
  const key = await getOrCreateKey();
  const nonce = Random.getRandomBytes(nacl.secretbox.nonceLength);
  const message = utf8ToBytes(plaintext);
  const cipher = nacl.secretbox(message, nonce, key);

  // Combined format: nonce (24 bytes) || ciphertext, base64-encoded, prefixed.
  const combined = new Uint8Array(nonce.length + cipher.length);
  combined.set(nonce, 0);
  combined.set(cipher, nonce.length);
  return ENCRYPTED_PREFIX + toBase64(combined);
}

export async function decryptVault(stored: string): Promise<string | null> {
  // Unencrypted legacy data: return as-is so the caller can parse + migrate.
  if (!stored.startsWith(ENCRYPTED_PREFIX)) return stored;

  try {
    const key = await getOrCreateKey();
    const combined = fromBase64(stored.slice(ENCRYPTED_PREFIX.length));
    if (combined.length <= nacl.secretbox.nonceLength) return null;
    const nonce = combined.slice(0, nacl.secretbox.nonceLength);
    const cipher = combined.slice(nacl.secretbox.nonceLength);
    const decrypted = nacl.secretbox.open(cipher, nonce, key);
    if (!decrypted) return null; // tampered or wrong key
    return bytesToUtf8(decrypted);
  } catch {
    return null;
  }
}

export function isEncrypted(stored: string): boolean {
  return stored.startsWith(ENCRYPTED_PREFIX);
}
