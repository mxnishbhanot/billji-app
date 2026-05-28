import { useMemo } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Text, useTheme } from 'react-native-paper';
import { ledgerApi } from '@/api/endpoints';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { queryKeys } from '@/shared/query/queryKeys';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import { LedgerEntryRow } from '@/types';
import { formatCurrency, formatDate } from '@/utils/format';

const PAGE_SIZE = 20;

const ACCOUNT_LABELS: Record<string, string> = {
  cash: 'Cash',
  bank: 'Bank',
  accounts_receivable: 'Accounts receivable',
  customer_credits: 'Customer credits',
  sales: 'Sales',
  refunds: 'Refunds',
  adjustments: 'Adjustments'
};
const accountLabel = (account: string) => ACCOUNT_LABELS[account] || account.replace(/_/g, ' ');
const customerName = (customer: LedgerEntryRow['customer']) => (customer && typeof customer === 'object' ? customer.name || null : null);

export function LedgerScreen() {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const query = useInfiniteQuery({
    queryKey: queryKeys.ledger.list({}),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => ledgerApi.page({ page: pageParam, limit: PAGE_SIZE }),
    getNextPageParam: (lastPage) => lastPage.pagination.nextPage
  });
  const entries = useMemo(() => query.data?.pages.flatMap((page) => page.ledgerEntries) ?? [], [query.data]);
  const loadMore = () => {
    if (query.hasNextPage && !query.isFetching) void query.fetchNextPage();
  };

  const renderRow = ({ item }: { item: LedgerEntryRow }) => {
    const isCredit = item.direction === 'credit';
    const accent = isCredit ? colors.accent : colors.primary;
    const meta = [accountLabel(item.account), customerName(item.customer), formatDate(item.entryDate)].filter(Boolean).join('  ·  ');
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08) }]}>
        <View style={[styles.iconTile, { backgroundColor: alpha(accent, isDark ? 0.2 : 0.12) }]}>
          <Feather name={isCredit ? 'arrow-down-left' : 'arrow-up-right'} size={15} color={accent} />
        </View>
        <View style={styles.flex1}>
          <Text numberOfLines={1} style={[styles.title, { color: theme.colors.onSurface }]}>{item.description || accountLabel(item.account)}</Text>
          <Text numberOfLines={1} style={[styles.meta, { color: theme.colors.onSurfaceVariant }]}>{meta}</Text>
        </View>
        <View style={styles.amountCol}>
          <Text style={[styles.amount, { color: accent }]}>{isCredit ? '+' : '-'}{formatCurrency(item.amount)}</Text>
          <Text style={[styles.direction, { color: theme.colors.onSurfaceVariant }]}>{item.direction}</Text>
        </View>
      </View>
    );
  };

  return (
    <Screen title="Ledger" scroll={false} contentStyle={styles.screenContent}>
      <FlatList
        data={entries}
        keyExtractor={(item) => item._id}
        style={styles.list}
        contentContainerStyle={[styles.listContent, !entries.length && styles.emptyListContent]}
        showsVerticalScrollIndicator={false}
        refreshing={query.isRefetching && !query.isFetchingNextPage}
        onRefresh={() => query.refetch()}
        onEndReached={loadMore}
        onEndReachedThreshold={0.35}
        removeClippedSubviews
        initialNumToRender={15}
        maxToRenderPerBatch={15}
        windowSize={7}
        ListEmptyComponent={query.isLoading ? <ActivityIndicator color={theme.colors.primary} style={styles.emptyLoader} /> : <EmptyState title="No ledger entries" message="Double-entry accounting records appear here as invoices and payments are processed." />}
        ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator color={theme.colors.primary} style={styles.footerLoader} /> : null}
        renderItem={renderRow}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  amount: { ...fontStyles.bold, fontSize: 15, letterSpacing: -0.3 },
  amountCol: { alignItems: 'flex-end' },
  card: { alignItems: 'center', borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', gap: 12, marginBottom: 10, padding: 14 },
  direction: { ...typeScale.smallCaption, fontSize: 11, marginTop: 2, textTransform: 'capitalize' },
  emptyListContent: { flexGrow: 1 },
  emptyLoader: { marginTop: 40 },
  flex1: { flex: 1, minWidth: 0 },
  footerLoader: { marginVertical: 16 },
  iconTile: { alignItems: 'center', borderRadius: radii.md, height: 36, justifyContent: 'center', width: 36 },
  list: { flex: 1 },
  listContent: { paddingBottom: 24 },
  meta: { ...typeScale.caption, fontSize: 12, marginTop: 2 },
  screenContent: { flex: 1 },
  title: { ...fontStyles.semiBold, fontSize: 14 }
});
