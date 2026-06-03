import { NotificationPreferences } from '@/types';

// UI grouping of backend notification types (mirror of backend/src/constants/notificationTypes.js).
export type NotificationModule = {
  key: string;
  label: string;
  icon: string;
  types: { type: string; label: string; description: string }[];
};

export const NOTIFICATION_MODULES: NotificationModule[] = [
  {
    key: 'invoices',
    label: 'Invoices',
    icon: 'file-document-outline',
    types: [
      { type: 'invoice-created', label: 'Invoice created', description: 'When a new invoice is issued' },
      { type: 'invoice-cancelled', label: 'Invoice cancelled', description: 'When an invoice is cancelled' },
      { type: 'document-shared', label: 'Document shared', description: 'When an invoice or document is shared' }
    ]
  },
  {
    key: 'payments',
    label: 'Payments',
    icon: 'cash-multiple',
    types: [{ type: 'payment-received', label: 'Payment received', description: 'When a payment is recorded' }]
  },
  {
    key: 'reminders',
    label: 'Reminders',
    icon: 'clock-alert-outline',
    types: [
      { type: 'overdue-invoice', label: 'Overdue invoices', description: 'When an invoice passes its due date' },
      { type: 'due-soon-invoice', label: 'Due soon', description: 'When an invoice is due within 3 days' },
      { type: 'old-pending-invoice', label: 'Old pending invoices', description: 'Unpaid invoices older than 7 days' }
    ]
  },
  {
    key: 'stock',
    label: 'Stock',
    icon: 'package-variant',
    types: [
      { type: 'low-stock', label: 'Low stock', description: 'When stock falls below its threshold' },
      { type: 'negative-stock', label: 'Negative stock', description: 'When stock goes below zero' }
    ]
  },
  {
    key: 'activity',
    label: 'Team Activity',
    icon: 'account-group-outline',
    types: [{ type: 'staff-activity', label: 'Staff activity', description: 'When team members add records' }]
  }
];

// Absence of a type (or channel) means enabled, so new notification types default to on.
export const isTypeEnabled = (prefs: NotificationPreferences | undefined, type: string) => prefs?.[type]?.inApp !== false;

export const isModuleEnabled = (prefs: NotificationPreferences | undefined, module: NotificationModule) =>
  module.types.every((entry) => isTypeEnabled(prefs, entry.type));

export const setTypeEnabled = (prefs: NotificationPreferences, type: string, enabled: boolean): NotificationPreferences => ({
  ...prefs,
  [type]: { ...prefs[type], inApp: enabled }
});

export const setModuleEnabled = (prefs: NotificationPreferences, module: NotificationModule, enabled: boolean): NotificationPreferences =>
  module.types.reduce((next, entry) => setTypeEnabled(next, entry.type, enabled), prefs);
