import { formatBytes } from '../storage';

describe('formatBytes', () => {
  it('reports an empty or unknown size as zero rather than NaN', () => {
    expect(formatBytes(0)).toBe('0 KB');
    expect(formatBytes(-1)).toBe('0 KB');
    expect(formatBytes(Number.NaN)).toBe('0 KB');
  });

  it('picks the unit the number reads best in', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(1024 * 1024 * 3.5)).toBe('3.5 MB');
    // Past 10 MB the decimal is noise.
    expect(formatBytes(1024 * 1024 * 42.4)).toBe('42 MB');
    expect(formatBytes(1024 * 1024 * 1024 * 2)).toBe('2.0 GB');
  });
});
