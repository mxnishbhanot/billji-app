import { useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Text, useTheme } from 'react-native-paper';
import { reportsApi } from '@/api/endpoints';
import { AppCard } from '@/components/AppCard';
import { ChartCard } from '@/components/ChartCard';
import { DateRange, DateRangePicker } from '@/components/DateRangePicker';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { StatCard } from '@/components/StatCard';
import { formatCurrency } from '@/utils/format';

export function ReportsScreen() {
  const theme = useTheme();
  const [range, setRange] = useState<DateRange>({ from: '', to: '' });
  const { data: report } = useQuery({ queryKey: ['report', range], queryFn: () => reportsApi.summary(range) });
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
        <Text variant="titleMedium" style={{ fontWeight: '900', marginBottom: 10 }}>Top products</Text>
        {report?.topProducts?.length ? report.topProducts.map((product) => <View key={product.name} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}><Text>{product.name}\n{product.quantity} units</Text><Text style={{ fontWeight: '900' }}>{formatCurrency(product.sales)}</Text></View>) : <EmptyState title="No product data" message="Top products appear after invoices are created." />}
      </AppCard>
    </Screen>
  );
}
