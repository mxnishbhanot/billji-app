import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { listOperations } from '../../db/outbox';
import { localVendors } from '../../db/readModel';
import { getSupplier } from '../../db/supplierRepository';
import { createSupplierLocally, updateSupplierLocally } from '../../db/supplierWrites';
import { openTestDatabase } from '../../db/__tests__/realSqlite';
import { mergeRecord } from '../pullEngine';
import { createPushEngine, toWireOperation, type PushResponse, type PushTransport } from '../pushEngine';

/**
 * The offline supplier lifecycle. The wire calls them vendors and the local store calls them
 * suppliers, so the naming crossing is asserted here rather than assumed.
 */

const BIZ = 'biz-1';
const T0 = '2026-08-02T10:00:00.000Z';

let raw: DatabaseSync;
let txn: SQLiteDatabase;

const options = () => ({ businessId: BIZ, txn, now: T0 });

const opsFor = (entityLocalId: string) =>
  listOperations({ businessId: BIZ, entityType: 'suppliers', entityLocalId, txn });

const acceptAll = (serverId: string): PushTransport => async (body) => ({
  results: body.ops.map((op) => ({ opId: op.opId, status: 'ok' as const, serverId, version: 1 }))
});

const engine = (transport: PushTransport) =>
  createPushEngine({ businessId: BIZ, transport, txn, clock: () => T0 });

beforeEach(async () => {
  ({ raw, txn } = await openTestDatabase());
});

afterEach(() => raw.close());

describe('pushing what was written offline', () => {
  it('sends a supplier as a vendor', async () => {
    const record = await createSupplierLocally({ name: 'Sharma Cement Depot' }, options());
    const [create] = await opsFor(record.localId);

    expect(toWireOperation(create)?.entity).toBe('vendor');
  });

  it('drains a create and leaves the supplier synced under its server id', async () => {
    const record = await createSupplierLocally(
      { name: 'Sharma Cement Depot', phone: '9000011111', isActive: true },
      options()
    );

    const outcome = await engine(acceptAll('srv-4')).push();

    expect(outcome.done).toBe(1);
    const stored = await getSupplier(record.localId, txn);
    expect(stored?.serverId).toBe('srv-4');
    expect(stored?.syncState).toBe('synced');
    expect((await localVendors(BIZ, 'sharma', txn))[0]._id).toBe('srv-4');
  });

  it('sends an edit made before the create came back against the earned server id', async () => {
    const record = await createSupplierLocally({ name: 'Sharma Cement Depot' }, options());
    await updateSupplierLocally(record.localId, { phone: '9000011111' }, options());

    const sent: string[] = [];
    await engine(async (body): Promise<PushResponse> => {
      sent.push(...body.ops.map((op) => `${op.entity}:${op.opType}:${op.targetId ?? 'none'}`));
      return { results: body.ops.map((op) => ({ opId: op.opId, status: 'ok' as const, serverId: 'srv-4', version: 2 })) };
    }).push();

    expect(sent).toEqual(['vendor:create:none', 'vendor:update:srv-4']);
    expect((await getSupplier(record.localId, txn))?.syncState).toBe('synced');
  });

  it('keeps the supplier and the queued work when the push fails', async () => {
    const record = await createSupplierLocally({ name: 'Sharma Cement Depot' }, options());

    const outcome = await engine(async () => {
      throw new Error('Network request failed');
    }).push();

    expect(outcome.retried).toBe(1);
    expect((await getSupplier(record.localId, txn))?.doc?.name).toBe('Sharma Cement Depot');
    expect((await opsFor(record.localId))[0].status).toBe('pending');
  });

  it('marks the row in conflict when the server rejects the base version', async () => {
    const record = await createSupplierLocally({ name: 'Sharma Cement Depot' }, options());
    await engine(acceptAll('srv-4')).push();
    await updateSupplierLocally(record.localId, { email: 'accounts@sharma.example' }, options());

    await engine(async (body): Promise<PushResponse> => ({
      results: body.ops.map((op) => ({ opId: op.opId, status: 'conflict' as const, message: 'Version conflict' }))
    })).push();

    expect((await getSupplier(record.localId, txn))?.syncState).toBe('conflict');
    expect((await opsFor(record.localId)).at(-1)?.status).toBe('conflict');
  });
});

describe('pulling back what this device pushed', () => {
  it('does not escalate a supplier the server has just accepted', async () => {
    const record = await createSupplierLocally({ name: 'Sharma Cement Depot' }, options());
    await engine(acceptAll('srv-4')).push();

    const outcome = await mergeRecord(
      txn,
      'suppliers',
      { _id: 'srv-4', clientId: record.localId, name: 'Sharma Cement Depot', outstandingPayable: 7500, version: 2 },
      { businessId: BIZ, now: T0 }
    );

    expect(outcome).toBe('updated');
    const stored = await getSupplier(record.localId, txn);
    expect(stored?.syncState).toBe('synced');
    expect(stored?.doc?.outstandingPayable).toBe(7500);
  });

  it('keeps the local edit and never takes the payable from this device', async () => {
    const record = await createSupplierLocally({ name: 'Sharma Cement Depot', phone: '9000011111' }, options());
    await engine(acceptAll('srv-4')).push();
    // The shop fixes the name offline while the server posts a bill against the account.
    await updateSupplierLocally(record.localId, { name: 'Sharma Cement Depot Pvt Ltd', outstandingPayable: 0 }, options());

    const outcome = await mergeRecord(
      txn,
      'suppliers',
      {
        _id: 'srv-4',
        clientId: record.localId,
        name: 'Sharma Cement Depot',
        phone: '9000011111',
        gstNumber: '29ABCDE1234F1Z5',
        outstandingPayable: 12000,
        version: 3
      },
      { businessId: BIZ, now: T0 }
    );

    expect(outcome).toBe('conflict');
    const stored = await getSupplier(record.localId, txn);
    expect(stored?.doc?.name).toBe('Sharma Cement Depot Pvt Ltd');
    // The field only the server changed survives, and its arithmetic is untouched.
    expect(stored?.doc?.gstNumber).toBe('29ABCDE1234F1Z5');
    expect(stored?.doc?.outstandingPayable).toBe(12000);
    expect(stored?.syncState).toBe('pending');
  });
});
