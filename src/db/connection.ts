import { Platform } from 'react-native';
import { deleteDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { getOrCreateDbEncryptionKey, pragmaKeySql } from './encryptionKey';
import { DatabaseError, wrapDatabaseError } from './errors';
import { migrations, runMigrations, type Migration } from './migrations';

export const DATABASE_NAME = 'billji.db';

/**
 * One connection per app, opened once, migrated once.
 *
 * Encryption: expo-sqlite is built with SQLCipher (`useSQLCipher` in app.json). The key from
 * SecureStore is applied with PRAGMA key immediately after open. A legacy plaintext file
 * (created before SQLCipher was enabled) is detected and re-encrypted via sqlcipher_export.
 *
 * Migration risk: if export fails, the local file is wiped and an empty encrypted DB is
 * created — any unsynced outbox rows are lost. Sync before upgrading when possible.
 */
let connection: Promise<SQLiteDatabase> | null = null;
let unavailabilityWarned = false;

export const isDatabaseAvailable = () => Platform.OS !== 'web';

const warnUnavailable = () => {
  if (unavailabilityWarned) return;
  unavailabilityWarned = true;
  console.warn('[db] Local database unavailable on this platform; the app runs online-only.');
};

const canRead = async (db: SQLiteDatabase) => {
  try {
    await db.getFirstAsync('SELECT 1 AS ok FROM sqlite_master LIMIT 1');
    return true;
  } catch {
    return false;
  }
};

const escapedKey = (key: string) => key.replace(/'/g, "''");

/** Replace the live DB file with an exported encrypted copy at `fromPath`. */
const replaceWithEncryptedFile = async (fromPath: string, key: string): Promise<SQLiteDatabase> => {
  const { moveAsync, deleteAsync } = await import('expo-file-system/legacy');
  const probe = await openDatabaseAsync(DATABASE_NAME);
  const targetPath = probe.databasePath;
  await probe.closeAsync().catch(() => undefined);

  await deleteAsync(targetPath, { idempotent: true });
  await moveAsync({ from: fromPath, to: targetPath });

  const db = await openDatabaseAsync(DATABASE_NAME);
  await db.execAsync(pragmaKeySql(key));
  if (!(await canRead(db))) {
    throw new DatabaseError('DB_OPEN_FAILED', 'Encrypted migration produced an unreadable database');
  }
  return db;
};

/**
 * Opens a legacy plaintext DB, exports into a sibling encrypted file, swaps it into place.
 * On any failure: wipe and return a fresh encrypted database.
 */
const migratePlaintextToEncrypted = async (key: string): Promise<SQLiteDatabase> => {
  const tempName = `${DATABASE_NAME}.migrating`;
  let plain: SQLiteDatabase | null = null;

  try {
    plain = await openDatabaseAsync(DATABASE_NAME);
    if (!(await canRead(plain))) {
      await plain.closeAsync().catch(() => undefined);
      await deleteDatabaseAsync(DATABASE_NAME).catch(() => undefined);
      const fresh = await openDatabaseAsync(DATABASE_NAME);
      await fresh.execAsync(pragmaKeySql(key));
      return fresh;
    }

    await deleteDatabaseAsync(tempName).catch(() => undefined);
    await plain.execAsync(`ATTACH DATABASE '${tempName}' AS encrypted KEY '${escapedKey(key)}'`);
    await plain.execAsync(`SELECT sqlcipher_export('encrypted')`);
    await plain.execAsync('DETACH DATABASE encrypted');

    const exported = await openDatabaseAsync(tempName);
    const exportedPath = exported.databasePath;
    await exported.closeAsync();
    await plain.closeAsync();
    plain = null;

    const db = await replaceWithEncryptedFile(exportedPath, key);
    await deleteDatabaseAsync(tempName).catch(() => undefined);
    return db;
  } catch (error) {
    console.warn('[db] plaintext→SQLCipher migration failed; wiping local store', error);
    await plain?.closeAsync().catch(() => undefined);
    await deleteDatabaseAsync(DATABASE_NAME).catch(() => undefined);
    await deleteDatabaseAsync(tempName).catch(() => undefined);
    const fresh = await openDatabaseAsync(DATABASE_NAME);
    await fresh.execAsync(pragmaKeySql(key));
    return fresh;
  }
};

const applyEncryption = async (opened: SQLiteDatabase, key: string): Promise<SQLiteDatabase> => {
  await opened.execAsync(pragmaKeySql(key));
  if (await canRead(opened)) return opened;

  // Wrong/missing key — close and attempt plaintext migration (or wipe).
  await opened.closeAsync().catch(() => undefined);
  return migratePlaintextToEncrypted(key);
};

const open = async (list: Migration[]): Promise<SQLiteDatabase> => {
  const key = await getOrCreateDbEncryptionKey();

  const db = await wrapDatabaseError('DB_OPEN_FAILED', `Could not open ${DATABASE_NAME}`, async () => {
    const opened = await openDatabaseAsync(DATABASE_NAME);
    const secured = await applyEncryption(opened, key);

    await secured.execAsync('PRAGMA journal_mode = WAL');
    await secured.execAsync('PRAGMA foreign_keys = ON');
    return secured;
  });

  await runMigrations(db, list);
  return db;
};

export const openDatabase = async (list: Migration[] = migrations): Promise<SQLiteDatabase> => {
  if (!isDatabaseAvailable()) {
    warnUnavailable();
    throw new DatabaseError('DB_UNAVAILABLE', 'The local database is not available on this platform');
  }

  if (!connection) {
    connection = open(list).catch((error) => {
      connection = null;
      throw error;
    });
  }

  return connection;
};

export const closeDatabase = async () => {
  const pending = connection;
  connection = null;
  if (!pending) return;

  await wrapDatabaseError('DB_QUERY_FAILED', 'Could not close the database', async () => {
    const db = await pending.catch(() => null);
    await db?.closeAsync();
  });
};

/**
 * Deletes the database file outright. Logout / business-switch path: two businesses'
 * books must never share one file.
 */
export const resetDatabase = async () => {
  await closeDatabase();
  await wrapDatabaseError('DB_QUERY_FAILED', `Could not delete ${DATABASE_NAME}`, () =>
    deleteDatabaseAsync(DATABASE_NAME)
  );
};
