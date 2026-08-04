import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  countProducts,
  createProduct,
  deleteProduct,
  findProductByBarcode,
  getProduct,
  getProductByServerId,
  listProducts,
  updateProduct
} from '../productRepository';
import { openTestDatabase } from './realSqlite';

const BIZ = 'biz-1';
let raw: DatabaseSync;
let txn: SQLiteDatabase;

const add = (name: string, extra: Record<string, unknown> = {}) =>
  createProduct({ name, ...extra }, { businessId: BIZ, txn });

beforeEach(async () => {
  ({ raw, txn } = await openTestDatabase());
});

afterEach(() => raw.close());

describe('create and read', () => {
  it('stores a product and reads it back by local id', async () => {
    const created = await add('Cement bag', { price: 380, stockQuantity: 12, isActive: true });

    expect(created.syncState).toBe('pending');
    expect(created.doc?.name).toBe('Cement bag');
    // clientId is the local_id, so the server's create response lands on this row.
    expect(created.doc?.clientId).toBe(created.localId);

    const fetched = await getProduct(created.localId, txn);
    expect(fetched?.doc).toEqual(created.doc);
    expect(fetched?.businessId).toBe(BIZ);
  });

  it('reads by server id and by barcode', async () => {
    await add('Sand', { _id: 'srv-1', barcode: '8901234567890' });

    expect((await getProductByServerId('srv-1', txn))?.doc?.name).toBe('Sand');
    expect((await findProductByBarcode(BIZ, '8901234567890', txn))?.doc?.name).toBe('Sand');
    expect(await findProductByBarcode(BIZ, 'nope', txn)).toBeNull();
    expect(await getProduct('missing', txn)).toBeNull();
  });

  it('promotes the columns the queries filter on', async () => {
    await add('Bricks', { price: 9.5, isActive: false, trackStock: false });
    const row = raw.prepare('SELECT price, is_active, track_stock FROM products').get();
    expect(row).toEqual({ price: 9.5, is_active: 0, track_stock: 0 });
  });
});

describe('update', () => {
  it('merges the patch into the stored document and re-promotes columns', async () => {
    const created = await add('Cement bag', { price: 380, sku: 'CEM-1' });
    const updated = await updateProduct(created.localId, { price: 420 }, { txn });

    expect(updated?.doc).toMatchObject({ name: 'Cement bag', sku: 'CEM-1', price: 420 });
    expect(raw.prepare('SELECT price FROM products').get()).toEqual({ price: 420 });
    // Upsert on local_id, not a second row.
    expect(raw.prepare('SELECT COUNT(*) AS n FROM products').get()).toEqual({ n: 1 });
  });

  it('returns null for a missing or already-deleted product', async () => {
    const created = await add('Gone');
    await deleteProduct(created.localId, { txn });

    expect(await updateProduct(created.localId, { price: 1 }, { txn })).toBeNull();
    expect(await updateProduct('missing', { price: 1 }, { txn })).toBeNull();
  });
});

describe('delete', () => {
  it('tombstones the row instead of removing it, and hides it from lists', async () => {
    const created = await add('Old stock');
    expect(await deleteProduct(created.localId, { txn, now: '2026-08-02T12:00:00.000Z' })).toBe(true);

    const record = await getProduct(created.localId, txn);
    expect(record?.deletedAt).toBe('2026-08-02T12:00:00.000Z');
    expect(record?.doc?.deletedAt).toBe('2026-08-02T12:00:00.000Z');
    expect(record?.syncState).toBe('pending');
    expect((await listProducts({ businessId: BIZ, txn })).items).toEqual([]);

    // Second delete changes nothing.
    expect(await deleteProduct(created.localId, { txn })).toBe(false);
  });
});

describe('search and filters', () => {
  beforeEach(async () => {
    await add('Cement bag', { sku: 'CEM-1', category: 'building' });
    await add('Sand truckload', { sku: 'SND-9', category: 'building', barcode: '999' });
    await add('Paint 50% white', { category: 'finish' });
    await add('Retired item', { isActive: false });
    await createProduct({ name: 'Other business' }, { businessId: 'biz-2', txn });
  });

  const names = async (query: Parameters<typeof listProducts>[0]) =>
    (await listProducts(query)).items.map((item) => item.doc?.name);

  it('matches name, sku and barcode', async () => {
    expect(await names({ businessId: BIZ, search: 'cem', txn })).toEqual(['Cement bag']);
    expect(await names({ businessId: BIZ, search: 'SND', txn })).toEqual(['Sand truckload']);
    expect(await names({ businessId: BIZ, search: '999', txn })).toEqual(['Sand truckload']);
  });

  it('treats LIKE wildcards in the search term as literal text', async () => {
    // Unescaped, "%" would match every product in the catalogue.
    expect(await names({ businessId: BIZ, search: '50%', txn })).toEqual(['Paint 50% white']);
    expect(await names({ businessId: BIZ, search: '_', txn })).toEqual([]);
  });

  it('scopes to the business, hides inactive by default, and filters by category', async () => {
    expect(await names({ businessId: BIZ, txn })).toEqual(['Cement bag', 'Paint 50% white', 'Sand truckload']);
    expect(await names({ businessId: BIZ, activeOnly: false, txn })).toContain('Retired item');
    expect(await names({ businessId: BIZ, category: 'finish', txn })).toEqual(['Paint 50% white']);
    expect(await names({ businessId: 'biz-2', txn })).toEqual(['Other business']);
  });

  it('counts the same filters, ignoring the cursor', async () => {
    expect(await countProducts({ businessId: BIZ, txn })).toBe(3);
    expect(await countProducts({ businessId: BIZ, search: 'cem', txn })).toBe(1);
  });
});

describe('pagination', () => {
  it('walks every row exactly once, including duplicate names', async () => {
    for (const name of ['A', 'B', 'B', 'C', 'D']) await add(name);

    const seen: string[] = [];
    let cursor = null as Awaited<ReturnType<typeof listProducts>>['nextCursor'];
    let pages = 0;

    do {
      const page = await listProducts({ businessId: BIZ, limit: 2, cursor, txn });
      seen.push(...page.items.map((item) => item.localId));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);

    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
    expect(pages).toBe(3);
  });

  it('reports no next cursor on the last page', async () => {
    await add('Only one');
    expect(await listProducts({ businessId: BIZ, limit: 5, txn })).toMatchObject({ nextCursor: null });
  });

  it('caps the page size', async () => {
    for (let i = 0; i < 3; i += 1) await add(`P${i}`);
    expect((await listProducts({ businessId: BIZ, limit: 100000, txn })).items).toHaveLength(3);
  });
});

describe('transactions', () => {
  it('rolls every write back when the enclosing transaction throws', async () => {
    const existing = await add('Kept');

    await expect(
      txn.withExclusiveTransactionAsync(async (scoped) => {
        await createProduct({ name: 'Doomed' }, { businessId: BIZ, txn: scoped });
        await updateProduct(existing.localId, { price: 999 }, { txn: scoped });
        throw new Error('caller changed its mind');
      })
    ).rejects.toThrow('caller changed its mind');

    expect(raw.prepare('SELECT COUNT(*) AS n FROM products').get()).toEqual({ n: 1 });
    expect((await getProduct(existing.localId, txn))?.doc?.price).toBeUndefined();
  });

  it('commits both writes when the transaction completes', async () => {
    await txn.withExclusiveTransactionAsync(async (scoped) => {
      await createProduct({ name: 'One' }, { businessId: BIZ, txn: scoped });
      await createProduct({ name: 'Two' }, { businessId: BIZ, txn: scoped });
    });

    expect(raw.prepare('SELECT COUNT(*) AS n FROM products').get()).toEqual({ n: 2 });
  });
});
