import {
  createCustomer,
  deleteCustomer,
  getCustomer,
  getCustomerByServerId,
  updateCustomer,
  type CustomerDoc
} from './customerRepository';
import { createEntityWrites, type LocalWriteOptions } from './entityWrites';

/**
 * Offline customer writes: the row and its queued push, in one transaction. See entityWrites.
 *
 * Nothing customer-specific happens here, and that is the point — the phone normalisation
 * lives in the mapper, the contact-list union lives in the conflict resolver, and this layer
 * only has to be sure the write and its intent to send cannot come apart.
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

export const findCustomerByAnyId = writes.findByAnyId;
export const createCustomerLocally = writes.createLocally;
export const updateCustomerLocally = writes.updateLocally;
export const deleteCustomerLocally = writes.deleteLocally;
