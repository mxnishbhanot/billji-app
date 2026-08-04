import { createEntityWrites, type LocalWriteOptions } from './entityWrites';
import {
  createSupplier,
  deleteSupplier,
  getSupplier,
  getSupplierByServerId,
  updateSupplier,
  type SupplierDoc
} from './supplierRepository';

/**
 * Offline supplier writes: the row and its queued push, in one transaction. See entityWrites.
 *
 * Create and update only. The sync protocol speaks `vendor:create` and `vendor:update` and
 * nothing else, and the REST API has no vendor delete either — queueing a delete would be
 * queueing a rejection, so this module does not expose one. If the server grows the verb,
 * the shared core already has the behaviour.
 */

export type SupplierWriteOptions = LocalWriteOptions;

const writes = createEntityWrites<SupplierDoc>({
  entity: 'suppliers',
  get: getSupplier,
  getByServerId: getSupplierByServerId,
  create: createSupplier,
  update: updateSupplier,
  softDelete: deleteSupplier,
  discardReason: 'Supplier was deleted before it reached the server'
});

export const findSupplierByAnyId = writes.findByAnyId;
export const createSupplierLocally = writes.createLocally;
export const updateSupplierLocally = writes.updateLocally;
