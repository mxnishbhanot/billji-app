import type { SQLiteDatabase } from 'expo-sqlite';
import { createEntityWrites, type LocalWriteOptions } from './entityWrites';
import { listOperations } from './outbox';
import {
  createPurchase,
  deletePurchase,
  getPurchase,
  getPurchaseByServerId,
  provisionalTotals,
  updatePurchase,
  type PurchaseDoc,
  type PurchaseRecord
} from './purchaseRepository';
import { getSupplier } from './supplierRepository';
import { withTransaction } from './transaction';

/**
 * Offline purchase bills: the row and its queued push, in one transaction. See entityWrites.
 *
 * Create only, and that is the protocol's shape rather than a shortcut — the server exposes
 * `purchase:create` and nothing else. Cancelling a bill reverses stock, ledger entries and
 * the vendor payable, which is a domain action the push protocol has no verb for; it stays
 * online, and the screen keeps calling the REST route.
 *
 * The part that is genuinely this entity's own is the reference. A bill is received against
 * a supplier and its lines point at products, and any of those may themselves be unsynced
 * records this device minted minutes ago. Two things make that safe:
 *
 *   1. the create is queued *behind* the supplier's and the products' own creates, so the
 *      server never sees a bill before the records it names;
 *   2. the local ids in the payload are rewritten to server ids at send time — see
 *      sync/pushAck.resolveReferences.
 */

export type PurchaseWriteOptions = LocalWriteOptions;

const writes = createEntityWrites<PurchaseDoc>({
  entity: 'purchases',
  get: getPurchase,
  getByServerId: getPurchaseByServerId,
  create: createPurchase,
  update: updatePurchase,
  softDelete: deletePurchase,
  discardReason: 'Purchase bill was deleted before it reached the server'
});

export const findPurchaseByAnyId = writes.findByAnyId;

/** The unsent creates for the records this bill names — what it has to queue behind. */
const referencedOperations = async (
  businessId: string,
  doc: PurchaseDoc,
  db: SQLiteDatabase
): Promise<string[]> => {
  const referenced = new Map<string, string[]>();

  const add = (entityType: string, localId: unknown) => {
    if (typeof localId !== 'string' || !localId) return;
    referenced.set(entityType, [...(referenced.get(entityType) ?? []), localId]);
  };

  add('suppliers', doc.vendorId ?? doc.vendor);
  for (const item of Array.isArray(doc.items) ? doc.items : []) add('products', (item as { productId?: string }).productId);

  const opIds: string[] = [];
  for (const [entityType, localIds] of referenced) {
    for (const entityLocalId of new Set(localIds)) {
      const operations = await listOperations({
        businessId,
        entityType,
        entityLocalId,
        status: ['pending', 'inflight', 'failed', 'conflict'],
        txn: db
      });
      // The last one: everything before it is already a dependency of that one.
      if (operations.length) opIds.push(operations[operations.length - 1].opId);
    }
  }

  return opIds;
};

/**
 * Writes the bill and queues it. The vendor snapshot is filled in from the local supplier so
 * the list has a name to show before the server's own snapshot arrives.
 */
export const createPurchaseLocally = async (
  doc: PurchaseDoc,
  options: PurchaseWriteOptions
): Promise<PurchaseRecord> =>
  withTransaction(async (db) => {
    const vendorId = (doc.vendorId ?? doc.vendor) as string | undefined;
    const supplier = vendorId ? await getSupplier(vendorId, db) : null;
    const totals = provisionalTotals(
      (doc.items ?? []) as { quantity?: number; price?: number; taxRate?: number }[],
      doc.taxRate as number | undefined
    );

    const dependsOn = await referencedOperations(options.businessId, doc, db);

    return writes.createLocally(
      {
        ...doc,
        // Two references, both true: the row is indexed by whichever the device holds, and
        // `vendorId` stays as the caller gave it — the push rewrites it to the server's id.
        vendorLocalId: supplier?.localId ?? vendorId,
        vendor: supplier?.serverId ?? undefined,
        date: doc.date ?? options.now ?? new Date().toISOString(),
        vendorSnapshot: doc.vendorSnapshot ?? {
          name: String(supplier?.doc?.name ?? ''),
          phone: String(supplier?.doc?.phone ?? ''),
          gstNumber: String(supplier?.doc?.gstNumber ?? '')
        },
        ...totals,
        paidAmount: 0,
        balanceDue: totals.total,
        status: 'received',
        paymentStatus: 'unpaid'
      },
      { ...options, txn: db, dependsOn }
    );
  }, options.txn);
