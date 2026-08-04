import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { listOperations } from '../outbox';
import { applyReferralLocally, getLocalReferral } from '../referralWrites';
import { openTestDatabase } from './realSqlite';

/**
 * A referral code entered with no connection.
 *
 * What this file defends: the device records the code and the intent to send it, and NOTHING else. No
 * plan, no reward, no verdict on whether the code is any good — all of that is the server's, and the
 * row here is only what keeps the intent alive across an app kill.
 */

const BIZ = 'biz-1';
let raw: DatabaseSync;
let txn: SQLiteDatabase;

const queue = () => listOperations({ businessId: BIZ, entityType: 'referrals', txn });

beforeEach(async () => {
  ({ raw, txn } = await openTestDatabase());
});

afterEach(() => raw.close());

describe('applyReferralLocally', () => {
  it('writes the row and queues the operation in one transaction', async () => {
    const queued = await applyReferralLocally({ businessId: BIZ, code: 'billji8x', txn });

    const row = raw.prepare(`SELECT * FROM referrals WHERE local_id = ?`).get(queued.localId) as Record<string, unknown>;
    expect(row.code).toBe('BILLJI8X');
    expect(row.status).toBe('pending');
    expect(row.sync_state).toBe('pending');
    expect(row.server_id).toBeNull();

    const operations = await queue();
    expect(operations).toHaveLength(1);
    expect(operations[0].entityType).toBe('referrals');
    expect(operations[0].opType).toBe('create');
    expect(operations[0].payload).toEqual({ code: 'BILLJI8X', clientId: queued.localId });
  });

  it('queues at the money tier so it goes out ahead of catalogue work', async () => {
    await applyReferralLocally({ businessId: BIZ, code: 'BILLJI8X', txn });
    const [operation] = await queue();
    expect(operation.priority).toBe(1);
  });

  it('depends on nothing: the account already exists on the server by the time this can be queued', async () => {
    await applyReferralLocally({ businessId: BIZ, code: 'BILLJI8X', txn });
    const [operation] = await queue();
    expect(operation.dependsOn).toEqual([]);
  });

  it('carries the local id as clientId so a replayed push echo-matches instead of applying twice', async () => {
    const queued = await applyReferralLocally({ businessId: BIZ, code: 'BILLJI8X', txn });
    const [operation] = await queue();
    expect(operation.payload).toMatchObject({ clientId: queued.localId });
    expect(operation.entityLocalId).toBe(queued.localId);
  });

  it('grants nothing locally — no plan, no reward, only the code', async () => {
    await applyReferralLocally({ businessId: BIZ, code: 'BILLJI8X', txn });
    const row = raw.prepare(`SELECT * FROM referrals LIMIT 1`).get() as Record<string, unknown>;
    // The row's whole vocabulary is the code and where the operation has got to. There is deliberately
    // no plan, no period and no reward column for a client to write.
    expect(Object.keys(row).sort()).toEqual(
      [
        'business_id',
        'code',
        'deleted_at',
        'local_id',
        'local_updated_at',
        'payload',
        'server_id',
        'server_updated_at',
        'status',
        'sync_state',
        'version'
      ].sort()
    );
  });
});

describe('getLocalReferral', () => {
  it('returns nothing before a code is applied', async () => {
    expect(await getLocalReferral(BIZ, txn)).toBeNull();
  });

  it('finds the applied code, so a relaunch does not queue it twice', async () => {
    const queued = await applyReferralLocally({ businessId: BIZ, code: 'BILLJI8X', txn });
    const found = await getLocalReferral(BIZ, txn);
    expect(found?.localId).toBe(queued.localId);
    expect(found?.doc?.code).toBe('BILLJI8X');
  });
});
