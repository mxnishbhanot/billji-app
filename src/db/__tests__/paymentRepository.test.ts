import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  countPayments,
  createPayment,
  deletePayment,
  findPaymentByReference,
  getPayment,
  getPaymentByServerId,
  listPayments,
  listPaymentsForCustomer,
  listPaymentsForInvoice,
  updatePayment
} from '../paymentRepository';
import { openTestDatabase } from './realSqlite';

const BIZ = 'biz-1';
let raw: DatabaseSync;
let txn: SQLiteDatabase;

const add = (reference: string, extra: Record<string, unknown> = {}) =>
  createPayment(
    { reference, amount: 500, method: 'cash', type: 'receipt', receivedAt: '2026-07-15T10:00:00.000Z', ...extra },
    { businessId: BIZ, txn }
  );

const refs = async (query: Parameters<typeof listPayments>[0]) =>
  (await listPayments(query)).items.map((item) => item.doc?.reference);

beforeEach(async () => {
  ({ raw, txn } = await openTestDatabase());
});

afterEach(() => raw.close());

describe('create and read', () => {
  it('stores a receipt and promotes the columns the lists filter on', async () => {
    const created = await add('UPI-1234', { amount: 1180, method: 'upi', salesDocument: 'inv-server-1' });

    expect((await getPayment(created.localId, txn))?.doc).toEqual(created.doc);
    expect(raw.prepare('SELECT amount, method, type, status, invoice_server_id FROM payments').get()).toEqual({
      amount: 1180,
      method: 'upi',
      type: 'receipt',
      // The backend defaults a receipt to completed; the column mirrors it.
      status: 'completed',
      invoice_server_id: 'inv-server-1'
    });
  });

  it('falls back to the legacy invoice reference', async () => {
    await add('CHQ-1', { invoice: 'inv-legacy' });
    expect(raw.prepare('SELECT invoice_server_id FROM payments').get()).toEqual({ invoice_server_id: 'inv-legacy' });
  });

  it('reads by server id and by reference', async () => {
    await add('UPI-9', { _id: 'srv-9' });

    expect((await getPaymentByServerId('srv-9', txn))?.doc?.reference).toBe('UPI-9');
    expect((await findPaymentByReference(BIZ, 'UPI-9', txn))?.doc?.amount).toBe(500);
    expect(await findPaymentByReference(BIZ, 'UPI-nope', txn)).toBeNull();
  });
});

describe('update and delete', () => {
  it('merges the patch and re-promotes the status column', async () => {
    const created = await add('UPI-5', { status: 'pending' });
    const updated = await updatePayment(created.localId, { status: 'completed' }, { txn });

    expect(updated?.doc).toMatchObject({ reference: 'UPI-5', amount: 500, status: 'completed' });
    expect(raw.prepare('SELECT status FROM payments').get()).toEqual({ status: 'completed' });
    expect(raw.prepare('SELECT COUNT(*) AS n FROM payments').get()).toEqual({ n: 1 });
  });

  it('tombstones a receipt recorded in error', async () => {
    const created = await add('CASH-1');
    expect(await deletePayment(created.localId, { txn, now: '2026-08-02T12:00:00.000Z' })).toBe(true);

    expect((await getPayment(created.localId, txn))?.deletedAt).toBe('2026-08-02T12:00:00.000Z');
    expect(await refs({ businessId: BIZ, txn })).toEqual([]);
    expect(await findPaymentByReference(BIZ, 'CASH-1', txn)).toBeNull();
    expect(await deletePayment(created.localId, { txn })).toBe(false);
    expect(await updatePayment(created.localId, { amount: 1 }, { txn })).toBeNull();
  });
});

describe('filters', () => {
  beforeEach(async () => {
    await add('CASH-1', { receivedAt: '2026-07-01T09:00:00.000Z' });
    await add('UPI-2', { receivedAt: '2026-07-20T09:00:00.000Z', method: 'upi' });
    await add('REF-3', { receivedAt: '2026-08-01T09:00:00.000Z', type: 'refund', status: 'refunded' });
    await add('VEN-4', { receivedAt: '2026-08-02T09:00:00.000Z', type: 'vendor_payment', method: 'bank_transfer' });
    await createPayment({ reference: 'OTHER', receivedAt: '2026-08-01T09:00:00.000Z' }, { businessId: 'biz-2', txn });
  });

  it('lists every cash movement newest first', async () => {
    expect(await refs({ businessId: BIZ, txn })).toEqual(['VEN-4', 'REF-3', 'UPI-2', 'CASH-1']);
  });

  it('filters by type, method and status, single or multi-select', async () => {
    expect(await refs({ businessId: BIZ, type: 'receipt', txn })).toEqual(['UPI-2', 'CASH-1']);
    expect(await refs({ businessId: BIZ, type: ['refund', 'vendor_payment'], txn })).toEqual(['VEN-4', 'REF-3']);
    expect(await refs({ businessId: BIZ, method: ['upi', 'bank_transfer'], txn })).toEqual(['VEN-4', 'UPI-2']);
    expect(await refs({ businessId: BIZ, status: 'refunded', txn })).toEqual(['REF-3']);
  });

  it('filters by period, inclusive of both bounds', async () => {
    expect(
      await refs({ businessId: BIZ, from: '2026-07-01T09:00:00.000Z', to: '2026-07-20T09:00:00.000Z', txn })
    ).toEqual(['UPI-2', 'CASH-1']);
    expect(await refs({ businessId: BIZ, from: '2026-08-02T00:00:00.000Z', txn })).toEqual(['VEN-4']);
  });

  it('searches the reference and escapes LIKE wildcards', async () => {
    expect(await refs({ businessId: BIZ, search: 'upi', txn })).toEqual(['UPI-2']);
    expect(await refs({ businessId: BIZ, search: '%', txn })).toEqual([]);
  });

  it('scopes to the business and counts the same filters', async () => {
    expect(await refs({ businessId: 'biz-2', txn })).toEqual(['OTHER']);
    expect(await countPayments({ businessId: BIZ, txn })).toBe(4);
    expect(await countPayments({ businessId: BIZ, type: 'receipt', txn })).toBe(2);
  });
});

describe('by invoice and customer', () => {
  it('lists what was received against one document, by local id', async () => {
    const first = await add('PART-1', { amount: 300 });
    const second = await add('PART-2', { amount: 200, receivedAt: '2026-07-16T10:00:00.000Z' });
    await add('ELSEWHERE');

    for (const record of [first, second]) {
      raw.prepare('UPDATE payments SET invoice_local_id = ? WHERE local_id = ?').run('inv-local-1', record.localId);
    }

    const page = await listPaymentsForInvoice(BIZ, 'inv-local-1', { txn });
    expect(page.items.map((item) => item.doc?.reference)).toEqual(['PART-2', 'PART-1']);
    expect(await listPaymentsForInvoice(BIZ, 'inv-local-missing', { txn })).toMatchObject({ items: [] });
  });

  it('lists a customer ledger of receipts, refunds excluded on request', async () => {
    const receipt = await add('CUST-R1');
    const refund = await add('CUST-F1', { type: 'refund', receivedAt: '2026-07-18T10:00:00.000Z' });

    for (const record of [receipt, refund]) {
      raw.prepare('UPDATE payments SET customer_local_id = ? WHERE local_id = ?').run('cust-local-1', record.localId);
    }

    expect((await listPaymentsForCustomer(BIZ, 'cust-local-1', { txn })).items).toHaveLength(2);
    const receiptsOnly = await listPaymentsForCustomer(BIZ, 'cust-local-1', { type: 'receipt', txn });
    expect(receiptsOnly.items.map((item) => item.doc?.reference)).toEqual(['CUST-R1']);
  });
});

describe('pagination', () => {
  it('pages newest-first through every row exactly once, ties included', async () => {
    for (const [reference, receivedAt] of [
      ['A', '2026-07-01T09:00:00.000Z'],
      ['B', '2026-07-02T09:00:00.000Z'],
      ['C', '2026-07-02T09:00:00.000Z'],
      ['D', '2026-07-03T09:00:00.000Z'],
      ['E', '2026-07-04T09:00:00.000Z']
    ]) {
      await add(reference, { receivedAt });
    }

    const seen: string[] = [];
    let cursor = null as Awaited<ReturnType<typeof listPayments>>['nextCursor'];
    let pages = 0;

    do {
      const page = await listPayments({ businessId: BIZ, limit: 2, cursor, txn });
      seen.push(...page.items.map((item) => String(item.doc?.reference)));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);

    expect(new Set(seen).size).toBe(5);
    expect(seen[0]).toBe('E');
    expect(seen[seen.length - 1]).toBe('A');
    expect(pages).toBe(3);
  });
});

describe('safety', () => {
  it('rolls every write back when the enclosing transaction throws', async () => {
    const kept = await add('KEEP');

    await expect(
      txn.withExclusiveTransactionAsync(async (scoped) => {
        await createPayment({ reference: 'DOOM', amount: 1 }, { businessId: BIZ, txn: scoped });
        await updatePayment(kept.localId, { amount: 999 }, { txn: scoped });
        throw new Error('caller changed its mind');
      })
    ).rejects.toThrow('caller changed its mind');

    expect(raw.prepare('SELECT COUNT(*) AS n FROM payments').get()).toEqual({ n: 1 });
    expect((await getPayment(kept.localId, txn))?.doc?.amount).toBe(500);
  });
});
