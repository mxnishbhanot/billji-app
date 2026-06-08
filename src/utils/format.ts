import { DiscountType, InvoiceItem } from '@/types';

const roundMoney = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

// Intl formatters are expensive to construct; hoist to module singletons so list
// rows reuse one instance instead of allocating per render.
const inrCurrency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const shortDate = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const relativeFallbackDate = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

export const formatCurrency = (value?: number | string | null) => inrCurrency.format(Number(value || 0));

export const formatDate = (value?: string | Date | null) =>
  value ? shortDate.format(new Date(value)) : '-';

// Relative timestamp for notifications: "just now" / "5m ago" / "3h ago" / "2d ago",
// falling back to an absolute date + time once older than a week.
export const formatRelativeTime = (value?: string | Date | null) => {
  if (!value) return '-';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '-';
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 45) return 'just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return relativeFallbackDate.format(new Date(value));
};

export const calculateClientTotals = ({ items, taxRate = 0, discountType = 'flat', discountValue = 0 }: { items: InvoiceItem[]; taxRate?: number; discountType?: DiscountType; discountValue?: number }) => {
  const subtotal = roundMoney(items.reduce((sum, item) => sum + roundMoney(Number(item.quantity || 0) * Number(item.price || 0)), 0));
  const discount = discountType === 'percentage' ? subtotal * (Number(discountValue || 0) / 100) : Number(discountValue || 0);
  const discountAmount = roundMoney(Math.min(Math.max(discount, 0), subtotal));
  const taxable = Math.max(subtotal - discountAmount, 0);
  const taxAmount = roundMoney(taxable * (Number(taxRate || 0) / 100));
  return { subtotal, discountAmount, taxAmount, total: roundMoney(taxable + taxAmount) };
};

export const compactNumber = (value?: number | string | null) => Number(value || 0).toLocaleString('en-IN');
