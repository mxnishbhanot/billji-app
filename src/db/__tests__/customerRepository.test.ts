import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  countCustomers,
  createCustomer,
  deleteCustomer,
  findCustomerByPhone,
  getCustomer,
  getCustomerByServerId,
  listCustomers,
  updateCustomer
} from '../customerRepository';
import { openTestDatabase } from './realSqlite';

const BIZ = 'biz-1';
let raw: DatabaseSync;
let txn: SQLiteDatabase;

const add = (name: string, extra: Record<string, unknown> = {}) =>
  createCustomer({ name, ...extra }, { businessId: BIZ, txn });

const names = async (query: Parameters<typeof listCustomers>[0]) =>
  (await listCustomers(query)).items.map((item) => item.doc?.name);

beforeEach(async () => {
  ({ raw, txn } = await openTestDatabase());
});

afterEach(() => raw.close());

describe('create and read', () => {
  it('stores a customer and reads it back', async () => {
    const created = await add('Ramesh Traders', { phone: '+91 98765 43210', gstNumber: '27AAECS1234F1Z5' });

    expect(created.doc?.name).toBe('Ramesh Traders');
    expect(created.doc?.clientId).toBe(created.localId);
    expect((await getCustomer(created.localId, txn))?.doc).toEqual(created.doc);
    // The phone is promoted twice: raw for display, normalised for matching.
    expect(raw.prepare('SELECT phone, phone_normalized FROM customers').get()).toEqual({
      phone: '+91 98765 43210',
      phone_normalized: '9876543210'
    });
  });

  it('reads by server id', async () => {
    await add('Sunita Stores', { _id: 'srv-9' });
    expect((await getCustomerByServerId('srv-9', txn))?.doc?.name).toBe('Sunita Stores');
    expect(await getCustomerByServerId('nope', txn)).toBeNull();
  });

  it('finds a duplicate however the phone was typed', async () => {
    await add('Ramesh', { phone: '9876543210' });

    expect((await findCustomerByPhone(BIZ, '+91-98765-43210', txn))?.doc?.name).toBe('Ramesh');
    expect((await findCustomerByPhone(BIZ, '098765 43210', txn))?.doc?.name).toBe('Ramesh');
    expect(await findCustomerByPhone(BIZ, '9000000000', txn)).toBeNull();
    // A blank phone must not match the first customer that happens to have none.
    await add('No phone');
    expect(await findCustomerByPhone(BIZ, '   ', txn)).toBeNull();
  });
});

describe('update and delete', () => {
  it('merges the patch and re-promotes the derived columns', async () => {
    const created = await add('Ramesh', { phone: '9876543210', email: 'r@example.com' });
    const updated = await updateCustomer(created.localId, { phone: '+91 90000 11111' }, { txn });

    expect(updated?.doc).toMatchObject({ name: 'Ramesh', email: 'r@example.com', phone: '+91 90000 11111' });
    expect(raw.prepare('SELECT phone_normalized FROM customers').get()).toEqual({ phone_normalized: '9000011111' });
    expect(raw.prepare('SELECT COUNT(*) AS n FROM customers').get()).toEqual({ n: 1 });
  });

  it('tombstones rather than deletes, and hides the row afterwards', async () => {
    const created = await add('Gone Away');
    expect(await deleteCustomer(created.localId, { txn, now: '2026-08-02T12:00:00.000Z' })).toBe(true);

    expect((await getCustomer(created.localId, txn))?.deletedAt).toBe('2026-08-02T12:00:00.000Z');
    expect((await listCustomers({ businessId: BIZ, txn })).items).toEqual([]);
    expect(await findCustomerByPhone(BIZ, '9876543210', txn)).toBeNull();
    expect(await deleteCustomer(created.localId, { txn })).toBe(false);
    expect(await updateCustomer(created.localId, { name: 'Back' }, { txn })).toBeNull();
  });
});

describe('search', () => {
  beforeEach(async () => {
    await add('Ramesh Traders', { phone: '9876543210', email: 'ramesh@example.com' });
    await add('Sunita Stores', { phone: '9000011111', gstNumber: '27AAECS1234F1Z5' });
    await add('Shop 12', { phone: '9111122222' });
    await add('Archived Co', { isActive: false });
    await createCustomer({ name: 'Other business' }, { businessId: 'biz-2', txn });
  });

  it('matches name, email and GSTIN', async () => {
    expect(await names({ businessId: BIZ, search: 'rame', txn })).toEqual(['Ramesh Traders']);
    expect(await names({ businessId: BIZ, search: 'ramesh@', txn })).toEqual(['Ramesh Traders']);
    expect(await names({ businessId: BIZ, search: '27AAECS1234F1Z5', txn })).toEqual(['Sunita Stores']);
  });

  it('normalises a phone-shaped term but leaves a name with digits alone', async () => {
    expect(await names({ businessId: BIZ, search: '+91 98765 43210', txn })).toEqual(['Ramesh Traders']);
    expect(await names({ businessId: BIZ, search: '98765', txn })).toEqual(['Ramesh Traders']);
    // "Shop 12" is a name; normalising it to "12" would search the wrong thing.
    expect(await names({ businessId: BIZ, search: 'Shop 12', txn })).toEqual(['Shop 12']);
  });

  it('treats LIKE wildcards as literal text', async () => {
    expect(await names({ businessId: BIZ, search: '%', txn })).toEqual([]);
    expect(await names({ businessId: BIZ, search: '_', txn })).toEqual([]);
  });

  it('scopes to the business and hides inactive by default', async () => {
    expect(await names({ businessId: BIZ, txn })).toEqual(['Ramesh Traders', 'Shop 12', 'Sunita Stores']);
    expect(await names({ businessId: BIZ, activeOnly: false, txn })).toContain('Archived Co');
    expect(await names({ businessId: 'biz-2', txn })).toEqual(['Other business']);
  });

  it('counts the same filters', async () => {
    expect(await countCustomers({ businessId: BIZ, txn })).toBe(3);
    expect(await countCustomers({ businessId: BIZ, search: 'rame', txn })).toBe(1);
  });
});

describe('pagination', () => {
  it('walks every row exactly once, including duplicate names', async () => {
    for (const name of ['A', 'B', 'B', 'C', 'D']) await add(name);

    const seen: string[] = [];
    let cursor = null as Awaited<ReturnType<typeof listCustomers>>['nextCursor'];
    let pages = 0;

    do {
      const page = await listCustomers({ businessId: BIZ, limit: 2, cursor, txn });
      seen.push(...page.items.map((item) => item.localId));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);

    expect(new Set(seen).size).toBe(5);
    expect(pages).toBe(3);
  });

  it('reports no next cursor on the last page and caps the page size', async () => {
    await add('Only one');
    expect(await listCustomers({ businessId: BIZ, limit: 5, txn })).toMatchObject({ nextCursor: null });
    expect((await listCustomers({ businessId: BIZ, limit: 100000, txn })).items).toHaveLength(1);
  });
});

describe('safety', () => {
  it('rejects a filter on a column that was not declared', async () => {
    await expect(
      listCustomers({ businessId: BIZ, where: { "name'; DROP TABLE customers; --": 'x' }, txn })
    ).rejects.toThrow(/not a filterable column/);
    expect(raw.prepare("SELECT name FROM sqlite_master WHERE name = 'customers'").get()).toBeTruthy();
  });

  it('rolls both writes back when the enclosing transaction throws', async () => {
    const kept = await add('Kept');

    await expect(
      txn.withExclusiveTransactionAsync(async (scoped) => {
        await createCustomer({ name: 'Doomed' }, { businessId: BIZ, txn: scoped });
        await updateCustomer(kept.localId, { email: 'x@example.com' }, { txn: scoped });
        throw new Error('caller changed its mind');
      })
    ).rejects.toThrow('caller changed its mind');

    expect(raw.prepare('SELECT COUNT(*) AS n FROM customers').get()).toEqual({ n: 1 });
    expect((await getCustomer(kept.localId, txn))?.doc?.email).toBeUndefined();
  });
});
