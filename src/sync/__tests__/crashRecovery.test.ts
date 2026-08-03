import { createCustomerLocally } from '../../db/customerWrites';
import { readSequence } from '../../db/invoiceNumbering';
import { createInvoiceLocally } from '../../db/invoiceWrites';
import { claimOperations, listOperations } from '../../db/outbox';
import { recordInvoicePaymentLocally } from '../../db/paymentWrites';
import { createProductLocally } from '../../db/productWrites';
import { localInvoicePage, localProductPage } from '../../db/readModel';
import { createPushEngine } from '../pushEngine';
import { createFakeServer, createTestDevice, type FakeServer, type TestDevice } from './fakeServer';

/**
 * The app is killed. By the OS, by a swipe-up, by a battery at zero — always at the worst
 * moment, which is somewhere in the middle of a sync.
 *
 * The promise these tests hold: a kill costs at most one in-flight batch, never a write and
 * never a duplicate. Two mechanisms carry it — the local row and its outbox operation are
 * written in one transaction, and `clientId` makes a resent create idempotent — so the
 * assertions are always the same pair: the work is still there, and it happened once.
 */

const BIZ = 'biz-1';

let server: FakeServer;
let device: TestDevice;

const shop = async ({ stock = 20, price = 500 } = {}) => {
  const customer = await createCustomerLocally({ name: 'Ramesh Kumar', phone: '9876543210' }, device.options());
  const product = await createProductLocally({ name: 'Cement bag', price, stockQuantity: stock }, device.options());
  return { customerLocalId: customer.localId, productLocalId: product.localId };
};

const bill = async (customerId: string, productId: string, quantity = 1) => {
  const { record } = await createInvoiceLocally({ customerId, items: [{ productId, quantity }] }, device.options());
  return record;
};

/** A relaunch: same database file, a brand new engine holding no memory of the last pass. */
const relaunch = () =>
  createPushEngine({ businessId: BIZ, deviceId: device.deviceId, txn: device.txn, clock: device.clock, transport: server.push });

const statuses = async () =>
  (await listOperations({ businessId: BIZ, txn: device.txn })).map((operation) => `${operation.entityType}:${operation.status}`);

beforeEach(async () => {
  server = createFakeServer();
  device = await createTestDevice({ server, businessId: BIZ });
});

afterEach(() => device.close());

describe('a queue left inflight', () => {
  it('is released at the next launch and sent once', async () => {
    const { customerLocalId, productLocalId } = await shop();
    await bill(customerLocalId, productLocalId);

    // Claimed, then the process died before any of it was settled. The invoice is not among
    // them: it waits on the customer and product creates it names.
    const claimed = await claimOperations(BIZ, { txn: device.txn, now: device.clock() });
    expect(claimed.map((operation) => operation.entityType)).toEqual(['customers', 'products']);
    expect(await statuses()).toEqual(['invoices:pending', 'customers:inflight', 'products:inflight']);

    const engine = relaunch();
    expect(await engine.recover()).toBe(2);
    await engine.push();

    expect(await statuses()).toEqual(['invoices:done', 'customers:done', 'products:done']);
    expect(server.count('invoices')).toBe(1);
    expect(server.count('customers')).toBe(1);
  });

  it('clears the backoff so recovered work is not waiting on a timer nobody set', async () => {
    await createCustomerLocally({ name: 'Ravi', phone: '9000000001' }, device.options());
    await claimOperations(BIZ, { txn: device.txn, now: device.clock() });

    await relaunch().recover();

    const [operation] = await listOperations({ businessId: BIZ, txn: device.txn });
    expect(operation).toMatchObject({ status: 'pending', nextAttemptAt: null });
  });

  it('keeps dependency order across the restart', async () => {
    const { customerLocalId, productLocalId } = await shop();
    const invoice = await bill(customerLocalId, productLocalId);
    await recordInvoicePaymentLocally(invoice.localId, { amount: 100, method: 'cash' }, device.options());

    await claimOperations(BIZ, { txn: device.txn, now: device.clock() });
    const engine = relaunch();
    await engine.recover();
    await engine.push();

    // The receipt names a real invoice id, which is only possible if the invoice went first.
    const [receipt] = server.live('payments');
    expect(receipt.invoiceId).toBe(server.live('invoices')[0]._id);
    expect(await statuses()).not.toContain('payments:dead');
  });
});

describe('killed after the server accepted it', () => {
  it('does not create a second record when the acknowledgement never arrived', async () => {
    const { customerLocalId, productLocalId } = await shop();
    const invoice = await bill(customerLocalId, productLocalId);
    const [invoiceOp] = await listOperations({ businessId: BIZ, entityType: 'invoices', txn: device.txn });

    // Applied on the server; the response is lost on the way back, so the device retries.
    server.swallowResultFor(invoiceOp.opId);
    await device.push.push();
    expect((await listOperations({ businessId: BIZ, entityType: 'invoices', txn: device.txn }))[0].status).toBe('pending');

    device.advance(60_000);
    await device.sync();

    // One bill on the server, one bill on the device, and the row knows its server id.
    expect(server.count('invoices')).toBe(1);
    expect((await localInvoicePage(BIZ, {}, device.txn)).invoices).toHaveLength(1);
    const row = device.raw.prepare('SELECT server_id, sync_state FROM invoices WHERE local_id = ?').get(invoice.localId);
    expect(row?.server_id).toBe(server.live('invoices')[0]._id);
    expect(row?.sync_state).toBe('synced');
    // Stock moved once, not twice.
    expect(server.live('products')[0].stockQuantity).toBe(19);
  });

  it('takes the money once when a receipt is resent after a lost response', async () => {
    const { customerLocalId, productLocalId } = await shop({ price: 1000 });
    const invoice = await bill(customerLocalId, productLocalId);
    await device.sync();
    await recordInvoicePaymentLocally(invoice.localId, { amount: 400, method: 'cash' }, device.options());
    const [receiptOp] = await listOperations({ businessId: BIZ, entityType: 'payments', txn: device.txn });

    server.swallowResultFor(receiptOp.opId);
    await device.push.push();
    device.advance(60_000);
    await device.sync();

    expect(server.count('payments')).toBe(1);
    expect(server.live('invoices')[0].paidAmount).toBe(400);
  });
});

describe('killed mid-write', () => {
  it('leaves neither the row nor its queued operation behind', async () => {
    const { customerLocalId, productLocalId } = await shop();
    await device.sync();

    // The same transaction a crash would abandon, abandoned deliberately.
    device.raw.exec('BEGIN');
    await bill(customerLocalId, productLocalId);
    device.raw.exec('ROLLBACK');

    expect((await localInvoicePage(BIZ, {}, device.txn)).invoices).toHaveLength(0);
    expect(await listOperations({ businessId: BIZ, entityType: 'invoices', txn: device.txn })).toHaveLength(0);
    // The number the abandoned bill consumed is released with it, so the series has no hole.
    expect(await readSequence('invoice', '2026-27', device.txn)).toBe(0);

    const next = await bill(customerLocalId, productLocalId);
    expect(next.doc?.documentNumber).toBe('INV-2026-27-0001');
  });
});

describe('killed mid-pull', () => {
  it('resumes each collection from its own stored cursor', async () => {
    // Another device filled the server while this one was away.
    server.seed('products', { name: 'Sand', price: 40, stockQuantity: 100 });
    server.seed('customers', { name: 'Anita', phone: '9000000002' });

    await device.pull.pullCollection('products');
    const productCursor = await device.pull.cursor('products');
    expect(productCursor).not.toBeNull();

    // Killed before customers were ever asked for.
    server.goOffline();
    const interrupted = await device.pull.pull();
    expect(interrupted.hasMore).toBe(true);
    expect(await device.pull.cursor('customers')).toBeNull();

    server.goOnline();
    server.pulls.length = 0;
    await device.pull.pull();

    // Products resume from where they stopped rather than replaying the whole collection.
    expect(server.pulls.find((request) => request.collection === 'products')?.cursor).toBe(productCursor);
    expect((await localProductPage(BIZ, {}, device.txn)).products).toHaveLength(1);
  });

  it('re-applies an interrupted page without duplicating what it already stored', async () => {
    for (let index = 0; index < 5; index += 1) {
      server.seed('products', { name: `Product ${index}`, price: 10 + index, stockQuantity: 5 });
    }

    // A page, then the kill: the cursor is stored with the page, so the next pull resumes.
    await device.pull.pullCollection('products');
    // A second, unnecessary pass over the same records — idempotent by construction.
    await device.pull.resetCursors();
    await device.pull.pullCollection('products');

    expect((await localProductPage(BIZ, {}, device.txn)).products).toHaveLength(5);
  });
});
