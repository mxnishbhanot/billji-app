import { formatCurrencyCompact } from '@/utils/format';

describe('formatCurrencyCompact', () => {
  it('keeps amounts below a lakh exact', () => {
    expect(formatCurrencyCompact(99999)).toContain('99,999');
    expect(formatCurrencyCompact(0)).toContain('0');
  });

  it('shortens lakhs and crores', () => {
    expect(formatCurrencyCompact(125000)).toBe('₹1.25L');
    expect(formatCurrencyCompact(1200000)).toBe('₹12L');
    expect(formatCurrencyCompact(24000000)).toBe('₹2.4Cr');
    expect(formatCurrencyCompact(10000000)).toBe('₹1Cr');
  });

  it('does not eat trailing zeros of whole numbers', () => {
    expect(formatCurrencyCompact(1000000000)).toBe('₹100Cr');
  });

  it('handles negatives and junk', () => {
    expect(formatCurrencyCompact(-500000)).toBe('₹-5L');
    expect(formatCurrencyCompact(null)).toContain('0');
  });
});
