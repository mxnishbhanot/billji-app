import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getOperation, type OutboxOperation } from '../../db/outbox';
import { openTestDatabase } from '../../db/__tests__/realSqlite';
import { buildBatches, createQueueManager, type OperationBatch, type OperationResult } from '../queueManager';

const BIZ = 'biz-1';
const T0 = '2026-08-02T10:00:00.000Z';

let raw: DatabaseSync;
let txn: SQLiteDatabase;

/**
 * Every call is given the adapter as `txn`, so the manager runs against real SQLite and
 * never opens the device database. The handler is a fake: the manager owns no transport.
 */
const manager = (overrides: Partial<Parameters<typeof createQueueManager>[0]> = {}) =>
  createQueueManager({ businessId: BIZ, clock: () => T0, txn, ...overrides });

const enqueue = async (
  queue: ReturnType<typeof manager>,
  opId: string,
  overrides: Record<string, unknown> = {}
) =>
  queue.enqueue(
    {
      entityType: 'invoices',
      entityLocalId: `local-${opId}`,
      opType: 'create',
      payload: { opId },
      opId,
      ...overrides
    },
    { txn }
  );

const operation = (opId: string, extra: Partial<OutboxOperation> = {}): OutboxOperation => ({
  seq: 1,
  opId,
  businessId: BIZ,
  entityType: 'invoices',
  entityLocalId: 'local-1',
  opType: 'create',
  actionName: null,
  payload: {},
  baseVersion: null,
  dependsOn: [],
  priority: 2,
  attempts: 0,
  nextAttemptAt: null,
  lastError: null,
  status: 'pending',
  createdAt: T0,
  updatedAt: T0,
  ...extra
});

beforeEach(async () => {
  ({ raw, txn } = await openTestDatabase());
});

afterEach(() => raw.close());

describe('buildBatches', () => {
  it('groups by entity type and caps the batch size', () => {
    const batches = buildBatches(
      [
        operation('a', { entityType: 'invoices' }),
        operation('b', { entityType: 'products' }),
        operation('c', { entityType: 'invoices' }),
        operation('d', { entityType: 'invoices' })
      ],
      2
    );

    expect(batches.map((batch) => [batch.entityType, batch.operations.map((item) => item.opId)])).toEqual([
      ['invoices', ['a', 'c']],
      ['products', ['b']],
      ['invoices', ['d']]
    ]);
  });

  it('never puts an operation in the same batch as one it depends on', () => {
    const batches = buildBatches(
      [operation('a'), operation('b', { dependsOn: ['a'] }), operation('c', { dependsOn: ['b'] })],
      10
    );

    // Three batches, in chain order: the handler may send a batch's members concurrently.
    expect(batches.map((batch) => batch.operations.map((item) => item.opId))).toEqual([['a'], ['b'], ['c']]);
  });

  it('keeps independent work batched alongside a chain', () => {
    const batches = buildBatches(
      [operation('a'), operation('b'), operation('c', { dependsOn: ['a'] })],
      10
    );

    expect(batches.map((batch) => batch.operations.map((item) => item.opId))).toEqual([['a', 'b'], ['c']]);
  });
});

describe('enqueue and dequeue', () => {
  it('enqueues against the manager business and claims in priority order', async () => {
    const queue = manager();
    await enqueue(queue, 'op-invoice');
    await enqueue(queue, 'op-payment', { entityType: 'payments' });
    await enqueue(queue, 'op-product', { entityType: 'products' });

    const batches = await queue.dequeue(10, { txn });

    expect(batches.map((batch) => batch.entityType)).toEqual(['payments', 'invoices', 'products']);
    // Claimed work is inflight: a second dequeue sees nothing.
    expect((await getOperation('op-payment', txn))?.status).toBe('inflight');
    expect(await queue.dequeue(10, { txn })).toEqual([]);
  });

  it('holds back an operation whose dependency has not been accepted', async () => {
    const queue = manager();
    await enqueue(queue, 'op-create');
    await enqueue(queue, 'op-update', { opType: 'update', dependsOn: ['op-create'] });

    const first = await queue.dequeue(10, { txn });
    expect(first.map((batch) => batch.operations.map((item) => item.opId))).toEqual([['op-create']]);

    await queue.settle({ opId: 'op-create', outcome: 'done' }, { txn });
    const second = await queue.dequeue(10, { txn });
    expect(second.map((batch) => batch.operations.map((item) => item.opId))).toEqual([['op-update']]);
  });
});

describe('drain', () => {
  const collect = () => {
    const seen: OperationBatch[] = [];
    return {
      seen,
      handler: async (batch: OperationBatch): Promise<OperationResult[]> => {
        seen.push(batch);
        return batch.operations.map((item) => ({ opId: item.opId, outcome: 'done' as const }));
      }
    };
  };

  it('sends every claimed operation once and marks it done', async () => {
    const { seen, handler } = collect();
    const queue = manager({ handler, batchSize: 2 });
    for (const id of ['a', 'b', 'c']) await enqueue(queue, id);

    const summary = await queue.drain({ txn });

    expect(summary).toMatchObject({ claimed: 3, batches: 2, done: 3, retried: 0, hasMore: false });
    expect(seen.flatMap((batch) => batch.operations.map((item) => item.opId))).toEqual(['a', 'b', 'c']);
    expect(await queue.pendingCount({ txn })).toBe(0);
  });

  it('retries the whole batch when the handler throws, without losing an operation', async () => {
    const queue = manager({
      handler: async () => {
        throw new Error('Network request failed');
      },
      batchSize: 5
    });
    for (const id of ['a', 'b']) await enqueue(queue, id);

    const summary = await queue.drain({ txn });

    expect(summary).toMatchObject({ claimed: 2, done: 0, retried: 2, hasMore: true });
    const failed = await getOperation('a', txn);
    expect(failed).toMatchObject({ status: 'pending', attempts: 1, lastError: 'Network request failed' });
    expect(failed?.nextAttemptAt).toBe('2026-08-02T10:00:30.000Z');
  });

  it('treats an operation the handler forgot as a retry, not a success', async () => {
    const queue = manager({ handler: async () => [] });
    await enqueue(queue, 'a');

    const summary = await queue.drain({ txn });

    expect(summary).toMatchObject({ done: 0, retried: 1 });
    expect((await getOperation('a', txn))?.lastError).toMatch(/no result/);
  });

  it('routes each outcome to its own terminal state', async () => {
    const queue = manager({
      batchSize: 10,
      handler: async (batch) =>
        batch.operations.map((item) => {
          if (item.opId === 'ok') return { opId: item.opId, outcome: 'done' as const };
          if (item.opId === 'stale') return { opId: item.opId, outcome: 'conflict' as const, error: 'Version 3' };
          if (item.opId === 'bad') return { opId: item.opId, outcome: 'dead' as const, error: 'HTTP 422' };
          return { opId: item.opId, outcome: 'retry' as const, error: 'HTTP 503' };
        })
    });

    for (const id of ['ok', 'stale', 'bad', 'flaky']) await enqueue(queue, id);
    const summary = await queue.drain({ txn });

    expect(summary).toMatchObject({ done: 1, conflicts: 1, dead: 1, retried: 1 });
    expect((await getOperation('ok', txn))?.status).toBe('done');
    expect((await getOperation('stale', txn))?.status).toBe('conflict');
    expect((await getOperation('bad', txn))?.status).toBe('dead');
    expect((await getOperation('flaky', txn))?.status).toBe('pending');
  });

  it('abandons the chain behind a dead operation', async () => {
    const queue = manager({
      handler: async (batch) =>
        batch.operations.map((item) => ({
          opId: item.opId,
          outcome: item.opId === 'op-create' ? ('dead' as const) : ('done' as const)
        }))
    });

    await enqueue(queue, 'op-create');
    await enqueue(queue, 'op-update', { opType: 'update', dependsOn: ['op-create'] });
    await queue.drain({ txn });

    // op-update was never sent: pushing an update for a record the server does not have is
    // how a queue produces nonsense.
    expect((await getOperation('op-update', txn))?.status).toBe('dead');
  });

  it('runs one pass at a time', async () => {
    let concurrent = 0;
    let peak = 0;
    const queue = manager({
      batchSize: 1,
      handler: async (batch) => {
        concurrent += 1;
        peak = Math.max(peak, concurrent);
        await Promise.resolve();
        concurrent -= 1;
        return batch.operations.map((item) => ({ opId: item.opId, outcome: 'done' as const }));
      }
    });
    for (const id of ['a', 'b']) await enqueue(queue, id);

    const [first, second] = await Promise.all([queue.drain({ txn }), queue.drain({ txn })]);

    expect(peak).toBe(1);
    // The second caller joined the pass already running rather than claiming a second slice.
    expect(second).toEqual(first);
    expect(await queue.pendingCount({ txn })).toBe(0);
  });

  it('does nothing but report when no handler is configured', async () => {
    const queue = manager();
    await enqueue(queue, 'a');

    expect(await queue.drain({ txn })).toMatchObject({ claimed: 0, done: 0 });
    expect((await getOperation('a', txn))?.status).toBe('pending');
  });
});

describe('dead queue', () => {
  const failing = () =>
    manager({
      maxAttempts: 1,
      handler: async (batch) =>
        batch.operations.map((item) => ({ opId: item.opId, outcome: 'retry' as const, error: 'HTTP 500' }))
    });

  it('collects exhausted, conflicted and abandoned operations, and flags what is recoverable', async () => {
    const queue = failing();
    await enqueue(queue, 'exhausted');
    await enqueue(queue, 'abandoned', { entityType: 'products' });
    await queue.drain({ txn });
    await queue.discard('abandoned', { txn });

    const letters = await queue.deadLetters({ txn });

    expect(letters.map((letter) => [letter.opId, letter.status, letter.recoverable])).toEqual([
      ['exhausted', 'failed', true],
      ['abandoned', 'dead', false]
    ]);
  });

  it('requeues one dead letter, or every recoverable one', async () => {
    const queue = failing();
    for (const id of ['a', 'b']) await enqueue(queue, id);
    await queue.drain({ txn });
    expect((await queue.deadLetters({ txn })).length).toBe(2);

    await queue.retry('a', { txn });
    expect(await getOperation('a', txn)).toMatchObject({ status: 'pending', attempts: 0, nextAttemptAt: null });

    expect(await queue.retryAll({ txn })).toBe(1);
    expect(await queue.deadLetters({ txn })).toEqual([]);
    expect(await queue.pendingCount({ txn })).toBe(2);
  });

  it('leaves an abandoned operation abandoned when retrying everything', async () => {
    const queue = failing();
    await enqueue(queue, 'gone');
    await queue.discard('gone', { txn });

    expect(await queue.retryAll({ txn })).toBe(0);
    expect((await getOperation('gone', txn))?.status).toBe('dead');
  });
});

describe('recovery and housekeeping', () => {
  it('releases operations left inflight by a crash', async () => {
    const queue = manager();
    await enqueue(queue, 'a');
    await queue.dequeue(10, { txn });
    expect((await getOperation('a', txn))?.status).toBe('inflight');

    expect(await queue.recover({ txn })).toBe(1);
    expect((await getOperation('a', txn))?.status).toBe('pending');
  });

  it('prunes accepted operations', async () => {
    const queue = manager({
      handler: async (batch) => batch.operations.map((item) => ({ opId: item.opId, outcome: 'done' as const }))
    });
    await enqueue(queue, 'a');
    await queue.drain({ txn });

    expect(await queue.prune('2026-08-02T11:00:00.000Z', { txn })).toBe(1);
    expect(await getOperation('a', txn)).toBeNull();
  });
});
