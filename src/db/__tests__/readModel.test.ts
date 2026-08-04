import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { createCustomer } from '../customerRepository';
import { createInvoice } from '../invoiceRepository';
import { createPayment } from '../paymentRepository';
import { createProduct } from '../productRepository';
import {
  canServeCustomersLocally,
  canServeInvoicesLocally,
  canServeProductsLocally,
  hasLocalData,
  localCustomerPage,
  localInvoice,
  localInvoicePage,
  localPayments,
  localProductCategories,
  localProductPage
} from '../readModel';
import { setSetting } from '../settings';
import { openTestDatabase } from './realSqlite';

const BIZ = 'biz-1';
let raw: DatabaseSync;
let txn: SQLiteDatabase;

beforeEach(async () => {
  ({ raw, txn } = await openTestDatabase());
});

afterEach(() => raw.close());

describe('page shape', () => {
  it('returns the same envelope the API does', async () => {
    for (let index = 0; index < 5; index += 1) {
      await createProduct({ name: `P${index}`, price: index * 10 }, { businessId: BIZ, txn });
    }

    const page = await localProductPage(BIZ, { page: 1, limit: 2, sort: 'name-asc' }, txn);

    expect(page.success).toBe(true);
    expect(page.products.map((product) => product.name)).toEqual(['P0', 'P1']);
    expect(page.pagination).toEqual({ page: 1, limit: 2, total: 5, totalPages: 3, hasMore: true, nextPage: 2 });

    const last = await localProductPage(BIZ, { page: 3, limit: 2, sort: 'name-asc' }, txn);
    expect(last.products.map((product) => product.name)).toEqual(['P4']);
    expect(last.pagination).toMatchObject({ hasMore: false, nextPage: null });
  });
});

describe('products', () => {
  beforeEach(async () => {
    const add = (doc: Record<string, unknown>) => createProduct(doc, { businessId: BIZ, txn });
    await add({ name: 'Cement', price: 380, stockQuantity: 12, category: 'building', sku: 'CEM-1' });
    await add({ name: 'Sand', price: 900, stockQuantity: 0, category: 'building' });
    await add({ name: 'Paint', price: 250, stockQuantity: 2, lowStockThreshold: 5, category: 'finish' });
    await add({ name: 'Retired', price: 10, stockQuantity: 5, isActive: false });
    await createProduct({ name: 'Other business' }, { businessId: 'biz-2', txn });
  });

  const names = async (query: Parameters<typeof localProductPage>[1]) =>
    (await localProductPage(BIZ, query, txn)).products.map((product) => product.name);

  it('filters by search, category and price band', async () => {
    expect(await names({ search: 'cem' })).toEqual(['Cement']);
    expect(await names({ search: 'CEM-1' })).toEqual(['Cement']);
    expect(await names({ category: 'finish' })).toEqual(['Paint']);
    expect(await names({ minPrice: 300, maxPrice: 1000, sort: 'name-asc' })).toEqual(['Cement', 'Sand']);
  });

  it('reads stock status off the promoted columns', async () => {
    expect(await names({ stockStatus: 'out' })).toEqual(['Sand']);
    // At zero a product is gone, not "running low".
    expect(await names({ stockStatus: 'low' })).toEqual(['Paint']);
    expect(await names({ stockStatus: 'available', sort: 'name-asc' })).toEqual(['Cement', 'Paint']);
  });

  it('hides inactive products unless asked, and scopes to the business', async () => {
    expect(await names({ sort: 'name-asc' })).toEqual(['Cement', 'Paint', 'Sand']);
    expect(await names({ status: 'inactive' })).toEqual(['Retired']);
    expect(await names({ status: 'all', sort: 'name-asc' })).toContain('Retired');
    expect(await names({})).not.toContain('Other business');
  });

  it('honours every sort the list chips offer', async () => {
    expect(await names({ sort: 'price-high' })).toEqual(['Sand', 'Cement', 'Paint']);
    expect(await names({ sort: 'price-low' })).toEqual(['Paint', 'Cement', 'Sand']);
    expect(await names({ sort: 'stock-low' })).toEqual(['Sand', 'Paint', 'Cement']);
  });

  it('lists the categories in use', async () => {
    expect(await localProductCategories(BIZ, txn)).toEqual(['building', 'finish']);
  });

  it('declines the queries the device cannot answer', () => {
    // Sales aggregates and report ranges live on the server; a name-sorted list would be a lie.
    expect(canServeProductsLocally({ sort: 'top-sales' })).toBe(false);
    expect(canServeProductsLocally({ from: '2026-01-01' })).toBe(false);
    expect(canServeProductsLocally({ search: 'cem', sort: 'price-low' })).toBe(true);
  });
});

describe('customers', () => {
  beforeEach(async () => {
    const add = (doc: Record<string, unknown>) => createCustomer(doc, { businessId: BIZ, txn });
    await add({ name: 'Ramesh Traders', phone: '9876543210', email: 'ramesh@example.com' });
    await add({ name: 'Sunita Stores', phone: '9000011111' });
  });

  const names = async (query: Parameters<typeof localCustomerPage>[1]) =>
    (await localCustomerPage(BIZ, query, txn)).customers.map((customer) => customer.name);

  it('searches names and phones however the phone was typed', async () => {
    expect(await names({ search: 'rame' })).toEqual(['Ramesh Traders']);
    expect(await names({ search: '+91 98765 43210' })).toEqual(['Ramesh Traders']);
  });

  it('filters on having an email', async () => {
    expect(await names({ contactInfo: 'withEmail' })).toEqual(['Ramesh Traders']);
    expect(await names({ contactInfo: 'withoutEmail' })).toEqual(['Sunita Stores']);
  });

  it('declines ledger-derived filters', () => {
    expect(canServeCustomersLocally({ billingStatus: 'pending' })).toBe(false);
    expect(canServeCustomersLocally({ contactInfo: 'withAddress' })).toBe(false);
    expect(canServeCustomersLocally({ search: 'ram', sort: 'name-asc' })).toBe(true);
  });
});

describe('invoices', () => {
  beforeEach(async () => {
    const add = (doc: Record<string, unknown>) => createInvoice(doc, { businessId: BIZ, txn });
    await add({
      _id: 'i1',
      documentNumber: 'INV/0001',
      date: '2026-07-01T00:00:00.000Z',
      total: 500,
      paymentStatus: 'paid',
      documentStatus: 'issued',
      customer: 'cust-1',
      customerSnapshot: { name: 'Ramesh Traders' }
    });
    await add({
      _id: 'i2',
      documentNumber: 'INV/0002',
      date: '2026-07-20T00:00:00.000Z',
      total: 1500,
      paymentStatus: 'partial',
      documentStatus: 'issued'
    });
    await add({
      _id: 'i3',
      documentNumber: 'INV/0003',
      date: '2026-08-01T00:00:00.000Z',
      total: 900,
      documentStatus: 'cancelled',
      paymentStatus: 'unpaid'
    });
    await add({ _id: 'q1', documentNumber: 'QTN/0001', date: '2026-08-02T00:00:00.000Z', documentType: 'quotation' });
  });

  const numbers = async (query: Parameters<typeof localInvoicePage>[1]) =>
    (await localInvoicePage(BIZ, query, txn)).invoices.map((invoice) => invoice.documentNumber);

  it('defaults to invoices, newest first', async () => {
    expect(await numbers({})).toEqual(['INV/0003', 'INV/0002', 'INV/0001']);
    expect(await numbers({ documentType: 'quotation' })).toEqual(['QTN/0001']);
  });

  it('maps the legacy status chips onto the real columns', async () => {
    expect(await numbers({ status: 'paid' })).toEqual(['INV/0001']);
    expect(await numbers({ status: 'pending' })).toEqual(['INV/0002']);
    expect(await numbers({ status: 'cancelled' })).toEqual(['INV/0003']);
  });

  it('filters by customer, period and amount, and sorts', async () => {
    expect(await numbers({ customerId: 'cust-1' })).toEqual(['INV/0001']);
    expect(await numbers({ from: '2026-07-15T00:00:00.000Z', to: '2026-07-31T00:00:00.000Z' })).toEqual(['INV/0002']);
    expect(await numbers({ minAmount: 900 })).toEqual(['INV/0003', 'INV/0002']);
    expect(await numbers({ sort: 'amount-high' })).toEqual(['INV/0002', 'INV/0003', 'INV/0001']);
    expect(await numbers({ sort: 'oldest' })).toEqual(['INV/0001', 'INV/0002', 'INV/0003']);
  });

  it('searches number and snapshot customer name', async () => {
    expect(await numbers({ search: '0002' })).toEqual(['INV/0002']);
    expect(await numbers({ search: 'ramesh' })).toEqual(['INV/0001']);
  });

  it('reads one document for the detail screen, with its full payload', async () => {
    const invoice = await localInvoice(BIZ, 'i1', txn);
    expect(invoice).toMatchObject({ _id: 'i1', documentNumber: 'INV/0001', customerSnapshot: { name: 'Ramesh Traders' } });
    expect(await localInvoice(BIZ, 'missing', txn)).toBeNull();
  });

  it('declines an unknown sort', () => {
    expect(canServeInvoicesLocally({ sort: 'newest' })).toBe(true);
    expect(canServeInvoicesLocally({ sort: 'weird' as never })).toBe(false);
  });
});

describe('payments', () => {
  it('lists a document or a customer ledger, newest first', async () => {
    await createPayment(
      { _id: 'pay1', amount: 300, receivedAt: '2026-07-15T10:00:00.000Z', salesDocument: 'i1', customer: 'c1' },
      { businessId: BIZ, txn }
    );
    await createPayment(
      { _id: 'pay2', amount: 200, receivedAt: '2026-07-16T10:00:00.000Z', salesDocument: 'i1', customer: 'c1' },
      { businessId: BIZ, txn }
    );
    await createPayment({ _id: 'pay3', amount: 100, receivedAt: '2026-07-17T10:00:00.000Z' }, { businessId: BIZ, txn });

    expect((await localPayments(BIZ, { invoiceId: 'i1' }, txn)).map((payment) => payment._id)).toEqual([
      'pay2',
      'pay1'
    ]);
    expect((await localPayments(BIZ, { customerId: 'c1' }, txn))).toHaveLength(2);
    expect(await localPayments(BIZ, {}, txn)).toHaveLength(3);
  });
});

describe('local readiness', () => {
  it('is false before the collection is synced, true once it has rows', async () => {
    expect(await hasLocalData('products', BIZ, txn)).toBe(false);

    await createProduct({ name: 'Cement' }, { businessId: BIZ, txn });
    expect(await hasLocalData('products', BIZ, txn)).toBe(true);
  });

  it('trusts a genuinely empty collection once a cursor proves it was pulled', async () => {
    await setSetting('sync.cursor.customers', 'cursor-1', { txn });
    expect(await hasLocalData('customers', BIZ, txn)).toBe(true);
    // suppliers are pulled as the server's "vendors" collection.
    await setSetting('sync.cursor.vendors', 'cursor-2', { txn });
    expect(await hasLocalData('suppliers', BIZ, txn)).toBe(true);
  });
});
