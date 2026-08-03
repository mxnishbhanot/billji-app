import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput as RNTextInput, View, type TextStyle } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Text, useTheme } from 'react-native-paper';
import { customersApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { useAppDialog } from '@/components/AppDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  CustomerBillingStatus,
  CustomerFilterSheet,
  CustomerFilterValues,
  CustomerSortOption,
  defaultCustomerFilterValues
} from '@/components/CustomerFilterSheet';
import { CustomerFormSheet } from '@/components/CustomerFormSheet';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { CustomersStackParamList } from '@/navigation/types';
import { useOpenCreateParam } from '@/shared/hooks/useOpenCreateParam';
import { PERMISSION, usePermissions } from '@/shared/hooks/usePermissions';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { queryKeys } from '@/shared/query/queryKeys';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import { Customer, CustomerFormValues, Page } from '@/types';
import { formatCurrency } from '@/utils/format';
import { customerSchema } from '@/validation/schemas';

const PAGE_SIZE = 10;
const blankCustomer = { name: '', phone: '', countryCode: '+91', email: '', address: '', gstNumber: '' };

const toFormValues = (customer: Customer | null): CustomerFormValues =>
  customer
    ? {
        name: customer.name || '',
        phone: customer.phone || '',
        countryCode: customer.countryCode || '+91',
        email: customer.email || '',
        address: customer.address || '',
        gstNumber: customer.gstNumber || customer.taxIdentifiers?.gstNumber || ''
      }
    : blankCustomer;
type CustomerFilters = CustomerFilterValues & { search: string };
const emptyCustomerFilters: CustomerFilters = { search: '', ...defaultCustomerFilterValues };
const BILLING_LABELS: Record<CustomerBillingStatus, string> = {
  all: 'All customers',
  invoiced: 'Has invoices',
  notInvoiced: 'Never invoiced',
  pending: 'Pending payment',
  paid: 'Paid invoice'
};
const SORT_LABELS: Record<CustomerSortOption, string> = {
  updated: 'Recently updated',
  newest: 'Newest customers',
  oldest: 'Oldest customers',
  'name-asc': 'Name A-Z'
};
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('') || '?';
const webSearchInputStyle = { outlineStyle: 'none', outlineWidth: 0 } as unknown as TextStyle;
type CustomerPageData = InfiniteData<Page<Customer, 'customers'>>;

// Memoized row: unchanged customers skip re-rendering when the screen re-renders
// (search keystrokes, filter toggles, refetches). Theme-derived style fragments are
// memoized per theme so style props keep stable references.
const CustomerCard = memo(function CustomerCard({
  item,
  isDark,
  colors,
  primary,
  onSurface,
  onSurfaceVariant,
  error,
  canManage,
  onPress,
  onEdit,
  onDelete
}: {
  item: Customer;
  isDark: boolean;
  colors: ReturnType<typeof appColors>;
  primary: string;
  onSurface: string;
  onSurfaceVariant: string;
  error: string;
  canManage: boolean;
  onPress: (customer: Customer) => void;
  onEdit: (customer: Customer) => void;
  onDelete: (customer: Customer) => void;
}) {
  const themed = useMemo(() => ({
    card: { backgroundColor: colors.card, borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08), shadowColor: isDark ? '#000000' : colors.primaryStrong },
    avatar: { backgroundColor: alpha(colors.primary, isDark ? 0.2 : 0.12) },
    divider: { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.06) },
    duesPill: { backgroundColor: alpha(colors.destructive, isDark ? 0.18 : 0.1), borderColor: alpha(colors.destructive, isDark ? 0.32 : 0.24) },
    creditPill: { backgroundColor: alpha(colors.accent, isDark ? 0.18 : 0.1), borderColor: alpha(colors.accent, isDark ? 0.32 : 0.24) },
    emailPill: { backgroundColor: alpha(colors.accent, isDark ? 0.18 : 0.1), borderColor: alpha(colors.accent, isDark ? 0.32 : 0.24) },
    noEmailPill: { backgroundColor: alpha(colors.warning, isDark ? 0.18 : 0.1), borderColor: alpha(colors.warning, isDark ? 0.32 : 0.24) },
    addressPill: { backgroundColor: alpha(colors.primary, isDark ? 0.18 : 0.08), borderColor: alpha(colors.primary, isDark ? 0.3 : 0.18) },
    editAction: { backgroundColor: alpha(colors.primary, isDark ? 0.16 : 0.08) },
    deleteAction: { backgroundColor: alpha(colors.destructive, isDark ? 0.16 : 0.08) }
  }), [colors, isDark]);

  return (
    <Pressable
      onPress={() => onPress(item)}
      style={({ pressed }) => [styles.customerCard, themed.card, { opacity: pressed ? 0.94 : 1 }]}
    >
      <View style={styles.cardTop}>
        <View style={[styles.avatar, themed.avatar]}>
          <Text style={[styles.avatarText, { color: primary }]}>{initials(item.name)}</Text>
        </View>
        <View style={styles.cardTitleBlock}>
          <Text numberOfLines={1} style={[styles.cardTitle, { color: onSurface }]}>{item.name}</Text>
          <Text numberOfLines={1} style={[styles.cardSubtitle, { color: onSurfaceVariant }]}>{item.countryCode || '+91'} {item.phone}</Text>
        </View>
      </View>
      <View style={[styles.cardDivider, themed.divider]} />
      <View style={styles.cardBottom}>
        <View style={styles.contactChips}>
          {typeof item.outstandingDues === 'number' && item.outstandingDues > 0 ? (
            <View style={[styles.contactPill, themed.duesPill]}>
              <Feather name="alert-circle" size={13} color={colors.destructive} />
              <Text numberOfLines={1} style={[styles.contactPillText, { color: colors.destructive }]}>Due {formatCurrency(item.outstandingDues)}</Text>
            </View>
          ) : null}
          {/* Credit (advance balance) shelved — "coming soon". Hidden until the balance calc is reworked. */}
          <View style={[styles.contactPill, item.email ? themed.emailPill : themed.noEmailPill]}>
            <Feather name={item.email ? 'mail' : 'mail'} size={13} color={item.email ? colors.accent : colors.warning} />
            <Text numberOfLines={1} style={[styles.contactPillText, { color: item.email ? colors.accent : colors.warning }]}>{item.email || 'No email'}</Text>
          </View>
          {item.address ? (
            <View style={[styles.contactPill, themed.addressPill]}>
              <Feather name="map-pin" size={13} color={primary} />
              <Text numberOfLines={1} style={[styles.contactPillText, { color: primary }]}>{item.address}</Text>
            </View>
          ) : null}
        </View>
        {canManage ? (
          <View style={styles.iconActions}>
            <Pressable onPress={() => onEdit(item)} hitSlop={8} style={[styles.iconAction, themed.editAction]}>
              <Feather name="edit-2" size={14} color={primary} />
            </Pressable>
            <Pressable onPress={() => onDelete(item)} hitSlop={8} style={[styles.iconAction, themed.deleteAction]}>
              <Feather name="trash-2" size={14} color={error} />
            </Pressable>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});

export function CustomersScreen() {
  const queryClient = useQueryClient();
  const navigation = useNavigation<NativeStackNavigationProp<CustomersStackParamList>>();
  const theme = useTheme();
  const isDark = theme.dark;
  // Stable reference so the memoized row's theme styles only recompute on theme change.
  const colors = useMemo(() => appColors(isDark), [isDark]);
  const { showDialog } = useAppDialog();
  const { can } = usePermissions();
  const canManage = can(PERMISSION.customersManage);
  const [filters, setFilters] = useState<CustomerFilters>(emptyCustomerFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftFilterValues, setDraftFilterValues] = useState<CustomerFilterValues>(defaultCustomerFilterValues);
  const [editing, setEditing] = useState<Customer | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  useOpenCreateParam(() => { if (canManage) setEditing(null); });
  const form = useForm<CustomerFormValues>({ defaultValues: blankCustomer, resolver: zodResolver(customerSchema) });
  const debouncedSearch = useDebouncedValue(filters.search, 300);
  const queryFilters = useMemo(() => ({ ...filters, search: debouncedSearch }), [filters, debouncedSearch]);
  const query = useInfiniteQuery({ queryKey: queryKeys.customers.list(queryFilters), initialPageParam: 1, queryFn: ({ pageParam }) => customersApi.page({ ...queryFilters, page: pageParam, limit: PAGE_SIZE }), getNextPageParam: (lastPage) => lastPage.pagination.nextPage });
  const customers = useMemo(() => query.data?.pages.flatMap((page) => page.customers) ?? [], [query.data]);
  const isInitialLoading = query.isLoading && !customers.length;
  const isRefreshing = query.isRefetching && !query.isFetchingNextPage;
  const activeFilterCount = (filters.billingStatus !== 'all' ? 1 : 0) + (filters.sort !== 'updated' ? 1 : 0);
  const totalCount = query.data?.pages[0]?.pagination.total ?? 0;
  const visibleCount = customers.length;
  const activeListKey = queryKeys.customers.list(queryFilters);
  const save = useMutation({
    mutationFn: (values: CustomerFormValues) => editing?._id ? customersApi.update(editing._id, values) : customersApi.create(values),
    // Optimistic on edit: patch the visible list immediately; creates wait for the server id.
    onMutate: async (values) => {
      if (!editing?._id) return undefined;
      await queryClient.cancelQueries({ queryKey: activeListKey });
      const previous = queryClient.getQueryData<CustomerPageData>(activeListKey);
      if (previous) {
        queryClient.setQueryData<CustomerPageData>(activeListKey, {
          ...previous,
          pages: previous.pages.map((page) => ({ ...page, customers: page.customers.map((customer) => customer._id === editing._id ? { ...customer, ...values } : customer) }))
        });
      }
      return { previous };
    },
    onSuccess: (_data, values) => {
      setEditing(undefined);
    },
    onError: (error, _values, context) => {
      if (context?.previous) queryClient.setQueryData(activeListKey, context.previous);
      showDialog({ title: 'Could not save customer', message: apiErrorMessage(error), tone: 'error' });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.customers.all })
  });
  const remove = useMutation({
    mutationFn: (id: string) => customersApi.remove(id),
    // Optimistic: drop the row immediately, restore on failure.
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: activeListKey });
      const previous = queryClient.getQueryData<CustomerPageData>(activeListKey);
      if (previous) {
        queryClient.setQueryData<CustomerPageData>(activeListKey, {
          ...previous,
          pages: previous.pages.map((page) => ({ ...page, customers: page.customers.filter((customer) => customer._id !== id) }))
        });
      }
      return { previous };
    },
    onSuccess: () => setDeleting(null),
    onError: (error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(activeListKey, context.previous);
      showDialog({ title: 'Could not delete customer', message: apiErrorMessage(error), tone: 'error' });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.customers.all })
  });
  useEffect(() => {
    if (editing !== undefined) form.reset(toFormValues(editing));
  }, [editing, form]);

  const loadMoreCustomers = () => {
    if (!query.hasNextPage || query.isFetching || isInitialLoading) return;
    void query.fetchNextPage();
  };

  const openFilters = () => {
    setDraftFilterValues({ billingStatus: filters.billingStatus, sort: filters.sort });
    setFiltersOpen(true);
  };

  const applyDraft = () => {
    setFilters((current) => ({ ...current, ...draftFilterValues }));
    setFiltersOpen(false);
  };

  const activeFilterTags: { key: string; label: string; onClear: () => void }[] = [
    filters.billingStatus !== 'all' ? { key: 'billing', label: BILLING_LABELS[filters.billingStatus], onClear: () => setFilters((current) => ({ ...current, billingStatus: 'all' })) } : null,
    filters.sort !== 'updated' ? { key: 'sort', label: SORT_LABELS[filters.sort], onClear: () => setFilters((current) => ({ ...current, sort: 'updated' })) } : null
  ].filter(Boolean) as { key: string; label: string; onClear: () => void }[];

  const stickyHeader = (
    <View style={[styles.stickyHeader, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.searchWrap, { backgroundColor: colors.card, borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.1) }]}>
        <Feather name="search" size={18} color={theme.colors.onSurfaceVariant} />
        <RNTextInput
          placeholder="Search customer, phone, or email"
          placeholderTextColor={theme.colors.onSurfaceVariant}
          value={filters.search}
          onChangeText={(search) => setFilters((current) => ({ ...current, search }))}
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

      <View style={styles.headerMetaRow}>
        <View style={styles.countStrip}>
          <Text style={[styles.countText, { color: theme.colors.onSurfaceVariant }]}>
            Showing <Text style={[styles.countBold, { color: theme.colors.onSurface }]}>{visibleCount}</Text>
            {totalCount ? <> of <Text style={[styles.countBold, { color: theme.colors.onSurface }]}>{totalCount}</Text></> : null}
            {' '}customer{totalCount === 1 ? '' : 's'}
          </Text>
        </View>
      </View>

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

  const renderCustomersFooter = () => {
    if (query.isFetchingNextPage) return <ActivityIndicator color={theme.colors.primary} style={styles.footerLoader} />;
    if (!query.hasNextPage && customers.length) return <Text style={[styles.endText, { color: theme.colors.onSurfaceVariant }]}>All customers loaded</Text>;
    return null;
  };

  const openCustomer = useCallback((customer: Customer) => navigation.navigate('CustomerDetail', { customer }), [navigation]);
  const startEdit = useCallback((customer: Customer) => setEditing(customer), []);
  const startDelete = useCallback((customer: Customer) => setDeleting(customer), []);
  const renderCustomerCard = useCallback(({ item }: { item: Customer }) => (
    <CustomerCard
      item={item}
      isDark={isDark}
      colors={colors}
      primary={theme.colors.primary}
      onSurface={theme.colors.onSurface}
      onSurfaceVariant={theme.colors.onSurfaceVariant}
      error={theme.colors.error}
      canManage={canManage}
      onPress={openCustomer}
      onEdit={startEdit}
      onDelete={startDelete}
    />
  ), [isDark, colors, theme.colors.primary, theme.colors.onSurface, theme.colors.onSurfaceVariant, theme.colors.error, canManage, openCustomer, startEdit, startDelete]);

  const headerCreateAction = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add customer"
      onPress={() => setEditing(null)}
      style={({ pressed }) => [
        styles.headerCreateBtn,
        {
          backgroundColor: pressed ? colors.primaryStrong : theme.colors.primary,
          shadowColor: isDark ? '#000000' : colors.primaryStrong
        }
      ]}
    >
      <MaterialCommunityIcons name="account-plus-outline" size={23} color={theme.colors.onPrimary} />
    </Pressable>
  );

  return (
    <Screen title="Customers" scroll={false} headerAction={canManage ? headerCreateAction : undefined} contentStyle={styles.screenContent}>
      {stickyHeader}
      <FlatList
        data={customers}
        keyExtractor={(item) => item._id}
        style={styles.list}
        contentContainerStyle={[styles.listContent, !customers.length && styles.emptyListContent]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshing={isRefreshing}
        onRefresh={() => query.refetch()}
        onEndReached={loadMoreCustomers}
        onEndReachedThreshold={0.35}
        removeClippedSubviews
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        ListEmptyComponent={isInitialLoading ? <ActivityIndicator color={theme.colors.primary} style={styles.emptyLoader} /> : <EmptyState title="No customers" message="Add customers once and reuse them in every invoice." actionLabel={canManage ? 'Add customer' : undefined} onAction={canManage ? () => setEditing(null) : undefined} />}
        ListFooterComponent={renderCustomersFooter}
        renderItem={renderCustomerCard}
      />
      <CustomerFormSheet
        visible={editing !== undefined}
        isEdit={Boolean(editing?._id)}
        form={form}
        saving={save.isPending}
        onSubmit={form.handleSubmit((values) => save.mutate(values))}
        onClose={() => setEditing(undefined)}
      />
      <CustomerFilterSheet
        visible={filtersOpen}
        values={draftFilterValues}
        onChange={setDraftFilterValues}
        onClose={() => setFiltersOpen(false)}
        onApply={applyDraft}
      />
      <ConfirmDialog visible={Boolean(deleting)} title="Delete customer?" message="This removes the customer from your saved list. Existing invoices remain unchanged." onCancel={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting._id)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  activeFilterLabel: { ...fontStyles.bold, fontSize: 11, letterSpacing: 0.3 },
  activeFilterPill: { alignItems: 'center', borderRadius: radii.pill, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 10, paddingVertical: 4 },
  avatar: { alignItems: 'center', borderRadius: radii.pill, height: 44, justifyContent: 'center', width: 44 },
  avatarText: { ...fontStyles.bold, fontSize: 15, letterSpacing: 0.4 },
  cardBottom: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  cardDivider: { height: 1, marginBottom: 12, marginTop: 14 },
  cardSubtitle: { ...typeScale.caption, fontSize: 12, marginTop: 2 },
  cardTitle: { ...fontStyles.bold, fontSize: 15, letterSpacing: -0.2 },
  cardTitleBlock: { flex: 1, minWidth: 0 },
  cardTop: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  contactChips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6, minWidth: 0 },
  contactPill: { alignItems: 'center', borderRadius: radii.pill, borderWidth: 1, flexDirection: 'row', flexShrink: 1, gap: 5, maxWidth: '100%', paddingHorizontal: 9, paddingVertical: 4 },
  contactPillText: { ...fontStyles.semiBold, flexShrink: 1, fontSize: 11 },
  countBold: { ...fontStyles.bold },
  countStrip: { flex: 1, minWidth: 0 },
  countText: { ...typeScale.caption, fontSize: 12 },
  customerCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    elevation: 2,
    marginBottom: 12,
    padding: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16
  },
  emptyListContent: { flexGrow: 1 },
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
  headerMetaRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  iconAction: { alignItems: 'center', borderRadius: radii.pill, height: 30, justifyContent: 'center', width: 30 },
  iconActions: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  list: { flex: 1 },
  listContent: { paddingBottom: 24 },
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
  stickyHeader: { gap: 12, marginBottom: 10, paddingBottom: 4, paddingTop: 4 }
});
