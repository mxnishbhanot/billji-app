import type { SQLiteDatabase } from 'expo-sqlite';
import { emitChange } from './changeBus';
import { upsertEntityRow } from './entityRepository';
import { fromRow, toRow, uuidv7, type EntityRow, type MongoDoc } from './mappers';
import { enqueueOperation } from './outbox';
import { withTransaction } from './transaction';

/**
 * Queues an APPLY_REFERRAL: the local row and the intent to send it, in one transaction — the same
 * pairing every other offline write in this app is built on (see entityWrites).
 *
 * Not built on createEntityWrites, deliberately. That factory exists for records the user creates,
 * edits, deletes, lists, searches and pages through; a referral is a single write-once row with no
 * update path, no delete path and no list. Wiring it through the factory would mean giving it an
 * is_active column and a search index it has no use for.
 *
 * What the device is allowed to decide here: nothing. It records the code the user typed and the fact
 * that it has not been sent yet. Validity, eligibility, the free month and the referrer's reward are
 * all server decisions, and they arrive back as a subscription through the normal billing read.
 */

export type ReferralRowDoc = MongoDoc & {
  code: string;
  status: 'pending' | 'converted' | 'void' | 'invalid';
  clientId: string;
};

export type QueuedReferral = {
  localId: string;
  opId: string;
  code: string;
};

export const applyReferralLocally = async ({
  businessId,
  code,
  now,
  txn
}: {
  businessId: string;
  code: string;
  now?: string;
  /** Join a transaction already in progress. Also how the suites inject a test database. */
  txn?: SQLiteDatabase;
}): Promise<QueuedReferral> => {
  const normalized = code.trim().toUpperCase();
  const localId = uuidv7();
  const stamp = now ?? new Date().toISOString();

  const { opId } = await withTransaction(async (db) => {
    const doc: ReferralRowDoc = { code: normalized, status: 'pending', clientId: localId };
    await upsertEntityRow(
      db,
      'referrals',
      toRow('referrals', doc, { businessId, localId, syncState: 'pending', now: stamp })
    );

    // No dependsOn: the account and the business already exist on the server by the time a session
    // exists to queue this at all, and a referral depends on nothing else the device may be holding.
    // Priority 1 (see OUTBOX_PRIORITY) puts it ahead of catalogue and master-data chains.
    const operation = await enqueueOperation(
      {
        businessId,
        entityType: 'referrals',
        entityLocalId: localId,
        opType: 'create',
        payload: { code: normalized, clientId: localId }
      },
      { txn: db, now: stamp }
    );

    return operation;
  }, txn);

  emitChange({ entity: 'referrals', type: 'created', localId, origin: 'local' });

  return { localId, opId, code: normalized };
};

/** The referral this device has queued or applied, if any. One per business in practice. */
export const getLocalReferral = async (businessId: string, txn?: SQLiteDatabase) =>
  withTransaction(async (db) => {
    const row = await db.getFirstAsync<EntityRow>(
      `SELECT * FROM referrals WHERE business_id = ? ORDER BY local_updated_at DESC LIMIT 1`,
      businessId
    );
    return row ? fromRow<ReferralRowDoc>(row) : null;
  }, txn);
