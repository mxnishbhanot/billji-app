import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { createProduct, getProduct, getProductByServerId } from '../../db/productRepository';
import { getSetting } from '../../db/settings';
import { openTestDatabase } from '../../db/__tests__/realSqlite';
import { createPullEngine, cursorKey, type PullPage, type PullTransport, type PullRecord } from '../pullEngine';

const BIZ = 'biz-1';
const T0 = '2026-08-02T10:00:00.000Z';

let raw: DatabaseSync;
let txn: SQLiteDatabase;

const page = (records: PullRecord[], nextCursor: string | null, hasMore = false): PullPage => ({
  records,
  nextCursor,
  hasMore
});

/** Answers with scripted pages per collection and records what was requested. */
const scripted = (pages: Record<string, PullPage[]>) => {
  const asked: { collection: string; cursor: string | null }[] = [];
  const remaining = Object.fromEntries(Object.entries(pages).map(([key, value]) => [key, [...value]]));

  const transport: PullTransport = async ({ collection, cursor }) => {
    asked.push({ collection, cursor });
    return remaining[collection]?.shift() ?? page([], cursor, false);
  };

  return { asked, transport };
};

const engine = (transport: PullTransport, overrides: Record<string, unknown> = {}) =>
  createPullEngine({
    businessId: BIZ,
    clock: () => T0,
    txn,
    transport,
    collections: ['products'],
    ...overrides
  });

const product = (id: string, extra: Partial<PullRecord> = {}): PullRecord => ({
  _id: id,
  name: `Product ${id}`,
  price: 100,
  stockQuantity: 5,
  version: 1,
  updatedAt: '2026-08-01T09:00:00.000Z',
  ...extra
});

beforeEach(async () => {
  ({ raw, txn } = await openTestDatabase());
});

afterEach(() => raw.close());

describe('cursor', () => {
  it('starts with no cursor, then sends back what the server gave it', async () => {
    const { asked, transport } = scripted({
      products: [page([product('p1')], 'cursor-1', true), page([product('p2')], 'cursor-2', false)]
    });
    const pull = engine(transport);

    await pull.pull();

    expect(asked).toEqual([
      { collection: 'products', cursor: null },
      { collection: 'products', cursor: 'cursor-1' }
    ]);
    expect(await pull.cursor('products')).toBe('cursor-2');
    expect(await getSetting(cursorKey('products'), txn)).toBe('cursor-2');
  });

  it('resumes from the stored cursor on the next pull', async () => {
    const first = scripted({ products: [page([product('p1')], 'cursor-1', false)] });
    await engine(first.transport).pull();

    const second = scripted({ products: [page([], 'cursor-1', false)] });
    await engine(second.transport).pull();

    expect(second.asked).toEqual([{ collection: 'products', cursor: 'cursor-1' }]);
  });

  it('does not advance the cursor when the page fails', async () => {
    const pull = engine(async () => {
      throw new Error('HTTP 500');
    });

    const outcome = await pull.pull();

    expect(outcome.collections[0]).toMatchObject({ error: 'HTTP 500', hasMore: true, pages: 0 });
    expect(await pull.cursor('products')).toBeNull();
  });

  it('re-reads from the beginning after a reset', async () => {
    const { asked, transport } = scripted({ products: [page([product('p1')], 'cursor-1', false)] });
    const pull = engine(transport);
    await pull.pull();

    await pull.resetCursors();
    expect(await pull.cursor('products')).toBeNull();

    await pull.pull();
    expect(asked.map((request) => request.cursor)).toEqual([null, null]);
  });
});

describe('pagination', () => {
  it('drains a collection until hasMore is false', async () => {
    const { transport } = scripted({
      products: [
        page([product('p1')], 'c1', true),
        page([product('p2')], 'c2', true),
        page([product('p3')], 'c3', false)
      ]
    });
    const pull = engine(transport);

    const outcome = await pull.pull();

    expect(outcome.collections[0]).toMatchObject({ pages: 3, applied: 3, hasMore: false });
    expect(await getProductByServerId('p3', txn)).not.toBeNull();
  });

  it('stops at the page ceiling and reports there is more', async () => {
    const { transport } = scripted({
      products: [page([product('p1')], 'c1', true), page([product('p2')], 'c2', true)]
    });

    const outcome = await engine(transport, { maxPages: 1 }).pull();

    expect(outcome.collections[0]).toMatchObject({ pages: 1, hasMore: true });
    expect(outcome.hasMore).toBe(true);
  });

  it('walks each collection with its own cursor', async () => {
    const { asked, transport } = scripted({
      products: [page([product('p1')], 'prod-cursor', false)],
      customers: [page([{ _id: 'c1', name: 'Ramesh', phone: '9876543210', updatedAt: T0 }], 'cust-cursor', false)]
    });
    const pull = engine(transport, { collections: ['products', 'customers'] });

    await pull.pull();

    expect(asked.map((request) => request.collection)).toEqual(['products', 'customers']);
    expect(await pull.cursor('products')).toBe('prod-cursor');
    expect(await pull.cursor('customers')).toBe('cust-cursor');
  });

  it('keeps one failing collection from stalling the others', async () => {
    const transport: PullTransport = async ({ collection, cursor }) => {
      if (collection === 'products') throw new Error('HTTP 503');
      return page([{ _id: 'c1', name: 'Ramesh', updatedAt: T0 }], cursor ?? 'cust-cursor', false);
    };

    const outcome = await engine(transport, { collections: ['products', 'customers'] }).pull();

    expect(outcome.collections.map((result) => [result.collection, result.error ?? null])).toEqual([
      ['products', 'HTTP 503'],
      ['customers', null]
    ]);
    expect(outcome.applied).toBe(1);
  });
});

describe('merge', () => {
  it('inserts a record the device has never seen', async () => {
    const { transport } = scripted({ products: [page([product('p1', { name: 'Cement' })], 'c1')] });

    await engine(transport).pull();

    const record = await getProductByServerId('p1', txn);
    expect(record?.doc).toMatchObject({ _id: 'p1', name: 'Cement' });
    expect(record?.syncState).toBe('synced');
    expect(raw.prepare('SELECT name, price FROM products').get()).toEqual({ name: 'Cement', price: 100 });
  });

  it('fast-forwards a synced row and re-promotes its columns', async () => {
    const { transport } = scripted({
      products: [page([product('p1', { name: 'Cement', price: 380 })], 'c1', true), page([], 'c1')]
    });
    const pull = engine(transport);
    await pull.pull();

    const updated = scripted({ products: [page([product('p1', { name: 'Cement 50kg', price: 420, version: 2 })], 'c2')] });
    await engine(updated.transport).pull();

    const record = await getProductByServerId('p1', txn);
    expect(record?.doc).toMatchObject({ name: 'Cement 50kg', price: 420 });
    expect(record?.version).toBe(2);
    // One row, not two: the merge is keyed on identity, not appended.
    expect(raw.prepare('SELECT COUNT(*) AS n FROM products').get()).toEqual({ n: 1 });
  });

  it('lands a server record onto the local row that created it, via clientId', async () => {
    const created = await createProduct({ name: 'Sand' }, { businessId: BIZ, txn });
    // The row is pending until the push is acknowledged; mark it synced as the push would.
    raw.prepare("UPDATE products SET sync_state = 'synced' WHERE local_id = ?").run(created.localId);

    const { transport } = scripted({
      products: [page([product('srv-1', { clientId: created.localId, name: 'Sand' })], 'c1')]
    });
    await engine(transport).pull();

    expect(raw.prepare('SELECT COUNT(*) AS n FROM products').get()).toEqual({ n: 1 });
    expect((await getProduct(created.localId, txn))?.serverId).toBe('srv-1');
  });

  it('applies a tombstone to a row it already holds, and ignores one it does not', async () => {
    const { transport } = scripted({ products: [page([product('p1')], 'c1', true), page([], 'c1')] });
    await engine(transport).pull();

    const deletion = scripted({
      products: [
        page(
          [
            { _id: 'p1', clientId: null, version: 2, updatedAt: T0, deletedAt: T0 },
            { _id: 'never-seen', version: 1, updatedAt: T0, deletedAt: T0 }
          ],
          'c2'
        )
      ]
    });
    const outcome = await engine(deletion.transport).pull();

    expect(outcome.collections[0]).toMatchObject({ deleted: 1, skipped: 1 });
    const record = await getProductByServerId('p1', txn);
    expect(record?.deletedAt).toBe(T0);
    expect(record?.syncState).toBe('synced');
    // The tombstone carries identity only — it must not wipe the payload it never sent.
    expect(record?.doc).toMatchObject({ name: 'Product p1' });
  });

  it('skips a record with no server id', async () => {
    const { transport } = scripted({ products: [page([{ name: 'Nameless', updatedAt: T0 }], 'c1')] });
    const outcome = await engine(transport).pull();

    expect(outcome.collections[0]).toMatchObject({ applied: 0, skipped: 1 });
  });
});

describe('conflict detection', () => {
  it('never overwrites a row with unsynced local edits', async () => {
    const local = await createProduct({ _id: 'p1', name: 'My price', price: 500 }, { businessId: BIZ, txn });
    expect(local.syncState).toBe('pending');

    const { transport } = scripted({
      products: [page([product('p1', { name: 'Their price', price: 900, version: 4 })], 'c1')]
    });
    const outcome = await engine(transport).pull();

    const record = await getProduct(local.localId, txn);
    expect(outcome.collections[0]).toMatchObject({ conflicts: 1, applied: 0 });
    expect(record?.syncState).toBe('conflict');
    // The user's edit survives untouched; the server revision it competes with is recorded.
    expect(record?.doc).toMatchObject({ name: 'My price', price: 500 });
    expect(raw.prepare('SELECT price FROM products').get()).toEqual({ price: 500 });
    expect(record).toMatchObject({ serverId: 'p1', version: 4 });
  });

  it('flags a delete-versus-edit as a conflict rather than dropping the edit', async () => {
    const local = await createProduct({ _id: 'p1', name: 'Still selling this' }, { businessId: BIZ, txn });

    const { transport } = scripted({
      products: [page([{ _id: 'p1', version: 3, updatedAt: T0, deletedAt: T0 }], 'c1')]
    });
    const outcome = await engine(transport).pull();

    const record = await getProduct(local.localId, txn);
    expect(outcome.collections[0]).toMatchObject({ conflicts: 1, deleted: 0 });
    expect(record?.syncState).toBe('conflict');
    expect(record?.deletedAt).toBeNull();
  });

  it('leaves an already-conflicted row conflicted', async () => {
    const local = await createProduct({ _id: 'p1', name: 'Mine' }, { businessId: BIZ, txn });
    raw.prepare("UPDATE products SET sync_state = 'conflict' WHERE local_id = ?").run(local.localId);

    const { transport } = scripted({ products: [page([product('p1', { name: 'Theirs', version: 9 })], 'c1')] });
    await engine(transport).pull();

    const record = await getProduct(local.localId, txn);
    expect(record?.syncState).toBe('conflict');
    expect(record?.doc).toMatchObject({ name: 'Mine' });
    expect(record?.version).toBe(9);
  });
});

describe('safety', () => {
  it('runs one pass at a time', async () => {
    const { transport } = scripted({ products: [page([product('p1')], 'c1')] });
    const pull = engine(transport);

    const [first, second] = await Promise.all([pull.pull(), pull.pull()]);

    expect([first.stopped, second.stopped]).toContain('busy');
    expect(pull.isPulling()).toBe(false);
  });

  it('stops starting collections once the deadline passes', async () => {
    const { asked, transport } = scripted({
      products: [page([product('p1')], 'c1', false)],
      customers: [page([], 'c2', false)]
    });
    const pull = engine(transport, { collections: ['products', 'customers'] });

    let tick = 0;
    const outcome = await pull.pull({ deadlineMs: 1_000, now: () => (tick++ < 2 ? 0 : 5_000) });

    expect(outcome.stopped).toBe('deadline');
    expect(asked.map((request) => request.collection)).toEqual(['products']);
    expect(outcome.hasMore).toBe(true);
  });

  it('applies a page and its cursor together, or neither', async () => {
    // A merge failure inside the page must not leave the cursor advanced past records the
    // device never stored.
    const pull = engine(async () => page([product('p1'), { _id: 'p2', name: null as never, updatedAt: T0 }], 'c1'));

    raw.prepare('DROP TABLE products').run();
    const outcome = await pull.pull();

    expect(outcome.collections[0].error).toBeTruthy();
    expect(await pull.cursor('products')).toBeNull();
  });
});
