import { useEffect } from 'react';
import { onlineManager, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { referralApi } from '@/api/endpoints';
import { applyReferralLocally, isDatabaseAvailable } from '@/db';
import { useSyncSubscriptionToSession } from '@/features/billing/hooks/useBilling';
import { queryKeys } from '@/shared/query/queryKeys';
import { useAuthStore } from '@/store/authStore';
import { refreshSyncCounts, syncNow } from '@/sync/syncStatus';
import { reconcilePendingReferral } from '../reconcile';

// React Query wrappers for the referral endpoints, plus the one write.
//
// The write is the interesting part: online it calls the route directly (instant Pro, because the
// response carries the fresh subscription); offline it queues an APPLY_REFERRAL through the outbox and
// the existing sync engine delivers it. Same server handler either way — the client never decides
// whether the code is good or whether a reward is owed.

export const useMyReferral = () =>
  useQuery({
    queryKey: queryKeys.referrals.me,
    queryFn: referralApi.me,
    // A code is permanent and the counts move only when someone else acts.
    staleTime: 60_000
  });

export const useReferralRewards = () =>
  useQuery({ queryKey: queryKeys.referrals.rewards, queryFn: () => referralApi.rewards({ limit: 50 }) });

export const useMyReferredUsers = () =>
  useQuery({ queryKey: queryKeys.referrals.list, queryFn: () => referralApi.referrals({ limit: 50 }) });

/**
 * Whether this account can still use someone's code. Server-decided: there is no time window, so the
 * app cannot work it out from the signup date.
 */
export const useReferralEligibility = () =>
  useQuery({ queryKey: queryKeys.referrals.eligibility, queryFn: referralApi.eligibility, staleTime: 60_000 });

/** Checks a code before it is applied. Unauthenticated route, so it also works on the signup screen. */
export const useValidateReferralCode = () => useMutation({ mutationFn: referralApi.validate });

export const useApplyReferral = () => {
  const queryClient = useQueryClient();
  const syncSession = useSyncSubscriptionToSession();
  const businessId = useAuthStore((state) => state.user?.businessId);

  return useMutation({
    mutationFn: async (code: string) => {
      if (!businessId) throw new Error('No active business');

      // Offline (or on a device with no local database, i.e. web): queue it. The server still decides
      // everything; this only records the intent so it survives an app kill.
      if (!onlineManager.isOnline() && isDatabaseAvailable()) {
        const queued = await applyReferralLocally({ businessId, code });
        await refreshSyncCounts();
        return { queued: true as const, code: queued.code };
      }

      const result = await referralApi.apply(code, `referral-${businessId}-${code}`);
      return { queued: false as const, ...result };
    },
    onSuccess: async (result) => {
      if (!result.queued && result.subscription) {
        // The reward is already in the response — put it on the session so every gated screen unlocks
        // now rather than after the next /auth/me.
        await syncSession(result.subscription);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.referrals.all });
      if (result.queued) void syncNow();
    }
  });
};

/**
 * Delivers a referral code the server has not accepted yet, once per session.
 *
 * Mounted where a session is guaranteed (see SubscriptionScreen). Cheap when there is nothing to do:
 * one AsyncStorage read.
 */
export const useReferralReconciler = () => {
  const queryClient = useQueryClient();
  const businessId = useAuthStore((state) => state.user?.businessId);

  useEffect(() => {
    if (!businessId) return;

    let cancelled = false;
    void reconcilePendingReferral({ businessId }).then((result) => {
      if (!cancelled && result.queued) queryClient.invalidateQueries({ queryKey: queryKeys.referrals.all });
    });

    return () => {
      cancelled = true;
    };
  }, [businessId, queryClient]);
};
