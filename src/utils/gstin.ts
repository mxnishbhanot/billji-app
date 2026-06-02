export const GSTIN_LENGTH = 15;

// 2-digit state code + 10-char PAN + entity code + 'Z' + check digit.
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const CODE_POINTS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Official GSTN check-digit algorithm: alternating 1/2 weights over base-36 code points,
// digit-sum each product, check digit = (36 - sum % 36) % 36.
export const isValidGstin = (value: string): boolean => {
  const gstin = value.trim().toUpperCase();
  if (!GSTIN_REGEX.test(gstin)) return false;

  let factor = 2;
  let sum = 0;
  for (let index = GSTIN_LENGTH - 2; index >= 0; index -= 1) {
    const product = CODE_POINTS.indexOf(gstin[index]) * factor;
    sum += Math.floor(product / 36) + (product % 36);
    factor = factor === 2 ? 1 : 2;
  }

  return CODE_POINTS[(36 - (sum % 36)) % 36] === gstin[GSTIN_LENGTH - 1];
};
