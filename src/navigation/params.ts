import { InvoiceSortParam, ProductSortParam } from './types';

export const invoiceSortParams: readonly InvoiceSortParam[] = ['newest', 'oldest', 'amount-high', 'amount-low'];
export const productSortParams: readonly ProductSortParam[] = ['updated', 'top-sales', 'name-asc', 'price-high', 'price-low', 'stock-low'];

export const isInvoiceSortParam = (value?: string | null): value is InvoiceSortParam =>
  Boolean(value && invoiceSortParams.includes(value as InvoiceSortParam));

export const isProductSortParam = (value?: string | null): value is ProductSortParam =>
  Boolean(value && productSortParams.includes(value as ProductSortParam));

export const safeInvoiceSortParam = (value?: string | null) => (isInvoiceSortParam(value) ? value : undefined);
export const safeProductSortParam = (value?: string | null) => (isProductSortParam(value) ? value : undefined);
