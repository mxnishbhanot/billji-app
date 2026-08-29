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
): Promise<T> => {
  // Joining a transaction already in progress. Buffering here is reentrant: with the parent's
  // buffer open this only nests, and it is the one that holds the events when the transaction
  // was opened by something other than this function.
  if (txn) return withBufferedChanges(() => task(txn));
  return runExclusive(task);
};

/**
 * The queue. One transaction at a time on the shared connection, in call order; a failed
 * transaction must not stop the next one, so the tail only ever tracks completion.
 */
let tail: Promise<unknown> = Promise.resolve();

const runExclusive = async <T>(task: (txn: SQLiteDatabase) => Promise<T>): Promise<T> => {
  const db = await openDatabase();

  // Buffering opens *inside* the queue slot and closes after COMMIT, so only one buffer is ever
  // open. Opening it before the queue would share one buffer between unrelated transactions: the
  // events of one that committed would wait on the other, and be discarded outright if the other
  // rolled back — a created product that never told the product list it was stale.
  const attempt = () =>
    wrapDatabaseError('DB_QUERY_FAILED', 'Transaction failed', () =>
      withBufferedChanges(() => runInTransaction(db, task))
    );

  const run = tail.then(attempt, attempt);

  tail = run.catch(() => undefined);
  return run;
};
