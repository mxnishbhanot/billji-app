import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Text, useTheme } from 'react-native-paper';
import { purchasesApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { useAppDialog } from '@/components/AppDialog';
import { useAppToast } from '@/components/AppToast';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { PurchaseBillSheet } from '@/components/PurchaseBillSheet';
import { PayVendorSheet } from '@/components/PayVendorSheet';
import { Screen } from '@/components/Screen';
import { StatusPill } from '@/components/StatusPill';
import { PERMISSION, usePermissions } from '@/shared/hooks/usePermissions';
import { queryKeys } from '@/shared/query/queryKeys';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import { PurchaseBill } from '@/types';
import { formatCurrency, formatDate } from '@/utils/format';

const PAYMENT_META: Record<PurchaseBill['paymentStatus'], { label: string; tone: string }> = {
  unpaid: { label: 'Unpaid', tone: 'pending' },
  partial: { label: 'Partly paid', tone: 'pending' },
  paid: { label: 'Paid', tone: 'paid' }
};

export function PurchasesScreen() {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const queryClient = useQueryClient();
  const { showDialog } = useAppDialog();
  const { showToast } = useAppToast();
  const { can } = usePermissions();
  const canManage = can(PERMISSION.purchasesManage);

  const [billOpen, setBillOpen] = useState(false);
  const [payingBill, setPayingBill] = useState<PurchaseBill | null>(null);
  const [pendingCancel, setPendingCancel] = useState<PurchaseBill | null>(null);

  const query = useQuery({ queryKey: queryKeys.purchases.list(), queryFn: () => purchasesApi.list() });
  const purchases = query.data ?? [];
  const payable = purchases
    .filter((bill) => bill.status === 'received')
    .reduce((sum, bill) => sum + Number(bill.balanceDue || 0), 0);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.purchases.all });
    // Receiving stock and paying vendors both move numbers the rest of the app shows.
    queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.report.all });
  };

  const cancel = useMutation({
    mutationFn: (id: string) => purchasesApi.cancel(id),
    onSuccess: () => {
      setPendingCancel(null);
      invalidate();
      showToast('Purchase cancelled, stock returned', 'success');
    },
    onError: (error) => {
      setPendingCancel(null);
      showDialog({ title: 'Could not cancel', message: apiErrorMessage(error), tone: 'error' });
    }
  });

  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.08);
  const headerAction = canManage ? (
    <Pressable onPress={() => setBillOpen(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="New purchase bill" style={[styles.headerBtn, { backgroundColor: theme.colors.primary }]}>
      <Feather name="plus" size={18} color="#FFFFFF" strokeWidth={3} />
    </Pressable>
  ) : undefined;

  return (
    <Screen title="Purchases" headerAction={headerAction} contentStyle={styles.screenContent}>
      <View style={[styles.summaryCard, { backgroundColor: alpha(colors.warning, isDark ? 0.14 : 0.07), borderColor: alpha(colors.warning, isDark ? 0.3 : 0.18) }]}>
        <View>
          <Text style={[styles.summaryLabel, { color: theme.colors.onSurfaceVariant }]}>YOU OWE SUPPLIERS</Text>
          <Text style={[styles.summaryValue, { color: colors.warning }]}>{formatCurrency(payable)}</Text>
        </View>
        <Text style={[styles.summaryCount, { color: theme.colors.onSurfaceVariant }]}>{purchases.length} bills</Text>
      </View>

      {query.isLoading ? (
        <ActivityIndicator color={theme.colors.primary} style={styles.loader} />
      ) : purchases.length ? (
        purchases.map((bill) => {
          const cancelled = bill.status === 'cancelled';
          const meta = PAYMENT_META[bill.paymentStatus];
          return (
            <View key={bill._id} style={[styles.card, { backgroundColor: colors.card, borderColor: cardBorder, opacity: cancelled ? 0.6 : 1 }]}>
              <View style={styles.cardHead}>
                <View style={styles.cardText}>
                  <Text numberOfLines={1} style={[styles.cardVendor, { color: theme.colors.onSurface }]}>{bill.vendorSnapshot?.name}</Text>
                  <Text numberOfLines={1} style={[styles.cardMeta, { color: theme.colors.onSurfaceVariant }]}>
                    {bill.billNumber}
                    {bill.vendorBillNumber ? ` · ${bill.vendorBillNumber}` : ''} · {formatDate(bill.date)}
                  </Text>
                </View>
                <View style={styles.cardRight}>
                  <Text style={[styles.cardAmount, { color: theme.colors.onSurface }]}>{formatCurrency(bill.total)}</Text>
                  <StatusPill label={cancelled ? 'Cancelled' : meta.label} tone={cancelled ? 'cancelled' : meta.tone} />
                </View>
              </View>

              {!cancelled && bill.balanceDue > 0 ? (
                <Text style={[styles.dueLine, { color: colors.warning }]}>Due {formatCurrency(bill.balanceDue)}</Text>
              ) : null}

              {canManage && !cancelled ? (
                <View style={[styles.actionRow, { borderTopColor: cardBorder }]}>
                  {bill.balanceDue > 0 ? (
                    <Pressable onPress={() => setPayingBill(bill)} accessibilityRole="button" style={styles.action}>
                      <Feather name="credit-card" size={14} color={theme.colors.primary} />
                      <Text style={[styles.actionLabel, { color: theme.colors.primary }]}>Pay</Text>
                    </Pressable>
                  ) : null}
                  {bill.paidAmount === 0 ? (
                    <Pressable onPress={() => setPendingCancel(bill)} accessibilityRole="button" style={styles.action}>
                      <Feather name="x-circle" size={14} color={colors.destructive} />
                      <Text style={[styles.actionLabel, { color: colors.destructive }]}>Cancel</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })
      ) : (
        <EmptyState
          title="No purchases yet"
          message="Record what you buy from suppliers. Stock goes up automatically, cost prices stay current, and you can see what you still owe."
          actionLabel={canManage ? 'New purchase bill' : undefined}
          onAction={canManage ? () => setBillOpen(true) : undefined}
        />
      )}

      <PurchaseBillSheet
        visible={billOpen}
        onClose={() => setBillOpen(false)}
        onSaved={() => {
          setBillOpen(false);
          invalidate();
          showToast('Purchase recorded, stock updated', 'success');
        }}
      />

      <PayVendorSheet
        visible={Boolean(payingBill)}
        bill={payingBill}
        onClose={() => setPayingBill(null)}
        onPaid={() => {
          setPayingBill(null);
          invalidate();
          showToast('Payment recorded', 'success');
        }}
      />

      <ConfirmDialog
        visible={Boolean(pendingCancel)}
        title="Cancel this purchase?"
        message="The stock received on this bill goes back out of inventory, and what you owe the supplier is cleared."
        confirmLabel="Cancel bill"
        onConfirm={() => pendingCancel && cancel.mutate(pendingCancel._id)}
        onCancel={() => setPendingCancel(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  action: { alignItems: 'center', flexDirection: 'row', gap: 6, paddingVertical: 4 },
  actionLabel: { ...fontStyles.semiBold, fontSize: 13 },
  actionRow: { borderTopWidth: 1, flexDirection: 'row', gap: 20, marginTop: 12, paddingTop: 10 },
  card: { borderRadius: radii.lg, borderWidth: 1, marginBottom: 10, padding: 14 },
  cardAmount: { ...fontStyles.bold, fontSize: 15 },
  cardHead: { flexDirection: 'row', gap: 12 },
  cardMeta: { ...typeScale.caption, fontSize: 12, marginTop: 2 },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  cardText: { flex: 1, minWidth: 0 },
  cardVendor: { ...fontStyles.bold, fontSize: 15 },
  dueLine: { ...fontStyles.semiBold, fontSize: 12, marginTop: 8 },
  headerBtn: { alignItems: 'center', borderRadius: radii.md, height: 40, justifyContent: 'center', width: 40 },
  loader: { marginVertical: 24 },
  screenContent: { paddingTop: 8 },
  summaryCard: { alignItems: 'center', borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14, padding: 16 },
  summaryCount: { ...typeScale.caption, fontSize: 12 },
  summaryLabel: { ...fontStyles.bold, fontSize: 10, letterSpacing: 1 },
  summaryValue: { ...fontStyles.bold, fontSize: 24, letterSpacing: -0.6, marginTop: 4 }
});
