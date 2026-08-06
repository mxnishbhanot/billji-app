import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * BEGIN / COMMIT on the connection it is handed, and never on a new one.
 *
 * This exists because `withExclusiveTransactionAsync` cannot be used on an encrypted database.
 * expo-sqlite implements it by opening a *fresh* native connection (`useNewConnection: true`, see
 * SQLiteDatabase.js `class Transaction`), and there is no open option in expo-sqlite 56 that carries
 * a SQLCipher key — `PRAGMA key` is a statement, so it only ever applies to the connection it ran
 * on. The new connection therefore cannot decrypt the file, and its first statement fails with
 * "file is not a database".
 *
 * On a real device that meant the very first migration on a fresh install failed, the store was
 * wiped, the rebuild failed the same way, and every offline write was impossible. It never appeared
 * in the test suite because the harnesses use node:sqlite with no encryption.
 *
 * BEGIN IMMEDIATE rather than BEGIN: the write lock is taken up front, so two writers fail fast
 * instead of one discovering at COMMIT that it has to be rolled back.
 *
 * Callers must serialize: SQLite has no nested transactions, so a second BEGIN on the same
 * connection is an error. See withTransaction, which queues them.
 */
export const runInTransaction = async <T>(
  db: SQLiteDatabase,
  task: (txn: SQLiteDatabase) => Promise<T>
): Promise<T> => {
  await db.execAsync('BEGIN IMMEDIATE');

  try {
    const result = await task(db);
    await db.execAsync('COMMIT');
    return result;
  } catch (error) {
    // A failed ROLLBACK must not mask why the transaction failed in the first place.
    await db.execAsync('ROLLBACK').catch(() => undefined);
    throw error;
  }
};
