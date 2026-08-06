import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getOperation, type OutboxOperation } from '../../db/outbox';
import { openTestDatabase } from '../../db/__tests__/realSqlite';
import {
  classifyResult,
  createPushEngine,
  toWireOperation,
  type PushResponse,
  type PushTransport,
  type WireOperation
} from '../pushEngine';

const BIZ = 'biz-1';
const T0 = '2026-08-02T10:00:00.000Z';

let raw: DatabaseSync;
let txn: SQLiteDatabase;

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

/** Records what was sent and answers with whatever the test asked for. */
const fakeTransport = (reply: (ops: WireOperation[]) => PushResponse | Promise<PushResponse>) => {
  const sent: WireOperation[][] = [];
  const transport: PushTransport = async (body) => {
    sent.push(body.ops);
    return reply(body.ops);
  };
  return { sent, transport };
};

const allOk = (ops: WireOperation[]): PushResponse => ({
  results: ops.map((op) => ({ opId: op.opId, status: 'ok' as const, serverId: `srv-${op.opId}` }))
});

const engine = (transport: PushTransport, overrides: Record<string, unknown> = {}) =>
  createPushEngine({ businessId: BIZ, clock: () => T0, txn, transport, ...overrides });

const enqueue = (
  push: ReturnType<typeof engine>,
  opId: string,
  overrides: Record<string, unknown> = {}
) =>
  push.enqueue(
    { entityType: 'invoices', entityLocalId: `local-${opId}`, opType: 'create', payload: {}, opId, ...overrides },
    { txn }
  );

beforeEach(async () => {
  ({ raw, txn } = await openTestDatabase());
});

afterEach(() => raw.close());

describe('wire mapping', () => {
  it('translates table names to protocol entities', () => {
    expect(toWireOperation(operation('a', { entityType: 'products' }))?.entity).toBe('product');
    expect(toWireOperation(operation('a', { entityType: 'suppliers' }))?.entity).toBe('vendor');
    expect(toWireOperation(operation('a', { entityType: 'invoices' }))?.entity).toBe('invoice');
  });

  it('routes a payment by what it settles', () => {
    const invoicePayment = operation('a', { entityType: 'payments', payload: { invoiceId: 'inv-1' } });
    const customerPayment = operation('b', { entityType: 'payments', payload: { customerId: 'cust-1' } });

    expect(toWireOperation(invoicePayment)?.entity).toBe('payment');
    expect(toWireOperation(customerPayment)?.entity).toBe('customerPayment');
  });

  it('carries the local id as clientId and the server id as targetId', () => {
    const wire = toWireOperation(
      operation('a', {
        opType: 'update',
        entityLocalId: 'local-9',
        baseVersion: 3,
        payload: { targetId: 'srv-9', name: 'X' }
      })
    );

    expect(wire).toMatchObject({ clientId: 'local-9', targetId: 'srv-9', opType: 'update', baseVersion: 3 });
  });

  it('refuses what protocol 1 cannot express', () => {
    expect(toWireOperation(operation('a', { opType: 'action', actionName: 'cancel' }))).toBeNull();
    expect(toWireOperation(operation('a', { entityType: 'business' }))).toBeNull();
  });
});

describe('result classification', () => {
  it('sends 4xx to the dead queue and 5xx back to retry', () => {
    expect(classifyResult({ opId: 'a', status: 'ok' })).toEqual({ opId: 'a', outcome: 'done' });
    expect(classifyResult({ opId: 'a', status: 'conflict', message: 'stale' })).toMatchObject({
      outcome: 'conflict'
    });
    // A validation failure fails identically on the twentieth attempt.
    expect(classifyResult({ opId: 'a', status: 'rejected', statusCode: 422 })).toMatchObject({ outcome: 'dead' });
    expect(classifyResult({ opId: 'a', status: 'rejected', statusCode: 403 })).toMatchObject({ outcome: 'dead' });
    expect(classifyResult({ opId: 'a', status: 'rejected', statusCode: 500 })).toMatchObject({ outcome: 'retry' });
    expect(classifyResult({ opId: 'a', status: 'rejected', statusCode: 429 })).toMatchObject({ outcome: 'retry' });
  });

  it('abandons a referral the server has permanently settled instead of asking the user to resolve it', () => {
    // These arrive as 409s, which normally mean two writers disagree about a version. An already-used
    // referral code is not that: there is nothing to rebase and nothing for the user to choose, so
    // offering Keep Local / Keep Server on the Sync Issues screen would be nonsense.
    for (const code of [
      'REFERRAL_ALREADY_APPLIED',
      'REFERRAL_REWARD_ALREADY_RECEIVED',
      'REFERRAL_NOT_ELIGIBLE_PAID'
    ]) {
      expect(classifyResult({ opId: 'a', status: 'conflict', statusCode: 409, code, message: 'no' })).toMatchObject({
        outcome: 'dead'
      });
    }

    // A genuine version conflict still goes to the resolver.
    expect(
      classifyResult({ opId: 'a', status: 'conflict', statusCode: 409, code: 'VERSION_CONFLICT' })
    ).toMatchObject({ outcome: 'conflict' });
  });
});

describe('referral operations on the wire', () => {
  it('maps an APPLY_REFERRAL onto the referral entity the server registry expects', () => {
    const wire = toWireOperation(
      operation('ref-1', {
        entityType: 'referrals',
        entityLocalId: 'ref-local-1',
        payload: { code: 'BILLJI8X', clientId: 'ref-local-1' }
      })
    );

    expect(wire).toMatchObject({
      entity: 'referral',
      opType: 'create',
      clientId: 'ref-local-1',
      payload: { code: 'BILLJI8X' }
    });
  });
});

describe('push', () => {
  it('reads the queue, batches it and marks every accepted operation done', async () => {
    const { sent, transport } = fakeTransport(allOk);
    const push = engine(transport, { batchSize: 2 });
    for (const id of ['a', 'b', 'c']) await enqueue(push, id);

    const outcome = await push.push();

    expect(sent.map((batch) => batch.map((op) => op.opId))).toEqual([['a', 'b'], ['c']]);
    expect(outcome).toMatchObject({ claimed: 3, done: 3, dead: 0, retried: 0, stopped: 'drained' });
    expect(await push.pendingCount({ txn })).toBe(0);
  });

  it('never builds a batch larger than the server accepts', () => {
    expect(engine(fakeTransport(allOk).transport, { batchSize: 500 }).currentBatchSize()).toBe(50);
  });

  it('retries the whole batch on a transport failure and abandons nothing', async () => {
    const { transport } = fakeTransport(() => {
      throw new Error('Network request failed');
    });
    const push = engine(transport);
    for (const id of ['a', 'b']) await enqueue(push, id);

    const outcome = await push.push();

    expect(outcome).toMatchObject({ done: 0, dead: 0, retried: 2 });
    expect(await getOperation('a', txn)).toMatchObject({
      status: 'pending',
      attempts: 1,
      lastError: 'Network request failed',
      nextAttemptAt: '2026-08-02T10:00:30.000Z'
    });
  });

  it('splits per-operation outcomes from one response', async () => {
    const { transport } = fakeTransport((ops) => ({
      results: ops.map((op) => {
        if (op.opId === 'ok') return { opId: op.opId, status: 'ok' as const };
        if (op.opId === 'stale') return { opId: op.opId, status: 'conflict' as const, message: 'Version 3' };
        if (op.opId === 'invalid') {
          return { opId: op.opId, status: 'rejected' as const, statusCode: 422, message: 'name is required' };
        }
        return { opId: op.opId, status: 'rejected' as const, statusCode: 503, message: 'Service unavailable' };
      })
    }));
    const push = engine(transport, { batchSize: 10 });
    for (const id of ['ok', 'stale', 'invalid', 'flaky']) await enqueue(push, id);

    const outcome = await push.push();

    expect(outcome).toMatchObject({ done: 1, conflicts: 1, dead: 1, retried: 1 });
    expect((await getOperation('invalid', txn))?.status).toBe('dead');
    expect((await getOperation('flaky', txn))?.status).toBe('pending');
  });

  it('treats an operation the server did not answer as a retry', async () => {
    const { transport } = fakeTransport(() => ({ results: [] }));
    const push = engine(transport);
    await enqueue(push, 'a');

    await push.push();
    expect((await getOperation('a', txn))?.lastError).toMatch(/no result/);
  });

  /**
   * The engine still refuses to send what it cannot express, but nothing can reach it in that
   * state any more: the queue rejects action operations and unmapped entities at enqueue time, so
   * the caller sends them online instead of having them killed here after the user was told the
   * write was saved. This asserts the last line of defence, with the row inserted directly.
   */
  it('kills an operation the protocol cannot express, without sending it', async () => {
    const { sent, transport } = fakeTransport(allOk);
    const push = engine(transport);
    raw
      .prepare(
        `INSERT INTO outbox (op_id, business_id, entity_type, entity_local_id, op_type, action_name,
                             payload, depends_on, priority, status, created_at, updated_at)
         VALUES ('op-action', ?, 'invoices', 'inv-local-1', 'action', 'cancel', '{}', '[]', 2, 'pending', ?, ?)`
      )
      .run(BIZ, T0, T0);
    await enqueue(push, 'op-normal');

    const outcome = await push.push();

    expect(sent.flat().map((op) => op.opId)).toEqual(['op-normal']);
    expect(outcome).toMatchObject({ dead: 1, done: 1 });
    expect((await getOperation('op-action', txn))?.lastError).toMatch(/not supported by sync protocol/);
  });
});

describe('error handling that stops the pass', () => {
  const httpError = (status: number) =>
    Object.assign(new Error(`Request failed with status code ${status}`), {
      isAxiosError: true,
      response: { status }
    });

  it('stops on an auth failure instead of burning attempts on every batch', async () => {
    const { sent, transport } = fakeTransport(() => {
      throw httpError(401);
    });
    const push = engine(transport, { batchSize: 1 });
    for (const id of ['a', 'b', 'c']) await enqueue(push, id);

    const outcome = await push.push();

    // One request, not three: the rest of the pass is deferred, not attempted.
    expect(sent).toHaveLength(1);
    expect(outcome).toMatchObject({ stopped: 'aborted', done: 0 });
    expect(outcome.reason).toMatch(/Not authorised/);
    expect((await getOperation('c', txn))?.status).toBe('pending');
    // And the attempt budget is untouched, for the operation that was sent as much as for the ones
    // that were not. Charging an attempt here is how five expired-session passes used to move a
    // clean queue onto the Sync Issues screen and ask a shopkeeper to resolve it by hand.
    for (const id of ['a', 'b', 'c']) {
      expect(await getOperation(id, txn)).toMatchObject({ status: 'pending', attempts: 0 });
    }
    expect(outcome.deferred).toBe(3);
  });

  it('does not burn attempts when the client is too old for the protocol either', async () => {
    const { transport } = fakeTransport(() => {
      throw httpError(426);
    });
    const push = engine(transport, { onProtocolUnsupported: jest.fn() });
    await enqueue(push, 'a');

    await push.push();

    expect(await getOperation('a', txn)).toMatchObject({ status: 'pending', attempts: 0 });
  });

  it('stops and reports when the client is too old for the protocol', async () => {
    const onProtocolUnsupported = jest.fn();
    const { transport } = fakeTransport(() => {
      throw httpError(426);
    });
    const push = engine(transport, { onProtocolUnsupported });
    await enqueue(push, 'a');

    const outcome = await push.push();

    expect(onProtocolUnsupported).toHaveBeenCalledTimes(1);
    expect(outcome.reason).toMatch(/too old/);
  });

  it('halves the batch size when the server calls the batch too large', async () => {
    const { transport } = fakeTransport(() => {
      throw httpError(413);
    });
    const push = engine(transport, { batchSize: 20 });
    await enqueue(push, 'a');

    await push.push();
    expect(push.currentBatchSize()).toBe(10);
  });

  /**
   * The shrink has to reach the code that cuts batches, which is the queue manager. It used to
   * mutate a number the manager had already captured at construction, so a device whose batches
   * were over the server's 1MB ceiling resent the identical oversized batch until it ran out of
   * attempts and dropped the whole thing on the Failed screen.
   */
  it('actually sends smaller batches after a 413', async () => {
    let fail = true;
    const { sent, transport } = fakeTransport((ops) => {
      if (fail) {
        fail = false;
        throw httpError(413);
      }
      return allOk(ops);
    });
    const push = engine(transport, { batchSize: 4 });
    for (const id of ['a', 'b', 'c', 'd']) await enqueue(push, id);

    // First pass: one oversized batch, rejected whole.
    await push.push();
    expect(sent[0]).toHaveLength(4);
    // The size was the problem, so nobody pays an attempt for it. Shrinking 25 to 1 takes four
    // rejections, and charging each one would exhaust the budget before the batch fit.
    expect(await getOperation('a', txn)).toMatchObject({ status: 'pending', attempts: 0 });

    // The next work to be claimed is cut to the size the server will accept.
    for (const id of ['e', 'f', 'g', 'h']) await enqueue(push, id);
    await push.push();

    expect(sent[1]).toHaveLength(2);
  });
});

describe('background safety', () => {
  it('stops starting batches once the deadline passes', async () => {
    const { sent, transport } = fakeTransport(allOk);
    const push = engine(transport, { batchSize: 1, maxPasses: 10, drainLimit: 1 });
    for (const id of ['a', 'b', 'c']) await enqueue(push, id);

    let tick = 0;
    // Time only moves when the engine looks at the clock: first pass inside the budget,
    // second one past it.
    const outcome = await push.push({ deadlineMs: 1_000, now: () => (tick++ === 0 ? 0 : 5_000) });

    expect(outcome.stopped).toBe('deadline');
    expect(sent.length).toBeLessThan(3);
    // Unsent work is still queued, not lost.
    expect(await push.pendingCount({ txn })).toBeGreaterThan(0);
  });

  it('runs one pass at a time', async () => {
    const { transport } = fakeTransport(allOk);
    const push = engine(transport);
    await enqueue(push, 'a');

    const [first, second] = await Promise.all([push.push(), push.push()]);

    expect([first.stopped, second.stopped]).toContain('busy');
    expect(first.done + second.done).toBe(1);
    expect(push.isPushing()).toBe(false);
  });

  it('leaves a killed pass recoverable: inflight returns to pending at launch', async () => {
    const { transport } = fakeTransport(() => {
      throw new Error('killed mid-batch');
    });
    const push = engine(transport);
    await enqueue(push, 'a');
    await push.push();

    // Simulate a process death after the claim: the row is inflight, nobody holds it.
    raw.prepare("UPDATE outbox SET status = 'inflight' WHERE op_id = 'a'").run();
    expect(await push.recover({ txn })).toBe(1);
    expect((await getOperation('a', txn))?.status).toBe('pending');
  });

  it('stops when nothing is ready, rather than spinning on a backoff', async () => {
    const { sent, transport } = fakeTransport(() => {
      throw new Error('offline');
    });
    const push = engine(transport, { maxPasses: 5 });
    await enqueue(push, 'a');

    const outcome = await push.push();

    // One attempt, then the op is waiting out its backoff and nothing else is claimable.
    expect(sent).toHaveLength(1);
    expect(outcome.passes).toBe(2);
    expect(outcome.stopped).toBe('drained');
  });
});
