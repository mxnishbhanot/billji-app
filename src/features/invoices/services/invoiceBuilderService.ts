import { Customer, CustomerFormValues, CustomItemFormValues, DiscountType, InvoiceCreatePayload, InvoiceDraftPayload, InvoiceItem, Product, StockShortage } from '@/types';
import { DEFAULT_UNIT } from '@/constants/units';

export const customerDefaults: CustomerFormValues = {
  name: '',
  phone: '',
  countryCode: '+91',
  email: '',
  address: '',
  gstNumber: '',
  state: '',
  city: '',
  pinCode: ''
};
export const customItemDefaults: CustomItemFormValues = { name: '', price: '', quantity: '1', unit: DEFAULT_UNIT };

export const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join('') || '?';
};

export const productToInvoiceItem = (product: Product): InvoiceItem => ({
  productId: product._id,
  name: product.name,
  price: product.price,
  quantity: 1,
  sku: product.sku,
  unit: product.unit,
  // HSN travels with the line so the GST summary and the printed invoice carry it.
  hsn: product.hsn,
  taxRate: product.taxRate
});

export const addProductToItems = (items: InvoiceItem[], product: Product) => {
  const existing = items.find((item) => item.productId === product._id);
  if (existing) {
    return items.map((item) => (item.productId === product._id ? { ...item, quantity: item.quantity + 1 } : item));
  }
  return [...items, productToInvoiceItem(product)];
};

/**
 * Feedback line for re-adding a product that is already on the bill. The row it touches may
 * be scrolled out of view and the row count does not change, so without this the user sees
 * nothing happen. Null for a brand-new product (the new row is its own feedback) and for
 * custom items (no productId to match on).
 */
export const duplicateAddToastMessage = (items: InvoiceItem[], product: Product) => {
  const existing = items.find((item) => item.productId === product._id);
  return existing ? `${existing.name} — qty ${existing.quantity + 1}` : null;
};

export const updateItemQuantity =(items: InvoiceItem[], index: number, delta: number) =>
  items.map((item, itemIndex) => (itemIndex === index ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item));

export const setItemQuantity = (items: InvoiceItem[], index: number, quantity: number) =>
  items.map((item, itemIndex) => (itemIndex === index ? { ...item, quantity: Math.max(1, Math.floor(quantity)) } : item));

// Per-line selling price override. Only this invoice line moves — the catalog product,
// its cost snapshot and the line's own taxRate/hsn are all left alone, and the server
// recomputes tax from the price it is sent.
export const setItemPrice = (items: InvoiceItem[], index: number, price: number) =>
  items.map((item, itemIndex) => (itemIndex === index ? { ...item, price: Math.max(0, price) } : item));

export const removeInvoiceItem = (items: InvoiceItem[], index: number) => items.filter((_, itemIndex) => itemIndex !== index);

/**
 * Maps a saved invoice's lines back into builder rows for "Duplicate & correct".
 * Server-computed money (taxableValue/taxAmount/cgst/…/total) is dropped — the builder
 * recalculates it, and the server recomputes it again on create. `product` becomes
 * `productId` so duplicate-add matching and row keys behave like a freshly picked item.
 */
export const invoiceItemsToBuilderItems = (items: InvoiceItem[]): InvoiceItem[] =>
  items.map((item) => ({
    productId: item.productId ?? (typeof item.product === 'string' ? item.product : undefined),
    name: item.name,
    price: item.price,
    quantity: item.quantity,
    sku: item.sku,
    unit: item.unit,
    hsn: item.hsn,
    taxRate: item.taxRate,
    ...(item.isCustom ? { isCustom: true, _uid: `custom-${(customItemSeq += 1)}` } : {})
  }));

// Monotonic client-only id so custom-item rows keep a stable React key (and stepper
// state) across reorders/removals — custom items have no productId to key on.
let customItemSeq = 0;

export const customItemFromForm = (values: CustomItemFormValues): InvoiceItem => ({
  _uid: `custom-${(customItemSeq += 1)}`,
  name: values.name,
  price: Number(values.price),
  quantity: Number(values.quantity || 1),
  unit: values.unit || DEFAULT_UNIT,
  isCustom: true
});

export const buildInvoicePayload = ({
  selectedCustomerId,
  items,
  taxRate,
  discountType,
  discountValue,
  notes,
  allowOversell = false
}: {
  selectedCustomerId: string;
  items: InvoiceItem[];
  taxRate: string;
  discountType: DiscountType;
  discountValue: string;
  notes: string;
  allowOversell?: boolean;
}): InvoiceCreatePayload => ({
  // Omitted, never blank: a walk-in/cash sale has no customer, and the server reads a
  // missing customerId as exactly that (customer stays null, no Customer row is created).
  ...(selectedCustomerId ? { customerId: selectedCustomerId } : {}),
  items: items.map((item) => ({
    productId: item.productId,
    name: item.name,
    sku: item.sku,
    unit: item.unit,
    quantity: Number(item.quantity || 1),
    price: Number(item.price || 0),
    taxRate: item.taxRate,
    hsn: item.hsn,
    isCustom: item.isCustom
  })),
  taxRate: Number(taxRate || 0),
  discountType,
  discountValue: Number(discountValue || 0),
  notes,
  allowOversell
});

export const findStockShortages = (items: InvoiceItem[], productById: Map<string, Product>): StockShortage[] => {
  const requested = new Map<string, number>();
  items.forEach((item) => {
    if (item.productId) requested.set(item.productId, (requested.get(item.productId) || 0) + Number(item.quantity || 0));
  });

  return Array.from(requested.entries()).flatMap(([productId, quantity]) => {
    const product = productById.get(productId);
    if (!product || product.trackStock === false || quantity <= product.stockQuantity) return [];
    return [{
      productId,
      name: product.name,
      sku: product.sku,
      requested: quantity,
      available: product.stockQuantity,
      shortage: quantity - product.stockQuantity
    }];
  });
};

export const buildInvoiceDraftPayload = ({
  selectedCustomerId,
  selectedCustomer,
  items,
  taxRate,
  discountType,
  discountValue,
  notes
}: {
  selectedCustomerId: string;
  selectedCustomer: Customer | null;
  items: InvoiceItem[];
  taxRate: string;
  discountType: DiscountType;
  discountValue: string;
  notes: string;
}): InvoiceDraftPayload => ({
  selectedCustomerId,
  selectedCustomer,
  items,
  taxRate,
  discountType,
  discountValue,
  notes
});

// A draft is worth saving/recovering only when it holds real invoice work: at least
// one line item, or notes. Incidental state — a lone customer selection, or the
// pre-filled tax/discount defaults — is NOT meaningful on its own, so it must not
// create a recoverable draft that later nags the user with a recovery prompt.
// (defaultTaxRate kept for signature compatibility; tax/discount no longer gate content.)
export const hasInvoiceDraftContent = (payload: InvoiceDraftPayload, _defaultTaxRate = 0) =>
  Boolean(payload.items.length || payload.notes.trim());
