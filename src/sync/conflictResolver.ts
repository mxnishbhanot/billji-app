import type { SQLiteDatabase } from 'expo-sqlite';
import { upsertEntityRow } from '../db/entityRepository';
import { fromRow, normalizePhone, toRow, type EntityRow, type EntityType, type MongoDoc } from '../db/mappers';
import { discardOperation, listOperations } from '../db/outbox';
import { deltasFor, pendingStockDeltasByProduct } from '../db/stockProjection';

/**
 * Conflict policy, per §7 of the offline architecture. One module, no UI: it decides, writes
 * the result, and leaves anything a human must judge in `conflict` for the Sync Issues
 * screen to pick up.
 *
 * The shape of a conflict here is always the same: the server has a record, this device has
 * unsynced intent for the same record, and the two disagree. What differs is the policy, and
 * the policy differs because the *domain* differs — a price and a stock level are not the
 * same kind of number, and pretending they are is how offline systems lose inventory.
 *
 *   Products    field-level merge; stockQuantity is server-owned, always
 *   Customers   field-level merge; contactPersons union; balances server-owned
 *   Invoices    draft: local wins whole. Issued: immutable, server wins, local edits die
 *   Payments    never conflict — the cash crossed the counter; server copy wins, edits die
 *   Inventory   never merged. Levels are server-computed from movements; clients push deltas
 *
 * Field-level merge without per-field timestamps: the locally changed fields are not
 * inferred from a diff, they are read from the outbox. A queued update op *is* the list of
 * fields this device changed, which is more precise than any timestamp comparison — an
 * untouched field is never a candidate to win.
 */

export type ResolutionOutcome =
  /** Server record with this device's changed fields laid back on top. */
  | 'merged'
  /** The server copy is taken wholesale; local intent for this record is void. */
  | 'server-wins'
  /** The local copy stands; it will be pushed. */
  | 'local-wins'
  /** No automatic answer is safe. The row stays in `conflict` for a person. */
  | 'escalate';

export type Resolution = {
  outcome: ResolutionOutcome;
  /** What to store locally. */
  doc: MongoDoc;
  /** Local fields kept in the merge. */
  fields: string[];
  /** Queued *edits* for this record are no longer valid and are abandoned. */
  dropLocalEdits: boolean;
  /** The resolved document differs from the server's and must be pushed. */
  requeue: boolean;
  reason: string;
};

/**
 * Fields a client may never write. They are not values the device *has*, they are values it
 * *observed*: derived by the server from movements, allocations and the ledger. A client
 * that pushes them overwrites arithmetic it cannot see.
 */
export const SERVER_OWNED: Partial<Record<EntityType, string[]>> = {
  products: ['stockQuantity', 'isLowStock'],
  customers: ['availableCredit', 'outstandingDues'],
  suppliers: ['outstandingPayable'],
  // A bill's numbering, GST split and settlement are computed server-side from the items,
  // the place of supply and the payments against it. The device's provisional sum is for
  // showing a list before the push lands, never for pushing back.
  purchases: [
    'billNumber',
    'subtotal',
    'taxTotal',
    'cgstTotal',
    'sgstTotal',
    'igstTotal',
    'discount',
    'total',
    'paidAmount',
    'balanceDue',
    'status',
    'paymentStatus',
    'supplyType',
    'placeOfSupply'
  ],
  invoices: [
    'documentStatus',
    'paymentStatus',
    'fulfillmentStatus',
    'paidAmount',
    'balanceDue',
    // The server's settlement reservation counter. A device pushing it would overwrite the
    // guard that stops an invoice being settled past its total.
    'settledAmount',
    'documentNumber',
    'invoiceNumber'
  ],
  // What a receipt settles is the server's arithmetic over every invoice, including ones this
  // device has never seen. `provisionalAllocations` is the device's own record of what it
  // showed the user when the cash was taken — local scratch for the projection, never a claim.
  payments: ['allocatedAmount', 'unappliedAmount', 'refundableAmount', 'refundStatus', 'provisionalAllocations']
};

/** Envelope fields that describe the record's sync identity, never its content. */
const ENVELOPE = new Set(['_id', 'id', 'clientId', 'version', 'business', 'createdAt', 'updatedAt', 'deletedAt']);

const isMergeable = (entity: EntityType, field: string) =>
  !ENVELOPE.has(field) && !(SERVER_OWNED[entity] ?? []).includes(field);

/** Union by identity, so two people adding two different contacts produce two contacts. */
const unionContacts = (server: unknown, local: unknown): MongoDoc[] => {
  // The same normalisation the customer table indexes on, so "+91 98765 43210" and
  // "9876543210" are one contact rather than two.
  const key = (contact: MongoDoc) =>
    normalizePhone(contact.phone) || String(contact.email ?? '').toLowerCase() || JSON.stringify(contact);

  const merged = new Map<string, MongoDoc>();
  for (const contact of [...(Array.isArray(server) ? server : []), ...(Array.isArray(local) ? local : [])]) {
    if (contact && typeof contact === 'object') merged.set(key(contact as MongoDoc), contact as MongoDoc);
  }
  return [...merged.values()];
};

const fieldMerge = (entity: EntityType, server: MongoDoc, patch: MongoDoc): Resolution => {
  const doc: MongoDoc = { ...server };
  const fields: string[] = [];

  for (const [field, value] of Object.entries(patch)) {
    if (!isMergeable(entity, field)) continue;

    if (entity === 'customers' && field === 'contactPersons') {
      doc.contactPersons = unionContacts(server.contactPersons, value);
      fields.push(field);
      continue;
    }

    doc[field] = value;
    fields.push(field);
  }

  return {
    outcome: 'merged',
    doc,
    fields,
    dropLocalEdits: false,
    // Nothing of this device's survived the policy, so there is nothing left to push.
    requeue: fields.length > 0,
    reason: fields.length
      ? `Kept local ${fields.join(', ')}; server owns the rest`
      : 'Every local change was to a server-owned field'
  };
};

const serverWins = (server: MongoDoc, reason: string): Resolution => ({
  outcome: 'server-wins',
  doc: server,
  fields: [],
  dropLocalEdits: true,
  requeue: false,
  reason
});

/**
 * Decides, without touching the database. `patch` is the union of this device's queued edits
 * for the record — the fields it actually changed.
 */
export const resolveConflict = ({
  entity,
  server,
  local,
  patch = {}
}: {
  entity: EntityType;
  server: MongoDoc;
  local: MongoDoc | null;
  patch?: MongoDoc;
}): Resolution => {
  switch (entity) {
    case 'invoices': {
      const status = String(server.documentStatus ?? 'draft');
      // A GST invoice is a legal instrument: once issued it may have been printed, sent and
      // filed against. It cannot be edited, so there is no merge to attempt — the local edit
      // is abandoned and surfaces as a dead operation for the user to redo as a credit note.
      if (status !== 'draft') {
        return serverWins(server, `Invoice is ${status} and immutable; local edits were not applied`);
      }
      // Drafts are single-device by nature: whole-document last-write-wins, and the writer
      // holding an unsynced edit is by definition the last writer.
      return {
        outcome: 'local-wins',
        doc: local ?? server,
        fields: Object.keys(patch),
        dropLocalEdits: false,
        requeue: true,
        reason: 'Draft document: the local version is kept and pushed'
      };
    }

    case 'payments':
      // Cash crossed the counter. The receipt is never rejected and never edited — a wrong
      // payment is reversed by an action, not merged. The server's copy, including its
      // allocation, is the truth.
      return serverWins(server, 'Payments are not editable; the server record stands');

    case 'business':
      // Global configuration: a mis-merged GSTIN or tax rate corrupts every invoice issued
      // afterwards. Low edit frequency, catastrophic blast radius, strictest policy.
      return serverWins(server, 'Business settings are server-authoritative');

    default:
      // Products, customers, suppliers, expenses: independent scalar fields, so keeping both
      // sides' edits is safe and is what the user expects.
      return fieldMerge(entity, server, patch);
  }
};

// -- Applying a resolution --------------------------------------------------------------

/**
 * The fields this device changed, read from its own queue. Ops are folded in sequence order,
 * so a later edit to the same field wins over an earlier one.
 *
 * Only `update` ops contribute. A `create` is not a patch (the whole record is local), and an
 * `action` is a domain verb the server executes — a cancel or a stock adjustment is never a
 * field to merge.
 */
export const localPatchFor = async (
  db: SQLiteDatabase,
  businessId: string,
  entityType: EntityType,
  entityLocalId: string
): Promise<MongoDoc> => {
  const operations = await listOperations({ businessId, entityType, entityLocalId, txn: db });
  const patch: MongoDoc = {};

  for (const operation of operations) {
    if (operation.opType !== 'update') continue;
    if (!['pending', 'inflight', 'failed', 'conflict'].includes(operation.status)) continue;
    Object.assign(patch, operation.payload ?? {});
  }

  return patch;
};

export type ApplyContext = { businessId: string; now?: string; localRow?: EntityRow | null };

export type AppliedResolution = Resolution & { localId: string; droppedOps: string[] };

/**
 * Resolves one record and writes the answer.
 *
 * `merged` and `local-wins` leave the row `pending`, because the resolved document differs
 * from what the server holds and still has to be pushed. `server-wins` lands as `synced` and
 * abandons the queued edits — which become dead operations, visible on the Sync Issues
 * screen rather than vanishing. `escalate` leaves the row exactly as it was.
 */
export const applyResolution = async (
  db: SQLiteDatabase,
  entity: EntityType,
  server: MongoDoc,
  context: ApplyContext
): Promise<AppliedResolution> => {
  const now = context.now ?? new Date().toISOString();
  const serverId = server._id ? String(server._id) : null;
  const clientId = typeof server.clientId === 'string' ? server.clientId : null;

  const row =
    context.localRow ??
    (await db.getFirstAsync<EntityRow>(
      `SELECT * FROM ${entity} WHERE server_id = ? OR (? IS NOT NULL AND local_id = ?)`,
      [serverId, clientId, clientId]
    ));

  const existing = row ? fromRow(row) : null;
  const localId = existing?.localId ?? clientId ?? String(server._id);

  const operations = existing
    ? await listOperations({
        businessId: context.businessId,
        entityType: entity,
        entityLocalId: existing.localId,
        status: ['pending', 'inflight', 'failed', 'conflict'],
        txn: db
      })
    : [];

  // A row carrying unsynced state with nothing in the queue to explain it: the device
  // cannot say which fields the user changed, so no merge is safe and no overwrite is
  // honest. It goes to a person.
  if (existing && !operations.length) {
    return {
      outcome: 'escalate',
      doc: existing.doc ?? server,
      fields: [],
      dropLocalEdits: false,
      requeue: false,
      reason: 'Local changes with no queued operation to describe them',
      localId,
      droppedOps: []
    };
  }

  const patch: MongoDoc = {};
  for (const operation of operations) {
    if (operation.opType === 'update') Object.assign(patch, operation.payload ?? {});
  }

  const resolution = resolveConflict({ entity, server, local: existing?.doc ?? null, patch });

  if (resolution.outcome === 'escalate') {
    return { ...resolution, localId, droppedOps: [] };
  }

  const droppedOps: string[] = [];
  if (resolution.dropLocalEdits && existing) {
    for (const operation of operations) {
      // Actions survive: a cancel or a stock adjustment is a domain event the server still
      // has to run, and it is idempotent. Only field edits are void.
      if (operation.opType !== 'update') continue;
      droppedOps.push(...(await discardOperation(operation.opId, { txn: db, now, reason: resolution.reason })));
    }
  }

  await upsertEntityRow(
    db,
    entity,
    toRow(entity, resolution.doc, {
      businessId: context.businessId,
      localId,
      syncState: resolution.requeue ? 'pending' : 'synced',
      now
    })
  );

  return { ...resolution, localId, droppedOps };
};

// -- Inventory ---------------------------------------------------------------------------

/**
 * Stock is projected, never merged: the level is the server's arithmetic over movements, and
 * the device only knows which movements it has not yet managed to send. The projection itself
 * lives in db/stockProjection, next to the queue it reads.
 */
export { projectStock } from '../db/stockProjection';

/**
 * The movements this device has queued but not had accepted, for one product.
 *
 * Kept as a single-product convenience over the one-pass scan — a list of fifty products asks
 * for the map instead, or it walks the whole queue fifty times.
 */
export const pendingStockDeltas = async (
  db: SQLiteDatabase,
  businessId: string,
  productId: string
): Promise<number[]> => deltasFor(await pendingStockDeltasByProduct(businessId, db), [productId]);
