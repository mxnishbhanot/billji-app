import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getCustomer } from '../customerRepository';
import {
  createCustomerLocally,
  deleteCustomerLocally,
  findCustomerByAnyId,
  updateCustomerLocally
} from '../customerWrites';
import { listOperations } from '../outbox';
import { localCustomerPage } from '../readModel';
import { openTestDatabase } from './realSqlite';

const BIZ = 'biz-1';
let raw: DatabaseSync;
let txn: SQLiteDatabase;

const options = () => ({ businessId: BIZ, txn });

const queue = (entityLocalId?: string) =>
  listOperations({ businessId: BIZ, entityType: 'customers', entityLocalId, txn });

/** A customer the server already knows about, as a pull would have left it. */
const synced = async (name: string, phone: string, serverId: string) => {
  const record = await createCustomerLocally({ name, phone }, options());
  raw
    .prepare(`UPDATE customers SET server_id = ?, version = 3, sync_state = 'synced' WHERE local_id = ?`)
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
    const record = await createCustomerLocally({ name: 'Ravi Traders', phone: '+91 98765 43210' }, options());

    expect(record.syncState).toBe('pending');
    expect(record.serverId).toBeNull();

    const [operation] = await queue(record.localId);
    expect(operation.opType).toBe('create');
    expect(operation.payload?.clientId).toBe(record.localId);
    expect(operation.payload?.name).toBe('Ravi Traders');
    // Masters share a priority tier: neither customers nor products may overtake money.
    expect(operation.priority).toBe(3);
  });

  it('is findable by the normalised phone before it has ever been synced', async () => {
    await createCustomerLocally({ name: 'Ravi Traders', phone: '+91 98765 43210' }, options());

    const page = await localCustomerPage(BIZ, { search: '9876543210', page: 1, limit: 20 }, txn);

    expect(page.customers.map((customer) => customer.name)).toEqual(['Ravi Traders']);
    // No server id yet, so the row's local id stands in — the screen can still edit it.
    expect(await findCustomerByAnyId(page.customers[0]._id, txn)).not.toBeNull();
  });
});

describe('update', () => {
  it('queues only the changed fields, against the version it was authored on', async () => {
    const localId = await synced('Ravi Traders', '9876543210', 'srv-1');

    const updated = await updateCustomerLocally(localId, { email: 'ravi@example.com' }, options());

    expect(updated?.doc?.email).toBe('ravi@example.com');
    expect(updated?.doc?.name).toBe('Ravi Traders');
    expect(updated?.syncState).toBe('pending');

    const operations = await queue(localId);
    const update = operations[operations.length - 1];
    expect(update.opType).toBe('update');
    expect(update.payload).toEqual({ email: 'ravi@example.com', clientId: localId, targetId: 'srv-1' });
    expect(update.baseVersion).toBe(3);
  });

  it('chains edits behind the create they follow', async () => {
    const record = await createCustomerLocally({ name: 'Ravi Traders', phone: '9876543210' }, options());
    await updateCustomerLocally(record.localId, { email: 'ravi@example.com' }, options());
    await updateCustomerLocally(record.localId, { gstNumber: '29ABCDE1234F1Z5' }, options());

    const [create, first, second] = await queue(record.localId);
    expect(first.dependsOn).toEqual([create.opId]);
    expect(second.dependsOn).toEqual([first.opId]);
  });

  it('reindexes the searchable phone when it changes', async () => {
    const localId = await synced('Ravi Traders', '9876543210', 'srv-1');

    await updateCustomerLocally(localId, { phone: '+91 90000 11111' }, options());

    expect((await localCustomerPage(BIZ, { search: '9000011111', page: 1, limit: 20 }, txn)).customers).toHaveLength(1);
    expect((await localCustomerPage(BIZ, { search: '9876543210', page: 1, limit: 20 }, txn)).customers).toEqual([]);
  });

  it('does nothing for a customer that is already deleted', async () => {
    const localId = await synced('Ravi Traders', '9876543210', 'srv-1');
    await deleteCustomerLocally(localId, options());

    expect(await updateCustomerLocally(localId, { email: 'x@example.com' }, options())).toBeNull();
  });
});

describe('delete', () => {
  it('tombstones a synced customer and queues the delete', async () => {
    const localId = await synced('Ravi Traders', '9876543210', 'srv-1');

    expect(await deleteCustomerLocally(localId, options())).toBe(true);

    const stored = await getCustomer(localId, txn);
    expect(stored?.deletedAt).toBeTruthy();
    expect(stored?.syncState).toBe('pending');

    const remove = (await queue(localId)).at(-1);
    expect(remove?.opType).toBe('delete');
    expect(remove?.payload?.targetId).toBe('srv-1');
    expect(remove?.baseVersion).toBe(3);
  });

  it('discards the queued create instead of deleting a customer the server never saw', async () => {
    const record = await createCustomerLocally({ name: 'Typo', phone: '9000000000' }, options());
    await updateCustomerLocally(record.localId, { email: 'typo@example.com' }, options());

    expect(await deleteCustomerLocally(record.localId, options())).toBe(true);

    const operations = await queue(record.localId);
    expect(operations.map((operation) => operation.status)).toEqual(['dead', 'dead']);
    expect(operations.some((operation) => operation.opType === 'delete')).toBe(false);
  });

  it('drops the customer out of local search results and refuses a second delete', async () => {
    const localId = await synced('Ravi Traders', '9876543210', 'srv-1');

    expect(await deleteCustomerLocally(localId, options())).toBe(true);
    expect((await localCustomerPage(BIZ, { search: 'ravi', page: 1, limit: 20 }, txn)).customers).toEqual([]);
    expect(await deleteCustomerLocally(localId, options())).toBe(false);
  });
});
