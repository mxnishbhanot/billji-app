import type { SQLiteDatabase } from 'expo-sqlite';
import { listOperations } from './outbox';
import type { MongoDoc } from './mappers';

/**
 * What the shelf holds, as far as this device can tell: the last level the server confirmed,
 * moved by the sales and purchases still sitting in the outbox.
 *
 * Deltas, never levels. Two devices each pushing "−3" gives −6 whatever order they arrive
 * in; two devices each pushing "9" gives 9, and three units vanish with no audit trail. The
 * client only ever describes movements — the server owns the arithmetic and the answer.
 *
 * The queue *is* the projection's source. A second local ledger of pending movements could
 * only ever disagree with the queue, and then the two would have to be reconciled.
 *
 * Deliberately display-only: `stock_quantity` on the row stays exactly as the server last
 * stated it, so a push that dies does not leave a permanently wrong level behind — the next
 * pull is always the truth.
 */

/** A queued document moves stock in one direction: a sale out, a bill in. */
const DIRECTION: Record<string, number> = { invoices: -1, purchases: 1 };

const addDelta = (deltas: Map<string, number[]>, key: unknown, value: number) => {
  if (typeof key !== 'string' || !key || !Number.isFinite(value) || value === 0) return;
  deltas.set(key, [...(deltas.get(key) ?? []), value]);
};

/**
 * Every unsent movement, in one pass over the queue, keyed by whichever product id the
 * payload carries — a line for a product created minutes ago names it by local id, and one
 * for a synced product by server id, so both keys are live at once.
 */
export const pendingStockDeltasByProduct = async (
  businessId: string,
  txn?: SQLiteDatabase
): Promise<Map<string, number[]>> => {
  // LIMIT -1 is SQLite for "all of them". A default page of 200 would silently drop the tail
  // of a busy day's queue, and a projection that ignores queued sales overstates the shelf.
  const operations = await listOperations({ businessId, status: ['pending', 'inflight', 'failed'], limit: -1, txn });
  const deltas = new Map<string, number[]>();

  for (const operation of operations) {
    const payload = (operation.payload ?? {}) as MongoDoc;

    // An explicit adjustment carries its own delta and its own reason.
    if (operation.opType === 'action' && operation.actionName === 'adjust_stock') {
      addDelta(deltas, payload.productId, Number(payload.delta));
      continue;
    }

    const direction = DIRECTION[operation.entityType] ?? 0;
    if (!direction || operation.opType !== 'create') continue;

    for (const item of Array.isArray(payload.items) ? (payload.items as MongoDoc[]) : []) {
      addDelta(deltas, item.productId ?? item.product, direction * (Number(item.quantity) || 0));
    }
  }

  return deltas;
};

/** The deltas for one product, under either of the ids it may be known by. */
export const deltasFor = (
  deltas: Map<string, number[]>,
  ids: (string | null | undefined)[]
): number[] => [...new Set(ids.filter(Boolean) as string[])].flatMap((id) => deltas.get(id) ?? []);

export const projectStock = (serverQuantity: number, pendingDeltas: number[]): number =>
  pendingDeltas.reduce((level, delta) => level + delta, Number(serverQuantity) || 0);

/**
 * What a sale of `quantity` would leave behind, and whether that is an oversell.
 *
 * Never a block. The goods physically leave the shop whether or not the count agrees, and
 * refusing the sale only produces an invoice that exists on the customer's phone and not in
 * the books. The UI warns; the server records the shortfall as an `oversell` movement.
 */
export const oversellCheck = (projected: number, quantity: number) => {
  const remaining = projected - (Number(quantity) || 0);
  return { remaining, oversold: remaining < 0, shortfall: remaining < 0 ? -remaining : 0 };
};
