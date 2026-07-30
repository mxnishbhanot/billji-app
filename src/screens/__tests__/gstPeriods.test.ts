import { recentPeriods } from '../GstReturnsScreen.periods';

// Period labels are what the user picks a filing month by, so an off-by-one here files
// the wrong month. Fixed clock, no reliance on "now".
const at = (year: number, monthIndex: number) => new Date(year, monthIndex, 15);

test('lists twelve months, newest first, ending on the current month', () => {
  const periods = recentPeriods(at(2026, 6)); // July 2026

  expect(periods).toHaveLength(12);
  expect(periods[0]).toEqual({ value: '2026-07', label: 'Jul 2026' });
  expect(periods[1]).toEqual({ value: '2026-06', label: 'Jun 2026' });
  expect(periods[11]).toEqual({ value: '2025-08', label: 'Aug 2025' });
});

test('crosses the year boundary correctly', () => {
  const periods = recentPeriods(at(2026, 0)); // January 2026

  expect(periods[0]).toEqual({ value: '2026-01', label: 'Jan 2026' });
  expect(periods[1]).toEqual({ value: '2025-12', label: 'Dec 2025' });
  expect(periods[11]).toEqual({ value: '2025-02', label: 'Feb 2025' });
});

test('zero-pads single-digit months so the API gets YYYY-MM', () => {
  const periods = recentPeriods(at(2026, 8)); // September

  expect(periods.map((item) => item.value)).toContain('2026-09');
  expect(periods.every((item) => /^\d{4}-\d{2}$/.test(item.value))).toBe(true);
});
