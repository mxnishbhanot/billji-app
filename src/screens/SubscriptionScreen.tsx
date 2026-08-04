import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { Screen } from '@/components/Screen';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { UsageMeter } from '@/components/UsageMeter';
import { useAppDialog } from '@/components/AppDialog';
import { useAppToast } from '@/components/AppToast';
import { apiErrorMessage } from '@/api/client';
import { formatPaise } from '@/constants/entitlements';
import { RazorpayCheckoutSheet, type CheckoutResult } from '@/features/billing/components/RazorpayCheckoutSheet';
import {
  useCancelSubscription,
  useDisableAutopay,
  usePayments,
  useReactivateSubscription,
  useStartCheckout,
  useSubscription,
  useVerifyCheckout
} from '@/features/billing/hooks/useBilling';
import { track } from '@/services/analytics';
import { useAuthStore } from '@/store/authStore';
import { alpha, appColors, fontStyles, radii } from '@/theme/theme';
import type { SubscriptionScreenProps as NavProps } from '@/navigation/types';
import type { Checkout, Subscription, SubscriptionPayment } from '@/types';

const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/**
 * What to tell the customer about their plan, in one place.
 *
 * The three dates are not interchangeable and the copy must not blur them: `renewalDate` is when
 * money moves next, `expiryDate` is when access stops, `gracePeriodEndsAt` is the last instant of
 * access after that.
 */
const statusCopy = (subscription: Subscription) => {
  const autopay = subscription.autopay;

  // Outranks everything, trial included: a dead mandate is the one state where the customer has to do
  // something or lose the plan. Access itself is unaffected — that is still `subscriptionStatus`.
  if (autopay?.status === 'halted')
    return { label: 'Autopay failed', detail: 'Your bank stopped the automatic payment. Renew now to keep your plan.', tone: 'error' as const };
  if (autopay?.status === 'pending')
    return { label: 'Autopay pending', detail: 'Waiting for your bank to confirm the mandate. This can take a few minutes.', tone: 'warning' as const };

  if (subscription.isTrial) return { label: 'Trial', detail: `Free trial ends ${shortDate(subscription.trialEndsAt)}`, tone: 'warning' as const };
  if (subscription.cancelAtPeriodEnd)
    return { label: 'Cancelling', detail: `Access continues until ${shortDate(subscription.expiryDate)}`, tone: 'warning' as const };
  if (subscription.inGracePeriod)
    return { label: 'Payment due', detail: `Access ends ${shortDate(subscription.gracePeriodEndsAt)} unless renewed`, tone: 'error' as const };
  if (subscription.subscriptionStatus === 'expired') return { label: 'Expired', detail: 'You are on the free plan', tone: 'error' as const };
  if (subscription.subscriptionStatus === 'cancelled') return { label: 'Cancelled', detail: 'You are on the free plan', tone: 'error' as const };
  if (autopay?.status === 'active' && autopay.nextDebitAt)
    return { label: 'Active', detail: `Autopay debits ${shortDate(autopay.nextDebitAt)}`, tone: 'success' as const };
  if (subscription.renewalDate) return { label: 'Active', detail: `Renews ${shortDate(subscription.renewalDate)}`, tone: 'success' as const };
  return { label: 'Active', detail: 'No renewal needed', tone: 'success' as const };
};

export function SubscriptionScreen({ navigation }: NavProps) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = useMemo(() => appColors(isDark), [isDark]);
  const { showDialog } = useAppDialog();
  const { showToast } = useAppToast();

  const user = useAuthStore((state) => state.user);
  const subscriptionQuery = useSubscription();
  const paymentsQuery = usePayments();
  const cancel = useCancelSubscription();
  const reactivate = useReactivateSubscription();
  const startCheckout = useStartCheckout();
  const verifyCheckout = useVerifyCheckout();
  const disableAutopay = useDisableAutopay();
  // One dialog, two intentions. "Stop charging me automatically" and "end my subscription" must never
  // be the same button — conflating them is how a customer loses access they meant to keep.
  const [confirming, setConfirming] = useState<'cancel' | 'autopay' | null>(null);
  const [checkout, setCheckout] = useState<Checkout | null>(null);

  const subscription = subscriptionQuery.data;
  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.08);
  const onError = (title: string) => (error: unknown) => showDialog({ title, message: apiErrorMessage(error), tone: 'error' });

  const runCancel = () => {
    setConfirming(null);
    cancel.mutate('', {
      onSuccess: () => showToast('Subscription cancelled. Access continues to the end of your paid period.'),
      onError: onError('Could not cancel')
    });
  };

  const runDisableAutopay = () => {
    setConfirming(null);
    disableAutopay.mutate(undefined, {
      onSuccess: () => {
        track('autopay_disabled', { plan: subscription?.planKey || '' });
        showToast("Autopay is off. We'll remind you before the next renewal.");
      },
      onError: onError('Could not turn off autopay')
    });
  };

  /** Enrol (or re-enrol) the plan the business already has. Same route the Plans screen uses. */
  const enableAutopay = () => {
    if (!subscription?.planId || !subscription.billingInterval) return;

    track('upgrade_started', { plan: subscription.planKey || '', interval: subscription.billingInterval, autopay: true });
    startCheckout.mutate(
      { planId: subscription.planId, interval: subscription.billingInterval as 'month' | 'year', autopay: true },
      { onSuccess: (opened) => setCheckout(opened), onError: onError('Could not set up autopay') }
    );
  };

  const onPaid = (result: CheckoutResult) => {
    setCheckout(null);
    verifyCheckout.mutate(result, {
      onSuccess: (confirmed) => {
        track('autopay_enabled', { plan: subscription?.planKey || '', source: 'subscription' });
        showToast(
          confirmed.payment ? 'Autopay is on. Your plan is active.' : 'Autopay is set up. The first payment is still clearing.'
        );
      },
      onError: () =>
        showDialog({
          title: 'Autopay approved',
          message: 'We could not confirm it from this device. It will show as on here in a moment.',
          tone: 'warning'
        })
    });
  };

  const runReactivate = () =>
    reactivate.mutate(undefined, {
      onSuccess: () => showToast('Subscription resumed'),
      onError: onError('Could not resume')
    });

  if (!subscription) {
    return (
      <Screen title="Plan & billing">
        <ActivityIndicator style={{ marginTop: 40 }} />
      </Screen>
    );
  }

  const status = statusCopy(subscription);
  const statusTone = status.tone === 'success' ? colors.accent : status.tone === 'warning' ? colors.warning : colors.destructive;
  const meteredRows = subscription.usageSummary.filter((row) => !row.unlimited || row.used > 0);
  const autopayOn = subscription.autopay?.status === 'active' || subscription.autopay?.status === 'authenticated';
  // Offered only on a paid, non-cancelling plan: there is nothing to renew automatically otherwise, and
  // a trial has no interval to mandate.
  const canOfferAutopay =
    !autopayOn &&
    subscription.autopay?.status !== 'pending' &&
    !subscription.isTrial &&
    !subscription.cancelAtPeriodEnd &&
    Boolean(subscription.planId && subscription.renewalDate && ['month', 'year'].includes(subscription.billingInterval || ''));

  const renderPayment = (payment: SubscriptionPayment) => (
    <View key={payment.id} style={[styles.paymentRow, { borderColor: cardBorder }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.paymentTitle, { color: theme.colors.onSurface }]}>
          {payment.planKey} · {payment.billingInterval}
        </Text>
        <Text style={[styles.paymentMeta, { color: theme.colors.onSurfaceVariant }]}>
          {shortDate(payment.paidAt || payment.createdAt)}
          {payment.receiptNumber ? ` · ${payment.receiptNumber}` : ''}
          {payment.refundedAmount > 0 ? ` · refunded ${formatPaise(payment.refundedAmount)}` : ''}
        </Text>
      </View>
      <Text style={[styles.paymentAmount, { color: payment.status === 'captured' ? theme.colors.onSurface : theme.colors.onSurfaceVariant }]}>
        {formatPaise(payment.netAmount)}
      </Text>
    </View>
  );

  return (
    <Screen title="Plan & billing">
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: cardBorder }]}>
        <View style={styles.planHead}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.planName, { color: theme.colors.onSurface }]}>{subscription.planName || 'Starter'}</Text>
            <Text style={[styles.planMeta, { color: theme.colors.onSurfaceVariant }]}>{status.detail}</Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: alpha(statusTone, isDark ? 0.22 : 0.12) }]}>
            <Text style={[styles.statusLabel, { color: statusTone }]}>{status.label}</Text>
          </View>
        </View>

        <Pressable
          onPress={() => navigation.navigate('Plans')}
          style={({ pressed }) => [styles.primaryBtn, { backgroundColor: theme.colors.primary, opacity: pressed ? 0.9 : 1 }]}
        >
          <Text style={[styles.primaryLabel, { color: theme.colors.onPrimary }]}>
            {subscription.subscriptionStatus === 'active' && subscription.renewalDate ? 'Change plan' : 'See plans'}
          </Text>
        </Pressable>

        {subscription.cancelAtPeriodEnd ? (
          <Pressable onPress={runReactivate} disabled={reactivate.isPending} style={styles.textBtn}>
            <Text style={[styles.textBtnLabel, { color: theme.colors.primary }]}>
              {reactivate.isPending ? 'Resuming…' : 'Resume subscription'}
            </Text>
          </Pressable>
        ) : null}

        {autopayOn ? (
          <>
            <Text style={[styles.mandateNote, { color: theme.colors.onSurfaceVariant }]}>
              {`We debit ${formatPaise(subscription.autopay?.amount || 0)} on each renewal — your plan price, never more.`}
            </Text>
            <Pressable onPress={() => setConfirming('autopay')} disabled={disableAutopay.isPending} style={styles.textBtn}>
              <Text style={[styles.textBtnLabel, { color: theme.colors.onSurfaceVariant }]}>
                {disableAutopay.isPending ? 'Turning off…' : 'Turn off autopay'}
              </Text>
            </Pressable>
          </>
        ) : canOfferAutopay ? (
          // A halted mandate cannot be retried — the bank needs to authenticate a new one — so this is
          // an opt-in, not a "retry". No dialog: a toggle is not a destructive action.
          <View style={[styles.optIn, { borderColor: cardBorder }]}>
            <Text style={[styles.optInTitle, { color: theme.colors.onSurface }]}>Renew without thinking about it</Text>
            <Text style={[styles.optInBody, { color: theme.colors.onSurfaceVariant }]}>
              Turn on autopay and we debit your renewal on the due date — UPI Autopay or your card. Cancel any time; nothing changes about
              your plan or price.
            </Text>
            <Pressable
              onPress={enableAutopay}
              disabled={startCheckout.isPending}
              style={({ pressed }) => [styles.secondaryBtn, { borderColor: theme.colors.primary, opacity: pressed ? 0.9 : 1 }]}
            >
              <Text style={[styles.secondaryLabel, { color: theme.colors.primary }]}>
                {startCheckout.isPending ? 'Please wait…' : subscription.autopay?.status === 'halted' ? 'Set up autopay again' : 'Turn on autopay'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {!subscription.cancelAtPeriodEnd && subscription.renewalDate ? (
          <Pressable onPress={() => setConfirming('cancel')} disabled={cancel.isPending} style={styles.textBtn}>
            <Text style={[styles.textBtnLabel, { color: theme.colors.onSurfaceVariant }]}>Cancel subscription</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>THIS MONTH</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: cardBorder }]}>
        {meteredRows.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>Nothing used yet this month.</Text>
        ) : (
          meteredRows.map((row) => <UsageMeter key={row.key} row={row} />)
        )}
      </View>

      <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>PAYMENTS</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: cardBorder }]}>
        {paymentsQuery.isLoading ? (
          <ActivityIndicator />
        ) : (paymentsQuery.data?.length ?? 0) === 0 ? (
          <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>No payments yet.</Text>
        ) : (
          paymentsQuery.data?.map(renderPayment)
        )}
      </View>

      <View style={styles.footnote}>
        <Feather name="info" size={13} color={theme.colors.onSurfaceVariant} />
        <Text style={[styles.footnoteText, { color: theme.colors.onSurfaceVariant }]}>
          Autopay renewals are debited automatically on the date shown. Without autopay, no renewal is charged until you approve it. You can
          switch either way here, any time.
        </Text>
      </View>

      <ConfirmDialog
        visible={confirming === 'cancel'}
        title="Cancel subscription?"
        message="You keep everything until the end of the period you have already paid for. After that you move to the free plan — your data stays."
        confirmLabel="Cancel plan"
        onCancel={() => setConfirming(null)}
        onConfirm={runCancel}
      />

      <ConfirmDialog
        visible={confirming === 'autopay'}
        title="Turn off autopay?"
        message={`Your plan stays active until ${shortDate(subscription.expiryDate)}. We'll stop debiting automatically and remind you to renew manually instead.`}
        confirmLabel="Turn off"
        onCancel={() => setConfirming(null)}
        onConfirm={runDisableAutopay}
      />

      <RazorpayCheckoutSheet
        checkout={checkout}
        customerName={user?.name}
        customerEmail={user?.email}
        onPaid={onPaid}
        onClose={(reason, message) => {
          setCheckout(null);
          if (reason === 'failed') showDialog({ title: 'Autopay not set up', message: message || 'Please try again.', tone: 'error' });
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.card, padding: 16, marginBottom: 8 },
  planHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  planName: { ...fontStyles.bold, fontSize: 20 },
  planMeta: { ...fontStyles.regular, fontSize: 13, marginTop: 4 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill },
  statusLabel: { ...fontStyles.semiBold, fontSize: 11, textTransform: 'uppercase' },
  primaryBtn: { height: 46, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  primaryLabel: { ...fontStyles.semiBold, fontSize: 15 },
  secondaryBtn: { height: 42, borderRadius: radii.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  secondaryLabel: { ...fontStyles.semiBold, fontSize: 14 },
  mandateNote: { ...fontStyles.regular, fontSize: 12, lineHeight: 17, marginTop: 12, textAlign: 'center' },
  optIn: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.md, padding: 14, marginTop: 14, gap: 8 },
  optInTitle: { ...fontStyles.semiBold, fontSize: 14 },
  optInBody: { ...fontStyles.regular, fontSize: 12, lineHeight: 17, marginBottom: 4 },
  textBtn: { height: 42, alignItems: 'center', justifyContent: 'center' },
  textBtnLabel: { ...fontStyles.medium, fontSize: 13 },
  sectionLabel: { ...fontStyles.semiBold, fontSize: 11, letterSpacing: 0.6, marginTop: 16, marginBottom: 8 },
  emptyText: { ...fontStyles.regular, fontSize: 13 },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  paymentTitle: { ...fontStyles.medium, fontSize: 14, textTransform: 'capitalize' },
  paymentMeta: { ...fontStyles.regular, fontSize: 12, marginTop: 2 },
  paymentAmount: { ...fontStyles.semiBold, fontSize: 14 },
  footnote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingHorizontal: 4 },
  footnoteText: { ...fontStyles.regular, fontSize: 12, flex: 1 }
});
