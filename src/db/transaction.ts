import type { SQLiteDatabase } from 'expo-sqlite';
import { withBufferedChanges } from './changeBus';
import { openDatabase } from './connection';
import { wrapDatabaseError } from './errors';
import { runInTransaction } from './sqliteTransaction';

/**
 * Runs `task` inside one transaction and returns its value. Throwing rolls the whole thing back.
 *
 * Transactions run on the app's single keyed connection and are queued one at a time. Both parts
 * are forced by SQLCipher: expo-sqlite's `withExclusiveTransactionAsync` opens a new native
 * connection, which cannot decrypt an encrypted database (see sqliteTransaction.ts), and a shared
 * connection has no nested transactions — so the exclusivity that used to come from a private
 * connection now comes from the queue.
 *
 * What that costs, stated plainly: a read issued elsewhere while a transaction is open now runs on
 * the same connection and can see uncommitted rows, where before it would have seen only committed
 * ones. Writes cannot interleave, which is the part that matters for integrity, and the alternative
 * is a local database that does not work at all on device.
 *
 * Pass `txn` to join a transaction already in progress instead of opening a nested one.
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

/**
 * The queue. One transaction at a time on the shared connection, in call order; a failed
 * transaction must not stop the next one, so the tail only ever tracks completion.
 */
let tail: Promise<unknown> = Promise.resolve();

const runExclusive = async <T>(task: (txn: SQLiteDatabase) => Promise<T>): Promise<T> => {
  const db = await openDatabase();

  const run = tail.then(
    () => wrapDatabaseError('DB_QUERY_FAILED', 'Transaction failed', () => runInTransaction(db, task)),
    () => wrapDatabaseError('DB_QUERY_FAILED', 'Transaction failed', () => runInTransaction(db, task))
  );

  tail = run.catch(() => undefined);
  return run;
};
