const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The last twelve filing periods, newest first.
 *
 * Lives outside the screen so it can be tested against a fixed clock — importing the
 * screen itself would drag in the native module graph for no benefit.
 */
export const recentPeriods = (now = new Date()) =>
  Array.from({ length: 12 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    return {
      value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: `${MONTHS[date.getMonth()]} ${date.getFullYear()}`
    };
  });
