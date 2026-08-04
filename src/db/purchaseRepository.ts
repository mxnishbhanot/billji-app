import type { PurchaseBill } from '../types';
import {
  createEntityRepository,
  type EntityCursor,
  type EntityDocument,
  type EntityPage,
  type ListQuery,
  type WriteOptions
} from './entityRepository';
import type { MongoDoc } from './mappers';

/** Purchase bills, read and written locally. SQLite only — nothing here touches the network. */

export type PurchaseDoc = MongoDoc & Partial<PurchaseBill>;
export type PurchaseRecord = EntityDocument<PurchaseDoc>;
export type PurchaseCursor = EntityCursor;
export type PurchasePage = EntityPage<PurchaseDoc>;
export type { WriteOptions };

export type PurchaseListQuery = Omit<ListQuery, 'where'> & { status?: string; vendorId?: string };

const repository = createEntityRepository<PurchaseDoc>({
  entity: 'purchases',
  label: 'purchase bill',
  searchColumns: ['bill_number', 'vendor_bill_number', 'vendor_name'],
  sortColumn: 'date',
  sortDirection: 'DESC',
  filterColumns: ['status', 'payment_status', 'vendor_server_id', 'vendor_local_id', 'date'],
  hasActiveColumn: false
});

export const getPurchase = repository.get;
export const getPurchaseByServerId = repository.getByServerId;
export const createPurchase = repository.create;
export const updatePurchase = repository.update;
export const deletePurchase = repository.softDelete;

const withFilters = ({ status, vendorId, ...query }: PurchaseListQuery): ListQuery => ({
  ...query,
  where: {
    ...(status ? { status } : {}),
    // Either side of the vendor reference resolves, so a bill against a supplier that has
    // not synced is still found by the id the picker handed over.
    ...(vendorId ? { vendor_server_id: vendorId } : {})
  }
});

export const listPurchases = (query: PurchaseListQuery): Promise<PurchasePage> => repository.list(withFilters(query));
export const countPurchases = (query: PurchaseListQuery): Promise<number> => repository.count(withFilters(query));

/**
 * What the bill is worth, as this device can compute it: line values plus per-line tax.
 *
 * Provisional and labelled as such. The server owns the real figure — it applies the
 * discount, splits the tax into CGST/SGST/IGST by place of supply, and allocates the bill
 * number — and it recomputes all of it on arrival. This exists so a bill received in a
 * godown with no signal shows an amount instead of a zero, and it is never pushed back:
 * see conflictResolver.SERVER_OWNED.purchases.
 */
export const provisionalTotals = (
  items: { quantity?: number; price?: number; taxRate?: number }[] = [],
  fallbackTaxRate?: number
) => {
  const money = (value: number) => Math.round(value * 100) / 100;

  let subtotal = 0;
  let taxTotal = 0;

  for (const item of items) {
    const line = (Number(item.quantity) || 0) * (Number(item.price) || 0);
    const rate = Number(item.taxRate ?? fallbackTaxRate) || 0;
    subtotal += line;
    taxTotal += (line * rate) / 100;
  }

  return { subtotal: money(subtotal), taxTotal: money(taxTotal), total: money(subtotal + taxTotal) };
};
