import { useMemo } from 'react';
import { useAuthStore } from '@/store/authStore';
import { FEATURE, LIMIT, type FeatureKey, type LimitKey } from '@/constants/entitlements';
import type { Subscription, UsageRow } from '@/types';

/**
 * UI-level plan gate. The server is the licence — it re-checks every request regardless of what
 * this hook believed, and returns 402 when the answer differs.
 *
 * **This fails CLOSED, unlike usePermissions.** Permissions fail open for owners so nobody is ever
 * locked out of their own business; a paywall that fails open is bypassed by clearing app data. No
 * subscription block on the session (an old build, a wiped store, a signup mid-flight) is therefore
 * treated as the free tier, not as "allow everything".
 *
 * Reads the block persisted with the session, so gating works with no network. `/auth/me` refreshes
 * it on launch and on foreground, and a completed checkout refreshes it immediately.
 */

/** Starter, hardcoded as the deny-side default. Only ever *narrows* what the UI offers. */
const FREE_TIER_FEATURES: string[] = [
  FEATURE.offlineMode,
  FEATURE.cloudSync,
  FEATURE.automaticBackup,
  FEATURE.gstBilling,
  FEATURE.gstInvoices,
  FEATURE.pdfExport,
  FEATURE.whatsappSharing,
  FEATURE.barcode,
  FEATURE.basicInventory,
  FEATURE.basicDashboard,
  FEATURE.basicReports
];

const usageRowFor = (subscription: Subscription | undefined, limitKey: string): UsageRow | null =>
  subscription?.usageSummary?.find((row) => row.key === limitKey) ?? null;

export function useEntitlements() {
  const subscription = useAuthStore((state) => state.user?.subscription);

  return useMemo(() => {
    /** True when the plan grants the feature. Absent subscription → free tier only. */
    const can = (feature: FeatureKey | string) =>
      subscription ? Boolean(subscription.features?.[feature]) : FREE_TIER_FEATURES.includes(feature);

    const isLocked = (feature: FeatureKey | string) => !can(feature);

    /** The ceiling, or `null` for no ceiling. A key the plan never mentions has no ceiling. */
    const limit = (limitKey: LimitKey | string): number | null => subscription?.limits?.[limitKey] ?? null;

    const usage = (limitKey: LimitKey | string) => usageRowFor(subscription, limitKey);

    /** Remaining allowance; `Infinity` when unlimited, so callers can compare numerically. */
    const remaining = (limitKey: LimitKey | string) => {
      const value = subscription?.remainingLimits?.[limitKey];
      return value === null || value === undefined ? Infinity : value;
    };

    /** At or past the ceiling. Used for the "you're out of documents" hint before a save. */
    const isAtLimit = (limitKey: LimitKey | string) => remaining(limitKey) <= 0;

    /** ≥80% consumed — the threshold the dashboard meter and the builder hint appear at. */
    const isNearLimit = (limitKey: LimitKey | string, threshold = 80) => {
      const row = usageRowFor(subscription, limitKey);
      return Boolean(row && !row.unlimited && row.percentUsed >= threshold);
    };

    const documents = usageRowFor(subscription, LIMIT.documentsPerMonth);

    return {
      subscription: subscription ?? null,
      plan: { key: subscription?.planKey ?? null, name: subscription?.planName ?? 'Starter' },
      status: subscription?.subscriptionStatus ?? 'none',
      isTrial: Boolean(subscription?.isTrial),
      inGracePeriod: Boolean(subscription?.inGracePeriod),
      /** True while the plan is not in a state that grants what was paid for. */
      isLapsed: ['expired', 'cancelled', 'none'].includes(subscription?.subscriptionStatus ?? 'none'),
      documents,
      can,
      isLocked,
      limit,
      usage,
      remaining,
      isAtLimit,
      isNearLimit
    };
  }, [subscription]);
}
