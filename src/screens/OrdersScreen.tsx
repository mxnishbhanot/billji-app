import { memo, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput as RNTextInput, View, type TextStyle } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Text, useTheme } from 'react-native-paper';
import { ordersApi } from '@/api/endpoints';
import { EmptyState } from '@/components/EmptyState';
import {
  OrderAmountRangePreset,
  OrderDateRangePreset,
  OrderFilterSheet,
  OrderFilterValues,
  OrderSortOption,
  defaultOrderFilterValues,
  resolveOrderAmountRange,
  resolveOrderDateRange
} from '@/components/OrderFilterSheet';
import { Screen } from '@/components/Screen';
import { StatusPill, paymentStatusMeta } from '@/components/StatusPill';
import { OrdersScreenProps } from '@/navigation/types';
import { PERMISSION, usePermissions } from '@/shared/hooks/usePermissions';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { queryKeys } from '@/shared/query/queryKeys';
import { alpha, appColors, fontStyles, radii, statusTone, typeScale } from '@/theme/theme';
import { InvoicePaymentStatus, Order, OrderFulfillmentStatus, OrderStatus } from '@/types';
import { formatCurrency, formatDate } from '@/utils/format';

const PAGE_SIZE = 10;

const STATUS_LABELS: Record<'' | OrderStatus, string> = {
  '': 'All',
  draft: 'Draft',
  confirmed: 'Confirmed',
  fulfilled: 'Fulfilled',
  cancelled: 'Cancelled'
};
const PAYMENT_LABELS: Record<'' | InvoicePaymentStatus, string> = {
  '': 'All',
  unpaid: 'Unpaid',
  partial: 'Partial',
  paid: 'Paid',
  refunded: 'Refunded'
};
const FULFILLMENT_LABELS: Record<'' | OrderFulfillmentStatus, string> = {
  '': 'All',
  pending: 'Pending',
  delivered: 'Delivered',
  returned: 'Returned',
  not_applicable: 'Not applicable'
};
const DATE_LABELS: Record<OrderDateRangePreset, string> = {
  all: 'Any time',
  today: 'Today',
  week: 'This week',
  month: 'This month',
  'last-month': 'Last month'
};
const AMOUNT_LABELS: Record<OrderAmountRangePreset, string> = {
  any: 'Any amount',
  'under-5k': 'Under ₹5k',
  '5k-15k': '₹5k - ₹15k',
  'over-15k': 'Over ₹15k'
};
const SORT_LABELS: Record<OrderSortOption, string> = {
  newest: 'Newest',
  oldest: 'Oldest',
  'amount-high': 'Highest amount',
  'amount-low': 'Lowest amount'
};

const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join('') || '?';
};
const webSearchInputStyle = { outlineStyle: 'none', outlineWidth: 0 } as unknown as TextStyle;
const ORDER_STATUS_ICONS: Record<OrderStatus, keyof typeof MaterialCommunityIcons.glyphMap> = {
  draft: 'file-document-edit-outline',
  confirmed: 'check-decagram',
  fulfilled: 'truck-check-outline',
  cancelled: 'close-circle'
};

// Memoized row: unchanged orders skip re-rendering on screen re-renders
// (search keystrokes, filter changes, refetches). Theme styles memoized per theme.
const OrderCard = memo(function OrderCard({
  item,
  isDark,
  colors,
  onSurface,
  onSurfaceVariant,
  primary,
  onPress
}: {
  item: Order;
  isDark: boolean;
  colors: ReturnType<typeof appColors>;
  onSurface: string;
  onSurfaceVariant: string;
  primary: string;
  onPress: (id: string) => void;
}) {
  const themed = useMemo(() => ({
    card: { backgroundColor: colors.card, borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08), shadowColor: isDark ? '#000000' : colors.primaryStrong },
    divider: { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.06) },
    avatar: { backgroundColor: alpha(colors.primary, isDark ? 0.22 : 0.14) }
  }), [colors, isDark]);

  const tone = statusTone(item.orderStatus, isDark);
  const paymentMeta = item.paymentStatus !== 'paid' ? paymentStatusMeta(item.paymentStatus) : paymentStatusMeta('paid');
  const hasBalance = typeof item.balanceDue === 'number' && item.balanceDue > 0;

  return (
    <Pressable
      onPress={() => onPress(item._id)}
      style={({ pressed }) => [styles.orderCard, themed.card, { opacity: pressed ? 0.94 : 1 }]}
    >
      <View style={styles.cardTop}>
        <View style={[styles.avatar, themed.avatar]}>
          <Text style={[styles.avatarText, { color: colors.primary }]}>{initials(item.customerSnapshot.name)}</Text>
        </View>
        <View style={styles.cardTitleBlock}>
          <Text numberOfLines={1} style={[styles.orderTitle, { color: onSurface }]}>{item.customerSnapshot.name}</Text>
          <Text numberOfLines={1} style={[styles.orderMeta, { color: onSurfaceVariant }]}>
            <Text style={{ ...fontStyles.semiBold, color: onSurfaceVariant }}>{item.orderNumber}</Text>
            {`  ·  ${formatDate(item.date)}`}
          </Text>
        </View>
        <View style={styles.amountBlock}>
          <Text style={[styles.orderAmount, { color: onSurface }]}>{formatCurrency(item.total)}</Text>
          {hasBalance ? <Text style={[styles.balanceDue, { color: colors.warning }]}>Due {formatCurrency(item.balanceDue)}</Text> : null}
        </View>
      </View>
      <View style={[styles.cardDivider, themed.divider]} />
      <View style={styles.cardBottom}>
        <View style={styles.pillRow}>
          <View style={[styles.statusPill, { backgroundColor: tone.background, borderColor: tone.border }]}>
            <MaterialCommunityIcons name={ORDER_STATUS_ICONS[item.orderStatus]} size={13} color={tone.foreground} />
            <Text style={[styles.statusText, { color: tone.foreground }]}>{item.orderStatus}</Text>
          </View>
          {paymentMeta ? <StatusPill label={paymentMeta.label} tone={paymentMeta.tone} /> : null}
        </View>
        <View style={styles.viewHint}>
          <Text style={[styles.viewHintLabel, { color: primary }]}>View</Text>
          <Feather name="chevron-right" size={15} color={primary} />
        </View>
      </View>
    </Pressable>
  );
});

export function OrdersScreen({ navigation }: OrdersScreenProps) {
  const theme = useTheme();
  const isDark = theme.dark;
  // Stable reference so the memoized row's theme styles only recompute on theme change.
  const colors = useMemo(() => appColors(isDark), [isDark]);
  const { can } = usePermissions();
  const canCreate = can(PERMISSION.ordersCreate);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [filterValues, setFilterValues] = useState<OrderFilterValues>(defaultOrderFilterValues);
  const [draftFilterValues, setDraftFilterValues] = useState<OrderFilterValues>(defaultOrderFilterValues);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const openFilters = () => {
    setDraftFilterValues(filterValues);
    setFiltersOpen(true);
  };
  const applyDraft = () => {
    setFilterValues(draftFilterValues);
    setFiltersOpen(false);
  };

  const queryParams = useMemo(() => {
    const { from, to } = resolveOrderDateRange(filterValues.dateRange);
    const { minAmount, maxAmount } = resolveOrderAmountRange(filterValues.amountRange);
    return {
      search: debouncedSearch,
      orderStatus: filterValues.orderStatus,
      paymentStatus: filterValues.paymentStatus,
      fulfillmentStatus: filterValues.fulfillmentStatus,
      from,
      to,
      minAmount,
      maxAmount,
      sort: filterValues.sort
    };
  }, [debouncedSearch, filterValues]);

  const query = useInfiniteQuery({
    queryKey: queryKeys.orders.list(queryParams),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => ordersApi.page({ ...queryParams, page: pageParam, limit: PAGE_SIZE }),
    getNextPageParam: (lastPage) => lastPage.pagination.nextPage
  });

  const orders = useMemo(() => query.data?.pages.flatMap((page) => page.orders) ?? [], [query.data]);
  const isInitialLoading = query.isLoading && !orders.length;
  const isRefreshing = query.isRefetching && !query.isFetchingNextPage;
  const totalCount = query.data?.pages[0]?.pagination.total ?? 0;
  const activeFilterCount = (filterValues.orderStatus ? 1 : 0) +
    (filterValues.paymentStatus ? 1 : 0) +
    (filterValues.fulfillmentStatus ? 1 : 0) +
    (filterValues.dateRange !== 'all' ? 1 : 0) +
    (filterValues.amountRange !== 'any' ? 1 : 0) +
    (filterValues.sort !== 'newest' ? 1 : 0);

  const loadMore = () => {
    if (!query.hasNextPage || query.isFetching || isInitialLoading) return;
    void query.fetchNextPage();
  };

  const activeFilterTags: { key: string; label: string; onClear: () => void }[] = [
    filterValues.orderStatus ? { key: 'orderStatus', label: STATUS_LABELS[filterValues.orderStatus], onClear: () => setFilterValues((v) => ({ ...v, orderStatus: '' })) } : null,
    filterValues.paymentStatus ? { key: 'paymentStatus', label: PAYMENT_LABELS[filterValues.paymentStatus], onClear: () => setFilterValues((v) => ({ ...v, paymentStatus: '' })) } : null,
    filterValues.fulfillmentStatus ? { key: 'fulfillmentStatus', label: FULFILLMENT_LABELS[filterValues.fulfillmentStatus], onClear: () => setFilterValues((v) => ({ ...v, fulfillmentStatus: '' })) } : null,
    filterValues.dateRange !== 'all' ? { key: 'date', label: DATE_LABELS[filterValues.dateRange], onClear: () => setFilterValues((v) => ({ ...v, dateRange: 'all' })) } : null,
    filterValues.amountRange !== 'any' ? { key: 'amount', label: AMOUNT_LABELS[filterValues.amountRange], onClear: () => setFilterValues((v) => ({ ...v, amountRange: 'any' })) } : null,
    filterValues.sort !== 'newest' ? { key: 'sort', label: SORT_LABELS[filterValues.sort], onClear: () => setFilterValues((v) => ({ ...v, sort: 'newest' })) } : null
  ].filter(Boolean) as { key: string; label: string; onClear: () => void }[];

  const stickyHeader = (
    <View style={[styles.stickyHeader, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.searchWrap, { backgroundColor: colors.card, borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.1) }]}>
        <Feather name="search" size={18} color={theme.colors.onSurfaceVariant} />
        <RNTextInput
          placeholder="Search order or customer"
          placeholderTextColor={theme.colors.onSurfaceVariant}
          value={search}
          onChangeText={setSearch}
          style={[styles.searchInput, webSearchInputStyle, { color: theme.colors.onSurface }]}
        />
        <Pressable onPress={openFilters} style={[styles.filterIconBtn, { backgroundColor: alpha(colors.primary, isDark ? 0.18 : 0.1) }]}>
          <Feather name="sliders" size={16} color={theme.colors.primary} />
          {activeFilterCount ? (
            <View style={[styles.filterBadge, { backgroundColor: colors.accent }]}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>
      {orders.length ? (
        <Text style={[styles.countText, { color: theme.colors.onSurfaceVariant }]}>
          Showing <Text style={[styles.countBold, { color: theme.colors.onSurface }]}>{orders.length}</Text>
          {totalCount ? <> of <Text style={[styles.countBold, { color: theme.colors.onSurface }]}>{totalCount}</Text></> : null}
          {' '}order{totalCount === 1 ? '' : 's'}
        </Text>
      ) : null}
      {activeFilterTags.length ? (
        <View style={styles.filterTagsRow}>
          {activeFilterTags.map((tag) => (
            <Pressable
              key={tag.key}
              onPress={tag.onClear}
              style={[styles.activeFilterPill, { backgroundColor: alpha(theme.colors.primary, isDark ? 0.22 : 0.12), borderColor: alpha(theme.colors.primary, isDark ? 0.36 : 0.22) }]}
            >
              <Text style={[styles.activeFilterLabel, { color: theme.colors.primary }]}>{tag.label}</Text>
              <Feather name="x" size={12} color={theme.colors.primary} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );

  const renderFooter = () => {
    if (query.isFetchingNextPage) return <ActivityIndicator color={theme.colors.primary} style={styles.footerLoader} />;
    if (!query.hasNextPage && orders.length) return <Text style={[styles.endText, { color: theme.colors.onSurfaceVariant }]}>All orders loaded</Text>;
    return null;
  };

  const openOrder = useCallback((id: string) => navigation.navigate('OrderDetail', { id }), [navigation]);
  const renderOrderCard = useCallback(({ item }: { item: Order }) => (
    <OrderCard
      item={item}
      isDark={isDark}
      colors={colors}
      onSurface={theme.colors.onSurface}
      onSurfaceVariant={theme.colors.onSurfaceVariant}
      primary={theme.colors.primary}
      onPress={openOrder}
    />
  ), [isDark, colors, theme.colors.onSurface, theme.colors.onSurfaceVariant, theme.colors.primary, openOrder]);

  const headerCreateAction = (
    <Pressable
      accessibilityLabel="Create order"
      accessibilityRole="button"
      onPress={() => navigation.navigate('OrderCreate')}
      style={({ pressed }) => [styles.headerCreateBtn, { backgroundColor: pressed ? colors.primaryStrong : theme.colors.primary, shadowColor: isDark ? '#000000' : colors.primaryStrong }]}
    >
      <MaterialCommunityIcons name="clipboard-plus-outline" size={23} color="#FFFFFF" />
    </Pressable>
  );

  return (
    <Screen title="Orders" scroll={false} headerAction={canCreate ? headerCreateAction : undefined} contentStyle={styles.screenContent}>
      {stickyHeader}
      <FlatList
        data={orders}
        keyExtractor={(item) => item._id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        refreshing={isRefreshing}
        onRefresh={() => query.refetch()}
        onEndReached={loadMore}
        onEndReachedThreshold={0.35}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        ListEmptyComponent={isInitialLoading ? <ActivityIndicator color={theme.colors.primary} style={styles.emptyLoader} /> : <EmptyState title="No orders found" message="Create an order to plan a sale before invoicing." actionLabel={canCreate ? 'Create order' : undefined} onAction={canCreate ? () => navigation.navigate('OrderCreate') : undefined} />}
        ListFooterComponent={renderFooter}
        renderItem={renderOrderCard}
      />
      <OrderFilterSheet
        visible={filtersOpen}
        values={draftFilterValues}
        onChange={setDraftFilterValues}
        onClose={() => setFiltersOpen(false)}
        onApply={applyDraft}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  activeFilterLabel: { ...fontStyles.bold, fontSize: 11, letterSpacing: 0.3 },
  activeFilterPill: { alignItems: 'center', borderRadius: radii.pill, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 10, paddingVertical: 4 },
  amountBlock: { alignItems: 'flex-end' },
  avatar: { alignItems: 'center', borderRadius: radii.pill, height: 44, justifyContent: 'center', width: 44 },
  avatarText: { ...fontStyles.bold, fontSize: 15, letterSpacing: 0.4 },
  balanceDue: { ...fontStyles.semiBold, fontSize: 11, marginTop: 2 },
  cardBottom: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  cardDivider: { height: 1, marginBottom: 12, marginTop: 14 },
  cardTitleBlock: { flex: 1, minWidth: 0 },
  cardTop: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  countBold: { ...fontStyles.bold },
  countText: { ...typeScale.caption, fontSize: 12, paddingHorizontal: 2 },
  emptyLoader: { marginTop: 40 },
  endText: { ...typeScale.caption, marginVertical: 16, textAlign: 'center' },
  filterBadge: {
    alignItems: 'center',
    borderRadius: radii.pill,
    height: 14,
    justifyContent: 'center',
    minWidth: 14,
    paddingHorizontal: 3,
    position: 'absolute',
    right: -2,
    top: -2
  },
  filterBadgeText: { ...fontStyles.bold, color: '#FFFFFF', fontSize: 9, lineHeight: 11 },
  filterIconBtn: { alignItems: 'center', borderRadius: radii.md, height: 34, justifyContent: 'center', position: 'relative', width: 34 },
  filterTagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -2 },
  footerLoader: { marginVertical: 16 },
  headerCreateBtn: {
    alignItems: 'center',
    borderRadius: radii.pill,
    elevation: 4,
    height: 44,
    justifyContent: 'center',
    marginLeft: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    width: 44
  },
  list: { flex: 1 },
  listContent: { paddingBottom: 24 },
  orderAmount: { ...fontStyles.bold, fontSize: 18, letterSpacing: -0.3 },
  orderCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    elevation: 2,
    marginBottom: 12,
    padding: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16
  },
  orderMeta: { ...typeScale.caption, fontSize: 12, marginTop: 2 },
  orderTitle: { ...fontStyles.bold, fontSize: 15 },
  pillRow: { alignItems: 'center', flexDirection: 'row', flexShrink: 1, flexWrap: 'wrap', gap: 6 },
  screenContent: { flex: 1 },
  searchInput: { ...fontStyles.regular, flex: 1, fontSize: 14, paddingHorizontal: 0, paddingVertical: 0 },
  searchWrap: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: 10, minHeight: 46, paddingHorizontal: 12, paddingVertical: 6 },
  stickyHeader: { gap: 12, marginBottom: 10, paddingBottom: 4, paddingTop: 4 },
  statusPill: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: radii.pill, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 9, paddingVertical: 4 },
  statusText: { ...fontStyles.semiBold, fontSize: 11, letterSpacing: 0.4, textTransform: 'capitalize' },
  viewHint: { alignItems: 'center', flexDirection: 'row', gap: 2 },
  viewHintLabel: { ...fontStyles.bold, fontSize: 12 }
});
