import type { SQLiteDatabase } from 'expo-sqlite';
import type { Customer } from '../types';
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
 * Customers, read and written locally. SQLite only, and no sync: a write lands in the local
 * table and stops there. `sync_state` is left `pending` so the engine that ships later has
 * the queue it needs, but nothing in this module pushes, pulls or resolves anything.
 */

export type CustomerDoc = MongoDoc & Partial<Customer>;
export type CustomerRecord = EntityDocument<CustomerDoc>;
export type CustomerCursor = EntityCursor;
export type CustomerPage = EntityPage<CustomerDoc>;
export type { WriteOptions };

export type CustomerQuery = ListQuery;

const repository = createEntityRepository<CustomerDoc>({
  entity: 'customers',
  label: 'customer',
  // gst_number is searched too: a shop looking up a business customer types the GSTIN.
  searchColumns: ['name', 'phone_normalized', 'email', 'gst_number'],
  sortColumn: 'name',
  filterColumns: ['phone_normalized', 'gst_number']
});

export const getCustomer = repository.get;
export const getCustomerByServerId = repository.getByServerId;
export const createCustomer = repository.create;
export const updateCustomer = repository.update;
export const deleteCustomer = repository.softDelete;
/**
 * A term that is only digits and phone punctuation is normalised before it is matched, so
 * "98765 43210" and "+91-9876543210" both hit the stored phone_normalized. Anything else is
 * searched verbatim — "Shop 12" is a name, not a phone.
 */
const PHONE_LIKE = /^\+?[\d\s()-]+$/;

const withSearch = (query: CustomerQuery): CustomerQuery => {
  const term = query.search?.trim();
  if (!term || !PHONE_LIKE.test(term)) return query;
  return { ...query, search: normalizePhone(term) ?? term };
};

export const listCustomers = (query: CustomerQuery): Promise<CustomerPage> => repository.list(withSearch(query));
export const countCustomers = (query: CustomerQuery): Promise<number> => repository.count(withSearch(query));

/**
 * Exact match on the normalised phone — digits only, country code stripped, which is how
 * "+91 98765 43210" and "9876543210" resolve to one customer. Returns null for a phone that
 * normalises to nothing rather than matching the first row with no phone.
 */
export const findCustomerByPhone = (
  businessId: string,
  phone: string,
  txn?: SQLiteDatabase
): Promise<CustomerRecord | null> => {
  const normalized = normalizePhone(phone);
  if (!normalized) return Promise.resolve(null);
  return repository.findBy('phone_normalized', normalized, businessId, txn);
};
