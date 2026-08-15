import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { subscribeToChanges, type ChangeEvent } from '../../db/changeBus';
import { createCustomerLocally } from '../../db/customerWrites';
import { saveDeviceSeries } from '../../db/invoiceNumbering';
import { createInvoiceLocally } from '../../db/invoiceWrites';
import { listOperations, retryOperation } from '../../db/outbox';
import { getPayment } from '../../db/paymentRepository';
import { recordCustomerPaymentLocally, recordInvoicePaymentLocally } from '../../db/paymentWrites';
import { createProductLocally } from '../../db/productWrites';
import {
  localCustomerOutstanding,
  localCustomerPage,
  localInvoice,
  localInvoicePage,
  localPayments
} from '../../db/readModel';
import { openTestDatabase } from '../../db/__tests__/realSqlite';
import { resolveConflict } from '../conflictResolver';
import { mergeRecord } from '../pullEngine';
import { createPushEngine, toWireOperation, type PushResponse, type PushTransport, type WireOperation } from '../pushEngine';

/**
 * Taking money with no signal: what the receipt links to, what is still owed once it is
 * counted, what reaches the server, and what happens when the server disagrees.
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

const markSynced = (table: string, localId: string, serverId: string, serverUpdatedAt = T0) => {
  raw
    .prepare(
      `UPDATE ${table} SET server_id = ?, version = 1, sync_state = 'synced', server_updated_at = ?,
         payload = json_set(payload, '$._id', ?) WHERE local_id = ?`
    )
    .run(serverId, serverUpdatedAt, serverId, localId);
  raw.prepare(`UPDATE outbox SET status = 'done' WHERE entity_local_id = ?`).run(localId);
};

/** A customer, a product and one issued bill — the state every payment test starts from. */
const billedCustomer = async ({ quantity = 10, price = 380, sync = true } = {}) => {
  const customer = await createCustomerLocally({ name: 'Ramesh Kumar', phone: '9876543210' }, options());
  const product = await createProductLocally({ name: 'Cement bag', price, stockQuantity: 100 }, options());
  if (sync) {
    markSynced('customers', customer.localId, 'srv-c1');
    markSynced('products', product.localId, 'srv-p1');
  }

  const { record } = await createInvoiceLocally(
    { customerId: customer.localId, items: [{ productId: product.localId, quantity }] },
    options()
  );
  if (sync) markSynced('invoices', record.localId, 'srv-i1');

  return { customerLocalId: customer.localId, invoiceLocalId: record.localId, total: quantity * price };
};

/**
 * The projection only keeps counting an accepted receipt for a week (paymentProjection's
 * CATCH_UP_WINDOW_MS), measured against the wall clock. Every fixture here is stamped T0, so
 * the wall clock is pinned to it too — otherwise the suite quietly starts failing a week
 * after T0 for a reason that has nothing to do with the code under test.
 */
let realNow: jest.SpyInstance;
beforeAll(() => {
  realNow = jest.spyOn(Date, 'now').mockReturnValue(Date.parse(T0));
});
afterAll(() => realNow.mockRestore());

beforeEach(async () => {
  ({ raw, txn } = await openTestDatabase());
  await saveDeviceSeries({ deviceId: 'dev-1', deviceIndex: 2, prefix: 'INV', documentType: 'invoice' }, options());
});

afterEach(() => raw.close());

describe('recording a receipt offline', () => {
  it('links it to the invoice and shows it immediately', async () => {
    const { invoiceLocalId } = await billedCustomer();

    const { record } = await recordInvoicePaymentLocally('srv-i1', { amount: 1000, method: 'cash' }, options());

    expect(record.syncState).toBe('pending');
    expect(record.doc?.amount).toBe(1000);
    // Both sides of the link, so the receipt is found by whichever id the screen holds.
    expect(record.doc?.invoiceLocalId).toBe(invoiceLocalId);
    expect(record.doc?.invoice).toBe('srv-i1');
    expect(await localPayments(BIZ, { invoiceId: 'srv-i1' }, txn)).toHaveLength(1);
    expect(await localPayments(BIZ, { invoiceId: invoiceLocalId }, txn)).toHaveLength(1);
  });

  it('links to a bill that has not synced yet', async () => {
    const { invoiceLocalId } = await billedCustomer({ sync: false });

    const { record } = await recordInvoicePaymentLocally(invoiceLocalId, { amount: 500, method: 'upi' }, options());

    expect(record.doc?.invoiceLocalId).toBe(invoiceLocalId);
    expect(record.doc?.invoice).toBeUndefined();
    // The op names the bill by local id; the push rewrites it once the bill has a real one.
    expect((await opsFor('payments', record.localId))[0].payload?.invoiceId).toBe(invoiceLocalId);
  });

  it('refuses a receipt against a cancelled bill, as the server does', async () => {
    await billedCustomer();
    raw.prepare(`UPDATE invoices SET payload = json_set(payload, '$.documentStatus', 'cancelled')`).run();

    await expect(
      recordInvoicePaymentLocally('srv-i1', { amount: 100, method: 'cash' }, options())
    ).rejects.toMatchObject({ code: 'INVOICE_CANCELLED' });
    expect(await localPayments(BIZ, {}, txn)).toHaveLength(0);
  });

  it('refuses a zero or negative amount', async () => {
    await billedCustomer();

    await expect(
      recordInvoicePaymentLocally('srv-i1', { amount: 0, method: 'cash' }, options())
    ).rejects.toMatchObject({ code: 'PAYMENT_AMOUNT_INVALID' });
  });

  it('accepts more than the bill and parks the excess as credit', async () => {
    const { total } = await billedCustomer({ quantity: 1, price: 400 });

    const { record, unapplied } = await recordInvoicePaymentLocally(
      'srv-i1',
      { amount: total + 600, method: 'cash' },
      options()
    );

    // The cash crossed the counter. Rejecting it would leave ₹600 unaccounted for.
    expect(unapplied).toBe(600);
    expect(record.doc?.allocatedAmount).toBe(total);
    expect(record.doc?.unappliedAmount).toBe(600);
  });
});

describe('outstanding amounts', () => {
  it('shows the bill part-paid the moment the cash is taken', async () => {
    const { invoiceLocalId, total } = await billedCustomer();

    await recordInvoicePaymentLocally('srv-i1', { amount: 1000, method: 'cash' }, options());

    const invoice = await localInvoice(BIZ, invoiceLocalId, txn);
    expect(invoice?.paidAmount).toBe(1000);
    expect(invoice?.balanceDue).toBe(total - 1000);
    expect(invoice?.paymentStatus).toBe('partial');
    // And the list agrees with the detail screen.
    expect((await localInvoicePage(BIZ, {}, txn)).invoices[0].balanceDue).toBe(total - 1000);
  });

  it('marks it paid, and keeps the local figure inside the document total', async () => {
    const { invoiceLocalId, total } = await billedCustomer({ quantity: 1, price: 400 });

    await recordInvoicePaymentLocally('srv-i1', { amount: total + 100, method: 'cash' }, options());

    const invoice = await localInvoice(BIZ, invoiceLocalId, txn);
    expect(invoice?.paidAmount).toBe(total);
    expect(invoice?.balanceDue).toBe(0);
    expect(invoice?.paymentStatus).toBe('paid');
    expect(invoice?.status).toBe('paid');
  });

  it('drops a settled bill out of the customer dues sheet', async () => {
    const { total } = await billedCustomer({ quantity: 1, price: 400 });

    const before = await localCustomerOutstanding(BIZ, 'srv-c1', txn);
    expect(before.totalOutstanding).toBe(total);

    await recordInvoicePaymentLocally('srv-i1', { amount: total, method: 'cash' }, options());

    // Otherwise the same dues are offered for collection twice.
    const after = await localCustomerOutstanding(BIZ, 'srv-c1', txn);
    expect(after.invoices).toHaveLength(0);
    expect(after.totalOutstanding).toBe(0);
  });

  it('takes the collection off the customer’s mirrored dues', async () => {
    await billedCustomer();
    raw.prepare(`UPDATE customers SET payload = json_set(payload, '$.outstandingDues', 3800)`).run();

    await recordInvoicePaymentLocally('srv-i1', { amount: 1000, method: 'cash' }, options());

    const customer = (await localCustomerPage(BIZ, {}, txn)).customers[0];
    expect(customer.outstandingDues).toBe(2800);
  });

  it('keeps counting an accepted receipt until the bill itself catches up', async () => {
    const { invoiceLocalId, total } = await billedCustomer();
    const { record } = await recordInvoicePaymentLocally('srv-i1', { amount: 1000, method: 'cash' }, options());

    // The push landed but the pull that follows it did not: the receipt is synced while the
    // bill on this device still shows the old balance.
    markSynced('payments', record.localId, 'srv-pay1', '2026-08-02T10:05:00.000Z');

    expect((await localInvoice(BIZ, invoiceLocalId, txn))?.balanceDue).toBe(total - 1000);

    // Once the bill arrives carrying the server's figures, the projection stops on its own.
    await mergeRecord(
      txn,
      'invoices',
      {
        _id: 'srv-i1',
        documentNumber: 'INV-2627-D2-0001',
        documentType: 'invoice',
        customer: 'srv-c1',
        customerSnapshot: { name: 'Ramesh Kumar' },
        date: T0,
        items: [{ name: 'Cement bag', quantity: 10, price: 380 }],
        total,
        paidAmount: 1000,
        balanceDue: total - 1000,
        documentStatus: 'issued',
        paymentStatus: 'partial',
        version: 2,
        updatedAt: '2026-08-02T10:06:00.000Z'
      },
      { businessId: BIZ, now: T0 }
    );

    const settled = await localInvoice(BIZ, invoiceLocalId, txn);
    // Counted once, not twice.
    expect(settled?.paidAmount).toBe(1000);
    expect(settled?.balanceDue).toBe(total - 1000);
  });
});

describe('one receipt across several bills', () => {
  const twoBills = async () => {
    const first = await billedCustomer({ quantity: 1, price: 1000 });
    const product = 'srv-p1';
    const { record } = await createInvoiceLocally(
      { customerId: 'srv-c1', items: [{ productId: product, quantity: 1, price: 600 }] },
      options()
    );
    markSynced('invoices', record.localId, 'srv-i2');
    return { firstLocalId: first.invoiceLocalId, secondLocalId: record.localId };
  };

  it('fills the bills in the order offered and parks the remainder', async () => {
    const { firstLocalId, secondLocalId } = await twoBills();

    const { record, unapplied } = await recordCustomerPaymentLocally(
      'srv-c1',
      { amount: 1400, invoiceIds: ['srv-i1', 'srv-i2'], method: 'cash' },
      options()
    );

    expect(record.doc?.provisionalAllocations).toEqual([
      { invoiceLocalId: firstLocalId, invoiceServerId: 'srv-i1', amount: 1000 },
      { invoiceLocalId: secondLocalId, invoiceServerId: 'srv-i2', amount: 400 }
    ]);
    expect(unapplied).toBe(0);

    // Both bills reflect their share, not the whole receipt.
    expect((await localInvoice(BIZ, 'srv-i1', txn))?.paymentStatus).toBe('paid');
    expect((await localInvoice(BIZ, 'srv-i2', txn))?.balanceDue).toBe(200);
  });

  it('announces every bill it settled, so their screens refresh', async () => {
    const { firstLocalId, secondLocalId } = await twoBills();
    const seen: ChangeEvent[] = [];
    const unsubscribe = subscribeToChanges((events) => seen.push(...events));

    try {
      await recordCustomerPaymentLocally(
        'srv-c1',
        { amount: 1400, invoiceIds: ['srv-i1', 'srv-i2'], method: 'cash' },
        options()
      );
    } finally {
      unsubscribe();
    }

    const related = seen.find((change) => change.entity === 'payments')?.related ?? [];
    const invoices = related.filter((relation) => relation.entity === 'invoices').map((relation) => relation.id);
    // The row's own columns name only the last bill; both have to be announced or the first
    // bill's screen keeps showing a balance that has been paid.
    expect(invoices).toEqual(expect.arrayContaining(['srv-i1', 'srv-i2', firstLocalId, secondLocalId]));
  });

  it('refuses an overpayment when the sheet is only collecting dues', async () => {
    await twoBills();

    await expect(
      recordCustomerPaymentLocally(
        'srv-c1',
        { amount: 5000, invoiceIds: ['srv-i1', 'srv-i2'], method: 'cash', allowCredit: false },
        options()
      )
    ).rejects.toMatchObject({ code: 'CREDIT_NOT_ALLOWED' });
  });

  it('rejects duplicate invoice ids that would double-allocate', async () => {
    await twoBills();

    await expect(
      recordCustomerPaymentLocally(
        'srv-c1',
        { amount: 500, invoiceIds: ['srv-i1', 'srv-i1'], method: 'cash' },
        options()
      )
    ).rejects.toMatchObject({ code: 'DUPLICATE_INVOICE_IDS' });
  });

  it('parks the remainder as credit when credit is allowed', async () => {
    await twoBills();

    const { record, unapplied } = await recordCustomerPaymentLocally(
      'srv-c1',
      { amount: 2000, invoiceIds: ['srv-i1', 'srv-i2'], method: 'cash' },
      options()
    );

    expect(unapplied).toBe(400);
    expect(record.doc?.unappliedAmount).toBe(400);
    const customer = (await localCustomerPage(BIZ, {}, txn)).customers[0];
    expect(customer.creditBalance).toBe(400);
  });
});

describe('the queue', () => {
  it('sends a receipt as a payment, and a dues collection as a customer payment', async () => {
    await billedCustomer();
    const single = await recordInvoicePaymentLocally('srv-i1', { amount: 100, method: 'cash' }, options());
    const dues = await recordCustomerPaymentLocally(
      'srv-c1',
      { amount: 200, invoiceIds: ['srv-i1'], method: 'cash' },
      options()
    );

    expect(toWireOperation((await opsFor('payments', single.record.localId))[0])?.entity).toBe('payment');
    // Two entity names because the server's validator chain and controller differ per parent.
    expect(toWireOperation((await opsFor('payments', dues.record.localId))[0])?.entity).toBe('customerPayment');
  });

  it('goes out after the bill it settles, carrying the id that bill earned', async () => {
    const { invoiceLocalId } = await billedCustomer({ sync: false });
    await recordInvoicePaymentLocally(invoiceLocalId, { amount: 500, method: 'cash' }, options());

    const seen: WireOperation[] = [];
    await engine(
      acceptAll({ customer: 'srv-c9', product: 'srv-p9', invoice: 'srv-i9', payment: 'srv-pay9' }, seen)
    ).push();

    expect(seen.map((op) => op.entity)).toEqual(['customer', 'product', 'invoice', 'payment']);
    expect((seen[3].payload as { invoiceId?: string }).invoiceId).toBe('srv-i9');
  });

  it('rewrites every bill named by a dues collection', async () => {
    // Nothing here has ever reached the server: the customer, the bill and the receipt were
    // all created in one offline session.
    const { customerLocalId, invoiceLocalId } = await billedCustomer({ sync: false });

    await recordCustomerPaymentLocally(
      customerLocalId,
      { amount: 100, invoiceIds: [invoiceLocalId], method: 'cash' },
      options()
    );

    const seen: WireOperation[] = [];
    await engine(
      acceptAll({ customer: 'srv-c9', product: 'srv-p9', invoice: 'srv-i9', customerPayment: 'srv-pay9' }, seen)
    ).push();

    const sent = seen.find((op) => op.entity === 'customerPayment');
    expect((sent?.payload as { invoiceIds?: string[] }).invoiceIds).toEqual(['srv-i9']);
    expect((sent?.payload as { customerId?: string }).customerId).toBe('srv-c9');
  });

  it('keeps the receipt when the network fails, and stops projecting once it is accepted', async () => {
    const { invoiceLocalId, total } = await billedCustomer();
    const { record } = await recordInvoicePaymentLocally('srv-i1', { amount: 1000, method: 'cash' }, options());

    const failed = await engine(async () => {
      throw new Error('Network request failed');
    }).push();

    expect(failed.retried).toBe(1);
    expect((await opsFor('payments', record.localId))[0].status).toBe('pending');
    // The money is still visible and still counted while it waits.
    expect((await localInvoice(BIZ, invoiceLocalId, txn))?.balanceDue).toBe(total - 1000);

    // A failed attempt sits out its backoff before it is claimed again; clear the gate so the
    // next pass sends it in this test's frozen clock.
    await retryOperation((await opsFor('payments', record.localId))[0].opId, { txn, now: T0 });
    await engine(acceptAll({ payment: 'srv-pay1' })).push();

    expect((await getPayment(record.localId, txn))?.serverId).toBe('srv-pay1');
    expect((await getPayment(record.localId, txn))?.syncState).toBe('synced');
  });
});

describe('conflict', () => {
  it('holds a receipt the server refused, rather than losing the money', async () => {
    await billedCustomer();
    const { record } = await recordInvoicePaymentLocally('srv-i1', { amount: 1000, method: 'cash' }, options());

    // Another till cancelled the bill while this device was offline.
    await engine(async (body): Promise<PushResponse> => ({
      results: body.ops.map((op) => ({
        opId: op.opId,
        status: 'conflict' as const,
        statusCode: 409,
        message: 'Cannot record payment for a cancelled invoice'
      }))
    })).push();

    const operation = (await opsFor('payments', record.localId))[0];
    expect(operation.status).toBe('conflict');
    expect((await getPayment(record.localId, txn))?.syncState).toBe('conflict');
    // Cash that crossed the counter is never discarded — it waits for a person to decide.
    expect(await localPayments(BIZ, { invoiceId: 'srv-i1' }, txn)).toHaveLength(1);
  });

  it('never merges a local edit into a receipt: the server copy stands', () => {
    const resolution = resolveConflict({
      entity: 'payments',
      server: { _id: 'srv-pay1', amount: 1000, allocatedAmount: 1000, unappliedAmount: 0 },
      local: null,
      patch: { amount: 1200, provisionalAllocations: [{ amount: 1200 }] }
    });

    // A wrong payment is reversed by an action, not edited into a different amount.
    expect(resolution.outcome).toBe('server-wins');
    expect(resolution.doc.amount).toBe(1000);
    expect(resolution.dropLocalEdits).toBe(true);
  });

  it('takes the server’s allocation on the pull that follows the push', async () => {
    const { invoiceLocalId, total } = await billedCustomer();
    const { record } = await recordInvoicePaymentLocally('srv-i1', { amount: 1000, method: 'cash' }, options());
    await engine(acceptAll({ payment: 'srv-pay1' })).push();

    const outcome = await mergeRecord(
      txn,
      'payments',
      {
        _id: 'srv-pay1',
        clientId: record.localId,
        invoice: 'srv-i1',
        salesDocument: 'srv-i1',
        customer: 'srv-c1',
        amount: 1000,
        // The server allocated less than the device assumed: another till got there first.
        allocatedAmount: 400,
        unappliedAmount: 600,
        method: 'cash',
        status: 'completed',
        receivedAt: T0,
        version: 2,
        updatedAt: '2026-08-02T10:07:00.000Z'
      },
      { businessId: BIZ, now: T0 }
    );

    expect(outcome).toBe('updated');
    const stored = await getPayment(record.localId, txn);
    expect(stored?.syncState).toBe('synced');
    expect(stored?.doc?.allocatedAmount).toBe(400);
    // The device's provisional split is gone, so the projection follows the server's numbers.
    expect(stored?.doc?.provisionalAllocations).toBeUndefined();
    expect((await localInvoice(BIZ, invoiceLocalId, txn))?.balanceDue).toBe(total - 400);
  });
});
