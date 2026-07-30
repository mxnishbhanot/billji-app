import { ExpenseCategory, PaymentMethod } from '@/types';

// Mirrors EXPENSE_CATEGORIES in backend/src/models/Expense.js.
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  rent: 'Rent',
  salary: 'Salary',
  transport: 'Transport',
  utilities: 'Utilities',
  purchase: 'Stock purchase',
  repairs: 'Repairs',
  marketing: 'Marketing',
  professional_fees: 'Professional fees',
  bank_charges: 'Bank charges',
  travel: 'Travel',
  office_supplies: 'Office supplies',
  other: 'Other'
};

export const EXPENSE_CATEGORIES = Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[];

export const EXPENSE_PAYMENT_METHODS: { key: PaymentMethod; label: string }[] = [
  { key: 'cash', label: 'Cash' },
  { key: 'upi', label: 'UPI' },
  { key: 'bank_transfer', label: 'Bank' },
  { key: 'card', label: 'Card' },
  { key: 'cheque', label: 'Cheque' },
  { key: 'other', label: 'Other' }
];

const pad = (value: number) => String(value).padStart(2, '0');
const iso = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/**
 * Ranges the expense list can be filtered by. Resolved against a passed-in clock so the
 * boundaries are testable rather than depending on when the app happens to render.
 */
export const MONTH_RANGE_PRESETS: { key: string; label: string; resolve: (now?: Date) => { from: string; to: string } }[] = [
  {
    key: 'this-month',
    label: 'This month',
    resolve: (now = new Date()) => ({
      from: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0))
    })
  },
  {
    key: 'last-month',
    label: 'Last month',
    resolve: (now = new Date()) => ({
      from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: iso(new Date(now.getFullYear(), now.getMonth(), 0))
    })
  },
  {
    key: 'this-quarter',
    label: 'Last 3 months',
    resolve: (now = new Date()) => ({
      from: iso(new Date(now.getFullYear(), now.getMonth() - 2, 1)),
      to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0))
    })
  },
  {
    key: 'this-year',
    label: 'This year',
    resolve: (now = new Date()) => ({ from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(new Date(now.getFullYear(), 11, 31)) })
  }
];
