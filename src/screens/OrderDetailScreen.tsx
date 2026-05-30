import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Button, Text, useTheme } from 'react-native-paper';
import { ordersApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { useAppDialog } from '@/components/AppDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { StatusPill, paymentStatusMeta } from '@/components/StatusPill';
import { OrderDetailScreenProps } from '@/navigation/types';
import { PERMISSION, usePermissions } from '@/shared/hooks/usePermissions';
import { queryKeys } from '@/shared/query/queryKeys';
import { alpha, appColors, fontStyles, radii, statusTone, typeScale } from '@/theme/theme';
import { formatCurrency, formatDate } from '@/utils/format';

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

  if (orderQuery.isLoading) {
    return (
      <Screen title="Order">
        <ActivityIndicator color={theme.colors.primary} style={styles.loader} />
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

  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.08);
  const subSurface = isDark ? colors.surface : alpha(colors.primary, 0.04);
  const tone = statusTone(order.orderStatus, isDark);
  const paymentMeta = paymentStatusMeta(order.paymentStatus);
  const isCancelled = order.orderStatus === 'cancelled';
  const invoiced = Boolean(order.linkedInvoice);

  return (
    <Screen title={order.orderNumber}>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: cardBorder }]}>
        <View style={styles.headRow}>
          <View style={styles.flex}>
            <Text style={[styles.customerName, { color: theme.colors.onSurface }]}>{order.customerSnapshot.name}</Text>
            <Text style={[styles.meta, { color: theme.colors.onSurfaceVariant }]}>{order.customerSnapshot.countryCode || '+91'} {order.customerSnapshot.phone}</Text>
            <Text style={[styles.meta, { color: theme.colors.onSurfaceVariant }]}>{formatDate(order.date)}</Text>
          </View>
          <Text style={[styles.amount, { color: theme.colors.primary }]}>{formatCurrency(order.total)}</Text>
        </View>
        <View style={styles.pillRow}>
          <View style={[styles.statusPill, { backgroundColor: tone.background, borderColor: tone.border }]}>
            <Text style={[styles.statusText, { color: tone.foreground }]}>{order.orderStatus}</Text>
          </View>
          {paymentMeta ? <StatusPill label={paymentMeta.label} tone={paymentMeta.tone} /> : null}
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Items</Text>
        {order.items.map((item, index) => (
          <View key={`${item.name}-${index}`} style={[styles.itemRow, { borderColor: cardBorder }]}>
            <View style={styles.flex}>
              <Text style={[styles.itemName, { color: theme.colors.onSurface }]}>{item.name}</Text>
              <Text style={[styles.meta, { color: theme.colors.onSurfaceVariant }]}>{item.quantity} x {formatCurrency(item.price)}</Text>
            </View>
            <Text style={[styles.itemTotal, { color: theme.colors.onSurface }]}>{formatCurrency(item.quantity * item.price)}</Text>
          </View>
        ))}
        <View style={[styles.totalsPanel, { backgroundColor: subSurface, borderColor: cardBorder }]}>
          <Row label="Subtotal" value={formatCurrency(order.subtotal)} colors={theme.colors} />
          <Row label="Discount" value={`-${formatCurrency(order.discount.amount)}`} colors={theme.colors} />
          <Row label="Tax" value={formatCurrency(order.tax.amount)} colors={theme.colors} />
          <View style={[styles.grandRow, { borderColor: cardBorder }]}>
            <Text style={[styles.grandLabel, { color: theme.colors.onSurface }]}>Total</Text>
            <Text style={[styles.grandValue, { color: theme.colors.primary }]}>{formatCurrency(order.total)}</Text>
          </View>
          <Row label="Paid" value={formatCurrency(order.paidAmount)} colors={theme.colors} />
          <Row label="Balance due" value={formatCurrency(order.balanceDue)} colors={theme.colors} />
        </View>
        {order.notes ? <Text style={[styles.notes, { color: theme.colors.onSurfaceVariant }]}>{order.notes}</Text> : null}
      </View>

      {invoiced && order.linkedInvoice ? (
        <Pressable
          onPress={() => navigation.navigate('InvoiceDetail', { id: order.linkedInvoice!.id })}
          style={({ pressed }) => [styles.invoiceLink, { backgroundColor: colors.card, borderColor: cardBorder, opacity: pressed ? 0.94 : 1 }]}
        >
          <MaterialCommunityIcons name="file-document-check-outline" size={20} color={theme.colors.primary} />
          <View style={styles.flex}>
            <Text style={[styles.invoiceLinkTitle, { color: theme.colors.onSurface }]}>Invoice {order.linkedInvoice.invoiceNumber}</Text>
            <Text style={[styles.meta, { color: theme.colors.onSurfaceVariant }]}>View invoice, record payment, or send</Text>
          </View>
          <Feather name="chevron-right" size={18} color={theme.colors.primary} />
        </Pressable>
      ) : null}

      {canManage && !invoiced && !isCancelled ? (
        <Button
          mode="contained"
          loading={generateMutation.isPending}
          onPress={() => generateMutation.mutate()}
          style={styles.primaryAction}
          contentStyle={styles.actionContent}
          labelStyle={styles.actionLabel}
        >
          Generate invoice
        </Button>
      ) : null}

      {canManage && !invoiced && !isCancelled ? (
        <Button
          mode="outlined"
          textColor={colors.destructive}
          loading={cancelMutation.isPending}
          onPress={() => setCancelVisible(true)}
          style={styles.secondaryAction}
        >
          Cancel order
        </Button>
      ) : null}

      {isCancelled ? (
        <Text style={[styles.cancelledNote, { color: theme.colors.onSurfaceVariant }]}>This order was cancelled.</Text>
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

function Row({ label, value, colors }: { label: string; value: string; colors: { onSurface: string; onSurfaceVariant: string } }) {
  return (
    <View style={styles.totalRow}>
      <Text style={[styles.totalLabel, { color: colors.onSurfaceVariant }]}>{label}</Text>
      <Text style={[styles.totalValue, { color: colors.onSurface }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  actionContent: { paddingVertical: 6 },
  actionLabel: { ...fontStyles.bold, fontSize: 14, letterSpacing: 0.2 },
  amount: { ...fontStyles.bold, fontSize: 20, letterSpacing: -0.4 },
  cancelledNote: { ...typeScale.caption, marginBottom: 18, textAlign: 'center' },
  card: { borderRadius: radii.lg, borderWidth: 1, marginBottom: 16, padding: 16 },
  customerName: { ...fontStyles.bold, fontSize: 17 },
  flex: { flex: 1, minWidth: 0 },
  grandLabel: { ...fontStyles.bold, fontSize: 15 },
  grandRow: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingTop: 10 },
  grandValue: { ...fontStyles.bold, fontSize: 20, letterSpacing: -0.4 },
  headRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  invoiceLink: { alignItems: 'center', borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', gap: 12, marginBottom: 16, padding: 16 },
  invoiceLinkTitle: { ...fontStyles.bold, fontSize: 14 },
  itemName: { ...fontStyles.semiBold, fontSize: 14 },
  itemRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 12, justifyContent: 'space-between', paddingVertical: 10 },
  itemTotal: { ...fontStyles.bold, fontSize: 14 },
  loader: { marginTop: 48 },
  meta: { ...typeScale.caption, fontSize: 12, marginTop: 2 },
  notes: { ...typeScale.caption, fontSize: 12, marginTop: 12 },
  pillRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  primaryAction: { borderRadius: radii.input, marginBottom: 12 },
  secondaryAction: { borderRadius: radii.input, marginBottom: 18 },
  sectionTitle: { ...fontStyles.bold, fontSize: 16, marginBottom: 8 },
  statusPill: { alignSelf: 'flex-start', borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 4 },
  statusText: { ...fontStyles.semiBold, fontSize: 11, letterSpacing: 0.4, textTransform: 'capitalize' },
  totalLabel: { ...typeScale.bodyPrimary, fontSize: 14 },
  totalRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  totalsPanel: { borderRadius: radii.md, borderWidth: 1, gap: 8, marginTop: 14, padding: 14 },
  totalValue: { ...fontStyles.semiBold, fontSize: 14 }
});
