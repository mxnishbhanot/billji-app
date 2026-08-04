import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { listOperations } from '../outbox';
import { createProductLocally } from '../productWrites';
import { getPurchase, provisionalTotals } from '../purchaseRepository';
import { createPurchaseLocally, findPurchaseByAnyId } from '../purchaseWrites';
import { localPurchases } from '../readModel';
import { createSupplierLocally } from '../supplierWrites';
import { openTestDatabase } from './realSqlite';

const BIZ = 'biz-1';
const T0 = '2026-08-02T10:00:00.000Z';

let raw: DatabaseSync;
let txn: SQLiteDatabase;

const options = () => ({ businessId: BIZ, txn, now: T0 });

const queue = (entityType: string, entityLocalId?: string) =>
  listOperations({ businessId: BIZ, entityType, entityLocalId, txn });

/** A supplier the server already knows about. */
const syncedSupplier = async (name: string, serverId: string) => {
  const record = await createSupplierLocally({ name, gstNumber: '29ABCDE1234F1Z5' }, options());
  raw
    .prepare(`UPDATE suppliers SET server_id = ?, version = 1, sync_state = 'synced' WHERE local_id = ?`)
    .run(serverId, record.localId);
  raw.prepare(`UPDATE outbox SET status = 'done' WHERE entity_local_id = ?`).run(record.localId);
  return record.localId;
};

beforeEach(async () => {
  ({ raw, txn } = await openTestDatabase());
});

afterEach(() => raw.close());

describe('create', () => {
  it('writes the bill, sums it provisionally and queues the create', async () => {
    const vendorLocalId = await syncedSupplier('Sharma Cement Depot', 'srv-v1');

    const record = await createPurchaseLocally(
      {
        vendorId: vendorLocalId,
        items: [
          { name: 'Cement bag', quantity: 10, price: 380, taxRate: 18 },
          { name: 'Sand load', quantity: 1, price: 4000, taxRate: 5 }
        ],
        vendorBillNumber: 'SCD/778'
      },
      options()
    );

    expect(record.syncState).toBe('pending');
    expect(record.doc?.subtotal).toBe(7800);
    expect(record.doc?.taxTotal).toBe(884);
    expect(record.doc?.total).toBe(8684);
    expect(record.doc?.balanceDue).toBe(8684);
    expect(record.doc?.paymentStatus).toBe('unpaid');
    // The bill number is the server's series; the device does not invent one.
    expect(record.doc?.billNumber).toBeUndefined();

    const [operation] = await queue('purchases', record.localId);
    expect(operation.opType).toBe('create');
    expect(operation.payload?.clientId).toBe(record.localId);
    expect(operation.payload?.vendorId).toBe(vendorLocalId);
  });

  it('names the vendor from the local supplier so the list has something to show', async () => {
    const vendorLocalId = await syncedSupplier('Sharma Cement Depot', 'srv-v1');

    const record = await createPurchaseLocally(
      { vendorId: vendorLocalId, items: [{ name: 'Cement bag', quantity: 1, price: 380 }] },
      options()
    );

    expect(record.doc?.vendorSnapshot).toEqual({ name: 'Sharma Cement Depot', phone: '', gstNumber: '29ABCDE1234F1Z5' });
    expect(await findPurchaseByAnyId(record.localId, txn)).not.toBeNull();
  });

  it('dates a bill that arrives without one', async () => {
    const vendorLocalId = await syncedSupplier('Sharma Cement Depot', 'srv-v1');

    const record = await createPurchaseLocally(
      { vendorId: vendorLocalId, items: [{ name: 'Cement bag', quantity: 1, price: 380 }] },
      options()
    );

    expect(record.doc?.date).toBe(T0);
  });

  it('falls back to the bill-level tax rate for a line that has none', () => {
    expect(provisionalTotals([{ quantity: 2, price: 100 }], 18)).toEqual({
      subtotal: 200,
      taxTotal: 36,
      total: 236
    });
    expect(provisionalTotals([])).toEqual({ subtotal: 0, taxTotal: 0, total: 0 });
  });
});

describe('queueing behind what the bill names', () => {
  it('waits for the supplier it was received against', async () => {
    const supplier = await createSupplierLocally({ name: 'New Depot' }, options());
    const [supplierCreate] = await queue('suppliers', supplier.localId);

    const bill = await createPurchaseLocally(
      { vendorId: supplier.localId, items: [{ name: 'Cement bag', quantity: 1, price: 380 }] },
      options()
    );

    const [billCreate] = await queue('purchases', bill.localId);
    expect(billCreate.dependsOn).toEqual([supplierCreate.opId]);
  });

  it('waits for the products its lines name as well', async () => {
    const supplier = await createSupplierLocally({ name: 'New Depot' }, options());
    const product = await createProductLocally({ name: 'Cement bag', price: 380 }, options());
    const [supplierCreate] = await queue('suppliers', supplier.localId);
    const [productCreate] = await queue('products', product.localId);

    const bill = await createPurchaseLocally(
      {
        vendorId: supplier.localId,
        items: [
          { productId: product.localId, name: 'Cement bag', quantity: 10, price: 380 },
          { name: 'Loose sand', quantity: 1, price: 900 }
        ]
      },
      options()
    );

    const [billCreate] = await queue('purchases', bill.localId);
    expect(billCreate.dependsOn.sort()).toEqual([supplierCreate.opId, productCreate.opId].sort());
  });

  it('queues nothing extra for records the server already has', async () => {
    const vendorLocalId = await syncedSupplier('Sharma Cement Depot', 'srv-v1');

    const bill = await createPurchaseLocally(
      { vendorId: vendorLocalId, items: [{ name: 'Cement bag', quantity: 1, price: 380 }] },
      options()
    );

    expect((await queue('purchases', bill.localId))[0].dependsOn).toEqual([]);
  });
});

describe('the list', () => {
  it('shows a bill received offline, newest first', async () => {
    const vendorLocalId = await syncedSupplier('Sharma Cement Depot', 'srv-v1');
    await createPurchaseLocally(
      { vendorId: vendorLocalId, items: [{ name: 'Old', quantity: 1, price: 100 }], date: '2026-07-01T09:00:00.000Z' },
      options()
    );
    await createPurchaseLocally(
      { vendorId: vendorLocalId, items: [{ name: 'New', quantity: 1, price: 200 }], date: '2026-08-01T09:00:00.000Z' },
      options()
    );

    const bills = await localPurchases(BIZ, {}, txn);

    expect(bills.map((bill) => bill.total)).toEqual([200, 100]);
    expect(bills[0]._id).toBeTruthy();
  });

  it('filters by vendor, by status and by what the user typed', async () => {
    const vendorLocalId = await syncedSupplier('Sharma Cement Depot', 'srv-v1');
    const other = await syncedSupplier('City Hardware', 'srv-v2');

    const bill = await createPurchaseLocally(
      { vendorId: vendorLocalId, items: [{ name: 'Cement', quantity: 1, price: 380 }], vendorBillNumber: 'SCD/778' },
      options()
    );
    await createPurchaseLocally({ vendorId: other, items: [{ name: 'Nails', quantity: 1, price: 90 }] }, options());

    // The picker may hold either side of the reference.
    expect(await localPurchases(BIZ, { vendorId: 'srv-v1' }, txn)).toHaveLength(1);
    expect(await localPurchases(BIZ, { vendorId: vendorLocalId }, txn)).toHaveLength(1);
    expect(await localPurchases(BIZ, { search: 'SCD/778' }, txn)).toHaveLength(1);
    expect(await localPurchases(BIZ, { search: 'sharma' }, txn)).toHaveLength(1);
    expect(await localPurchases(BIZ, { status: 'cancelled' }, txn)).toEqual([]);
    expect(await localPurchases(BIZ, { status: 'received' }, txn)).toHaveLength(2);
    expect((await getPurchase(bill.localId, txn))?.doc?.status).toBe('received');
  });
});
