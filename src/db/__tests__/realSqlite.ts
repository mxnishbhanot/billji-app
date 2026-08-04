import { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { migrations } from '../migrations';

/**
 * A real SQLite engine behind the expo-sqlite surface — node:sqlite, built into Node 22, so
 * no new dependency. The repository suites test SQL (keyset paging, LIKE escaping, upsert,
 * rollback), and the fake driver cannot tell a working statement from a typo.
 *
 * Tests pass the returned handle as `txn`, so nothing ever reaches openDatabase().
 */
const flat = (args: unknown[]): (string | number | null)[] =>
  (Array.isArray(args[0]) ? (args[0] as unknown[]) : args).map((value) =>
    value === undefined ? null : (value as string | number | null)
  );

export const adaptSqlite = (db: DatabaseSync): SQLiteDatabase => {
  const adapter = {
    execAsync: async (sql: string) => db.exec(sql),
    runAsync: async (sql: string, ...args: unknown[]) => {
      const result = db.prepare(sql).run(...(flat(args) as never[]));
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
    getFirstAsync: async (sql: string, ...args: unknown[]) =>
      db.prepare(sql).get(...(flat(args) as never[])) ?? null,
    getAllAsync: async (sql: string, ...args: unknown[]) => db.prepare(sql).all(...(flat(args) as never[])),
    // The suite owns the handle's lifetime, so closing through the app's connection module is
    // a no-op here rather than an error — see offlineFlow.integration.test.ts.
    closeAsync: async () => undefined,
    withExclusiveTransactionAsync: async (task: (txn: SQLiteDatabase) => Promise<void>) => {
      db.exec('BEGIN EXCLUSIVE');
      try {
        await task(adapter as unknown as SQLiteDatabase);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
  };

  return adapter as unknown as SQLiteDatabase;
};

/** A migrated in-memory database. `raw` is for asserting on columns the repository hides. */
export const openTestDatabase = async () => {
  const raw = new DatabaseSync(':memory:');
  const txn = adaptSqlite(raw);
  // Every migration, not just the first: a suite must see the schema the app ships.
  for (const migration of migrations) await migration.up(txn);
  return { raw, txn, close: () => raw.close() };
};
