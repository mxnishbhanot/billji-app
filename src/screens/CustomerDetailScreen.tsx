import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Text, useTheme } from 'react-native-paper';
import { paymentsApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { useAppDialog } from '@/components/AppDialog';
import { CollectDuesSheet } from '@/components/CollectDuesSheet';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { StatCard } from '@/components/StatCard';
import { StatusPill } from '@/components/StatusPill';
import { CustomerDetailScreenProps } from '@/navigation/types';
import { PERMISSION, usePermissions } from '@/shared/hooks/usePermissions';
import { queryKeys } from '@/shared/query/queryKeys';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import { CustomerOutstanding, Payment, PaymentMethod, PaymentRecordStatus } from '@/types';
import { formatCurrency, formatDate } from '@/utils/format';

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  upi: 'UPI',
  bank_transfer: 'Bank transfer',
  card: 'Card',
  cheque: 'Cheque',
  wallet: 'Wallet',
  other: 'Other'
};
const PAYMENT_STATUS_META: Record<PaymentRecordStatus, { label: string; tone: string }> = {
  completed: { label: 'Completed', tone: 'paid' },
  pending: { label: 'Pending', tone: 'pending' },
  failed: { label: 'Failed', tone: 'cancelled' },
  refunded: { label: 'Refunded', tone: 'refunded' }
};

export function CustomerDetailScreen({ route }: CustomerDetailScreenProps) {
  const { customer } = route.params;
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const queryClient = useQueryClient();
  const { showDialog } = useAppDialog();
  const { can } = usePermissions();
  const canRecordPayment = can(PERMISSION.paymentsRecord);
  const [collectVisible, setCollectVisible] = useState(false);
  const query = useQuery({
    queryKey: queryKeys.payments.customer(customer._id),
    queryFn: () => paymentsApi.list({ customerId: customer._id })
  });
  const payments = useMemo(() => query.data ?? [], [query.data]);

  const outstandingQuery = useQuery({
    queryKey: queryKeys.payments.customerOutstanding(customer._id),
    queryFn: () => paymentsApi.customerOutstanding(customer._id),
    enabled: canRecordPayment
  });
  const outstanding: CustomerOutstanding = outstandingQuery.data ?? { invoices: [], totalOutstanding: 0 };

  const collectDues = useMutation({
    mutationFn: (payload: { amount: number; method: PaymentMethod; invoiceIds: string[]; allowCredit: boolean; reference?: string; notes?: string }) =>
      paymentsApi.recordCustomerPayment(customer._id, payload),
    onSuccess: () => {
      setCollectVisible(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.payments.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.payments.customer(customer._id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.payments.customerOutstanding(customer._id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.report.all });
    },
    onError: (error) => showDialog({ title: 'Could not record payment', message: apiErrorMessage(error), tone: 'error' })
  });

  const canCollect = canRecordPayment && outstanding.totalOutstanding > 0;

  const contactRows = [
    { icon: 'phone' as const, value: `${customer.countryCode || '+91'} ${customer.phone}` },
    customer.email ? { icon: 'mail' as const, value: customer.email } : null,
    customer.address ? { icon: 'map-pin' as const, value: customer.address } : null,
    customer.gstNumber ? { icon: 'hash' as const, value: `GST ${customer.gstNumber}` } : null
  ].filter(Boolean) as { icon: 'phone' | 'mail' | 'map-pin' | 'hash'; value: string }[];

  return (
    <Screen title="Customer">
      <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08) }]}>
        <Text style={[styles.name, { color: theme.colors.onSurface }]}>{customer.name}</Text>
        <View style={styles.contactList}>
          {contactRows.map((row) => (
            <View key={row.icon} style={styles.contactRow}>
              <Feather name={row.icon} size={14} color={theme.colors.onSurfaceVariant} />
              <Text numberOfLines={1} style={[styles.contactText, { color: theme.colors.onSurfaceVariant }]}>{row.value}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.statRow}>
        <StatCard label="Outstanding" value={formatCurrency(customer.outstandingDues)} hint="Amount due" tone="danger" icon="alert-circle-outline" />
        <StatCard label="Credit" value={formatCurrency(customer.creditBalance)} hint="Advance balance" tone="success" icon="wallet-outline" />
      </View>

      {canCollect ? (
        <Pressable
          onPress={() => setCollectVisible(true)}
          style={({ pressed }) => [styles.collectBtn, { backgroundColor: pressed ? colors.primaryStrong : theme.colors.primary }]}
        >
          <Feather name="download" size={16} color="#FFFFFF" />
          <Text style={styles.collectBtnLabel}>Collect dues</Text>
        </Pressable>
      ) : null}

      <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Payments</Text>
      {query.isLoading ? (
        <ActivityIndicator color={theme.colors.primary} style={styles.loader} />
      ) : payments.length ? (
        payments.map((item: Payment) => {
          const meta = PAYMENT_STATUS_META[item.status] || { label: item.status, tone: '' };
          const isRefund = item.type === 'refund';
          const accent = isRefund ? colors.destructive : colors.accent;
          return (
            <View key={item._id} style={[styles.paymentRow, { backgroundColor: colors.card, borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08) }]}>
              <View style={[styles.iconTile, { backgroundColor: alpha(accent, isDark ? 0.2 : 0.12) }]}>
                <Feather name={isRefund ? 'arrow-up-right' : 'arrow-down-left'} size={15} color={accent} />
              </View>
              <View style={styles.flex1}>
                <Text style={[styles.amount, { color: theme.colors.onSurface }]}>{formatCurrency(item.amount)}</Text>
                <Text numberOfLines={1} style={[styles.meta, { color: theme.colors.onSurfaceVariant }]}>
                  {METHOD_LABELS[item.method] || item.method}  ·  {formatDate(item.receivedAt)}
                </Text>
              </View>
              <StatusPill label={meta.label} tone={meta.tone} />
            </View>
          );
        })
      ) : (
        <EmptyState title="No payments" message="Payments recorded against this customer will show here." />
      )}

      <CollectDuesSheet
        visible={collectVisible}
        outstanding={outstanding}
        loading={collectDues.isPending}
        onClose={() => setCollectVisible(false)}
        onSubmit={(payload) => collectDues.mutate(payload)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  amount: { ...fontStyles.bold, fontSize: 15 },
  collectBtn: { alignItems: 'center', borderRadius: radii.input, flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 16, paddingVertical: 13 },
  collectBtnLabel: { ...fontStyles.bold, color: '#FFFFFF', fontSize: 14, letterSpacing: 0.2 },
  contactList: { gap: 8, marginTop: 12 },
  contactRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  contactText: { ...typeScale.caption, flex: 1, fontSize: 13 },
  flex1: { flex: 1, minWidth: 0 },
  iconTile: { alignItems: 'center', borderRadius: radii.md, height: 38, justifyContent: 'center', width: 38 },
  loader: { marginVertical: 24 },
  meta: { ...typeScale.caption, fontSize: 12, marginTop: 2 },
  name: { ...fontStyles.bold, fontSize: 20, letterSpacing: -0.4 },
  paymentRow: { alignItems: 'center', borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', gap: 12, marginBottom: 10, padding: 14 },
  profileCard: { borderRadius: radii.lg, borderWidth: 1, marginBottom: 16, padding: 18 },
  sectionTitle: { ...fontStyles.bold, fontSize: 16, marginBottom: 12, marginTop: 4 },
  statRow: { flexDirection: 'row', marginBottom: 16, marginHorizontal: -6 }
});
