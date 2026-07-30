import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Text, useTheme } from 'react-native-paper';
import { expensesApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { useAppDialog } from '@/components/AppDialog';
import { useAppToast } from '@/components/AppToast';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { ExpenseFormSheet } from '@/components/ExpenseFormSheet';
import { Screen } from '@/components/Screen';
import { EXPENSE_CATEGORY_LABELS, MONTH_RANGE_PRESETS } from '@/constants/expenses';
import { ExpensesScreenProps } from '@/navigation/types';
import { PERMISSION, usePermissions } from '@/shared/hooks/usePermissions';
import { queryKeys } from '@/shared/query/queryKeys';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import { Expense, ExpensePayload } from '@/types';
import { formatCurrency, formatDate } from '@/utils/format';

export function ExpensesScreen({ navigation }: ExpensesScreenProps) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const queryClient = useQueryClient();
  const { showDialog } = useAppDialog();
  const { showToast } = useAppToast();
  const { can } = usePermissions();
  const canManage = can(PERMISSION.expensesManage);

  const [rangeKey, setRangeKey] = useState(MONTH_RANGE_PRESETS[0].key);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Expense | null>(null);

  const range = useMemo(() => MONTH_RANGE_PRESETS.find((item) => item.key === rangeKey)!.resolve(), [rangeKey]);
  const params = useMemo(() => ({ from: range.from, to: range.to }), [range]);

  const query = useQuery({
    queryKey: queryKeys.expenses.list(params),
    queryFn: () => expensesApi.list(params)
  });
  const expenses = query.data?.expenses ?? [];
  const summary = query.data?.summary;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
    // Reports carry net profit, so they are stale the moment an expense moves.
    queryClient.invalidateQueries({ queryKey: queryKeys.report.all });
  };

  const save = useMutation({
    mutationFn: (payload: ExpensePayload) => (editing ? expensesApi.update(editing._id, payload) : expensesApi.create(payload)),
    onSuccess: () => {
      invalidate();
      setFormOpen(false);
      setEditing(null);
      showToast(editing ? 'Expense updated' : 'Expense recorded', 'success');
    },
    onError: (error) => showDialog({ title: 'Could not save expense', message: apiErrorMessage(error), tone: 'error' })
  });

  const remove = useMutation({
    mutationFn: (id: string) => expensesApi.remove(id),
    onSuccess: () => {
      setPendingDelete(null);
      invalidate();
      showToast('Expense deleted', 'success');
    },
    onError: (error) => {
      setPendingDelete(null);
      showDialog({ title: 'Could not delete expense', message: apiErrorMessage(error), tone: 'error' });
    }
  });

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (expense: Expense) => {
    setEditing(expense);
    setFormOpen(true);
  };

  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.08);
  const headerAction = canManage ? (
    <Pressable onPress={openNew} hitSlop={8} accessibilityRole="button" accessibilityLabel="Record expense" style={[styles.headerBtn, { backgroundColor: theme.colors.primary }]}>
      <Feather name="plus" size={18} color="#FFFFFF" strokeWidth={3} />
    </Pressable>
  ) : undefined;

  return (
    <Screen title="Expenses" headerAction={headerAction} contentStyle={styles.screenContent}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rangeRow}>
        {MONTH_RANGE_PRESETS.map((preset) => {
          const active = preset.key === rangeKey;
          return (
            <Pressable
              key={preset.key}
              onPress={() => setRangeKey(preset.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.rangeChip, { backgroundColor: active ? theme.colors.primary : colors.card, borderColor: active ? theme.colors.primary : cardBorder }]}
            >
              <Text style={[styles.rangeLabel, { color: active ? '#FFFFFF' : theme.colors.onSurface }]}>{preset.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Buying stock is not an expense — it belongs on a supplier bill, where it also
          updates inventory. Point people there rather than letting them log it twice. */}
      {canManage ? (
        <Pressable
          onPress={() => navigation.navigate('Purchases')}
          accessibilityRole="button"
          style={({ pressed }) => [styles.purchaseLink, { backgroundColor: colors.card, borderColor: cardBorder, opacity: pressed ? 0.9 : 1 }]}
        >
          <Feather name="package" size={15} color={theme.colors.primary} />
          <Text style={[styles.purchaseLinkText, { color: theme.colors.onSurface }]}>Buying stock? Record a supplier bill</Text>
          <Feather name="chevron-right" size={15} color={theme.colors.onSurfaceVariant} />
        </Pressable>
      ) : null}

      <View style={[styles.totalCard, { backgroundColor: alpha(colors.warning, isDark ? 0.14 : 0.07), borderColor: alpha(colors.warning, isDark ? 0.3 : 0.18) }]}>
        <View>
          <Text style={[styles.totalLabel, { color: theme.colors.onSurfaceVariant }]}>SPENT</Text>
          <Text style={[styles.totalValue, { color: colors.warning }]}>{formatCurrency(summary?.total ?? 0)}</Text>
        </View>
        <Text style={[styles.totalCount, { color: theme.colors.onSurfaceVariant }]}>
          {summary?.count ?? 0} entr{(summary?.count ?? 0) === 1 ? 'y' : 'ies'}
        </Text>
      </View>

      {summary?.byCategory?.length ? (
        <View style={styles.categoryRow}>
          {summary.byCategory.slice(0, 4).map((row) => (
            <View key={row.category} style={[styles.categoryChip, { backgroundColor: colors.card, borderColor: cardBorder }]}>
              <Text style={[styles.categoryName, { color: theme.colors.onSurfaceVariant }]}>{EXPENSE_CATEGORY_LABELS[row.category]}</Text>
              <Text style={[styles.categoryAmount, { color: theme.colors.onSurface }]}>{formatCurrency(row.total)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {query.isLoading ? (
        <ActivityIndicator color={theme.colors.primary} style={styles.loader} />
      ) : expenses.length ? (
        expenses.map((expense) => (
          <Pressable
            key={expense._id}
            onPress={() => canManage && openEdit(expense)}
            onLongPress={() => canManage && setPendingDelete(expense)}
            accessibilityRole="button"
            accessibilityLabel={`${EXPENSE_CATEGORY_LABELS[expense.category]} ${formatCurrency(expense.total)}`}
            style={({ pressed }) => [styles.row, { backgroundColor: colors.card, borderColor: cardBorder, opacity: pressed ? 0.92 : 1 }]}
          >
            <View style={[styles.rowIcon, { backgroundColor: alpha(colors.warning, isDark ? 0.2 : 0.12) }]}>
              <Feather name="arrow-up-right" size={15} color={colors.warning} />
            </View>
            <View style={styles.rowText}>
              <Text numberOfLines={1} style={[styles.rowTitle, { color: theme.colors.onSurface }]}>
                {expense.vendorName || EXPENSE_CATEGORY_LABELS[expense.category]}
              </Text>
              <Text numberOfLines={1} style={[styles.rowMeta, { color: theme.colors.onSurfaceVariant }]}>
                {EXPENSE_CATEGORY_LABELS[expense.category]} · {formatDate(expense.date)}
              </Text>
            </View>
            <Text style={[styles.rowAmount, { color: theme.colors.onSurface }]}>{formatCurrency(expense.total)}</Text>
          </Pressable>
        ))
      ) : (
        <EmptyState
          title="No expenses recorded"
          message="Log rent, salaries, transport and supplies here. They come off your sales to show real profit in Reports."
          actionLabel={canManage ? 'Record expense' : undefined}
          onAction={canManage ? openNew : undefined}
        />
      )}

      {expenses.length && canManage ? (
        <Text style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}>Tap to edit · long-press to delete</Text>
      ) : null}

      <ExpenseFormSheet
        visible={formOpen}
        expense={editing}
        saving={save.isPending}
        onSubmit={(payload) => save.mutate(payload)}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />

      <ConfirmDialog
        visible={Boolean(pendingDelete)}
        title="Delete this expense?"
        message="It stops counting towards your profit. The entry is kept in the ledger with a matching reversal."
        confirmLabel="Delete"
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete._id)}
        onCancel={() => setPendingDelete(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  categoryAmount: { ...fontStyles.bold, fontSize: 13, marginTop: 2 },
  categoryChip: { borderRadius: radii.md, borderWidth: 1, flexGrow: 1, minWidth: '46%', paddingHorizontal: 12, paddingVertical: 8 },
  categoryName: { ...typeScale.caption, fontSize: 11 },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  headerBtn: { alignItems: 'center', borderRadius: radii.md, height: 40, justifyContent: 'center', width: 40 },
  hint: { ...typeScale.caption, fontSize: 12, marginTop: 8, textAlign: 'center' },
  loader: { marginVertical: 24 },
  purchaseLink: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: 10, marginBottom: 12, paddingHorizontal: 14, paddingVertical: 12 },
  purchaseLinkText: { ...fontStyles.semiBold, flex: 1, fontSize: 13 },
  rangeChip: { borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  rangeLabel: { ...fontStyles.semiBold, fontSize: 12 },
  rangeRow: { gap: 8, paddingBottom: 14, paddingRight: 4 },
  row: { alignItems: 'center', borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', gap: 12, marginBottom: 10, padding: 14 },
  rowAmount: { ...fontStyles.bold, fontSize: 15 },
  rowIcon: { alignItems: 'center', borderRadius: radii.md, height: 36, justifyContent: 'center', width: 36 },
  rowMeta: { ...typeScale.caption, fontSize: 12, marginTop: 2 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { ...fontStyles.bold, fontSize: 14 },
  screenContent: { paddingTop: 8 },
  totalCard: { alignItems: 'center', borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14, padding: 16 },
  totalCount: { ...typeScale.caption, fontSize: 12 },
  totalLabel: { ...fontStyles.bold, fontSize: 10, letterSpacing: 1 },
  totalValue: { ...fontStyles.bold, fontSize: 24, letterSpacing: -0.6, marginTop: 4 }
});
