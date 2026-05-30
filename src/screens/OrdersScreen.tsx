import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput as RNTextInput, View, type TextStyle } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useInfiniteQuery } from '@tanstack/react-query';
import { SegmentedButtons, Text, useTheme } from 'react-native-paper';
import { ordersApi } from '@/api/endpoints';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { StatusPill, paymentStatusMeta } from '@/components/StatusPill';
import { OrdersScreenProps } from '@/navigation/types';
import { PERMISSION, usePermissions } from '@/shared/hooks/usePermissions';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { queryKeys } from '@/shared/query/queryKeys';
import { alpha, appColors, fontStyles, radii, statusTone, typeScale } from '@/theme/theme';
import { Order, OrderStatus } from '@/types';
import { formatCurrency, formatDate } from '@/utils/format';

const PAGE_SIZE = 10;

const STATUS_FILTERS: { value: '' | OrderStatus; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'cancelled', label: 'Cancelled' }
];

const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join('') || '?';
};
const webSearchInputStyle = { outlineStyle: 'none', outlineWidth: 0 } as unknown as TextStyle;

export function OrdersScreen({ navigation }: OrdersScreenProps) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const { can } = usePermissions();
  const canCreate = can(PERMISSION.ordersCreate);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [orderStatus, setOrderStatus] = useState<'' | OrderStatus>('');

  const queryParams = useMemo(() => ({ search: debouncedSearch, orderStatus, sort: 'newest' as const }), [debouncedSearch, orderStatus]);

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

  const loadMore = () => {
    if (!query.hasNextPage || query.isFetching || isInitialLoading) return;
    void query.fetchNextPage();
  };

  const orderStatusIcon: Record<OrderStatus, keyof typeof MaterialCommunityIcons.glyphMap> = {
    draft: 'file-document-edit-outline',
    confirmed: 'check-decagram',
    fulfilled: 'truck-check-outline',
    cancelled: 'close-circle'
  };

  const stickyHeader = (
    <View style={[styles.stickyHeader, { backgroundColor: theme.colors.background }]}>
      <SegmentedButtons
        value="orders"
        onValueChange={(value) => {
          if (value === 'invoices') navigation.navigate('InvoiceList');
        }}
        buttons={[
          { value: 'invoices', label: 'Invoices', icon: 'file-document' },
          { value: 'orders', label: 'Orders', icon: 'clipboard-list-outline' }
        ]}
      />
      <View style={[styles.searchWrap, { backgroundColor: colors.card, borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.1) }]}>
        <Feather name="search" size={18} color={theme.colors.onSurfaceVariant} />
        <RNTextInput
          placeholder="Search order or customer"
          placeholderTextColor={theme.colors.onSurfaceVariant}
          value={search}
          onChangeText={setSearch}
          style={[styles.searchInput, webSearchInputStyle, { color: theme.colors.onSurface }]}
        />
      </View>
      <View style={styles.statusRow}>
        {STATUS_FILTERS.map((filter) => {
          const active = orderStatus === filter.value;
          return (
            <Pressable
              key={filter.value || 'all'}
              onPress={() => setOrderStatus(filter.value)}
              style={[
                styles.statusChip,
                {
                  backgroundColor: active ? theme.colors.primary : alpha(colors.primary, isDark ? 0.16 : 0.08),
                  borderColor: active ? theme.colors.primary : alpha(colors.primary, isDark ? 0.28 : 0.16)
                }
              ]}
            >
              <Text style={[styles.statusChipText, { color: active ? '#FFFFFF' : theme.colors.primary }]}>{filter.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {orders.length ? (
        <Text style={[styles.countText, { color: theme.colors.onSurfaceVariant }]}>
          Showing <Text style={[styles.countBold, { color: theme.colors.onSurface }]}>{orders.length}</Text>
          {totalCount ? <> of <Text style={[styles.countBold, { color: theme.colors.onSurface }]}>{totalCount}</Text></> : null}
          {' '}order{totalCount === 1 ? '' : 's'}
        </Text>
      ) : null}
    </View>
  );

  const renderFooter = () => {
    if (query.isFetchingNextPage) return <ActivityIndicator color={theme.colors.primary} style={styles.footerLoader} />;
    if (!query.hasNextPage && orders.length) return <Text style={[styles.endText, { color: theme.colors.onSurfaceVariant }]}>All orders loaded</Text>;
    return null;
  };

  const renderOrderCard = ({ item }: { item: Order }) => {
    const tone = statusTone(item.orderStatus, isDark);
    const paymentMeta = item.paymentStatus !== 'paid' ? paymentStatusMeta(item.paymentStatus) : paymentStatusMeta('paid');
    const hasBalance = typeof item.balanceDue === 'number' && item.balanceDue > 0;
    return (
      <Pressable
        onPress={() => navigation.navigate('OrderDetail', { id: item._id })}
        style={({ pressed }) => [
          styles.orderCard,
          {
            backgroundColor: colors.card,
            borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08),
            shadowColor: isDark ? '#000000' : colors.primaryStrong,
            opacity: pressed ? 0.94 : 1
          }
        ]}
      >
        <View style={styles.cardTop}>
          <View style={[styles.avatar, { backgroundColor: alpha(colors.primary, isDark ? 0.22 : 0.14) }]}>
            <Text style={[styles.avatarText, { color: colors.primary }]}>{initials(item.customerSnapshot.name)}</Text>
          </View>
          <View style={styles.cardTitleBlock}>
            <Text numberOfLines={1} style={[styles.orderTitle, { color: theme.colors.onSurface }]}>{item.customerSnapshot.name}</Text>
            <Text numberOfLines={1} style={[styles.orderMeta, { color: theme.colors.onSurfaceVariant }]}>
              <Text style={{ ...fontStyles.semiBold, color: theme.colors.onSurfaceVariant }}>{item.orderNumber}</Text>
              {`  ·  ${formatDate(item.date)}`}
            </Text>
          </View>
          <View style={styles.amountBlock}>
            <Text style={[styles.orderAmount, { color: theme.colors.onSurface }]}>{formatCurrency(item.total)}</Text>
            {hasBalance ? <Text style={[styles.balanceDue, { color: colors.warning }]}>Due {formatCurrency(item.balanceDue)}</Text> : null}
          </View>
        </View>
        <View style={[styles.cardDivider, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.06) }]} />
        <View style={styles.cardBottom}>
          <View style={styles.pillRow}>
            <View style={[styles.statusPill, { backgroundColor: tone.background, borderColor: tone.border }]}>
              <MaterialCommunityIcons name={orderStatusIcon[item.orderStatus]} size={13} color={tone.foreground} />
              <Text style={[styles.statusText, { color: tone.foreground }]}>{item.orderStatus}</Text>
            </View>
            {paymentMeta ? <StatusPill label={paymentMeta.label} tone={paymentMeta.tone} /> : null}
          </View>
          <View style={styles.viewHint}>
            <Text style={[styles.viewHintLabel, { color: theme.colors.primary }]}>View</Text>
            <Feather name="chevron-right" size={15} color={theme.colors.primary} />
          </View>
        </View>
      </Pressable>
    );
  };

  const headerCreateAction = (
    <Pressable
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
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  statusChip: { borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  statusChipText: { ...fontStyles.bold, fontSize: 12, letterSpacing: 0.2 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stickyHeader: { gap: 12, marginBottom: 10, paddingBottom: 4, paddingTop: 4 },
  statusPill: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: radii.pill, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 9, paddingVertical: 4 },
  statusText: { ...fontStyles.semiBold, fontSize: 11, letterSpacing: 0.4, textTransform: 'capitalize' },
  viewHint: { alignItems: 'center', flexDirection: 'row', gap: 2 },
  viewHintLabel: { ...fontStyles.bold, fontSize: 12 }
});
