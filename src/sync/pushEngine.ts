import { isAxiosError } from 'axios';
import { api } from '../api/client';
import { track } from '../services/analytics';
import type { OutboxOperation } from '../db/outbox';
import { acknowledgePush, resolveReferences, resolveTargetId } from './pushAck';
import {
  createQueueManager,
  type BatchHandler,
  type DrainSummary,
  type OperationBatch,
  type OperationResult,
  type QueueManagerConfig
} from './queueManager';

/**
 * Push: local intent out to the server, and nothing else. There is deliberately no pull
 * here — no cursor, no /sync/pull, no merge. Push and pull fail differently (a rejected op
 * needs a person, a stale cursor needs a re-bootstrap) and they are triggered at different
 * moments, so keeping them apart keeps each one small enough to reason about.
 *
 * Layering: the queue manager owns *what* to send and in what order; this module owns the
 * wire — the /sync/push contract, and what each HTTP outcome means for an operation.
 *
 *   queueManager.drain() -> pushBatch(batch) -> POST /sync/push -> OperationResult[]
 *
 * Background safety, in the sense that matters on a phone: a pass is single-flight, bounded
 * by an operation budget *and* a wall-clock deadline, abortable at any batch boundary, and
 * holds no state of its own. Every decision it makes is committed to the outbox before the
 * next batch starts, so being killed mid-pass costs at most one in-flight batch — which the
 * next launch releases back to pending.
 */

export const SYNC_PROTOCOL_VERSION = 1;
export const SYNC_PROTOCOL_HEADER = 'X-Sync-Protocol-Version';
export const SYNC_DEVICE_HEADER = 'X-Device-Id';

/** Server-side hard cap. A batch over it is rejected whole, so never build one. */
export const MAX_PUSH_OPERATIONS = 50;
const DEFAULT_BATCH_SIZE = 25;
const MIN_BATCH_SIZE = 1;
const DEFAULT_DEADLINE_MS = 25_000;

/**
 * Local table name to the name the push protocol uses. The app's plural table names and the
 * API's singular entities are two vocabularies; this is the only place they meet.
 */
const WIRE_ENTITY: Record<string, string> = {
  products: 'product',
  customers: 'customer',
  invoices: 'invoice',
  orders: 'order',
  expenses: 'expense',
  suppliers: 'vendor',
  purchases: 'purchase',
  payments: 'payment'
};

export type WireOperation = {
  opId: string;
  entity: string;
  opType: 'create' | 'update' | 'delete';
  clientId: string | null;
  targetId: string | null;
  /** Server version the edit was authored against. Null/omitted on creates and older clients. */
  baseVersion: number | null;
  payload: Record<string, unknown> | null;
};

export type PushResult = {
  opId: string;
  status: 'ok' | 'conflict' | 'rejected';
  statusCode?: number;
  code?: string | null;
  message?: string;
  serverId?: string | null;
  version?: number | null;
  serverUpdatedAt?: string | null;
  record?: Record<string, unknown> | null;
  /**
   * Plan warnings raised while this operation ran. Two matter, and neither is ever a rejection:
   *
   *   `LIMIT_EXCEEDED_OFFLINE`     accepted past the plan's monthly ceiling, because the document was
   *                                already issued to a customer.
   *   `FEATURE_NOT_IN_PLAN_OFFLINE` accepted although the plan does not include the feature, because
   *                                the record already exists on this device.
   *
   * Work done offline is never taken back for a billing reason — a 402 here would strand the row in
   * the outbox as `dead` and lose it at the next reinstall.
   */
  warnings?: { code: string; metric?: string; feature?: string; limit?: number | null }[];
};

export type PushResponse = { results: PushResult[]; serverTime?: string };

/** Sends one envelope. Injected so the engine can be driven without a server. */
export type PushTransport = (body: { ops: WireOperation[]; deviceId?: string }) => Promise<PushResponse>;

export type PushEngineConfig = Omit<QueueManagerConfig, 'handler'> & {
  transport?: PushTransport;
  deviceId?: string;
  /** Operations per request. Clamped to the server's cap. */
  batchSize?: number;
  /** Stop starting new batches after this long — an OS background window is not generous. */
  deadlineMs?: number;
  /** Ceiling on drain passes in one push, so a queue that refills cannot spin forever. */
  maxPasses?: number;
  /** Called when the server says this client is too old to speak the protocol. */
  onProtocolUnsupported?: () => void;
};

export type PushOutcome = DrainSummary & {
  passes: number;
  /** Why the pass stopped: everything sent, out of time, or blocked. */
  stopped: 'drained' | 'deadline' | 'aborted' | 'busy';
  /** Set when the pass was cut short: auth, protocol, or a server refusing the whole batch. */
  reason?: string;
};

const httpTransport = (deviceId?: string): PushTransport => async (body) => {
  const response = await api.post<PushResponse>('/sync/push', body, {
    headers: {
      [SYNC_PROTOCOL_HEADER]: String(SYNC_PROTOCOL_VERSION),
      ...(deviceId ? { [SYNC_DEVICE_HEADER]: deviceId } : {})
    }
  });
  return response.data;
};

/**
 * Maps an outbox row onto the wire. Returns null for anything protocol 1 cannot express —
 * the caller kills those rather than retrying them forever.
 */
export const toWireOperation = (operation: OutboxOperation): WireOperation | null => {
  const payload = (operation.payload ?? {}) as Record<string, unknown>;

  // Named domain actions (cancel, refund_processed, generate_invoice) are server routes
  // with their own reversal logic; the push protocol has no verb for them yet.
  if (operation.opType === 'action') return null;

  let entity = WIRE_ENTITY[operation.entityType];
  // Payments are nested under what they settle: two entity names, because the server's
  // validator chain and controller differ per parent.
  if (entity === 'payment' && !payload.invoiceId && payload.customerId) entity = 'customerPayment';
  if (!entity) return null;

  return {
    opId: operation.opId,
    entity,
    opType: operation.opType,
    // The device's local id, echoed back on create so the row can be matched to its record.
    clientId: (payload.clientId as string) ?? operation.entityLocalId,
    targetId: (payload.targetId as string) ?? (payload._id as string) ?? null,
    // Optimistic concurrency: the server rejects when its version no longer matches.
    baseVersion: operation.baseVersion,
    payload
  };
};

/**
 * One server result to one queue outcome.
 *
 * The split that matters is 4xx from 5xx. A validation failure, a permission denial or an
 * unsupported operation will fail identically on the twentieth attempt, so it is abandoned
 * with its chain; a 5xx or a timeout is the server's problem and worth retrying.
 */
export const classifyResult = (result: PushResult): OperationResult => {
  // Counted, not blocked. Recorded for analytics; the number itself reaches the user through the
  // usage meters, which read the refreshed subscription like every other plan number does.
  for (const warning of result.warnings ?? []) {
    track('quota_warning', { code: warning.code, key: warning.metric || warning.feature || 'unknown', offline: true });
  }

  if (result.status === 'ok') return { opId: result.opId, outcome: 'done' };
  if (result.status === 'conflict') {
    // "Still processing" is the server saying this very operation is in flight — a duplicate
    // that overlapped its own retry, not two writers disagreeing. Sending a shopkeeper to the
    // Sync Issues screen for that would be wrong; it just needs asking again.
    if (result.code === 'IDEMPOTENCY_REQUEST_IN_PROGRESS') {
      return { opId: result.opId, outcome: 'retry', error: result.message ?? 'Already being processed' };
    }
    return { opId: result.opId, outcome: 'conflict', error: result.message ?? 'Version conflict' };
  }

  const statusCode = result.statusCode ?? 500;
  const retryable = statusCode >= 500 || statusCode === 429;
  return {
    opId: result.opId,
    outcome: retryable ? 'retry' : 'dead',
    error: `${statusCode} ${result.message ?? 'Rejected'}`
  };
};

const statusOf = (error: unknown) => (isAxiosError(error) ? error.response?.status : undefined);

export const createPushEngine = (config: PushEngineConfig) => {
  const transport = config.transport ?? httpTransport(config.deviceId);
  const deadlineMs = config.deadlineMs ?? DEFAULT_DEADLINE_MS;
  const maxPasses = config.maxPasses ?? 5;

  let batchSize = Math.min(config.batchSize ?? DEFAULT_BATCH_SIZE, MAX_PUSH_OPERATIONS);
  // Set when something makes further requests pointless for this pass: a 401 that survived
  // the refresh interceptor, a protocol the server will not speak, a device with no session.
  let abort: string | null = null;
  let running = false;

  const handler: BatchHandler = async (batch: OperationBatch) => {
    if (abort) {
      // Everything left in this pass is deferred, not failed — the cause is the session or
      // the client version, not these operations.
      return batch.operations.map((operation) => ({ opId: operation.opId, outcome: 'retry' as const, error: abort! }));
    }

    const results: OperationResult[] = [];
    const sendable: OutboxOperation[] = [];

    for (const operation of batch.operations) {
      const wire = toWireOperation(operation);
      if (wire) sendable.push(operation);
      else {
        results.push({
          opId: operation.opId,
          outcome: 'dead',
          error: `Operation ${operation.entityType}:${operation.opType} is not supported by sync protocol ${SYNC_PROTOCOL_VERSION}`
        });
      }
    }

    if (!sendable.length) return results;

    // An edit queued moments after an offline create had no server id to name yet; by the
    // time it is sent, the create's acknowledgement has put one on the row.
    const wire = await Promise.all(
      sendable.map(async (operation) => {
        const body = toWireOperation(operation)!;
        // References to records this device created are rewritten to the ids those records
        // earned, now that their own creates have been accepted ahead of this one.
        const payload = await resolveReferences(operation, config.txn);
        const targeted = body.targetId ? body : { ...body, targetId: await resolveTargetId(operation, config.txn) };
        return payload === operation.payload ? targeted : { ...targeted, payload };
      })
    );

    let response: PushResponse;
    try {
      response = await transport({
        ops: wire,
        ...(config.deviceId ? { deviceId: config.deviceId } : {})
      });
    } catch (error) {
      const status = statusOf(error);
      const message = (error as Error)?.message ?? 'Push failed';

      if (status === 401 || status === 403) abort = `Not authorised to sync (${status})`;
      if (status === 426) {
        abort = 'This app version is too old to sync';
        config.onProtocolUnsupported?.();
      }
      if (status === 413) {
        // The batch itself was the problem. Halve it and let the retry send less.
        batchSize = Math.max(MIN_BATCH_SIZE, Math.floor(batchSize / 2));
      }

      // A transport failure says nothing about individual operations: every one of them
      // retries, none is abandoned on a guess.
      return [
        ...results,
        ...sendable.map((operation) => ({ opId: operation.opId, outcome: 'retry' as const, error: message }))
      ];
    }

    const byId = new Map(response.results?.map((result) => [result.opId, result]) ?? []);

    for (const operation of sendable) {
      const result = byId.get(operation.opId);
      if (!result) {
        results.push({ opId: operation.opId, outcome: 'retry', error: 'The server returned no result for this operation' });
        continue;
      }

      // The row learns its server id and version here — a `done` operation alone would
      // leave it looking like an unexplained local edit. Never fatal: a failed write-back
      // is repaired by the next pull, whereas losing the whole batch's results is not.
      try {
        await acknowledgePush(operation, result, { businessId: config.businessId, txn: config.txn });
      } catch (error) {
        console.warn('[pushEngine] could not apply the server acknowledgement', error);
      }

      results.push(classifyResult(result));
    }

    return results;
  };

  const queue = createQueueManager({ ...config, handler, batchSize });

  /**
   * Drains the queue until it is empty, the deadline passes, or something aborts the pass.
   *
   * Never throws: a push is background work, and a failure is a queue state the UI reads,
   * not an exception for a caller to handle.
   */
  const push = async (options: { deadlineMs?: number; now?: () => number } = {}): Promise<PushOutcome> => {
    const total: PushOutcome = {
      claimed: 0,
      batches: 0,
      done: 0,
      retried: 0,
      conflicts: 0,
      dead: 0,
      hasMore: false,
      passes: 0,
      stopped: 'drained'
    };

    if (running) return { ...total, stopped: 'busy' };

    running = true;
    abort = null;
    const clock = options.now ?? (() => Date.now());
    const startedAt = clock();
    const budget = options.deadlineMs ?? deadlineMs;

    try {
      while (total.passes < maxPasses) {
        const summary = await queue.drain();

        total.passes += 1;
        total.claimed += summary.claimed;
        total.batches += summary.batches;
        total.done += summary.done;
        total.retried += summary.retried;
        total.conflicts += summary.conflicts;
        total.dead += summary.dead;
        total.hasMore = summary.hasMore;

        if (abort) {
          total.stopped = 'aborted';
          total.reason = abort;
          break;
        }
        // Nothing claimed means nothing is ready — either the queue is empty or what is
        // left is waiting out a backoff. Either way, spinning again achieves nothing.
        if (!summary.claimed) break;
        if (clock() - startedAt >= budget) {
          total.stopped = 'deadline';
          break;
        }
      }

      return total;
    } finally {
      running = false;
    }
  };

  return {
    push,
    /** True while a pass is in flight. */
    isPushing: () => running,
    /** Current batch size — shrinks when the server rejects a batch as too large. */
    currentBatchSize: () => batchSize,
    /** Released at launch: an inflight op is one nobody is holding any more. */
    recover: queue.recover,
    pendingCount: queue.pendingCount,
    deadLetters: queue.deadLetters,
    retry: queue.retry,
    retryAll: queue.retryAll,
    discard: queue.discard,
    enqueue: queue.enqueue,
    prune: queue.prune
  };
};

export type PushEngine = ReturnType<typeof createPushEngine>;
