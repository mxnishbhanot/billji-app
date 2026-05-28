import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput as RNTextInput, View, type TextStyle } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Button, Dialog, Portal, Text, useTheme } from 'react-native-paper';
import { productsApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { useAppDialog } from '@/components/AppDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { FormTextInput } from '@/components/FormTextInput';
import { ProductHistorySheet } from '@/components/ProductHistorySheet';
import {
  ProductFilterSheet,
  ProductFilterValues,
  ProductPricePreset,
  ProductSortOption,
  ProductStockPreset,
  defaultProductFilterValues,
  resolveProductPriceRange
} from '@/components/ProductFilterSheet';
import { Screen } from '@/components/Screen';
import { ProductsScreenProps } from '@/navigation/types';
import { PERMISSION, usePermissions } from '@/shared/hooks/usePermissions';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { queryKeys } from '@/shared/query/queryKeys';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import { Product, ProductFormValues } from '@/types';
import { formatCurrency, formatDate } from '@/utils/format';
import { productSchema } from '@/validation/schemas';

const PAGE_SIZE = 10;
const blankProduct = { name: '', price: '', stockQuantity: '', sku: '', category: '', lowStockThreshold: '5' };
type ProductFilters = ProductFilterValues & { search: string };
const emptyProductFilters: ProductFilters = { search: '', ...defaultProductFilterValues };

const STOCK_LABELS: Record<ProductStockPreset, string> = {
  all: 'All stock',
  available: 'Available',
  low: 'Low stock',
  out: 'Out of stock'
};
const PRICE_LABELS: Record<ProductPricePreset, string> = {
  any: 'Any price',
  'under-500': 'Under ₹500',
  '500-2000': '₹500 – ₹2k',
  'over-2000': 'Over ₹2k'
};
const SORT_LABELS: Record<ProductSortOption, string> = {
  updated: 'Recently updated',
  'top-sales': 'Top sales',
  'name-asc': 'Name A-Z',
  'price-high': 'Highest price',
  'price-low': 'Lowest price',
  'stock-low': 'Lowest stock'
};
const webSearchInputStyle = { outlineStyle: 'none', outlineWidth: 0 } as unknown as TextStyle;
const reportRangeLabel = (range: { from?: string; to?: string }) => {
  if (!range.from && !range.to) return 'Any time';
  return `${range.from ? formatDate(range.from) : 'Start'} - ${range.to ? formatDate(range.to) : 'Today'}`;
};
const isProductSortOption = (value?: string): value is ProductSortOption => Boolean(value && value in SORT_LABELS);

export function ProductsScreen({ navigation, route }: ProductsScreenProps) {
  const queryClient = useQueryClient();
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const { showDialog } = useAppDialog();
  const { can } = usePermissions();
  const canManage = can(PERMISSION.productsManage);
  const routeFrom = route?.params?.from || '';
  const routeTo = route?.params?.to || '';
  const routeSort = route?.params?.sort;
  const reportRange = useMemo(() => route?.params?.fromReports && (routeFrom || routeTo) ? { from: routeFrom, to: routeTo } : null, [route?.params?.fromReports, routeFrom, routeTo]);
  const activeSort = route?.params?.fromReports && isProductSortOption(routeSort) ? routeSort : undefined;
  const [filters, setFilters] = useState<ProductFilters>(emptyProductFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftFilterValues, setDraftFilterValues] = useState<ProductFilterValues>(defaultProductFilterValues);
  const [editing, setEditing] = useState<Product | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const form = useForm<ProductFormValues>({ defaultValues: blankProduct, resolver: zodResolver(productSchema) });
  const highlighted = route?.params?.highlight;
  const debouncedSearch = useDebouncedValue(filters.search, 300);
  const queryParams = useMemo(() => {
    const { minPrice, maxPrice } = resolveProductPriceRange(filters.priceRange);
    return {
      search: debouncedSearch,
      category: filters.category,
      stockStatus: filters.stockStatus,
      minPrice,
      maxPrice,
      from: reportRange?.from || '',
      to: reportRange?.to || '',
      sort: activeSort || filters.sort
    };
  }, [debouncedSearch, filters.category, filters.stockStatus, filters.priceRange, filters.sort, reportRange, activeSort]);
  const query = useInfiniteQuery({ queryKey: queryKeys.products.list(queryParams), initialPageParam: 1, queryFn: ({ pageParam }) => productsApi.page({ ...queryParams, page: pageParam, limit: PAGE_SIZE }), getNextPageParam: (lastPage) => lastPage.pagination.nextPage });
  const categoriesQuery = useQuery({ queryKey: queryKeys.products.categories, queryFn: productsApi.categories });
  const products = useMemo(() => query.data?.pages.flatMap((page) => page.products) ?? [], [query.data]);
  const isInitialLoading = query.isLoading && !products.length;
  const isRefreshing = query.isRefetching && !query.isFetchingNextPage;
  const activeFilterCount = (filters.category ? 1 : 0) +
    (filters.stockStatus !== 'all' ? 1 : 0) +
    (filters.priceRange !== 'any' ? 1 : 0) +
    ((activeSort || filters.sort) !== 'updated' ? 1 : 0);
  const totalCount = query.data?.pages[0]?.pagination.total ?? 0;
  const visibleCount = products.length;
  const save = useMutation({ mutationFn: (values: ProductFormValues) => {
    const payload = { ...values, price: Number(values.price), stockQuantity: Number(values.stockQuantity), lowStockThreshold: values.lowStockThreshold === '' ? 5 : Number(values.lowStockThreshold) };
    return editing?._id ? productsApi.update(editing._id, payload) : productsApi.create(payload);
  }, onSuccess: () => { setEditing(undefined); queryClient.invalidateQueries({ queryKey: queryKeys.products.all }); }, onError: (error) => showDialog({ title: 'Could not save product', message: apiErrorMessage(error), tone: 'error' }) });
  const remove = useMutation({ mutationFn: (id: string) => productsApi.remove(id), onSuccess: () => { setDeleting(null); queryClient.invalidateQueries({ queryKey: queryKeys.products.all }); }, onError: (error) => showDialog({ title: 'Could not delete product', message: apiErrorMessage(error), tone: 'error' }) });
  const history = useQuery({ queryKey: queryKeys.products.stockMovements(historyProduct?._id), enabled: Boolean(historyProduct), queryFn: () => productsApi.stockMovementsPage(historyProduct!._id, { page: 1, limit: 30 }) });

  useEffect(() => {
    if (editing === undefined) return;
    form.reset(editing ? { name: editing.name, price: String(editing.price), stockQuantity: String(editing.stockQuantity), sku: editing.sku || '', category: editing.category || '', lowStockThreshold: String(editing.lowStockThreshold ?? 5) } : blankProduct);
  }, [editing, form]);

  const loadMoreProducts = () => {
    if (!query.hasNextPage || query.isFetching || isInitialLoading) return;
    void query.fetchNextPage();
  };

  const openFilters = () => {
    setDraftFilterValues({
      category: filters.category,
      stockStatus: filters.stockStatus,
      priceRange: filters.priceRange,
      sort: filters.sort
    });
    setFiltersOpen(true);
  };

  const applyDraft = () => {
    navigation.setParams({ fromReports: false, from: '', to: '', sort: undefined });
    setFilters((current) => ({ ...current, ...draftFilterValues, category: draftFilterValues.category.trim() }));
    setFiltersOpen(false);
  };

  const activeFilterTags: { key: string; label: string; onClear: () => void }[] = [
    filters.category ? { key: 'category', label: filters.category, onClear: () => setFilters((current) => ({ ...current, category: '' })) } : null,
    reportRange && (activeSort || filters.sort) === 'top-sales' ? { key: 'range', label: reportRangeLabel(reportRange), onClear: () => navigation.setParams({ fromReports: false, from: '', to: '' }) } : null,
    filters.stockStatus !== 'all' ? { key: 'stock', label: STOCK_LABELS[filters.stockStatus], onClear: () => setFilters((current) => ({ ...current, stockStatus: 'all' })) } : null,
    filters.priceRange !== 'any' ? { key: 'price', label: PRICE_LABELS[filters.priceRange], onClear: () => setFilters((current) => ({ ...current, priceRange: 'any' })) } : null,
    (activeSort || filters.sort) !== 'updated' ? { key: 'sort', label: SORT_LABELS[activeSort || filters.sort], onClear: () => {
      navigation.setParams({ sort: undefined });
      setFilters((current) => ({ ...current, sort: 'updated' }));
    } } : null
  ].filter(Boolean) as { key: string; label: string; onClear: () => void }[];

  const stickyHeader = (
    <View style={[styles.stickyHeader, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.searchWrap, { backgroundColor: colors.card, borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.1) }]}>
        <Feather name="search" size={18} color={theme.colors.onSurfaceVariant} />
        <RNTextInput
          placeholder="Search products, SKU, or category"
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
            {' '}product{totalCount === 1 ? '' : 's'}
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

      {highlighted ? (
        <View style={[styles.alertStrip, { backgroundColor: alpha(colors.warning, isDark ? 0.18 : 0.1), borderColor: alpha(colors.warning, isDark ? 0.28 : 0.22) }]}>
          <Feather name="bell" size={14} color={colors.warning} />
          <Text numberOfLines={1} style={[styles.alertText, { color: theme.colors.onSurface }]}>Showing alert for product {highlighted}</Text>
        </View>
      ) : null}
    </View>
  );

  const renderProductsFooter = () => {
    if (query.isFetchingNextPage) return <ActivityIndicator color={theme.colors.primary} style={styles.footerLoader} />;
    if (!query.hasNextPage && products.length) return <Text style={[styles.endText, { color: theme.colors.onSurfaceVariant }]}>All products loaded</Text>;
    return null;
  };

  const renderProductCard = ({ item }: { item: Product }) => {
    const isLowStock = Boolean(item.isLowStock || item.stockQuantity <= item.lowStockThreshold);
    const stockTone = isLowStock ? colors.destructive : colors.accent;
    const highlightedCard = item._id === highlighted;
    const productMeta = [item.sku || 'No SKU', item.category].filter(Boolean).join('  ·  ');

    return (
      <View
        style={[
          styles.productCard,
          {
            backgroundColor: colors.card,
            borderColor: highlightedCard ? theme.colors.primary : isDark ? colors.border : alpha(colors.primaryStrong, 0.08),
            shadowColor: isDark ? '#000000' : colors.primaryStrong
          }
        ]}
      >
        <View style={styles.cardTop}>
          <View style={[styles.avatar, { backgroundColor: alpha(stockTone, isDark ? 0.2 : 0.12) }]}>
            <Feather name={isLowStock ? 'alert-triangle' : 'package'} size={21} color={stockTone} />
          </View>
          <View style={styles.cardTitleBlock}>
            <Text numberOfLines={1} style={[styles.cardTitle, { color: theme.colors.onSurface }]}>{item.name}</Text>
            <Text numberOfLines={1} style={[styles.productMeta, { color: theme.colors.onSurfaceVariant }]}>{productMeta}</Text>
          </View>
          <View style={styles.amountBlock}>
            <Text numberOfLines={1} style={[styles.priceText, { color: theme.colors.onSurface }]}>{formatCurrency(item.price)}</Text>
            {(activeSort || filters.sort) === 'top-sales' ? (
              <Text numberOfLines={1} style={[styles.salesMeta, { color: colors.accent }]}>
                {formatCurrency(item.totalSales)} sold
              </Text>
            ) : null}
          </View>
        </View>
        <View style={[styles.cardDivider, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.06) }]} />
        <View style={styles.cardBottom}>
          <View style={[styles.stockPill, { backgroundColor: alpha(stockTone, isDark ? 0.18 : 0.1), borderColor: alpha(stockTone, isDark ? 0.32 : 0.24) }]}>
            <Feather name={isLowStock ? 'alert-circle' : 'check-circle'} size={13} color={stockTone} />
            <Text style={[styles.stockPillText, { color: stockTone }]}>
              {item.stockQuantity} in stock{isLowStock ? ' · Low' : ''}
            </Text>
          </View>
          <View style={styles.iconActions}>
            {canManage ? (
              <Pressable onPress={() => setEditing(item)} hitSlop={8} style={[styles.iconAction, { backgroundColor: alpha(colors.primary, isDark ? 0.16 : 0.08) }]}>
                <Feather name="edit-2" size={14} color={theme.colors.primary} />
              </Pressable>
            ) : null}
            <Pressable onPress={() => setHistoryProduct(item)} hitSlop={8} style={[styles.iconAction, { backgroundColor: isDark ? colors.surface : alpha(colors.primaryStrong, 0.05) }]}>
              <Feather name="clock" size={14} color={theme.colors.onSurfaceVariant} />
            </Pressable>
            {canManage ? (
              <Pressable onPress={() => setDeleting(item)} hitSlop={8} style={[styles.iconAction, { backgroundColor: alpha(colors.destructive, isDark ? 0.16 : 0.08) }]}>
                <Feather name="trash-2" size={14} color={theme.colors.error} />
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  const headerCreateAction = (
    <Pressable
      onPress={() => setEditing(null)}
      style={({ pressed }) => [
        styles.headerCreateBtn,
        {
          backgroundColor: pressed ? colors.primaryStrong : theme.colors.primary,
          shadowColor: isDark ? '#000000' : colors.primaryStrong
        }
      ]}
    >
      <MaterialCommunityIcons name="package-variant-plus" size={23} color="#FFFFFF" />
    </Pressable>
  );

  return (
    <Screen title="Inventory" scroll={false} headerAction={canManage ? headerCreateAction : undefined} contentStyle={styles.screenContent}>
      {stickyHeader}
      <FlatList
        data={products}
        keyExtractor={(item) => item._id}
        style={styles.list}
        contentContainerStyle={[styles.listContent, !products.length && styles.emptyListContent]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshing={isRefreshing}
        onRefresh={() => query.refetch()}
        onEndReached={loadMoreProducts}
        onEndReachedThreshold={0.35}
        removeClippedSubviews
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        ListEmptyComponent={isInitialLoading ? <ActivityIndicator color={theme.colors.primary} style={styles.emptyLoader} /> : <EmptyState title="No products" message="Add your first product to speed up invoice creation." actionLabel={canManage ? 'Add product' : undefined} onAction={canManage ? () => setEditing(null) : undefined} />}
        ListFooterComponent={renderProductsFooter}
        renderItem={renderProductCard}
      />
      <Portal>
        <Dialog visible={editing !== undefined} onDismiss={() => setEditing(undefined)}><Dialog.Title>{editing?._id ? 'Edit product' : 'Add product'}</Dialog.Title><Dialog.Content>
          <FormTextInput control={form.control} name="name" label="Name" /><FormTextInput control={form.control} name="price" label="Price" keyboardType="decimal-pad" /><FormTextInput control={form.control} name="stockQuantity" label="Stock" keyboardType="number-pad" /><FormTextInput control={form.control} name="sku" label="SKU" /><FormTextInput control={form.control} name="category" label="Category" /><FormTextInput control={form.control} name="lowStockThreshold" label="Low stock alert" keyboardType="number-pad" />
        </Dialog.Content><Dialog.Actions><Button onPress={() => setEditing(undefined)}>Cancel</Button><Button loading={save.isPending} onPress={form.handleSubmit((values) => save.mutate(values))}>Save</Button></Dialog.Actions></Dialog>
      </Portal>
      <ProductHistorySheet
        visible={Boolean(historyProduct)}
        product={historyProduct}
        history={history.data}
        loading={history.isLoading}
        onClose={() => setHistoryProduct(null)}
      />
      <ProductFilterSheet
        visible={filtersOpen}
        values={draftFilterValues}
        categories={categoriesQuery.data ?? []}
        categoriesLoading={categoriesQuery.isLoading}
        onChange={setDraftFilterValues}
        onClose={() => setFiltersOpen(false)}
        onApply={applyDraft}
      />
      <ConfirmDialog visible={Boolean(deleting)} title="Delete product?" message="This removes the product from your saved list. Existing invoices remain unchanged." onCancel={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting._id)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  amountBlock: { alignItems: 'flex-end', maxWidth: 112 },
  activeFilterLabel: { ...fontStyles.bold, fontSize: 11, letterSpacing: 0.3 },
  activeFilterPill: { alignItems: 'center', borderRadius: radii.pill, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 10, paddingVertical: 4 },
  alertStrip: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 9 },
  alertText: { ...fontStyles.semiBold, flex: 1, fontSize: 12 },
  avatar: { alignItems: 'center', borderRadius: 14, height: 46, justifyContent: 'center', width: 46 },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end', marginTop: 14 },
  cardBottom: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  cardDivider: { height: 1, marginBottom: 14, marginTop: 14 },
  cardTitle: { ...fontStyles.bold, fontSize: 15, letterSpacing: -0.2 },
  cardTitleBlock: { flex: 1, minWidth: 0 },
  cardTop: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  countBold: { ...fontStyles.bold },
  countStrip: { flex: 1, minWidth: 0 },
  countText: { ...typeScale.caption, fontSize: 12 },
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
  historyEmptyText: { ...typeScale.caption, marginVertical: 20, textAlign: 'center' },
  historyLoader: { marginVertical: 20 },
  iconAction: { alignItems: 'center', borderRadius: radii.pill, height: 30, justifyContent: 'center', width: 30 },
  iconActions: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  list: { flex: 1 },
  listContent: { paddingBottom: 24 },
  priceText: { ...fontStyles.bold, fontSize: 18, letterSpacing: -0.3 },
  salesMeta: { ...fontStyles.bold, fontSize: 11, marginTop: 2 },
  productCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    elevation: 2,
    marginBottom: 12,
    padding: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16
  },
  screenContent: { flex: 1 },
  productMeta: { ...typeScale.caption, fontSize: 12, marginTop: 2 },
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
  stickyHeader: { gap: 12, marginBottom: 10, paddingBottom: 4, paddingTop: 4 },
  stockPill: { alignItems: 'center', borderRadius: radii.pill, borderWidth: 1, flexDirection: 'row', flexShrink: 1, gap: 5, paddingHorizontal: 9, paddingVertical: 4 },
  stockPillText: { ...fontStyles.semiBold, fontSize: 11 },
});
