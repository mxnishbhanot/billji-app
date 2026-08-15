import { Pressable, StyleSheet, View } from 'react-native';
import {
  AtSign,
  Ban,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  FileText,
  Mail,
  MapPin,
  Phone,
  Receipt,
  Send,
  Trash2,
  User,
  XCircle
} from 'lucide-react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { ActivityIndicator, Button, Dialog, Portal, Text, useTheme } from 'react-native-paper';
import { EmptyState } from '@/components/EmptyState';
import { invoicesApi, paymentsApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { useAppDialog } from '@/components/AppDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FormTextInput } from '@/components/FormTextInput';
import { PaymentHistorySheet } from '@/components/PaymentHistorySheet';
import { RecordPaymentSheet } from '@/components/RecordPaymentSheet';
import { Screen } from '@/components/Screen';
import { shadows } from '@/design-system';
import { InvoiceDetailScreenProps } from '@/navigation/types';
import { openOrSharePdf } from '@/services/pdf';
import { track } from '@/services/analytics';
import { TourAnchor, ANCHOR, useOnboardingOptional } from '@/features/onboarding';
import { hasWhatsAppPhone } from '@/shared/customers/customerPayload';
import { PERMISSION, usePermissions } from '@/shared/hooks/usePermissions';
import { queryKeys } from '@/shared/query/queryKeys';
import { alpha, appColors, fontStyles, radii, spacing, statusTone, typeScale } from '@/theme/theme';
import { documentNumberOf, Invoice, InvoicePaymentStatus, InvoiceStatus, RecordPaymentPayload } from '@/types';
import { formatCurrency, formatDate } from '@/utils/format';
import { emailSchema } from '@/validation/schemas';
import { ComponentType, ReactNode, useEffect, useRef, useState } from 'react';

/**
 * Tax heads to print, summed from the stored HSN summary. Returns [] for documents
 * issued before the GST engine, which have no summary and fall back to a single merged
 * "Tax" row. Plain function rather than a memo: it walks a handful of rows, and the
 * invoice is only available after this screen's loading guards.
 */
const gstHeadsFor = (invoice: Invoice) => {
  const summary = invoice.taxSummary ?? [];
  if (!summary.length) return [];

  const sum = (key: 'cgst' | 'sgst' | 'igst') =>
    Math.round(summary.reduce((total, row) => total + Number(row[key] || 0), 0) * 100) / 100;

  return (
    invoice.supplyType === 'inter'
      ? [{ label: 'IGST', amount: sum('igst') }]
      : [
          { label: 'CGST', amount: sum('cgst') },
          { label: 'SGST', amount: sum('sgst') }
        ]
  ).filter((head) => head.amount > 0);
};

type LucideGlyph = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

/** Declared at module scope: picking the glyph inside render would remount it every pass. */
function StatusGlyph({ status, size, color }: { status: InvoiceStatus; size: number; color: string }) {
  const Icon = status === 'paid' ? CheckCircle2 : status === 'cancelled' ? XCircle : Clock;
  return <Icon size={size} color={color} strokeWidth={2.3} />;
}

function PaymentGlyph({ status, cancelled, size, color }: { status: InvoicePaymentStatus; cancelled: boolean; size: number; color: string }) {
  const Icon = cancelled ? Ban : status === 'paid' ? CheckCircle2 : status === 'refunded' ? Receipt : Clock;
  return <Icon size={size} color={color} strokeWidth={2.2} />;
}

/** Section eyebrow + card, matching the Settings/Dashboard label-over-card rhythm. */
function Section({
  title,
  trailing,
  children,
  cardStyle
}: {
  title?: string;
  trailing?: ReactNode;
  children: ReactNode;
  cardStyle?: object;
}) {
  const theme = useTheme();
  const colors = appColors(theme.dark);
  const border = theme.dark ? colors.border : alpha(colors.primaryStrong, 0.06);

  return (
    <View style={styles.section}>
      {title ? (
        <View style={styles.sectionLabelRow}>
          <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>{title}</Text>
          {trailing}
        </View>
      ) : null}
      <View style={[styles.card, theme.dark ? null : shadows.card, { backgroundColor: colors.card, borderColor: border }, cardStyle]}>
        {children}
      </View>
    </View>
  );
}

function DetailRow({ label, value, emphasise }: { label: string; value: string; emphasise?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: theme.colors.onSurfaceVariant }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: emphasise ?? theme.colors.onSurface }]}>{value}</Text>
    </View>
  );
}

export function InvoiceDetailScreen({ route, navigation }: InvoiceDetailScreenProps) {
  const { id } = route.params;
  const queryClient = useQueryClient();
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const { showDialog } = useAppDialog();
  const { can } = usePermissions();
  const onboarding = useOnboardingOptional();
  const canRecordPayment = can(PERMISSION.paymentsRecord);
  const canUpdateInvoice = can(PERMISSION.invoicesUpdate);
  const canCreateInvoice = can(PERMISSION.invoicesCreate);
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
  const sendEmail = useMutation({
    mutationFn: (email: string) => invoicesApi.email(id, email),
    onSuccess: () => {
      track('invoice_shared', { channel: 'email' });
      onboarding?.markLocalFlag('sharedInvoice', true);
      setEmailOpen(false);
      query.refetch();
    },
    onError: (error) => showDialog({ title: 'Could not send email', message: apiErrorMessage(error), tone: 'error' })
  });
  const recordPayment = useMutation({
    mutationFn: async ({ payload, settlePreviousDues, invoiceIds }: { payload: RecordPaymentPayload; settlePreviousDues: boolean; invoiceIds: string[] }) => {
      if (settlePreviousDues && customerId) {
        await paymentsApi.recordCustomerPayment(customerId, {
          amount: payload.amount,
          method: payload.method,
          reference: payload.reference,
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
  // Mark a cancelled invoice's refund-pending receipts as refunded manually.
  // Flag-only on the server (cancel already reversed ledger/balance) — just clears
  // the "Refund pending" flag and stamps who/when for the audit trail.
  const markRefund = useMutation({
    mutationFn: () => paymentsApi.markRefundProcessed(id),
    onSuccess: () => { invalidatePayment(); paymentsQuery.refetch(); },
    onError: (error) => showDialog({ title: 'Could not mark refund', message: apiErrorMessage(error), tone: 'error' })
  });
  // Run a share action with a busy lock so the tile can show a spinner and ignore
  // repeat taps until the (possibly slow) PDF download/share resolves.
  const runShare = async (label: string) => {
    if (!invoice || busyAction) return;
    // A bill issued offline has its number and its totals, but the PDF is rendered on the
    // server — so say that plainly rather than failing on an empty URL.
    if (!invoice.pdfUrl) {
      showDialog({
        title: 'Saved on this device',
        message: `${documentNumberOf(invoice)} is saved here and will sync automatically. The PDF is generated on the server, so sharing becomes available once it has synced.`,
        tone: 'warning'
      });
      return;
    }
    setBusyAction(label);
    try {
      await openOrSharePdf(invoice.pdfUrl, documentNumberOf(invoice));
      track('invoice_shared', { channel: label.toLowerCase() });
      onboarding?.markLocalFlag('sharedInvoice', true);
    } catch (error) {
      showDialog({ title: 'Could not share invoice', message: apiErrorMessage(error), tone: 'error' });
    } finally {
      setBusyAction(null);
    }
  };

  // "Generate & Receive" in the builder lands here with a one-shot intent: open the same
  // Record payment sheet the button below opens, once the invoice has actually loaded.
  // The ref makes it once-per-arrival — a refetch, a re-render, dismissing the sheet, or
  // navigating back must not reopen it — and the param is cleared as it is consumed.
  const openRecordPaymentIntent = route.params.openRecordPayment;
  const paymentIntentConsumed = useRef(false);
  useEffect(() => {
    if (!openRecordPaymentIntent || paymentIntentConsumed.current) return;
    if (!invoice) return;
    paymentIntentConsumed.current = true;
    navigation.setParams({ openRecordPayment: undefined });
    const due = invoice.balanceDue ?? Math.max(invoice.total - (invoice.paidAmount ?? 0), 0);
    // The navigation params are the external system being synchronised here, and the ref makes
    // this fire at most once per arrival — so there is no cascading-render loop to avoid.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (canRecordPayment && invoice.status !== 'cancelled' && due > 0) setPaymentOpen(true);
  }, [canRecordPayment, invoice, navigation, openRecordPaymentIntent]);

  if (query.isLoading) {
    return (
      <Screen title="Invoice">
        <View style={[styles.card, styles.stateCard, isDark ? null : shadows.card, { backgroundColor: colors.card, borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.06) }]}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={[styles.stateText, { color: theme.colors.onSurfaceVariant }]}>Loading invoice…</Text>
        </View>
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
  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.06);
  const isCancelled = currentStatus === 'cancelled';
  const gstHeads = gstHeadsFor(invoice);
  const hasPayments = invoice.eligibility?.hasPayments ?? (paidAmount > 0 || (paymentsQuery.data?.length ?? 0) > 0);
  const hasProductItems = invoice.items.some((item) => item.product);
  // Server eligibility is authoritative; the heuristic only covers the (rare)
  // window before the detail query resolves. Delete is for draft/unprocessed
  // invoices only — never once payments, stock, or ledger entries exist.
  const canCancel = invoice.eligibility?.canCancel ?? !isCancelled;
  const canDelete = invoice.eligibility?.canDelete ?? (!isCancelled && !hasPayments && !hasProductItems);

  // Cancel keeps the record, restores stock, and reverses the accounting entries
  // (so reports adjust). BillJi never moves money — issuing the actual refund is
  // the user's responsibility. The copy also asks the user to confirm they've
  // agreed the cancellation with their customer. Wording depends on how much was
  // already paid.
  const cancelMessage =
    paidAmount > 0 && balanceDue <= 0
      ? 'This invoice has been fully paid. Cancelling will restore inventory, reverse the accounting entries, and adjust your reports accordingly. BillJi does not move any money — refunding your customer is your responsibility. By continuing you confirm you have agreed this cancellation with your customer; BillJi is not liable for any dispute arising from it.'
      : paidAmount > 0
        ? 'This invoice has received a partial payment. Cancelling will restore inventory, reverse the accounting entries, and adjust your reports accordingly. BillJi does not move any money — refunding your customer is your responsibility. By continuing you confirm you have agreed this cancellation with your customer; BillJi is not liable for any dispute arising from it.'
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
  const actions: { label: string; icon: LucideGlyph; onPress: () => void }[] = isCancelled
    ? []
    : [
        { label: 'PDF', icon: FileText, onPress: () => runShare('PDF') },
        // Customerless / no-phone sale: the server refuses the wa.me link, so don't offer it.
        ...(hasWhatsAppPhone(invoice.customerSnapshot)
          ? [{ label: 'WhatsApp', icon: Send as LucideGlyph, onPress: () => runShare('WhatsApp') }]
          : []),
        { label: 'Email', icon: Mail, onPress: () => { emailForm.reset({ email: invoice.customerSnapshot.email || '' }); setEmailOpen(true); } }
      ];

  const snapshot = invoice.customerSnapshot;
  // A walk-in / cash sale has no Customer row at all — the snapshot carries only the label.
  const isWalkIn = !invoice.customer;
  const showRecordPayment = canRecordPayment && !isCancelled && balanceDue > 0;
  const headlineLabel = isCancelled ? 'Invoice total' : balanceDue > 0 ? 'Amount due' : 'Paid in full';
  const headlineAmount = isCancelled || balanceDue <= 0 ? invoice.total : balanceDue;
  const headlineMeta = isCancelled
    ? 'Cancelled · stock and accounting reversed'
    : balanceDue <= 0
      ? `${formatCurrency(invoice.total)} received`
      : paidAmount > 0
        ? `${formatCurrency(paidAmount)} paid · ${formatCurrency(balanceDue)} due`
        : `Invoice total ${formatCurrency(invoice.total)}`;

  return (
    <Screen title={documentNumberOf(invoice)}>
      {/* Summary: what invoice, when, what state, and how much is outstanding — in one glance. */}
      <Section>
        <View style={styles.summaryHead}>
          <View style={styles.summaryHeadText}>
            <Text numberOfLines={1} style={[styles.docNumber, { color: theme.colors.onSurface }]}>{documentNumberOf(invoice)}</Text>
            <Text style={[styles.docDate, { color: theme.colors.onSurfaceVariant }]}>{formatDate(invoice.date)}</Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: tone.background, borderColor: alpha(tone.foreground, isDark ? 0.42 : 0.3) }]}>
            <StatusGlyph status={currentStatus} size={13} color={tone.foreground} />
            <Text style={[styles.statusText, { color: tone.foreground }]}>{currentStatus}</Text>
          </View>
        </View>
        <View style={[styles.summaryAmountBlock, { borderTopColor: cardBorder }]}>
          <Text style={[styles.amountLabel, { color: theme.colors.onSurfaceVariant }]}>{headlineLabel}</Text>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
            style={[styles.amountValue, { color: isCancelled ? theme.colors.onSurfaceVariant : theme.colors.onSurface }]}
          >
            {formatCurrency(headlineAmount)}
          </Text>
          <Text style={[styles.amountMeta, { color: theme.colors.onSurfaceVariant }]}>{headlineMeta}</Text>
        </View>
        {showRecordPayment ? (
          <Button
            mode="contained"
            icon="cash-plus"
            buttonColor={isDark ? colors.primaryFixed : colors.primary}
            textColor="#FFFFFF"
            onPress={() => setPaymentOpen(true)}
            style={styles.primaryButton}
            contentStyle={styles.primaryButtonContent}
          >
            Record payment
          </Button>
        ) : null}
      </Section>

      {/* Share row sits directly under the summary: the most common follow-up on a settled bill. */}
      {isCancelled ? null : (
        <TourAnchor anchorId={ANCHOR.shareInvoice}>
          <View style={styles.actionRow}>
            {actions.map((action) => {
              const isBusy = busyAction === action.label;
              const disabled = Boolean(busyAction) && !isBusy;
              const Icon = action.icon;
              return (
                <Pressable
                  key={action.label}
                  accessibilityRole="button"
                  accessibilityLabel={`Share invoice by ${action.label}`}
                  onPress={action.onPress}
                  disabled={Boolean(busyAction)}
                  style={({ pressed }) => [
                    styles.actionTile,
                    isDark ? null : shadows.card,
                    {
                      backgroundColor: colors.card,
                      borderColor: cardBorder,
                      opacity: pressed ? 0.85 : disabled ? 0.5 : 1
                    }
                  ]}
                >
                  <View style={[styles.actionIconWrap, { backgroundColor: alpha(colors.primary, isDark ? 0.26 : 0.12) }]}>
                    {isBusy ? (
                      <ActivityIndicator size={16} color={theme.colors.primary} />
                    ) : (
                      <Icon size={17} color={colors.primaryStrong} strokeWidth={2.2} />
                    )}
                  </View>
                  <Text numberOfLines={1} style={[styles.actionLabel, { color: theme.colors.onSurface }]}>{isBusy ? 'Preparing…' : action.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </TourAnchor>
      )}

      {isCancelled ? (
        <Section>
          <View style={styles.noticeRow}>
            <View style={[styles.noticeIcon, { backgroundColor: tone.background }]}>
              <Ban size={16} color={tone.foreground} strokeWidth={2.2} />
            </View>
            <Text style={[styles.noticeText, { color: theme.colors.onSurfaceVariant }]}>
              This invoice is cancelled and can no longer be shared or sent.
            </Text>
          </View>
        </Section>
      ) : null}

      <Section title="BILLED TO">
        <View style={styles.customerRow}>
          <View style={[styles.customerAvatar, { backgroundColor: alpha(colors.primary, isDark ? 0.2 : 0.12) }]}>
            <User size={18} color={colors.primaryStrong} strokeWidth={2.2} />
          </View>
          <View style={styles.customerText}>
            <Text numberOfLines={2} style={[styles.customerName, { color: theme.colors.onSurface }]}>{snapshot.name}</Text>
            <Text style={[styles.customerHint, { color: theme.colors.onSurfaceVariant }]}>
              {isWalkIn ? 'Walk-in sale · no customer account' : 'Customer'}
            </Text>
          </View>
        </View>
        {snapshot.phone || snapshot.email || snapshot.gstNumber || snapshot.address ? (
          <View style={[styles.customerMeta, { borderTopColor: cardBorder }]}>
            {snapshot.phone ? (
              <View style={styles.metaRow}>
                <Phone size={14} color={theme.colors.onSurfaceVariant} strokeWidth={2.2} />
                <Text style={[styles.metaText, { color: theme.colors.onSurfaceVariant }]}>{snapshot.phone}</Text>
              </View>
            ) : null}
            {snapshot.email ? (
              <View style={styles.metaRow}>
                <AtSign size={14} color={theme.colors.onSurfaceVariant} strokeWidth={2.2} />
                <Text numberOfLines={1} style={[styles.metaText, { color: theme.colors.onSurfaceVariant }]}>{snapshot.email}</Text>
              </View>
            ) : null}
            {snapshot.gstNumber ? (
              <View style={styles.metaRow}>
                <Receipt size={14} color={theme.colors.onSurfaceVariant} strokeWidth={2.2} />
                <Text style={[styles.metaText, { color: theme.colors.onSurfaceVariant }]}>{snapshot.gstNumber}</Text>
              </View>
            ) : null}
            {snapshot.address ? (
              <View style={styles.metaRow}>
                <MapPin size={14} color={theme.colors.onSurfaceVariant} strokeWidth={2.2} />
                <Text style={[styles.metaText, { color: theme.colors.onSurfaceVariant }]}>{snapshot.address}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </Section>

      <Section
        title="ITEMS"
        trailing={
          <View style={[styles.countBadge, { backgroundColor: alpha(colors.primary, isDark ? 0.2 : 0.12) }]}>
            <Text style={[styles.countBadgeText, { color: colors.primaryStrong }]}>{invoice.items.length}</Text>
          </View>
        }
        cardStyle={styles.listCard}
      >
        {invoice.items.map((item, index) => (
          <View key={item._id || `${item.name}-${index}`} style={styles.itemRow}>
            {index > 0 ? <View style={[styles.itemDivider, { backgroundColor: cardBorder }]} /> : null}
            <View style={styles.itemInner}>
              <View style={styles.itemContent}>
                <Text style={[styles.itemName, { color: theme.colors.onSurface }]}>{item.name}</Text>
                <Text style={[styles.itemMeta, { color: theme.colors.onSurfaceVariant }]}>
                  {item.quantity}{item.unit ? ` ${item.unit}` : ''} × {formatCurrency(item.price)}
                </Text>
              </View>
              <Text style={[styles.itemTotal, { color: theme.colors.onSurface }]}>{formatCurrency(item.total)}</Text>
            </View>
          </View>
        ))}
      </Section>

      <Section title="BILL SUMMARY">
        <View style={styles.detailRows}>
          <DetailRow label="Subtotal" value={formatCurrency(invoice.subtotal)} />
          {/* Zero-value rows are noise on a simple bill — only what actually applies is printed. */}
          {invoice.discount.amount > 0 ? (
            <DetailRow label="Discount" value={`-${formatCurrency(invoice.discount.amount)}`} />
          ) : null}
          {/* GST invoices show each tax head separately; documents issued before the GST
              engine have no taxSummary and keep the single "Tax" row they were created with. */}
          {gstHeads.length ? (
            gstHeads.map((head) => <DetailRow key={head.label} label={head.label} value={formatCurrency(head.amount)} />)
          ) : invoice.tax.amount > 0 ? (
            <DetailRow label="Tax" value={formatCurrency(invoice.tax.amount)} />
          ) : null}
          {invoice.placeOfSupply?.state ? (
            <DetailRow
              label="Place of supply"
              value={`${invoice.placeOfSupply.state}${invoice.supplyType === 'inter' ? ' · inter-state' : ''}`}
            />
          ) : null}
        </View>
        <View style={[styles.grandTotal, { borderTopColor: cardBorder }]}>
          <Text style={[styles.grandTotalLabel, { color: theme.colors.onSurface }]}>Total</Text>
          <Text style={[styles.grandTotalValue, { color: theme.colors.onSurface }]}>{formatCurrency(invoice.total)}</Text>
        </View>
      </Section>

      <Section title="PAYMENT">
        <View style={styles.paymentHead}>
          <View style={[styles.paymentIcon, { backgroundColor: tone.background }]}>
            <PaymentGlyph status={paymentStatus} cancelled={isCancelled} size={16} color={tone.foreground} />
          </View>
          <Text style={[styles.paymentHeadText, { color: theme.colors.onSurface }]}>
            {isCancelled ? 'Cancelled' : balanceDue <= 0 ? 'Paid in full' : paidAmount > 0 ? 'Partially paid' : 'Unpaid'}
          </Text>
        </View>
        <View style={styles.detailRows}>
          <DetailRow label="Paid" value={formatCurrency(paidAmount)} />
          <DetailRow label="Balance due" value={formatCurrency(balanceDue)} emphasise={balanceDue > 0 ? colors.destructive : undefined} />
        </View>
        {paymentsQuery.data?.length ? (
          <>
            <View style={[styles.paymentHistory, { borderTopColor: cardBorder }]}>
              {paymentsQuery.data.slice(0, 3).map((payment) => (
                <View key={payment._id} style={styles.detailRow}>
                  <Text style={[styles.paymentHistoryLabel, { color: theme.colors.onSurface }]}>{payment.method.replace('_', ' ')}</Text>
                  <Text style={[styles.detailValue, { color: theme.colors.onSurfaceVariant }]}>{formatCurrency(payment.amount)}</Text>
                </View>
              ))}
            </View>
            <Pressable onPress={() => setHistoryOpen(true)} style={styles.historyLink} hitSlop={8} accessibilityRole="button">
              <Text style={[styles.historyLinkText, { color: theme.colors.primary }]}>
                {paymentsQuery.data.length > 3 ? `View all ${paymentsQuery.data.length} payments` : 'View payment history'}
              </Text>
              <ChevronRight size={15} color={theme.colors.primary} strokeWidth={2.4} />
            </Pressable>
          </>
        ) : null}
      </Section>

      {/* Tertiary: correction and destructive actions, kept quiet at the end of the document. */}
      {(canCreateInvoice && !hasPayments) || (canUpdateInvoice && canCancel) || (canDeleteInvoice && !isCancelled) ? (
        <View style={styles.footerActions}>
          {/* An issued invoice is immutable, so correcting one means reissuing it. This only
              seeds the builder — the new invoice is created when the user taps Generate, so the
              original's stock, ledger and payment records are left exactly as they are. Hidden
              once money has been received: that case belongs to the credit-note workflow. */}
          {canCreateInvoice && !hasPayments ? (
            <Button
              mode="outlined"
              icon={({ size, color }) => <Copy size={size} color={color} strokeWidth={2.2} />}
              onPress={() => navigation.navigate('InvoiceCreate', { prefillFromInvoiceId: id })}
              style={styles.footerButton}
            >
              Duplicate & correct
            </Button>
          ) : null}
          {canUpdateInvoice && canCancel ? (
            <Button
              mode="outlined"
              textColor={theme.colors.error}
              icon={({ size, color }) => <Ban size={size} color={color} strokeWidth={2.2} />}
              onPress={requestCancel}
              style={[styles.footerButton, { borderColor: alpha(colors.destructive, isDark ? 0.55 : 0.38) }]}
            >
              Cancel
            </Button>
          ) : null}
          {canDeleteInvoice && !isCancelled ? (
            <Button
              mode="outlined"
              textColor={theme.colors.error}
              disabled={!canDelete}
              icon={({ size, color }) => <Trash2 size={size} color={color} strokeWidth={2.2} />}
              onPress={requestDelete}
              style={[styles.footerButton, { borderColor: alpha(colors.destructive, isDark ? 0.3 : 0.2) }]}
            >
              Delete
            </Button>
          ) : null}
        </View>
      ) : null}

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
        onMarkRefunded={() => markRefund.mutate()}
        marking={markRefund.isPending}
      />

      <ConfirmDialog visible={cancelling} title="Cancel invoice?" message={cancelMessage} confirmLabel="Cancel invoice" onCancel={() => setCancelling(false)} onConfirm={() => cancelInvoice.mutate()} />
      <ConfirmDialog visible={deleting} title="Delete invoice?" message="This permanently removes the invoice. Use delete only for test data or accidental duplicates with no recorded payments." onCancel={() => setDeleting(false)} onConfirm={() => remove.mutate()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionIconWrap: { alignItems: 'center', borderRadius: radii.pill, height: 34, justifyContent: 'center', width: 34 },
  actionLabel: { ...fontStyles.semiBold, fontSize: 12 },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: spacing.section },
  actionTile: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    gap: 8,
    paddingHorizontal: 6,
    paddingVertical: 14
  },
  amountLabel: { ...fontStyles.semiBold, fontSize: 10.5, letterSpacing: 0.9, textTransform: 'uppercase' },
  amountMeta: { ...fontStyles.medium, fontSize: 12.5, marginTop: 4 },
  amountValue: { ...fontStyles.bold, fontSize: 32, letterSpacing: -0.9, lineHeight: 40, marginTop: 2 },
  card: { borderRadius: 20, borderWidth: 1, padding: spacing.cardPadding },
  countBadge: { alignItems: 'center', borderRadius: radii.pill, minWidth: 24, paddingHorizontal: 8, paddingVertical: 2 },
  countBadgeText: { ...fontStyles.bold, fontSize: 11 },
  customerAvatar: { alignItems: 'center', borderRadius: radii.pill, height: 40, justifyContent: 'center', width: 40 },
  customerHint: { ...fontStyles.medium, fontSize: 11.5, marginTop: 2 },
  customerMeta: { borderTopWidth: 1, gap: 8, marginTop: 12, paddingTop: 12 },
  customerName: { ...fontStyles.bold, fontSize: 16, letterSpacing: -0.3, lineHeight: 22 },
  customerRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  customerText: { flex: 1, minWidth: 0 },
  detailLabel: { ...typeScale.bodyPrimary, flexShrink: 1, fontSize: 13.5 },
  detailRow: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  detailRows: { gap: 10 },
  detailValue: { ...fontStyles.semiBold, fontSize: 13.5, textAlign: 'right' },
  footerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: spacing.section },
  footerButton: { borderRadius: radii.input, flexGrow: 1, flexShrink: 1 },
  grandTotal: {
    alignItems: 'center',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12
  },
  grandTotalLabel: { ...fontStyles.bold, fontSize: 15 },
  grandTotalValue: { ...fontStyles.bold, fontSize: 22, letterSpacing: -0.5 },
  historyLink: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 2, marginTop: 12 },
  historyLinkText: { ...fontStyles.semiBold, fontSize: 13 },
  itemContent: { flex: 1, minWidth: 0 },
  itemDivider: { height: StyleSheet.hairlineWidth, marginBottom: 12 },
  itemInner: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  itemMeta: { ...typeScale.caption, fontSize: 12, marginTop: 3 },
  itemName: { ...fontStyles.semiBold, fontSize: 14, lineHeight: 20 },
  itemRow: { paddingVertical: 8 },
  itemTotal: { ...fontStyles.bold, fontSize: 14, lineHeight: 20 },
  listCard: { paddingVertical: 6 },
  metaRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 8 },
  metaText: { ...fontStyles.medium, flex: 1, fontSize: 12.5, lineHeight: 18 },
  noticeIcon: { alignItems: 'center', borderRadius: radii.pill, height: 32, justifyContent: 'center', width: 32 },
  noticeRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  noticeText: { ...fontStyles.medium, flex: 1, fontSize: 13, lineHeight: 19 },
  docDate: { ...fontStyles.medium, fontSize: 12.5, marginTop: 3 },
  docNumber: { ...fontStyles.bold, fontSize: 18, letterSpacing: -0.4 },
  paymentHead: { alignItems: 'center', flexDirection: 'row', gap: 10, marginBottom: 14 },
  paymentHeadText: { ...fontStyles.bold, fontSize: 15, letterSpacing: -0.2 },
  paymentHistory: { borderTopWidth: 1, gap: 8, marginTop: 14, paddingTop: 12 },
  paymentHistoryLabel: { ...fontStyles.semiBold, fontSize: 13, textTransform: 'capitalize' },
  paymentIcon: { alignItems: 'center', borderRadius: radii.pill, height: 32, justifyContent: 'center', width: 32 },
  primaryButton: { borderRadius: radii.input, marginTop: 16 },
  primaryButtonContent: { paddingVertical: 4 },
  section: { marginBottom: spacing.section },
  sectionLabel: { ...fontStyles.semiBold, fontSize: 10.5, letterSpacing: 0.9, textTransform: 'uppercase' },
  sectionLabelRow: { alignItems: 'center', flexDirection: 'row', gap: 8, marginBottom: 10, marginLeft: 4 },
  stateCard: { alignItems: 'center', gap: 12, paddingVertical: 32 },
  stateText: { ...fontStyles.medium, fontSize: 13 },
  statusPill: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  statusText: { ...fontStyles.bold, fontSize: 11, letterSpacing: 0.3, textTransform: 'capitalize' },
  summaryAmountBlock: { borderTopWidth: 1, marginTop: 14, paddingTop: 14 },
  summaryHead: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  summaryHeadText: { flex: 1, minWidth: 0 }
});
