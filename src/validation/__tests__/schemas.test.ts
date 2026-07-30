import { customItemSchema, customerSchema, emailSchema, productSchema, settingsSchema } from '../schemas';

describe('validation schemas', () => {
  it('rejects invalid customer phone numbers', () => {
    const result = customerSchema.safeParse({ name: 'Acme', phone: '12345', countryCode: '+91' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Phone must be exactly 10 digits');
  });

  it('accepts optional empty emails but rejects malformed emails', () => {
    expect(emailSchema.safeParse({ email: 'owner@billji.local' }).success).toBe(true);
    expect(customerSchema.safeParse({ name: 'Acme', phone: '9876543210', email: '' }).success).toBe(true);
    expect(customerSchema.safeParse({ name: 'Acme', phone: '9876543210', email: 'bad-email' }).success).toBe(false);
  });

  it('keeps product, custom item, and settings required fields guarded', () => {
    expect(productSchema.safeParse({ name: '', price: '', stockQuantity: '' }).success).toBe(false);
    // unit is required and always seeded from customItemDefaults (invoiceBuilderService).
    expect(customItemSchema.safeParse({ name: 'Service', price: '100', quantity: '1', unit: 'pcs' }).success).toBe(true);
    expect(customItemSchema.safeParse({ name: 'Service', price: '100', quantity: '1' }).success).toBe(false);
    expect(settingsSchema.safeParse({ businessName: '', invoicePrefix: '', theme: 'light' }).success).toBe(false);
  });
});
