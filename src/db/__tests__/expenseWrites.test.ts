import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { expenseTotal, getExpense } from '../expenseRepository';
import {
  createExpenseLocally,
  deleteExpenseLocally,
  findExpenseByAnyId,
  updateExpenseLocally
} from '../expenseWrites';
import { listOperations } from '../outbox';
import { localExpenseList } from '../readModel';
import { openTestDatabase } from './realSqlite';

const BIZ = 'biz-1';
const T0 = '2026-08-02T10:00:00.000Z';

let raw: DatabaseSync;
let txn: SQLiteDatabase;

const options = () => ({ businessId: BIZ, txn, now: T0 });

const queue = (entityLocalId?: string) =>
  listOperations({ businessId: BIZ, entityType: 'expenses', entityLocalId, txn });

const add = (extra: Record<string, unknown> = {}) =>
  createExpenseLocally(
    { amount: 1000, taxAmount: 180, category: 'transport', paymentMethod: 'cash', date: T0, ...extra },
    options()
  );

/** An expense the server already knows about, as a pull would have left it. */
const synced = async (serverId: string, extra: Record<string, unknown> = {}) => {
  const record = await add(extra);
  raw
    .prepare(`UPDATE expenses SET server_id = ?, version = 2, sync_state = 'synced' WHERE local_id = ?`)
    .run(serverId, record.localId);
  raw.prepare(`UPDATE outbox SET status = 'done' WHERE entity_local_id = ?`).run(record.localId);
  return record.localId;
};

beforeEach(async () => {
  ({ raw, txn } = await openTestDatabase());
});

afterEach(() => raw.close());

describe('create', () => {
  it('writes the row, derives the total and queues the create', async () => {
    const record = await add({ vendorName: 'Sharma Transport', reference: 'TRK-88' });

    expect(record.syncState).toBe('pending');
    // The server refuses a client-supplied total and derives the same figure from the parts.
    expect(record.doc?.total).toBe(1180);

    const [operation] = await queue(record.localId);
    expect(operation.opType).toBe('create');
    expect(operation.payload?.clientId).toBe(record.localId);
    expect(operation.payload?.total).toBe(1180);
  });

  it('dates an expense that arrives without one', async () => {
    const record = await createExpenseLocally({ amount: 500, category: 'other', paymentMethod: 'cash' }, options());

    expect(record.doc?.date).toBe(T0);
    expect(record.doc?.total).toBe(500);
  });

  it('counts an offline expense in the list and its summary', async () => {
    await add({ amount: 1000, taxAmount: 0, category: 'transport' });
    await add({ amount: 250, taxAmount: 0, category: 'utilities' });

    const { expenses, summary } = await localExpenseList(BIZ, {}, txn);

    expect(expenses).toHaveLength(2);
    expect(expenses[0]._id).toBeTruthy();
    expect(await findExpenseByAnyId(expenses[0]._id, txn)).not.toBeNull();
    expect(summary.total).toBe(1250);
    expect(summary.count).toBe(2);
    expect(summary.byCategory).toEqual([
      { category: 'transport', total: 1000, count: 1 },
      { category: 'utilities', total: 250, count: 1 }
    ]);
  });

  it('rounds the derived total to paise', () => {
    expect(expenseTotal({ amount: 10.005, taxAmount: 0 })).toBe(10.01);
    expect(expenseTotal({})).toBe(0);
  });
});

describe('search and filters', () => {
  it('matches vendor, reference and the notes only the document holds', async () => {
    await add({ vendorName: 'Sharma Transport', reference: 'TRK-88', notes: 'Diesel for the tempo' });
    await add({ vendorName: 'City Power', reference: 'BILL-1', category: 'utilities' });

    expect((await localExpenseList(BIZ, { search: 'sharma' }, txn)).expenses).toHaveLength(1);
    expect((await localExpenseList(BIZ, { search: 'TRK-88' }, txn)).expenses).toHaveLength(1);
    expect((await localExpenseList(BIZ, { search: 'tempo' }, txn)).expenses).toHaveLength(1);
    expect((await localExpenseList(BIZ, { search: 'nothing' }, txn)).expenses).toEqual([]);
  });

  it('keeps the summary on the date range while the list narrows', async () => {
    await add({ amount: 1000, taxAmount: 0, category: 'transport' });
    await add({ amount: 250, taxAmount: 0, category: 'utilities' });

    const filtered = await localExpenseList(BIZ, { category: 'utilities' }, txn);

    expect(filtered.expenses).toHaveLength(1);
    // The API's summary ignores search and category — matching that is the point.
    expect(filtered.summary.total).toBe(1250);
  });

  it('honours the date range on both the list and the summary', async () => {
    await add({ amount: 1000, taxAmount: 0, date: '2026-07-01T09:00:00.000Z' });
    await add({ amount: 250, taxAmount: 0, date: '2026-08-02T09:00:00.000Z' });

    const july = await localExpenseList(BIZ, { from: '2026-07-01', to: '2026-07-31' }, txn);

    expect(july.expenses).toHaveLength(1);
    expect(july.summary.total).toBe(1000);
    // An inclusive end date covers the whole day, not midnight.
    expect((await localExpenseList(BIZ, { from: '2026-08-02', to: '2026-08-02' }, txn)).expenses).toHaveLength(1);
  });
});

describe('update', () => {
  it('recomputes the total when only the tax changes and sends it with the patch', async () => {
    const localId = await synced('srv-2');

    const updated = await updateExpenseLocally(localId, { taxAmount: 0 }, options());

    expect(updated?.doc?.total).toBe(1000);
    const update = (await queue(localId)).at(-1);
    expect(update?.payload).toEqual({ taxAmount: 0, total: 1000, clientId: localId, targetId: 'srv-2' });
    expect(update?.baseVersion).toBe(2);
  });

  it('leaves the total alone for an edit that cannot change it', async () => {
    const localId = await synced('srv-2');

    await updateExpenseLocally(localId, { vendorName: 'Sharma Transport' }, options());

    const update = (await queue(localId)).at(-1);
    expect(update?.payload).toEqual({ vendorName: 'Sharma Transport', clientId: localId, targetId: 'srv-2' });
    expect((await getExpense(localId, txn))?.doc?.total).toBe(1180);
  });

  it('moves the row in the summary it belongs to', async () => {
    const localId = await synced('srv-2', { amount: 1000, taxAmount: 0, category: 'transport' });

    await updateExpenseLocally(localId, { amount: 400, category: 'repairs' }, options());

    const { summary } = await localExpenseList(BIZ, {}, txn);
    expect(summary.total).toBe(400);
    expect(summary.byCategory).toEqual([{ category: 'repairs', total: 400, count: 1 }]);
  });
});

describe('delete', () => {
  it('tombstones a synced expense, queues the delete and drops it from the summary', async () => {
    const localId = await synced('srv-2');

    expect(await deleteExpenseLocally(localId, options())).toBe(true);

    expect((await getExpense(localId, txn))?.deletedAt).toBeTruthy();
    const remove = (await queue(localId)).at(-1);
    expect(remove?.opType).toBe('delete');
    expect(remove?.payload?.targetId).toBe('srv-2');

    const { expenses, summary } = await localExpenseList(BIZ, {}, txn);
    expect(expenses).toEqual([]);
    expect(summary).toEqual({ total: 0, count: 0, byCategory: [] });
  });

  it('discards the queued create instead of deleting an expense the server never saw', async () => {
    const record = await add();
    await updateExpenseLocally(record.localId, { amount: 900 }, options());

    expect(await deleteExpenseLocally(record.localId, options())).toBe(true);

    const operations = await queue(record.localId);
    expect(operations.map((operation) => operation.status)).toEqual(['dead', 'dead']);
    expect(operations.some((operation) => operation.opType === 'delete')).toBe(false);
  });
});
