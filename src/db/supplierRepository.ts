import type { SQLiteDatabase } from 'expo-sqlite';
import type { Vendor } from '../types';
import {
  createEntityRepository,
  type EntityCursor,
  type EntityDocument,
  type EntityPage,
  type ListQuery,
  type WriteOptions
} from './entityRepository';
import { normalizePhone, type MongoDoc } from './mappers';

/**
 * Suppliers, read and written locally. SQLite only — nothing here touches the network.
 *
 * The table is `suppliers` and the API calls them vendors; both names are load-bearing (the
 * server's collection is `vendors`, the local schema and the pull mapping say `suppliers`),
 * so the translation stays where it already lives: PULL_COLLECTIONS and WIRE_ENTITY.
 */

export type SupplierDoc = MongoDoc & Partial<Vendor>;
export type SupplierRecord = EntityDocument<SupplierDoc>;
export type SupplierCursor = EntityCursor;
export type SupplierPage = EntityPage<SupplierDoc>;
export type { WriteOptions };

export type SupplierQuery = ListQuery;

const repository = createEntityRepository<SupplierDoc>({
  entity: 'suppliers',
  label: 'supplier',
  // Same four as customers: a shop looks a supplier up by name, number or GSTIN.
  searchColumns: ['name', 'phone_normalized', 'email', 'gst_number'],
  sortColumn: 'name',
  filterColumns: ['phone_normalized', 'gst_number']
});

export const getSupplier = repository.get;
export const getSupplierByServerId = repository.getByServerId;
export const createSupplier = repository.create;
export const updateSupplier = repository.update;
export const deleteSupplier = repository.softDelete;

/** A digits-only term is matched against the normalised phone; anything else is a name. */
const PHONE_LIKE = /^\+?[\d\s()-]+$/;

const withSearch = (query: SupplierQuery): SupplierQuery => {
  const term = query.search?.trim();
  if (!term || !PHONE_LIKE.test(term)) return query;
  return { ...query, search: normalizePhone(term) ?? term };
};

export const listSuppliers = (query: SupplierQuery): Promise<SupplierPage> => repository.list(withSearch(query));
export const countSuppliers = (query: SupplierQuery): Promise<number> => repository.count(withSearch(query));

/** Exact match on the normalised phone — the duplicate check when adding a supplier. */
export const findSupplierByPhone = (
  businessId: string,
  phone: string,
  txn?: SQLiteDatabase
): Promise<SupplierRecord | null> => {
  const normalized = normalizePhone(phone);
  if (!normalized) return Promise.resolve(null);
  return repository.findBy('phone_normalized', normalized, businessId, txn);
};
