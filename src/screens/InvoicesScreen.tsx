import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput as RNTextInput, View, type TextStyle } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { SegmentedButtons, Text, useTheme } from 'react-native-paper';
import { draftsApi, invoicesApi } from '@/api/endpoints';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { StatusPill, paymentStatusMeta } from '@/components/StatusPill';
import {
  AmountRangePreset,
  DateRangePreset,
  InvoiceFilterSheet,
  InvoiceFilterValues,
  InvoiceSortOption,
  defaultInvoiceFilterValues,
  resolveAmountRange,
  resolveDateRange
} from '@/components/InvoiceFilterSheet';
import { safeInvoiceSortParam } from '@/navigation/params';
import { InvoicesScreenProps } from '@/navigation/types';
import { PERMISSION, usePermissions } from '@/shared/hooks/usePermissions';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { queryKeys } from '@/shared/query/queryKeys';
import { alpha, appColors, fontStyles, radii, statusTone, typeScale } from '@/theme/theme';
import { Invoice, InvoiceStatus } from '@/types';
import { formatCurrency, formatDate } from '@/utils/format';

const PAGE_SIZE = 10;

const STATUS_LABELS: Record<'' | InvoiceStatus, string> = {
  '': 'All',
  pending: 'Pending',
  paid: 'Paid',
  cancelled: 'Cancelled'
};
const DATE_LABELS: Record<DateRangePreset, string> = {
  all: 'Any time',
  today: 'Today',
  week: 'This week',
  month: 'This month',
  'last-month': 'Last month'
};
const AMOUNT_LABELS: Record<AmountRangePreset, string> = {
  any: 'Any amount',
  'under-5k': 'Under ₹5k',
  '5k-15k': '₹5k – ₹15k',
  'over-15k': 'Over ₹15k'
};
const SORT_LABELS: Record<InvoiceSortOption, string> = {
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
const reportRangeLabel = (range: { from?: string; to?: string }) => {
  if (!range.from && !range.to) return 'Any time';
  return `${range.from ? formatDate(range.from) : 'Start'} - ${range.to ? formatDate(range.to) : 'Today'}`;
};

export function InvoicesScreen({ navigation, route }: InvoicesScreenProps) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const { can } = usePermissions();
  const canCreate = can(PERMISSION.invoicesCreate);
  const routeFrom = route?.params?.from || '';
  const routeTo = route?.params?.to || '';
  const routeSort = safeInvoiceSortParam(route?.params?.sort) as InvoiceSortOption | undefined;
  const reportRange = useMemo(() => route?.params?.fromReports && (routeFrom || routeTo) ? { from: routeFrom, to: routeTo } : null, [route?.params?.fromReports, routeFrom, routeTo]);
  const activeSort = route?.params?.fromReports && routeSort ? routeSort : undefined;
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [filterValues, setFilterValues] = useState<InvoiceFilterValues>(defaultInvoiceFilterValues);
  const [draftFilterValues, setDraftFilterValues] = useState<InvoiceFilterValues>(defaultInvoiceFilterValues);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const openFilters = () => {
    setDraftFilterValues(filterValues);
    setFiltersOpen(true);
  };
  const applyDraft = () => {
    navigation.setParams({ fromReports: false, from: '', to: '', sort: undefined });
    setFilterValues(draftFilterValues);
    setFiltersOpen(false);
  };

  const queryParams = useMemo(() => {
    const presetRange = resolveDateRange(filterValues.dateRange);
    const from = reportRange ? reportRange.from : presetRange.from;
    const to = reportRange ? reportRange.to : presetRange.to;
    const { minAmount, maxAmount } = resolveAmountRange(filterValues.amountRange);
    return {
      search: debouncedSearch,
      status: filterValues.status,
      from,
      to,
      minAmount,
      maxAmount,
      sort: activeSort || filterValues.sort
    };
  }, [debouncedSearch, filterValues, reportRange, activeSort]);

  const query = useInfiniteQuery({
    queryKey: queryKeys.invoices.list(queryParams),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => invoicesApi.page({ ...queryParams, page: pageParam, limit: PAGE_SIZE }),
    getNextPageParam: (lastPage) => lastPage.pagination.nextPage
  });

  const draftsQuery = useQuery({ queryKey: queryKeys.drafts.all, queryFn: () => draftsApi.list('invoice') });
  const draftCount = draftsQuery.data?.length ?? 0;

  const invoices = useMemo(() => query.data?.pages.flatMap((page) => page.invoices) ?? [], [query.data]);
  const isInitialLoading = query.isLoading && !invoices.length;
  const isRefreshing = query.isRefetching && !query.isFetchingNextPage;
  const activeFilterCount = (filterValues.status ? 1 : 0) +
    (reportRange || filterValues.dateRange !== 'all' ? 1 : 0) +
    (filterValues.amountRange !== 'any' ? 1 : 0) +
    ((activeSort || filterValues.sort) !== 'newest' ? 1 : 0);
  const totalCount = query.data?.pages[0]?.pagination.total ?? 0;
  const visibleCount = invoices.length;
  const statusIcon: Record<InvoiceStatus, keyof typeof MaterialCommunityIcons.glyphMap> = {
    paid: 'check-decagram',
    pending: 'clock-outline',
    cancelled: 'close-circle'
  };

  const activeFilterTags: { key: string; label: string; onClear: () => void }[] = [
    filterValues.status ? { key: 'status', label: STATUS_LABELS[filterValues.status], onClear: () => setFilterValues((v) => ({ ...v, status: '' })) } : null,
    reportRange ? { key: 'date', label: reportRangeLabel(reportRange), onClear: () => navigation.setParams({ fromReports: false, from: '', to: '' }) } : null,
    !reportRange && filterValues.dateRange !== 'all' ? { key: 'date', label: DATE_LABELS[filterValues.dateRange], onClear: () => setFilterValues((v) => ({ ...v, dateRange: 'all' })) } : null,
    filterValues.amountRange !== 'any' ? { key: 'amount', label: AMOUNT_LABELS[filterValues.amountRange], onClear: () => setFilterValues((v) => ({ ...v, amountRange: 'any' })) } : null,
    (activeSort || filterValues.sort) !== 'newest' ? { key: 'sort', label: SORT_LABELS[activeSort || filterValues.sort], onClear: () => {
      navigation.setParams({ sort: undefined });
      setFilterValues((v) => ({ ...v, sort: 'newest' }));
    } } : null
  ].filter(Boolean) as { key: string; label: string; onClear: () => void }[];

  const loadMoreInvoices = () => {
    if (!query.hasNextPage || query.isFetching || isInitialLoading) return;
    void query.fetchNextPage();
  };

  const stickyHeader = (
    <View style={[styles.stickyHeader, { backgroundColor: theme.colors.background }]}>
      <SegmentedButtons
        value="invoices"
        onValueChange={(value) => {
          if (value === 'orders') navigation.navigate('OrderList');
        }}
        buttons={[
          { value: 'invoices', label: 'Invoices', icon: 'file-document' },
          { value: 'orders', label: 'Orders', icon: 'clipboard-list-outline' }
        ]}
      />
      <View style={[styles.searchWrap, { backgroundColor: colors.card, borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.1) }]}>
        <Feather name="search" size={18} color={theme.colors.onSurfaceVariant} />
        <RNTextInput
          placeholder="Search invoice or customer"
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

      {invoices.length ? (
        <View style={styles.countStrip}>
          <Text style={[styles.countText, { color: theme.colors.onSurfaceVariant }]}>
            Showing <Text style={[styles.countBold, { color: theme.colors.onSurface }]}>{visibleCount}</Text>
            {totalCount ? <> of <Text style={[styles.countBold, { color: theme.colors.onSurface }]}>{totalCount}</Text></> : null}
            {' '}invoice{totalCount === 1 ? '' : 's'}
          </Text>
        </View>
      ) : null}

      {draftCount > 0 ? (
        <Pressable onPress={() => navigation.navigate('Drafts')} style={[styles.draftsLink, { backgroundColor: alpha(colors.primary, isDark ? 0.16 : 0.08), borderColor: alpha(colors.primary, isDark ? 0.28 : 0.16) }]}>
          <Feather name="file-text" size={14} color={theme.colors.primary} />
          <Text style={[styles.draftsLinkText, { color: theme.colors.primary }]}>{draftCount} saved draft{draftCount === 1 ? '' : 's'}</Text>
          <Feather name="chevron-right" size={15} color={theme.colors.primary} />
        </Pressable>
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

  const renderInvoicesFooter = () => {
    if (query.isFetchingNextPage) return <ActivityIndicator color={theme.colors.primary} style={styles.footerLoader} />;
    if (!query.hasNextPage && invoices.length) return <Text style={[styles.endText, { color: theme.colors.onSurfaceVariant }]}>All invoices loaded</Text>;
    return null;
  };

  const renderInvoiceCard = ({ item }: { item: Invoice }) => {
    const tone = statusTone(item.status, isDark);
    const avatarBg = item.status === 'paid' ? alpha(colors.accent, isDark ? 0.22 : 0.14) : alpha(colors.primary, isDark ? 0.22 : 0.14);
    const avatarFg = item.status === 'paid' ? colors.accent : colors.primary;
    const paymentMeta = item.paymentStatus !== 'paid' ? paymentStatusMeta(item.paymentStatus) : null;
    const hasBalance = typeof item.balanceDue === 'number' && item.balanceDue > 0;
    return (
      <Pressable
        onPress={() => navigation.navigate('InvoiceDetail', { id: item._id })}
        style={({ pressed }) => [
          styles.invoiceCard,
          {
            backgroundColor: colors.card,
            borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08),
            shadowColor: isDark ? '#000000' : colors.primaryStrong,
            opacity: pressed ? 0.94 : 1
          }
        ]}
      >
        <View style={styles.cardTop}>
          <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
            <Text style={[styles.avatarText, { color: avatarFg }]}>{initials(item.customerSnapshot.name)}</Text>
          </View>
          <View style={styles.cardTitleBlock}>
            <Text numberOfLines={1} style={[styles.invoiceTitle, { color: theme.colors.onSurface }]}>{item.customerSnapshot.name}</Text>
            <Text numberOfLines={1} style={[styles.invoiceMeta, { color: theme.colors.onSurfaceVariant }]}>
              <Text style={{ ...fontStyles.semiBold, color: theme.colors.onSurfaceVariant }}>{item.invoiceNumber}</Text>
              {`  ·  ${formatDate(item.date)}`}
            </Text>
          </View>
          <View style={styles.amountBlock}>
            <Text style={[styles.invoiceAmount, { color: theme.colors.onSurface }]}>{formatCurrency(item.total)}</Text>
            {hasBalance ? (
              <Text style={[styles.balanceDue, { color: colors.warning }]}>Due {formatCurrency(item.balanceDue)}</Text>
            ) : null}
          </View>
        </View>
        <View style={[styles.cardDivider, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.06) }]} />
        <View style={styles.cardBottom}>
          <View style={styles.pillRow}>
            <View style={[styles.statusPill, { backgroundColor: tone.background, borderColor: tone.border }]}>
              <MaterialCommunityIcons name={statusIcon[item.status]} size={13} color={tone.foreground} />
              <Text style={[styles.statusText, { color: tone.foreground }]}>{item.status}</Text>
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
      onPress={() => navigation.navigate('InvoiceCreate')}
      style={({ pressed }) => [
        styles.headerCreateBtn,
        {
          backgroundColor: pressed ? colors.primaryStrong : theme.colors.primary,
          shadowColor: isDark ? '#000000' : colors.primaryStrong
        }
      ]}
    >
      <MaterialCommunityIcons name="file-document-plus-outline" size={23} color="#FFFFFF" />
    </Pressable>
  );

  return (
    <Screen title="Invoices" scroll={false} headerAction={canCreate ? headerCreateAction : undefined} contentStyle={styles.screenContent}>
      {stickyHeader}
      <FlatList
        data={invoices}
        keyExtractor={(item) => item._id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        refreshing={isRefreshing}
        onRefresh={() => query.refetch()}
        onEndReached={loadMoreInvoices}
        onEndReachedThreshold={0.35}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        ListEmptyComponent={isInitialLoading ? <ActivityIndicator color={theme.colors.primary} style={styles.emptyLoader} /> : <EmptyState title="No invoices found" message="Try a different search or create a new invoice." actionLabel={canCreate ? 'Create invoice' : undefined} onAction={canCreate ? () => navigation.navigate('InvoiceCreate') : undefined} />}
        ListFooterComponent={renderInvoicesFooter}
        renderItem={renderInvoiceCard}
      />
      <InvoiceFilterSheet
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
  countStrip: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between', marginTop: 4, paddingHorizontal: 2 },
  countText: { ...typeScale.caption, fontSize: 12 },
  draftsLink: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: radii.pill, borderWidth: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 6 },
  draftsLinkText: { ...fontStyles.semiBold, fontSize: 12 },
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
  invoiceAmount: { ...fontStyles.bold, fontSize: 18, letterSpacing: -0.3 },
  invoiceCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    elevation: 2,
    marginBottom: 12,
    padding: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16
  },
  invoiceMeta: { ...typeScale.caption, fontSize: 12, marginTop: 2 },
  invoiceTitle: { ...fontStyles.bold, fontSize: 15 },
  list: { flex: 1 },
  listContent: { paddingBottom: 24 },
  pillRow: { alignItems: 'center', flexDirection: 'row', flexShrink: 1, flexWrap: 'wrap', gap: 6 },
  stickyHeader: { gap: 12, marginBottom: 10, paddingBottom: 4, paddingTop: 4 },
  screenContent: { flex: 1 },
  searchInput: { ...fontStyles.regular, flex: 1, fontSize: 14, paddingHorizontal: 0, paddingVertical: 0 },
  searchWrap: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  statusPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4
  },
  statusText: { ...fontStyles.semiBold, fontSize: 11, letterSpacing: 0.4, textTransform: 'capitalize' },
  viewHint: { alignItems: 'center', flexDirection: 'row', gap: 2 },
  viewHintLabel: { ...fontStyles.bold, fontSize: 12 }
});
