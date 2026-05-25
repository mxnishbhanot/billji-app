import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Text, useTheme } from 'react-native-paper';
import { reportsApi } from '@/api/endpoints';
import { AppCard } from '@/components/AppCard';
import { ChartCard } from '@/components/ChartCard';
import { DateRange, DateRangePicker } from '@/components/DateRangePicker';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { StatCard } from '@/components/StatCard';
import { formatCurrency, formatDate } from '@/utils/format';

export function ReportsScreen({ navigation }: any) {
  const theme = useTheme();
  const [range, setRange] = useState<DateRange>({ from: '', to: '' });
  const { data: report } = useQuery({ queryKey: ['report', range], queryFn: () => reportsApi.summary(range) });
  const statusColor = (status?: string) => status === 'paid' ? theme.colors.tertiary : status === 'cancelled' ? theme.colors.error : theme.colors.secondary;
  return (
    <Screen title="Reports">
      <AppCard>
        <DateRangePicker
          value={range}
          onChange={setRange}
          helperText="Charts, invoice counts, top products, and recent invoices follow this range."
        />
      </AppCard>
      <View style={{ flexDirection: 'row' }}><StatCard label={report?.rangeLabel || 'Selected range'} value={formatCurrency(report?.rangeSales)} /><StatCard label="Invoices" value={report?.totalInvoices || 0} hint="In range" /></View>
      <View style={{ flexDirection: 'row' }}><StatCard label="Today" value={formatCurrency(report?.todaySales)} /><StatCard label="Weekly" value={formatCurrency(report?.weeklySales)} /></View>
      <View style={{ flexDirection: 'row' }}><StatCard label="Monthly" value={formatCurrency(report?.monthlySales)} /><StatCard label="Avg invoice" value={formatCurrency(report?.averageInvoiceValue)} /></View>
      <ChartCard title="Sales trend" data={report?.salesTrend || []} />
      <AppCard>
        <Text variant="titleMedium" style={{ fontWeight: '900', marginBottom: 12 }}>Invoice counts</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>{(['pending', 'paid', 'cancelled'] as const).map((status) => <View key={status} style={{ alignItems: 'center', flex: 1 }}><Text variant="headlineSmall" style={{ fontWeight: '900' }}>{report?.invoiceCounts?.[status] || 0}</Text><Text style={{ color: theme.colors.onSurfaceVariant }}>{status}</Text></View>)}</View>
      </AppCard>
      <AppCard>
        <View style={styles.sectionHeader}><View><Text variant="titleMedium" style={styles.sectionTitle}>Top products</Text><Text style={[styles.sectionHint, { color: theme.colors.onSurfaceVariant }]}>Ranked by sales in selected range</Text></View></View>
        {report?.topProducts?.length ? report.topProducts.map((product, index) => (
          <View key={product.name} style={[styles.productRow, { backgroundColor: theme.colors.surfaceVariant }]}>
            <View style={[styles.rankBadge, { backgroundColor: index === 0 ? theme.colors.tertiaryContainer : theme.colors.primaryContainer }]}><Text style={[styles.rankText, { color: index === 0 ? theme.colors.tertiary : theme.colors.primary }]}>#{index + 1}</Text></View>
            <View style={styles.rowContent}><Text numberOfLines={1} style={styles.rowTitle}>{product.name}</Text><View style={styles.soldChip}><MaterialCommunityIcons name="cart-outline" size={14} color={theme.colors.onSurfaceVariant} /><Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{product.quantity} units</Text></View></View>
            <View style={styles.salesBlock}><MaterialCommunityIcons name="trending-up" size={18} color={theme.colors.tertiary} /><Text style={styles.amountText}>{formatCurrency(product.sales)}</Text></View>
          </View>
        )) : <EmptyState title="No product data" message="Top products appear after invoices are created." />}
      </AppCard>
      <AppCard>
        <View style={styles.sectionHeader}><View><Text variant="titleMedium" style={styles.sectionTitle}>Recent activity</Text><Text style={[styles.sectionHint, { color: theme.colors.onSurfaceVariant }]}>Latest invoices in this view</Text></View><Button onPress={() => navigation.navigate('InvoicesTab', { screen: 'InvoiceList' })}>View all</Button></View>
        {report?.recentInvoices?.length ? report.recentInvoices.map((invoice) => (
          <Pressable key={invoice._id} onPress={() => navigation.navigate('InvoicesTab', { screen: 'InvoiceDetail', params: { id: invoice._id } })} style={[styles.activityRow, { backgroundColor: theme.colors.surfaceVariant }]}>
            <View style={[styles.iconBubble, { backgroundColor: theme.colors.primaryContainer }]}><MaterialCommunityIcons name="file-document-outline" size={22} color={theme.colors.primary} /></View>
            <View style={styles.rowContent}><Text numberOfLines={1} style={styles.rowTitle}>{invoice.customerSnapshot.name}</Text><Text numberOfLines={1} style={[styles.rowMeta, { color: theme.colors.onSurfaceVariant }]}>{invoice.invoiceNumber} - {formatDate(invoice.date)}</Text><View style={[styles.statusChip, { backgroundColor: statusColor(invoice.status) }]}><Text variant="labelSmall" style={styles.statusText}>{invoice.status}</Text></View></View>
            <View style={styles.amountBlock}><Text style={styles.amountText}>{formatCurrency(invoice.total)}</Text><MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.onSurfaceVariant} /></View>
          </Pressable>
        )) : <EmptyState title="No recent invoices" message="Recent invoices appear after matching sales activity." />}
      </AppCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  activityRow: { alignItems: 'center', borderRadius: 22, flexDirection: 'row', gap: 12, marginTop: 10, padding: 12 },
  amountBlock: { alignItems: 'flex-end', flexDirection: 'row', gap: 2 },
  amountText: { fontWeight: '900', letterSpacing: -0.2 },
  iconBubble: { alignItems: 'center', borderRadius: 18, height: 44, justifyContent: 'center', width: 44 },
  productRow: { alignItems: 'center', borderRadius: 22, flexDirection: 'row', gap: 12, marginTop: 10, padding: 12 },
  rankBadge: { alignItems: 'center', borderRadius: 16, height: 38, justifyContent: 'center', width: 38 },
  rankText: { fontWeight: '900' },
  rowContent: { flex: 1, minWidth: 0 },
  rowMeta: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  rowTitle: { fontWeight: '900' },
  salesBlock: { alignItems: 'flex-end', gap: 3 },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  sectionHint: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  sectionTitle: { fontWeight: '900' },
  soldChip: { alignItems: 'center', flexDirection: 'row', gap: 5, marginTop: 6 },
  statusChip: { alignSelf: 'flex-start', borderRadius: 999, marginTop: 8, paddingHorizontal: 9, paddingVertical: 4 },
  statusText: { color: '#ffffff', fontWeight: '900', textTransform: 'uppercase' }
});
