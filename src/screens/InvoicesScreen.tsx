import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Button, Dialog, Portal, RadioButton, Text, TextInput, useTheme } from 'react-native-paper';
import { invoicesApi } from '@/api/endpoints';
import { AppCard } from '@/components/AppCard';
import { DateRangePicker } from '@/components/DateRangePicker';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { Invoice, InvoiceStatus } from '@/types';
import { formatCurrency, formatDate } from '@/utils/format';

const PAGE_SIZE = 10;
type InvoiceFilters = { search: string; status: '' | InvoiceStatus; from: string; to: string };
type InvoiceFilterDraft = Pick<InvoiceFilters, 'status' | 'from' | 'to'>;
const emptyInvoiceFilterDraft: InvoiceFilterDraft = { status: '', from: '', to: '' };
const STATUS_FILTERS: { label: string; value: InvoiceFilters['status'] }[] = [
  { label: 'All invoices', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Paid', value: 'paid' },
  { label: 'Cancelled', value: 'cancelled' }
];

export function InvoicesScreen({ navigation }: any) {
  const theme = useTheme();
  const [filters, setFilters] = useState<InvoiceFilters>({ search: '', status: '', from: '', to: '' });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<InvoiceFilterDraft>(emptyInvoiceFilterDraft);
  const query = useInfiniteQuery({ queryKey: ['invoices', filters], initialPageParam: 1, queryFn: ({ pageParam }) => invoicesApi.page({ ...filters, page: pageParam, limit: PAGE_SIZE }), getNextPageParam: (lastPage) => lastPage.pagination.nextPage });
  const invoices = useMemo(() => query.data?.pages.flatMap((page) => page.invoices) ?? [], [query.data]);
  const isInitialLoading = query.isLoading && !invoices.length;
  const isRefreshing = query.isRefetching && !query.isFetchingNextPage;
  const update = (key: keyof InvoiceFilters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const activeFilterCount = (filters.status ? 1 : 0) + (filters.from || filters.to ? 1 : 0);
  const statusColor = (status: InvoiceStatus) => status === 'paid' ? theme.colors.tertiary : status === 'cancelled' ? theme.colors.error : theme.colors.secondary;
  const statusIcon = (status: InvoiceStatus) => status === 'paid' ? 'check-circle-outline' : status === 'cancelled' ? 'close-circle-outline' : 'clock-outline';
  const openFilters = () => {
    setDraftFilters({ status: filters.status, from: filters.from, to: filters.to });
    setFiltersOpen(true);
  };
  const applyFilters = () => {
    setFilters((current) => ({ ...current, ...draftFilters }));
    setFiltersOpen(false);
  };
  const clearFilters = () => {
    setDraftFilters(emptyInvoiceFilterDraft);
    setFilters((current) => ({ ...current, ...emptyInvoiceFilterDraft }));
    setFiltersOpen(false);
  };
  const loadMoreInvoices = () => {
    if (!query.hasNextPage || query.isFetching || isInitialLoading) return;
    void query.fetchNextPage();
  };
  const renderInvoicesHeader = () => (
    <View style={styles.listHeader}>
      <TextInput mode="outlined" placeholder="Search invoice or customer" value={filters.search} onChangeText={(value) => update('search', value)} left={<TextInput.Icon icon="magnify" />} outlineStyle={styles.inputOutline} style={{ backgroundColor: theme.colors.elevation.level1 }} />
      <View style={styles.filterRow}>
        <Button mode="outlined" icon="filter-variant" onPress={openFilters} style={styles.filterButton}>{activeFilterCount ? `Filters (${activeFilterCount})` : 'Filters'}</Button>
        <Button mode="contained" onPress={() => navigation.navigate('InvoiceCreate')} style={styles.createButton}>Create invoice</Button>
      </View>
    </View>
  );
  const renderInvoicesFooter = () => {
    if (query.isFetchingNextPage) return <ActivityIndicator color={theme.colors.primary} style={styles.footerLoader} />;
    if (!query.hasNextPage && invoices.length) return <Text style={[styles.endText, { color: theme.colors.onSurfaceVariant }]}>All invoices loaded</Text>;
    return null;
  };
  const renderInvoiceCard = ({ item }: { item: Invoice }) => {
    const tone = statusColor(item.status);

    return (
      <AppCard onPress={() => navigation.navigate('InvoiceDetail', { id: item._id })}>
        <View style={styles.cardHeader}>
          <View style={[styles.invoiceIcon, { backgroundColor: theme.colors.primaryContainer }]}>
            <MaterialCommunityIcons name="file-document-outline" size={24} color={theme.colors.primary} />
          </View>
          <View style={styles.cardTitleBlock}>
            <Text variant="titleMedium" numberOfLines={1} style={styles.invoiceTitle}>{item.customerSnapshot.name}</Text>
            <Text numberOfLines={1} style={[styles.invoiceMeta, { color: theme.colors.onSurfaceVariant }]}>{item.invoiceNumber} - {formatDate(item.date)}</Text>
          </View>
          <Text variant="titleMedium" style={styles.invoiceAmount}>{formatCurrency(item.total)}</Text>
        </View>
        <View style={styles.cardFooter}>
          <View style={[styles.statusPill, { backgroundColor: tone }]}>
            <MaterialCommunityIcons name={statusIcon(item.status)} size={14} color="#ffffff" />
            <Text variant="labelSmall" style={styles.statusText}>{item.status}</Text>
          </View>
          <View style={styles.viewHint}>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>View details</Text>
            <MaterialCommunityIcons name="chevron-right" size={18} color={theme.colors.onSurfaceVariant} />
          </View>
        </View>
      </AppCard>
    );
  };
  return (
    <Screen title="Invoices" scroll={false} contentStyle={styles.screenContent}>
      <FlatList data={invoices} keyExtractor={(item) => item._id} style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled" refreshing={isRefreshing} onRefresh={() => query.refetch()} onEndReached={loadMoreInvoices} onEndReachedThreshold={0.35} showsVerticalScrollIndicator={false} ListHeaderComponent={renderInvoicesHeader} ListEmptyComponent={isInitialLoading ? <ActivityIndicator color={theme.colors.primary} style={styles.emptyLoader} /> : <EmptyState title="No invoices found" message="Try a different search or create a new invoice." />} ListFooterComponent={renderInvoicesFooter} renderItem={renderInvoiceCard} />
      <Portal>
        <Dialog visible={filtersOpen} onDismiss={() => setFiltersOpen(false)}>
          <Dialog.Title>Filter invoices</Dialog.Title>
          <Dialog.Content>
            <Text variant="labelLarge" style={styles.dialogLabel}>Status</Text>
            <RadioButton.Group
              value={draftFilters.status}
              onValueChange={(value) => {
                setDraftFilters((current) => ({ ...current, status: value as InvoiceFilterDraft['status'] }));
              }}
            >
              {STATUS_FILTERS.map((option) => <RadioButton.Item key={option.value || 'all'} label={option.label} value={option.value} />)}
            </RadioButton.Group>
            <DateRangePicker
              value={{ from: draftFilters.from, to: draftFilters.to }}
              onChange={(range) => setDraftFilters((current) => ({ ...current, ...range }))}
              helperText="Filter invoices by invoice date."
              style={styles.dialogDatePicker}
            />
          </Dialog.Content>
          <Dialog.Actions><Button onPress={clearFilters}>Clear</Button><Button onPress={() => setFiltersOpen(false)}>Cancel</Button><Button mode="contained" onPress={applyFilters}>Apply</Button></Dialog.Actions>
        </Dialog>
      </Portal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  emptyLoader: { marginTop: 40 },
  endText: { marginVertical: 16, textAlign: 'center' },
  createButton: { borderRadius: 16, flex: 1 },
  dialogDatePicker: { marginTop: 12 },
  dialogLabel: { fontWeight: '900', marginBottom: 4 },
  filterButton: { borderRadius: 16, flex: 1.2 },
  filterRow: { flexDirection: 'row', gap: 8 },
  footerLoader: { marginVertical: 16 },
  inputOutline: { borderRadius: 18 },
  invoiceAmount: { fontWeight: '900', letterSpacing: -0.3 },
  invoiceIcon: { alignItems: 'center', borderRadius: 18, height: 44, justifyContent: 'center', width: 44 },
  invoiceMeta: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  invoiceTitle: { fontWeight: '900' },
  cardFooter: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  cardHeader: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  cardTitleBlock: { flex: 1, minWidth: 0 },
  list: { flex: 1 },
  listContent: { paddingBottom: 24 },
  listHeader: { gap: 10, marginBottom: 12 },
  screenContent: { flex: 1 },
  statusPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  statusText: { color: '#ffffff', fontWeight: '900', textTransform: 'uppercase' },
  viewHint: { alignItems: 'center', flexDirection: 'row', gap: 2 }
});
