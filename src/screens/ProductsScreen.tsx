import { useEffect, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
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
import { Product } from '@/types';
import { formatCurrency, formatDate } from '@/utils/format';
import { productSchema } from '@/validation/schemas';

const PAGE_SIZE = 10;
const blankProduct = { name: '', price: '', stockQuantity: '', sku: '', category: '', lowStockThreshold: '5' };

export function ProductsScreen({ navigation, route }: any) {
  const queryClient = useQueryClient();
  const theme = useTheme();
  const { showDialog } = useAppDialog();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Product | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const form = useForm<any>({ defaultValues: blankProduct, resolver: zodResolver(productSchema) });
  const highlighted = route?.params?.highlight;
  const query = useInfiniteQuery({ queryKey: ['products', search], initialPageParam: 1, queryFn: ({ pageParam }) => productsApi.page({ search, page: pageParam, limit: PAGE_SIZE }), getNextPageParam: (lastPage) => lastPage.pagination.nextPage });
  const products = useMemo(() => query.data?.pages.flatMap((page) => page.products) ?? [], [query.data]);
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

  return (
    <Screen title="Products" scroll={false}>
      <View style={{ gap: 10, marginBottom: 12 }}>
        <TextInput mode="outlined" placeholder="Search products" value={search} onChangeText={setSearch} left={<TextInput.Icon icon="magnify" />} />
        <View style={{ flexDirection: 'row', gap: 8 }}><Button mode="contained" onPress={() => setEditing(null)} style={{ flex: 1 }}>Add product</Button><Button mode="outlined" onPress={() => navigation.navigate('Customers')}>Customers</Button></View>
        {highlighted ? <Text style={{ color: theme.colors.onSurfaceVariant }}>Showing alert for product {highlighted}</Text> : null}
      </View>
      <FlatList
        data={products}
        keyExtractor={(item) => item._id}
        refreshing={query.isRefetching}
        onRefresh={() => query.refetch()}
        onEndReached={() => query.hasNextPage && query.fetchNextPage()}
        ListEmptyComponent={!query.isLoading ? <EmptyState title="No products" message="Add your first product to speed up invoice creation." actionLabel="Add product" onAction={() => setEditing(null)} /> : null}
        renderItem={({ item }) => <AppCard style={item._id === highlighted ? { borderWidth: 1, borderColor: theme.colors.primary } : undefined}>
          <Text variant="titleMedium" style={{ fontWeight: '900' }}>{item.name}</Text>
          <Text style={{ color: theme.colors.onSurfaceVariant }}>{[item.sku, item.category].filter(Boolean).join(' · ') || 'No SKU/category'}</Text>
          <Text style={{ marginTop: 4 }}>{formatCurrency(item.price)} · Stock {item.stockQuantity}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}><Button mode="outlined" onPress={() => setEditing(item)}>Edit</Button><Button mode="outlined" onPress={() => setHistoryProduct(item)}>History</Button><Button mode="outlined" textColor={theme.colors.error} onPress={() => setDeleting(item)}>Delete</Button></View>
        </AppCard>}
      />
      <Portal>
        <Dialog visible={editing !== undefined} onDismiss={() => setEditing(undefined)}><Dialog.Title>{editing?._id ? 'Edit product' : 'Add product'}</Dialog.Title><Dialog.Content>
          <FormTextInput control={form.control} name="name" label="Name" /><FormTextInput control={form.control} name="price" label="Price" keyboardType="decimal-pad" /><FormTextInput control={form.control} name="stockQuantity" label="Stock" keyboardType="number-pad" /><FormTextInput control={form.control} name="sku" label="SKU" /><FormTextInput control={form.control} name="category" label="Category" /><FormTextInput control={form.control} name="lowStockThreshold" label="Low stock alert" keyboardType="number-pad" />
        </Dialog.Content><Dialog.Actions><Button onPress={() => setEditing(undefined)}>Cancel</Button><Button loading={save.isPending} onPress={form.handleSubmit((values) => save.mutate(values))}>Save</Button></Dialog.Actions></Dialog>
        <Dialog visible={Boolean(historyProduct)} onDismiss={() => setHistoryProduct(null)}><Dialog.Title>{historyProduct?.name} stock history</Dialog.Title><Dialog.ScrollArea><FlatList data={history.data?.movements || []} keyExtractor={(item) => item._id} renderItem={({ item }) => <List.Item title={item.type.replace(/_/g, ' ')} description={`${item.quantityChange > 0 ? '+' : ''}${item.quantityChange} · ${formatDate(item.createdAt)}\n${item.note || ''}`} />} /></Dialog.ScrollArea><Dialog.Actions><Button onPress={() => setHistoryProduct(null)}>Close</Button></Dialog.Actions></Dialog>
      </Portal>
      <ConfirmDialog visible={Boolean(deleting)} title="Delete product?" message="This removes the product from your saved list. Existing invoices remain unchanged." onCancel={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting._id)} />
    </Screen>
  );
}
