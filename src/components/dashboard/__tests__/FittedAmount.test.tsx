import { fitFontSize } from '@/components/dashboard/FittedAmount';

describe('fitFontSize', () => {
  it('uses the max size when the text has room', () => {
    expect(fitFontSize('₹400', 300, 38, 20)).toBe(38);
  });

  it('shrinks a long figure in a narrow slot', () => {
    expect(fitFontSize('₹10,40,000.00', 200, 38, 20)).toBeLessThan(38);
  });

  it('never goes below the floor', () => {
    expect(fitFontSize('₹1,20,40,000.00', 60, 38, 20)).toBe(20);
  });
});
