import { calculateGstTotals } from '../gstMath';
import { resolvePlaceOfSupplyCode, stateCodeFromGstin, stateCodeFromName, supplyTypeFor } from '../gstStates';
import { InvoiceItem } from '@/types';

// These cases mirror backend/tests/gstMath.test.js. The builder preview and the stored
// invoice must agree to the paisa, so the same inputs are asserted against the same
// expected numbers on both sides — if one implementation drifts, one of the two fails.
const item = (over: Partial<InvoiceItem>): InvoiceItem => ({ name: 'Item', quantity: 1, price: 100, ...over });

const sumBy = (rows: { [k: string]: unknown }[], key: string) =>
  Math.round(rows.reduce((sum, row) => sum + Number(row[key] || 0), 0) * 100) / 100;

describe('gst split', () => {
  test('halves intra-state tax into CGST and SGST', () => {
    const result = calculateGstTotals({ items: [item({ price: 500, quantity: 2, taxRate: 5 })], supplyType: 'intra' });

    expect(result.taxAmount).toBe(50);
    expect(result.cgstTotal).toBe(25);
    expect(result.sgstTotal).toBe(25);
    expect(result.igstTotal).toBe(0);
    expect(result.total).toBe(1050);
  });

  test('charges IGST only across state lines', () => {
    const result = calculateGstTotals({ items: [item({ price: 500, quantity: 2, taxRate: 5 })], supplyType: 'inter' });

    expect(result.igstTotal).toBe(50);
    expect(result.cgstTotal).toBe(0);
    expect(result.total).toBe(1050);
  });

  test('keeps the halves summing to the tax on odd paise', () => {
    const result = calculateGstTotals({ items: [item({ price: 7.77, taxRate: 18 })] });

    expect(result.taxAmount).toBe(1.4);
    expect(result.cgstTotal + result.sgstTotal).toBe(result.taxAmount);
    expect(result.total).toBe(9.17);
  });
});

describe('per-item rates', () => {
  test('taxes each line at its own rate', () => {
    const result = calculateGstTotals({
      items: [item({ price: 1000, taxRate: 5 }), item({ price: 1000, taxRate: 18 })]
    });

    expect(result.taxAmount).toBe(230);
    expect(result.total).toBe(2230);
  });

  test('uses the document rate for lines without one', () => {
    const result = calculateGstTotals({ items: [item({ price: 100 })], taxRate: 12 });

    expect(result.taxAmount).toBe(12);
  });
});

describe('discount allocation', () => {
  test('spreads the discount so taxable values sum to subtotal minus discount', () => {
    const result = calculateGstTotals({
      items: [item({ price: 100, taxRate: 18 }), item({ price: 200, taxRate: 18 }), item({ price: 300, taxRate: 18 })],
      discountType: 'flat',
      discountValue: 60
    });

    expect(result.discountAmount).toBe(60);
    expect(result.taxableTotal).toBe(540);
    expect(result.taxAmount).toBe(97.2);
    expect(result.total).toBe(637.2);
  });

  test('loses no paise on an uneven split — matches the server exactly', () => {
    const result = calculateGstTotals({
      items: [item({ price: 100, taxRate: 5 }), item({ price: 100, taxRate: 5 }), item({ price: 100, taxRate: 5 })],
      discountType: 'flat',
      discountValue: 10
    });

    expect(result.taxableTotal).toBe(290);
    // Per-line rounding: 4.83 x 3 = 14.49, not 14.50 on the aggregate.
    expect(result.taxAmount).toBe(14.49);
    expect(result.total).toBe(304.49);
  });

  test('taxes the discounted value, not the list price', () => {
    const result = calculateGstTotals({
      items: [item({ price: 1000, taxRate: 18 })],
      discountType: 'percentage',
      discountValue: 50
    });

    expect(result.taxAmount).toBe(90);
    expect(result.total).toBe(590);
  });
});

describe('tax-inclusive pricing', () => {
  test('backs tax out of an inclusive price without changing what the customer pays', () => {
    const result = calculateGstTotals({ items: [item({ price: 1180, taxRate: 18 })], pricesIncludeTax: true });

    expect(result.subtotal).toBe(1000);
    expect(result.taxAmount).toBe(180);
    expect(result.total).toBe(1180);
  });
});

describe('hsn summary', () => {
  test('groups by HSN and rate and reconciles to the invoice tax', () => {
    const result = calculateGstTotals({
      items: [
        item({ name: 'Rice 5kg', price: 500, taxRate: 5, hsn: '1006' }),
        item({ name: 'Rice 10kg', price: 900, taxRate: 5, hsn: '1006' }),
        item({ name: 'Soap', price: 100, quantity: 2, taxRate: 18, hsn: '3401' })
      ]
    });

    expect(result.taxSummary).toHaveLength(2);
    expect(result.taxSummary.find((row) => row.hsn === '1006')?.taxAmount).toBe(70);
    expect(result.taxSummary.find((row) => row.hsn === '3401')?.taxAmount).toBe(36);
    expect(sumBy(result.taxSummary, 'taxAmount')).toBe(result.taxAmount);
  });

  test('separates one HSN billed at two rates', () => {
    const result = calculateGstTotals({
      items: [item({ price: 100, taxRate: 5, hsn: '1006' }), item({ price: 100, taxRate: 12, hsn: '1006' })]
    });

    expect(result.taxSummary.map((row) => row.rate)).toEqual([5, 12]);
  });
});

describe('place of supply', () => {
  test('reads the state code from a GSTIN and a state name', () => {
    expect(stateCodeFromGstin('09ABCDE1234F1Z5')).toBe('09');
    expect(stateCodeFromGstin('99ABCDE1234F1Z5')).toBe('');
    expect(stateCodeFromName('Uttar Pradesh')).toBe('09');
    expect(stateCodeFromName('Atlantis')).toBe('');
  });

  test('prefers the customer GSTIN over their address', () => {
    expect(resolvePlaceOfSupplyCode({ customerGstin: '09ABCDE1234F1Z5', customerState: 'Maharashtra', supplierStateCode: '27' })).toBe('09');
    expect(resolvePlaceOfSupplyCode({ customerState: 'Kerala', supplierStateCode: '27' })).toBe('32');
    // Walk-in customer with nothing on file is a local sale.
    expect(resolvePlaceOfSupplyCode({ supplierStateCode: '27' })).toBe('27');
  });

  test('defaults to intra-state when either side is unknown', () => {
    expect(supplyTypeFor('27', '27')).toBe('intra');
    expect(supplyTypeFor('27', '09')).toBe('inter');
    expect(supplyTypeFor('', '09')).toBe('intra');
  });
});
