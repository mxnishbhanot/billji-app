import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { ActivityIndicator, Button, Dialog, Portal, Text, useTheme } from 'react-native-paper';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { EmptyState } from '@/components/EmptyState';
import { invoicesApi, paymentsApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { useAppDialog } from '@/components/AppDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FormTextInput } from '@/components/FormTextInput';
import { PaymentHistorySheet } from '@/components/PaymentHistorySheet';
import { RecordPaymentSheet } from '@/components/RecordPaymentSheet';
import { Screen } from '@/components/Screen';
import { InvoiceDetailScreenProps } from '@/navigation/types';
import { openOrSharePdf } from '@/services/pdf';
import { PERMISSION, usePermissions } from '@/shared/hooks/usePermissions';
import { queryKeys } from '@/shared/query/queryKeys';
import { alpha, appColors, fontStyles, radii, statusTone, typeScale } from '@/theme/theme';
import { Invoice, InvoicePaymentStatus, InvoiceStatus, RecordPaymentPayload } from '@/types';
import { formatCurrency, formatDate } from '@/utils/format';
import { emailSchema } from '@/validation/schemas';
import { useEffect, useMemo, useState } from 'react';

function HeroPattern() {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 360 220" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <LinearGradient id="invHeroGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#1C1A4A" />
          <Stop offset="0.5" stopColor="#2D2A6B" />
          <Stop offset="1" stopColor="#40388C" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width={360} height={220} fill="url(#invHeroGrad)" />
      <G opacity="0.2" stroke="#FFFFFF" strokeWidth={1.2} fill="none" strokeLinecap="round">
        <Path d="M -26 52 C 28 12, 84 12, 134 48 S 236 96, 392 26" />
        <Path d="M -30 88 C 38 40, 96 44, 154 82 S 270 136, 392 78" opacity={0.72} />
        <Path d="M -28 134 C 48 88, 116 102, 176 130 S 282 178, 390 122" opacity={0.58} />
        <Path d="M 32 212 C 92 166, 148 180, 204 200 S 294 236, 388 184" opacity={0.42} />
      </G>
      <G opacity="0.18" stroke="#FFFFFF" strokeWidth={1.1} fill="none">
        <Circle cx={272} cy={58} r={18} />
        <Circle cx={302} cy={92} r={8} />
        <Circle cx={70} cy={164} r={13} />
        <Circle cx={110} cy={40} r={6} />
      </G>
      <G opacity="0.08" stroke="#A5B4FC" strokeWidth={18} fill="none">
        <Path d="M 238 -18 C 284 16, 318 52, 386 48" />
        <Path d="M -34 198 C 36 158, 86 174, 146 216" />
      </G>
    </Svg>
  );
}

function FloatingHeroBubbles() {
  const first = useMemo(() => new Animated.Value(0), []);
  const second = useMemo(() => new Animated.Value(0), []);
  const third = useMemo(() => new Animated.Value(0), []);
  const fourth = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(first, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(first, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true })
        ]),
        Animated.sequence([
          Animated.timing(second, { toValue: 1, duration: 12000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(second, { toValue: 0, duration: 12000, easing: Easing.inOut(Easing.sin), useNativeDriver: true })
        ]),
        Animated.sequence([
          Animated.timing(third, { toValue: 1, duration: 15000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(third, { toValue: 0, duration: 15000, easing: Easing.inOut(Easing.sin), useNativeDriver: true })
        ]),
        Animated.sequence([
          Animated.timing(fourth, { toValue: 1, duration: 18000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(fourth, { toValue: 0, duration: 18000, easing: Easing.inOut(Easing.sin), useNativeDriver: true })
        ])
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [first, fourth, second, third]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View
        style={[
          styles.heroBubbleLarge,
          {
            opacity: first.interpolate({ inputRange: [0, 1], outputRange: [0.16, 0.26] }),
            transform: [
              { translateX: first.interpolate({ inputRange: [0, 1], outputRange: [0, -20] }) },
              { translateY: first.interpolate({ inputRange: [0, 1], outputRange: [0, 12] }) },
              { scale: first.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.08] }) }
            ]
          }
        ]}
      />
      <Animated.View
        style={[
          styles.heroBubbleSmall,
          {
            opacity: second.interpolate({ inputRange: [0, 1], outputRange: [0.1, 0.2] }),
            transform: [
              { translateX: second.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) },
              { translateY: second.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }) },
              { scale: second.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.1] }) }
            ]
          }
        ]}
      />
      <Animated.View
        style={[
          styles.heroBubbleMedium,
          {
            opacity: third.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.18] }),
            transform: [
              { translateX: third.interpolate({ inputRange: [0, 1], outputRange: [0, 24] }) },
              { translateY: third.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) },
              { scale: third.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.12] }) }
            ]
          }
        ]}
      />
      <Animated.View
        style={[
          styles.heroBubbleTiny,
          {
            opacity: fourth.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.22] }),
            transform: [
              { translateX: fourth.interpolate({ inputRange: [0, 1], outputRange: [0, -16] }) },
              { translateY: fourth.interpolate({ inputRange: [0, 1], outputRange: [0, -18] }) },
              { scale: fourth.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.14] }) }
            ]
          }
        ]}
      />
    </View>
  );
}

const statusIconName = (status: InvoiceStatus): keyof typeof MaterialCommunityIcons.glyphMap =>
  status === 'paid' ? 'check-decagram' : status === 'cancelled' ? 'close-circle' : 'clock-outline';

const paymentStatusIconName = (status: InvoicePaymentStatus): keyof typeof MaterialCommunityIcons.glyphMap =>
  status === 'paid' ? 'check-decagram' : status === 'partial' ? 'progress-clock' : status === 'refunded' ? 'cash-refund' : 'clock-outline';

export function InvoiceDetailScreen({ route, navigation }: InvoiceDetailScreenProps) {
  const { id } = route.params;
  const queryClient = useQueryClient();
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const { showDialog } = useAppDialog();
  const { can } = usePermissions();
  const canRecordPayment = can(PERMISSION.paymentsRecord);
  const canUpdateInvoice = can(PERMISSION.invoicesUpdate);
  const canDeleteInvoice = can(PERMISSION.invoicesDelete);
  const [emailOpen, setEmailOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Which share action is mid-flight (PDF download is a network call — on slow
  // connections the tap looks dead without a spinner). One at a time.
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const emailForm = useForm<{ email: string }>({ defaultValues: { email: '' }, resolver: zodResolver(emailSchema) });
  const query = useQuery({ queryKey: queryKeys.invoices.detail(id), queryFn: () => invoicesApi.get(id) });
  const paymentsQuery = useQuery({ queryKey: queryKeys.payments.invoice(id), queryFn: () => paymentsApi.list({ invoiceId: id }) });
  const invoice = query.data;
  const customerId = invoice?.customer ?? '';
  // Customer-level outstanding (all unpaid invoices incl. this one) — drives the
  // "also settle previous dues" option when collecting payment on this invoice.
  const outstandingQuery = useQuery({
    queryKey: queryKeys.payments.customerOutstanding(customerId),
    queryFn: () => paymentsApi.customerOutstanding(customerId),
    enabled: Boolean(customerId)
  });
  // Targeted invalidation sets per action — only the query families the action actually affects.
  // Delete is gated to unprocessed invoices (no payments/stock/ledger), so it only touches
  // invoices/products/customers/reports. Cancel can run on paid invoices: it restores stock,
  // reverses ledger, and flags payments refund-pending — so it also invalidates payments.
  const invalidateStatusChange = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.report.all });
  };
  const invalidateCancel = () => {
    invalidateStatusChange();
    queryClient.invalidateQueries({ queryKey: queryKeys.payments.all });
    if (customerId) queryClient.invalidateQueries({ queryKey: queryKeys.payments.customerOutstanding(customerId) });
  };
  const invalidatePayment = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.payments.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.report.all });
    if (customerId) queryClient.invalidateQueries({ queryKey: queryKeys.payments.customerOutstanding(customerId) });
  };
  const cancelInvoice = useMutation({ mutationFn: () => invoicesApi.status(id, 'cancelled'), onSuccess: () => { setCancelling(false); invalidateCancel(); query.refetch(); paymentsQuery.refetch(); }, onError: (error) => { setCancelling(false); showDialog({ title: 'Could not cancel invoice', message: apiErrorMessage(error), tone: 'error' }); } });
  const remove = useMutation({ mutationFn: () => invoicesApi.remove(id), onSuccess: () => { setDeleting(false); invalidateStatusChange(); navigation.navigate('InvoiceList'); }, onError: (error) => { setDeleting(false); showDialog({ title: 'Could not delete invoice', message: apiErrorMessage(error), tone: 'error' }); } });
  const sendEmail = useMutation({ mutationFn: (email: string) => invoicesApi.email(id, email), onSuccess: () => { setEmailOpen(false); query.refetch(); }, onError: (error) => showDialog({ title: 'Could not send email', message: apiErrorMessage(error), tone: 'error' }) });
  const recordPayment = useMutation({
    mutationFn: async ({ payload, settlePreviousDues, invoiceIds }: { payload: RecordPaymentPayload; settlePreviousDues: boolean; invoiceIds: string[] }) => {
      if (settlePreviousDues && customerId) {
        await paymentsApi.recordCustomerPayment(customerId, {
          amount: payload.amount,
          method: payload.method,
          reference: payload.reference,
          notes: payload.notes,
          invoiceIds
        });
        return;
      }
      await paymentsApi.recordInvoicePayment(id, payload);
    },
    // Optimistic patch only for the single-invoice path; a dues-settling payment spans
    // multiple invoices (server allocates oldest-first), so we just refetch on success.
    onMutate: async ({ payload, settlePreviousDues }) => {
      let previous: Invoice | undefined;
      if (settlePreviousDues) return { previous };
      await queryClient.cancelQueries({ queryKey: queryKeys.invoices.detail(id) });
      previous = queryClient.getQueryData<Invoice>(queryKeys.invoices.detail(id));
      if (previous) {
        const paid = (previous.paidAmount ?? 0) + payload.amount;
        const balance = Math.max(previous.total - paid, 0);
        queryClient.setQueryData<Invoice>(queryKeys.invoices.detail(id), {
          ...previous,
          paidAmount: paid,
          balanceDue: balance,
          paymentStatus: balance <= 0 ? 'paid' : 'partial',
          status: balance <= 0 ? 'paid' : previous.status
        });
      }
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.invoices.detail(id), context.previous);
      showDialog({ title: 'Could not record payment', message: apiErrorMessage(error), tone: 'error' });
    },
    onSuccess: () => {
      setPaymentOpen(false);
      invalidatePayment();
      query.refetch();
      paymentsQuery.refetch();
      outstandingQuery.refetch();
    }
  });
  // Run a share action with a busy lock so the tile can show a spinner and ignore
  // repeat taps until the (possibly slow) PDF download/share resolves.
  const runShare = async (label: string) => {
    if (!invoice || busyAction) return;
    setBusyAction(label);
    try {
      await openOrSharePdf(invoice.pdfUrl, invoice.invoiceNumber);
    } catch (error) {
      showDialog({ title: 'Could not share invoice', message: apiErrorMessage(error), tone: 'error' });
    } finally {
      setBusyAction(null);
    }
  };

  if (query.isLoading) {
    return (
      <Screen title="Invoice">
        <ActivityIndicator color={theme.colors.primary} style={styles.loader} />
      </Screen>
    );
  }

  if (!invoice) {
    return (
      <Screen title="Invoice">
        <EmptyState title="Invoice not found" message="This invoice may have been removed." actionLabel="Back" onAction={() => navigation.goBack()} />
      </Screen>
    );
  }

  const currentStatus = invoice.status;
  const paidAmount = invoice.paidAmount ?? (invoice.paymentStatus === 'paid' ? invoice.total : 0);
  const balanceDue = invoice.balanceDue ?? Math.max(invoice.total - paidAmount, 0);
  const paymentStatus = invoice.paymentStatus ?? (currentStatus === 'paid' ? 'paid' : 'unpaid');
  // Previous dues = customer's total outstanding minus this invoice's own balance.
  const outstanding = outstandingQuery.data ?? { invoices: [], totalOutstanding: 0 };
  const previousDues = Math.max(outstanding.totalOutstanding - balanceDue, 0);
  // Oldest-first: settle other unpaid invoices, then this one.
  const settleInvoiceIds = [...outstanding.invoices.map((item) => item.id).filter((invoiceId) => invoiceId !== id), id];
  const tone = statusTone(currentStatus, isDark);
  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.08);
  const isCancelled = currentStatus === 'cancelled';
  const hasPayments = invoice.eligibility?.hasPayments ?? (paidAmount > 0 || (paymentsQuery.data?.length ?? 0) > 0);
  const hasProductItems = invoice.items.some((item) => item.product);
  // Server eligibility is authoritative; the heuristic only covers the (rare)
  // window before the detail query resolves. Delete is for draft/unprocessed
  // invoices only — never once payments, stock, or ledger entries exist.
  const canCancel = invoice.eligibility?.canCancel ?? !isCancelled;
  const canDelete = invoice.eligibility?.canDelete ?? (!isCancelled && !hasPayments && !hasProductItems);

  // Cancel keeps the record and reverses stock/accounting, but never refunds.
  // The warning copy depends on how much was already paid.
  const cancelMessage =
    paidAmount > 0 && balanceDue <= 0
      ? 'This invoice has been fully paid. Cancelling it will restore inventory and cancel the invoice but will not refund or reverse any existing payments.'
      : paidAmount > 0
        ? 'This invoice has received a partial payment. Cancelling it will restore inventory and cancel the invoice but will not refund or reverse any existing payments.'
        : 'This voids the invoice, restores stock for product items, and keeps the record for history.';

  const requestCancel = () => setCancelling(true);
  const requestDelete = () => {
    if (!canDelete) {
      showDialog({
        title: 'Cannot delete invoice',
        message:
          'This invoice cannot be deleted because it has associated payments or inventory/accounting transactions. Please cancel the invoice instead.',
        tone: 'error'
      });
      return;
    }
    setDeleting(true);
  };

  // Cancelled invoices are voided (stock + accounting reversed) and must not be
  // shareable/sendable by any channel — share sheet, WhatsApp, or email.
  const actions: { label: string; icon: keyof typeof Feather.glyphMap; onPress: () => void }[] = isCancelled
    ? []
    : [
        { label: 'PDF', icon: 'file-text', onPress: () => runShare('PDF') },
        { label: 'WhatsApp', icon: 'send', onPress: () => runShare('WhatsApp') },
        { label: 'Email', icon: 'mail', onPress: () => { emailForm.reset({ email: invoice.customerSnapshot.email || '' }); setEmailOpen(true); } }
      ];

  return (
    <Screen title={invoice.invoiceNumber}>
      <View style={[styles.heroCard, { borderColor: alpha('#C3C0FF', 0.3) }]}>
        <HeroPattern />
        <FloatingHeroBubbles />
        <View style={styles.heroInner}>
          <View style={[styles.heroEyebrowBadge, { borderColor: alpha('#FFFFFF', 0.22), backgroundColor: alpha('#1C1A4A', 0.4) }]}>
            <Text style={styles.heroEyebrow}>{invoice.invoiceNumber}</Text>
          </View>
          <Text style={styles.heroDate}>{formatDate(invoice.date)}</Text>
          <Text numberOfLines={1} style={styles.heroCustomer}>{invoice.customerSnapshot.name}</Text>
          <Text style={styles.heroAmount}>{formatCurrency(invoice.total)}</Text>
          <View style={[styles.heroStatusPill, { backgroundColor: '#FFFFFF' }]}>
            <MaterialCommunityIcons name={statusIconName(currentStatus)} size={14} color={colors.primaryStrong} />
            <Text style={[styles.heroStatusText, { color: colors.primaryStrong }]}>{currentStatus}</Text>
          </View>
        </View>
      </View>

      <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: cardBorder }]}>
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Items</Text>
          <View style={[styles.countBadge, { backgroundColor: alpha(colors.primary, isDark ? 0.2 : 0.12) }]}>
            <Text style={[styles.countBadgeText, { color: theme.colors.primary }]}>{invoice.items.length}</Text>
          </View>
        </View>
        {invoice.items.map((item, index) => (
          <View key={item._id || `${item.name}-${index}`} style={[styles.itemRow, index < invoice.items.length - 1 && { borderBottomWidth: 1, borderColor: cardBorder }]}>
            <View style={styles.itemContent}>
              <Text style={[styles.itemName, { color: theme.colors.onSurface }]}>{item.name}</Text>
              <Text style={[styles.itemMeta, { color: theme.colors.onSurfaceVariant }]}>{item.quantity}{item.unit ? ` ${item.unit}` : ''} × {formatCurrency(item.price)}</Text>
            </View>
            <Text style={[styles.itemTotal, { color: theme.colors.onSurface }]}>{formatCurrency(item.total)}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.colors.onSurface, marginBottom: 12 }]}>Bill summary</Text>
        <View style={styles.totalRows}>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: theme.colors.onSurfaceVariant }]}>Subtotal</Text>
            <Text style={[styles.totalValue, { color: theme.colors.onSurface }]}>{formatCurrency(invoice.subtotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: theme.colors.onSurfaceVariant }]}>Discount</Text>
            <Text style={[styles.totalValue, { color: theme.colors.onSurface }]}>-{formatCurrency(invoice.discount.amount)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: theme.colors.onSurfaceVariant }]}>Tax</Text>
            <Text style={[styles.totalValue, { color: theme.colors.onSurface }]}>{formatCurrency(invoice.tax.amount)}</Text>
          </View>
          <View style={[styles.grandTotal, { borderColor: cardBorder }]}>
            <Text style={[styles.grandTotalLabel, { color: theme.colors.onSurface }]}>Total</Text>
            <Text style={[styles.grandTotalValue, { color: theme.colors.primary }]}>{formatCurrency(invoice.total)}</Text>
          </View>
        </View>
      </View>

      <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.colors.onSurface, marginBottom: 12 }]}>Payment status</Text>
        <View style={[styles.statusPreview, { backgroundColor: tone.background, borderColor: tone.border }]}>
          <MaterialCommunityIcons name={isCancelled ? 'close-circle' : paymentStatusIconName(paymentStatus)} size={16} color={tone.foreground} />
          <Text style={[styles.statusPreviewText, { color: tone.foreground }]}>{isCancelled ? 'cancelled' : paymentStatus}</Text>
        </View>
        <View style={styles.paymentSummaryRows}>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: theme.colors.onSurfaceVariant }]}>Paid</Text>
            <Text style={[styles.totalValue, { color: theme.colors.onSurface }]}>{formatCurrency(paidAmount)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: theme.colors.onSurfaceVariant }]}>Balance due</Text>
            <Text style={[styles.totalValue, { color: balanceDue > 0 ? colors.destructive : theme.colors.onSurface }]}>{formatCurrency(balanceDue)}</Text>
          </View>
        </View>
        {canRecordPayment && !isCancelled && balanceDue > 0 ? (
          <Button mode="contained" icon="cash-plus" onPress={() => setPaymentOpen(true)} style={styles.recordPaymentButton}>
            Record payment
          </Button>
        ) : null}
        {paymentsQuery.data?.length ? (
          <>
            <View style={[styles.paymentHistory, { borderColor: cardBorder }]}>
              {paymentsQuery.data.slice(0, 3).map((payment) => (
                <View key={payment._id} style={styles.paymentHistoryRow}>
                  <Text style={[styles.paymentHistoryLabel, { color: theme.colors.onSurface }]}>{payment.method.replace('_', ' ')}</Text>
                  <Text style={[styles.paymentHistoryValue, { color: theme.colors.onSurfaceVariant }]}>{formatCurrency(payment.amount)}</Text>
                </View>
              ))}
            </View>
            <Pressable onPress={() => setHistoryOpen(true)} style={styles.historyLink} hitSlop={8}>
              <Text style={[styles.historyLinkText, { color: theme.colors.primary }]}>
                {paymentsQuery.data.length > 3 ? `View all ${paymentsQuery.data.length} payments` : 'View payment history'}
              </Text>
              <Feather name="chevron-right" size={14} color={theme.colors.primary} />
            </Pressable>
          </>
        ) : null}
      </View>

      {isCancelled ? (
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: cardBorder }]}>
          <View style={[styles.statusPreview, styles.cancelledNotice, { backgroundColor: tone.background, borderColor: tone.border }]}>
            <MaterialCommunityIcons name="close-circle" size={16} color={tone.foreground} />
            <Text style={[styles.statusPreviewText, styles.cancelledNoticeText, { color: tone.foreground }]}>This invoice is cancelled and can no longer be shared or sent.</Text>
          </View>
        </View>
      ) : (
      <View style={styles.actionRow}>
        {actions.map((action) => {
          const isBusy = busyAction === action.label;
          const disabled = Boolean(busyAction) && !isBusy;
          return (
            <Pressable
              key={action.label}
              onPress={action.onPress}
              disabled={Boolean(busyAction)}
              style={({ pressed }) => [
                styles.actionTile,
                {
                  backgroundColor: colors.card,
                  borderColor: cardBorder,
                  opacity: pressed ? 0.85 : disabled ? 0.5 : 1
                }
              ]}
            >
              <View style={[styles.actionIconWrap, { backgroundColor: alpha(colors.primary, isDark ? 0.2 : 0.12) }]}>
                {isBusy ? (
                  <ActivityIndicator size={16} color={theme.colors.primary} />
                ) : (
                  <Feather name={action.icon} size={16} color={theme.colors.primary} />
                )}
              </View>
              <Text style={[styles.actionLabel, { color: theme.colors.onSurface }]}>{isBusy ? 'Preparing…' : action.label}</Text>
            </Pressable>
          );
        })}
      </View>
      )}

      <View style={styles.footerActions}>
        {canUpdateInvoice && canCancel ? (
          <Button
            mode="outlined"
            textColor={theme.colors.error}
            icon={({ size, color }) => <Feather name="slash" size={size} color={color} />}
            onPress={requestCancel}
            style={styles.footerButton}
          >
            Cancel
          </Button>
        ) : null}
        {canDeleteInvoice && !isCancelled ? (
          <Button
            mode="contained"
            buttonColor={theme.colors.error}
            textColor={theme.colors.onError}
            disabled={!canDelete}
            icon={({ size, color }) => <Feather name="trash-2" size={size} color={color} />}
            onPress={requestDelete}
            style={styles.footerButton}
          >
            Delete
          </Button>
        ) : null}
      </View>

      <Portal>
        <Dialog visible={emailOpen} onDismiss={() => setEmailOpen(false)}>
          <Dialog.Title>Send invoice</Dialog.Title>
          <Dialog.Content><FormTextInput control={emailForm.control} name="email" label="Email" keyboardType="email-address" /></Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEmailOpen(false)}>Cancel</Button>
            <Button loading={sendEmail.isPending} onPress={emailForm.handleSubmit((values) => sendEmail.mutate(values.email))}>Send</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <RecordPaymentSheet
        visible={paymentOpen}
        balanceDue={balanceDue}
        previousDues={previousDues}
        loading={recordPayment.isPending}
        onClose={() => setPaymentOpen(false)}
        onSubmit={(payload, settlePreviousDues) => recordPayment.mutate({ payload, settlePreviousDues, invoiceIds: settleInvoiceIds })}
      />
      <PaymentHistorySheet
        visible={historyOpen}
        payments={paymentsQuery.data ?? []}
        loading={paymentsQuery.isLoading}
        onClose={() => setHistoryOpen(false)}
      />

      <ConfirmDialog visible={cancelling} title="Cancel invoice?" message={cancelMessage} confirmLabel="Cancel invoice" onCancel={() => setCancelling(false)} onConfirm={() => cancelInvoice.mutate()} />
      <ConfirmDialog visible={deleting} title="Delete invoice?" message="This permanently removes the invoice. Use delete only for test data or accidental duplicates with no recorded payments." onCancel={() => setDeleting(false)} onConfirm={() => remove.mutate()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionIconWrap: { alignItems: 'center', borderRadius: radii.pill, height: 34, justifyContent: 'center', width: 34 },
  actionLabel: { ...fontStyles.semiBold, fontSize: 12 },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  actionTile: {
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    flex: 1,
    gap: 8,
    paddingHorizontal: 6,
    paddingVertical: 14
  },
  countBadge: { alignItems: 'center', borderRadius: radii.pill, minWidth: 24, paddingHorizontal: 8, paddingVertical: 2 },
  countBadgeText: { ...fontStyles.bold, fontSize: 11 },
  footerActions: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  footerButton: { borderRadius: radii.input, flex: 1 },
  heroBubbleLarge: { backgroundColor: alpha('#FFFFFF', 0.18), borderColor: alpha('#FFFFFF', 0.34), borderRadius: 78, borderWidth: 1, height: 156, position: 'absolute', right: -44, top: 96, width: 156 },
  heroBubbleMedium: { backgroundColor: alpha('#A5B4FC', 0.16), borderColor: alpha('#FFFFFF', 0.24), borderRadius: 60, borderWidth: 1, bottom: -28, height: 120, left: 30, position: 'absolute', width: 120 },
  heroBubbleSmall: { backgroundColor: alpha('#FFFFFF', 0.14), borderColor: alpha('#FFFFFF', 0.28), borderRadius: 46, borderWidth: 1, height: 92, left: -26, position: 'absolute', top: -18, width: 92 },
  heroBubbleTiny: { backgroundColor: alpha('#FFFFFF', 0.16), borderColor: alpha('#FFFFFF', 0.3), borderRadius: 26, borderWidth: 1, height: 52, position: 'absolute', right: 94, top: 40, width: 52 },
  loader: { marginTop: 48 },
  grandTotal: {
    alignItems: 'center',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 12
  },
  grandTotalLabel: { ...fontStyles.bold, fontSize: 16 },
  grandTotalValue: { ...fontStyles.bold, fontSize: 22, letterSpacing: -0.4 },
  heroAmount: { ...fontStyles.bold, color: '#FFFFFF', fontSize: 30, letterSpacing: -0.9, marginTop: 8 },
  heroCard: { borderRadius: 26, borderWidth: 1, marginBottom: 16, overflow: 'hidden' },
  heroCustomer: { ...fontStyles.bold, color: '#FFFFFF', fontSize: 18, letterSpacing: -0.3, marginTop: 4 },
  heroDate: { ...fontStyles.medium, color: 'rgba(255,255,255,0.78)', fontSize: 12, marginTop: 10 },
  heroEyebrow: { ...fontStyles.bold, color: '#C7D2FE', fontSize: 10, letterSpacing: 1.4 },
  heroEyebrowBadge: { alignSelf: 'flex-start', borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3 },
  heroInner: { padding: 22 },
  historyLink: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 2, marginTop: 12 },
  historyLinkText: { ...fontStyles.semiBold, fontSize: 13 },
  heroStatusPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 5,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 5
  },
  heroStatusText: { ...fontStyles.bold, fontSize: 11, letterSpacing: 0.4, textTransform: 'capitalize' },
  itemContent: { flex: 1, minWidth: 0 },
  itemMeta: { ...typeScale.caption, fontSize: 12, marginTop: 2 },
  itemName: { ...fontStyles.semiBold, fontSize: 14 },
  itemRow: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between', paddingVertical: 12 },
  itemTotal: { ...fontStyles.bold, fontSize: 14 },
  paymentHistory: { borderTopWidth: 1, gap: 8, marginBottom: 14, marginTop: 12, paddingTop: 12 },
  paymentHistoryLabel: { ...fontStyles.semiBold, fontSize: 13, textTransform: 'capitalize' },
  paymentHistoryRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  paymentHistoryValue: { ...fontStyles.semiBold, fontSize: 13 },
  paymentSummaryRows: { gap: 8, marginBottom: 12 },
  recordPaymentButton: { borderRadius: radii.input, marginBottom: 12 },
  sectionCard: { borderRadius: radii.lg, borderWidth: 1, marginBottom: 16, padding: 16 },
  sectionHead: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between', marginBottom: 6 },
  sectionTitle: { ...fontStyles.bold, fontSize: 16 },
  statusPreview: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 5
  },
  statusPreviewText: { ...fontStyles.bold, fontSize: 11, letterSpacing: 0.4, textTransform: 'capitalize' },
  // Long-sentence variant of the chip: stretch full width, top-align icon, wrap text inside the card.
  cancelledNotice: { alignItems: 'flex-start', alignSelf: 'stretch', marginBottom: 0 },
  cancelledNoticeText: { flex: 1, flexShrink: 1, textTransform: 'none' },
  totalLabel: { ...typeScale.bodyPrimary, fontSize: 14 },
  totalRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  totalRows: { gap: 10 },
  totalValue: { ...fontStyles.semiBold, fontSize: 14 }
});
