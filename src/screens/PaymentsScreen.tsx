import { useMemo } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Text, useTheme } from 'react-native-paper';
import { paymentsApi } from '@/api/endpoints';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { StatusPill } from '@/components/StatusPill';
import { queryKeys } from '@/shared/query/queryKeys';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import { Payment, PaymentMethod, PaymentRecordStatus } from '@/types';
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

export function PaymentsScreen() {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const query = useQuery({ queryKey: queryKeys.payments.all, queryFn: () => paymentsApi.list() });
  const payments = useMemo(() => query.data ?? [], [query.data]);
  const totalReceived = useMemo(
    () => payments.filter((p) => p.type === 'receipt' && p.status === 'completed').reduce((sum, p) => sum + (p.amount || 0), 0),
    [payments]
  );

  const renderRow = ({ item }: { item: Payment }) => {
    const meta = PAYMENT_STATUS_META[item.status] || { label: item.status, tone: '' };
    const isRefund = item.type === 'refund';
    const accent = isRefund ? colors.destructive : colors.accent;
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08), shadowColor: isDark ? '#000000' : colors.primaryStrong }]}>
        <View style={[styles.iconTile, { backgroundColor: alpha(accent, isDark ? 0.2 : 0.12) }]}>
          <Feather name={isRefund ? 'arrow-up-right' : 'arrow-down-left'} size={16} color={accent} />
        </View>
        <View style={styles.flex1}>
          <Text numberOfLines={1} style={[styles.amount, { color: theme.colors.onSurface }]}>{formatCurrency(item.amount)}</Text>
          <Text numberOfLines={1} style={[styles.meta, { color: theme.colors.onSurfaceVariant }]}>
            {METHOD_LABELS[item.method] || item.method}{item.reference ? `  ·  ${item.reference}` : ''}
          </Text>
        </View>
        <View style={styles.rightCol}>
          <StatusPill label={meta.label} tone={meta.tone} />
          <Text style={[styles.date, { color: theme.colors.onSurfaceVariant }]}>{formatDate(item.receivedAt)}</Text>
        </View>
      </View>
    );
  };

  return (
    <Screen title="Payments" scroll={false} contentStyle={styles.screenContent}>
      {payments.length ? (
        <View style={[styles.summaryCard, { backgroundColor: alpha(colors.accent, isDark ? 0.16 : 0.1), borderColor: alpha(colors.accent, isDark ? 0.3 : 0.22) }]}>
          <Text style={[styles.summaryLabel, { color: colors.accent }]}>Total received</Text>
          <Text style={[styles.summaryValue, { color: theme.colors.onSurface }]}>{formatCurrency(totalReceived)}</Text>
        </View>
      ) : null}
      <FlatList
        data={payments}
        keyExtractor={(item) => item._id}
        style={styles.list}
        contentContainerStyle={[styles.listContent, !payments.length && styles.emptyListContent]}
        showsVerticalScrollIndicator={false}
        refreshing={query.isRefetching}
        onRefresh={() => query.refetch()}
        removeClippedSubviews
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        ListEmptyComponent={query.isLoading ? <ActivityIndicator color={theme.colors.primary} style={styles.emptyLoader} /> : <EmptyState title="No payments yet" message="Record a payment from an invoice to see it here." />}
        renderItem={renderRow}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  amount: { ...fontStyles.bold, fontSize: 16, letterSpacing: -0.3 },
  card: {
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    elevation: 2,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
    padding: 14,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16
  },
  date: { ...typeScale.smallCaption, fontSize: 11, marginTop: 4 },
  emptyListContent: { flexGrow: 1 },
  emptyLoader: { marginTop: 40 },
  flex1: { flex: 1, minWidth: 0 },
  iconTile: { alignItems: 'center', borderRadius: radii.md, height: 40, justifyContent: 'center', width: 40 },
  list: { flex: 1 },
  listContent: { paddingBottom: 24 },
  meta: { ...typeScale.caption, fontSize: 12, marginTop: 2 },
  rightCol: { alignItems: 'flex-end' },
  screenContent: { flex: 1 },
  summaryCard: { borderRadius: radii.lg, borderWidth: 1, marginBottom: 16, paddingHorizontal: 16, paddingVertical: 14 },
  summaryLabel: { ...typeScale.labelSm, fontSize: 12 },
  summaryValue: { ...fontStyles.bold, fontSize: 24, letterSpacing: -0.4, marginTop: 4 }
});
