import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  AtSign,
  BadgeCheck,
  Ban,
  CheckCircle2,
  Clock,
  FilePen,
  FileText,
  MapPin,
  Phone,
  Receipt,
  ShoppingBag,
  Truck,
  XCircle
} from 'lucide-react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Button, Text, useTheme } from 'react-native-paper';
import { ordersApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { useAppDialog } from '@/components/AppDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { paymentStatusMeta } from '@/components/StatusPill';
import { shadows } from '@/design-system';
import { CustomerMetaItem, DocumentCustomerSection } from '@/features/documents/components/DocumentCustomerSection';
import { DocumentHeroCard, documentHeroActionStyles } from '@/features/documents/components/DocumentHeroCard';
import { DocumentLinkCard } from '@/features/documents/components/DocumentLinkCard';
import { DocumentNotice } from '@/features/documents/components/DocumentNotice';
import { DocumentItemRow, DocumentItemsSection } from '@/features/documents/components/DocumentItemsSection';
import { DocumentSection, DocumentDetailRow } from '@/features/documents/components/DocumentSection';
import { OrderDetailScreenProps } from '@/navigation/types';
import { PERMISSION, usePermissions } from '@/shared/hooks/usePermissions';
import { queryKeys } from '@/shared/query/queryKeys';
import { alpha, appColors, fontStyles, radii, spacing, statusTone } from '@/theme/theme';
import { InvoicePaymentStatus, OrderStatus } from '@/types';
import { formatCurrency, formatDate } from '@/utils/format';

/**
 * Returns the glyph itself rather than an element: the hero renders it, and picking it inside
 * render would remount the icon every pass. Mirrors the order-status icons the Orders list
 * already uses, in Lucide.
 */
const orderStatusGlyphFor = (status: OrderStatus) =>
  status === 'cancelled' ? XCircle : status === 'fulfilled' ? Truck : status === 'confirmed' ? BadgeCheck : FilePen;

function PaymentGlyph({ status, size, color }: { status: InvoicePaymentStatus; size: number; color: string }) {
  const Icon = status === 'paid' ? CheckCircle2 : status === 'refunded' ? Receipt : Clock;
  return <Icon size={size} color={color} strokeWidth={2.2} />;
}

export function OrderDetailScreen({ route, navigation }: OrderDetailScreenProps) {
  const { id } = route.params;
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const queryClient = useQueryClient();
  const { showDialog } = useAppDialog();
  const { can } = usePermissions();
  const canManage = can(PERMISSION.ordersManage);
  const [cancelVisible, setCancelVisible] = useState(false);

  const orderQuery = useQuery({ queryKey: queryKeys.orders.detail(id), queryFn: () => ordersApi.get(id) });
  const order = orderQuery.data;

  const refreshLists = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
  };

  const generateMutation = useMutation({
    mutationFn: () => ordersApi.generateInvoice(id),
    onSuccess: (invoice) => {
      refreshLists();
      void orderQuery.refetch();
      navigation.navigate('InvoiceDetail', { id: invoice._id });
    },
    onError: (error) => showDialog({ title: 'Could not generate invoice', message: apiErrorMessage(error), tone: 'error' })
  });

  const cancelMutation = useMutation({
    mutationFn: () => ordersApi.cancel(id),
    onSuccess: () => {
      refreshLists();
      void orderQuery.refetch();
    },
    onError: (error) => showDialog({ title: 'Could not cancel order', message: apiErrorMessage(error), tone: 'error' })
  });

  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.06);

  if (orderQuery.isLoading) {
    return (
      <Screen title="Order">
        <View style={[styles.card, styles.stateCard, isDark ? null : shadows.card, { backgroundColor: colors.card, borderColor: cardBorder }]}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={[styles.stateText, { color: theme.colors.onSurfaceVariant }]}>Loading order…</Text>
        </View>
      </Screen>
    );
  }

  if (!order) {
    return (
      <Screen title="Order">
        <EmptyState title="Order not found" message="This order may have been removed." actionLabel="Back" onAction={() => navigation.goBack()} />
      </Screen>
    );
  }

  const tone = statusTone(order.orderStatus, isDark);
  const isCancelled = order.orderStatus === 'cancelled';
  const linkedInvoice = order.linkedInvoice ?? null;
  const invoiced = Boolean(linkedInvoice);
  const snapshot = order.customerSnapshot;

  // An order is not a receivable: the money only becomes owed once it has produced an
  // invoice. The server derives paidAmount/balanceDue from the order's live invoices
  // (Payment -> Invoice -> Order), falling back to the order total when none exists —
  // so the payment view is only shown once there is an invoice standing behind it.
  const showPayment = invoiced;
  const paymentMeta = paymentStatusMeta(order.paymentStatus);

  const headlineMeta = isCancelled
    ? 'Cancelled · no invoice was issued'
    : linkedInvoice
      ? `Invoiced as ${linkedInvoice.invoiceNumber}`
      : 'Not yet invoiced';

  const customerMetaItems: CustomerMetaItem[] = (
    [
      snapshot.phone ? { key: 'phone', icon: Phone, text: `${snapshot.countryCode || '+91'} ${snapshot.phone}` } : null,
      snapshot.email ? { key: 'email', icon: AtSign, text: snapshot.email, numberOfLines: 1 } : null,
      snapshot.gstNumber ? { key: 'gst', icon: Receipt, text: snapshot.gstNumber } : null,
      snapshot.address ? { key: 'address', icon: MapPin, text: snapshot.address } : null
    ] as (CustomerMetaItem | null)[]
  ).filter((item): item is CustomerMetaItem => item !== null);

  const itemRows: DocumentItemRow[] = order.items.map((item, index) => ({
    id: item._id || `${item.name}-${index}`,
    name: item.name,
    meta: `${item.quantity}${item.unit ? ` ${item.unit}` : ''} × ${formatCurrency(item.price)}`,
    total: formatCurrency(item.quantity * item.price)
  }));

  return (
    <Screen title={order.orderNumber}>
      {/* Summary: which order, when, what state, and what it is worth — in one glance. */}
      <DocumentHeroCard
        eyebrow="Sales order"
        eyebrowIcon={ShoppingBag}
        title={order.orderNumber}
        subtitle={formatDate(order.date)}
        status={order.orderStatus}
        statusIcon={orderStatusGlyphFor(order.orderStatus)}
        amountLabel="Order total"
        amount={formatCurrency(order.total)}
        amountMeta={headlineMeta}
        amountMuted={isCancelled}
        primaryAction={
          canManage && !invoiced && !isCancelled ? (
            <Button
              mode="contained"
              icon={({ size, color }) => <FileText size={size} color={color} strokeWidth={2.2} />}
              buttonColor={isDark ? colors.primaryFixed : colors.primary}
              textColor="#FFFFFF"
              loading={generateMutation.isPending}
              onPress={() => generateMutation.mutate()}
              style={documentHeroActionStyles.button}
              contentStyle={documentHeroActionStyles.content}
            >
              Generate invoice
            </Button>
          ) : null
        }
      />

      {isCancelled ? (
        <DocumentSection>
          <DocumentNotice icon={Ban} tone={tone} text="This order was cancelled and can no longer be invoiced." />
        </DocumentSection>
      ) : null}

      {/* The invoice is the authoritative document once it exists — send, print and
          collect all live there, so the order hands the user straight over to it. */}
      {linkedInvoice ? (
        <DocumentLinkCard
          label="INVOICE"
          icon={FileText}
          title={linkedInvoice.invoiceNumber}
          hint="Record payment, send or share"
          accessibilityLabel={`View invoice ${linkedInvoice.invoiceNumber}`}
          onPress={() => navigation.navigate('InvoiceDetail', { id: linkedInvoice.id })}
        />
      ) : null}

      <DocumentCustomerSection title="ORDERED BY" name={snapshot.name} hint="Customer" metaItems={customerMetaItems} />

      <DocumentItemsSection title="ITEMS" items={itemRows} />

      <DocumentSection title="ORDER SUMMARY">
        <View style={styles.detailRows}>
          <DocumentDetailRow label="Subtotal" value={formatCurrency(order.subtotal)} />
          {/* Zero-value rows are noise on a simple order — only what applies is printed. */}
          {order.discount.amount > 0 ? <DocumentDetailRow label="Discount" value={`-${formatCurrency(order.discount.amount)}`} /> : null}
          {order.tax.amount > 0 ? <DocumentDetailRow label="Tax" value={formatCurrency(order.tax.amount)} /> : null}
        </View>
        <View style={[styles.grandTotal, { borderTopColor: cardBorder }]}>
          <Text style={[styles.grandTotalLabel, { color: theme.colors.onSurface }]}>Order total</Text>
          <Text style={[styles.grandTotalValue, { color: theme.colors.onSurface }]}>{formatCurrency(order.total)}</Text>
        </View>
      </DocumentSection>

      {showPayment ? (
        <DocumentSection title="PAYMENT">
          <View style={styles.paymentHead}>
            <View style={[styles.paymentIcon, { backgroundColor: statusTone(order.paymentStatus, isDark).background }]}>
              <PaymentGlyph status={order.paymentStatus} size={16} color={statusTone(order.paymentStatus, isDark).foreground} />
            </View>
            <Text style={[styles.paymentHeadText, { color: theme.colors.onSurface }]}>{paymentMeta?.label ?? 'Unpaid'}</Text>
          </View>
          <View style={styles.detailRows}>
            <DocumentDetailRow label="Paid" value={formatCurrency(order.paidAmount)} />
            <DocumentDetailRow
              label="Balance due"
              value={formatCurrency(order.balanceDue)}
              emphasise={order.balanceDue > 0 ? colors.destructive : undefined}
            />
          </View>
          <Text style={[styles.paymentHint, { color: theme.colors.onSurfaceVariant }]}>
            Payments are recorded on the invoice; this reflects what has been received against it.
          </Text>
        </DocumentSection>
      ) : null}

      {order.notes ? (
        <DocumentSection title="NOTES">
          <Text style={[styles.notesText, { color: theme.colors.onSurfaceVariant }]}>{order.notes}</Text>
        </DocumentSection>
      ) : null}

      {/* Tertiary: cancellation is only possible while the order has produced no invoice,
          so it stays quiet at the end of the document. */}
      {canManage && !invoiced && !isCancelled ? (
        <View style={styles.footerActions}>
          <Button
            mode="outlined"
            textColor={theme.colors.error}
            icon={({ size, color }) => <Ban size={size} color={color} strokeWidth={2.2} />}
            loading={cancelMutation.isPending}
            onPress={() => setCancelVisible(true)}
            style={[styles.footerButton, { borderColor: alpha(colors.destructive, isDark ? 0.55 : 0.38) }]}
          >
            Cancel order
          </Button>
        </View>
      ) : null}

      <ConfirmDialog
        visible={cancelVisible}
        title="Cancel order?"
        message="The order will be marked cancelled. This cannot be undone."
        confirmLabel="Cancel order"
        onCancel={() => setCancelVisible(false)}
        onConfirm={() => {
          setCancelVisible(false);
          cancelMutation.mutate();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: 1, padding: spacing.cardPadding },
  detailRows: { gap: 10 },
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
  notesText: { ...fontStyles.medium, fontSize: 13, lineHeight: 19 },
  paymentHead: { alignItems: 'center', flexDirection: 'row', gap: 10, marginBottom: 14 },
  paymentHeadText: { ...fontStyles.bold, fontSize: 15, letterSpacing: -0.2 },
  paymentHint: { ...fontStyles.medium, fontSize: 12, lineHeight: 17, marginTop: 12 },
  paymentIcon: { alignItems: 'center', borderRadius: radii.pill, height: 32, justifyContent: 'center', width: 32 },
  stateCard: { alignItems: 'center', gap: 12, paddingVertical: 32 },
  stateText: { ...fontStyles.medium, fontSize: 13 }
});
