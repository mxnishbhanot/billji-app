import {
  creditableRemaining,
  creditNoteBlocker,
  creditNoteLinesFrom,
  creditNotePayloadItems,
  creditNoteTotal,
  setLineQuantity
} from '../creditNoteBuilder';
import { Invoice } from '@/types';

const invoice = {
  total: 2100,
  creditedAmount: 0,
  tax: { rate: 5, amount: 100 },
  supplyType: 'intra' as const,
  items: [
    { _id: 'a', name: 'Rice', product: 'p1', quantity: 2, price: 500, taxRate: 5, unit: 'kg' },
    { _id: 'b', name: 'Dal', product: 'p2', quantity: 1, price: 1000, taxRate: 5 }
  ]
} as unknown as Invoice;

describe('creditNoteBuilder', () => {
  it('seeds every line at the full billed quantity', () => {
    expect(creditNoteLinesFrom(invoice).map((line) => [line.name, line.quantity, line.billedQuantity])).toEqual([
      ['Rice', 2, 2],
      ['Dal', 1, 1]
    ]);
  });

  it('caps a return quantity at what was billed and floors it at zero', () => {
    const lines = creditNoteLinesFrom(invoice);
    expect(setLineQuantity(lines, 'a', 9).find((line) => line.key === 'a')?.quantity).toBe(2);
    expect(setLineQuantity(lines, 'a', -3).find((line) => line.key === 'a')?.quantity).toBe(0);
  });

  it('drops zero-quantity lines from the payload', () => {
    const lines = setLineQuantity(creditNoteLinesFrom(invoice), 'b', 0);
    expect(creditNotePayloadItems(lines)).toEqual([
      { productId: 'p1', name: 'Rice', sku: undefined, unit: 'kg', quantity: 2, price: 500, taxRate: 5, hsn: undefined }
    ]);
  });

  it('totals only what is being returned, with tax', () => {
    const lines = setLineQuantity(creditNoteLinesFrom(invoice), 'b', 0);
    expect(creditNoteTotal(lines, invoice)).toBe(1050);
    expect(creditNoteTotal(creditNoteLinesFrom(invoice), invoice)).toBe(2100);
  });

  it('reports what is still creditable', () => {
    expect(creditableRemaining(invoice)).toBe(2100);
    expect(creditableRemaining({ ...invoice, creditedAmount: 600 })).toBe(1500);
    // A fully-credited invoice offers nothing, never a negative.
    expect(creditableRemaining({ ...invoice, creditedAmount: 2100 })).toBe(0);
  });

  it('blocks an empty return, a missing reason and an over-cap total', () => {
    const lines = creditNoteLinesFrom(invoice);
    const empty = lines.map((line) => ({ ...line, quantity: 0 }));

    expect(creditNoteBlocker({ lines: empty, reason: 'Damaged', total: 0, remaining: 2100 })).toMatch(/at least one item/);
    expect(creditNoteBlocker({ lines, reason: '  ', total: 2100, remaining: 2100 })).toMatch(/reason/);
    expect(creditNoteBlocker({ lines, reason: 'Damaged', total: 2100, remaining: 1000 })).toMatch(/exceeds/);
    expect(creditNoteBlocker({ lines, reason: 'Damaged', total: 2100, remaining: 2100 })).toBeNull();
  });
});
