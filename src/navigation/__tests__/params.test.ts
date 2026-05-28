import { isInvoiceSortParam, isProductSortParam, safeInvoiceSortParam, safeProductSortParam } from '../params';

describe('navigation param guards', () => {
  it('accepts known invoice and product sort params', () => {
    expect(isInvoiceSortParam('amount-high')).toBe(true);
    expect(safeInvoiceSortParam('oldest')).toBe('oldest');
    expect(isProductSortParam('top-sales')).toBe(true);
    expect(safeProductSortParam('stock-low')).toBe('stock-low');
  });

  it('drops unknown runtime route params', () => {
    expect(isInvoiceSortParam('DROP TABLE')).toBe(false);
    expect(safeInvoiceSortParam('invalid-sort')).toBeUndefined();
    expect(isProductSortParam('amount-high')).toBe(false);
    expect(safeProductSortParam(null)).toBeUndefined();
  });
});
