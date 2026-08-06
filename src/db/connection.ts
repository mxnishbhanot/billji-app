import { Platform } from 'react-native';
import { deleteDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
// The one place the database layer reports upwards. syncLog holds no reference to db/, so this is a
// leaf dependency rather than a cycle — see the layering note there.
import { syncLog } from '../sync/syncLog';
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

/**
 * How much unsent work is about to be destroyed. Best effort by definition: the database is being
 * wiped precisely because something about it is broken, so on the unreadable-file path this cannot
 * answer and returns null. Answering "unknown" is still worth logging — the alternative was the
 * system's only irreversible event happening with no record at all.
 */
const countUnsentBeforeWipe = async (db: SQLiteDatabase | null): Promise<number | null> => {
  if (!db) return null;
  try {
    const row = await db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM outbox WHERE status IN ('pending', 'inflight', 'failed', 'conflict')`
    );
    return row?.n ?? null;
  } catch {
    return null;
  }
};

/**
 * Deletes the local file(s) and returns a fresh, keyed, readable database.
 *
 * The only recovery for a file SQLite refuses to read at all. Nothing is lost that was not
 * already lost: a database that cannot be opened cannot be pushed either, and the rows it held
 * were a cache of the server plus an outbox no engine could reach.
 *
 * `reason` and `pendingLost` exist only to be reported: the behaviour is unchanged.
 */
const wipeAndCreate = async (
  key: string,
  diagnostics: { reason: string; pendingLost?: number | null; cause?: unknown } = { reason: 'unknown' }
): Promise<SQLiteDatabase> => {
  // Reported before the delete, so the record survives even if the rebuild itself then fails.
  // `pendingLost` is counted by the caller, which is the only place still holding a readable handle.
  syncLog('db_wiped', {
    reason: diagnostics.reason,
    pendingLost: diagnostics.pendingLost ?? null,
    cause: diagnostics.cause ? ((diagnostics.cause as Error)?.message ?? String(diagnostics.cause)) : undefined
  });

  await deleteDatabaseAsync(DATABASE_NAME).catch(() => undefined);
  await deleteDatabaseAsync(`${DATABASE_NAME}.migrating`).catch(() => undefined);

  const fresh = await openDatabaseAsync(DATABASE_NAME);
  await fresh.execAsync(pragmaKeySql(key));
  if (!(await canRead(fresh))) {
    throw new DatabaseError('DB_OPEN_FAILED', 'A freshly created database is still unreadable');
  }
  return fresh;
};

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
      // Neither the key nor plaintext opens it: nothing in here can be read, counted or exported.
      await plain.closeAsync().catch(() => undefined);
      plain = null;
      return wipeAndCreate(key, { reason: 'unreadable-with-either-key' });
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
    // Counted while the handle is still open and before anything is deleted — on this path the
    // export is usually what failed, so this is the one wipe that can say what it cost. The file
    // must not be deleted until the handle is closed.
    const pendingLost = await countUnsentBeforeWipe(plain);
    await plain?.closeAsync().catch(() => undefined);
    await deleteDatabaseAsync(tempName).catch(() => undefined);
    return wipeAndCreate(key, { reason: 'encryption-migration-failed', pendingLost, cause: error });
  }
};

const applyEncryption = async (opened: SQLiteDatabase, key: string): Promise<SQLiteDatabase> => {
  await opened.execAsync(pragmaKeySql(key));
  if (await canRead(opened)) return opened;

  // Wrong/missing key — close and attempt plaintext migration (or wipe).
  await opened.closeAsync().catch(() => undefined);
  return migratePlaintextToEncrypted(key);
};

const prepare = async (db: SQLiteDatabase, list: Migration[]) => {
  await db.execAsync('PRAGMA journal_mode = WAL');
  await db.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(db, list);
  return db;
};

const open = async (list: Migration[]): Promise<SQLiteDatabase> => {
  const key = await getOrCreateDbEncryptionKey();

  const db = await wrapDatabaseError('DB_OPEN_FAILED', `Could not open ${DATABASE_NAME}`, async () => {
    const opened = await openDatabaseAsync(DATABASE_NAME);
    return applyEncryption(opened, key);
  });

  try {
    return await prepare(db, list);
  } catch (error) {
    // A file that opens but will not migrate ("file is not a database", a half-finished
    // encryption swap) is wedged for good: without this the same dead file is reopened on
    // every launch and the device is offline-broken forever. Wipe once and rebuild.
    console.warn('[db] local store unusable; wiping and rebuilding', error);
    // The file opened, so the outbox is often still queryable even though the schema is not
    // reconcilable — count before closing, and report whatever was lost.
    const pendingLost = await countUnsentBeforeWipe(db);
    await db.closeAsync().catch(() => undefined);
    return prepare(await wipeAndCreate(key, { reason: 'migration-failed', pendingLost, cause: error }), list);
  }
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
