import { GSTIN_LENGTH, isValidGstin } from '../gstin';

describe('isValidGstin', () => {
  it('accepts a checksum-valid GSTIN', () => {
    expect(isValidGstin('27AAPFU0939F1ZV')).toBe(true);
  });

  it('accepts lowercase and surrounding whitespace', () => {
    expect(isValidGstin(' 27aapfu0939f1zv ')).toBe(true);
  });

  it('rejects a GSTIN with a wrong check digit', () => {
    expect(isValidGstin('27AAPFU0939F1ZW')).toBe(false);
  });

  it('rejects random digits', () => {
    expect(isValidGstin('123456789012345')).toBe(false);
  });

  it('rejects values that are too short or too long', () => {
    expect(isValidGstin('27AAPFU0939F1Z')).toBe(false);
    expect(isValidGstin('27AAPFU0939F1ZV1')).toBe(false);
  });

  it('rejects empty input', () => {
    expect(isValidGstin('')).toBe(false);
  });

  it('rejects format violations (missing Z at position 14)', () => {
    expect(isValidGstin('27AAPFU0939F1AV')).toBe(false);
  });

  it('exports the standard GSTIN length', () => {
    expect(GSTIN_LENGTH).toBe(15);
  });
});
