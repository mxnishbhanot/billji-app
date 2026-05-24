import { DiscountType, InvoiceItem } from '@/types';

export const formatCurrency = (value?: number | string | null) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value || 0));

export const formatDate = (value?: string | Date | null) =>
  value ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) : '-';

export const calculateClientTotals = ({ items, taxRate = 0, discountType = 'flat', discountValue = 0 }: { items: InvoiceItem[]; taxRate?: number; discountType?: DiscountType; discountValue?: number }) => {
  const subtotal = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.price || 0), 0);
  const discount = discountType === 'percentage' ? subtotal * (Number(discountValue || 0) / 100) : Number(discountValue || 0);
  const discountAmount = Math.min(Math.max(discount, 0), subtotal);
  const taxable = Math.max(subtotal - discountAmount, 0);
  const taxAmount = taxable * (Number(taxRate || 0) / 100);
  return { subtotal, discountAmount, taxAmount, total: taxable + taxAmount };
};

export const compactNumber = (value?: number | string | null) => Number(value || 0).toLocaleString('en-IN');
