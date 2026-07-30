import { useMemo } from 'react';
import { useAuthStore } from '@/store/authStore';

/** Permission keys mirror the backend `PERMISSIONS` map (authorization.js). */
export const PERMISSION = {
  invoicesView: 'invoices.view',
  invoicesCreate: 'invoices.create',
  invoicesUpdate: 'invoices.update',
  invoicesDelete: 'invoices.delete',
  ordersView: 'orders.view',
  ordersCreate: 'orders.create',
  ordersManage: 'orders.manage',
  paymentsView: 'payments.view',
  paymentsRecord: 'payments.record',
  productsView: 'products.view',
  productsManage: 'products.manage',
  customersView: 'customers.view',
  customersManage: 'customers.manage',
  expensesView: 'expenses.view',
  expensesManage: 'expenses.manage',
  purchasesView: 'purchases.view',
  purchasesManage: 'purchases.manage',
  reportsView: 'reports.view',
  settingsView: 'settings.view',
  settingsManage: 'settings.manage',
  settingsExport: 'settings.export',
  teamView: 'team.view',
  teamManage: 'team.manage',
  rolesView: 'roles.view',
  rolesManage: 'roles.manage'
} as const;

export type PermissionKey = (typeof PERMISSION)[keyof typeof PERMISSION];

/**
 * UI-level permission gate. The backend remains the source of truth — this only
 * hides/disables controls the current member can't use.
 *
 * Fail-open is scoped to owners only: an owner (or a legacy session with no
 * roleKey, which is always a self-registered owner) is allowed everything so they
 * are never locked out. Any other role with an empty permissions array is denied —
 * a non-owner whose permissions failed to load must not see privileged controls.
 */
export function usePermissions() {
  const permissions = useAuthStore((state) => state.user?.permissions);
  const roleKey = useAuthStore((state) => state.user?.roleKey);
  return useMemo(() => {
    const list = permissions ?? [];
    const isOwner = !roleKey || roleKey === 'owner';
    const can = (permission: string) => isOwner || list.includes(permission);
    return { can, permissions: list };
  }, [permissions, roleKey]);
}
