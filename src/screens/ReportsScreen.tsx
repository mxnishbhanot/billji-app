import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Text, useTheme } from 'react-native-paper';
import { reportsApi } from '@/api/endpoints';
import { AppCard } from '@/components/AppCard';
import { ChartCard } from '@/components/ChartCard';
import { DateRange, DateRangePicker } from '@/components/DateRangePicker';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { StatCard } from '@/components/StatCard';
import { appColors, fontStyles, radii, spacing, statusTone, typeScale } from '@/theme/theme';
import { formatCurrency, formatDate } from '@/utils/format';

export function ReportsScreen({ navigation }: any) {
  const theme = useTheme();
  const colors = appColors(theme.dark);
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
      <View style={{ flexDirection: 'row' }}><StatCard label={report?.rangeLabel || 'Selected range'} value={formatCurrency(report?.rangeSales)} tone="success" /><StatCard label="Invoices" value={report?.totalInvoices || 0} hint="In range" /></View>
      <View style={{ flexDirection: 'row' }}><StatCard label="Today" value={formatCurrency(report?.todaySales)} tone="success" /><StatCard label="Weekly" value={formatCurrency(report?.weeklySales)} /></View>
      <View style={{ flexDirection: 'row' }}><StatCard label="Monthly" value={formatCurrency(report?.monthlySales)} /><StatCard label="Avg invoice" value={formatCurrency(report?.averageInvoiceValue)} /></View>
      <ChartCard title="Sales trend" data={report?.salesTrend || []} />
      <AppCard>
        <Text variant="titleMedium" style={{ ...fontStyles.semiBold, marginBottom: 12 }}>Invoice counts</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>{(['pending', 'paid', 'cancelled'] as const).map((status) => {
          const tone = statusTone(status, theme.dark);
          return <View key={status} style={[styles.countBox, { backgroundColor: tone.background, borderColor: tone.border }]}><Text variant="headlineSmall" style={[styles.countValue, { color: tone.foreground }]}>{report?.invoiceCounts?.[status] || 0}</Text><Text style={[styles.countLabel, { color: tone.foreground }]}>{status}</Text></View>;
        })}</View>
      </AppCard>
      <AppCard>
        <View style={styles.sectionHeader}><View><Text variant="titleMedium" style={styles.sectionTitle}>Top products</Text><Text style={[styles.sectionHint, { color: theme.colors.onSurfaceVariant }]}>Ranked by sales in selected range</Text></View></View>
        {report?.topProducts?.length ? report.topProducts.map((product, index) => (
          <View key={product.name} style={[styles.productRow, { backgroundColor: theme.dark ? colors.surface : theme.colors.surfaceVariant, borderColor: theme.colors.outlineVariant }]}>
            <View style={[styles.rankBadge, { backgroundColor: index === 0 ? colors.accentSoft : colors.primarySoft }]}><Text style={[styles.rankText, { color: index === 0 ? colors.accent : colors.primary }]}>#{index + 1}</Text></View>
            <View style={styles.rowContent}><Text numberOfLines={1} style={styles.rowTitle}>{product.name}</Text><View style={styles.soldChip}><Feather name="shopping-cart" size={14} color={theme.colors.onSurfaceVariant} /><Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{product.quantity} units</Text></View></View>
            <View style={styles.salesBlock}><Feather name="trending-up" size={18} color={theme.colors.tertiary} /><Text style={styles.amountText}>{formatCurrency(product.sales)}</Text></View>
          </View>
        )) : <EmptyState title="No product data" message="Top products appear after invoices are created." />}
      </AppCard>
      <AppCard>
        <View style={styles.sectionHeader}><View><Text variant="titleMedium" style={styles.sectionTitle}>Recent activity</Text><Text style={[styles.sectionHint, { color: theme.colors.onSurfaceVariant }]}>Latest invoices in this view</Text></View><Button onPress={() => navigation.navigate('InvoicesTab', { screen: 'InvoiceList' })}>View all</Button></View>
        {report?.recentInvoices?.length ? report.recentInvoices.map((invoice) => {
          const tone = statusTone(invoice.status, theme.dark);
          return (
          <Pressable key={invoice._id} onPress={() => navigation.navigate('InvoicesTab', { screen: 'InvoiceDetail', params: { id: invoice._id } })} style={[styles.activityRow, { backgroundColor: theme.dark ? colors.surface : theme.colors.surfaceVariant, borderColor: theme.colors.outlineVariant }]}>
            <View style={[styles.iconBubble, { backgroundColor: colors.primarySoft }]}><Feather name="file-text" size={21} color={theme.colors.primary} /></View>
            <View style={styles.rowContent}><Text numberOfLines={1} style={styles.rowTitle}>{invoice.customerSnapshot.name}</Text><Text numberOfLines={1} style={[styles.rowMeta, { color: theme.colors.onSurfaceVariant }]}>{invoice.invoiceNumber} - {formatDate(invoice.date)}</Text><View style={[styles.statusChip, { backgroundColor: tone.background, borderColor: tone.border }]}><Text variant="labelSmall" style={[styles.statusText, { color: tone.foreground }]}>{invoice.status}</Text></View></View>
            <View style={styles.amountBlock}><Text style={styles.amountText}>{formatCurrency(invoice.total)}</Text><Feather name="chevron-right" size={20} color={theme.colors.onSurfaceVariant} /></View>
          </Pressable>
          );
        }) : <EmptyState title="No recent invoices" message="Recent invoices appear after matching sales activity." />}
      </AppCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  activityRow: { alignItems: 'center', borderRadius: radii.card, borderWidth: 1, flexDirection: 'row', gap: spacing.gridGap, marginTop: 10, padding: spacing.cardPaddingCompact },
  amountBlock: { alignItems: 'flex-end', flexDirection: 'row', gap: 2 },
  amountText: { ...typeScale.cardValue, letterSpacing: -0.2 },
  countBox: { alignItems: 'center', borderRadius: radii.card, borderWidth: 1, flex: 1, marginHorizontal: 4, paddingVertical: spacing.gridGap },
  countLabel: { ...typeScale.badgeLabel, marginTop: 2, textTransform: 'capitalize' },
  countValue: typeScale.cardValue,
  iconBubble: { alignItems: 'center', borderRadius: radii.card, height: 42, justifyContent: 'center', width: 42 },
  productRow: { alignItems: 'center', borderRadius: radii.card, borderWidth: 1, flexDirection: 'row', gap: spacing.gridGap, marginTop: 10, padding: spacing.cardPaddingCompact },
  rankBadge: { alignItems: 'center', borderRadius: radii.card, height: 38, justifyContent: 'center', width: 38 },
  rankText: fontStyles.semiBold,
  rowContent: { flex: 1, minWidth: 0 },
  rowMeta: { ...typeScale.caption, marginTop: 2 },
  rowTitle: typeScale.sectionTitle,
  salesBlock: { alignItems: 'flex-end', gap: 3 },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  sectionHint: { ...typeScale.caption, marginTop: 2 },
  sectionTitle: typeScale.sectionTitle,
  soldChip: { alignItems: 'center', flexDirection: 'row', gap: 5, marginTop: 6 },
  statusChip: { alignSelf: 'flex-start', borderRadius: radii.badge, borderWidth: 1, marginTop: 8, paddingHorizontal: 9, paddingVertical: 4 },
  statusText: { ...typeScale.badgeLabel, textTransform: 'capitalize' }
});
