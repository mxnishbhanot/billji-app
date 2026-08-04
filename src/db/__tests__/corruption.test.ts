import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { createCustomerLocally } from '../customerWrites';
import { isDatabaseError } from '../errors';
import { fromJsonText } from '../mappers';
import { claimOperations, listOperations } from '../outbox';
import { createProduct, getProduct } from '../productRepository';
import { createProductLocally } from '../productWrites';
import { hasLocalData, localCustomerPage, localInvoicePage, localProductPage } from '../readModel';
import { pendingStockDeltasByProduct } from '../stockProjection';
import { toWireOperation } from '../../sync/pushEngine';
import { adaptSqlite, openTestDatabase } from './realSqlite';

/**
 * A local database that is not what the app left there.
 *
 * This happens: a phone runs out of storage mid-write, a WAL file is lost to a forced
 * shutdown, a manufacturer's "cleaner" app truncates a file it does not recognise, and once
 * in a while SQLite itself is fine but a JSON column is not.
 *
 * The rule under test is one rule: a damaged local store degrades to "no local data" and
 * reports a DatabaseError the API layer can fall back on — it never crashes a screen and it
 * never answers with half a number. The store is a cache; the server holds the books.
 */

const BIZ = 'biz-1';
const T0 = '2026-08-02T10:00:00.000Z';

let raw: DatabaseSync;
let txn: SQLiteDatabase;

const options = () => ({ businessId: BIZ, txn, now: T0 });

const corruptPayload = (table: string, localId: string, value = '{not json at all') =>
  raw.prepare(`UPDATE ${table} SET payload = ? WHERE local_id = ?`).run(value, localId);

const caught = async (task: () => Promise<unknown>) => {
  try {
    await task();
    return null;
  } catch (error) {
    return error;
  }
};

beforeEach(async () => {
  ({ raw, txn } = await openTestDatabase());
});

afterEach(() => raw.close());

describe('a payload that is not JSON', () => {
  it('reads as absent rather than throwing', () => {
    expect(fromJsonText('{not json at all')).toBeNull();
    expect(fromJsonText('undefined')).toBeNull();
    expect(fromJsonText(null)).toBeNull();
  });

  it('drops the damaged product from the list and keeps the rest', async () => {
    const good = await createProductLocally({ name: 'Cement bag', price: 380, stockQuantity: 10 }, options());
    const bad = await createProductLocally({ name: 'Sand', price: 40, stockQuantity: 5 }, options());
    corruptPayload('products', bad.localId);

    const page = await localProductPage(BIZ, {}, txn);

    // One unreadable row costs that row, not the screen.
    expect(page.products.map((product) => product._id)).toEqual([good.localId]);
    expect(await getProduct(bad.localId, txn)).toMatchObject({ doc: null });
  });

  it('drops a damaged invoice and customer the same way', async () => {
    const customer = await createCustomerLocally({ name: 'Ramesh', phone: '9876543210' }, options());
    await createProduct({ name: 'Cement', price: 100, stockQuantity: 5 }, { businessId: BIZ, txn, now: T0 });
    corruptPayload('customers', customer.localId);

    await expect(localCustomerPage(BIZ, {}, txn)).resolves.toMatchObject({ customers: [] });
    await expect(localInvoicePage(BIZ, {}, txn)).resolves.toMatchObject({ invoices: [] });
  });

  it('leaves a corrupt queue entry sendable but empty, for the server to refuse', async () => {
    const product = await createProductLocally({ name: 'Cement bag', price: 380, stockQuantity: 10 }, options());
    raw.prepare('UPDATE outbox SET payload = ? WHERE entity_local_id = ?').run('{{{', product.localId);

    const [operation] = await listOperations({ businessId: BIZ, txn });

    expect(operation.payload).toBeNull();
    // The queue does not invent a payload, and the wire carries an empty one: the server's
    // validator is the guard here, not a guess made on a phone.
    expect(toWireOperation(operation)).toMatchObject({ entity: 'product', payload: {} });
  });

  it('projects stock from a queue it can only partly read', async () => {
    const product = await createProductLocally({ name: 'Cement bag', price: 380, stockQuantity: 10 }, options());
    raw
      .prepare(
        `INSERT INTO outbox (op_id, business_id, entity_type, entity_local_id, op_type, payload, status, created_at, updated_at)
         VALUES ('op-broken', ?, 'invoices', 'inv-broken', 'create', '[[[', 'pending', ?, ?)`
      )
      .run(BIZ, T0, T0);

    const deltas = await pendingStockDeltasByProduct(BIZ, txn);

    // The unreadable operation contributes nothing instead of poisoning every projection.
    expect(deltas.get(product.localId)).toBeUndefined();
    expect((await localProductPage(BIZ, {}, txn)).products[0].stockQuantity).toBe(10);
  });
});

describe('a queue whose dependency list is damaged', () => {
  it('refuses to claim rather than sending operations out of order', async () => {
    await createProductLocally({ name: 'Cement bag', price: 380, stockQuantity: 10 }, options());
    raw.prepare('UPDATE outbox SET depends_on = ? WHERE business_id = ?').run('not-json', BIZ);

    const error = await caught(() => claimOperations(BIZ, { txn, now: T0 }));

    // A clear failure the caller can report: the alternative is a queue that quietly loses
    // its ordering guarantee, which is how a payment overtakes the invoice it belongs to.
    expect(isDatabaseError(error) && error.code).toBe('DB_QUERY_FAILED');
    expect((error as Error).message).toMatch(/queue: malformed JSON/i);
  });
});

describe('promoted columns that hold rubbish', () => {
  it('still lists a product whose numeric columns hold text', async () => {
    const product = await createProductLocally({ name: 'Cement bag', price: 380, stockQuantity: 10 }, options());
    // Text in numeric columns: what a partially-migrated or third-party-edited file looks like.
    raw.prepare("UPDATE products SET price = 'abc', stock_quantity = '' WHERE local_id = ?").run(product.localId);

    const page = await localProductPage(BIZ, {}, txn);

    // The document is the source of truth for a screen; the columns exist for filtering.
    expect(page.products[0]).toMatchObject({ name: 'Cement bag', price: 380, stockQuantity: 10 });
  });

  it('does not turn a text quantity into NaN in the stock projection', async () => {
    const product = await createProductLocally({ name: 'Cement bag', price: 380, stockQuantity: 10 }, options());
    raw
      .prepare(
        `INSERT INTO outbox (op_id, business_id, entity_type, entity_local_id, op_type, payload, status, created_at, updated_at)
         VALUES ('op-text', ?, 'invoices', 'inv-1', 'create', ?, 'pending', ?, ?)`
      )
      .run(BIZ, JSON.stringify({ items: [{ productId: product.localId, quantity: 'three' }] }), T0, T0);

    const stock = (await localProductPage(BIZ, {}, txn)).products[0].stockQuantity;

    expect(Number.isFinite(stock)).toBe(true);
    expect(stock).toBe(10);
  });
});

describe('a database that is broken underneath us', () => {
  it('raises on a missing table rather than answering with an empty page', async () => {
    raw.exec('DROP TABLE products');

    const error = await caught(() => localProductPage(BIZ, {}, txn));

    // An empty page would read as "this shop has no products". Raising is what sends
    // localFirst to the network instead — it falls back on any error, not only DatabaseError.
    expect((error as Error)?.message).toMatch(/no such table: products/);
  });

  it('reports a broken store on the paths that guard the fallback decision', async () => {
    raw.exec('DROP TABLE products');

    const error = await caught(() => hasLocalData('products', BIZ, txn));

    // This one decides whether a local read is trusted at all, so it speaks in DatabaseError.
    expect(isDatabaseError(error) && error.code).toBe('DB_QUERY_FAILED');
  });

  it('reports a file that is not a database as a DatabaseError', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'billji-corrupt-')), 'billji.db');
    writeFileSync(path, 'this is not an SQLite file, it is a photo of one');
    const damaged = new DatabaseSync(path);

    const error = await caught(() => localProductPage(BIZ, {}, adaptSqlite(damaged)));

    expect(isDatabaseError(error) && error.code).toBe('DB_QUERY_FAILED');
    damaged.close();
  });

  it('reports a truncated database the same way, without inventing an empty result', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'billji-truncated-')), 'billji.db');
    // A real header, then nothing: the shape a half-written file has after a forced shutdown.
    writeFileSync(path, `SQLite format 3 ${' '.repeat(64)}`);
    const damaged = new DatabaseSync(path);

    const error = await caught(() => localProductPage(BIZ, {}, adaptSqlite(damaged)));

    // An empty page would read as "this shop has no products", which is a lie a sync would
    // then act on. A raised error sends the caller to the network instead.
    expect(isDatabaseError(error)).toBe(true);
    damaged.close();
  });
});
