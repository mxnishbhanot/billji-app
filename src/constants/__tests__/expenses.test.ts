import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, MONTH_RANGE_PRESETS } from '../expenses';

const resolve = (key: string, now: Date) => MONTH_RANGE_PRESETS.find((preset) => preset.key === key)!.resolve(now);

// A range that is off by one day silently drops the expenses recorded on a month boundary,
// so the boundaries are pinned against a fixed clock rather than "now".
const JUNE_15 = new Date(2026, 5, 15);

test('this month spans the first to the last day, including a 30-day month', () => {
  expect(resolve('this-month', JUNE_15)).toEqual({ from: '2026-06-01', to: '2026-06-30' });
});

test('last month ends on its own last day, not the first of this one', () => {
  expect(resolve('last-month', JUNE_15)).toEqual({ from: '2026-05-01', to: '2026-05-31' });
});

test('last three months covers the current month plus the two before it', () => {
  expect(resolve('this-quarter', JUNE_15)).toEqual({ from: '2026-04-01', to: '2026-06-30' });
});

test('this year covers January to December', () => {
  expect(resolve('this-year', JUNE_15)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
});

test('crosses the year boundary from January', () => {
  const jan = new Date(2026, 0, 10);

  expect(resolve('last-month', jan)).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  expect(resolve('this-quarter', jan)).toEqual({ from: '2025-11-01', to: '2026-01-31' });
});

test('handles February in a leap year', () => {
  expect(resolve('this-month', new Date(2028, 1, 10))).toEqual({ from: '2028-02-01', to: '2028-02-29' });
});

test('every category has a label — an unlabelled one would render blank', () => {
  for (const category of EXPENSE_CATEGORIES) {
    expect(EXPENSE_CATEGORY_LABELS[category]).toBeTruthy();
  }
});
