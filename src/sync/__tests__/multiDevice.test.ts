import { createCustomerLocally, updateCustomerLocally } from '../../db/customerWrites';
import { createInvoiceLocally } from '../../db/invoiceWrites';
import { listOperations } from '../../db/outbox';
import { recordInvoicePaymentLocally } from '../../db/paymentWrites';
import { createProductLocally, deleteProductLocally, updateProductLocally } from '../../db/productWrites';
import { localCustomerPage, localInvoice, localInvoicePage, localProductPage } from '../../db/readModel';
import { createFakeServer, createTestDevice, type FakeServer, type TestDevice } from './fakeServer';

/**
 * Two tills, one shop, one server.
 *
 * Everything here is a question single-device tests cannot ask: whether two devices billing
 * the same stock produce two legal documents, whether the money one of them collects is
 * still collectable by the other, and whether both arrive at the same books afterwards.
 *
 * Both devices run against the same in-memory server, so an assertion about convergence is
 * an assertion about the real push/pull loop rather than about a stub.
 */

const BIZ = 'biz-1';

let server: FakeServer;
let counter: TestDevice;
let van: TestDevice;

/** The catalogue both devices already hold: created on one, pulled by the other. */
const sharedCatalogue = async ({ stock = 10, price = 100 } = {}) => {
  const customer = await createCustomerLocally({ name: 'Ramesh Kumar', phone: '9876543210' }, counter.options());
  const product = await createProductLocally({ name: 'Cement bag', price, stockQuantity: stock }, counter.options());
  await counter.sync();
  await van.sync();
  return { customerLocalId: customer.localId, productLocalId: product.localId };
};

const billOn = async (device: TestDevice, { productId, quantity = 1, customerId }: { productId: string; quantity?: number; customerId: string }) => {
  const { record } = await createInvoiceLocally(
    { customerId, items: [{ productId, quantity }] },
    { ...device.options(), allowOversell: true }
  );
  return record;
};

/** The id a device holds for a record it pulled: the server's, matched through clientId. */
const serverIdOf = (device: TestDevice, table: string, localId: string) =>
  String(device.raw.prepare(`SELECT server_id FROM ${table} WHERE local_id = ?`).get(localId)?.server_id ?? '');

const localIdFor = (device: TestDevice, table: string, serverId: string) =>
  String(device.raw.prepare(`SELECT local_id FROM ${table} WHERE server_id = ?`).get(serverId)?.local_id ?? '');

beforeEach(async () => {
  server = createFakeServer();
  counter = await createTestDevice({ server, businessId: BIZ, deviceId: 'dev-counter', deviceIndex: 1 });
  van = await createTestDevice({ server, businessId: BIZ, deviceId: 'dev-van', deviceIndex: 2 });
});

afterEach(() => {
  counter.close();
  van.close();
});

describe('numbering across devices', () => {
  it('gives each device its own series, so two offline bills never share a number', async () => {
    const { customerLocalId, productLocalId } = await sharedCatalogue();
    const vanCustomer = localIdFor(van, 'customers', serverIdOf(counter, 'customers', customerLocalId));
    const vanProduct = localIdFor(van, 'products', serverIdOf(counter, 'products', productLocalId));

    const counterBills = [];
    const vanBills = [];
    for (let index = 0; index < 3; index += 1) {
      counterBills.push(await billOn(counter, { productId: productLocalId, customerId: customerLocalId }));
      vanBills.push(await billOn(van, { productId: vanProduct, customerId: vanCustomer }));
    }

    await counter.sync();
    await van.sync();

    const numbers = server.live('invoices').map((invoice) => invoice.documentNumber);
    expect(numbers).toHaveLength(6);
    expect(new Set(numbers).size).toBe(6);
    // Device 1 keeps the format every existing business already has on paper.
    expect(counterBills.map((bill) => bill.doc?.documentNumber)).toEqual([
      'INV-2026-27-0001',
      'INV-2026-27-0002',
      'INV-2026-27-0003'
    ]);
    // Device 2 gets its own GST series, inside the 16-character cap.
    expect(vanBills.map((bill) => bill.doc?.documentNumber)).toEqual([
      'INV-2627-D2-0001',
      'INV-2627-D2-0002',
      'INV-2627-D2-0003'
    ]);
    expect(numbers.every((number) => String(number).length <= 16)).toBe(true);
  });

  it('refuses a number already used rather than silently renumbering an issued document', async () => {
    const { customerLocalId, productLocalId } = await sharedCatalogue();
    const bill = await billOn(counter, { productId: productLocalId, customerId: customerLocalId });
    // The web app issued the same number while this device was offline.
    server.seed('invoices', { documentNumber: bill.doc?.documentNumber, total: 1, customerId: 'other' });

    await counter.push.push();

    const [operation] = await listOperations({ businessId: BIZ, entityType: 'invoices', txn: counter.txn });
    expect(operation.status).toBe('conflict');
    expect(operation.lastError).toMatch(/already used/);
    // The document the customer is holding is untouched, and a person is told.
    expect((await localInvoice(BIZ, bill.localId, counter.txn))?.documentNumber).toBe(bill.doc?.documentNumber);
  });
});

describe('convergence', () => {
  it("lands each device's records on the other, once", async () => {
    const { customerLocalId, productLocalId } = await sharedCatalogue();
    const vanCustomer = localIdFor(van, 'customers', serverIdOf(counter, 'customers', customerLocalId));
    const vanProduct = localIdFor(van, 'products', serverIdOf(counter, 'products', productLocalId));

    await billOn(counter, { productId: productLocalId, customerId: customerLocalId });
    await billOn(van, { productId: vanProduct, customerId: vanCustomer });

    // Two rounds: each device has to pull what the other pushed.
    await counter.sync();
    await van.sync();
    await counter.sync();

    const onCounter = await localInvoicePage(BIZ, {}, counter.txn);
    const onVan = await localInvoicePage(BIZ, {}, van.txn);
    expect(onCounter.invoices).toHaveLength(2);
    expect(onVan.invoices).toHaveLength(2);
    // The same two documents, by the server's ids, not two copies of each.
    expect(onCounter.invoices.map((invoice) => invoice._id).sort()).toEqual(
      onVan.invoices.map((invoice) => invoice._id).sort()
    );
  });

  it('does not re-insert a record it created once its own echo comes back', async () => {
    await createCustomerLocally({ name: 'Ravi', phone: '9000000001' }, counter.options());

    await counter.sync();
    await counter.sync();

    expect((await localCustomerPage(BIZ, {}, counter.txn)).customers).toHaveLength(1);
    expect(server.count('customers')).toBe(1);
  });

  it('merges two devices editing different fields of one customer', async () => {
    const { customerLocalId } = await sharedCatalogue();
    const vanCustomer = localIdFor(van, 'customers', serverIdOf(counter, 'customers', customerLocalId));

    await updateCustomerLocally(customerLocalId, { phone: '9111111111' }, counter.options());
    await updateCustomerLocally(vanCustomer, { email: 'ramesh@example.com' }, van.options());

    await counter.sync();
    await van.sync();
    await counter.sync();

    // Each device sent only what it changed, so neither claimed the other's field as its own.
    const [onCounter] = (await localCustomerPage(BIZ, {}, counter.txn)).customers;
    expect(onCounter).toMatchObject({ phone: '9111111111', email: 'ramesh@example.com' });
  });

  it('flags a record deleted on one device and edited on the other', async () => {
    const { productLocalId } = await sharedCatalogue();
    const vanProduct = localIdFor(van, 'products', serverIdOf(counter, 'products', productLocalId));

    await deleteProductLocally(productLocalId, counter.options());
    await counter.sync();

    // The van edited it while offline; the tombstone arrives afterwards.
    await updateProductLocally(vanProduct, { price: 250 }, van.options());
    await van.pull.pull();

    const state = van.raw.prepare('SELECT sync_state, deleted_at FROM products WHERE local_id = ?').get(vanProduct);
    expect(state?.sync_state).toBe('conflict');
    // The edit is not destroyed by a background pull, and the row is not tombstoned behind it.
    expect(state?.deleted_at).toBeNull();
  });
});

describe('shared stock', () => {
  it('lets both tills sell what is there and records the oversell', async () => {
    const { customerLocalId, productLocalId } = await sharedCatalogue({ stock: 10 });
    const vanCustomer = localIdFor(van, 'customers', serverIdOf(counter, 'customers', customerLocalId));
    const vanProduct = localIdFor(van, 'products', serverIdOf(counter, 'products', productLocalId));

    // Each device sees 10 and sells 6. The goods have already left both counters.
    await billOn(counter, { productId: productLocalId, quantity: 6, customerId: customerLocalId });
    await billOn(van, { productId: vanProduct, quantity: 6, customerId: vanCustomer });

    await counter.sync();
    await van.sync();
    await counter.sync();

    const productId = serverIdOf(counter, 'products', productLocalId);
    // The server owns the level, and it is honest about being short rather than clamping at 0.
    expect(server.record('products', productId)?.stockQuantity).toBe(-2);
    expect((await localProductPage(BIZ, {}, counter.txn)).products[0].stockQuantity).toBe(-2);
    expect((await localProductPage(BIZ, {}, van.txn)).products[0].stockQuantity).toBe(-2);
  });
});

describe('shared money', () => {
  it("allocates a second till's receipt against what is actually left owing", async () => {
    const { customerLocalId, productLocalId } = await sharedCatalogue({ price: 500 });
    const bill = await billOn(counter, { productId: productLocalId, quantity: 2, customerId: customerLocalId });
    await counter.sync();
    await van.sync();

    const invoiceId = serverIdOf(counter, 'invoices', bill.localId);
    const vanInvoice = localIdFor(van, 'invoices', invoiceId);

    // Both tills take ₹700 against the same ₹1000 bill while neither can see the other.
    await recordInvoicePaymentLocally(bill.localId, { amount: 700, method: 'cash' }, counter.options());
    await recordInvoicePaymentLocally(vanInvoice, { amount: 700, method: 'cash' }, van.options());

    await counter.sync();
    await van.sync();
    await counter.sync();

    const invoice = server.record('invoices', invoiceId);
    // ₹1400 was received against a ₹1000 bill: the bill is paid exactly once and ₹400 is credit.
    expect(invoice?.paidAmount).toBe(1000);
    expect(invoice?.balanceDue).toBe(0);
    const receipts = server.live('payments');
    expect(receipts).toHaveLength(2);
    expect(receipts.map((receipt) => receipt.allocatedAmount).sort()).toEqual([300, 700]);
    expect(receipts.reduce((sum, receipt) => sum + Number(receipt.unappliedAmount), 0)).toBe(400);

    // Both devices end up reading the same settled bill.
    expect((await localInvoice(BIZ, bill.localId, counter.txn))?.paymentStatus).toBe('paid');
    expect((await localInvoice(BIZ, vanInvoice, van.txn))?.paymentStatus).toBe('paid');
  });

  it('holds a receipt against a bill the other till cancelled, instead of dropping the cash', async () => {
    const { customerLocalId, productLocalId } = await sharedCatalogue({ price: 500 });
    const bill = await billOn(counter, { productId: productLocalId, customerId: customerLocalId });
    await counter.sync();
    await van.sync();

    const invoiceId = serverIdOf(counter, 'invoices', bill.localId);
    const vanInvoice = localIdFor(van, 'invoices', invoiceId);
    await recordInvoicePaymentLocally(vanInvoice, { amount: 500, method: 'cash' }, van.options());

    // Cancelled at the counter, online, while the van was offline.
    server.mutate('invoices', invoiceId, { documentStatus: 'cancelled', status: 'cancelled' });
    await van.sync();

    const [operation] = await listOperations({ businessId: BIZ, entityType: 'payments', txn: van.txn });
    expect(operation.status).toBe('conflict');
    expect(server.count('payments')).toBe(0);
    // Still on the device, still visible, waiting for a person — money is never discarded.
    const row = van.raw.prepare('SELECT sync_state FROM payments WHERE local_id = ?').get(operation.entityLocalId);
    expect(row?.sync_state).toBe('conflict');
  });
});
