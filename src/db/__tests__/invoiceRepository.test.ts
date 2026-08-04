import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  countInvoices,
  createInvoice,
  deleteInvoice,
  findInvoiceByNumber,
  getInvoice,
  getInvoiceByServerId,
  listInvoices,
  listInvoicesForCustomer,
  listOutstandingInvoices,
  updateInvoice
} from '../invoiceRepository';
import { openTestDatabase } from './realSqlite';

const BIZ = 'biz-1';
let raw: DatabaseSync;
let txn: SQLiteDatabase;

const add = (documentNumber: string, extra: Record<string, unknown> = {}) =>
  createInvoice(
    {
      documentNumber,
      date: '2026-07-15T00:00:00.000Z',
      customerSnapshot: { name: 'Ramesh Traders' },
      total: 1180,
      ...extra
    },
    { businessId: BIZ, txn }
  );

const numbers = async (query: Parameters<typeof listInvoices>[0]) =>
  (await listInvoices(query)).items.map((item) => item.doc?.documentNumber);

beforeEach(async () => {
  ({ raw, txn } = await openTestDatabase());
});

afterEach(() => raw.close());

describe('create and read', () => {
  it('stores a document and promotes the columns the list filters on', async () => {
    const created = await add('INV/0001', {
      dueDate: '2026-08-15T00:00:00.000Z',
      paidAmount: 180,
      balanceDue: 1000,
      paymentStatus: 'partial',
      documentStatus: 'issued'
    });

    expect(created.doc?.customerSnapshot?.name).toBe('Ramesh Traders');
    expect((await getInvoice(created.localId, txn))?.doc).toEqual(created.doc);
    expect(raw.prepare('SELECT document_type, customer_name, payment_status, balance_due FROM invoices').get()).toEqual(
      {
        document_type: 'invoice',
        customer_name: 'Ramesh Traders',
        payment_status: 'partial',
        balance_due: 1000
      }
    );
  });

  it('stores both sides of the customer reference and keeps an unheld customer', async () => {
    const created = await add('INV/0002', { customer: 'cust-server-1' });

    // No local id resolves without a lookup, and no foreign key rejects the row: the
    // reference simply stays pending.
    expect(raw.prepare('SELECT customer_server_id, customer_local_id FROM invoices').get()).toEqual({
      customer_server_id: 'cust-server-1',
      customer_local_id: null
    });
    expect(created.doc?.customer).toBe('cust-server-1');
  });

  it('reads by server id and by document number', async () => {
    await add('INV/0003', { _id: 'srv-3' });

    expect((await getInvoiceByServerId('srv-3', txn))?.doc?.documentNumber).toBe('INV/0003');
    expect((await findInvoiceByNumber(BIZ, 'INV/0003', txn))?.doc?.documentNumber).toBe('INV/0003');
    expect(await findInvoiceByNumber(BIZ, 'INV/9999', txn)).toBeNull();
  });
});

describe('update and delete', () => {
  it('merges the patch and re-promotes the status columns', async () => {
    const created = await add('INV/0004', { paymentStatus: 'unpaid', balanceDue: 1180 });
    const updated = await updateInvoice(created.localId, { paidAmount: 1180, balanceDue: 0, paymentStatus: 'paid' }, { txn });

    expect(updated?.doc).toMatchObject({ documentNumber: 'INV/0004', paymentStatus: 'paid', balanceDue: 0 });
    expect(raw.prepare('SELECT payment_status, paid_amount FROM invoices').get()).toEqual({
      payment_status: 'paid',
      paid_amount: 1180
    });
    expect(raw.prepare('SELECT COUNT(*) AS n FROM invoices').get()).toEqual({ n: 1 });
  });

  it('tombstones a discarded document instead of removing it', async () => {
    const created = await add('QTN/0001', { documentType: 'quotation' });
    expect(await deleteInvoice(created.localId, { txn, now: '2026-08-02T12:00:00.000Z' })).toBe(true);

    expect((await getInvoice(created.localId, txn))?.deletedAt).toBe('2026-08-02T12:00:00.000Z');
    expect(await numbers({ businessId: BIZ, documentType: 'quotation', txn })).toEqual([]);
    expect(await deleteInvoice(created.localId, { txn })).toBe(false);
    expect(await updateInvoice(created.localId, { total: 1 }, { txn })).toBeNull();
  });
});

describe('filters', () => {
  beforeEach(async () => {
    await add('INV/0001', { date: '2026-07-01T00:00:00.000Z', paymentStatus: 'paid', documentStatus: 'issued' });
    await add('INV/0002', {
      date: '2026-07-20T00:00:00.000Z',
      paymentStatus: 'partial',
      documentStatus: 'issued',
      customerSnapshot: { name: 'Sunita Stores' }
    });
    await add('INV/0003', { date: '2026-08-01T00:00:00.000Z', paymentStatus: 'unpaid', documentStatus: 'cancelled' });
    await add('QTN/0001', { date: '2026-08-02T00:00:00.000Z', documentType: 'quotation' });
    await createInvoice({ documentNumber: 'INV/OTHER', date: '2026-08-01T00:00:00.000Z' }, { businessId: 'biz-2', txn });
  });

  it('defaults to invoices only, newest first', async () => {
    expect(await numbers({ businessId: BIZ, txn })).toEqual(['INV/0003', 'INV/0002', 'INV/0001']);
  });

  it('lists another document type, or every type on request', async () => {
    expect(await numbers({ businessId: BIZ, documentType: 'quotation', txn })).toEqual(['QTN/0001']);
    expect(await numbers({ businessId: BIZ, documentType: null, txn })).toEqual([
      'QTN/0001',
      'INV/0003',
      'INV/0002',
      'INV/0001'
    ]);
  });

  it('filters by status, single or multi-select', async () => {
    expect(await numbers({ businessId: BIZ, documentStatus: 'cancelled', txn })).toEqual(['INV/0003']);
    expect(await numbers({ businessId: BIZ, paymentStatus: ['paid', 'partial'], txn })).toEqual([
      'INV/0002',
      'INV/0001'
    ]);
  });

  it('filters by date period, inclusive of both bounds', async () => {
    expect(
      await numbers({ businessId: BIZ, from: '2026-07-01T00:00:00.000Z', to: '2026-07-20T00:00:00.000Z', txn })
    ).toEqual(['INV/0002', 'INV/0001']);
    expect(await numbers({ businessId: BIZ, from: '2026-07-25T00:00:00.000Z', txn })).toEqual(['INV/0003']);
  });

  it('searches document number and the snapshot customer name', async () => {
    expect(await numbers({ businessId: BIZ, search: '0002', txn })).toEqual(['INV/0002']);
    expect(await numbers({ businessId: BIZ, search: 'sunita', txn })).toEqual(['INV/0002']);
    expect(await numbers({ businessId: BIZ, search: '%', txn })).toEqual([]);
  });

  it('scopes to the business and counts the same filters', async () => {
    expect(await numbers({ businessId: 'biz-2', txn })).toEqual(['INV/OTHER']);
    expect(await countInvoices({ businessId: BIZ, txn })).toBe(3);
    expect(await countInvoices({ businessId: BIZ, documentType: null, txn })).toBe(4);
  });

  it('lists what is still owed, across payment statuses', async () => {
    const outstanding = await listOutstandingInvoices({ businessId: BIZ, txn });
    expect(outstanding.items.map((item) => item.doc?.documentNumber)).toEqual(['INV/0003', 'INV/0002']);
  });

  it('lists a customer history by local id, every document type', async () => {
    const customer = await add('INV/0010', { documentType: 'credit_note' });
    await raw
      .prepare('UPDATE invoices SET customer_local_id = ? WHERE local_id = ?')
      .run('cust-local-1', customer.localId);

    const history = await listInvoicesForCustomer(BIZ, 'cust-local-1', { txn });
    expect(history.items.map((item) => item.doc?.documentNumber)).toEqual(['INV/0010']);
  });
});

describe('pagination', () => {
  it('pages newest-first through every row exactly once, ties included', async () => {
    // Same date on two documents: without the local_id tie-break a page boundary here
    // would skip or repeat one of them.
    for (const [number, date] of [
      ['A', '2026-07-01T00:00:00.000Z'],
      ['B', '2026-07-02T00:00:00.000Z'],
      ['C', '2026-07-02T00:00:00.000Z'],
      ['D', '2026-07-03T00:00:00.000Z'],
      ['E', '2026-07-04T00:00:00.000Z']
    ]) {
      await add(number, { date });
    }

    const seen: string[] = [];
    let cursor = null as Awaited<ReturnType<typeof listInvoices>>['nextCursor'];
    let pages = 0;

    do {
      const page = await listInvoices({ businessId: BIZ, limit: 2, cursor, txn });
      seen.push(...page.items.map((item) => String(item.doc?.documentNumber)));
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
    const kept = await add('INV/KEEP');

    await expect(
      txn.withExclusiveTransactionAsync(async (scoped) => {
        await createInvoice({ documentNumber: 'INV/DOOM', date: '2026-08-01' }, { businessId: BIZ, txn: scoped });
        await updateInvoice(kept.localId, { total: 999 }, { txn: scoped });
        throw new Error('caller changed its mind');
      })
    ).rejects.toThrow('caller changed its mind');

    expect(raw.prepare('SELECT COUNT(*) AS n FROM invoices').get()).toEqual({ n: 1 });
    expect((await getInvoice(kept.localId, txn))?.doc?.total).toBe(1180);
  });
});
