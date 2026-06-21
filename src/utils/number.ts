// Live input sanitizers for numeric TextInputs. They strip anything that isn't a
// valid number as the user types, so a leading '-' (Android keyboards, paste, or
// hardware keyboards expose one even on decimal-pad/number-pad) can never enter
// the field. This is the single source of truth for numeric input filtering.

// Keeps digits and a single decimal point, capped at `maxDecimals` places.
// No minus sign survives, so the result is always >= 0. Returns a string so it
// can drive a controlled TextInput; callers parse with Number() at submit.
export const sanitizeDecimal = (text: string, maxDecimals = 2): string => {
  if (!text) return '';
  let cleaned = text.replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot !== -1) {
    // Collapse any later dots into nothing — keep only the first.
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
    const [whole, decimals] = cleaned.split('.');
    cleaned = `${whole}.${decimals.slice(0, maxDecimals)}`;
  }
  return cleaned;
};

// Keeps digits only — no sign, no decimal. Always a non-negative whole number.
export const sanitizeInteger = (text: string): string => (text ? text.replace(/[^0-9]/g, '') : '');
