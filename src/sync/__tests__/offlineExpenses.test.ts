import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getExpense } from '../../db/expenseRepository';
import { createExpenseLocally, deleteExpenseLocally, updateExpenseLocally } from '../../db/expenseWrites';
import { listOperations } from '../../db/outbox';
import { localExpenseList } from '../../db/readModel';
import { openTestDatabase } from '../../db/__tests__/realSqlite';
import { mergeRecord } from '../pullEngine';
import { createPushEngine, toWireOperation, type PushResponse, type PushTransport } from '../pushEngine';

/** The offline expense lifecycle: written with no network, pushed, and pulled back. */

const BIZ = 'biz-1';
const T0 = '2026-08-02T10:00:00.000Z';

let raw: DatabaseSync;
let txn: SQLiteDatabase;

const options = () => ({ businessId: BIZ, txn, now: T0 });

const opsFor = (entityLocalId: string) =>
  listOperations({ businessId: BIZ, entityType: 'expenses', entityLocalId, txn });

const add = (extra: Record<string, unknown> = {}) =>
  createExpenseLocally(
    { amount: 1000, taxAmount: 180, category: 'transport', paymentMethod: 'cash', date: T0, ...extra },
    options()
  );

const acceptAll = (serverId: string): PushTransport => async (body) => ({
  results: body.ops.map((op) => ({ opId: op.opId, status: 'ok' as const, serverId, version: 1 }))
});

const engine = (transport: PushTransport) =>
  createPushEngine({ businessId: BIZ, transport, txn, clock: () => T0 });

beforeEach(async () => {
  ({ raw, txn } = await openTestDatabase());
});

afterEach(() => raw.close());

describe('pushing what was written offline', () => {
  it('sends the expense with the total the server will derive anyway', async () => {
    const record = await add();
    const [create] = await opsFor(record.localId);

    const wire = toWireOperation(create);
    expect(wire?.entity).toBe('expense');
    expect(wire?.payload?.total).toBe(1180);
  });

  it('drains a create and leaves the expense synced under its server id', async () => {
    const record = await add();

    const outcome = await engine(acceptAll('srv-3')).push();

    expect(outcome.done).toBe(1);
    const stored = await getExpense(record.localId, txn);
    expect(stored?.serverId).toBe('srv-3');
    expect(stored?.syncState).toBe('synced');
    expect((await localExpenseList(BIZ, {}, txn)).expenses[0]._id).toBe('srv-3');
  });

  it('sends an edit made before the create came back against the earned server id', async () => {
    const record = await add();
    await updateExpenseLocally(record.localId, { amount: 900 }, options());

    const sent: string[] = [];
    await engine(async (body): Promise<PushResponse> => {
      sent.push(...body.ops.map((op) => `${op.opType}:${op.targetId ?? 'none'}`));
      return { results: body.ops.map((op) => ({ opId: op.opId, status: 'ok' as const, serverId: 'srv-3', version: 2 })) };
    }).push();

    expect(sent).toEqual(['create:none', 'update:srv-3']);
    expect((await getExpense(record.localId, txn))?.syncState).toBe('synced');
  });

  it('keeps the expense and the queued work when the push fails', async () => {
    const record = await add({ vendorName: 'Sharma Transport' });

    const outcome = await engine(async () => {
      throw new Error('Network request failed');
    }).push();

    expect(outcome.retried).toBe(1);
    expect((await getExpense(record.localId, txn))?.doc?.vendorName).toBe('Sharma Transport');
    expect((await opsFor(record.localId))[0].status).toBe('pending');
    // The money is still counted while it waits.
    expect((await localExpenseList(BIZ, {}, txn)).summary.total).toBe(1180);
  });

  it('sends the delete of a synced expense and nothing for one the server never saw', async () => {
    const kept = await add();
    await engine(acceptAll('srv-3')).push();
    await deleteExpenseLocally(kept.localId, options());

    const unsent = await add({ amount: 5 });
    await deleteExpenseLocally(unsent.localId, options());

    const sent: string[] = [];
    await engine(async (body): Promise<PushResponse> => {
      sent.push(...body.ops.map((op) => `${op.opType}:${op.targetId}`));
      return { results: body.ops.map((op) => ({ opId: op.opId, status: 'ok' as const })) };
    }).push();

    expect(sent).toEqual(['delete:srv-3']);
    expect((await getExpense(unsent.localId, txn))?.deletedAt).toBeTruthy();
  });

  it('marks the row in conflict when the server rejects the base version', async () => {
    const record = await add();
    await engine(acceptAll('srv-3')).push();
    await updateExpenseLocally(record.localId, { vendorName: 'Sharma Transport' }, options());

    await engine(async (body): Promise<PushResponse> => ({
      results: body.ops.map((op) => ({ opId: op.opId, status: 'conflict' as const, message: 'Version conflict' }))
    })).push();

    expect((await getExpense(record.localId, txn))?.syncState).toBe('conflict');
    expect((await opsFor(record.localId)).at(-1)?.status).toBe('conflict');
  });
});

describe('pulling back what this device pushed', () => {
  it('does not escalate an expense the server has just accepted', async () => {
    const record = await add();
    await engine(acceptAll('srv-3')).push();

    const outcome = await mergeRecord(
      txn,
      'expenses',
      {
        _id: 'srv-3',
        clientId: record.localId,
        amount: 1000,
        taxAmount: 180,
        total: 1180,
        category: 'transport',
        date: T0,
        version: 2
      },
      { businessId: BIZ, now: T0 }
    );

    expect(outcome).toBe('updated');
    expect((await getExpense(record.localId, txn))?.syncState).toBe('synced');
  });

  it('keeps the local edit and the server field it did not touch', async () => {
    const record = await add();
    await engine(acceptAll('srv-3')).push();
    // The shopkeeper corrects the vendor offline; the office reclassifies the same row.
    await updateExpenseLocally(record.localId, { vendorName: 'Sharma Transport' }, options());

    const outcome = await mergeRecord(
      txn,
      'expenses',
      {
        _id: 'srv-3',
        clientId: record.localId,
        amount: 1000,
        taxAmount: 180,
        total: 1180,
        category: 'travel',
        reference: 'TRK-88',
        date: T0,
        version: 3
      },
      { businessId: BIZ, now: T0 }
    );

    expect(outcome).toBe('conflict');
    const doc = (await getExpense(record.localId, txn))?.doc;
    expect(doc?.vendorName).toBe('Sharma Transport');
    expect(doc?.category).toBe('travel');
    expect(doc?.reference).toBe('TRK-88');
    expect((await getExpense(record.localId, txn))?.syncState).toBe('pending');
  });

  it('drops a voided expense out of the list the moment the server says so', async () => {
    const record = await add();
    await engine(acceptAll('srv-3')).push();

    await mergeRecord(
      txn,
      'expenses',
      {
        _id: 'srv-3',
        clientId: record.localId,
        amount: 1000,
        taxAmount: 180,
        total: 1180,
        category: 'transport',
        date: T0,
        voidedAt: T0,
        version: 4
      },
      { businessId: BIZ, now: T0 }
    );

    const { expenses, summary } = await localExpenseList(BIZ, {}, txn);
    expect(expenses).toEqual([]);
    expect(summary.total).toBe(0);
  });
});
