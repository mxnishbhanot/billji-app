import {
  addProductToItems,
  buildInvoiceDraftPayload,
  buildInvoicePayload,
  findStockShortages,
  hasInvoiceDraftContent,
  updateItemQuantity
} from '../invoiceBuilderService';
import { Product } from '@/types';

const product = (overrides: Partial<Product> = {}): Product => ({
  _id: 'product-1',
  name: 'Notebook',
  price: 120,
  stockQuantity: 5,
  lowStockThreshold: 2,
  trackStock: true,
  sku: 'NB-1',
  unit: 'pcs',
  taxRate: 18,
  ...overrides
});

describe('invoiceBuilderService', () => {
  it('adds products and increments existing item quantity', () => {
    const first = addProductToItems([], product());
    const second = addProductToItems(first, product());

    expect(first).toHaveLength(1);
    expect(second).toEqual([{ ...first[0], quantity: 2 }]);
  });

  it('never decrements item quantity below one', () => {
    const updated = updateItemQuantity([{ name: 'Notebook', quantity: 1, price: 120 }], 0, -10);

    expect(updated[0].quantity).toBe(1);
  });

  it('builds create payload with numeric form values and oversell flag', () => {
    const payload = buildInvoicePayload({
      selectedCustomerId: 'customer-1',
      items: [{ productId: 'product-1', name: 'Notebook', quantity: 2, price: 120, taxRate: 18 }],
      taxRate: '18',
      discountType: 'percentage',
      discountValue: '10',
      notes: 'Please pay soon',
      allowOversell: true
    });

    expect(payload).toMatchObject({
      customerId: 'customer-1',
      taxRate: 18,
      discountType: 'percentage',
      discountValue: 10,
      notes: 'Please pay soon',
      allowOversell: true
    });
    expect(payload.items[0]).toMatchObject({ productId: 'product-1', quantity: 2, price: 120 });
  });

  it('detects stock shortages across duplicate product rows', () => {
    const shortages = findStockShortages(
      [
        { productId: 'product-1', name: 'Notebook', quantity: 3, price: 120 },
        { productId: 'product-1', name: 'Notebook', quantity: 4, price: 120 }
      ],
      new Map([['product-1', product({ stockQuantity: 5 })]])
    );

    expect(shortages).toEqual([{ productId: 'product-1', name: 'Notebook', sku: 'NB-1', requested: 7, available: 5, shortage: 2 }]);
  });

  it('recognizes meaningful draft content for recovery', () => {
    const emptyDraft = buildInvoiceDraftPayload({
      selectedCustomerId: '',
      selectedCustomer: null,
      items: [],
      taxRate: '0',
      discountType: 'flat',
      discountValue: '0',
      notes: ''
    });
    const noteDraft = { ...emptyDraft, notes: 'Remember this' };

    expect(hasInvoiceDraftContent(emptyDraft)).toBe(false);
    expect(hasInvoiceDraftContent(noteDraft)).toBe(true);
  });
});
