import type { SQLiteDatabase } from 'expo-sqlite';
import type { EntityDocument, WriteOptions } from './entityRepository';
import type { EntityType, MongoDoc } from './mappers';
import { discardOperation, enqueueOperation, listOperations, type OutboxOperation } from './outbox';
import { withTransaction } from './transaction';

/**
 * Writes that work with no network: the row and the intent to send it, written in one
 * transaction.
 *
 * That pairing is the whole design. A row without a queued operation is a change the server
 * will never hear about; an operation without a row is a screen that forgot what the user
 * typed. Either one alone is a bug, so neither is possible here — the transaction commits
 * both or neither.
 *
 *   screen -> endpoints -> entityWrites -> the entity's table
 *                                       -> outbox -> push engine -> /sync/push
 *
 * Ordering is per record, enforced with dependencies rather than hope: every operation for a
 * record depends on the last unsent one for that same record, so a create can never be
 * overtaken by the edit that follows it — even though the push engine is free to send a
 * batch's members concurrently.
 *
 * Parameterised over the repository rather than the table: an entity's own file supplies its
 * CRUD and gets the queueing for free, which is what keeps products and customers from
 * drifting into two subtly different offline stories.
 */

export type LocalWriteOptions = {
  businessId: string;
  now?: string;
  /** Join a transaction already in progress — an invoice that also creates its customer. */
  txn?: SQLiteDatabase;
  /**
   * Operations that must be accepted first, beyond this record's own chain. A purchase bill
   * against a supplier created moments ago cannot be sent before that supplier exists.
   */
  dependsOn?: string[];
};

export type EntityWritesConfig<TDoc extends MongoDoc> = {
  entity: EntityType;
  get: (localId: string, txn?: SQLiteDatabase) => Promise<EntityDocument<TDoc> | null>;
  getByServerId: (serverId: string, txn?: SQLiteDatabase) => Promise<EntityDocument<TDoc> | null>;
  create: (doc: TDoc, options?: WriteOptions) => Promise<EntityDocument<TDoc>>;
  update: (localId: string, patch: Partial<TDoc>, options?: WriteOptions) => Promise<EntityDocument<TDoc> | null>;
  softDelete: (localId: string, options?: WriteOptions) => Promise<boolean>;
  /** Why a never-sent create is abandoned when the record is deleted before it syncs. */
  discardReason: string;
};

export const createEntityWrites = <TDoc extends MongoDoc>(config: EntityWritesConfig<TDoc>) => {
  const { entity } = config;

  /** Everything queued for this record that the server has not accepted yet. */
  const openOperations = (businessId: string, entityLocalId: string, db: SQLiteDatabase): Promise<OutboxOperation[]> =>
    listOperations({
      businessId,
      entityType: entity,
      entityLocalId,
      status: ['pending', 'inflight', 'failed', 'conflict'],
      txn: db
    });

  const chainOn = async (
    businessId: string,
    entityLocalId: string,
    db: SQLiteDatabase,
    extra: string[] = []
  ): Promise<string[]> => {
    const operations = await openOperations(businessId, entityLocalId, db);
    const previous = operations[operations.length - 1];
    return [...new Set([...(previous ? [previous.opId] : []), ...extra])];
  };

  /**
   * Finds a record by whichever id the caller has. Screens hold the `_id` of the read model,
   * which is the server id once the record has synced and the local id before that.
   */
  const findByAnyId = async (id: string, txn?: SQLiteDatabase): Promise<EntityDocument<TDoc> | null> =>
    (await config.getByServerId(id, txn)) ?? (await config.get(id, txn));

  /** Writes the record and queues the create. The row's local id is the create's clientId. */
  const createLocally = (doc: TDoc, options: LocalWriteOptions): Promise<EntityDocument<TDoc>> =>
    withTransaction(async (db) => {
      const record = await config.create(doc, { businessId: options.businessId, now: options.now, txn: db });

      await enqueueOperation(
        {
          businessId: options.businessId,
          entityType: entity,
          entityLocalId: record.localId,
          opType: 'create',
          // clientId travels with the payload so the server's response — and every later
          // pull — lands back on this row rather than inserting a duplicate.
          payload: { ...(record.doc ?? {}), clientId: record.localId },
          dependsOn: options.dependsOn
        },
        { txn: db, now: options.now }
      );

      return record;
    }, options.txn);

  /**
   * Applies the patch locally and queues it. Only the changed fields are sent: the conflict
   * resolver reads this payload as "what this device changed", and a whole-document push
   * would claim every untouched field as an edit.
   */
  const updateLocally = (
    localId: string,
    patch: Partial<TDoc>,
    options: LocalWriteOptions
  ): Promise<EntityDocument<TDoc> | null> =>
    withTransaction(async (db) => {
      const dependsOn = await chainOn(options.businessId, localId, db, options.dependsOn);
      const record = await config.update(localId, patch, {
        businessId: options.businessId,
        now: options.now,
        txn: db
      });
      if (!record) return null;

      await enqueueOperation(
        {
          businessId: options.businessId,
          entityType: entity,
          entityLocalId: localId,
          opType: 'update',
          payload: { ...patch, clientId: localId, targetId: record.serverId ?? undefined },
          // What the edit was authored against. The server compares it and reports a
          // conflict rather than silently overwriting a newer revision.
          baseVersion: record.version,
          dependsOn
        },
        { txn: db, now: options.now }
      );

      return record;
    }, options.txn);

  /**
   * Soft-deletes the record and queues the delete.
   *
   * A record the server has never seen is the exception: there is nothing to delete there,
   * so the queued create is discarded instead of being followed by a delete for an id that
   * does not exist. Only a create still sitting in `pending` qualifies — once it is inflight
   * the server may already have it, and a delete is the honest way to take it back.
   */
  const deleteLocally = (localId: string, options: LocalWriteOptions): Promise<boolean> =>
    withTransaction(async (db) => {
      const existing = await config.get(localId, db);
      if (!existing || existing.deletedAt) return false;

      const operations = await openOperations(options.businessId, localId, db);
      const unsentCreate =
        !existing.serverId && operations.length > 0 && operations.every((operation) => operation.status === 'pending')
          ? operations[0]
          : null;

      const deleted = await config.softDelete(localId, {
        businessId: options.businessId,
        now: options.now,
        txn: db
      });
      if (!deleted) return false;

      if (unsentCreate) {
        // Cascades to every queued edit of this record — they described something that will
        // now never exist.
        await discardOperation(unsentCreate.opId, { txn: db, now: options.now, reason: config.discardReason });
        return true;
      }

      await enqueueOperation(
        {
          businessId: options.businessId,
          entityType: entity,
          entityLocalId: localId,
          opType: 'delete',
          payload: { clientId: localId, targetId: existing.serverId ?? undefined },
          baseVersion: existing.version,
          dependsOn: [
            ...new Set([...(operations.length ? [operations[operations.length - 1].opId] : []), ...(options.dependsOn ?? [])])
          ]
        },
        { txn: db, now: options.now }
      );

      return true;
    }, options.txn);

  return { findByAnyId, createLocally, updateLocally, deleteLocally };
};
