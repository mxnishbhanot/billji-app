import type { SQLiteDatabase } from 'expo-sqlite';
import type { Product } from '../types';
import {
  createEntityRepository,
  type EntityCursor,
  type EntityDocument,
  type EntityPage,
  type ListQuery,
  type WriteOptions
} from './entityRepository';
import type { MongoDoc } from './mappers';

/** Products, read and written locally. SQLite only — nothing here touches the network. */

export type ProductDoc = MongoDoc & Partial<Product>;
export type ProductRecord = EntityDocument<ProductDoc>;
export type ProductCursor = EntityCursor;
export type ProductPage = EntityPage<ProductDoc>;
export type { WriteOptions };

export type ProductQuery = Omit<ListQuery, 'where'> & { category?: string };

const repository = createEntityRepository<ProductDoc>({
  entity: 'products',
  label: 'product',
  searchColumns: ['name', 'sku', 'barcode'],
  sortColumn: 'name',
  filterColumns: ['category', 'barcode', 'sku']
});

const withFilters = ({ category, ...query }: ProductQuery): ListQuery => ({
  ...query,
  where: category ? { category } : undefined
});

export const getProduct = repository.get;
export const getProductByServerId = repository.getByServerId;
export const createProduct = repository.create;
export const updateProduct = repository.update;
export const deleteProduct = repository.softDelete;

export const listProducts = (query: ProductQuery): Promise<ProductPage> => repository.list(withFilters(query));
export const countProducts = (query: ProductQuery): Promise<number> => repository.count(withFilters(query));

/** A scan is an exact lookup on the partial barcode index, not a search. */
export const findProductByBarcode = (
  businessId: string,
  barcode: string,
  txn?: SQLiteDatabase
): Promise<ProductRecord | null> => repository.findBy('barcode', barcode, businessId, txn);
