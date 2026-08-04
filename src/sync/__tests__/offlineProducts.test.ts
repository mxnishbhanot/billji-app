import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { listOperations } from '../../db/outbox';
import { getProduct } from '../../db/productRepository';
import { createProductLocally, deleteProductLocally, updateProductLocally } from '../../db/productWrites';
import { localProductPage } from '../../db/readModel';
import { openTestDatabase } from '../../db/__tests__/realSqlite';
import { createPushEngine, type PushResponse, type PushTransport } from '../pushEngine';
import { mergeRecord } from '../pullEngine';
import { acknowledgePush, resolveTargetId } from '../pushAck';

/**
 * The offline product lifecycle end to end: written with no network, pushed when there is
 * one, and pulled back without the device mistaking its own accepted work for a conflict.
 */

const BIZ = 'biz-1';
const T0 = '2026-08-02T10:00:00.000Z';

let raw: DatabaseSync;
let txn: SQLiteDatabase;

const options = () => ({ businessId: BIZ, txn, now: T0 });

const opsFor = (entityLocalId: string) =>
  listOperations({ businessId: BIZ, entityType: 'products', entityLocalId, txn });

/** A push transport that accepts everything and hands back server ids. */
const acceptAll = (serverId: string): PushTransport => async (body) => ({
  results: body.ops.map((op) => ({ opId: op.opId, status: 'ok' as const, serverId, version: 1 }))
});

const engine = (transport: PushTransport) =>
  createPushEngine({ businessId: BIZ, transport, txn, clock: () => T0 });

beforeEach(async () => {
  ({ raw, txn } = await openTestDatabase());
});

afterEach(() => raw.close());

describe('acknowledging a push', () => {
  it('gives the row its server id and settles it, document included', async () => {
    const record = await createProductLocally({ name: 'Cement bag', price: 380 }, options());
    const [create] = await opsFor(record.localId);
    raw.prepare(`UPDATE outbox SET status = 'done' WHERE op_id = ?`).run(create.opId);

    await acknowledgePush({ ...create, status: 'done' }, { status: 'ok', serverId: 'srv-9', version: 1 }, {
      businessId: BIZ,
      txn,
      now: T0
    });

    const stored = await getProduct(record.localId, txn);
    expect(stored?.serverId).toBe('srv-9');
    expect(stored?.version).toBe(1);
    expect(stored?.syncState).toBe('synced');
    // The screens read the document, so the id has to be there too.
    expect(stored?.doc?._id).toBe('srv-9');
  });

  it('leaves the row pending while another edit is still queued', async () => {
    const record = await createProductLocally({ name: 'Cement bag', price: 380 }, options());
    await updateProductLocally(record.localId, { price: 420 }, options());
    const [create] = await opsFor(record.localId);
    raw.prepare(`UPDATE outbox SET status = 'done' WHERE op_id = ?`).run(create.opId);

    await acknowledgePush({ ...create, status: 'done' }, { status: 'ok', serverId: 'srv-9', version: 1 }, {
      businessId: BIZ,
      txn,
      now: T0
    });

    const stored = await getProduct(record.localId, txn);
    expect(stored?.serverId).toBe('srv-9');
    expect(stored?.syncState).toBe('pending');
  });

  it('marks the row in conflict when the server rejects the base version', async () => {
    const record = await createProductLocally({ name: 'Cement bag', price: 380 }, options());
    const [create] = await opsFor(record.localId);

    await acknowledgePush(create, { status: 'conflict' }, { businessId: BIZ, txn, now: T0 });

    expect((await getProduct(record.localId, txn))?.syncState).toBe('conflict');
  });

  it('names the record by the id the create earned, not the one the edit was queued with', async () => {
    const record = await createProductLocally({ name: 'Cement bag', price: 380 }, options());
    await updateProductLocally(record.localId, { price: 420 }, options());
    const [create, update] = await opsFor(record.localId);

    // The edit was queued before the create came back, so it carries no target.
    expect(update.payload?.targetId).toBeUndefined();

    await acknowledgePush({ ...create, status: 'done' }, { status: 'ok', serverId: 'srv-9' }, {
      businessId: BIZ,
      txn,
      now: T0
    });

    expect(await resolveTargetId(update, txn)).toBe('srv-9');
  });
});

describe('pushing what was written offline', () => {
  it('drains a create and leaves the product synced', async () => {
    const record = await createProductLocally({ name: 'Cement bag', price: 380 }, options());

    const outcome = await engine(acceptAll('srv-9')).push();

    expect(outcome.done).toBe(1);
    expect(outcome.hasMore).toBe(false);
    const stored = await getProduct(record.localId, txn);
    expect(stored?.serverId).toBe('srv-9');
    expect(stored?.syncState).toBe('synced');
  });

  it('keeps the product and the queued work when the push fails', async () => {
    const record = await createProductLocally({ name: 'Cement bag', price: 380 }, options());

    const outcome = await engine(async () => {
      throw new Error('Network request failed');
    }).push();

    expect(outcome.retried).toBe(1);
    expect((await getProduct(record.localId, txn))?.doc?.name).toBe('Cement bag');
    expect((await opsFor(record.localId))[0].status).toBe('pending');
  });

  it('sends the delete of a synced product and nothing for one the server never saw', async () => {
    const kept = await createProductLocally({ name: 'Cement bag', price: 380 }, options());
    await engine(acceptAll('srv-9')).push();
    await deleteProductLocally(kept.localId, options());

    const sent: string[] = [];
    const transport: PushTransport = async (body): Promise<PushResponse> => {
      sent.push(...body.ops.map((op) => `${op.opType}:${op.targetId}`));
      return { results: body.ops.map((op) => ({ opId: op.opId, status: 'ok' as const })) };
    };

    const unsent = await createProductLocally({ name: 'Typo', price: 1 }, options());
    await deleteProductLocally(unsent.localId, options());

    await engine(transport).push();

    expect(sent).toEqual(['delete:srv-9']);
    expect((await getProduct(unsent.localId, txn))?.deletedAt).toBeTruthy();
  });
});

describe('pulling back what this device pushed', () => {
  it('does not escalate a product the server has just accepted', async () => {
    const record = await createProductLocally({ name: 'Cement bag', price: 380 }, options());
    await engine(acceptAll('srv-9')).push();

    const outcome = await mergeRecord(
      txn,
      'products',
      { _id: 'srv-9', clientId: record.localId, name: 'Cement bag', price: 380, stockQuantity: 12, version: 2 },
      { businessId: BIZ, now: T0 }
    );

    expect(outcome).toBe('updated');
    const stored = await getProduct(record.localId, txn);
    expect(stored?.syncState).toBe('synced');
    expect(stored?.doc?.stockQuantity).toBe(12);
  });

  it('merges a concurrent edit and never takes stock from this device', async () => {
    const record = await createProductLocally({ name: 'Cement bag', price: 380, stockQuantity: 10 }, options());
    await engine(acceptAll('srv-9')).push();
    // Two writers: the shop edits the price offline while the server counts stock down.
    await updateProductLocally(record.localId, { price: 400, stockQuantity: 10 }, options());

    const outcome = await mergeRecord(
      txn,
      'products',
      { _id: 'srv-9', clientId: record.localId, name: 'Cement bag', price: 380, stockQuantity: 4, version: 3 },
      { businessId: BIZ, now: T0 }
    );

    expect(outcome).toBe('conflict');
    const stored = await getProduct(record.localId, txn);
    // Local price kept, server stock kept, and the row still has to be pushed.
    expect(stored?.doc?.price).toBe(400);
    expect(stored?.doc?.stockQuantity).toBe(4);
    expect(stored?.syncState).toBe('pending');
  });

  it('shows the merged product to search under its server id', async () => {
    const record = await createProductLocally({ name: 'Cement bag', price: 380, isActive: true }, options());
    await engine(acceptAll('srv-9')).push();

    const page = await localProductPage(BIZ, { search: 'cement', page: 1, limit: 20 }, txn);
    expect(page.products).toHaveLength(1);
    expect(page.products[0]._id).toBe('srv-9');
    expect(record.serverId).toBeNull();
  });
});
