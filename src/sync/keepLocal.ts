import type { SQLiteDatabase } from 'expo-sqlite';
import { upsertEntityRow } from '../db/entityRepository';
import { fromRow, toRow, type EntityRow, type EntityType, type MongoDoc } from '../db/mappers';
import {
  enqueueOperation,
  getOperation,
  listOperations,
  markOperationDone,
  type OutboxOperation
} from '../db/outbox';
import { deleteSetting, getSetting, setSetting } from '../db/settings';
import { withTransaction } from '../db/transaction';
import { resolveConflict, SERVER_OWNED } from './conflictResolver';

/**
 * Keep Local for a VERSION_CONFLICT: rebase the device's patch onto the current server
 * revision and enqueue a *new* update with that revision as baseVersion. Optimistic
 * concurrency stays intact — the next push still races fairly against concurrent editors.
 */

export const conflictServerKey = (opId: string) => `sync.conflictServer.${opId}`;

/** Stash the server record from a 409 so Keep Local can rebase without a GET-by-id API. */
export const storeConflictServerRecord = async (
  opId: string,
  record: MongoDoc | null | undefined,
  options: { txn?: SQLiteDatabase; now?: string } = {}
): Promise<void> => {
  if (!record || typeof record !== 'object') return;
  await setSetting(conflictServerKey(opId), JSON.stringify(record), options);
};

export const clearConflictServerRecord = async (opId: string, txn?: SQLiteDatabase): Promise<void> => {
  await deleteSetting(conflictServerKey(opId), txn);
};

export const readConflictServerRecord = async (
  opId: string,
  txn?: SQLiteDatabase
): Promise<MongoDoc | null> => {
  const raw = await getSetting(conflictServerKey(opId), txn);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as MongoDoc;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

export type ServerRecordFetcher = (entityType: EntityType, serverId: string) => Promise<MongoDoc>;

const ENVELOPE = new Set(['_id', 'id', 'clientId', 'version', 'business', 'createdAt', 'updatedAt', 'deletedAt', 'targetId']);

/** Fields this device still wants to push after a merge — local patch minus server-owned/envelope. */
export const rebasePatch = (entity: EntityType, patch: MongoDoc): MongoDoc => {
  const owned = new Set(SERVER_OWNED[entity] ?? []);
  const next: MongoDoc = {};
  for (const [field, value] of Object.entries(patch)) {
    if (ENVELOPE.has(field) || owned.has(field)) continue;
    next[field] = value;
  }
  return next;
};

const patchFromOperations = (operations: OutboxOperation[]): MongoDoc => {
  const patch: MongoDoc = {};
  for (const operation of operations) {
    if (operation.opType !== 'update') continue;
    Object.assign(patch, operation.payload ?? {});
  }
  return patch;
};

export type KeepLocalResult = {
  newOpId: string | null;
  baseVersion: number;
  fields: string[];
};

/**
 * Rebases one conflicted (or failed) update onto the latest server record and queues a fresh op.
 */
export const rebaseKeepLocal = async (
  opId: string,
  options: {
    businessId: string;
    fetchServer?: ServerRecordFetcher;
    txn?: SQLiteDatabase;
    now?: string;
  }
): Promise<KeepLocalResult> => {
  const now = options.now ?? new Date().toISOString();
  const operation = await getOperation(opId, options.txn);
  if (!operation) throw new Error('That sync issue no longer exists');
  if (operation.opType !== 'update') {
    throw new Error('Keep local only applies to update conflicts');
  }
  if (!['conflict', 'failed'].includes(operation.status)) {
    throw new Error('Only conflicted or failed changes can be kept locally');
  }

  const entity = operation.entityType as EntityType;
  const serverId =
    (operation.payload?.targetId as string | undefined) ??
    (operation.payload?._id as string | undefined) ??
    null;

  let server =
    (await readConflictServerRecord(opId, options.txn)) ??
    (serverId && options.fetchServer ? await options.fetchServer(entity, serverId) : null);

  if (!server?._id && serverId) server = { ...server, _id: serverId };
  if (!server?._id) {
    throw new Error('Server version unavailable — sync again, then tap Keep local');
  }

  const baseVersion = Number(server.version);
  if (!Number.isFinite(baseVersion) || baseVersion < 1) {
    throw new Error('Server record is missing a version; cannot rebase safely');
  }

  return withTransaction(async (db) => {
    const open = await listOperations({
      businessId: options.businessId,
      entityType: entity,
      entityLocalId: operation.entityLocalId,
      status: ['pending', 'inflight', 'failed', 'conflict'],
      txn: db
    });

    // Prefer the full chain of open updates for this row so consecutive edits stay together.
    const updates = open.filter((item) => item.opType === 'update');
    const patch = patchFromOperations(updates.length ? updates : [operation]);
    const localRow = await db.getFirstAsync<EntityRow>(
      `SELECT * FROM ${entity} WHERE local_id = ?`,
      operation.entityLocalId
    );
    const localDoc = localRow ? fromRow(localRow).doc : null;

    const resolution = resolveConflict({ entity, server, local: localDoc, patch });
    // Only push fields the conflict policy kept — and only when it asked to requeue.
    const fieldsPatch = resolution.requeue ? rebasePatch(entity, patch) : {};

    // Retire the stale ops (done, not dead) — their baseVersion is what caused the 409 loop.
    // Done keeps them off Sync Issues; discard would cascade and leave noise.
    for (const item of updates.length ? updates : [operation]) {
      await markOperationDone(item.opId, { txn: db, now });
      await clearConflictServerRecord(item.opId, db);
    }

    const mergedDoc: MongoDoc = {
      ...resolution.doc,
      _id: String(server._id),
      version: baseVersion,
      clientId: server.clientId ?? operation.entityLocalId
    };

    const willPush = Object.keys(fieldsPatch).length > 0;

    await upsertEntityRow(
      db,
      entity,
      toRow(entity, mergedDoc, {
        businessId: options.businessId,
        localId: operation.entityLocalId,
        syncState: willPush ? 'pending' : 'synced',
        now
      })
    );

    if (!willPush) {
      return { newOpId: null, baseVersion, fields: [] };
    }

    const queued = await enqueueOperation(
      {
        businessId: options.businessId,
        entityType: entity,
        entityLocalId: operation.entityLocalId,
        opType: 'update',
        payload: {
          ...fieldsPatch,
          clientId: operation.entityLocalId,
          targetId: String(server._id)
        },
        baseVersion
      },
      { txn: db, now }
    );

    return { newOpId: queued.opId, baseVersion, fields: Object.keys(fieldsPatch) };
  }, options.txn);
};
