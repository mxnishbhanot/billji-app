import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Button, SegmentedButtons, Text, TextInput, useTheme } from 'react-native-paper';
import { invoicesApi } from '@/api/endpoints';
import { AppCard } from '@/components/AppCard';
import { DateRangePicker } from '@/components/DateRangePicker';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { InvoiceStatus } from '@/types';
import { formatCurrency, formatDate } from '@/utils/format';

const PAGE_SIZE = 10;
type InvoiceFilters = { search: string; status: '' | InvoiceStatus; from: string; to: string };

export function InvoicesScreen({ navigation }: any) {
  const theme = useTheme();
  const [filters, setFilters] = useState<InvoiceFilters>({ search: '', status: '', from: '', to: '' });
  const query = useInfiniteQuery({ queryKey: ['invoices', filters], initialPageParam: 1, queryFn: ({ pageParam }) => invoicesApi.page({ ...filters, page: pageParam, limit: PAGE_SIZE }), getNextPageParam: (lastPage) => lastPage.pagination.nextPage });
  const invoices = useMemo(() => query.data?.pages.flatMap((page) => page.invoices) ?? [], [query.data]);
  const update = (key: keyof InvoiceFilters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const statusColor = (status: InvoiceStatus) => status === 'paid' ? theme.colors.tertiary : status === 'cancelled' ? theme.colors.error : theme.colors.secondary;
  return (
    <Screen title="Invoices" scroll={false}>
      <View style={{ gap: 10, marginBottom: 12 }}>
        <TextInput mode="outlined" placeholder="Search invoice or customer" value={filters.search} onChangeText={(value) => update('search', value)} left={<TextInput.Icon icon="magnify" />} outlineStyle={styles.inputOutline} style={{ backgroundColor: theme.colors.elevation.level1 }} />
        <SegmentedButtons value={filters.status} onValueChange={(value) => update('status', value)} buttons={[{ value: '', label: 'All' }, { value: 'pending', label: 'Pending' }, { value: 'paid', label: 'Paid' }, { value: 'cancelled', label: 'Cancelled' }]} />
        <DateRangePicker
          value={{ from: filters.from, to: filters.to }}
          onChange={(range) => setFilters((current) => ({ ...current, ...range }))}
          helperText="Filter invoices by invoice date."
        />
        <Button mode="contained" onPress={() => navigation.navigate('InvoiceCreate')} style={styles.primaryButton}>Create invoice</Button>
      </View>
      <FlatList data={invoices} keyExtractor={(item) => item._id} refreshing={query.isRefetching} onRefresh={() => query.refetch()} onEndReached={() => query.hasNextPage && query.fetchNextPage()} onEndReachedThreshold={0.5} showsVerticalScrollIndicator={false} ListEmptyComponent={!query.isLoading ? <EmptyState title="No invoices found" message="Try a different search or create a new invoice." /> : null} ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 16 }} /> : null} renderItem={({ item }) => <AppCard onPress={() => navigation.navigate('InvoiceDetail', { id: item._id })}><View style={styles.invoiceRow}><View style={{ flex: 1 }}><Text variant="titleMedium" style={styles.invoiceTitle}>{item.customerSnapshot.name}</Text><Text style={{ color: theme.colors.onSurfaceVariant }}>{item.invoiceNumber} - {formatDate(item.date)}</Text><View style={[styles.statusPill, { backgroundColor: statusColor(item.status) }]}><Text variant="labelSmall" style={{ color: '#ffffff', fontWeight: '900', textTransform: 'uppercase' }}>{item.status}</Text></View></View><Text variant="titleMedium" style={styles.invoiceAmount}>{formatCurrency(item.total)}</Text></View></AppCard>} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  inputOutline: { borderRadius: 18 },
  invoiceAmount: { fontWeight: '900', letterSpacing: -0.3 },
  invoiceRow: { flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  invoiceTitle: { fontWeight: '900' },
  primaryButton: { borderRadius: 16 },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 5
  }
});
