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

// Turn a device label / user-agent into a friendly name people can recognise plus a
// Feather icon. Prefer the explicit deviceName the mobile app sends (e.g. "Samsung
// Galaxy S21 · Android 14") — the user-agent (okhttp/expo) carries no model.
export const describeDevice = (
  userAgent?: string | null,
  deviceName?: string | null
): { name: string; icon: 'smartphone' | 'tablet' | 'monitor' | 'help-circle' } => {
  const named = (deviceName || '').trim();
  if (named) {
    const lower = named.toLowerCase();
    const icon = /ipad|tablet|\btab\b|\bpad\b/.test(lower) ? 'tablet' : 'smartphone';
    return { name: named, icon };
  }

  const ua = (userAgent || '').toLowerCase();
  if (!ua) return { name: 'Unknown device', icon: 'help-circle' };

  let os = '';
  let icon: 'smartphone' | 'tablet' | 'monitor' | 'help-circle' = 'monitor';
  if (/ipad/.test(ua)) { os = 'iPad'; icon = 'tablet'; }
  else if (/iphone|ipod/.test(ua)) { os = 'iPhone'; icon = 'smartphone'; }
  else if (/android/.test(ua)) { os = /mobile/.test(ua) ? 'Android phone' : 'Android'; icon = /mobile/.test(ua) ? 'smartphone' : 'tablet'; }
  else if (/windows/.test(ua)) { os = 'Windows PC'; icon = 'monitor'; }
  else if (/mac os x|macintosh/.test(ua)) { os = 'Mac'; icon = 'monitor'; }
  else if (/linux/.test(ua)) { os = 'Linux'; icon = 'monitor'; }

  let app = '';
  if (/billji|expo|okhttp|cfnetwork/.test(ua)) app = 'Billji app';
  else if (/edg\//.test(ua)) app = 'Edge';
  else if (/crios|chrome/.test(ua)) app = 'Chrome';
  else if (/fxios|firefox/.test(ua)) app = 'Firefox';
  else if (/safari/.test(ua)) app = 'Safari';

  const name = [os, app].filter(Boolean).join(' · ');
  return { name: name || 'Unknown device', icon };
};

export const calculateClientTotals = ({ items, taxRate = 0, discountType = 'flat', discountValue = 0 }: { items: InvoiceItem[]; taxRate?: number; discountType?: DiscountType; discountValue?: number }) => {
  const subtotal = roundMoney(items.reduce((sum, item) => sum + roundMoney(Number(item.quantity || 0) * Number(item.price || 0)), 0));
  const discount = discountType === 'percentage' ? subtotal * (Number(discountValue || 0) / 100) : Number(discountValue || 0);
  const discountAmount = roundMoney(Math.min(Math.max(discount, 0), subtotal));
  const taxable = Math.max(subtotal - discountAmount, 0);
  const taxAmount = roundMoney(taxable * (Math.max(Number(taxRate || 0), 0) / 100));
  return { subtotal, discountAmount, taxAmount, total: roundMoney(taxable + taxAmount) };
};

export const compactNumber = (value?: number | string | null) => Number(value || 0).toLocaleString('en-IN');
