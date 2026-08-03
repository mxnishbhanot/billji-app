import type { SQLiteDatabase } from 'expo-sqlite';
import {
  claimOperations,
  countOperations,
  discardOperation,
  enqueueOperation,
  listOperations,
  markOperationConflict,
  markOperationDone,
  markOperationFailed,
  pruneCompletedOperations,
  recoverInflightOperations,
  retryOperation,
  type EnqueueInput,
  type OutboxOperation,
  type OutboxOptions
} from '../db/outbox';

/**
 * The queue manager: one object that owns the lifecycle of queued intent for a business.
 *
 * It sits between the outbox table (which knows rows and statuses) and a transport (which
 * knows HTTP). It contains no transport of its own — the caller injects a `handler`, and
 * this module never imports the API client. That is what keeps the queue testable without a
 * server and lets the transport be swapped without touching ordering, retry or dead-letter
 * logic.
 *
 *   const queue = createQueueManager({ businessId, handler: pushBatchToServer });
 *   await queue.recover();          // once at launch: inflight -> pending
 *   await queue.drain();            // whenever connectivity returns
 *
 * Batching exists because a shop that spent the morning offline has hundreds of ops, and one
 * round trip each is the difference between a sync that finishes on a station platform and
 * one that does not. Batches are cut so that a batch never contains an op *and* something it
 * depends on: the handler may send the members concurrently, and it must never have to care.
 */

/** What the handler reports back for each operation it was given. */
export type OperationOutcome =
  /** Accepted by the server. */
  | 'done'
  /** Transient — network, 5xx, timeout. Backoff applies, attempts increments. */
  | 'retry'
  /** The base version was stale. Needs a human decision, so no retry. */
  | 'conflict'
  /** Permanently unacceptable. Abandoned along with everything queued behind it. */
  | 'dead';

export type OperationResult = { opId: string; outcome: OperationOutcome; error?: string };

/** One round trip's worth of work: same entity type, dependency-free within the batch. */
export type OperationBatch = {
  entityType: string;
  priority: number;
  operations: OutboxOperation[];
};

export type BatchHandler = (batch: OperationBatch) => Promise<OperationResult[]>;

export type QueueManagerConfig = {
  businessId: string;
  /** Sends a batch. Omit for a queue that only enqueues — a drain then reports nothing sent. */
  handler?: BatchHandler;
  /** Operations per batch. */
  batchSize?: number;
  /** Operations claimed per drain pass. */
  drainLimit?: number;
  /** Automatic attempts before an op lands on the Failed screen. */
  maxAttempts?: number;
  /** Injected for deterministic tests. */
  clock?: () => string;
  /**
   * A database handle every operation runs against, instead of the app connection. The
   * caller supplies one to run a whole queue inside its own transaction; tests supply one to
   * stay off the device database.
   */
  txn?: SQLiteDatabase;
};

export type DrainSummary = {
  claimed: number;
  batches: number;
  done: number;
  retried: number;
  conflicts: number;
  dead: number;
  /** True when the queue still holds work that was not claimed this pass. */
  hasMore: boolean;
};

export type DeadLetter = OutboxOperation & {
  /** 'failed' is out of retries but retryable by the user; 'dead' was abandoned. */
  recoverable: boolean;
};

const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_DRAIN_LIMIT = 200;

/**
 * Cuts claimed operations into batches. Two rules, in order:
 *
 *  1. never batch an operation with one it depends on — the handler is free to send the
 *     members of a batch in any order, or all at once;
 *  2. group by entity type, so a batch maps onto one bulk endpoint.
 *
 * Order within the queue is otherwise preserved: operations are consumed in claim order
 * (priority, then sequence), so an earlier op is always in the same batch or an earlier one.
 */
export const buildBatches = (operations: OutboxOperation[], batchSize: number): OperationBatch[] => {
  const batches: OperationBatch[] = [];
  const placed = new Map<string, number>();

  operations.forEach((operation) => {
    // The earliest batch this op may join: after every dependency already placed.
    const earliest = operation.dependsOn.reduce(
      (floor, dependency) => (placed.has(dependency) ? Math.max(floor, placed.get(dependency)! + 1) : floor),
      0
    );

    let index = batches.findIndex(
      (batch, position) =>
        position >= earliest && batch.entityType === operation.entityType && batch.operations.length < batchSize
    );

    if (index === -1) {
      index = batches.length;
      batches.push({ entityType: operation.entityType, priority: operation.priority, operations: [] });
    }

    batches[index].operations.push(operation);
    batches[index].priority = Math.min(batches[index].priority, operation.priority);
    placed.set(operation.opId, index);
  });

  return batches;
};

export const createQueueManager = (config: QueueManagerConfig) => {
  const { businessId, handler } = config;
  const batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE;
  const drainLimit = config.drainLimit ?? DEFAULT_DRAIN_LIMIT;
  const maxAttempts = config.maxAttempts;
  const clock = config.clock ?? (() => new Date().toISOString());

  // Two overlapping drains would each claim a slice of the same queue and interleave their
  // results. One at a time; a second caller joins the pass already running.
  let draining: Promise<DrainSummary> | null = null;

  const options = (extra: OutboxOptions = {}): OutboxOptions => ({
    now: extra.now ?? clock(),
    txn: extra.txn ?? config.txn
  });

  /** Appends intent. Enqueue inside the transaction that writes the row it describes. */
  const enqueue = (input: Omit<EnqueueInput, 'businessId'> & { businessId?: string }, extra: OutboxOptions = {}) =>
    enqueueOperation({ ...input, businessId: input.businessId ?? businessId }, options(extra));

  /**
   * Claims the next ready operations and returns them as batches, already marked inflight.
   * The caller owns them from here: every operation must be settled with `settle`, or
   * released by `recover` on the next launch.
   */
  const dequeue = async (limit = drainLimit, extra: OutboxOptions = {}): Promise<OperationBatch[]> => {
    const claimed = await claimOperations(businessId, { ...options(extra), limit });
    return buildBatches(claimed, batchSize);
  };

  /** Applies one handler result to the queue. */
  const settle = async (result: OperationResult, extra: OutboxOptions = {}) => {
    const settleOptions = options(extra);

    if (result.outcome === 'done') return markOperationDone(result.opId, settleOptions);
    if (result.outcome === 'conflict') {
      return markOperationConflict(result.opId, result.error ?? 'Version conflict', settleOptions);
    }
    if (result.outcome === 'dead') {
      // Cascades: everything queued behind an abandoned op is abandoned with it. The
      // handler's reason is kept — the Failed screen has to tell the user *why*.
      await discardOperation(result.opId, { ...settleOptions, reason: result.error ?? 'Rejected by the server' });
      return null;
    }
    return markOperationFailed(result.opId, result.error ?? 'Unknown error', { ...settleOptions, maxAttempts });
  };

  const runBatch = async (batch: OperationBatch, summary: DrainSummary, extra: OutboxOptions) => {
    let results: OperationResult[];

    try {
      results = await handler!(batch);
    } catch (error) {
      // A handler that throws says nothing about individual operations: retry them all
      // rather than guessing which half of the batch landed.
      results = batch.operations.map((operation) => ({
        opId: operation.opId,
        outcome: 'retry' as const,
        error: (error as Error)?.message ?? String(error)
      }));
    }

    const byId = new Map(results.map((result) => [result.opId, result]));

    for (const operation of batch.operations) {
      // An operation the handler forgot is not an operation that succeeded.
      const result = byId.get(operation.opId) ?? {
        opId: operation.opId,
        outcome: 'retry' as const,
        error: 'The handler returned no result for this operation'
      };

      await settle(result, extra);

      if (result.outcome === 'done') summary.done += 1;
      else if (result.outcome === 'conflict') summary.conflicts += 1;
      else if (result.outcome === 'dead') summary.dead += 1;
      else summary.retried += 1;
    }
  };

  /**
   * One pass: claim, send, settle. Returns what happened rather than throwing, because a
   * drain is a background activity — a failed batch is a queue state, not an exception.
   *
   * Batches run in sequence. Dependencies are the reason: batch N+1 may hold an operation
   * that depends on one in batch N, and running them concurrently would send a child before
   * its parent was accepted.
   */
  const drain = async (extra: OutboxOptions = {}): Promise<DrainSummary> => {
    if (draining) return draining;

    const pass = (async () => {
      const summary: DrainSummary = {
        claimed: 0,
        batches: 0,
        done: 0,
        retried: 0,
        conflicts: 0,
        dead: 0,
        hasMore: false
      };

      if (!handler) return summary;

      const batches = await dequeue(drainLimit, extra);
      summary.batches = batches.length;
      summary.claimed = batches.reduce((total, batch) => total + batch.operations.length, 0);

      for (const batch of batches) await runBatch(batch, summary, extra);

      summary.hasMore = (await pendingCount(extra)) > 0;
      return summary;
    })();

    draining = pass;
    try {
      return await pass;
    } finally {
      draining = null;
    }
  };

  /** Everything not yet accepted, including ops waiting out a backoff. The badge count. */
  const pendingCount = (extra: OutboxOptions = {}) =>
    countOperations({ businessId, status: ['pending', 'inflight'], txn: options(extra).txn });

  /**
   * The dead-letter queue: operations no longer being attempted. `failed` ran out of
   * automatic retries and `conflict` needs a decision — both recoverable by the user.
   * `dead` was discarded or poisoned by a discarded dependency.
   */
  const deadLetters = async (extra: OutboxOptions = {}): Promise<DeadLetter[]> => {
    const operations = await listOperations({
      businessId,
      status: ['failed', 'conflict', 'dead'],
      txn: options(extra).txn
    });
    return operations.map((operation) => ({ ...operation, recoverable: operation.status !== 'dead' }));
  };

  /** Manual "try again": clears the backoff and the attempt count, keeps the error history. */
  const retry = (opId: string, extra: OutboxOptions = {}) => retryOperation(opId, options(extra));

  /** Retries every recoverable dead letter. Returns how many were requeued. */
  const retryAll = async (extra: OutboxOptions = {}): Promise<number> => {
    const recoverable = (await deadLetters(extra)).filter((operation) => operation.recoverable);
    for (const operation of recoverable) await retry(operation.opId, extra);
    return recoverable.length;
  };

  /** Abandons an operation and its whole downstream chain. Returns every op_id abandoned. */
  const discard = (opId: string, extra: OutboxOptions = {}) => discardOperation(opId, options(extra));

  /** At launch: an inflight operation is one nobody is holding any more. */
  const recover = (extra: OutboxOptions = {}) => recoverInflightOperations(businessId, options(extra));

  /** Housekeeping. Keeps anything a live chain still depends on. */
  const prune = (before: string, extra: OutboxOptions = {}) => pruneCompletedOperations(before, options(extra));

  return {
    enqueue,
    dequeue,
    settle,
    drain,
    pendingCount,
    deadLetters,
    retry,
    retryAll,
    discard,
    recover,
    prune
  };
};

export type QueueManager = ReturnType<typeof createQueueManager>;
