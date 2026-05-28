import { useMemo } from 'react';
import { useAuthStore } from '@/store/authStore';

/** Permission keys mirror the backend `PERMISSIONS` map (authorization.js). */
export const PERMISSION = {
  invoicesView: 'invoices.view',
  invoicesCreate: 'invoices.create',
  invoicesUpdate: 'invoices.update',
  invoicesDelete: 'invoices.delete',
  paymentsView: 'payments.view',
  paymentsRecord: 'payments.record',
  productsView: 'products.view',
  productsManage: 'products.manage',
  customersView: 'customers.view',
  customersManage: 'customers.manage',
  reportsView: 'reports.view',
  settingsView: 'settings.view',
  settingsManage: 'settings.manage'
} as const;

export type PermissionKey = (typeof PERMISSION)[keyof typeof PERMISSION];

/**
 * UI-level permission gate. The backend remains the source of truth — this only
 * hides/disables controls the current member can't use.
 *
 * When the user has no permissions array (legacy session / missing data) we
 * allow everything, so existing owners are never locked out of the UI.
 */
export function usePermissions() {
  const permissions = useAuthStore((state) => state.user?.permissions);
  return useMemo(() => {
    const list = permissions ?? [];
    const can = (permission: string) => list.length === 0 || list.includes(permission);
    return { can, permissions: list };
  }, [permissions]);
}
