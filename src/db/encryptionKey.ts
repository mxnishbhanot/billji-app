import { sessionStorage } from '@/store/sessionStorage';

/**
 * Per-install SQLCipher key. Lives in SecureStore (Keychain / Keystore), never in SQLite.
 * Survives logout — wiping the DB file is enough; regenerating the key would only matter
 * if an old file somehow remained, and resetDatabase deletes that file.
 */
export const DB_ENCRYPTION_KEY = 'billji-db-encryption-key';

const randomHex = (bytes: number) => {
  const buffer = new Uint8Array(bytes);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(buffer);
  } else {
    for (let i = 0; i < bytes; i += 1) buffer[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(buffer, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

/** Returns the existing key or mints a new 256-bit one. */
export const getOrCreateDbEncryptionKey = async (): Promise<string> => {
  const existing = await sessionStorage.getItemAsync(DB_ENCRYPTION_KEY);
  if (existing) return existing;

  const key = randomHex(32);
  await sessionStorage.setItemAsync(DB_ENCRYPTION_KEY, key);
  return key;
};

/** Test / factory-reset seam. Not called on ordinary logout. */
export const clearDbEncryptionKey = () => sessionStorage.deleteItemAsync(DB_ENCRYPTION_KEY);

/** SQL string literal for PRAGMA key — single quotes doubled. */
export const pragmaKeySql = (key: string) => `PRAGMA key = '${key.replace(/'/g, "''")}'`;
