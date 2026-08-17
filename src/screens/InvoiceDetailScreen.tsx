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
  Undo2,
  Wallet,
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
import { ApplyCreditSheet } from '@/components/ApplyCreditSheet';
import { PaymentHistorySheet } from '@/components/PaymentHistorySheet';
import { RecordPaymentSheet } from '@/components/RecordPaymentSheet';
import { Screen } from '@/components/Screen';
import { shadows } from '@/design-system';
import { CustomerMetaItem, DocumentCustomerSection } from '@/features/documents/components/DocumentCustomerSection';
import { DocumentHeroCard, documentHeroActionStyles } from '@/features/documents/components/DocumentHeroCard';
import { DocumentNotice } from '@/features/documents/components/DocumentNotice';
import { DocumentItemRow, DocumentItemsSection } from '@/features/documents/components/DocumentItemsSection';
import { DocumentSection as Section, DocumentDetailRow as DetailRow } from '@/features/documents/components/DocumentSection';
import { DocumentShareActions, ShareAction } from '@/features/documents/components/DocumentShareActions';
import { creditableRemaining } from '@/features/documents/creditNoteBuilder';
import { gstHeadsFor } from '@/features/documents/gstHeads';
import { InvoiceDetailScreenProps } from '@/navigation/types';
import { openOrSharePdf } from '@/services/pdf';
import { track } from '@/services/analytics';
import { TourAnchor, ANCHOR, useOnboardingOptional } from '@/features/onboarding';
import { hasWhatsAppPhone } from '@/shared/customers/customerPayload';
import { PERMISSION, usePermissions } from '@/shared/hooks/usePermissions';
import { queryKeys } from '@/shared/query/queryKeys';
import { alpha, appColors, fontStyles, radii, spacing, statusTone } from '@/theme/theme';
import { documentNumberOf, Invoice, InvoicePaymentStatus, InvoiceStatus, RecordPaymentPayload } from '@/types';
import { formatCurrency, formatDate } from '@/utils/format';
import { emailSchema } from '@/validation/schemas';
import { useEffect, useRef, useState } from 'react';

/** Returns the glyph itself rather than an element: the hero renders it, and picking it
 *  inside render would remount the icon every pass. */
const statusGlyphFor = (status: InvoiceStatus) =>
  status === 'paid' ? CheckCircle2 : status === 'cancelled' ? XCircle : Clock;

function PaymentGlyph({ status, cancelled, size, color }: { status: InvoicePaymentStatus; cancelled: boolean; size: number; color: string }) {
  const Icon = cancelled ? Ban : status === 'paid' ? CheckCircle2 : status === 'refunded' ? Receipt : Clock;
  return <Icon size={size} color={color} strokeWidth={2.2} />;
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
  const [applyCreditOpen, setApplyCreditOpen] = useState(false);
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
  // The customer's spendable credit. Online-only and never cached long: the pool is shared,
  // so a stale figure would offer credit another till has already spent.
  const creditsQuery = useQuery({
    queryKey: queryKeys.payments.customerCredits(customerId),
    queryFn: () => paymentsApi.customerCredits(customerId),
    enabled: Boolean(customerId)
  });
  const availableCredit = creditsQuery.data?.availableCredit ?? 0;
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
  const applyCredit = useMutation({
    mutationFn: (amount: number) => paymentsApi.applyCredit(id, amount),
    onSuccess: () => {
      setApplyCreditOpen(false);
      invalidatePayment();
      if (customerId) queryClient.invalidateQueries({ queryKey: queryKeys.payments.customerCredits(customerId) });
      query.refetch();
    },
    onError: (error) => showDialog({ title: 'Could not apply credit', message: apiErrorMessage(error), tone: 'error' })
  });
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
        const balance = Math.max(previous.total - paid - (previous.creditApplied ?? 0), 0);
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
  // Credit is settlement, not money: it comes off the balance but never off "Paid".
  const creditApplied = invoice.creditApplied ?? 0;
  const balanceDue = invoice.balanceDue ?? Math.max(invoice.total - paidAmount - creditApplied, 0);
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
  // A live credit note against this invoice makes the server refuse cancellation, so the
  // button stays visible but disabled with the reason — a silently missing action reads as
  // a bug, and the fix is one the user can actually carry out.
  const blockedByCreditNotes = Boolean(invoice.eligibility?.hasCreditNotes) && !isCancelled;
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
  const actions: ShareAction[] = isCancelled
    ? []
    : [
        { label: 'PDF', icon: FileText, onPress: () => runShare('PDF') },
        // Customerless / no-phone sale: the server refuses the wa.me link, so don't offer it.
        ...(hasWhatsAppPhone(invoice.customerSnapshot)
          ? [{ label: 'WhatsApp', icon: Send, onPress: () => runShare('WhatsApp') }]
          : []),
        { label: 'Email', icon: Mail, onPress: () => { emailForm.reset({ email: invoice.customerSnapshot.email || '' }); setEmailOpen(true); } }
      ];

  const snapshot = invoice.customerSnapshot;
  // A walk-in / cash sale has no Customer row at all — the snapshot carries only the label.
  const isWalkIn = !invoice.customer;
  const customerMetaItems: CustomerMetaItem[] = (
    [
      snapshot.phone ? { key: 'phone', icon: Phone, text: snapshot.phone } : null,
      snapshot.email ? { key: 'email', icon: AtSign, text: snapshot.email, numberOfLines: 1 } : null,
      snapshot.gstNumber ? { key: 'gst', icon: Receipt, text: snapshot.gstNumber } : null,
      snapshot.address ? { key: 'address', icon: MapPin, text: snapshot.address } : null
    ] as (CustomerMetaItem | null)[]
  ).filter((item): item is CustomerMetaItem => item !== null);
  const itemRows: DocumentItemRow[] = invoice.items.map((item, index) => ({
    id: item._id || `${item.name}-${index}`,
    name: item.name,
    meta: `${item.quantity}${item.unit ? ` ${item.unit}` : ''} × ${formatCurrency(item.price)}`,
    total: formatCurrency(item.total)
  }));
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
      <DocumentHeroCard
        title={documentNumberOf(invoice)}
        subtitle={formatDate(invoice.date)}
        status={currentStatus}
        statusIcon={statusGlyphFor(currentStatus)}
        amountLabel={headlineLabel}
        amount={formatCurrency(headlineAmount)}
        amountMeta={headlineMeta}
        amountMuted={isCancelled}
        primaryAction={
          showRecordPayment ? (
            <Button
              mode="contained"
              icon="cash-plus"
              buttonColor={isDark ? colors.primaryFixed : colors.primary}
              textColor="#FFFFFF"
              onPress={() => setPaymentOpen(true)}
              style={documentHeroActionStyles.button}
              contentStyle={documentHeroActionStyles.content}
            >
              Record payment
            </Button>
          ) : null
        }
      />

      {/* Share row sits directly under the summary: the most common follow-up on a settled bill. */}
      {isCancelled ? null : (
        <TourAnchor anchorId={ANCHOR.shareInvoice}>
          <DocumentShareActions actions={actions} busyAction={busyAction} accessibilityLabelPrefix="Share invoice by" />
        </TourAnchor>
      )}

      {isCancelled ? (
        <Section>
          <DocumentNotice icon={Ban} tone={tone} text="This invoice is cancelled and can no longer be shared or sent." />
        </Section>
      ) : null}

      <DocumentCustomerSection
        title="BILLED TO"
        name={snapshot.name}
        hint={isWalkIn ? 'Walk-in sale · no customer account' : 'Customer'}
        metaItems={customerMetaItems}
      />

      <DocumentItemsSection title="ITEMS" items={itemRows} />

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
          {creditApplied > 0 ? <DetailRow label="Credit applied" value={formatCurrency(creditApplied)} /> : null}
          <DetailRow label="Balance due" value={formatCurrency(balanceDue)} emphasise={balanceDue > 0 ? colors.destructive : undefined} />
        </View>
        {/* Spending credit is settlement, not a receipt, so it sits with the payment figures
            rather than in the share row. Hidden entirely when there is no credit to spend. */}
        {canRecordPayment && !isCancelled && balanceDue > 0 && availableCredit > 0 ? (
          <Button
            mode="outlined"
            icon={({ size, color }) => <Wallet size={size} color={color} strokeWidth={2.2} />}
            onPress={() => setApplyCreditOpen(true)}
            style={styles.applyCreditBtn}
          >
            Apply credit · {formatCurrency(availableCredit)} available
          </Button>
        ) : null}
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
      {(canCreateInvoice && !hasPayments) ||
      (canCreateInvoice && !isCancelled && creditableRemaining(invoice) > 0) ||
      (canUpdateInvoice && (canCancel || blockedByCreditNotes)) ||
      (canDeleteInvoice && !isCancelled) ? (
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
          {/* Once money has been received a correction is a credit note, not a reissue —
              which is why this sits beside "Duplicate & correct" rather than replacing it.
              Hidden when the invoice has already been credited in full. */}
          {canCreateInvoice && !isCancelled && creditableRemaining(invoice) > 0 ? (
            <Button
              mode="outlined"
              icon={({ size, color }) => <Undo2 size={size} color={color} strokeWidth={2.2} />}
              onPress={() => navigation.navigate('CreditNoteCreate', { sourceInvoiceId: id })}
              style={styles.footerButton}
            >
              Issue credit note
            </Button>
          ) : null}
          {canUpdateInvoice && (canCancel || blockedByCreditNotes) ? (
            <Button
              mode="outlined"
              textColor={theme.colors.error}
              disabled={!canCancel}
              icon={({ size, color }) => <Ban size={size} color={color} strokeWidth={2.2} />}
              onPress={requestCancel}
              style={[styles.footerButton, { borderColor: alpha(colors.destructive, isDark ? 0.55 : 0.38) }]}
            >
              Cancel
            </Button>
          ) : null}
          {blockedByCreditNotes ? (
            <Text style={[styles.footerNote, { color: theme.colors.onSurfaceVariant }]}>
              Cancel the credit notes raised against this invoice first.
            </Text>
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
      <ApplyCreditSheet
        visible={applyCreditOpen}
        balanceDue={balanceDue}
        availableCredit={availableCredit}
        loading={applyCredit.isPending}
        onClose={() => setApplyCreditOpen(false)}
        onSubmit={(amount) => applyCredit.mutate(amount)}
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
  card: { borderRadius: 20, borderWidth: 1, padding: spacing.cardPadding },
  detailRow: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  detailRows: { gap: 10 },
  detailValue: { ...fontStyles.semiBold, fontSize: 13.5, textAlign: 'right' },
  footerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: spacing.section },
  applyCreditBtn: { borderRadius: radii.input, marginTop: 12 },
  footerButton: { borderRadius: radii.input, flexGrow: 1, flexShrink: 1 },
  footerNote: { ...fontStyles.medium, fontSize: 12, width: '100%' },
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
  paymentHead: { alignItems: 'center', flexDirection: 'row', gap: 10, marginBottom: 14 },
  paymentHeadText: { ...fontStyles.bold, fontSize: 15, letterSpacing: -0.2 },
  paymentHistory: { borderTopWidth: 1, gap: 8, marginTop: 14, paddingTop: 12 },
  paymentHistoryLabel: { ...fontStyles.semiBold, fontSize: 13, textTransform: 'capitalize' },
  paymentIcon: { alignItems: 'center', borderRadius: radii.pill, height: 32, justifyContent: 'center', width: 32 },
  stateCard: { alignItems: 'center', gap: 12, paddingVertical: 32 },
  stateText: { ...fontStyles.medium, fontSize: 13 }
});
