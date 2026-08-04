import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi, billingApi } from '@/api/endpoints';
import { queryKeys } from '@/shared/query/queryKeys';
import { useAuthStore } from '@/store/authStore';
import type { Subscription } from '@/types';

// React Query wrappers for the billing endpoints, plus the one thing every mutation here has to do:
// put the fresh subscription back on the session.
//
// The session block is what useEntitlements gates on offline, so a plan change that only updated a
// query cache would leave every locked screen still locked until the next app launch.

/**
 * Writes the new plan onto the persisted session and refreshes `/auth/me`.
 *
 * Both, deliberately: the DTO we already hold unlocks the UI immediately, and `me()` re-reads
 * permissions and the business profile, which a plan change can also affect (a downgrade below the
 * seat count is resolved server-side).
 */
export const useSyncSubscriptionToSession = () => {
  const queryClient = useQueryClient();

  return async (subscription?: Subscription) => {
    const { user, setUser } = useAuthStore.getState();
    if (user && subscription) await setUser({ ...user, subscription });

    queryClient.invalidateQueries({ queryKey: queryKeys.billing.all });
    // Non-fatal: an offline confirm still unlocked the UI from the DTO above.
    await authApi
      .me()
      .then((fresh) => useAuthStore.getState().setUser(fresh))
      .catch(() => undefined);
  };
};

export const useSubscription = () => {
  // Seeded from the session so the screen paints instantly and still works offline.
  const persisted = useAuthStore((state) => state.user?.subscription);

  return useQuery({
    queryKey: queryKeys.billing.subscription,
    queryFn: billingApi.subscription,
    initialData: persisted,
    staleTime: 60_000
  });
};

export const usePlans = () =>
  useQuery({
    queryKey: queryKeys.billing.plans,
    queryFn: billingApi.plans,
    // Plans are a handful of rows that change when an admin edits pricing, not per session.
    staleTime: 10 * 60_000
  });

export const useUsage = () => useQuery({ queryKey: queryKeys.billing.usage, queryFn: billingApi.usage, staleTime: 30_000 });

export const usePayments = () =>
  useQuery({ queryKey: queryKeys.billing.payments, queryFn: () => billingApi.payments({ limit: 50 }) });

export const useCancelSubscription = () => {
  const syncSession = useSyncSubscriptionToSession();
  return useMutation({
    mutationFn: (reason: string) => billingApi.cancel({ reason }),
    onSuccess: (subscription) => syncSession(subscription)
  });
};

export const useReactivateSubscription = () => {
  const syncSession = useSyncSubscriptionToSession();
  return useMutation({ mutationFn: billingApi.reactivate, onSuccess: (subscription) => syncSession(subscription) });
};

/**
 * Opens a checkout (server mints the provider order, or a mandate when `autopay`). Idempotent
 * server-side, so a double tap replays.
 *
 * No session sync: nothing has been paid or authorised yet.
 */
export const useStartCheckout = () =>
  useMutation({
    mutationFn: (input: { planId: string; interval: 'month' | 'year'; couponCode?: string; autopay?: boolean }) =>
      billingApi.checkout(input)
  });

/** Turns autopay off. Keeps the plan and the paid period — this is not a cancellation. */
export const useDisableAutopay = () => {
  const syncSession = useSyncSubscriptionToSession();
  return useMutation({ mutationFn: billingApi.disableAutopay, onSuccess: (subscription) => syncSession(subscription) });
};

/**
 * Confirms a paid checkout so the UI unlocks now instead of waiting for the webhook.
 *
 * The webhook remains the authority — whichever lands first activates and the other is a no-op — so
 * a failure here is not a lost payment, only a delayed unlock.
 */
export const useVerifyCheckout = () => {
  const syncSession = useSyncSubscriptionToSession();
  return useMutation({
    mutationFn: billingApi.verifyCheckout,
    onSuccess: (result) => syncSession(result.subscription)
  });
};

export const useStartTrial = () => {
  const syncSession = useSyncSubscriptionToSession();
  return useMutation({
    mutationFn: (planId: string) => billingApi.startTrial({ planId }),
    onSuccess: (subscription) => syncSession(subscription)
  });
};
