import { DatabaseSync } from 'node:sqlite';
import { openDatabaseAsync } from 'expo-sqlite';
import { closeDatabase, listOperations, localCustomerOutstanding, saveDeviceSeries } from '@/db';
import { useAuthStore } from '@/store/authStore';
import type { User } from '@/types';
import { adaptSqlite } from '../../db/__tests__/realSqlite';
import { api } from '../client';
import { customersApi, invoicesApi, paymentsApi, productsApi } from '../endpoints';

/**
 * The whole local-first path, from the function a screen calls down to SQLite — with the
 * network unplugged at the axios layer.
 *
 * The unit suites each prove one link: localFirst decides, the read model queries, the writes
 * queue. What none of them prove is that the twenty-nine call sites in endpoints.ts are wired
 * to any of it. This suite calls exactly what a screen calls and then asserts two things every
 * time: the answer came back, and axios was never touched.
 *
 * expo-sqlite is replaced by node:sqlite here rather than by a fake, so the app opens and
 * migrates a real database through its own connection module.
 */

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
  deleteDatabaseAsync: jest.fn(async () => undefined)
}));

jest.mock('../client', () => ({
  api: {
    get: jest.fn(async () => ({ data: {} })),
    post: jest.fn(async () => ({ data: {} })),
    patch: jest.fn(async () => ({ data: {} })),
    delete: jest.fn(async () => ({ data: {} }))
  },
  apiBaseUrl: 'http://localhost',
  apiErrorMessage: (error: unknown) => String(error)
}));

const mockOpen = openDatabaseAsync as jest.MockedFunction<typeof openDatabaseAsync>;
const network = api as unknown as { get: jest.Mock; post: jest.Mock; patch: jest.Mock; delete: jest.Mock };

const BIZ = 'biz-1';

let raw: DatabaseSync;

/** Marks a collection as pulled, which is what makes a local read trustworthy. */
const markSynced = (collection: string) =>
  raw
    .prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, 'cursor-1', '2026-08-02T10:00:00.000Z')")
    .run(`sync.cursor.${collection}`);

beforeEach(async () => {
  await closeDatabase();
  jest.clearAllMocks();

  raw = new DatabaseSync(':memory:');
  mockOpen.mockResolvedValue(adaptSqlite(raw) as never);
  useAuthStore.setState({ user: { businessId: BIZ } as User });
});

afterEach(async () => {
  await closeDatabase();
  raw.close();
});

describe('a shop working with no signal', () => {
  it('creates a product, lists it, and never calls the API', async () => {
    const created = await productsApi.create({ name: 'Cement bag', price: 380, stockQuantity: 10 } as never);
    markSynced('products');

    const listed = await productsApi.list();

    expect(created._id).toBeTruthy();
    expect(listed.map((product) => product.name)).toEqual(['Cement bag']);
    expect(network.post).not.toHaveBeenCalled();
    expect(network.get).not.toHaveBeenCalled();
    // The write is queued for the server in the same breath it was stored.
    expect(await listOperations({ businessId: BIZ, entityType: 'products' })).toHaveLength(1);
  });

  it('edits and deletes through the same local path', async () => {
    const created = await productsApi.create({ name: 'Cement bag', price: 380, stockQuantity: 10 } as never);

    const updated = await productsApi.update(created._id, { price: 400 } as never);
    await productsApi.remove(created._id);
    markSynced('products');

    expect(updated.price).toBe(400);
    expect(await productsApi.list()).toEqual([]);
    expect(network.patch).not.toHaveBeenCalled();
    expect(network.delete).not.toHaveBeenCalled();
  });

  it('issues a numbered bill and shows it on the list', async () => {
    await saveDeviceSeries({ deviceId: 'dev-1', deviceIndex: 1, prefix: 'INV', documentType: 'invoice' });
    const customer = await customersApi.create({ name: 'Ramesh Kumar', phone: '9876543210' } as never);
    const product = await productsApi.create({ name: 'Cement bag', price: 500, stockQuantity: 10 } as never);

    const invoice = await invoicesApi.create({
      customerId: customer._id,
      items: [{ productId: product._id, quantity: 2 }]
    } as never);
    markSynced('invoices');

    expect(invoice.documentNumber).toBe('INV-2026-27-0001');
    expect(invoice.total).toBe(1000);
    expect((await invoicesApi.list()).map((doc) => doc._id)).toEqual([invoice._id]);
    expect(network.post).not.toHaveBeenCalled();
  });

  it('goes to the server to number a bill when this device has no series yet', async () => {
    const customer = await customersApi.create({ name: 'Ramesh Kumar', phone: '9876543210' } as never);
    const product = await productsApi.create({ name: 'Cement bag', price: 500, stockQuantity: 10 } as never);
    network.post.mockResolvedValue({ data: { invoice: { _id: 'srv-i1', documentNumber: 'INV-2026-27-0001' } } });

    const invoice = await invoicesApi.create({
      customerId: customer._id,
      items: [{ productId: product._id, quantity: 1 }]
    } as never);

    // Inventing a GST number without an allocated series could collide with another device's.
    expect(network.post).toHaveBeenCalledWith('/invoices', expect.anything(), expect.anything());
    expect(invoice._id).toBe('srv-i1');
  });

  it('refuses an oversell locally instead of retrying it online', async () => {
    await saveDeviceSeries({ deviceId: 'dev-1', deviceIndex: 1, prefix: 'INV', documentType: 'invoice' });
    const customer = await customersApi.create({ name: 'Ramesh Kumar', phone: '9876543210' } as never);
    const product = await productsApi.create({ name: 'Cement bag', price: 500, stockQuantity: 2 } as never);

    const attempt = invoicesApi.create({
      customerId: customer._id,
      items: [{ productId: product._id, quantity: 5 }]
    } as never);

    // A rule the server enforces too: falling back would either fail identically or produce a
    // document nobody confirmed. The screen gets the shortfall and asks.
    await expect(attempt).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect(network.post).not.toHaveBeenCalled();

    // Confirmed by the user, the same call goes through with the sale forced.
    const forced = await invoicesApi.create({
      customerId: customer._id,
      items: [{ productId: product._id, quantity: 5 }],
      allowOversell: true
    } as never);
    expect(forced.documentNumber).toBe('INV-2026-27-0001');
  });

  it('records money against a bill and answers what is still owed, locally', async () => {
    await saveDeviceSeries({ deviceId: 'dev-1', deviceIndex: 1, prefix: 'INV', documentType: 'invoice' });
    const customer = await customersApi.create({ name: 'Ramesh Kumar', phone: '9876543210' } as never);
    const product = await productsApi.create({ name: 'Cement bag', price: 500, stockQuantity: 10 } as never);
    const invoice = await invoicesApi.create({
      customerId: customer._id,
      items: [{ productId: product._id, quantity: 2 }]
    } as never);
    markSynced('invoices');

    const receipt = await paymentsApi.recordInvoicePayment(invoice._id, { amount: 400, method: 'cash' } as never);
    const outstanding = await paymentsApi.customerOutstanding(customer._id);

    expect(receipt.payment.amount).toBe(400);
    expect(await paymentsApi.list({ invoiceId: invoice._id })).toHaveLength(1);
    // The bill's remaining balance reflects cash the server has not seen yet.
    expect(outstanding.totalOutstanding).toBe(600);
    expect(outstanding.invoices[0].balanceDue).toBe(600);
    expect(network.post).not.toHaveBeenCalled();
    expect(network.get).not.toHaveBeenCalled();
  });

  it("collects a customer's dues across bills and settles the oldest first", async () => {
    await saveDeviceSeries({ deviceId: 'dev-1', deviceIndex: 1, prefix: 'INV', documentType: 'invoice' });
    const customer = await customersApi.create({ name: 'Ramesh Kumar', phone: '9876543210' } as never);
    const product = await productsApi.create({ name: 'Cement bag', price: 500, stockQuantity: 20 } as never);
    const first = await invoicesApi.create({ customerId: customer._id, items: [{ productId: product._id, quantity: 1 }] } as never);
    const second = await invoicesApi.create({ customerId: customer._id, items: [{ productId: product._id, quantity: 1 }] } as never);
    markSynced('invoices');

    await paymentsApi.recordCustomerPayment(customer._id, {
      amount: 700,
      method: 'cash',
      invoiceIds: [first._id, second._id]
    } as never);
    const outstanding = await localCustomerOutstanding(BIZ, customer._id);

    expect(outstanding.totalOutstanding).toBe(300);
    expect(outstanding.invoices.map((doc) => doc.id)).toEqual([second._id]);
    expect(outstanding.invoices[0].balanceDue).toBe(300);
    expect(first._id).toBeTruthy();
    expect(network.post).not.toHaveBeenCalled();
  });
});

describe('when the device cannot answer', () => {
  it('reads from the server before a collection has ever been synced', async () => {
    network.get.mockResolvedValue({ data: { products: [{ _id: 'srv-p1', name: 'From the server' }] } });

    const listed = await productsApi.list();

    // No rows and no cursor: an empty local list would be a lie, not an answer.
    expect(listed.map((product) => product.name)).toEqual(['From the server']);
    expect(network.get).toHaveBeenCalledWith('/products', { params: undefined });
  });

  it('reads from the server for a query the device cannot compute', async () => {
    await productsApi.create({ name: 'Cement bag', price: 380, stockQuantity: 10 } as never);
    markSynced('products');
    network.get.mockResolvedValue({ data: { products: [] } });

    await productsApi.list({ sort: 'top-sales' } as never);

    // Sales aggregates are not on the device; answering locally would answer wrongly.
    expect(network.get).toHaveBeenCalled();
  });

  it('falls back to the server when the local store is broken', async () => {
    await productsApi.create({ name: 'Cement bag', price: 380, stockQuantity: 10 } as never);
    markSynced('products');
    raw.exec('DROP TABLE products');
    network.get.mockResolvedValue({ data: { products: [{ _id: 'srv-p1', name: 'From the server' }] } });

    const listed = await productsApi.list();

    // A damaged cache degrades to online. It never becomes the reason a screen fails.
    expect(listed.map((product) => product.name)).toEqual(['From the server']);
  });
});
