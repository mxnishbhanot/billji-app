import { buildOrderPayload } from '../orderBuilderService';

describe('orderBuilderService', () => {
  it('builds an order create payload with numeric form values and no oversell flag', () => {
    const payload = buildOrderPayload({
      selectedCustomerId: 'customer-1',
      items: [{ productId: 'product-1', name: 'Notebook', quantity: 2, price: 120, taxRate: 18 }],
      taxRate: '18',
      discountType: 'percentage',
      discountValue: '10',
      notes: 'Deliver next week'
    });

    expect(payload).toMatchObject({
      customerId: 'customer-1',
      taxRate: 18,
      discountType: 'percentage',
      discountValue: 10,
      notes: 'Deliver next week'
    });
    expect(payload.items[0]).toMatchObject({ productId: 'product-1', quantity: 2, price: 120, taxRate: 18 });
    // Orders never carry an oversell flag — stock is only enforced at invoice time.
    expect('allowOversell' in payload).toBe(false);
  });

  it('coerces empty numeric fields to safe defaults', () => {
    const payload = buildOrderPayload({
      selectedCustomerId: 'customer-2',
      items: [{ name: 'Custom item', quantity: 1, price: 0, isCustom: true }],
      taxRate: '',
      discountType: 'flat',
      discountValue: '',
      notes: ''
    });

    expect(payload.taxRate).toBe(0);
    expect(payload.discountValue).toBe(0);
    expect(payload.items[0]).toMatchObject({ name: 'Custom item', quantity: 1, price: 0, isCustom: true });
  });
});
