import { DiscountType, InvoiceItem } from '@/types';

// Client mirror of backend/src/utils/invoiceMath.js. The builder needs live totals before
// anything is posted, so the same rules exist on both sides — they must stay in step, and
// both are covered by equivalent test cases. The server stays authoritative: what it
// returns on create is what gets stored and printed.

const roundMoney = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

export type GstSummaryRow = {
  hsn: string;
  rate: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  taxAmount: number;
};

export type GstTotals = {
  subtotal: number;
  discountAmount: number;
  taxableTotal: number;
  taxAmount: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  taxSummary: GstSummaryRow[];
  total: number;
};

/** Splits `amount` across `weights`, with leftover paise going to the largest weights. */
const allocateProportionally = (amount: number, weights: number[]) => {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const target = roundMoney(amount);
  if (target <= 0 || totalWeight <= 0) return weights.map(() => 0);

  const parts = weights.map((weight) => Math.floor((weight / totalWeight) * target * 100) / 100);
  const distributed = roundMoney(parts.reduce((sum, part) => sum + part, 0));
  let remainder = Math.round((target - distributed) * 100);

  const order = weights
    .map((weight, index) => ({ weight, index }))
    .filter((entry) => entry.weight > 0)
    .sort((a, b) => b.weight - a.weight);

  let cursor = 0;
  while (remainder > 0 && order.length) {
    const targetIndex = order[cursor % order.length].index;
    parts[targetIndex] = roundMoney(parts[targetIndex] + 0.01);
    remainder -= 1;
    cursor += 1;
  }

  return parts;
};

export const calculateGstTotals = ({
  items,
  taxRate = 0,
  discountType = 'flat',
  discountValue = 0,
  supplyType = 'intra',
  pricesIncludeTax = false
}: {
  items: InvoiceItem[];
  taxRate?: number;
  discountType?: DiscountType;
  discountValue?: number;
  supplyType?: 'intra' | 'inter';
  pricesIncludeTax?: boolean;
}): GstTotals => {
  const fallbackRate = Math.max(Number(taxRate) || 0, 0);
  const isInterState = supplyType === 'inter';

  const priced = items.map((item) => {
    const quantity = Math.max(Number(item.quantity) || 0, 0);
    const price = Math.max(Number(item.price) || 0, 0);
    const rate = Math.max(Number(item.taxRate ?? fallbackRate) || 0, 0);
    const gross = roundMoney(quantity * price);
    const netOfTax = pricesIncludeTax ? roundMoney(gross / (1 + rate / 100)) : gross;
    return { hsn: item.hsn ? String(item.hsn).trim() : '', rate, gross, netOfTax };
  });

  const subtotal = roundMoney(priced.reduce((sum, item) => sum + item.netOfTax, 0));
  const rawDiscount = discountType === 'percentage' ? subtotal * (Number(discountValue || 0) / 100) : Number(discountValue || 0);
  const discountAmount = roundMoney(Math.min(Math.max(rawDiscount || 0, 0), subtotal));
  const discountShares = allocateProportionally(discountAmount, priced.map((item) => item.netOfTax));

  const lines = priced.map((item, index) => {
    const taxableValue = roundMoney(Math.max(item.netOfTax - discountShares[index], 0));
    const taxAmount = roundMoney(taxableValue * (item.rate / 100));
    const cgst = isInterState ? 0 : roundMoney(taxAmount / 2);
    return {
      ...item,
      taxableValue,
      taxAmount,
      cgst,
      sgst: isInterState ? 0 : roundMoney(taxAmount - cgst),
      igst: isInterState ? taxAmount : 0
    };
  });

  const summaryByKey = new Map<string, GstSummaryRow>();
  for (const line of lines) {
    const key = `${line.hsn}|${line.rate}`;
    const row =
      summaryByKey.get(key) || { hsn: line.hsn, rate: line.rate, taxableValue: 0, cgst: 0, sgst: 0, igst: 0, taxAmount: 0 };
    row.taxableValue = roundMoney(row.taxableValue + line.taxableValue);
    row.cgst = roundMoney(row.cgst + line.cgst);
    row.sgst = roundMoney(row.sgst + line.sgst);
    row.igst = roundMoney(row.igst + line.igst);
    row.taxAmount = roundMoney(row.taxAmount + line.taxAmount);
    summaryByKey.set(key, row);
  }

  const taxAmount = roundMoney(lines.reduce((sum, line) => sum + line.taxAmount, 0));
  const taxableTotal = roundMoney(lines.reduce((sum, line) => sum + line.taxableValue, 0));

  return {
    subtotal,
    discountAmount,
    taxableTotal,
    taxAmount,
    cgstTotal: roundMoney(lines.reduce((sum, line) => sum + line.cgst, 0)),
    sgstTotal: roundMoney(lines.reduce((sum, line) => sum + line.sgst, 0)),
    igstTotal: roundMoney(lines.reduce((sum, line) => sum + line.igst, 0)),
    taxSummary: [...summaryByKey.values()].sort((a, b) => a.rate - b.rate || a.hsn.localeCompare(b.hsn)),
    total: roundMoney(taxableTotal + taxAmount)
  };
};
