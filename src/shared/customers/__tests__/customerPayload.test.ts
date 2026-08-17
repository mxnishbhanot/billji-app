import { resolvePlaceOfSupplyCode, supplyTypeFor } from '@/shared/gst/gstStates';
import { hasWhatsAppPhone, withBillingAddress } from '../customerPayload';

describe('withBillingAddress', () => {
  test('folds the flat form fields into billingAddress, keeping line1', () => {
    expect(
      withBillingAddress({ name: 'A', phone: '9876543210', address: '12 MG Road', state: 'West Bengal', city: 'Kolkata', pinCode: '700001' })
    ).toEqual({
      name: 'A',
      phone: '9876543210',
      address: '12 MG Road',
      billingAddress: { line1: '12 MG Road', city: 'Kolkata', state: 'West Bengal', pinCode: '700001' }
    });
  });

  test('leaves a payload that carries no address fields untouched', () => {
    const payload = { name: 'A', phone: '9876543210', isActive: false };
    expect(withBillingAddress(payload)).toBe(payload);
  });

  // The bug this fixes: no state on the customer meant place of supply fell back to the
  // supplier's own state, so a Kolkata sale from Maharashtra billed CGST+SGST.
  test('a customer state makes an out-of-state sale inter-state', () => {
    const saved = withBillingAddress({ name: 'A', phone: '9876543210', state: 'West Bengal' }) as {
      billingAddress: { state: string };
    };
    const code = resolvePlaceOfSupplyCode({ customerState: saved.billingAddress.state, supplierStateCode: '27' });
    expect(supplyTypeFor('27', code)).toBe('inter');
  });
});

describe('hasWhatsAppPhone', () => {
  test('true for a customer with a dialable number, however it is formatted', () => {
    expect(hasWhatsAppPhone({ phone: '9876543210' })).toBe(true);
    expect(hasWhatsAppPhone({ phone: '+91 98765-43210' })).toBe(true);
  });

  test('false for a customerless invoice snapshot or an unusable phone', () => {
    expect(hasWhatsAppPhone(null)).toBe(false);
    expect(hasWhatsAppPhone(undefined)).toBe(false);
    expect(hasWhatsAppPhone({ name: 'Walk-in' })).toBe(false);
    expect(hasWhatsAppPhone({ phone: '' })).toBe(false);
    expect(hasWhatsAppPhone({ phone: '  --  ' })).toBe(false);
  });
});
