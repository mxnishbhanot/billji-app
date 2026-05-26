import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Button, Dialog, Portal, RadioButton, Text, TextInput, useTheme } from 'react-native-paper';
import { customersApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { AppCard } from '@/components/AppCard';
import { useAppDialog } from '@/components/AppDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { FormTextInput } from '@/components/FormTextInput';
import { PhoneInput } from '@/components/PhoneInput';
import { Screen } from '@/components/Screen';
import { appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import { Customer } from '@/types';
import { customerSchema } from '@/validation/schemas';

const PAGE_SIZE = 10;
const blankCustomer = { name: '', phone: '', countryCode: '+91', email: '', address: '' };
type CustomerFilters = { search: string; contactInfo: '' | 'withEmail' | 'withoutEmail' | 'withAddress' | 'withoutAddress' };
const emptyCustomerFilters: CustomerFilters = { search: '', contactInfo: '' };
const CONTACT_FILTERS: { label: string; value: CustomerFilters['contactInfo'] }[] = [
  { label: 'All customers', value: '' },
  { label: 'With email', value: 'withEmail' },
  { label: 'Missing email', value: 'withoutEmail' },
  { label: 'With address', value: 'withAddress' },
  { label: 'Missing address', value: 'withoutAddress' }
];

export function CustomersScreen() {
  const queryClient = useQueryClient();
  const theme = useTheme();
  const colors = appColors(theme.dark);
  const { showDialog } = useAppDialog();
  const [filters, setFilters] = useState<CustomerFilters>(emptyCustomerFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftContactInfo, setDraftContactInfo] = useState<CustomerFilters['contactInfo']>('');
  const [editing, setEditing] = useState<Customer | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  const form = useForm<any>({ defaultValues: blankCustomer, resolver: zodResolver(customerSchema) });
  const query = useInfiniteQuery({ queryKey: ['customers', filters], initialPageParam: 1, queryFn: ({ pageParam }) => customersApi.page({ ...filters, page: pageParam, limit: PAGE_SIZE }), getNextPageParam: (lastPage) => lastPage.pagination.nextPage });
  const customers = useMemo(() => query.data?.pages.flatMap((page) => page.customers) ?? [], [query.data]);
  const isInitialLoading = query.isLoading && !customers.length;
  const isRefreshing = query.isRefetching && !query.isFetchingNextPage;
  const activeFilterCount = filters.contactInfo ? 1 : 0;
  const save = useMutation({ mutationFn: (values: any) => editing?._id ? customersApi.update(editing._id, values) : customersApi.create(values), onSuccess: () => { setEditing(undefined); queryClient.invalidateQueries({ queryKey: ['customers'] }); }, onError: (error) => showDialog({ title: 'Could not save customer', message: apiErrorMessage(error), tone: 'error' }) });
  const remove = useMutation({ mutationFn: (id: string) => customersApi.remove(id), onSuccess: () => { setDeleting(null); queryClient.invalidateQueries({ queryKey: ['customers'] }); }, onError: (error) => showDialog({ title: 'Could not delete customer', message: apiErrorMessage(error), tone: 'error' }) });
  useEffect(() => { if (editing !== undefined) form.reset(editing || blankCustomer); }, [editing, form]);

  const loadMoreCustomers = () => {
    if (!query.hasNextPage || query.isFetching || isInitialLoading) return;
    void query.fetchNextPage();
  };

  const openFilters = () => {
    setDraftContactInfo(filters.contactInfo);
    setFiltersOpen(true);
  };

  const applyFilters = () => {
    setFilters((current) => ({ ...current, contactInfo: draftContactInfo }));
    setFiltersOpen(false);
  };

  const clearFilters = () => {
    setDraftContactInfo('');
    setFilters((current) => ({ ...current, contactInfo: '' }));
    setFiltersOpen(false);
  };

  const renderCustomersHeader = () => (
    <View style={styles.listHeader}>
      <TextInput mode="outlined" placeholder="Search customers" value={filters.search} onChangeText={(search) => setFilters((current) => ({ ...current, search }))} left={<TextInput.Icon icon={({ size, color }) => <Feather name="search" size={size} color={color} />} />} outlineColor={theme.colors.outlineVariant} activeOutlineColor={theme.colors.primary} outlineStyle={styles.inputOutline} style={{ backgroundColor: theme.dark ? colors.surface : colors.card }} />
      <View style={styles.actionsRow}><Button mode="outlined" icon={({ size, color }) => <Feather name="filter" size={size} color={color} />} onPress={openFilters} style={styles.filterButton}>{activeFilterCount ? `Filters (${activeFilterCount})` : 'Filters'}</Button><Button mode="contained" onPress={() => setEditing(null)} style={styles.growButton}>Add customer</Button></View>
    </View>
  );

  const renderCustomersFooter = () => {
    if (query.isFetchingNextPage) return <ActivityIndicator color={theme.colors.primary} style={styles.footerLoader} />;
    if (!query.hasNextPage && customers.length) return <Text style={[styles.endText, { color: theme.colors.onSurfaceVariant }]}>All customers loaded</Text>;
    return null;
  };

  const renderCustomerCard = ({ item }: { item: Customer }) => (
    <AppCard>
      <View style={styles.cardHeader}>
        <View style={[styles.avatar, { backgroundColor: colors.primarySoft }]}>
          <Feather name="user" size={23} color={theme.colors.primary} />
        </View>
        <View style={styles.cardTitleBlock}>
          <Text variant="titleMedium" numberOfLines={1} style={styles.cardTitle}>{item.name}</Text>
          <Text numberOfLines={1} style={[styles.cardSubtitle, { color: theme.colors.onSurfaceVariant }]}>Customer profile</Text>
        </View>
      </View>
      <View style={styles.metaBlock}>
        <View style={styles.metaRow}>
          <Feather name="phone" size={17} color={theme.colors.onSurfaceVariant} />
          <Text style={styles.metaText}>{item.countryCode || '+91'} {item.phone}</Text>
        </View>
        {item.email ? (
          <View style={styles.metaRow}>
            <Feather name="mail" size={17} color={theme.colors.onSurfaceVariant} />
            <Text numberOfLines={1} style={[styles.metaText, { color: theme.colors.onSurfaceVariant }]}>{item.email}</Text>
          </View>
        ) : null}
        {item.address ? (
          <View style={styles.metaRow}>
            <Feather name="map-pin" size={17} color={theme.colors.onSurfaceVariant} />
            <Text numberOfLines={1} style={[styles.metaText, { color: theme.colors.onSurfaceVariant }]}>{item.address}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.cardActions}>
        <Button mode="text" icon={({ size, color }) => <Feather name="edit-2" size={size} color={color} />} compact onPress={() => setEditing(item)}>Edit</Button>
        <Button mode="text" icon={({ size, color }) => <Feather name="trash-2" size={size} color={color} />} compact textColor={theme.colors.error} onPress={() => setDeleting(item)}>Delete</Button>
      </View>
    </AppCard>
  );

  return (
    <Screen title="Customers" scroll={false} contentStyle={styles.screenContent}>
      <FlatList data={customers} keyExtractor={(item) => item._id} style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} refreshing={isRefreshing} onRefresh={() => query.refetch()} onEndReached={loadMoreCustomers} onEndReachedThreshold={0.35} ListHeaderComponent={renderCustomersHeader} ListEmptyComponent={isInitialLoading ? <ActivityIndicator color={theme.colors.primary} style={styles.emptyLoader} /> : <EmptyState title="No customers" message="Add customers once and reuse them in every invoice." actionLabel="Add customer" onAction={() => setEditing(null)} />} ListFooterComponent={renderCustomersFooter} renderItem={renderCustomerCard} />
      <Portal><Dialog visible={filtersOpen} onDismiss={() => setFiltersOpen(false)}><Dialog.Title>Filter customers</Dialog.Title><Dialog.Content>
        <Text variant="labelLarge" style={styles.dialogLabel}>Contact info</Text>
        <RadioButton.Group value={draftContactInfo} onValueChange={(value) => setDraftContactInfo(value as CustomerFilters['contactInfo'])}>
          {CONTACT_FILTERS.map((option) => <RadioButton.Item key={option.value || 'all'} label={option.label} value={option.value} />)}
        </RadioButton.Group>
      </Dialog.Content><Dialog.Actions><Button onPress={clearFilters}>Clear</Button><Button onPress={() => setFiltersOpen(false)}>Cancel</Button><Button mode="contained" onPress={applyFilters}>Apply</Button></Dialog.Actions></Dialog><Dialog visible={editing !== undefined} onDismiss={() => setEditing(undefined)}><Dialog.Title>{editing?._id ? 'Edit customer' : 'Add customer'}</Dialog.Title><Dialog.Content><FormTextInput control={form.control} name="name" label="Name" /><PhoneInput control={form.control} name="phone" /><FormTextInput control={form.control} name="email" label="Email" keyboardType="email-address" /><FormTextInput control={form.control} name="address" label="Address" multiline /></Dialog.Content><Dialog.Actions><Button onPress={() => setEditing(undefined)}>Cancel</Button><Button loading={save.isPending} onPress={form.handleSubmit((values) => save.mutate(values))}>Save</Button></Dialog.Actions></Dialog></Portal>
      <ConfirmDialog visible={Boolean(deleting)} title="Delete customer?" message="This removes the customer from your saved list. Existing invoices remain unchanged." onCancel={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting._id)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionsRow: { flexDirection: 'row', gap: 8 },
  avatar: { alignItems: 'center', borderRadius: radii.card, height: 44, justifyContent: 'center', width: 44 },
  cardActions: { flexDirection: 'row', gap: 4, justifyContent: 'flex-end', marginTop: 12 },
  cardHeader: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  cardSubtitle: { ...typeScale.caption, marginTop: 1 },
  cardTitle: { ...typeScale.sectionTitle, letterSpacing: -0.2 },
  cardTitleBlock: { flex: 1, minWidth: 0 },
  dialogLabel: { ...fontStyles.medium, marginBottom: 4 },
  emptyLoader: { marginTop: 40 },
  endText: { marginVertical: 16, textAlign: 'center' },
  filterButton: { borderRadius: radii.input, flex: 1 },
  footerLoader: { marginVertical: 16 },
  growButton: { borderRadius: radii.input, flex: 1 },
  inputOutline: { borderRadius: radii.input },
  list: { flex: 1 },
  listContent: { paddingBottom: 24 },
  listHeader: { gap: 10, marginBottom: 12 },
  metaBlock: { gap: 8, marginTop: 14 },
  metaRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  metaText: { flex: 1 },
  screenContent: { flex: 1 }
});
