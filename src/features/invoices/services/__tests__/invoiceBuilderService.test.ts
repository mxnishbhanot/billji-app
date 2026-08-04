import {
  addProductToItems,
  buildInvoiceDraftPayload,
  buildInvoicePayload,
  findStockShortages,
  hasInvoiceDraftContent,
  setItemQuantity,
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

  it('sets item quantity directly, clamping to a whole number of at least one', () => {
    const items = [{ name: 'Notebook', quantity: 2, price: 120 }];

    expect(setItemQuantity(items, 0, 25)[0].quantity).toBe(25);
    expect(setItemQuantity(items, 0, 0)[0].quantity).toBe(1);
    expect(setItemQuantity(items, 0, 3.7)[0].quantity).toBe(3);
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

  it('defaults allowOversell to false so the first save must confirm shortage', () => {
    const payload = buildInvoicePayload({
      selectedCustomerId: 'customer-1',
      items: [{ productId: 'product-1', name: 'Notebook', quantity: 2, price: 120 }],
      taxRate: '0',
      discountType: 'flat',
      discountValue: '0',
      notes: ''
    });

    expect(payload.allowOversell).toBe(false);
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
    const itemDraft = { ...emptyDraft, items: [{ productId: 'p1', name: 'Pen', quantity: 1, unitPrice: 10 } as never] };
    // Incidental state must NOT count as recoverable content.
    const customerOnlyDraft = { ...emptyDraft, selectedCustomerId: 'cust-1' };
    const taxOnlyDraft = { ...emptyDraft, taxRate: '18' };
    const discountOnlyDraft = { ...emptyDraft, discountValue: '5' };

    expect(hasInvoiceDraftContent(emptyDraft)).toBe(false);
    expect(hasInvoiceDraftContent(noteDraft)).toBe(true);
    expect(hasInvoiceDraftContent(itemDraft)).toBe(true);
    expect(hasInvoiceDraftContent(customerOnlyDraft)).toBe(false);
    expect(hasInvoiceDraftContent(taxOnlyDraft)).toBe(false);
    expect(hasInvoiceDraftContent(discountOnlyDraft)).toBe(false);
  });
});
