import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  backoffDelayMs,
  claimOperations,
  countOperations,
  discardOperation,
  enqueueOperation,
  getOperation,
  listOperations,
  listReadyOperations,
  markOperationConflict,
  markOperationDone,
  markOperationFailed,
  pruneCompletedOperations,
  recoverInflightOperations,
  retryOperation,
  type EnqueueInput
} from '../outbox';
import { openTestDatabase } from './realSqlite';

const BIZ = 'biz-1';
const T0 = '2026-08-02T10:00:00.000Z';
let raw: DatabaseSync;
let txn: SQLiteDatabase;

const enqueue = (overrides: Partial<EnqueueInput> = {}, now = T0) =>
  enqueueOperation(
    {
      businessId: BIZ,
      entityType: 'invoices',
      entityLocalId: 'inv-local-1',
      opType: 'create',
      payload: { total: 1180 },
      ...overrides
    },
    { txn, now }
  );

const ids = (operations: { opId: string }[]) => operations.map((operation) => operation.opId);

beforeEach(async () => {
  ({ raw, txn } = await openTestDatabase());
});

afterEach(() => raw.close());

describe('create operation', () => {
  it('appends a pending op with an idempotency key and the entity default priority', async () => {
    const operation = await enqueue();

    expect(operation).toMatchObject({
      status: 'pending',
      opType: 'create',
      entityType: 'invoices',
      attempts: 0,
      priority: 2,
      dependsOn: [],
      nextAttemptAt: null,
      createdAt: T0
    });
    expect(operation.opId).toMatch(/^[0-9a-f-]{36}$/);
    expect(operation.payload).toEqual({ total: 1180 });
    expect(await getOperation(operation.opId, txn)).toEqual(operation);
  });

  it('prices each entity into its tier and takes an explicit override', async () => {
    expect((await enqueue({ entityType: 'payments' })).priority).toBe(1);
    expect((await enqueue({ entityType: 'products' })).priority).toBe(3);
    expect((await enqueue({ entityType: 'business' })).priority).toBe(4);
    expect((await enqueue({ entityType: 'products', priority: 1 })).priority).toBe(1);
  });

  it('carries the base version and the action name', async () => {
    const update = await enqueue({ opType: 'update', baseVersion: 7 });
    expect(update.baseVersion).toBe(7);

    const action = await enqueue({ opType: 'action', actionName: 'cancel' });
    expect(action).toMatchObject({ opType: 'action', actionName: 'cancel' });
  });

  it('rejects an action with no name and a dependency that does not exist', async () => {
    await expect(enqueue({ opType: 'action' })).rejects.toThrow(/action name/);
    await expect(enqueue({ dependsOn: ['op-does-not-exist'] })).rejects.toThrow(/Unknown dependency/);
    expect(raw.prepare('SELECT COUNT(*) AS n FROM outbox').get()).toEqual({ n: 0 });
  });

  it('rejects a duplicate op_id — it is also the idempotency key', async () => {
    await enqueue({ opId: 'op-fixed' });
    await expect(enqueue({ opId: 'op-fixed' })).rejects.toThrow(/UNIQUE constraint/);
  });
});

describe('priority and ordering', () => {
  it('drains money first, but never reorders within one chain', async () => {
    const invoice = await enqueue({ entityType: 'invoices', opId: 'op-invoice' });
    await enqueue({ entityType: 'products', opId: 'op-product' });
    await enqueue({ entityType: 'payments', opId: 'op-payment' });
    // A payment queued behind its invoice still waits for it: the dependency wins.
    await enqueue({ entityType: 'payments', opId: 'op-payment-chained', dependsOn: [invoice.opId] });

    expect(ids(await listReadyOperations(BIZ, { txn, now: T0 }))).toEqual([
      'op-payment',
      'op-invoice',
      'op-product'
    ]);
  });
});

describe('dependencies', () => {
  it('holds an operation back until every dependency is done', async () => {
    const create = await enqueue({ opId: 'op-create' });
    const update = await enqueue({ opId: 'op-update', opType: 'update', dependsOn: [create.opId] });
    await enqueue({ opId: 'op-send', opType: 'action', actionName: 'cancel', dependsOn: [create.opId, update.opId] });

    expect(ids(await listReadyOperations(BIZ, { txn, now: T0 }))).toEqual(['op-create']);

    await markOperationDone('op-create', { txn });
    expect(ids(await listReadyOperations(BIZ, { txn, now: T0 }))).toEqual(['op-update']);

    await markOperationDone('op-update', { txn });
    expect(ids(await listReadyOperations(BIZ, { txn, now: T0 }))).toEqual(['op-send']);
  });

  it('poisons only its own chain, not the whole queue', async () => {
    const create = await enqueue({ opId: 'op-create' });
    await enqueue({ opId: 'op-update', opType: 'update', dependsOn: [create.opId] });
    await enqueue({ opId: 'op-unrelated', entityType: 'products' });

    await markOperationFailed('op-create', 'HTTP 422', { txn, now: T0, maxAttempts: 1 });

    // The chain waits; everything independent of it still drains.
    expect(ids(await listReadyOperations(BIZ, { txn, now: T0 }))).toEqual(['op-unrelated']);
  });
});

describe('retry', () => {
  it('backs off exponentially and caps at an hour', () => {
    expect(backoffDelayMs(1)).toBe(30_000);
    expect(backoffDelayMs(2)).toBe(60_000);
    expect(backoffDelayMs(3)).toBe(120_000);
    expect(backoffDelayMs(50)).toBe(3_600_000);
  });

  it('reschedules a transient failure and holds it until the backoff elapses', async () => {
    const operation = await enqueue({ opId: 'op-flaky' });
    const failed = await markOperationFailed(operation.opId, 'Network request failed', { txn, now: T0 });

    expect(failed).toMatchObject({
      status: 'pending',
      attempts: 1,
      lastError: 'Network request failed',
      nextAttemptAt: '2026-08-02T10:00:30.000Z'
    });

    expect(await listReadyOperations(BIZ, { txn, now: T0 })).toEqual([]);
    expect(ids(await listReadyOperations(BIZ, { txn, now: '2026-08-02T10:00:30.000Z' }))).toEqual(['op-flaky']);
  });

  it('gives up after the attempt limit and waits for the user', async () => {
    await enqueue({ opId: 'op-doomed' });

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await markOperationFailed('op-doomed', 'HTTP 500', { txn, now: T0, maxAttempts: 3 });
    }

    const dead = await getOperation('op-doomed', txn);
    expect(dead).toMatchObject({ status: 'failed', attempts: 3, nextAttemptAt: null });
    // Never retried automatically again — it is on the Failed Operations screen now.
    expect(await listReadyOperations(BIZ, { txn, now: '2027-01-01T00:00:00.000Z' })).toEqual([]);

    const retried = await retryOperation('op-doomed', { txn });
    expect(retried).toMatchObject({ status: 'pending', attempts: 0, nextAttemptAt: null });
    expect(ids(await listReadyOperations(BIZ, { txn, now: T0 }))).toEqual(['op-doomed']);
  });

  it('marks a version conflict as needing a decision, not a retry', async () => {
    await enqueue({ opId: 'op-conflict', opType: 'update', baseVersion: 3 });
    const conflicted = await markOperationConflict('op-conflict', 'Version 3 is stale', { txn });

    expect(conflicted).toMatchObject({ status: 'conflict', lastError: 'Version 3 is stale' });
    expect(await listReadyOperations(BIZ, { txn, now: T0 })).toEqual([]);
  });
});

describe('claiming and recovery', () => {
  it('claims ready ops once, so two drain passes cannot take the same op', async () => {
    await enqueue({ opId: 'op-1' });
    await enqueue({ opId: 'op-2', entityType: 'products' });

    const first = await claimOperations(BIZ, { txn, now: T0, limit: 1 });
    expect(ids(first)).toEqual(['op-1']);
    expect(first[0].status).toBe('inflight');

    const second = await claimOperations(BIZ, { txn, now: T0 });
    expect(ids(second)).toEqual(['op-2']);
    expect(await claimOperations(BIZ, { txn, now: T0 })).toEqual([]);
  });

  it('returns inflight operations to pending after a crash', async () => {
    await enqueue({ opId: 'op-1' });
    await claimOperations(BIZ, { txn, now: T0 });

    expect(await recoverInflightOperations(BIZ, { txn, now: T0 })).toBe(1);
    expect((await getOperation('op-1', txn))?.status).toBe('pending');
    expect(ids(await listReadyOperations(BIZ, { txn, now: T0 }))).toEqual(['op-1']);
  });
});

describe('discard', () => {
  it('abandons the operation and everything queued behind it', async () => {
    const create = await enqueue({ opId: 'op-create' });
    const update = await enqueue({ opId: 'op-update', opType: 'update', dependsOn: [create.opId] });
    await enqueue({ opId: 'op-payment', entityType: 'payments', dependsOn: [update.opId] });
    await enqueue({ opId: 'op-unrelated', entityType: 'products' });

    const abandoned = await discardOperation('op-create', { txn, now: T0 });

    expect(abandoned.sort()).toEqual(['op-create', 'op-payment', 'op-update']);
    expect((await getOperation('op-create', txn))?.lastError).toBe('Discarded');
    expect((await getOperation('op-payment', txn))?.lastError).toBe('Blocked by a discarded operation');
    expect((await getOperation('op-unrelated', txn))?.status).toBe('pending');
  });

  it('leaves an already-accepted operation alone', async () => {
    const create = await enqueue({ opId: 'op-create' });
    await enqueue({ opId: 'op-update', opType: 'update', dependsOn: [create.opId] });
    await markOperationDone('op-create', { txn });

    await discardOperation('op-create', { txn, now: T0 });
    expect((await getOperation('op-create', txn))?.status).toBe('done');
    expect((await getOperation('op-update', txn))?.status).toBe('dead');
  });
});

describe('listing and pruning', () => {
  it('filters by status and entity, and counts what is still queued', async () => {
    await enqueue({ opId: 'op-1' });
    await enqueue({ opId: 'op-2', entityType: 'products', entityLocalId: 'prod-1' });
    await enqueue({ opId: 'op-3', entityType: 'products', entityLocalId: 'prod-1', opType: 'update' });
    await markOperationDone('op-1', { txn });

    expect(ids(await listOperations({ businessId: BIZ, status: 'done', txn }))).toEqual(['op-1']);
    expect(ids(await listOperations({ businessId: BIZ, entityType: 'products', txn }))).toEqual(['op-2', 'op-3']);
    expect(ids(await listOperations({ businessId: BIZ, entityLocalId: 'prod-1', txn }))).toEqual(['op-2', 'op-3']);
    expect(await countOperations({ businessId: BIZ, status: ['pending', 'inflight'], txn })).toBe(2);
    expect(await countOperations({ businessId: 'biz-2', txn })).toBe(0);
  });

  it('prunes accepted operations but keeps any a live chain still depends on', async () => {
    const create = await enqueue({ opId: 'op-create' });
    await enqueue({ opId: 'op-update', opType: 'update', dependsOn: [create.opId] });
    await enqueue({ opId: 'op-old', entityType: 'products' });
    await markOperationDone('op-create', { txn, now: T0 });
    await markOperationDone('op-old', { txn, now: T0 });

    expect(await pruneCompletedOperations('2026-08-02T11:00:00.000Z', { txn })).toBe(1);
    // op-create survives: deleting it would read as an unsatisfiable dependency and stall
    // op-update forever.
    expect(await getOperation('op-create', txn)).not.toBeNull();
    expect(await getOperation('op-old', txn)).toBeNull();

    await markOperationDone('op-update', { txn, now: T0 });
    expect(await pruneCompletedOperations('2026-08-02T11:00:00.000Z', { txn })).toBe(2);
  });
});

describe('atomicity', () => {
  it('rolls the op back with the write it describes', async () => {
    await expect(
      txn.withExclusiveTransactionAsync(async (scoped) => {
        await enqueueOperation(
          { businessId: BIZ, entityType: 'invoices', entityLocalId: 'inv-1', opType: 'create', payload: {} },
          { txn: scoped, now: T0 }
        );
        throw new Error('the local write failed');
      })
    ).rejects.toThrow('the local write failed');

    // An op without its row would push something that is not there.
    expect(raw.prepare('SELECT COUNT(*) AS n FROM outbox').get()).toEqual({ n: 0 });
  });
});
