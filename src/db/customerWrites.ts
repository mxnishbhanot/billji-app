import {
  createCustomer,
  deleteCustomer,
  findCustomerByPhone,
  getCustomer,
  getCustomerByServerId,
  updateCustomer,
  type CustomerDoc
} from './customerRepository';
import { LocalRuleError } from './errors';
import { createEntityWrites, type LocalWriteOptions } from './entityWrites';

/**
 * Offline customer writes: the row and its queued push, in one transaction. See entityWrites.
 *
 * Phone uniqueness is enforced here (mirrors the server CUSTOMER_PHONE_EXISTS rule) so a
 * cashier cannot mint a second walk-in row for the same number while offline.
 */

export type CustomerWriteOptions = LocalWriteOptions;

const writes = createEntityWrites<CustomerDoc>({
  entity: 'customers',
  get: getCustomer,
  getByServerId: getCustomerByServerId,
  create: createCustomer,
  update: updateCustomer,
  softDelete: deleteCustomer,
  discardReason: 'Customer was deleted before it reached the server'
});

const assertPhoneAvailable = async (
  businessId: string,
  phone: string | undefined,
  excludeLocalId: string | null,
  txn: LocalWriteOptions['txn']
) => {
  if (!phone?.trim()) return;
  const existing = await findCustomerByPhone(businessId, phone, txn);
  if (!existing || existing.deletedAt) return;
  if (excludeLocalId && existing.localId === excludeLocalId) return;
  throw new LocalRuleError('CUSTOMER_PHONE_EXISTS', 'A customer with this phone already exists', {
    customerId: existing.serverId ?? existing.localId
  });
};

export const findCustomerByAnyId = writes.findByAnyId;

export const createCustomerLocally = async (doc: CustomerDoc, options: CustomerWriteOptions) => {
  await assertPhoneAvailable(options.businessId, doc.phone, null, options.txn);
  return writes.createLocally(doc, options);
};

export const updateCustomerLocally = async (
  localId: string,
  patch: Partial<CustomerDoc>,
  options: CustomerWriteOptions
) => {
  if (patch.phone !== undefined) {
    await assertPhoneAvailable(options.businessId, patch.phone, localId, options.txn);
  }
  return writes.updateLocally(localId, patch, options);
};

export const deleteCustomerLocally = writes.deleteLocally;
