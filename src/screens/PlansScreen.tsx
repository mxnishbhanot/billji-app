import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { Screen } from '@/components/Screen';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { useAppDialog } from '@/components/AppDialog';
import { useAppToast } from '@/components/AppToast';
import { apiErrorMessage } from '@/api/client';
import { FEATURE_LABELS, formatPaise } from '@/constants/entitlements';
import { RazorpayCheckoutSheet, type CheckoutResult } from '@/features/billing/components/RazorpayCheckoutSheet';
import { usePlans, useStartCheckout, useStartTrial, useSubscription, useVerifyCheckout } from '@/features/billing/hooks/useBilling';
import { track } from '@/services/analytics';
import { useAuthStore } from '@/store/authStore';
import { alpha, appColors, fontStyles, radii } from '@/theme/theme';
import type { PlansScreenProps as NavProps } from '@/navigation/types';
import type { Checkout, Plan } from '@/types';

const SALES_EMAIL = 'sales@billji.app';

type Interval = 'month' | 'year';
type PayMode = 'autopay' | 'manual';

// Copy sits here rather than inline so the two promises a customer is asked to accept are readable in
// one place. Both are legally load-bearing: the autopay line is the mandate consent the bank will echo
// in its own SMS, and the manual line is the guarantee we have always made.
const MODE_COPY: Record<PayMode, string> = {
  autopay:
    'We set up a UPI Autopay or card mandate with your bank. Renewals are debited automatically on the renewal date, always at your plan price — never more. Cancel or turn autopay off any time from Plan & billing.',
  manual: 'You pay once now. We remind you before the next renewal, and nothing is debited until you approve it.'
};

const priceFor = (plan: Plan, interval: Interval) =>
  plan.prices.find((price) => price.interval === interval) || plan.prices.find((price) => price.interval === 'free') || plan.prices[0] || null;

/** The features this plan adds over the one below it — "everything in Pro, plus…" without the repetition. */
const addedFeatures = (plan: Plan, previous: Plan | null) =>
  Object.keys(plan.features)
    .filter((key) => plan.features[key] && !previous?.features?.[key])
    .map((key) => FEATURE_LABELS[key] || key.replace(/_/g, ' '))
    .slice(0, 6);

export function PlansScreen({ navigation }: NavProps) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = useMemo(() => appColors(isDark), [isDark]);
  const { showDialog } = useAppDialog();
  const { showToast } = useAppToast();
  const user = useAuthStore((state) => state.user);

  const plansQuery = usePlans();
  const subscriptionQuery = useSubscription();
  const startCheckout = useStartCheckout();
  const verifyCheckout = useVerifyCheckout();
  const startTrial = useStartTrial();

  const [interval, setInterval] = useState<Interval>('month');
  // Autopay is the recommended default; manual stays one tap away and is never removed.
  const [payMode, setPayMode] = useState<PayMode>('autopay');
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  // The plan a mandate-holder tapped, held while they confirm that switching turns autopay off.
  const [switchTo, setSwitchTo] = useState<Plan | null>(null);

  useEffect(() => {
    track('plan_viewed', { current: subscriptionQuery.data?.planKey || 'none' });
  }, [subscriptionQuery.data?.planKey]);

  const plans = useMemo(() => [...(plansQuery.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder), [plansQuery.data]);
  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.08);
  const onError = (title: string) => (error: unknown) => showDialog({ title, message: apiErrorMessage(error), tone: 'error' });

  const subscription = subscriptionQuery.data;
  // Autopay is only offered when the gateway supports it for this price AND the customer does not
  // already hold a mandate — changing plans on a live mandate goes through the manual prorated path.
  const hasLiveMandate = subscription?.autopay?.status === 'active';
  const autopayOffered = useMemo(
    () => !hasLiveMandate && plans.some((plan) => !plan.isCurrent && priceFor(plan, interval)?.autopayAvailable),
    [hasLiveMandate, plans, interval]
  );
  const mode: PayMode = autopayOffered ? payMode : 'manual';

  const buy = (plan: Plan, override?: { autopay: boolean }) => {
    const autopay = override ? override.autopay : mode === 'autopay' && Boolean(priceFor(plan, interval)?.autopayAvailable);

    track('upgrade_started', { plan: plan.planKey, interval, autopay });
    startCheckout.mutate(
      { planId: plan.planId, interval, autopay },
      { onSuccess: (opened) => setCheckout(opened), onError: onError('Could not start checkout') }
    );
  };

  /**
   * Changing plan while a mandate is live cannot be done in one step: the old mandate has to stop, the
   * unused days are credited against a one-time payment, and autopay is then set up fresh at the new
   * price. Say that before taking the tap, rather than surprising them with a charge.
   */
  const choosePlan = (plan: Plan) => {
    if (hasLiveMandate && plan.planId !== subscription?.planId) {
      setSwitchTo(plan);
      return;
    }
    buy(plan);
  };

  const beginTrial = (plan: Plan) =>
    startTrial.mutate(plan.planId, {
      onSuccess: () => {
        track('trial_started', { plan: plan.planKey, days: plan.trial.days });
        showToast(`${plan.trial.days}-day trial started`);
        navigation.navigate('Subscription');
      },
      onError: onError('Could not start the trial')
    });

  const onPaid = (result: CheckoutResult) => {
    const planKey = checkout?.plan.planKey || '';
    // Read before setCheckout(null) — inside onSuccess, `checkout` is already null.
    const wasAutopay = Boolean(checkout?.subscriptionId);
    setCheckout(null);
    verifyCheckout.mutate(result, {
      onSuccess: (confirmed) => {
        track('upgrade_completed', { plan: planKey, interval, autopay: wasAutopay });
        if (wasAutopay) track('autopay_enabled', { plan: planKey, interval, source: 'plans' });
        showToast(
          wasAutopay && !confirmed.payment
            ? // Mandate approved, first debit still settling. Not a failure — say so plainly.
              'Autopay is set up. Your plan activates as soon as the first payment clears.'
            : wasAutopay
              ? 'Autopay is on. Your plan is active.'
              : 'Payment received. Your plan is active.'
        );
        navigation.navigate('Subscription');
      },
      // The webhook still activates this, so the money is not lost — only the instant unlock is.
      onError: () =>
        showDialog({
          title: 'Payment received',
          message: 'We could not confirm it from this device. Your plan will unlock automatically in a moment.',
          tone: 'warning'
        })
    });
  };

  const contactSales = () =>
    Linking.openURL(`mailto:${SALES_EMAIL}?subject=BillJi Enterprise enquiry`).catch(() =>
      showDialog({ title: 'Contact sales', message: `Email us at ${SALES_EMAIL} and we will set up your plan.`, tone: 'default' })
    );

  const renderPlan = (plan: Plan, index: number) => {
    const price = priceFor(plan, interval);
    const isFree = !price || price.amount === 0;
    const added = addedFeatures(plan, index > 0 ? plans[index - 1] : null);
    const trialAvailable = plan.trial.enabled && plan.trial.days > 0 && !subscriptionQuery.data?.isTrial && !plan.isCurrent;
    const busy = startCheckout.isPending || verifyCheckout.isPending || startTrial.isPending;

    return (
      <View
        key={plan.planId}
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: plan.isCurrent ? theme.colors.primary : cardBorder,
            borderWidth: plan.isCurrent ? 1.5 : StyleSheet.hairlineWidth
          }
        ]}
      >
        <View style={styles.cardHead}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.planName, { color: theme.colors.onSurface }]}>{plan.name}</Text>
            {plan.tagline ? <Text style={[styles.tagline, { color: theme.colors.onSurfaceVariant }]}>{plan.tagline}</Text> : null}
          </View>
          {plan.isCurrent ? (
            <View style={[styles.badge, { backgroundColor: alpha(colors.accent, isDark ? 0.22 : 0.12) }]}>
              <Text style={[styles.badgeLabel, { color: colors.accent }]}>Current</Text>
            </View>
          ) : plan.badge ? (
            <View style={[styles.badge, { backgroundColor: alpha(colors.violet, isDark ? 0.22 : 0.12) }]}>
              <Text style={[styles.badgeLabel, { color: colors.violet }]}>{plan.badge}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.priceRow}>
          <Text style={[styles.price, { color: theme.colors.onSurface }]}>
            {plan.requiresSalesContact ? 'Custom' : isFree ? 'Free' : formatPaise(price!.amount)}
          </Text>
          {!plan.requiresSalesContact && !isFree ? (
            <Text style={[styles.per, { color: theme.colors.onSurfaceVariant }]}>{interval === 'year' ? '/year' : '/month'}</Text>
          ) : null}
        </View>

        {added.length > 0 ? (
          <View style={styles.features}>
            {index > 0 ? (
              <Text style={[styles.featureIntro, { color: theme.colors.onSurfaceVariant }]}>
                Everything in {plans[index - 1].name}, plus
              </Text>
            ) : null}
            {added.map((label) => (
              <View key={label} style={styles.featureRow}>
                <Feather name="check" size={14} color={colors.accent} />
                <Text style={[styles.featureLabel, { color: theme.colors.onSurface }]}>{label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {plan.isCurrent ? (
          <View style={[styles.currentNote, { borderColor: cardBorder }]}>
            <Text style={[styles.currentNoteText, { color: theme.colors.onSurfaceVariant }]}>This is your plan</Text>
          </View>
        ) : plan.requiresSalesContact ? (
          <Pressable onPress={contactSales} style={({ pressed }) => [styles.secondaryBtn, { borderColor: theme.colors.primary, opacity: pressed ? 0.9 : 1 }]}>
            <Text style={[styles.secondaryLabel, { color: theme.colors.primary }]}>Contact sales</Text>
          </Pressable>
        ) : isFree ? null : (
          <>
            <Pressable
              disabled={busy}
              onPress={() => choosePlan(plan)}
              style={({ pressed }) => [styles.primaryBtn, { backgroundColor: theme.colors.primary, opacity: busy ? 0.6 : pressed ? 0.9 : 1 }]}
            >
              <Text style={[styles.primaryLabel, { color: theme.colors.onPrimary }]}>{busy ? 'Please wait…' : 'Choose this plan'}</Text>
            </Pressable>
            {trialAvailable ? (
              <Pressable disabled={busy} onPress={() => beginTrial(plan)} style={styles.textBtn}>
                <Text style={[styles.textBtnLabel, { color: theme.colors.primary }]}>Start {plan.trial.days}-day free trial</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </View>
    );
  };

  return (
    <Screen title="Plans">
      <View style={[styles.toggle, { backgroundColor: alpha(colors.primary, isDark ? 0.16 : 0.07) }]}>
        {(['month', 'year'] as Interval[]).map((option) => (
          <Pressable
            key={option}
            onPress={() => setInterval(option)}
            style={[styles.toggleBtn, interval === option ? { backgroundColor: colors.card } : null]}
          >
            <Text style={[styles.toggleLabel, { color: interval === option ? theme.colors.onSurface : theme.colors.onSurfaceVariant }]}>
              {option === 'month' ? 'Monthly' : 'Yearly'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Same pill pattern as the interval toggle above — one screen-level choice, not one per card:
          the explainer under it is legal-sensitive copy that must not be repeated three times. */}
      {autopayOffered ? (
        <>
          <View style={[styles.toggle, { backgroundColor: alpha(colors.primary, isDark ? 0.16 : 0.07) }]}>
            {(['autopay', 'manual'] as PayMode[]).map((option) => (
              <Pressable
                key={option}
                onPress={() => setPayMode(option)}
                style={[styles.toggleBtn, styles.modeBtn, payMode === option ? { backgroundColor: colors.card } : null]}
              >
                <Text style={[styles.toggleLabel, { color: payMode === option ? theme.colors.onSurface : theme.colors.onSurfaceVariant }]}>
                  {option === 'autopay' ? 'Autopay' : 'Pay manually'}
                </Text>
                {option === 'autopay' ? (
                  <View style={[styles.badge, { backgroundColor: alpha(colors.accent, isDark ? 0.22 : 0.12) }]}>
                    <Text style={[styles.badgeLabel, { color: colors.accent }]}>Recommended</Text>
                  </View>
                ) : null}
              </Pressable>
            ))}
          </View>
          <Text style={[styles.modeNote, { color: theme.colors.onSurfaceVariant }]}>{MODE_COPY[payMode]}</Text>
        </>
      ) : null}

      {plansQuery.isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : plans.length === 0 ? (
        <EmptyState title="No plans" message="Plans could not be loaded. Check your connection and try again." />
      ) : (
        plans.map(renderPlan)
      )}

      <Text style={[styles.footnote, { color: theme.colors.onSurfaceVariant }]}>
        Prices include GST. With autopay, renewals are debited automatically on the renewal date and you can cancel any time. Choose Pay
        manually and nothing is charged until you approve it.
      </Text>

      <ConfirmDialog
        visible={Boolean(switchTo)}
        title="Switch plan?"
        message={`Changing plan turns off your current autopay. You'll pay the difference for the rest of this period once, now — then turn autopay back on for ${switchTo?.name || 'the new plan'} from Plan & billing.`}
        confirmLabel="Continue"
        onCancel={() => setSwitchTo(null)}
        onConfirm={() => {
          const plan = switchTo;
          setSwitchTo(null);
          // Manual on purpose: the proration credit only exists on the one-time path.
          if (plan) buy(plan, { autopay: false });
        }}
      />

      <RazorpayCheckoutSheet
        checkout={checkout}
        customerName={user?.name}
        customerEmail={user?.email}
        onPaid={onPaid}
        onClose={(reason, message) => {
          setCheckout(null);
          if (reason === 'failed') showDialog({ title: 'Payment not completed', message: message || 'Please try again.', tone: 'error' });
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', padding: 4, borderRadius: radii.pill, marginBottom: 14 },
  toggleBtn: { flex: 1, height: 34, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  modeBtn: { flexDirection: 'row', gap: 6 },
  toggleLabel: { ...fontStyles.semiBold, fontSize: 13 },
  modeNote: { ...fontStyles.regular, fontSize: 12, lineHeight: 17, marginTop: -6, marginBottom: 14, paddingHorizontal: 4 },
  card: { borderRadius: radii.card, padding: 16, marginBottom: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  planName: { ...fontStyles.bold, fontSize: 17 },
  tagline: { ...fontStyles.regular, fontSize: 12, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill },
  badgeLabel: { ...fontStyles.semiBold, fontSize: 11 },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginTop: 12, marginBottom: 12 },
  price: { ...fontStyles.bold, fontSize: 26 },
  per: { ...fontStyles.regular, fontSize: 13, paddingBottom: 3 },
  features: { gap: 6, marginBottom: 14 },
  featureIntro: { ...fontStyles.medium, fontSize: 12, marginBottom: 2 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featureLabel: { ...fontStyles.regular, fontSize: 13, flex: 1, textTransform: 'capitalize' },
  primaryBtn: { height: 46, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  primaryLabel: { ...fontStyles.semiBold, fontSize: 15 },
  secondaryBtn: { height: 46, borderRadius: radii.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  secondaryLabel: { ...fontStyles.semiBold, fontSize: 15 },
  textBtn: { height: 40, alignItems: 'center', justifyContent: 'center' },
  textBtnLabel: { ...fontStyles.medium, fontSize: 13 },
  currentNote: { height: 42, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  currentNoteText: { ...fontStyles.medium, fontSize: 13 },
  footnote: { ...fontStyles.regular, fontSize: 12, textAlign: 'center', marginTop: 6, paddingHorizontal: 12 }
});
