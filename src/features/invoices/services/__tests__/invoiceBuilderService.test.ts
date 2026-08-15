import {
  addProductToItems,
  buildInvoiceDraftPayload,
  buildInvoicePayload,
  findStockShortages,
  hasInvoiceDraftContent,
  invoiceItemsToBuilderItems,
  setItemPrice,
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

  it('omits customerId entirely for a walk-in / cash sale', () => {
    const payload = buildInvoicePayload({
      selectedCustomerId: '',
      items: [{ productId: 'product-1', name: 'Notebook', quantity: 1, price: 120 }],
      taxRate: '18',
      discountType: 'flat',
      discountValue: '0',
      notes: ''
    });

    // A blank string would be sent as an invalid customer id; the key must be absent.
    expect('customerId' in payload).toBe(false);
    expect(payload.items).toHaveLength(1);
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

  it('overrides a single line price without touching quantity, identity or other rows', () => {
    const items = [
      { productId: 'product-1', name: 'Sugar 1kg', quantity: 2, price: 50, taxRate: 5, hsn: '1701' },
      { productId: 'product-2', name: 'Notebook', quantity: 1, price: 120, taxRate: 18 }
    ];
    const updated = setItemPrice(items, 0, 48);

    expect(updated[0]).toEqual({ productId: 'product-1', name: 'Sugar 1kg', quantity: 2, price: 48, taxRate: 5, hsn: '1701' });
    expect(updated[1]).toBe(items[1]);
    // Original array is untouched, so the catalog-sourced price is never mutated in place.
    expect(items[0].price).toBe(50);
  });

  it('clamps a negative line price to zero', () => {
    expect(setItemPrice([{ name: 'Sugar 1kg', quantity: 1, price: 50 }], 0, -10)[0].price).toBe(0);
  });

  it('maps saved invoice lines back into builder rows for duplicate & correct', () => {
    const rows = invoiceItemsToBuilderItems([
      // A saved line carries the product ref as `product` plus server-computed money.
      { product: 'product-1', name: 'Sugar 1kg', quantity: 2, price: 50, unit: 'kg', sku: 'SG-1', hsn: '1701', taxRate: 5, taxableValue: 100, taxAmount: 5, cgst: 2.5, sgst: 2.5, total: 105 },
      { name: 'Delivery', quantity: 1, price: 40, isCustom: true, taxableValue: 40, total: 40 }
    ]);

    expect(rows[0]).toEqual({ productId: 'product-1', name: 'Sugar 1kg', quantity: 2, price: 50, sku: 'SG-1', unit: 'kg', hsn: '1701', taxRate: 5 });
    // Server-computed money is dropped; the builder and then the server recompute it.
    expect(rows[0]).not.toHaveProperty('taxAmount');
    expect(rows[0]).not.toHaveProperty('total');
    // Custom lines keep their flag and get a fresh client-only key.
    expect(rows[1]).toMatchObject({ name: 'Delivery', price: 40, isCustom: true });
    expect(rows[1]._uid).toMatch(/^custom-\d+$/);
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
