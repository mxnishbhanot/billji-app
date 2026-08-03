import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { listOperations } from '../../db/outbox';
import { createProductLocally } from '../../db/productWrites';
import { getPurchase } from '../../db/purchaseRepository';
import { createPurchaseLocally } from '../../db/purchaseWrites';
import { localPurchases } from '../../db/readModel';
import { createSupplierLocally } from '../../db/supplierWrites';
import { openTestDatabase } from '../../db/__tests__/realSqlite';
import { pendingStockDeltas, projectStock, resolveConflict } from '../conflictResolver';
import { mergeRecord } from '../pullEngine';
import { createPushEngine, toWireOperation, type PushResponse, type PushTransport, type WireOperation } from '../pushEngine';

/**
 * The offline purchase lifecycle. A bill is the first record in this app that names *other*
 * records the device may also have just created, so most of what is asserted here is about
 * that: the order things are sent in, and the ids they carry when they are.
 */

const BIZ = 'biz-1';
const T0 = '2026-08-02T10:00:00.000Z';

let raw: DatabaseSync;
let txn: SQLiteDatabase;

const options = () => ({ businessId: BIZ, txn, now: T0 });

const opsFor = (entityType: string, entityLocalId?: string) =>
  listOperations({ businessId: BIZ, entityType, entityLocalId, txn });

const engine = (transport: PushTransport) =>
  createPushEngine({ businessId: BIZ, transport, txn, clock: () => T0 });

/** Accepts everything, handing back a server id derived from the entity it was sent as. */
const acceptAll = (ids: Record<string, string>, seen?: WireOperation[]): PushTransport => async (body) => {
  seen?.push(...body.ops);
  return {
    results: body.ops.map((op) => ({ opId: op.opId, status: 'ok' as const, serverId: ids[op.entity], version: 1 }))
  };
};

const syncedSupplier = async (name: string, serverId: string) => {
  const record = await createSupplierLocally({ name }, options());
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

describe('pushing a bill written offline', () => {
  it('sends it as a purchase', async () => {
    const vendorLocalId = await syncedSupplier('Sharma Cement Depot', 'srv-v1');
    const bill = await createPurchaseLocally(
      { vendorId: vendorLocalId, items: [{ name: 'Cement bag', quantity: 1, price: 380 }] },
      options()
    );

    expect(toWireOperation((await opsFor('purchases', bill.localId))[0])?.entity).toBe('purchase');
  });

  it('drains a create and leaves the bill synced under its server id', async () => {
    const vendorLocalId = await syncedSupplier('Sharma Cement Depot', 'srv-v1');
    const bill = await createPurchaseLocally(
      { vendorId: vendorLocalId, items: [{ name: 'Cement bag', quantity: 10, price: 380, taxRate: 18 }] },
      options()
    );

    const outcome = await engine(acceptAll({ purchase: 'srv-b1' })).push();

    expect(outcome.done).toBe(1);
    const stored = await getPurchase(bill.localId, txn);
    expect(stored?.serverId).toBe('srv-b1');
    expect(stored?.syncState).toBe('synced');
    expect((await localPurchases(BIZ, {}, txn))[0]._id).toBe('srv-b1');
  });

  it('creates the supplier first and sends the bill with the id it earned', async () => {
    const supplier = await createSupplierLocally({ name: 'New Depot' }, options());
    const bill = await createPurchaseLocally(
      { vendorId: supplier.localId, items: [{ name: 'Cement bag', quantity: 1, price: 380 }] },
      options()
    );

    const seen: WireOperation[] = [];
    await engine(acceptAll({ vendor: 'srv-v9', purchase: 'srv-b9' }, seen)).push();

    expect(seen.map((op) => op.entity)).toEqual(['vendor', 'purchase']);
    // The local id it was queued with has become the id the server knows.
    expect(seen[1].payload?.vendorId).toBe('srv-v9');
    expect((await getPurchase(bill.localId, txn))?.syncState).toBe('synced');
  });

  it('rewrites the product ids its lines carry, and drops one that never synced', async () => {
    const vendorLocalId = await syncedSupplier('Sharma Cement Depot', 'srv-v1');
    const product = await createProductLocally({ name: 'Cement bag', price: 380 }, options());
    const ghost = await createProductLocally({ name: 'Never sent', price: 10 }, options());
    // The second product's create is abandoned, so its line can only be a custom item.
    raw.prepare(`UPDATE outbox SET status = 'dead' WHERE entity_local_id = ?`).run(ghost.localId);

    await createPurchaseLocally(
      {
        vendorId: vendorLocalId,
        items: [
          { productId: product.localId, name: 'Cement bag', quantity: 10, price: 380 },
          { productId: ghost.localId, name: 'Never sent', quantity: 1, price: 10 }
        ]
      },
      options()
    );

    const seen: WireOperation[] = [];
    await engine(acceptAll({ product: 'srv-p1', purchase: 'srv-b1' }, seen)).push();

    const sentBill = seen.find((op) => op.entity === 'purchase');
    const items = sentBill?.payload?.items as { productId?: string }[];
    expect(items[0].productId).toBe('srv-p1');
    // A device id would fail the server's ObjectId check and kill the whole bill.
    expect(items[1].productId).toBeUndefined();
  });

  it('keeps the bill and the queued work when the push fails', async () => {
    const vendorLocalId = await syncedSupplier('Sharma Cement Depot', 'srv-v1');
    const bill = await createPurchaseLocally(
      { vendorId: vendorLocalId, items: [{ name: 'Cement bag', quantity: 10, price: 380 }] },
      options()
    );

    const outcome = await engine(async () => {
      throw new Error('Network request failed');
    }).push();

    expect(outcome.retried).toBe(1);
    expect((await localPurchases(BIZ, {}, txn))[0].total).toBe(3800);
    expect((await opsFor('purchases', bill.localId))[0].status).toBe('pending');
  });

  it('abandons the bill with the supplier it could never be filed against', async () => {
    const supplier = await createSupplierLocally({ name: 'Rejected Depot' }, options());
    const bill = await createPurchaseLocally(
      { vendorId: supplier.localId, items: [{ name: 'Cement bag', quantity: 1, price: 380 }] },
      options()
    );

    await engine(async (body): Promise<PushResponse> => ({
      results: body.ops.map((op) => ({ opId: op.opId, status: 'rejected' as const, statusCode: 422, message: 'Invalid vendor' }))
    })).push();

    // The bill depended on the supplier's create, so it dies with it rather than being sent
    // against a vendor that does not exist.
    expect((await opsFor('purchases', bill.localId))[0].status).toBe('dead');
  });
});

describe('stock while a bill waits', () => {
  it('projects goods received but not yet pushed', async () => {
    const vendorLocalId = await syncedSupplier('Sharma Cement Depot', 'srv-v1');
    await createPurchaseLocally(
      { vendorId: vendorLocalId, items: [{ productId: 'srv-p1', name: 'Cement bag', quantity: 10, price: 380 }] },
      options()
    );

    const deltas = await pendingStockDeltas(txn, BIZ, 'srv-p1');

    expect(deltas).toEqual([10]);
    expect(projectStock(4, deltas)).toBe(14);
  });

  it('stops counting them once the server has the bill', async () => {
    const vendorLocalId = await syncedSupplier('Sharma Cement Depot', 'srv-v1');
    await createPurchaseLocally(
      { vendorId: vendorLocalId, items: [{ productId: 'srv-p1', name: 'Cement bag', quantity: 10, price: 380 }] },
      options()
    );

    await engine(acceptAll({ purchase: 'srv-b1' })).push();

    expect(await pendingStockDeltas(txn, BIZ, 'srv-p1')).toEqual([]);
  });
});

describe('what the server owns', () => {
  it('never pushes a number the server derives', () => {
    const resolution = resolveConflict({
      entity: 'purchases',
      server: { _id: 'srv-b1', billNumber: 'PUR-0007', total: 4484, paidAmount: 4484, paymentStatus: 'paid' },
      local: null,
      patch: { total: 3800, paymentStatus: 'unpaid', notes: 'Short delivery' }
    });

    expect(resolution.doc.total).toBe(4484);
    expect(resolution.doc.paymentStatus).toBe('paid');
    expect(resolution.doc.billNumber).toBe('PUR-0007');
    // Only the field the device genuinely owns survives.
    expect(resolution.fields).toEqual(['notes']);
  });

  it('takes the server figures on the pull that follows the push', async () => {
    const vendorLocalId = await syncedSupplier('Sharma Cement Depot', 'srv-v1');
    const bill = await createPurchaseLocally(
      { vendorId: vendorLocalId, items: [{ name: 'Cement bag', quantity: 10, price: 380, taxRate: 18 }] },
      options()
    );
    await engine(acceptAll({ purchase: 'srv-b1' })).push();

    const outcome = await mergeRecord(
      txn,
      'purchases',
      {
        _id: 'srv-b1',
        clientId: bill.localId,
        billNumber: 'PUR-0007',
        vendor: 'srv-v1',
        vendorSnapshot: { name: 'Sharma Cement Depot' },
        date: T0,
        items: [{ name: 'Cement bag', quantity: 10, price: 380, taxRate: 18 }],
        subtotal: 3800,
        taxTotal: 684,
        cgstTotal: 342,
        sgstTotal: 342,
        total: 4484,
        paidAmount: 0,
        balanceDue: 4484,
        status: 'received',
        paymentStatus: 'unpaid',
        version: 2
      },
      { businessId: BIZ, now: T0 }
    );

    expect(outcome).toBe('updated');
    const stored = await getPurchase(bill.localId, txn);
    expect(stored?.syncState).toBe('synced');
    // The device's provisional sum is replaced by the server's GST-split arithmetic.
    expect(stored?.doc?.billNumber).toBe('PUR-0007');
    expect(stored?.doc?.cgstTotal).toBe(342);
    expect((await localPurchases(BIZ, { search: 'PUR-0007' }, txn))).toHaveLength(1);
  });
});
