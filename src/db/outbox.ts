import type { SQLiteDatabase } from 'expo-sqlite';
import { openDatabase } from './connection';
import { DatabaseError, wrapDatabaseError } from './errors';
import { fromJsonText, toJsonText, uuidv7, type MongoDoc, type SqliteValue } from './mappers';
import { withTransaction } from './transaction';

/**
 * The durable queue of user intent. A write the user made offline is a row here, and it
 * survives app kill, OS kill and reboot — which is the whole point: an in-memory queue loses
 * an afternoon of billing to one swipe-up.
 *
 * This module owns the queue *mechanics* only — enqueue, claim, retry, dependency gating,
 * status. It performs no synchronization: nothing here opens a socket, and the engine that
 * eventually drains these rows lands separately. That split is deliberate. The queue is what
 * must be correct under crash and restart; the transport is replaceable.
 *
 * Statuses:
 *   pending   ready to send, or waiting for next_attempt_at / a dependency
 *   inflight  claimed by a drain pass; reset to pending on the next launch after a crash
 *
 * A deferred operation is deliberately *not* a status of its own: it is `pending` with a short
 * next_attempt_at and an untouched attempt count. Adding a seventh status would mean migrating
 * the CHECK constraint on a table that holds unsynced user work, and a rolled-back build would
 * then read rows it has no vocabulary for. See deferOperation.
 *   done      accepted by the server
 *   failed    out of retries, waiting for the user on the Failed Operations screen
 *   conflict  the server rejected the base version; needs a resolution decision
 *   dead      abandoned — discarded by the user, or poisoned by a dead dependency
 */

export type OutboxStatus = 'pending' | 'inflight' | 'done' | 'failed' | 'conflict' | 'dead';
export type OutboxOpType = 'create' | 'update' | 'delete' | 'action';

export type OutboxOperation = {
  seq: number;
  opId: string;
  businessId: string;
  entityType: string;
  entityLocalId: string;
  opType: OutboxOpType;
  /** For op_type 'action': cancel, refund_processed, generate_invoice, mark_delivered. */
  actionName: string | null;
  payload: MongoDoc | null;
  baseVersion: number | null;
  dependsOn: string[];
  priority: number;
  attempts: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  status: OutboxStatus;
  createdAt: string;
  updatedAt: string;
};

export type EnqueueInput = {
  businessId: string;
  entityType: string;
  entityLocalId: string;
  opType: OutboxOpType;
  payload: unknown;
  actionName?: string;
  /** The server version the edit was authored against. Null for creates, which cannot conflict. */
  baseVersion?: number | null;
  /** op_ids that must reach 'done' first. Must already exist: dependencies point backwards. */
  dependsOn?: string[];
  /** Defaults to the entity's tier — see OUTBOX_PRIORITY. */
  priority?: number;
  /** UUIDv7, also the Idempotency-Key. Generated when omitted. */
  opId?: string;
};

export type OutboxOptions = { txn?: SQLiteDatabase; now?: string };

/**
 * 1 money in, 2 documents, 3 masters, 4 background. Priority orders *between* independent
 * chains only — sequence and dependency always win within one, so a payment cannot overtake
 * the invoice it belongs to.
 */
/**
 * Only entity types the push protocol can actually express appear here. `orders` and `business`
 * used to be listed: nothing enqueued them, the wire had no name for `business`, and an op that
 * reached the engine anyway was killed as `dead` — cascading to its dependents. A priority for an
 * unsendable entity is a trap dressed as readiness, so the guard is the table itself plus
 * SENDABLE_ENTITY_TYPES below.
 */
export const OUTBOX_PRIORITY: Record<string, number> = {
  // Tier 1 with money: a referral code is what stands between the shopkeeper and the Pro features
  // they were promised for entering it, so it goes out ahead of the catalogue and the masters.
  referrals: 1,
  payments: 1,
  invoices: 2,
  products: 3,
  customers: 3,
  suppliers: 3,
  expenses: 3,
  purchases: 3
};

/**
 * What sync protocol 1 can carry. Enqueueing anything else used to be accepted locally and
 * discarded at push time — a silent data loss with no error path the user could see. Refusing it
 * here means the caller's `localWrite` falls through to the online endpoint instead, which is
 * what the online-only modules already do.
 */
export const SENDABLE_ENTITY_TYPES = new Set([
  'products',
  'customers',
  'invoices',
  'expenses',
  'suppliers',
  'purchases',
  'payments',
  'referrals'
]);

const DEFAULT_PRIORITY = 3;
const DEFAULT_MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 60 * 60_000;
/** How long a deferred op waits. Short: the cause is a session or a server, not this operation. */
const DEFER_DELAY_MS = 15_000;

const connect = async (txn?: SQLiteDatabase) => txn ?? (await openDatabase());

type OutboxRow = Record<string, SqliteValue>;

const hydrate = (row: OutboxRow): OutboxOperation => ({
  seq: Number(row.seq),
  opId: String(row.op_id),
  businessId: String(row.business_id),
  entityType: String(row.entity_type),
  entityLocalId: String(row.entity_local_id),
  opType: row.op_type as OutboxOpType,
  actionName: row.action_name == null ? null : String(row.action_name),
  payload: fromJsonText(row.payload),
  baseVersion: row.base_version == null ? null : Number(row.base_version),
  dependsOn: fromJsonText<string[]>(row.depends_on) ?? [],
  priority: Number(row.priority),
  attempts: Number(row.attempts),
  nextAttemptAt: row.next_attempt_at == null ? null : String(row.next_attempt_at),
  lastError: row.last_error == null ? null : String(row.last_error),
  status: row.status as OutboxStatus,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at)
});

/**
 * Exponential, capped at an hour: 30s, 1m, 2m, 4m... A device that is simply offline should
 * not spend its battery discovering that fact every thirty seconds.
 *
 * ponytail: no jitter. One device retrying its own queue cannot stampede anything; add it if
 * the server ever sees synchronised waves from many devices after an outage.
 */
export const backoffDelayMs = (attempts: number) =>
  Math.min(BASE_BACKOFF_MS * 2 ** Math.max(attempts - 1, 0), MAX_BACKOFF_MS);

// -- Enqueue --------------------------------------------------------------------------

/**
 * Appends one operation. Call it inside the same transaction as the local write it
 * describes — a row without its op silently never syncs, and an op without its row pushes
 * something that is not there.
 *
 *   await withTransaction(async (txn) => {
 *     const invoice = await createInvoice(doc, { businessId, txn });
 *     await enqueueOperation({ ...op, entityLocalId: invoice.localId }, { txn });
 *   });
 */
export const enqueueOperation = async (
  input: EnqueueInput,
  options: OutboxOptions = {}
): Promise<OutboxOperation> =>
  wrapDatabaseError('DB_QUERY_FAILED', 'Could not enqueue operation', async () =>
    withTransaction(async (db) => {
      const now = options.now ?? new Date().toISOString();
      const opId = input.opId ?? uuidv7();
      const dependsOn = input.dependsOn ?? [];

      if (input.opType === 'action' && !input.actionName) {
        throw new DatabaseError('DB_QUERY_FAILED', 'An action operation needs an action name');
      }

      // Refused here rather than at push time: an op the wire cannot express is not a queued
      // op, it is a lost write with a delay on it. The caller sends this one online instead.
      if (input.opType === 'action') {
        throw new DatabaseError('DB_UNSUPPORTED_OPERATION', `Sync cannot carry the action ${input.actionName}`);
      }
      if (!SENDABLE_ENTITY_TYPES.has(input.entityType)) {
        throw new DatabaseError('DB_UNSUPPORTED_OPERATION', `Sync cannot carry ${input.entityType} operations`);
      }

      // Dependencies always point backwards, which is what makes cycles structurally
      // impossible. A forward or unknown reference would wait for something that never
      // arrives, so it is rejected here rather than stalling the queue later.
      for (const dependency of dependsOn) {
        const exists = await db.getFirstAsync<{ seq: number }>('SELECT seq FROM outbox WHERE op_id = ?', dependency);
        if (!exists) {
          throw new DatabaseError('DB_QUERY_FAILED', `Unknown dependency ${dependency}`);
        }
      }

      await db.runAsync(
        `INSERT INTO outbox (
           op_id, business_id, entity_type, entity_local_id, op_type, action_name, payload,
           base_version, depends_on, priority, status, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        [
          opId,
          input.businessId,
          input.entityType,
          input.entityLocalId,
          input.opType,
          input.actionName ?? null,
          toJsonText(input.payload),
          input.baseVersion ?? null,
          toJsonText(dependsOn),
          input.priority ?? OUTBOX_PRIORITY[input.entityType] ?? DEFAULT_PRIORITY,
          now,
          now
        ]
      );

      return (await getOperation(opId, db))!;
    }, options.txn)
  );

// -- Read -----------------------------------------------------------------------------

export const getOperation = async (opId: string, txn?: SQLiteDatabase): Promise<OutboxOperation | null> =>
  wrapDatabaseError('DB_QUERY_FAILED', 'Could not read operation', async () => {
    const db = await connect(txn);
    const row = await db.getFirstAsync<OutboxRow>('SELECT * FROM outbox WHERE op_id = ?', opId);
    return row ? hydrate(row) : null;
  });

export type OutboxQuery = {
  businessId: string;
  status?: OutboxStatus | OutboxStatus[];
  entityType?: string;
  entityLocalId?: string;
  limit?: number;
  txn?: SQLiteDatabase;
};

const queryFilters = (query: OutboxQuery) => {
  const where = ['business_id = ?'];
  const params: SqliteValue[] = [query.businessId];

  const statuses = query.status ? (Array.isArray(query.status) ? query.status : [query.status]) : [];
  if (statuses.length) {
    where.push(`status IN (${statuses.map(() => '?').join(', ')})`);
    params.push(...statuses);
  }
  if (query.entityType) {
    where.push('entity_type = ?');
    params.push(query.entityType);
  }
  if (query.entityLocalId) {
    where.push('entity_local_id = ?');
    params.push(query.entityLocalId);
  }

  return { where: where.join(' AND '), params };
};

/** In queue order: priority between chains, sequence within one. Powers the Failed screen. */
export const listOperations = async (query: OutboxQuery): Promise<OutboxOperation[]> =>
  wrapDatabaseError('DB_QUERY_FAILED', 'Could not list operations', async () => {
    const db = await connect(query.txn);
    const { where, params } = queryFilters(query);
    const rows = await db.getAllAsync<OutboxRow>(
      `SELECT * FROM outbox WHERE ${where} ORDER BY priority ASC, seq ASC LIMIT ?`,
      [...params, query.limit ?? 200]
    );
    return rows.map(hydrate);
  });

/** The pending badge: everything not yet accepted, including what is waiting on a retry. */
export const countOperations = async (query: OutboxQuery): Promise<number> =>
  wrapDatabaseError('DB_QUERY_FAILED', 'Could not count operations', async () => {
    const db = await connect(query.txn);
    const { where, params } = queryFilters(query);
    const row = await db.getFirstAsync<{ total: number }>(`SELECT COUNT(*) AS total FROM outbox WHERE ${where}`, params);
    return row?.total ?? 0;
  });

// Every dependency must be 'done'. A missing row counts as unsatisfied — prune deliberately
// never removes an op something still depends on, so a gap means a bad reference.
const READY_CLAUSE = `
  status = 'pending'
  AND business_id = ?
  AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
  AND NOT EXISTS (
    SELECT 1 FROM json_each(outbox.depends_on) AS dep
     WHERE NOT EXISTS (
       SELECT 1 FROM outbox AS parent WHERE parent.op_id = dep.value AND parent.status = 'done'
     )
  )`;

/** What could be sent right now, without claiming it. Read-only: for a status screen. */
export const listReadyOperations = async (
  businessId: string,
  options: OutboxOptions & { limit?: number } = {}
): Promise<OutboxOperation[]> =>
  wrapDatabaseError('DB_QUERY_FAILED', 'Could not read the queue', async () => {
    const db = await connect(options.txn);
    const rows = await db.getAllAsync<OutboxRow>(
      `SELECT * FROM outbox WHERE ${READY_CLAUSE} ORDER BY priority ASC, seq ASC LIMIT ?`,
      [businessId, options.now ?? new Date().toISOString(), options.limit ?? 50]
    );
    return rows.map(hydrate);
  });

// -- Status transitions ---------------------------------------------------------------

/**
 * Takes the next ready operations and marks them inflight in one transaction, so two drain
 * passes cannot claim the same op twice.
 */
export const claimOperations = async (
  businessId: string,
  options: OutboxOptions & { limit?: number } = {}
): Promise<OutboxOperation[]> =>
  wrapDatabaseError('DB_QUERY_FAILED', 'Could not claim operations', async () =>
    withTransaction(async (db) => {
      const now = options.now ?? new Date().toISOString();
      const claimed = await listReadyOperations(businessId, { ...options, now, txn: db });
      if (!claimed.length) return [];

      await db.runAsync(
        `UPDATE outbox SET status = 'inflight', updated_at = ?
          WHERE op_id IN (${claimed.map(() => '?').join(', ')})`,
        [now, ...claimed.map((operation) => operation.opId)]
      );

      return claimed.map((operation) => ({ ...operation, status: 'inflight' as const, updatedAt: now }));
    }, options.txn)
  );

const setStatus = async (
  opId: string,
  patch: { status: OutboxStatus; lastError?: string | null; nextAttemptAt?: string | null; attempts?: number },
  options: OutboxOptions
): Promise<OutboxOperation | null> => {
  const db = await connect(options.txn);
  const now = options.now ?? new Date().toISOString();

  await db.runAsync(
    `UPDATE outbox
        SET status = ?, last_error = ?, next_attempt_at = ?, attempts = COALESCE(?, attempts), updated_at = ?
      WHERE op_id = ?`,
    [patch.status, patch.lastError ?? null, patch.nextAttemptAt ?? null, patch.attempts ?? null, now, opId]
  );

  return getOperation(opId, db);
};

export const markOperationDone = async (opId: string, options: OutboxOptions = {}) =>
  wrapDatabaseError('DB_QUERY_FAILED', 'Could not complete operation', () =>
    setStatus(opId, { status: 'done' }, options)
  );

/**
 * A transient failure: attempts is incremented and the op goes back to pending with a
 * backoff. Out of attempts it becomes 'failed' — surfaced to the user rather than retried
 * forever, because the twentieth automatic attempt at a 422 is not going to work either.
 */
export const markOperationFailed = async (
  opId: string,
  error: string,
  options: OutboxOptions & { maxAttempts?: number } = {}
): Promise<OutboxOperation | null> =>
  wrapDatabaseError('DB_QUERY_FAILED', 'Could not record a failed operation', async () =>
    withTransaction(async (db) => {
      const current = await getOperation(opId, db);
      if (!current) return null;

      const attempts = current.attempts + 1;
      const now = options.now ?? new Date().toISOString();
      const exhausted = attempts >= (options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);

      return setStatus(
        opId,
        {
          status: exhausted ? 'failed' : 'pending',
          lastError: error,
          attempts,
          nextAttemptAt: exhausted ? null : new Date(Date.parse(now) + backoffDelayMs(attempts)).toISOString()
        },
        { ...options, now, txn: db }
      );
    }, options.txn)
  );

/**
 * Deferred, not failed.
 *
 * An expired session, a protocol the server will not speak, a batch the server never answered:
 * none of these say anything about the operation itself, so charging it an attempt is simply
 * wrong accounting. Five aborted passes used to be enough to move an entirely healthy queue onto
 * the Sync Issues screen, where a shopkeeper was asked to resolve operations nothing was wrong
 * with. This keeps `attempts` where it was and asks again shortly.
 *
 * There is no defer ceiling on purpose: a device that stays unauthorised should hold its work as
 * `pending` indefinitely rather than convert it into a pile of failures. The queue counter keeps
 * showing it, and `last_error` says why.
 */
export const deferOperation = async (
  opId: string,
  error: string,
  options: OutboxOptions & { delayMs?: number } = {}
): Promise<OutboxOperation | null> =>
  wrapDatabaseError('DB_QUERY_FAILED', 'Could not defer an operation', async () => {
    const now = options.now ?? new Date().toISOString();
    return setStatus(
      opId,
      {
        status: 'pending',
        lastError: error,
        nextAttemptAt: new Date(Date.parse(now) + (options.delayMs ?? DEFER_DELAY_MS)).toISOString()
      },
      { ...options, now }
    );
  });

/**
 * Drops the waiting period on pending operations, for the one event that invalidates it:
 * connectivity coming back. The backoff exists to stop a device hammering a network that is not
 * there — once it is there, making the user wait out the remaining fifty-nine minutes of an
 * hour-long delay is punishing them for the outage.
 *
 * ponytail: every pending backoff is cleared, not only the network-caused ones. Telling them apart
 * would need an error class on the row, i.e. a migration; the cost of getting it wrong is one early
 * attempt against a server that is still unwell, which still increments `attempts` and so cannot
 * loop. Add the column if that ever shows up in the retry metrics.
 */
export const clearRetryBackoff = async (businessId: string, options: OutboxOptions = {}): Promise<number> =>
  wrapDatabaseError('DB_QUERY_FAILED', 'Could not clear the retry backoff', async () => {
    const db = await connect(options.txn);
    const result = await db.runAsync(
      `UPDATE outbox SET next_attempt_at = NULL, updated_at = ?
        WHERE business_id = ?
          AND status = 'pending'
          AND next_attempt_at IS NOT NULL`,
      [options.now ?? new Date().toISOString(), businessId]
    );
    return result.changes;
  });

/** The server rejected the base version. Not retryable: a human decides what wins. */
export const markOperationConflict = async (opId: string, error: string, options: OutboxOptions = {}) =>
  wrapDatabaseError('DB_QUERY_FAILED', 'Could not record a conflict', () =>
    setStatus(opId, { status: 'conflict', lastError: error }, options)
  );

/** Manual "try again" from the Failed Operations screen. Clears the backoff, keeps the history. */
export const retryOperation = async (opId: string, options: OutboxOptions = {}) =>
  wrapDatabaseError('DB_QUERY_FAILED', 'Could not retry operation', () =>
    setStatus(opId, { status: 'pending', attempts: 0, nextAttemptAt: null }, options)
  );

/** Crash recovery, run at launch: an inflight op is one nobody is holding any more. */
export const recoverInflightOperations = async (businessId: string, options: OutboxOptions = {}): Promise<number> =>
  wrapDatabaseError('DB_QUERY_FAILED', 'Could not recover the queue', async () => {
    const db = await connect(options.txn);
    const result = await db.runAsync(
      `UPDATE outbox SET status = 'pending', next_attempt_at = NULL, updated_at = ?
        WHERE business_id = ? AND status = 'inflight'`,
      [options.now ?? new Date().toISOString(), businessId]
    );
    return result.changes;
  });

/**
 * Abandons an operation and everything queued behind it. Cascading is the point: a create
 * that will never succeed leaves its updates pointing at a record the server does not have,
 * and running those in isolation is how a queue produces nonsense.
 *
 * Returns every op_id abandoned, the given one first.
 */
export const discardOperation = async (
  opId: string,
  options: OutboxOptions & { reason?: string } = {}
): Promise<string[]> =>
  wrapDatabaseError('DB_QUERY_FAILED', 'Could not discard operation', async () =>
    withTransaction(async (db) => {
      const now = options.now ?? new Date().toISOString();

      // Walks the dependency graph forward. Cycles are impossible (dependencies point
      // backwards), and UNION dedupes a diamond.
      const blocked = await db.getAllAsync<{ op_id: string }>(
        `WITH RECURSIVE blocked(op_id) AS (
           SELECT ?
           UNION
           SELECT child.op_id
             FROM outbox AS child, json_each(child.depends_on) AS dep, blocked
            WHERE dep.value = blocked.op_id
         )
         SELECT op_id FROM blocked`,
        opId
      );

      const ids = blocked.map((row) => row.op_id);
      if (!ids.length) return [];

      await db.runAsync(
        `UPDATE outbox
            SET status = 'dead',
                last_error = CASE WHEN op_id = ? THEN ? ELSE 'Blocked by a discarded operation' END,
                next_attempt_at = NULL,
                updated_at = ?
          WHERE op_id IN (${ids.map(() => '?').join(', ')})
            AND status IN ('pending', 'inflight', 'failed', 'conflict')`,
        [opId, options.reason ?? 'Discarded', now, ...ids]
      );

      return ids;
    }, options.txn)
  );

/**
 * Housekeeping: drops accepted operations older than `before`. Never removes one that
 * something not-yet-done still depends on — a gap in the graph reads as an unsatisfiable
 * dependency and would stall the chain behind it.
 */
export const pruneCompletedOperations = async (before: string, options: OutboxOptions = {}): Promise<number> =>
  wrapDatabaseError('DB_QUERY_FAILED', 'Could not prune the queue', async () => {
    const db = await connect(options.txn);
    const result = await db.runAsync(
      `DELETE FROM outbox
        WHERE status IN ('done', 'dead')
          AND updated_at < ?
          AND NOT EXISTS (
            SELECT 1 FROM outbox AS other, json_each(other.depends_on) AS dep
             WHERE dep.value = outbox.op_id AND other.status NOT IN ('done', 'dead')
          )`,
      before
    );
    return result.changes;
  });
