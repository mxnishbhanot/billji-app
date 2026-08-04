import type { SQLiteDatabase } from 'expo-sqlite';
import { openDatabase } from './connection';
import { wrapDatabaseError } from './errors';
import { fromJsonText, type EntityRow, type MongoDoc } from './mappers';

/**
 * What is owed, once the receipts still queued on this device are counted.
 *
 * Allocation, the customer balance and the ledger are all server-computed — the device pushes
 * "₹5,000 came in against this bill" and the server decides what that settles. But a
 * shopkeeper who has just taken cash cannot be shown the old balance until the phone finds
 * signal: in a billing app that reads as lost money, which is a trust problem rather than a
 * cosmetic one.
 *
 * So the level shown is a projection, exactly as stock is (db/stockProjection): the server's
 * last confirmed figures, moved by the receipts it has not seen yet. The stored row keeps the
 * server's numbers untouched, so the next pull is always the truth and a push that dies leaves
 * nothing wrong behind.
 *
 * Read from the payment rows rather than recomputed from the outbox, because the greedy
 * split across several invoices was already decided when the receipt was recorded, against
 * the balances the user was actually looking at. Recomputing it here could only disagree.
 */

export type PendingAllocation = {
  /** Every id the invoice may be known by — the local one, the server one, or both. */
  invoiceKeys: string[];
  customerKeys: string[];
  amount: number;
  /** Money over the selected invoices' balance: customer credit, once the server agrees. */
  unapplied: number;
  /**
   * The server's `updatedAt` for this receipt, or null while it is unsent.
   *
   * This is what stops a receipt being counted twice, and what stops it being dropped too
   * early. A push can succeed while the pull that follows it fails — the receipt is then
   * accepted, but the bill on this device still shows the old balance, and dropping the
   * projection there would invite the same dues being collected again. So a synced receipt
   * keeps counting until the bill itself is at least as fresh: the server writes the payment
   * before it saves the invoice, so once the invoice has been pulled its timestamp is the
   * later of the two and the receipt stops counting on its own.
   */
  serverUpdatedAt: string | null;
};

/**
 * How far back to look for accepted-but-not-yet-reflected receipts. A receipt older than this
 * whose invoice has still not refreshed means sync is stuck, and the fix for that is a sync,
 * not a wider scan.
 */
const CATCH_UP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const money = (value: number) => Math.round(value * 100) / 100;

const keys = (...values: unknown[]) => [...new Set(values.filter((value): value is string => typeof value === 'string' && value !== ''))];

/**
 * The unsent receipts, one row each, with the invoices they were recorded against.
 *
 * Refunds are ignored: a refund is a server action with its own reversal, never something
 * this device projects.
 */
export const pendingPaymentAllocations = async (
  businessId: string,
  txn?: SQLiteDatabase,
  now: number = Date.now()
): Promise<PendingAllocation[]> =>
  wrapDatabaseError('DB_QUERY_FAILED', 'Could not read queued receipts', async () => {
    const db = txn ?? (await openDatabase());
    const rows = await db.getAllAsync<EntityRow>(
      `SELECT payload, amount, type, sync_state, server_updated_at,
              invoice_local_id, invoice_server_id, customer_local_id, customer_server_id
         FROM payments
        WHERE business_id = ? AND deleted_at IS NULL
          AND (sync_state <> 'synced' OR local_updated_at >= ?)`,
      [businessId, new Date(now - CATCH_UP_WINDOW_MS).toISOString()]
    );

    const allocations: PendingAllocation[] = [];

    for (const row of rows) {
      if (row.type === 'refund') continue;
      const doc = (fromJsonText(row.payload) ?? {}) as MongoDoc;
      const declared = Array.isArray(doc.provisionalAllocations) ? (doc.provisionalAllocations as MongoDoc[]) : null;
      const customerKeys = keys(row.customer_server_id, row.customer_local_id);
      const unapplied = money(Number(doc.unappliedAmount) || 0);
      // Unsent receipts count unconditionally; accepted ones only until the bill catches up.
      const serverUpdatedAt =
        row.sync_state === 'synced' && row.server_updated_at != null ? String(row.server_updated_at) : null;

      if (declared?.length) {
        // A receipt that settled several bills carries the split it was recorded with.
        for (const allocation of declared) {
          allocations.push({
            invoiceKeys: keys(allocation.invoiceServerId, allocation.invoiceLocalId),
            customerKeys,
            amount: money(Number(allocation.amount) || 0),
            unapplied: 0,
            serverUpdatedAt
          });
        }
        if (unapplied > 0) {
          allocations.push({ invoiceKeys: [], customerKeys, amount: 0, unapplied, serverUpdatedAt });
        }
        continue;
      }

      // A receipt the server has accepted states what it actually settled, which can be less
      // than was taken — another till may have got to the bill first, and the difference is
      // customer credit. An unsent one has only the amount in the drawer to go on.
      const settled =
        serverUpdatedAt && typeof doc.allocatedAmount === 'number'
          ? money(doc.allocatedAmount)
          : money(Number(row.amount) || 0);

      allocations.push({
        invoiceKeys: keys(row.invoice_server_id, row.invoice_local_id),
        customerKeys,
        amount: settled,
        unapplied,
        serverUpdatedAt
      });
    }

    return allocations;
  });

/**
 * True when this receipt is not yet reflected in the record it applies to: either it has never
 * been sent, or the record's server state predates it.
 */
const isAhead = (allocation: PendingAllocation, recordUpdatedAt?: string | null) =>
  allocation.serverUpdatedAt == null || !recordUpdatedAt || allocation.serverUpdatedAt > recordUpdatedAt;

/** What the queued receipts put against one invoice, under either of its ids. */
export const allocatedTo = (
  allocations: PendingAllocation[],
  ids: (string | null | undefined)[],
  invoiceUpdatedAt?: string | null
): number => {
  const wanted = keys(...ids);
  if (!wanted.length) return 0;
  return money(
    allocations
      .filter((allocation) => isAhead(allocation, invoiceUpdatedAt))
      .filter((allocation) => allocation.invoiceKeys.some((key) => wanted.includes(key)))
      .reduce((sum, allocation) => sum + allocation.amount, 0)
  );
};

/** What they put against one customer's bills, and what is left over as credit. */
export const collectedFrom = (
  allocations: PendingAllocation[],
  ids: (string | null | undefined)[],
  customerUpdatedAt?: string | null
): { allocated: number; unapplied: number } => {
  const wanted = keys(...ids);
  if (!wanted.length) return { allocated: 0, unapplied: 0 };

  const mine = allocations
    .filter((allocation) => isAhead(allocation, customerUpdatedAt))
    .filter((allocation) => allocation.customerKeys.some((key) => wanted.includes(key)));

  return {
    allocated: money(mine.reduce((sum, allocation) => sum + allocation.amount, 0)),
    unapplied: money(mine.reduce((sum, allocation) => sum + allocation.unapplied, 0))
  };
};

/**
 * One invoice as it stands with the queued receipts applied. Provisional and capped at the
 * document total — the server allocates the remainder as customer credit, and a local figure
 * claiming an invoice is overpaid would be wrong about money.
 */
export const projectInvoicePayment = <T extends MongoDoc>(doc: T, allocated: number): T => {
  if (!allocated) return doc;

  const total = money(Number(doc.total) || 0);
  const paidAmount = money(Math.min((Number(doc.paidAmount) || 0) + allocated, total));
  const balanceDue = money(Math.max(total - paidAmount, 0));
  const cancelled = doc.documentStatus === 'cancelled' || doc.documentStatus === 'void';

  return {
    ...doc,
    paidAmount,
    balanceDue,
    paymentStatus: paidAmount <= 0 ? 'unpaid' : balanceDue <= 0 ? 'paid' : 'partial',
    // The legacy three-state field the list chips read. A cancelled document stays cancelled.
    status: cancelled ? doc.status : balanceDue <= 0 ? 'paid' : doc.status
  };
};

/** What is still owed on one invoice, with the queued receipts counted. */
export const projectedBalanceDue = (doc: MongoDoc, allocated: number): number => {
  const total = money(Number(doc.total) || 0);
  const paid = money((Number(doc.paidAmount) || 0) + allocated);
  return money(Math.max(total - paid, 0));
};
