import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Button, Dialog, List, Portal, Text, TextInput, useTheme } from 'react-native-paper';
import { productsApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { AppCard } from '@/components/AppCard';
import { useAppDialog } from '@/components/AppDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { FormTextInput } from '@/components/FormTextInput';
import { Screen } from '@/components/Screen';
import { appColors, fontStyles, radii, spacing, typeScale } from '@/theme/theme';
import { Product } from '@/types';
import { formatCurrency, formatDate } from '@/utils/format';
import { productSchema } from '@/validation/schemas';

const PAGE_SIZE = 10;
const blankProduct = { name: '', price: '', stockQuantity: '', sku: '', category: '', lowStockThreshold: '5' };
type ProductFilters = { search: string; category: string };
const emptyProductFilters: ProductFilters = { search: '', category: '' };

export function ProductsScreen({ navigation, route }: any) {
  const queryClient = useQueryClient();
  const theme = useTheme();
  const colors = appColors(theme.dark);
  const { showDialog } = useAppDialog();
  const [filters, setFilters] = useState<ProductFilters>(emptyProductFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftCategory, setDraftCategory] = useState('');
  const [editing, setEditing] = useState<Product | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const form = useForm<any>({ defaultValues: blankProduct, resolver: zodResolver(productSchema) });
  const highlighted = route?.params?.highlight;
  const query = useInfiniteQuery({ queryKey: ['products', filters], initialPageParam: 1, queryFn: ({ pageParam }) => productsApi.page({ ...filters, page: pageParam, limit: PAGE_SIZE }), getNextPageParam: (lastPage) => lastPage.pagination.nextPage });
  const products = useMemo(() => query.data?.pages.flatMap((page) => page.products) ?? [], [query.data]);
  const isInitialLoading = query.isLoading && !products.length;
  const isRefreshing = query.isRefetching && !query.isFetchingNextPage;
  const activeFilterCount = filters.category ? 1 : 0;
  const save = useMutation({ mutationFn: (values: any) => {
    const payload = { ...values, price: Number(values.price), stockQuantity: Number(values.stockQuantity), lowStockThreshold: values.lowStockThreshold === '' ? 5 : Number(values.lowStockThreshold) };
    return editing?._id ? productsApi.update(editing._id, payload) : productsApi.create(payload);
  }, onSuccess: () => { setEditing(undefined); queryClient.invalidateQueries({ queryKey: ['products'] }); }, onError: (error) => showDialog({ title: 'Could not save product', message: apiErrorMessage(error), tone: 'error' }) });
  const remove = useMutation({ mutationFn: (id: string) => productsApi.remove(id), onSuccess: () => { setDeleting(null); queryClient.invalidateQueries({ queryKey: ['products'] }); }, onError: (error) => showDialog({ title: 'Could not delete product', message: apiErrorMessage(error), tone: 'error' }) });
  const history = useQuery({ queryKey: ['products', historyProduct?._id, 'stock-movements'], enabled: Boolean(historyProduct), queryFn: () => productsApi.stockMovementsPage(historyProduct!._id, { page: 1, limit: 30 }) });

  useEffect(() => {
    if (editing === undefined) return;
    form.reset(editing ? { name: editing.name, price: String(editing.price), stockQuantity: String(editing.stockQuantity), sku: editing.sku || '', category: editing.category || '', lowStockThreshold: String(editing.lowStockThreshold ?? 5) } : blankProduct);
  }, [editing, form]);

  const loadMoreProducts = () => {
    if (!query.hasNextPage || query.isFetching || isInitialLoading) return;
    void query.fetchNextPage();
  };

  const openFilters = () => {
    setDraftCategory(filters.category);
    setFiltersOpen(true);
  };

  const applyFilters = () => {
    setFilters((current) => ({ ...current, category: draftCategory.trim() }));
    setFiltersOpen(false);
  };

  const clearFilters = () => {
    setDraftCategory('');
    setFilters((current) => ({ ...current, category: '' }));
    setFiltersOpen(false);
  };

  const renderProductsHeader = () => (
    <View style={styles.listHeader}>
      <TextInput mode="outlined" placeholder="Search products" value={filters.search} onChangeText={(search) => setFilters((current) => ({ ...current, search }))} left={<TextInput.Icon icon={({ size, color }) => <Feather name="search" size={size} color={color} />} />} outlineColor={theme.colors.outlineVariant} activeOutlineColor={theme.colors.primary} outlineStyle={styles.inputOutline} style={{ backgroundColor: theme.dark ? colors.surface : colors.card }} />
      <View style={styles.actionsRow}><Button mode="outlined" icon={({ size, color }) => <Feather name="filter" size={size} color={color} />} onPress={openFilters} style={styles.filterButton}>{activeFilterCount ? `Filters (${activeFilterCount})` : 'Filters'}</Button><Button mode="contained" onPress={() => setEditing(null)} style={styles.growButton}>Add product</Button></View>
      <Button mode="outlined" onPress={() => navigation.navigate('Customers')} style={styles.customersButton}>Customers</Button>
      {highlighted ? <Text style={{ color: theme.colors.onSurfaceVariant }}>Showing alert for product {highlighted}</Text> : null}
    </View>
  );

  const renderProductsFooter = () => {
    if (query.isFetchingNextPage) return <ActivityIndicator color={theme.colors.primary} style={styles.footerLoader} />;
    if (!query.hasNextPage && products.length) return <Text style={[styles.endText, { color: theme.colors.onSurfaceVariant }]}>All products loaded</Text>;
    return null;
  };

  const renderProductCard = ({ item }: { item: Product }) => {
    const isLowStock = Boolean(item.isLowStock || item.stockQuantity <= item.lowStockThreshold);
    const stockColor = isLowStock ? colors.destructive : colors.accent;
    const cardStyle = item._id === highlighted ? { borderWidth: 1, borderColor: theme.colors.primary } : undefined;

    return (
      <AppCard style={cardStyle}>
        <View style={styles.cardHeader}>
          <View style={[styles.avatar, { backgroundColor: isLowStock ? colors.destructiveSoft : colors.primarySoft }]}>
            <Feather name="package" size={23} color={isLowStock ? colors.destructive : colors.primary} />
          </View>
          <View style={styles.cardTitleBlock}>
            <Text variant="titleMedium" numberOfLines={1} style={styles.cardTitle}>{item.name}</Text>
            <View style={styles.chipRow}>
              <View style={[styles.softChip, { backgroundColor: theme.dark ? colors.surface : theme.colors.surfaceVariant }]}>
                <Text numberOfLines={1} variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{item.sku || 'No SKU'}</Text>
              </View>
              {item.category ? (
                <View style={[styles.softChip, { backgroundColor: colors.primarySoft }]}>
                  <Text numberOfLines={1} variant="labelSmall" style={{ color: theme.colors.primary }}>{item.category}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
        <View style={styles.metricGrid}>
          <View style={[styles.metricBox, { backgroundColor: theme.dark ? colors.surface : theme.colors.surfaceVariant, borderColor: theme.colors.outlineVariant }]}>
            <Feather name="tag" size={18} color={theme.colors.primary} />
            <View>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Price</Text>
              <Text style={styles.metricValue}>{formatCurrency(item.price)}</Text>
            </View>
          </View>
          <View style={[styles.metricBox, { backgroundColor: theme.dark ? colors.surface : theme.colors.surfaceVariant, borderColor: theme.colors.outlineVariant }]}>
            <Feather name={isLowStock ? 'alert-circle' : 'box'} size={18} color={stockColor} />
            <View>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Stock</Text>
              <Text style={[styles.metricValue, { color: stockColor }]}>{item.stockQuantity}</Text>
            </View>
          </View>
        </View>
        <View style={styles.cardActions}>
          <Button mode="text" icon={({ size, color }) => <Feather name="edit-2" size={size} color={color} />} compact onPress={() => setEditing(item)}>Edit</Button>
          <Button mode="text" icon={({ size, color }) => <Feather name="clock" size={size} color={color} />} compact onPress={() => setHistoryProduct(item)}>History</Button>
          <Button mode="text" icon={({ size, color }) => <Feather name="trash-2" size={size} color={color} />} compact textColor={theme.colors.error} onPress={() => setDeleting(item)}>Delete</Button>
        </View>
      </AppCard>
    );
  };

  return (
    <Screen title="Products" scroll={false} contentStyle={styles.screenContent}>
      <FlatList
        data={products}
        keyExtractor={(item) => item._id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshing={isRefreshing}
        onRefresh={() => query.refetch()}
        onEndReached={loadMoreProducts}
        onEndReachedThreshold={0.35}
        ListHeaderComponent={renderProductsHeader}
        ListEmptyComponent={isInitialLoading ? <ActivityIndicator color={theme.colors.primary} style={styles.emptyLoader} /> : <EmptyState title="No products" message="Add your first product to speed up invoice creation." actionLabel="Add product" onAction={() => setEditing(null)} />}
        ListFooterComponent={renderProductsFooter}
        renderItem={renderProductCard}
      />
      <Portal>
        <Dialog visible={filtersOpen} onDismiss={() => setFiltersOpen(false)}><Dialog.Title>Filter products</Dialog.Title><Dialog.Content>
          <Text variant="labelLarge" style={styles.dialogLabel}>Category</Text>
          <TextInput mode="outlined" label="Category" placeholder="e.g. Services, Parts" value={draftCategory} onChangeText={setDraftCategory} outlineStyle={styles.inputOutline} />
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>Matches saved product category exactly.</Text>
        </Dialog.Content><Dialog.Actions><Button onPress={clearFilters}>Clear</Button><Button onPress={() => setFiltersOpen(false)}>Cancel</Button><Button mode="contained" onPress={applyFilters}>Apply</Button></Dialog.Actions></Dialog>
        <Dialog visible={editing !== undefined} onDismiss={() => setEditing(undefined)}><Dialog.Title>{editing?._id ? 'Edit product' : 'Add product'}</Dialog.Title><Dialog.Content>
          <FormTextInput control={form.control} name="name" label="Name" /><FormTextInput control={form.control} name="price" label="Price" keyboardType="decimal-pad" /><FormTextInput control={form.control} name="stockQuantity" label="Stock" keyboardType="number-pad" /><FormTextInput control={form.control} name="sku" label="SKU" /><FormTextInput control={form.control} name="category" label="Category" /><FormTextInput control={form.control} name="lowStockThreshold" label="Low stock alert" keyboardType="number-pad" />
        </Dialog.Content><Dialog.Actions><Button onPress={() => setEditing(undefined)}>Cancel</Button><Button loading={save.isPending} onPress={form.handleSubmit((values) => save.mutate(values))}>Save</Button></Dialog.Actions></Dialog>
        <Dialog visible={Boolean(historyProduct)} onDismiss={() => setHistoryProduct(null)}><Dialog.Title>{historyProduct?.name} stock history</Dialog.Title><Dialog.ScrollArea><FlatList data={history.data?.movements || []} keyExtractor={(item) => item._id} renderItem={({ item }) => <List.Item title={item.type.replace(/_/g, ' ')} description={`${item.quantityChange > 0 ? '+' : ''}${item.quantityChange} · ${formatDate(item.createdAt)}\n${item.note || ''}`} />} /></Dialog.ScrollArea><Dialog.Actions><Button onPress={() => setHistoryProduct(null)}>Close</Button></Dialog.Actions></Dialog>
      </Portal>
      <ConfirmDialog visible={Boolean(deleting)} title="Delete product?" message="This removes the product from your saved list. Existing invoices remain unchanged." onCancel={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting._id)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionsRow: { flexDirection: 'row', gap: 8 },
  avatar: { alignItems: 'center', borderRadius: radii.card, height: 44, justifyContent: 'center', width: 44 },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end', marginTop: 12 },
  cardHeader: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  cardTitle: { ...typeScale.sectionTitle, letterSpacing: -0.2 },
  cardTitleBlock: { flex: 1, minWidth: 0 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  customersButton: { borderRadius: radii.input },
  dialogLabel: { ...fontStyles.medium, marginBottom: 8 },
  emptyLoader: { marginTop: 40 },
  endText: { marginVertical: 16, textAlign: 'center' },
  filterButton: { borderRadius: radii.input, flex: 1 },
  footerLoader: { marginVertical: 16 },
  growButton: { borderRadius: radii.input, flex: 1 },
  inputOutline: { borderRadius: radii.input },
  list: { flex: 1 },
  listContent: { paddingBottom: 24 },
  listHeader: { gap: 10, marginBottom: 12 },
  metricBox: { alignItems: 'center', borderRadius: radii.card, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 10, padding: spacing.cardPaddingCompact },
  metricGrid: { flexDirection: 'row', gap: spacing.gridGap, marginTop: 14 },
  metricValue: { ...typeScale.cardValue, marginTop: 2 },
  softChip: { borderRadius: 999, maxWidth: 140, paddingHorizontal: 9, paddingVertical: 4 },
  screenContent: { flex: 1 }
});
