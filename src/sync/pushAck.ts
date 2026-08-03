import type { SQLiteDatabase } from 'expo-sqlite';
import { emitChange } from '../db/changeBus';
import { upsertEntityRow } from '../db/entityRepository';
import { fromRow, isUuid, toRow, type EntityRow, type EntityType, type MongoDoc } from '../db/mappers';
import { listOperations, type OutboxOperation } from '../db/outbox';
import { withTransaction } from '../db/transaction';

/**
 * What the local row learns from a push result.
 *
 * Marking the operation `done` is not enough. The row it describes is still `pending`, and a
 * pending row with nothing in the queue to explain it is exactly the state the conflict
 * resolver has to escalate — so without this write-back, every product created offline would
 * land on the Sync Issues screen the first time it was pulled back.
 *
 * Two things come back from an accepted push and both matter: the server id (the only way a
 * later edit can name the record) and the version (what the next edit is authored against).
 */

type AckOptions = { businessId: string; now?: string; txn?: SQLiteDatabase };

/** Any operation for this record, other than the one being acknowledged, still to be sent. */
const hasOtherOpenOperations = async (
  db: SQLiteDatabase,
  operation: OutboxOperation
): Promise<boolean> => {
  const operations = await listOperations({
    businessId: operation.businessId,
    entityType: operation.entityType,
    entityLocalId: operation.entityLocalId,
    status: ['pending', 'inflight', 'failed', 'conflict'],
    txn: db
  });
  return operations.some((other) => other.opId !== operation.opId);
};

/**
 * The id the server knows this record by, read from the row when the operation was queued
 * before the record had one — an edit made moments after an offline create.
 */
export const resolveTargetId = async (operation: OutboxOperation, txn?: SQLiteDatabase): Promise<string | null> => {
  const payload = (operation.payload ?? {}) as MongoDoc;
  const declared = payload.targetId ?? payload._id;
  if (typeof declared === 'string' && declared) return declared;
  if (operation.opType === 'create') return null;

  return withTransaction(async (db) => {
    const row = await db.getFirstAsync<EntityRow>(
      `SELECT server_id FROM ${operation.entityType} WHERE local_id = ?`,
      operation.entityLocalId
    );
    return row?.server_id == null ? null : String(row.server_id);
  }, txn);
};

/**
 * Payload fields that name another record, and the table that record lives in.
 *
 * A bill received offline against a supplier added the same morning carries that supplier's
 * *local* id, and the server's validator requires a Mongo id. The dependency graph already
 * guarantees the supplier is created first; this rewrites the reference once it has been,
 * which is the other half of the same promise.
 */
type PayloadReference = {
  path: string;
  entity: EntityType;
  /** The field sits on each line item rather than on the payload. */
  inItems?: boolean;
  /** The field is an array of ids — a receipt settling several bills at once. */
  isList?: boolean;
};

const PAYLOAD_REFERENCES: Partial<Record<EntityType, PayloadReference[]>> = {
  purchases: [
    { path: 'vendorId', entity: 'suppliers' },
    { path: 'productId', entity: 'products', inItems: true }
  ],
  // An invoice issued at the counter can name a customer added moments earlier and products
  // from the same morning's stock entry. Losing `customerId` is not survivable — the server
  // has nobody to bill — but the dependency graph means the op only reaches here once that
  // customer's own create has been accepted.
  invoices: [
    { path: 'customerId', entity: 'customers' },
    { path: 'productId', entity: 'products', inItems: true }
  ],
  // A receipt taken at the counter names the bill it settles — which may be the one issued
  // seconds earlier, still unsent. Its own create is a dependency, so by the time this runs
  // the id exists; an unresolved reference here would be a payment against nothing, so it is
  // left as-is and the server rejects it rather than silently dropping the money's target.
  payments: [
    { path: 'invoiceId', entity: 'invoices' },
    { path: 'customerId', entity: 'customers' },
    { path: 'invoiceIds', entity: 'invoices', isList: true }
  ]
};

const serverIdOf = async (db: SQLiteDatabase, entity: EntityType, localId: string): Promise<string | null> => {
  const row = await db.getFirstAsync<EntityRow>(`SELECT server_id FROM ${entity} WHERE local_id = ?`, localId);
  return row?.server_id == null ? null : String(row.server_id);
};

/**
 * Replaces local ids in a payload with the server ids their records have earned. An id that
 * is not a local uuid is already the server's and is left alone; one that cannot be resolved
 * is dropped, because sending a device id to a validator expecting an ObjectId fails the
 * whole operation — for `productId`, absent simply means the line is a custom item.
 */
export const resolveReferences = async (
  operation: OutboxOperation,
  txn?: SQLiteDatabase
): Promise<MongoDoc | null> => {
  const references = PAYLOAD_REFERENCES[operation.entityType as EntityType];
  const payload = operation.payload as MongoDoc | null;
  if (!references?.length || !payload) return payload;

  const flat = references.filter((reference) => !reference.inItems && !reference.isList);
  const lists = references.filter((reference) => reference.isList);
  const nested = references.filter((reference) => reference.inItems);
  const items = Array.isArray(payload.items) ? (payload.items as MongoDoc[]) : null;
  const listValues = (reference: PayloadReference) =>
    Array.isArray(payload[reference.path]) ? (payload[reference.path] as unknown[]) : [];

  const needsWork =
    flat.some((reference) => isUuid(payload[reference.path])) ||
    lists.some((reference) => listValues(reference).some(isUuid)) ||
    (items != null && nested.some((reference) => items.some((item) => isUuid(item[reference.path]))));
  if (!needsWork) return payload;

  return withTransaction(async (db) => {
    const resolved: MongoDoc = { ...payload };

    for (const reference of flat) {
      const value = resolved[reference.path];
      if (!isUuid(value)) continue;
      const serverId = await serverIdOf(db, reference.entity, value);
      if (serverId) resolved[reference.path] = serverId;
      else delete resolved[reference.path];
    }

    for (const reference of lists) {
      const values = listValues(reference);
      if (!values.length) continue;
      // An id that cannot be resolved stays in the list: a receipt is money, and quietly
      // settling one fewer bill than the user said they settled is the wrong kind of guess.
      resolved[reference.path] = await Promise.all(
        values.map(async (value) => (isUuid(value) ? ((await serverIdOf(db, reference.entity, value)) ?? value) : value))
      );
    }

    if (items && nested.length) {
      resolved.items = await Promise.all(
        items.map(async (item) => {
          const next = { ...item };
          for (const reference of nested) {
            const value = next[reference.path];
            if (!isUuid(value)) continue;
            const serverId = await serverIdOf(db, reference.entity, value);
            if (serverId) next[reference.path] = serverId;
            else delete next[reference.path];
          }
          return next;
        })
      );
    }

    return resolved;
  }, txn);
};

/**
 * Applies one accepted or conflicted result to the row it belongs to.
 *
 * A row only becomes `synced` when nothing else for it is queued: an edit made while the
 * create was in flight is still unsent, and calling that row synced would strand it.
 */
export const acknowledgePush = async (
  operation: OutboxOperation,
  result: { status: 'ok' | 'conflict' | 'rejected'; serverId?: string | null; version?: number | null; serverUpdatedAt?: string | null; record?: Record<string, unknown> | null },
  options: AckOptions
): Promise<void> => {
  if (result.status === 'rejected') return;

  const entity = operation.entityType as EntityType;
  const now = options.now ?? new Date().toISOString();

  await withTransaction(async (db) => {
    const row = await db.getFirstAsync<EntityRow>(
      `SELECT * FROM ${entity} WHERE local_id = ?`,
      operation.entityLocalId
    );
    if (!row) return;

    if (result.status === 'conflict') {
      // The user has to choose. The row says so, and the operation stays in `conflict`
      // alongside it — see queueManager.settle.
      await db.runAsync(`UPDATE ${entity} SET sync_state = 'conflict' WHERE local_id = ?`, operation.entityLocalId);
      emitChange({ entity, type: 'updated', localId: operation.entityLocalId, origin: 'sync' });
      return;
    }

    const serverId = result.serverId ?? (result.record?._id as string | undefined) ?? null;
    const syncState = (await hasOtherOpenOperations(db, operation)) ? 'pending' : 'synced';

    if (result.record) {
      // A full record came back: store it as the server stated it, keeping this row's
      // identity and its tombstone if the accepted operation was a delete.
      const existing = fromRow(row);
      await upsertEntityRow(
        db,
        entity,
        toRow(
          entity,
          { ...(result.record as MongoDoc), ...(existing.deletedAt ? { deletedAt: existing.deletedAt } : {}) },
          { businessId: options.businessId, localId: operation.entityLocalId, syncState, now }
        )
      );
    } else {
      await db.runAsync(
        `UPDATE ${entity}
            SET server_id = COALESCE(?, server_id),
                version = COALESCE(?, version),
                server_updated_at = COALESCE(?, server_updated_at),
                sync_state = ?,
                -- The screens read the document, not the columns, so the id has to land in
                -- both or an offline-created product keeps showing its local id forever.
                payload = CASE WHEN ? IS NULL THEN payload ELSE json_set(payload, '$._id', ?) END
          WHERE local_id = ?`,
        [
          serverId,
          result.version ?? null,
          result.serverUpdatedAt ?? null,
          syncState,
          serverId,
          serverId,
          operation.entityLocalId
        ]
      );
    }

    emitChange({
      entity,
      type: operation.opType === 'delete' ? 'deleted' : 'updated',
      localId: operation.entityLocalId,
      serverId: serverId ?? (row.server_id == null ? null : String(row.server_id)),
      origin: 'sync'
    });
  }, options.txn);
};
