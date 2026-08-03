import { Platform } from 'react-native';
import { deleteDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { DatabaseError, wrapDatabaseError } from './errors';
import { migrations, runMigrations, type Migration } from './migrations';

export const DATABASE_NAME = 'billji.db';

/**
 * One connection per app, opened once, migrated once.
 *
 * The promise itself is the lock: concurrent callers await the same open-and-migrate, so
 * two screens mounting at the same moment cannot race two migration runs against one file.
 * Everything that touches SQLite goes through here — that single choke point is also what
 * keeps the eventual swap to op-sqlite (for SQLCipher) a one-file change.
 */
let connection: Promise<SQLiteDatabase> | null = null;
let unavailabilityWarned = false;

/**
 * expo-sqlite on web is alpha and needs WASM plus COOP/COEP headers; without them it can
 * hang rather than reject. Web runs online-first by design, so the local store is simply
 * absent there.
 */
export const isDatabaseAvailable = () => Platform.OS !== 'web';

const warnUnavailable = () => {
  if (unavailabilityWarned) return;
  unavailabilityWarned = true;
  console.warn('[db] Local database unavailable on this platform; the app runs online-only.');
};

const open = async (list: Migration[]): Promise<SQLiteDatabase> => {
  const db = await wrapDatabaseError('DB_OPEN_FAILED', `Could not open ${DATABASE_NAME}`, async () => {
    const opened = await openDatabaseAsync(DATABASE_NAME);

    // Both pragmas must run outside a transaction. WAL lets a read proceed while a write
    // is in flight, which is the difference between a list that scrolls during a sync and
    // one that stalls on it. Foreign keys are off by default in SQLite.
    await opened.execAsync('PRAGMA journal_mode = WAL');
    await opened.execAsync('PRAGMA foreign_keys = ON');

    return opened;
  });

  await runMigrations(db, list);
  return db;
};

/**
 * The database, opened and migrated. Throws DatabaseError('DB_UNAVAILABLE') where there is
 * no local store — callers check `isDatabaseAvailable()` or catch with
 * `isDatabaseUnavailable(error)` and fall back to the network.
 */
export const openDatabase = async (list: Migration[] = migrations): Promise<SQLiteDatabase> => {
  if (!isDatabaseAvailable()) {
    warnUnavailable();
    throw new DatabaseError('DB_UNAVAILABLE', 'The local database is not available on this platform');
  }

  if (!connection) {
    connection = open(list).catch((error) => {
      // A failed open must not be cached, or one transient failure at launch disables the
      // local store for the whole session.
      connection = null;
      throw error;
    });
  }

  return connection;
};

/** Closes the connection. The next openDatabase() re-opens and re-migrates. */
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
 * Deletes the database file outright. This is the logout / business-switch path: two
 * businesses' books must never share one file.
 *
 * Destructive and unrecoverable — the caller is responsible for checking that nothing
 * unsynced is pending before calling it.
 */
export const resetDatabase = async () => {
  await closeDatabase();
  await wrapDatabaseError('DB_QUERY_FAILED', `Could not delete ${DATABASE_NAME}`, () =>
    deleteDatabaseAsync(DATABASE_NAME)
  );
};
