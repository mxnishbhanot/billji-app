import { calculateGstTotals } from '@/shared/gst/gstMath';
import { Invoice, InvoiceCreateItem, InvoiceItem } from '@/types';

/**
 * A credit note is a return form, not a sales form: every line comes from the source
 * invoice and the only editable number is "how many came back", capped at what was billed.
 * Nothing here can add a line the invoice never had.
 */
export type CreditNoteLine = {
  key: string;
  name: string;
  productId?: string;
  sku?: string;
  unit?: string;
  hsn?: string;
  price: number;
  taxRate?: number;
  billedQuantity: number;
  /** 0 means "this line is not being returned" — it is dropped from the payload. */
  quantity: number;
};

const roundMoney = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

/** What is still creditable on an invoice. `creditedAmount` counts live credit notes. */
export const creditableRemaining = (invoice: Pick<Invoice, 'total' | 'creditedAmount'>) =>
  Math.max(roundMoney(Number(invoice.total || 0) - Number(invoice.creditedAmount || 0)), 0);

export const creditNoteLinesFrom = (invoice: Pick<Invoice, 'items'>): CreditNoteLine[] =>
  (invoice.items || []).map((item, index) => ({
    key: item._id || item._uid || `${item.name}-${index}`,
    name: item.name,
    productId: item.productId || (typeof item.product === 'string' ? item.product : undefined) || undefined,
    sku: item.sku,
    unit: item.unit,
    hsn: item.hsn,
    price: Number(item.price) || 0,
    taxRate: item.taxRate,
    billedQuantity: Math.max(Number(item.quantity) || 0, 0),
    // Seeded with the full billed quantity: a full return is the common case, and
    // reducing a number is less work than typing every line back in.
    quantity: Math.max(Number(item.quantity) || 0, 0)
  }));

export const setLineQuantity = (lines: CreditNoteLine[], key: string, quantity: number): CreditNoteLine[] =>
  lines.map((line) =>
    line.key === key
      ? { ...line, quantity: Math.min(Math.max(Math.trunc(Number(quantity) || 0), 0), line.billedQuantity) }
      : line
  );

const returnedItems = (lines: CreditNoteLine[]): InvoiceItem[] =>
  lines
    .filter((line) => line.quantity > 0)
    .map((line) => ({
      name: line.name,
      productId: line.productId,
      sku: line.sku,
      unit: line.unit,
      hsn: line.hsn,
      quantity: line.quantity,
      price: line.price,
      taxRate: line.taxRate
    }));

/**
 * Live total for the lines being returned, using the same GST rules the server applies on
 * create. The server stays authoritative — this exists so the cap can be enforced before
 * anything is posted, and so the user sees the number they are about to credit.
 */
export const creditNoteTotal = (lines: CreditNoteLine[], invoice: Pick<Invoice, 'tax' | 'supplyType'>) =>
  calculateGstTotals({
    items: returnedItems(lines),
    taxRate: invoice.tax?.rate ?? 0,
    supplyType: invoice.supplyType ?? 'intra'
  }).total;

export const creditNotePayloadItems = (lines: CreditNoteLine[]): InvoiceCreateItem[] =>
  returnedItems(lines).map((item) => ({
    productId: item.productId,
    name: item.name,
    sku: item.sku,
    unit: item.unit,
    quantity: item.quantity,
    price: item.price,
    taxRate: item.taxRate,
    hsn: item.hsn
  }));

/** Null when the note can be created; otherwise the reason it cannot, ready to display. */
export const creditNoteBlocker = ({
  lines,
  reason,
  total,
  remaining
}: {
  lines: CreditNoteLine[];
  reason: string;
  total: number;
  remaining: number;
}) => {
  if (!lines.some((line) => line.quantity > 0)) return 'Set a return quantity on at least one item.';
  if (!reason.trim()) return 'Add a reason for this credit note.';
  if (total > remaining) return `This credit note exceeds what is left on the invoice. At most ${remaining} can still be credited.`;
  return null;
};
