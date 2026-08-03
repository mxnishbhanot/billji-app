import type { SQLiteDatabase } from 'expo-sqlite';
import { upsertEntityRow } from '../../db/entityRepository';
import { toRow, uuidv7, type MongoDoc } from '../../db/mappers';
import { createProduct } from '../../db/productRepository';
import { enqueueOperation, listReadyOperations, pruneCompletedOperations } from '../../db/outbox';
import { localCustomerOutstanding, localInvoicePage, localProductPage } from '../../db/readModel';
import { pendingPaymentAllocations } from '../../db/paymentProjection';
import { pendingStockDeltasByProduct } from '../../db/stockProjection';
import { MAX_PUSH_OPERATIONS } from '../pushEngine';
import { createFakeServer, createTestDevice, type FakeServer, type TestDevice } from './fakeServer';

/**
 * A shop with years of books on the device, and a queue with a whole day of billing in it.
 *
 * Two different worries. The first is correctness at size: paging, totals and the projections
 * must not quietly change answer once there are more rows than fit on a screen. The second is
 * that none of it is accidentally quadratic — a projection that re-reads the outbox per row,
 * or a pull that re-applies a collection it has already stored, is invisible at 20 records and
 * a frozen list at 5,000.
 *
 * ponytail: the time budgets are deliberately loose (a slow shared CI runner is perhaps 5x a
 * laptop). They exist to catch a regression from linear to quadratic, not to measure a phone.
 * If one of them fails, the shape of the query changed — look there before raising the number.
 */

const BIZ = 'biz-1';
const T0 = '2026-08-02T10:00:00.000Z';

let server: FakeServer;
let device: TestDevice;
let txn: SQLiteDatabase;

const budget = async <T>(limitMs: number, task: () => Promise<T>): Promise<T> => {
  const startedAt = Date.now();
  const value = await task();
  const elapsed = Date.now() - startedAt;
  if (elapsed > limitMs) {
    throw new Error(`Took ${elapsed}ms, over the ${limitMs}ms budget — has the query stopped using an index?`);
  }
  return value;
};

const iso = (index: number) => new Date(Date.parse(T0) - index * 3_600_000).toISOString();

/** Rows straight through the mapper, without the queue: this is what a pulled history is. */
const seedInvoices = async (
  count: number,
  shape: (index: number) => MongoDoc = () => ({})
) => {
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const localId = uuidv7(Date.parse(T0) + index);
    const doc: MongoDoc = {
      _id: `srv-inv-${index}`,
      documentType: 'invoice',
      documentNumber: `INV-2026-27-${String(index + 1).padStart(4, '0')}`,
      date: iso(index),
      customer: 'srv-c1',
      customerSnapshot: { name: 'Ramesh Kumar' },
      items: [{ name: 'Cement bag', quantity: 1, price: 500 }],
      subtotal: 500,
      total: 500,
      paidAmount: 0,
      balanceDue: 500,
      documentStatus: 'issued',
      paymentStatus: 'unpaid',
      version: 1,
      updatedAt: iso(index),
      ...shape(index)
    };
    await upsertEntityRow(txn, 'invoices', toRow('invoices', doc, { businessId: BIZ, localId, syncState: 'synced', now: T0 }));
    ids.push(localId);
  }
  return ids;
};

const seedCustomer = async () => {
  await upsertEntityRow(
    txn,
    'customers',
    toRow(
      'customers',
      { _id: 'srv-c1', name: 'Ramesh Kumar', phone: '9876543210', version: 1, updatedAt: T0 },
      { businessId: BIZ, localId: uuidv7(), syncState: 'synced', now: T0 }
    )
  );
};

beforeEach(async () => {
  server = createFakeServer();
  device = await createTestDevice({ server, businessId: BIZ });
  txn = device.txn;
});

afterEach(() => device.close());

describe('a long history on the device', () => {
  it('pages 5,000 invoices without reading them all', async () => {
    await seedInvoices(5_000);

    const first = await budget(3_000, () => localInvoicePage(BIZ, { page: 1, limit: 20 }, txn));
    const deep = await budget(3_000, () => localInvoicePage(BIZ, { page: 200, limit: 20 }, txn));

    expect(first.pagination).toMatchObject({ total: 5_000, totalPages: 250, page: 1 });
    expect(first.invoices).toHaveLength(20);
    // Newest first, and page 200 is a different set of rows rather than the same twenty.
    expect(first.invoices[0].documentNumber).toBe('INV-2026-27-0001');
    expect(deep.invoices[0].documentNumber).toBe('INV-2026-27-3981');
  });

  it('finds one bill by number among 5,000', async () => {
    await seedInvoices(5_000);

    const found = await budget(3_000, () => localInvoicePage(BIZ, { search: 'INV-2026-27-4321' }, txn));

    expect(found.invoices).toHaveLength(1);
    expect(found.pagination.total).toBe(1);
  });

  it('lists what a customer owes across 800 unpaid bills', async () => {
    await seedCustomer();
    await seedInvoices(1_000, (index) =>
      index % 5 === 0 ? { paidAmount: 500, balanceDue: 0, paymentStatus: 'paid' } : {}
    );

    const outstanding = await budget(3_000, () => localCustomerOutstanding(BIZ, 'srv-c1', txn));

    expect(outstanding.invoices).toHaveLength(800);
    expect(outstanding.totalOutstanding).toBe(800 * 500);
    // Oldest first: a collection is applied to the oldest debt, so the order is the answer.
    expect(outstanding.invoices[0].date < outstanding.invoices[799].date).toBe(true);
  });
});

describe('a day of billing still in the queue', () => {
  it('reads the whole queue once to project stock, not once per product', async () => {
    const products: string[] = [];
    for (let index = 0; index < 100; index += 1) {
      const product = await createProduct(
        { name: `Product ${index}`, price: 100, stockQuantity: 500 },
        { businessId: BIZ, txn, now: T0 }
      );
      products.push(product.localId);
    }
    // 1,000 queued bills, each moving ten different products: 10,000 line items to fold up.
    for (let index = 0; index < 1_000; index += 1) {
      await enqueueOperation(
        {
          businessId: BIZ,
          entityType: 'invoices',
          entityLocalId: uuidv7(Date.parse(T0) + index),
          opType: 'create',
          payload: {
            items: Array.from({ length: 10 }, (_, line) => ({
              productId: products[(index + line) % products.length],
              quantity: 1
            }))
          }
        },
        { txn, now: T0 }
      );
    }

    const deltas = await budget(2_000, () => pendingStockDeltasByProduct(BIZ, txn));

    expect(deltas.size).toBe(100);
    expect([...deltas.values()].reduce((sum, list) => sum + list.length, 0)).toBe(10_000);
    // The projected level is the same figure a screen shows, and it is a single pass.
    const page = await budget(2_000, () => localProductPage(BIZ, { page: 1, limit: 20 }, txn));
    expect(page.products[0].stockQuantity).toBe(400);
  });

  it('projects 1,000 unsynced receipts in one pass', async () => {
    for (let index = 0; index < 1_000; index += 1) {
      await upsertEntityRow(
        txn,
        'payments',
        toRow(
          'payments',
          {
            invoiceId: `srv-inv-${index % 50}`,
            customerId: 'srv-c1',
            amount: 100,
            method: 'cash',
            receivedAt: iso(index),
            provisionalAllocations: [{ invoiceServerId: `srv-inv-${index % 50}`, amount: 100 }]
          },
          { businessId: BIZ, localId: uuidv7(Date.parse(T0) + index), syncState: 'pending', now: T0 }
        )
      );
    }

    const allocations = await budget(2_000, () => pendingPaymentAllocations(BIZ, txn, Date.parse(T0)));

    expect(allocations).toHaveLength(1_000);
    expect(allocations.reduce((sum, allocation) => sum + allocation.amount, 0)).toBe(100_000);
  });

  it('claims and drains 300 queued operations in server-sized batches', async () => {
    for (let index = 0; index < 300; index += 1) {
      await enqueueOperation(
        {
          businessId: BIZ,
          entityType: 'customers',
          entityLocalId: uuidv7(Date.parse(T0) + index),
          opType: 'create',
          payload: { name: `Customer ${index}`, phone: `90000${String(index).padStart(5, '0')}` }
        },
        { txn, now: T0 }
      );
    }

    const ready = await budget(2_000, () => listReadyOperations(BIZ, { txn, now: T0, limit: 500 }));
    expect(ready).toHaveLength(300);

    const outcome = await budget(20_000, () => device.push.push());

    expect(outcome.done).toBe(300);
    expect(server.count('customers')).toBe(300);
    // Never a request the server would reject whole for being oversized.
    expect(Math.max(...server.pushes.map((request) => request.ops.length))).toBeLessThanOrEqual(MAX_PUSH_OPERATIONS);
  });

  it('prunes thousands of accepted operations in one statement', async () => {
    for (let index = 0; index < 3_000; index += 1) {
      const operation = await enqueueOperation(
        {
          businessId: BIZ,
          entityType: 'customers',
          entityLocalId: uuidv7(Date.parse(T0) + index),
          opType: 'create',
          payload: { name: `Customer ${index}` }
        },
        { txn, now: T0 }
      );
      txn.runAsync("UPDATE outbox SET status = 'done' WHERE op_id = ?", operation.opId);
    }

    const pruned = await budget(3_000, () => pruneCompletedOperations('2026-08-03T00:00:00.000Z', { txn }));

    expect(pruned).toBe(3_000);
  });
});

describe("a first sync of somebody else's books", () => {
  it('applies 2,000 records in pages and does not re-apply them next time', async () => {
    for (let index = 0; index < 2_000; index += 1) {
      server.seed('products', { name: `Product ${index}`, price: 10 + index, stockQuantity: 25 });
    }
    const pull = device.pull;

    const outcome = await budget(30_000, () => pull.pull({ deadlineMs: 60_000 }));

    expect(outcome.applied).toBe(2_000);
    const productResult = outcome.collections.find((result) => result.collection === 'products');
    expect(productResult).toMatchObject({ hasMore: false });
    expect(productResult!.pages).toBeGreaterThan(1);
    expect((await localProductPage(BIZ, { page: 1, limit: 20 }, txn)).pagination.total).toBe(2_000);

    // The second pass asks from the stored cursor and brings nothing back: the cost of a sync
    // is the size of the change, not the size of the history.
    server.pulls.length = 0;
    const second = await budget(5_000, () => pull.pull());

    expect(second.applied).toBe(0);
    expect(server.pulls.filter((request) => request.collection === 'products')).toHaveLength(1);
  });
});
