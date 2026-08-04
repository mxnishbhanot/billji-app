import type { SQLiteDatabase } from 'expo-sqlite';
import { DatabaseError, wrapDatabaseError } from './errors';
import { initialSchema } from './schema/001_initial';
import { purchasesSchema } from './schema/002_purchases';

export type Migration = {
  /** 1-based, contiguous, never reused or reordered once shipped. */
  version: number;
  /** Human label for logs and support triage. */
  name: string;
  up: (db: SQLiteDatabase) => Promise<void>;
};

/**
 * The ordered schema history. Append only — an installed device replays from whatever
 * version it holds, so editing a shipped migration changes the schema on new installs and
 * leaves every existing one behind.
 */
export const migrations: Migration[] = [initialSchema, purchasesSchema];

export const latestVersion = (list: Migration[] = migrations) =>
  list.reduce((highest, migration) => Math.max(highest, migration.version), 0);

/**
 * A duplicated or skipped version means two branches shipped a migration in the same slot.
 * Caught at startup, loudly, because the alternative is one half of the users silently
 * missing a table.
 */
const assertContiguous = (list: Migration[]) => {
  list.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new DatabaseError(
        'DB_MIGRATION_FAILED',
        `Migrations must be contiguous from 1: expected version ${index + 1}, found ${migration.version} (${migration.name})`
      );
    }
  });
};

export const readSchemaVersion = async (db: SQLiteDatabase) => {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
};

/**
 * Applies every migration newer than the database's `user_version`.
 *
 * Each migration and its version bump share one exclusive transaction, so a migration that
 * throws leaves the version untouched and the next launch retries it from a clean state.
 * A half-applied schema with an advanced version number is unrecoverable on a user's phone.
 */
export const runMigrations = async (db: SQLiteDatabase, list: Migration[] = migrations) => {
  const ordered = [...list].sort((a, b) => a.version - b.version);
  assertContiguous(ordered);

  const current = await wrapDatabaseError('DB_MIGRATION_FAILED', 'Could not read schema version', () =>
    readSchemaVersion(db)
  );
  const target = latestVersion(ordered);

  // The user downgraded the app. Running an older schema against a newer database drops
  // columns the old code cannot see; refusing is the only safe answer.
  if (current > target) {
    throw new DatabaseError(
      'DB_MIGRATION_FAILED',
      `Database schema v${current} is newer than this app supports (v${target}). Update the app.`
    );
  }

  const pending = ordered.filter((migration) => migration.version > current);

  for (const migration of pending) {
    await wrapDatabaseError('DB_MIGRATION_FAILED', `Migration ${migration.version} (${migration.name}) failed`, () =>
      // Exclusive, not the plain transaction helper: expo-sqlite's non-exclusive
      // transaction sweeps in any query running elsewhere in the app, and a stray write
      // landing inside a schema change is a corruption path.
      db.withExclusiveTransactionAsync(async (txn) => {
        await migration.up(txn);
        // PRAGMA user_version is transactional, so the bump commits with the schema change
        // or not at all. Interpolated because SQLite does not bind parameters in PRAGMA;
        // the value is an integer from our own source, never user input.
        await txn.execAsync(`PRAGMA user_version = ${migration.version}`);
      })
    );
  }

  return { from: current, to: target, applied: pending.map((migration) => migration.version) };
};
