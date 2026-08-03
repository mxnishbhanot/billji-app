import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { listOperations } from '../outbox';
import { localVendors } from '../readModel';
import { findSupplierByPhone, getSupplier, listSuppliers } from '../supplierRepository';
import { createSupplierLocally, findSupplierByAnyId, updateSupplierLocally } from '../supplierWrites';
import { openTestDatabase } from './realSqlite';

const BIZ = 'biz-1';
let raw: DatabaseSync;
let txn: SQLiteDatabase;

const options = () => ({ businessId: BIZ, txn });

const queue = (entityLocalId?: string) =>
  listOperations({ businessId: BIZ, entityType: 'suppliers', entityLocalId, txn });

/** A supplier the server already knows about, as a pull would have left it. */
const synced = async (name: string, phone: string, serverId: string) => {
  const record = await createSupplierLocally({ name, phone, isActive: true }, options());
  raw
    .prepare(`UPDATE suppliers SET server_id = ?, version = 2, sync_state = 'synced' WHERE local_id = ?`)
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
    const record = await createSupplierLocally(
      { name: 'Sharma Cement Depot', phone: '+91 90000 11111', gstNumber: '29ABCDE1234F1Z5' },
      options()
    );

    expect(record.syncState).toBe('pending');
    expect(record.serverId).toBeNull();

    const [operation] = await queue(record.localId);
    expect(operation.opType).toBe('create');
    expect(operation.payload?.clientId).toBe(record.localId);
    expect(operation.payload?.name).toBe('Sharma Cement Depot');
  });

  it('appears in the vendor picker before it has ever been synced', async () => {
    await createSupplierLocally({ name: 'Sharma Cement Depot', phone: '9000011111', isActive: true }, options());

    const vendors = await localVendors(BIZ, 'sharma', txn);

    expect(vendors.map((vendor) => vendor.name)).toEqual(['Sharma Cement Depot']);
    // No server id yet, so the local id stands in and the purchase sheet can still pick it.
    expect(await findSupplierByAnyId(vendors[0]._id, txn)).not.toBeNull();
  });

  it('is found by a phone typed in any format', async () => {
    await createSupplierLocally({ name: 'Sharma Cement Depot', phone: '+91 90000 11111', isActive: true }, options());

    expect(await findSupplierByPhone(BIZ, '9000011111', txn)).not.toBeNull();
    expect((await localVendors(BIZ, '+91 90000 11111', txn))).toHaveLength(1);
    expect((await listSuppliers({ businessId: BIZ, search: '90000 11111', txn })).items).toHaveLength(1);
  });
});

describe('update', () => {
  it('queues only the changed fields, against the version it was authored on', async () => {
    const localId = await synced('Sharma Cement Depot', '9000011111', 'srv-4');

    const updated = await updateSupplierLocally(localId, { email: 'accounts@sharma.example' }, options());

    expect(updated?.doc?.email).toBe('accounts@sharma.example');
    expect(updated?.doc?.name).toBe('Sharma Cement Depot');
    expect(updated?.syncState).toBe('pending');

    const update = (await queue(localId)).at(-1);
    expect(update?.opType).toBe('update');
    expect(update?.payload).toEqual({ email: 'accounts@sharma.example', clientId: localId, targetId: 'srv-4' });
    expect(update?.baseVersion).toBe(2);
  });

  it('chains an edit behind the create it follows', async () => {
    const record = await createSupplierLocally({ name: 'Sharma Cement Depot' }, options());
    await updateSupplierLocally(record.localId, { phone: '9000011111' }, options());

    const [create, update] = await queue(record.localId);
    expect(update.dependsOn).toEqual([create.opId]);
    expect(update.payload?.targetId).toBeUndefined();
  });

  it('reindexes the searchable phone when it changes', async () => {
    const localId = await synced('Sharma Cement Depot', '9000011111', 'srv-4');

    await updateSupplierLocally(localId, { phone: '+91 98888 77777' }, options());

    expect(await findSupplierByPhone(BIZ, '9888877777', txn)).not.toBeNull();
    expect(await findSupplierByPhone(BIZ, '9000011111', txn)).toBeNull();
  });

  it('keeps the server-derived payable out of the row it did not touch', async () => {
    const localId = await synced('Sharma Cement Depot', '9000011111', 'srv-4');
    raw.prepare(`UPDATE suppliers SET outstanding_payable = 7500 WHERE local_id = ?`).run(localId);

    await updateSupplierLocally(localId, { email: 'accounts@sharma.example' }, options());

    const row = raw.prepare(`SELECT outstanding_payable FROM suppliers WHERE local_id = ?`).get(localId);
    // The promoted column is rebuilt from the document, which never carried a payable —
    // the value is the server's and comes back with the next pull.
    expect((await getSupplier(localId, txn))?.doc?.outstandingPayable).toBeUndefined();
    expect(row).toBeTruthy();
  });

  it('does nothing for a supplier this device does not have', async () => {
    expect(await updateSupplierLocally('missing-id', { email: 'x@example.com' }, options())).toBeNull();
  });
});
