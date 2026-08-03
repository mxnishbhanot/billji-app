import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getProduct } from '../../db/productRepository';
import { createProductLocally, updateProductLocally } from '../../db/productWrites';
import { getOperation, listOperations, markOperationConflict, retryOperation } from '../../db/outbox';
import { openTestDatabase } from '../../db/__tests__/realSqlite';
import { acknowledgePush } from '../pushAck';
import { createPushEngine, type PushTransport } from '../pushEngine';
import {
  readConflictServerRecord,
  rebaseKeepLocal,
  rebasePatch,
  storeConflictServerRecord
} from '../keepLocal';

const BIZ = 'biz-1';
const T0 = '2026-08-02T10:00:00.000Z';

let raw: DatabaseSync;
let txn: SQLiteDatabase;

const options = () => ({ businessId: BIZ, txn, now: T0 });

const opsFor = (entityLocalId: string) =>
  listOperations({ businessId: BIZ, entityType: 'products', entityLocalId, txn });

beforeEach(async () => {
  ({ raw, txn } = await openTestDatabase());
});

afterEach(() => raw.close());

const seedSyncedProduct = async () => {
  const record = await createProductLocally({ name: 'Cement bag', price: 380, stockQuantity: 10 }, options());
  const [create] = await opsFor(record.localId);
  raw.prepare(`UPDATE outbox SET status = 'done' WHERE op_id = ?`).run(create.opId);
  await acknowledgePush(
    { ...create, status: 'done' },
    { status: 'ok', serverId: 'srv-p1', version: 1, record: { _id: 'srv-p1', name: 'Cement bag', price: 380, stockQuantity: 10, version: 1, clientId: record.localId } },
    { businessId: BIZ, txn, now: T0 }
  );
  return record;
};

describe('rebasePatch', () => {
  it('drops envelope and server-owned stock fields', () => {
    expect(
      rebasePatch('products', {
        name: 'Mine',
        price: 99,
        stockQuantity: 999,
        version: 2,
        _id: 'srv',
        clientId: 'local'
      })
    ).toEqual({ name: 'Mine', price: 99 });
  });
});

describe('Keep Local after a VERSION_CONFLICT', () => {
  it('rebases onto the server version and preserves local edits', async () => {
    const record = await seedSyncedProduct();
    await updateProductLocally(record.localId, { name: 'Local name', price: 420 }, options());
    const [update] = (await opsFor(record.localId)).filter((op) => op.opType === 'update');
    expect(update.baseVersion).toBe(1);

    await storeConflictServerRecord(
      update.opId,
      { _id: 'srv-p1', name: 'Server name', price: 380, stockQuantity: 7, version: 3, clientId: record.localId },
      { txn, now: T0 }
    );
    await markOperationConflict(update.opId, 'This record changed since your last edit', { txn, now: T0 });
    raw.prepare(`UPDATE products SET sync_state = 'conflict' WHERE local_id = ?`).run(record.localId);

    const result = await rebaseKeepLocal(update.opId, { businessId: BIZ, txn, now: T0 });

    expect(result.baseVersion).toBe(3);
    expect(result.newOpId).toBeTruthy();
    expect(result.fields).toEqual(expect.arrayContaining(['name', 'price']));

    const stale = await getOperation(update.opId, txn);
    expect(stale?.status).toBe('done');

    const [fresh] = (await opsFor(record.localId)).filter((op) => op.status === 'pending');
    expect(fresh.opId).toBe(result.newOpId);
    expect(fresh.baseVersion).toBe(3);
    expect(fresh.payload).toMatchObject({ name: 'Local name', price: 420, targetId: 'srv-p1' });
    expect(fresh.payload?.stockQuantity).toBeUndefined();

    const stored = await getProduct(record.localId, txn);
    expect(stored?.version).toBe(3);
    expect(stored?.syncState).toBe('pending');
    expect(stored?.doc).toMatchObject({ name: 'Local name', price: 420, stockQuantity: 7 });
    expect(await readConflictServerRecord(update.opId, txn)).toBeNull();
  });

  it('survives multiple consecutive conflicts by advancing baseVersion each time', async () => {
    const record = await seedSyncedProduct();
    await updateProductLocally(record.localId, { price: 400 }, options());
    let [update] = (await opsFor(record.localId)).filter((op) => op.opType === 'update' && op.status === 'pending');

    for (const serverVersion of [2, 3, 4]) {
      await storeConflictServerRecord(
        update.opId,
        { _id: 'srv-p1', name: 'Cement bag', price: 380, stockQuantity: 10, version: serverVersion, clientId: record.localId },
        { txn, now: T0 }
      );
      await markOperationConflict(update.opId, 'VERSION_CONFLICT', { txn, now: T0 });

      const result = await rebaseKeepLocal(update.opId, { businessId: BIZ, txn, now: T0 });
      expect(result.baseVersion).toBe(serverVersion);

      const pending = (await opsFor(record.localId)).filter((op) => op.status === 'pending');
      expect(pending).toHaveLength(1);
      expect(pending[0].baseVersion).toBe(serverVersion);
      expect(pending[0].payload).toMatchObject({ price: 400 });
      update = pending[0];
    }
  });

  it('pushes the rebased op through the outbox with the new baseVersion', async () => {
    const record = await seedSyncedProduct();
    await updateProductLocally(record.localId, { name: 'Kept locally' }, options());
    const [update] = (await opsFor(record.localId)).filter((op) => op.opType === 'update');

    await acknowledgePush(
      update,
      {
        status: 'conflict',
        code: 'VERSION_CONFLICT',
        message: 'stale',
        version: 5,
        record: { _id: 'srv-p1', name: 'Server', price: 380, stockQuantity: 10, version: 5, clientId: record.localId }
      } as never,
      { businessId: BIZ, txn, now: T0 }
    );
    await markOperationConflict(update.opId, 'stale', { txn, now: T0 });

    expect(await readConflictServerRecord(update.opId, txn)).toMatchObject({ version: 5 });

    await rebaseKeepLocal(update.opId, { businessId: BIZ, txn, now: T0 });

    const seen: { baseVersion?: number | null; name?: string }[] = [];
    const transport: PushTransport = async (body) => {
      for (const op of body.ops) {
        seen.push({ baseVersion: op.baseVersion, name: (op.payload as { name?: string })?.name });
      }
      return {
        results: body.ops.map((op) => ({
          opId: op.opId,
          status: 'ok' as const,
          serverId: 'srv-p1',
          version: 6
        }))
      };
    };

    const outcome = await createPushEngine({ businessId: BIZ, transport, txn, clock: () => T0 }).push();
    expect(outcome.done).toBe(1);
    expect(seen).toEqual([{ baseVersion: 5, name: 'Kept locally' }]);
    expect((await getProduct(record.localId, txn))?.syncState).toBe('synced');
  });

  it('keeps existing Retry behavior: same op and baseVersion, no rebase', async () => {
    const record = await seedSyncedProduct();
    await updateProductLocally(record.localId, { price: 410 }, options());
    const [update] = (await opsFor(record.localId)).filter((op) => op.opType === 'update');
    await markOperationConflict(update.opId, 'stale', { txn, now: T0 });

    await retryOperation(update.opId, { txn, now: T0 });

    const retried = await getOperation(update.opId, txn);
    expect(retried).toMatchObject({
      opId: update.opId,
      status: 'pending',
      baseVersion: 1,
      payload: expect.objectContaining({ price: 410 })
    });
    // Contrast: Keep Local would retire this op and enqueue a new one with a newer baseVersion.
    expect((await opsFor(record.localId)).filter((op) => op.opType === 'update')).toHaveLength(1);
  });

  it('uses fetchServer when the 409 did not stash a record', async () => {
    const record = await seedSyncedProduct();
    await updateProductLocally(record.localId, { name: 'Offline edit' }, options());
    const [update] = (await opsFor(record.localId)).filter((op) => op.opType === 'update');
    await markOperationConflict(update.opId, 'stale', { txn, now: T0 });

    const fetchServer = jest.fn(async () => ({
      _id: 'srv-p1',
      name: 'Fetched',
      price: 380,
      stockQuantity: 3,
      version: 8,
      clientId: record.localId
    }));

    const result = await rebaseKeepLocal(update.opId, { businessId: BIZ, txn, now: T0, fetchServer });
    expect(fetchServer).toHaveBeenCalledWith('products', 'srv-p1');
    expect(result.baseVersion).toBe(8);
    expect((await getProduct(record.localId, txn))?.doc).toMatchObject({
      name: 'Offline edit',
      stockQuantity: 3
    });
  });
});
