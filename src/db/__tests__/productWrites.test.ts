import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { listOperations } from '../outbox';
import { getProduct } from '../productRepository';
import {
  createProductLocally,
  deleteProductLocally,
  findProductByAnyId,
  updateProductLocally
} from '../productWrites';
import { localProductPage } from '../readModel';
import { openTestDatabase } from './realSqlite';

const BIZ = 'biz-1';
let raw: DatabaseSync;
let txn: SQLiteDatabase;

const options = () => ({ businessId: BIZ, txn });

const queue = (entityLocalId?: string) =>
  listOperations({ businessId: BIZ, entityType: 'products', entityLocalId, txn });

/** A product the server already knows about, as a pull would have left it. */
const synced = async (name: string, serverId: string) => {
  const record = await createProductLocally({ name, price: 100 }, options());
  raw
    .prepare(`UPDATE products SET server_id = ?, version = 3, sync_state = 'synced' WHERE local_id = ?`)
    .run(serverId, record.localId);
  raw.prepare(`UPDATE outbox SET status = 'done' WHERE entity_local_id = ?`).run(record.localId);
  return record.localId;
};

beforeEach(async () => {
  ({ raw, txn } = await openTestDatabase());
});

afterEach(() => raw.close());

describe('create', () => {
  it('writes the row and queues the create in one transaction', async () => {
    const record = await createProductLocally(
      { name: 'Cement bag', price: 380, stockQuantity: 12 },
      options()
    );

    expect(record.syncState).toBe('pending');
    expect(record.serverId).toBeNull();

    const [operation] = await queue(record.localId);
    expect(operation.opType).toBe('create');
    expect(operation.status).toBe('pending');
    expect(operation.priority).toBe(3);
    // The clientId is what lets the server's response land back on this exact row.
    expect(operation.payload?.clientId).toBe(record.localId);
    expect(operation.payload?.name).toBe('Cement bag');
  });

  it('is visible to search before it has ever been synced', async () => {
    await createProductLocally({ name: 'Cement bag', price: 380, isActive: true }, options());
    await createProductLocally({ name: 'Steel rod', price: 620, isActive: true }, options());

    const page = await localProductPage(BIZ, { search: 'cement', page: 1, limit: 20 }, txn);

    expect(page.products.map((product) => product.name)).toEqual(['Cement bag']);
    // No server id yet, so the row's local id stands in — the screen can still edit it.
    expect(page.products[0]._id).toBeTruthy();
    expect(await findProductByAnyId(page.products[0]._id, txn)).not.toBeNull();
  });
});

describe('update', () => {
  it('queues only the changed fields, against the version it was authored on', async () => {
    const localId = await synced('Cement bag', 'srv-1');

    const updated = await updateProductLocally(localId, { price: 400 }, options());

    expect(updated?.doc?.price).toBe(400);
    expect(updated?.doc?.name).toBe('Cement bag');
    expect(updated?.syncState).toBe('pending');

    const operations = await queue(localId);
    const update = operations[operations.length - 1];
    expect(update.opType).toBe('update');
    expect(update.payload).toEqual({ price: 400, clientId: localId, targetId: 'srv-1' });
    expect(update.baseVersion).toBe(3);
  });

  it('chains an edit behind the create it follows, so it cannot overtake it', async () => {
    const record = await createProductLocally({ name: 'Cement bag', price: 380 }, options());
    await updateProductLocally(record.localId, { price: 420 }, options());
    await updateProductLocally(record.localId, { category: 'Building' }, options());

    const [create, first, second] = await queue(record.localId);
    expect(first.dependsOn).toEqual([create.opId]);
    expect(second.dependsOn).toEqual([first.opId]);
    // Still unsent, so it has no server id to target — the clientId identifies the record.
    expect(first.payload?.targetId).toBeUndefined();
  });

  it('does nothing for a product that is already deleted', async () => {
    const localId = await synced('Cement bag', 'srv-1');
    await deleteProductLocally(localId, options());

    expect(await updateProductLocally(localId, { price: 999 }, options())).toBeNull();
  });
});

describe('delete', () => {
  it('tombstones a synced product and queues the delete', async () => {
    const localId = await synced('Cement bag', 'srv-1');

    expect(await deleteProductLocally(localId, options())).toBe(true);

    const stored = await getProduct(localId, txn);
    expect(stored?.deletedAt).toBeTruthy();
    expect(stored?.syncState).toBe('pending');

    const operations = await queue(localId);
    const remove = operations[operations.length - 1];
    expect(remove.opType).toBe('delete');
    expect(remove.payload?.targetId).toBe('srv-1');
    expect(remove.baseVersion).toBe(3);
  });

  it('discards the queued create instead of deleting a product the server never saw', async () => {
    const record = await createProductLocally({ name: 'Typo', price: 1 }, options());
    await updateProductLocally(record.localId, { price: 2 }, options());

    expect(await deleteProductLocally(record.localId, options())).toBe(true);

    const operations = await queue(record.localId);
    // Both the create and the edit that depended on it are abandoned, and no delete is sent
    // for an id the server does not have.
    expect(operations.map((operation) => operation.status)).toEqual(['dead', 'dead']);
    expect(operations.some((operation) => operation.opType === 'delete')).toBe(false);
  });

  it('drops the product out of local search results', async () => {
    const localId = await synced('Cement bag', 'srv-1');
    await deleteProductLocally(localId, options());

    const page = await localProductPage(BIZ, { search: 'cement', page: 1, limit: 20 }, txn);
    expect(page.products).toEqual([]);
  });

  it('refuses a second delete', async () => {
    const localId = await synced('Cement bag', 'srv-1');

    expect(await deleteProductLocally(localId, options())).toBe(true);
    expect(await deleteProductLocally(localId, options())).toBe(false);
  });
});
