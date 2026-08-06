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
  billingView: 'billing.view',
  billingInvoices: 'billing.invoices',
  billingPaymentMethod: 'billing.payment_method',
  billingSubscriptionChange: 'billing.subscription_change',
  billingManage: 'billing.manage',
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
  // Not derived from roleKey or from any permission: the server computes this from the same
  // BILLING_OWNER_ROLES list its requireBillingOwner guard uses, so the two cannot drift, and a
  // Billing Admin role added later needs no change here. Absent = false, and the API refuses anyway.
  const canManageBilling = useAuthStore((state) => state.user?.subscription?.canManageBilling ?? false);

  return useMemo(() => {
    const list = permissions ?? [];
    const isOwner = !roleKey || roleKey === 'owner';
    const can = (permission: string) => isOwner || list.includes(permission);
    // Money controls read canManageBilling and NEVER can(...): the owner fail-open above is right
    // for hiding UI and wrong for authorising a charge.
    return { can, canManageBilling, permissions: list };
  }, [permissions, roleKey, canManageBilling]);
}
