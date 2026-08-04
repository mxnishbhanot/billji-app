import { createEntityWrites, type LocalWriteOptions } from './entityWrites';
import {
  createProduct,
  deleteProduct,
  getProduct,
  getProductByServerId,
  updateProduct,
  type ProductDoc
} from './productRepository';

/** Offline product writes: the row and its queued push, in one transaction. See entityWrites. */

export type ProductWriteOptions = LocalWriteOptions;

const writes = createEntityWrites<ProductDoc>({
  entity: 'products',
  get: getProduct,
  getByServerId: getProductByServerId,
  create: createProduct,
  update: updateProduct,
  softDelete: deleteProduct,
  discardReason: 'Product was deleted before it reached the server'
});

export const findProductByAnyId = writes.findByAnyId;
export const createProductLocally = writes.createLocally;
export const updateProductLocally = writes.updateLocally;
export const deleteProductLocally = writes.deleteLocally;
