import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getOperation } from '../../db/outbox';
import { openTestDatabase } from '../../db/__tests__/realSqlite';
import { createCustomer } from '../../db/customerRepository';
import { createInvoice } from '../../db/invoiceRepository';
import { createPayment } from '../../db/paymentRepository';
import { createProduct, getProduct } from '../../db/productRepository';
import {
  applyResolution,
  localPatchFor,
  pendingStockDeltas,
  projectStock,
  resolveConflict,
  SERVER_OWNED
} from '../conflictResolver';
import { createQueueManager } from '../queueManager';

const BIZ = 'biz-1';
const T0 = '2026-08-02T10:00:00.000Z';

let raw: DatabaseSync;
let txn: SQLiteDatabase;

const queue = () => createQueueManager({ businessId: BIZ, clock: () => T0, txn });

beforeEach(async () => {
  ({ raw, txn } = await openTestDatabase());
});

afterEach(() => raw.close());

describe('policy', () => {
  it('merges product fields and never takes stock from the client', () => {
    const resolution = resolveConflict({
      entity: 'products',
      server: { _id: 'p1', name: 'Cement', price: 900, stockQuantity: 9, category: 'building' },
      local: { name: 'Cement 50kg', price: 500, stockQuantity: 12 },
      patch: { name: 'Cement 50kg', stockQuantity: 12 }
    });

    expect(resolution.outcome).toBe('merged');
    // The name this device fixed survives; the price it never touched stays the server's;
    // the stock level it merely *observed* is discarded.
    expect(resolution.doc).toMatchObject({ name: 'Cement 50kg', price: 900, stockQuantity: 9 });
    expect(resolution.fields).toEqual(['name']);
    expect(resolution.requeue).toBe(true);
  });

  it('has nothing to push when every local change was server-owned', () => {
    const resolution = resolveConflict({
      entity: 'products',
      server: { _id: 'p1', stockQuantity: 9 },
      local: { stockQuantity: 12 },
      patch: { stockQuantity: 12 }
    });

    expect(resolution.fields).toEqual([]);
    expect(resolution.requeue).toBe(false);
  });

  it('union-merges customer contacts and keeps balances server-owned', () => {
    const resolution = resolveConflict({
      entity: 'customers',
      server: {
        _id: 'c1',
        name: 'Ramesh Traders',
        outstandingDues: 4000,
        contactPersons: [{ name: 'Ramesh', phone: '98765 43210' }]
      },
      local: {},
      patch: {
        email: 'shop@example.com',
        outstandingDues: 0,
        contactPersons: [{ name: 'Sunita', phone: '9000011111' }]
      }
    });

    // Two people adding two contacts must produce two contacts, not one survivor.
    expect(resolution.doc.contactPersons).toHaveLength(2);
    expect(resolution.doc).toMatchObject({ email: 'shop@example.com', outstandingDues: 4000 });
    expect(resolution.fields).toEqual(['email', 'contactPersons']);
  });

  it('deduplicates a contact that both sides added', () => {
    const resolution = resolveConflict({
      entity: 'customers',
      server: { _id: 'c1', contactPersons: [{ name: 'Ramesh', phone: '+91 98765 43210' }] },
      local: {},
      patch: { contactPersons: [{ name: 'Ramesh Kumar', phone: '9876543210' }] }
    });

    expect(resolution.doc.contactPersons).toHaveLength(1);
  });

  it('keeps a draft invoice local and refuses to touch an issued one', () => {
    const draft = resolveConflict({
      entity: 'invoices',
      server: { _id: 'i1', documentStatus: 'draft', total: 100 },
      local: { _id: 'i1', documentStatus: 'draft', total: 250 },
      patch: { total: 250 }
    });
    expect(draft).toMatchObject({ outcome: 'local-wins', requeue: true });
    expect(draft.doc.total).toBe(250);

    const issued = resolveConflict({
      entity: 'invoices',
      server: { _id: 'i1', documentStatus: 'issued', total: 100 },
      local: { _id: 'i1', total: 250 },
      patch: { total: 250 }
    });
    // A GST invoice is a legal instrument. No merge exists; the edit is void.
    expect(issued).toMatchObject({ outcome: 'server-wins', dropLocalEdits: true, requeue: false });
    expect(issued.doc.total).toBe(100);
    expect(issued.reason).toMatch(/immutable/);
  });

  it('never merges a payment or a business setting', () => {
    expect(resolveConflict({ entity: 'payments', server: { _id: 'pay1', amount: 500 }, local: { amount: 900 } })).
      toMatchObject({ outcome: 'server-wins', dropLocalEdits: true });
    expect(resolveConflict({ entity: 'business', server: { _id: 'b1', gstNumber: 'A' }, local: { gstNumber: 'B' } })).
      toMatchObject({ outcome: 'server-wins' });
  });

  it('declares the fields no client may write', () => {
    expect(SERVER_OWNED.products).toContain('stockQuantity');
    expect(SERVER_OWNED.customers).toEqual(expect.arrayContaining(['availableCredit', 'outstandingDues']));
  });
});

describe('local patch', () => {
  it('reads the changed fields from the queue, latest edit winning', async () => {
    const manager = queue();
    const product = await createProduct({ name: 'Cement' }, { businessId: BIZ, txn });

    await manager.enqueue(
      { entityType: 'products', entityLocalId: product.localId, opType: 'update', payload: { price: 400, sku: 'C-1' } },
      { txn }
    );
    await manager.enqueue(
      { entityType: 'products', entityLocalId: product.localId, opType: 'update', payload: { price: 450 } },
      { txn }
    );
    // Neither a create nor an action is a patch.
    await manager.enqueue(
      { entityType: 'products', entityLocalId: product.localId, opType: 'create', payload: { name: 'Ignored' } },
      { txn }
    );

    expect(await localPatchFor(txn, BIZ, 'products', product.localId)).toEqual({ price: 450, sku: 'C-1' });
  });
});

describe('applying a resolution', () => {
  it('stores the merged product as pending, ready to push', async () => {
    const manager = queue();
    const product = await createProduct({ _id: 'p1', name: 'Cement', price: 500 }, { businessId: BIZ, txn });
    await manager.enqueue(
      { entityType: 'products', entityLocalId: product.localId, opType: 'update', payload: { name: 'Cement 50kg' } },
      { txn }
    );

    const applied = await applyResolution(
      txn,
      'products',
      { _id: 'p1', name: 'Cement', price: 900, stockQuantity: 9, version: 4 },
      { businessId: BIZ, now: T0 }
    );

    const record = await getProduct(product.localId, txn);
    expect(applied.outcome).toBe('merged');
    expect(record?.doc).toMatchObject({ name: 'Cement 50kg', price: 900, stockQuantity: 9 });
    // Still differs from the server, so it is queued rather than declared settled.
    expect(record?.syncState).toBe('pending');
    expect(raw.prepare('SELECT price, stock_quantity FROM products').get()).toEqual({
      price: 900,
      stock_quantity: 9
    });
  });

  it('takes the server copy and kills the queued edits when the invoice is issued', async () => {
    const manager = queue();
    const invoice = await createInvoice(
      { _id: 'i1', documentNumber: 'INV/0001', date: T0, total: 250 },
      { businessId: BIZ, txn }
    );
    await manager.enqueue(
      { entityType: 'invoices', entityLocalId: invoice.localId, opType: 'update', payload: { total: 250 }, opId: 'op-edit' },
      { txn }
    );
    // A queued 'cancel' used to be part of this case. The queue now refuses action operations at
    // enqueue time, because sync protocol 1 has no verb for them and the push engine was killing
    // them as `dead` — silently, and cascading onto anything queued behind them. Cancel is an
    // online-only action until the protocol carries actions.

    const applied = await applyResolution(
      txn,
      'invoices',
      { _id: 'i1', documentNumber: 'INV/0001', date: T0, documentStatus: 'issued', total: 100, version: 3 },
      { businessId: BIZ, now: T0 }
    );

    expect(applied.outcome).toBe('server-wins');
    expect((await getOperation('op-edit', txn))?.status).toBe('dead');
    expect(applied.droppedOps).toContain('op-edit');
  });

  it('settles a payment on the server copy without touching the amount received', async () => {
    const manager = queue();
    const payment = await createPayment(
      { _id: 'pay1', amount: 500, reference: 'UPI-1', receivedAt: T0 },
      { businessId: BIZ, txn }
    );
    await manager.enqueue(
      { entityType: 'payments', entityLocalId: payment.localId, opType: 'update', payload: { amount: 900 } },
      { txn }
    );

    await applyResolution(
      txn,
      'payments',
      { _id: 'pay1', amount: 500, reference: 'UPI-1', receivedAt: T0, allocatedAmount: 500, version: 2 },
      { businessId: BIZ, now: T0 }
    );

    const row = raw.prepare('SELECT amount, sync_state FROM payments').get() as Record<string, unknown>;
    expect(row).toEqual({ amount: 500, sync_state: 'synced' });
    expect(payment.syncState).toBe('pending');
  });

  it('merges a customer that exists only under its client id', async () => {
    const customer = await createCustomer({ name: 'Ramesh', phone: '9876543210' }, { businessId: BIZ, txn });

    const applied = await applyResolution(
      txn,
      'customers',
      { _id: 'c-server', clientId: customer.localId, name: 'Ramesh Traders', outstandingDues: 1200, version: 1 },
      { businessId: BIZ, now: T0 }
    );

    expect(applied.localId).toBe(customer.localId);
    expect(raw.prepare('SELECT COUNT(*) AS n FROM customers').get()).toEqual({ n: 1 });
  });
});

describe('inventory', () => {
  it('projects a provisional level from deltas, never from a pushed level', () => {
    expect(projectStock(12, [-3, -2])).toBe(7);
    expect(projectStock(12, [])).toBe(12);
    // Negative stock is permitted: it is a real business event, not an error to hide.
    expect(projectStock(1, [-4])).toBe(-3);
  });

  it('reads pending movements out of the queue', async () => {
    const manager = queue();
    await manager.enqueue(
      {
        entityType: 'invoices',
        entityLocalId: 'inv-local-1',
        opType: 'create',
        payload: { items: [{ productId: 'p1', quantity: 3 }, { productId: 'p2', quantity: 1 }] }
      },
      { txn }
    );
    // Inserted directly, not enqueued: the queue refuses action operations while protocol 1 has no
    // verb for them, but the projection still has to read one correctly for the day it does.
    raw
      .prepare(
        `INSERT INTO outbox (op_id, business_id, entity_type, entity_local_id, op_type, action_name,
                             payload, depends_on, priority, status, created_at, updated_at)
         VALUES ('op-adjust', ?, 'products', 'prod-local-1', 'action', 'adjust_stock', ?, '[]', 3, 'pending', ?, ?)`
      )
      .run(BIZ, JSON.stringify({ productId: 'p1', delta: -2, reason: 'damaged' }), T0, T0);

    const deltas = await pendingStockDeltas(txn, BIZ, 'p1');

    expect(deltas.sort()).toEqual([-3, -2].sort());
    expect(projectStock(12, deltas)).toBe(7);
    expect(await pendingStockDeltas(txn, BIZ, 'p3')).toEqual([]);
  });

  it('stops counting a movement once the server has accepted it', async () => {
    const manager = queue();
    const operation = await manager.enqueue(
      {
        entityType: 'invoices',
        entityLocalId: 'inv-local-1',
        opType: 'create',
        payload: { items: [{ productId: 'p1', quantity: 3 }] }
      },
      { txn }
    );

    await manager.settle({ opId: operation.opId, outcome: 'done' }, { txn });
    // The level the server reports now includes it; counting it twice would double the sale.
    expect(await pendingStockDeltas(txn, BIZ, 'p1')).toEqual([]);
  });
});
