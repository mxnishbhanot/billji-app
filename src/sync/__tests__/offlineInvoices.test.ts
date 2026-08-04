import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { createCustomerLocally } from '../../db/customerWrites';
import { getInvoice } from '../../db/invoiceRepository';
import { readSequence, saveDeviceSeries } from '../../db/invoiceNumbering';
import { createInvoiceLocally } from '../../db/invoiceWrites';
import { listOperations } from '../../db/outbox';
import { createProductLocally } from '../../db/productWrites';
import { localInvoicePage, localProductPage } from '../../db/readModel';
import { openTestDatabase } from '../../db/__tests__/realSqlite';
import { pendingStockDeltas, projectStock, resolveConflict } from '../conflictResolver';
import { mergeRecord } from '../pullEngine';
import { createPushEngine, toWireOperation, type PushResponse, type PushTransport, type WireOperation } from '../pushEngine';

/**
 * Billing with no signal, end to end: the number the customer is handed, the stock it
 * consumes, the queue it waits in, what the server is sent, and what happens when the server
 * disagrees.
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

const acceptAll = (ids: Record<string, string>, seen?: WireOperation[]): PushTransport => async (body) => {
  seen?.push(...body.ops);
  return {
    results: body.ops.map((op) => ({ opId: op.opId, status: 'ok' as const, serverId: ids[op.entity], version: 1 }))
  };
};

/** A record the server already knows about: synced row, nothing left in the queue. */
const markSynced = (table: string, localId: string, serverId: string) => {
  raw
    .prepare(`UPDATE ${table} SET server_id = ?, version = 1, sync_state = 'synced' WHERE local_id = ?`)
    .run(serverId, localId);
  raw.prepare(`UPDATE outbox SET status = 'done' WHERE entity_local_id = ?`).run(localId);
};

const syncedCustomer = async (name: string, serverId: string) => {
  const record = await createCustomerLocally({ name, phone: '9876543210' }, options());
  markSynced('customers', record.localId, serverId);
  return record.localId;
};

const syncedProduct = async (
  doc: { name: string; price: number; stockQuantity?: number; taxRate?: number; trackStock?: boolean },
  serverId: string
) => {
  const record = await createProductLocally(doc, options());
  markSynced('products', record.localId, serverId);
  return record.localId;
};

beforeEach(async () => {
  ({ raw, txn } = await openTestDatabase());
  await saveDeviceSeries({ deviceId: 'dev-1', deviceIndex: 2, prefix: 'INV', documentType: 'invoice' }, options());
});

afterEach(() => raw.close());

describe('issuing an invoice offline', () => {
  it('numbers it from this device series and shows it immediately', async () => {
    const customerLocalId = await syncedCustomer('Ramesh Kumar', 'srv-c1');
    await syncedProduct({ name: 'Cement bag', price: 380, stockQuantity: 40, taxRate: 18 }, 'srv-p1');

    const { record } = await createInvoiceLocally(
      {
        customerId: customerLocalId,
        items: [{ productId: 'srv-p1', quantity: 10 }],
        discountType: 'flat',
        discountValue: 0
      },
      options()
    );

    expect(record.doc?.documentNumber).toBe('INV-2627-D2-0001');
    // The legacy field too: it has its own unique index server-side.
    expect(record.doc?.invoiceNumber).toBe('INV-2627-D2-0001');
    expect(record.syncState).toBe('pending');
    // 3800 + 18% GST, as this device can compute it.
    expect(record.doc?.total).toBe(4484);
    const page = await localInvoicePage(BIZ, {}, txn);
    expect(page.invoices).toHaveLength(1);
    expect(page.invoices[0].customerSnapshot?.name).toBe('Ramesh Kumar');
  });

  it('writes the document and its queued push together, or neither', async () => {
    const customerLocalId = await syncedCustomer('Ramesh Kumar', 'srv-c1');

    await expect(
      // No lines: the write must fail whole, taking the number with it.
      createInvoiceLocally({ customerId: customerLocalId, items: [] }, options())
    ).rejects.toThrow(/at least one item/);

    expect((await localInvoicePage(BIZ, {}, txn)).invoices).toHaveLength(0);
    expect(await opsFor('invoices')).toHaveLength(0);
    // A consumed number with no invoice against it is a gap the business must explain.
    expect(await readSequence('invoice', '2026-27', txn)).toBe(0);
  });

  it('copies the customer into the document so it renders with no join', async () => {
    const customerLocalId = await syncedCustomer('Ramesh Kumar', 'srv-c1');

    const { record } = await createInvoiceLocally(
      { customerId: customerLocalId, items: [{ name: 'Loose cement', quantity: 1, price: 400 }] },
      options()
    );

    expect(record.doc?.customerSnapshot?.name).toBe('Ramesh Kumar');
    // A line typed at the counter is a custom item and names no product.
    expect((record.doc?.items as { isCustom?: boolean; productId?: string }[])[0]).toMatchObject({ isCustom: true });
    expect((record.doc?.items as { productId?: string }[])[0].productId).toBeUndefined();
  });

  it('refuses a customer this device does not hold', async () => {
    await expect(
      createInvoiceLocally({ customerId: 'srv-unknown', items: [{ name: 'x', quantity: 1, price: 1 }] }, options())
    ).rejects.toThrow(/not held on this device/);
  });
});

describe('stock', () => {
  it('projects the sale against the level the server last confirmed', async () => {
    const customerLocalId = await syncedCustomer('Ramesh Kumar', 'srv-c1');
    await syncedProduct({ name: 'Cement bag', price: 380, stockQuantity: 40 }, 'srv-p1');

    await createInvoiceLocally(
      { customerId: customerLocalId, items: [{ productId: 'srv-p1', quantity: 10 }] },
      options()
    );

    const deltas = await pendingStockDeltas(txn, BIZ, 'srv-p1');
    expect(deltas).toEqual([-10]);
    expect(projectStock(40, deltas)).toBe(30);
    // And the billing screen reads the projection, not the stale confirmed level.
    expect((await localProductPage(BIZ, {}, txn)).products[0].stockQuantity).toBe(30);
  });

  it('asks before overselling, with the same shortfall the server would report', async () => {
    const customerLocalId = await syncedCustomer('Ramesh Kumar', 'srv-c1');
    await syncedProduct({ name: 'Cement bag', price: 380, stockQuantity: 2 }, 'srv-p1');

    const attempt = createInvoiceLocally(
      { customerId: customerLocalId, items: [{ productId: 'srv-p1', quantity: 5 }] },
      options()
    );

    // The screen shows the same confirmation it shows online, from the same details shape.
    await expect(attempt).rejects.toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      details: {
        code: 'INSUFFICIENT_STOCK',
        items: [{ name: 'Cement bag', requested: 5, available: 2, shortfall: 3 }]
      }
    });
    // Nothing was written, and no number in the series was consumed.
    expect((await localInvoicePage(BIZ, {}, txn)).invoices).toHaveLength(0);
    expect(await readSequence('invoice', '2026-27', txn)).toBe(0);
  });

  it('issues the bill once the force sale is confirmed', async () => {
    const customerLocalId = await syncedCustomer('Ramesh Kumar', 'srv-c1');
    await syncedProduct({ name: 'Cement bag', price: 380, stockQuantity: 2 }, 'srv-p1');

    const { record, warnings } = await createInvoiceLocally(
      { customerId: customerLocalId, items: [{ productId: 'srv-p1', quantity: 5 }] },
      { ...options(), allowOversell: true }
    );

    // The goods left the shop. Refusing the bill would not bring them back.
    expect(record.doc?.documentNumber).toBe('INV-2627-D2-0001');
    expect(warnings).toEqual([
      { productId: 'srv-p1', name: 'Cement bag', requested: 5, available: 2, shortfall: 3 }
    ]);
    // The server rejects a short sale unless told the goods have already gone.
    expect(record.doc?.allowOversell).toBe(true);
  });

  it('counts stock the earlier queued invoice already took', async () => {
    const customerLocalId = await syncedCustomer('Ramesh Kumar', 'srv-c1');
    await syncedProduct({ name: 'Cement bag', price: 380, stockQuantity: 6 }, 'srv-p1');

    await createInvoiceLocally({ customerId: customerLocalId, items: [{ productId: 'srv-p1', quantity: 4 }] }, options());
    const { warnings } = await createInvoiceLocally(
      { customerId: customerLocalId, items: [{ productId: 'srv-p1', quantity: 3 }] },
      { ...options(), allowOversell: true }
    );

    expect(warnings[0]).toMatchObject({ available: 2, shortfall: 1 });
  });

  it('leaves an untracked product out of the projection entirely', async () => {
    const customerLocalId = await syncedCustomer('Ramesh Kumar', 'srv-c1');
    await syncedProduct({ name: 'Labour', price: 500, stockQuantity: 0, trackStock: false }, 'srv-p9');

    const { warnings } = await createInvoiceLocally(
      { customerId: customerLocalId, items: [{ productId: 'srv-p9', quantity: 3 }] },
      options()
    );

    expect(warnings).toEqual([]);
  });

  it('stops counting the sale once the server has the invoice', async () => {
    const customerLocalId = await syncedCustomer('Ramesh Kumar', 'srv-c1');
    await syncedProduct({ name: 'Cement bag', price: 380, stockQuantity: 40 }, 'srv-p1');
    await createInvoiceLocally({ customerId: customerLocalId, items: [{ productId: 'srv-p1', quantity: 10 }] }, options());

    await engine(acceptAll({ invoice: 'srv-i1' })).push();

    expect(await pendingStockDeltas(txn, BIZ, 'srv-p1')).toEqual([]);
    expect((await localProductPage(BIZ, {}, txn)).products[0].stockQuantity).toBe(40);
  });
});

describe('the queue', () => {
  it('sends it as an invoice and leaves the row synced under its server id', async () => {
    const customerLocalId = await syncedCustomer('Ramesh Kumar', 'srv-c1');
    const { record } = await createInvoiceLocally(
      { customerId: customerLocalId, items: [{ name: 'Loose cement', quantity: 1, price: 400 }] },
      options()
    );

    expect(toWireOperation((await opsFor('invoices', record.localId))[0])?.entity).toBe('invoice');

    const outcome = await engine(acceptAll({ invoice: 'srv-i1' })).push();

    expect(outcome.done).toBe(1);
    const stored = await getInvoice(record.localId, txn);
    expect(stored?.serverId).toBe('srv-i1');
    expect(stored?.syncState).toBe('synced');
  });

  it('creates the customer first and sends the invoice with the id it earned', async () => {
    const customer = await createCustomerLocally({ name: 'New walk-in', phone: '9000000000' }, options());
    const product = await createProductLocally({ name: 'Cement bag', price: 380, stockQuantity: 5 }, options());

    const { record } = await createInvoiceLocally(
      { customerId: customer.localId, items: [{ productId: product.localId, quantity: 1 }] },
      options()
    );

    const seen: WireOperation[] = [];
    await engine(acceptAll({ customer: 'srv-c9', product: 'srv-p9', invoice: 'srv-i9' }, seen)).push();

    // Masters before the document that names them — never the other way round.
    expect(seen.map((op) => op.entity)).toEqual(['customer', 'product', 'invoice']);
    const sent = seen[2].payload as { customerId?: string; items?: { productId?: string }[] };
    expect(sent.customerId).toBe('srv-c9');
    expect(sent.items?.[0].productId).toBe('srv-p9');
    expect((await getInvoice(record.localId, txn))?.syncState).toBe('synced');
  });

  it('keeps the invoice and its queued push when the network fails', async () => {
    const customerLocalId = await syncedCustomer('Ramesh Kumar', 'srv-c1');
    const { record } = await createInvoiceLocally(
      { customerId: customerLocalId, items: [{ name: 'Loose cement', quantity: 2, price: 400 }] },
      options()
    );

    const outcome = await engine(async () => {
      throw new Error('Network request failed');
    }).push();

    expect(outcome.retried).toBe(1);
    expect((await localInvoicePage(BIZ, {}, txn)).invoices[0].total).toBe(800);
    expect((await opsFor('invoices', record.localId))[0].status).toBe('pending');
  });

  it('holds a duplicate number as a conflict for a person rather than renumbering', async () => {
    const customerLocalId = await syncedCustomer('Ramesh Kumar', 'srv-c1');
    const { record } = await createInvoiceLocally(
      { customerId: customerLocalId, items: [{ name: 'Loose cement', quantity: 1, price: 400 }] },
      options()
    );

    await engine(async (body): Promise<PushResponse> => ({
      results: body.ops.map((op) => ({
        opId: op.opId,
        status: 'conflict' as const,
        statusCode: 409,
        code: 'DOCUMENT_NUMBER_DUPLICATE',
        message: 'Document number has already been issued in this series'
      }))
    })).push();

    // An issued number is on the customer's copy: it is never silently changed, and the
    // document is not thrown away either.
    expect((await opsFor('invoices', record.localId))[0].status).toBe('conflict');
    expect((await getInvoice(record.localId, txn))?.syncState).toBe('conflict');
    expect((await getInvoice(record.localId, txn))?.doc?.documentNumber).toBe('INV-2627-D2-0001');
  });

  it('abandons a rejected invoice on the Failed Operations screen', async () => {
    const customerLocalId = await syncedCustomer('Ramesh Kumar', 'srv-c1');
    const { record } = await createInvoiceLocally(
      { customerId: customerLocalId, items: [{ name: 'Loose cement', quantity: 1, price: 400 }] },
      options()
    );

    await engine(async (body): Promise<PushResponse> => ({
      results: body.ops.map((op) => ({
        opId: op.opId,
        status: 'rejected' as const,
        statusCode: 422,
        code: 'DOCUMENT_NUMBER_OUT_OF_SERIES',
        message: 'Document number does not belong to this device series'
      }))
    })).push();

    const operation = (await opsFor('invoices', record.localId))[0];
    expect(operation.status).toBe('dead');
    expect(operation.lastError).toMatch(/422/);
    // The user's work is still on the device, visible, not vanished.
    expect((await localInvoicePage(BIZ, {}, txn)).invoices).toHaveLength(1);
  });
});

describe('what the server owns', () => {
  it('never lets a local edit rewrite an issued document', () => {
    const resolution = resolveConflict({
      entity: 'invoices',
      server: { _id: 'srv-i1', documentStatus: 'issued', documentNumber: 'INV-2627-D2-0001', total: 4484 },
      local: null,
      patch: { total: 3800, notes: 'Customer disputed the rate' }
    });

    // An issued invoice may already be printed, sent and filed against. Corrections are a
    // cancellation or a credit note, not a field write.
    expect(resolution.outcome).toBe('server-wins');
    expect(resolution.doc.total).toBe(4484);
    expect(resolution.dropLocalEdits).toBe(true);
  });

  it('takes the server figures on the pull that follows the push', async () => {
    const customerLocalId = await syncedCustomer('Ramesh Kumar', 'srv-c1');
    await syncedProduct({ name: 'Cement bag', price: 380, stockQuantity: 40, taxRate: 18 }, 'srv-p1');
    const { record } = await createInvoiceLocally(
      { customerId: customerLocalId, items: [{ productId: 'srv-p1', quantity: 10 }] },
      options()
    );
    await engine(acceptAll({ invoice: 'srv-i1' })).push();

    const outcome = await mergeRecord(
      txn,
      'invoices',
      {
        _id: 'srv-i1',
        clientId: record.localId,
        documentNumber: 'INV-2627-D2-0001',
        invoiceNumber: 'INV-2627-D2-0001',
        documentType: 'invoice',
        customer: 'srv-c1',
        customerSnapshot: { name: 'Ramesh Kumar' },
        date: T0,
        items: [{ name: 'Cement bag', quantity: 10, price: 380, taxRate: 18 }],
        subtotal: 3800,
        tax: { rate: 18, amount: 684 },
        // The server's arithmetic, including the CGST/SGST split the device cannot do.
        taxSummary: [{ rate: 18, taxable: 3800, cgst: 342, sgst: 342, igst: 0 }],
        total: 4484,
        paidAmount: 0,
        balanceDue: 4484,
        documentStatus: 'issued',
        paymentStatus: 'unpaid',
        version: 2
      },
      { businessId: BIZ, now: T0 }
    );

    expect(outcome).toBe('updated');
    const stored = await getInvoice(record.localId, txn);
    expect(stored?.syncState).toBe('synced');
    expect(stored?.doc?.taxSummary).toBeDefined();
    // The number the customer holds survived the round trip unchanged.
    expect(stored?.doc?.documentNumber).toBe('INV-2627-D2-0001');
  });
});
