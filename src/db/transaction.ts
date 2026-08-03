import type { SQLiteDatabase } from 'expo-sqlite';
import { withBufferedChanges } from './changeBus';
import { openDatabase } from './connection';
import { wrapDatabaseError } from './errors';

/**
 * Runs `task` inside one exclusive transaction and returns its value. Throwing rolls the
 * whole thing back.
 *
 * Exclusive on purpose. expo-sqlite's `withTransactionAsync` is documented to include *any*
 * query running while it is open — "this includes query statements that are outside of the
 * scope function". A background write landing inside someone else's transaction is a
 * corruption path, so this module never uses it.
 *
 * Pass `txn` to join a transaction already in progress instead of opening a nested one.
 * SQLite has no nested transactions, and a second exclusive BEGIN inside the first
 * deadlocks — the same reason the backend threads a session through its services.
 *
 *   await withTransaction(async (txn) => {
 *     await txn.runAsync('INSERT INTO thing (id) VALUES (?)', id);
 *     await withTransaction(inner, txn);   // joins, does not nest
 *   });
 */
export const withTransaction = async <T>(
  task: (txn: SQLiteDatabase) => Promise<T>,
  txn?: SQLiteDatabase
): Promise<T> =>
  // Change events raised by the task are held until this transaction commits — see changeBus.
  withBufferedChanges(async () => {
    if (txn) return task(txn);
    return runExclusive(task);
  });

const runExclusive = async <T>(task: (txn: SQLiteDatabase) => Promise<T>): Promise<T> => {
  const db = await openDatabase();

  return wrapDatabaseError('DB_QUERY_FAILED', 'Transaction failed', async () => {
    // withExclusiveTransactionAsync resolves void, so the result is carried out by closure.
    let result: T;
    let assigned = false;

    await db.withExclusiveTransactionAsync(async (scoped) => {
      result = await task(scoped);
      assigned = true;
    });

    // Unreachable unless the driver swallows a rejection: better a clear error than
    // silently returning undefined typed as T.
    if (!assigned) throw new Error('Transaction completed without producing a result');

    return result!;
  });
};
