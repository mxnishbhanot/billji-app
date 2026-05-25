import { useEffect } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Text, useTheme } from 'react-native-paper';
import { reportsApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { AppCard } from '@/components/AppCard';
import { useAppDialog } from '@/components/AppDialog';
import { ChartCard } from '@/components/ChartCard';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { StatCard } from '@/components/StatCard';
import { formatCurrency, formatDate } from '@/utils/format';

export function DashboardScreen({ navigation }: any) {
  const theme = useTheme();
  const { showDialog } = useAppDialog();
  const isDark = theme.dark;
  const query = useQuery({ queryKey: ['report'], queryFn: reportsApi.summary });
  useEffect(() => {
    if (query.error) showDialog({ title: 'Could not load dashboard', message: apiErrorMessage(query.error), tone: 'error' });
  }, [query.error, showDialog]);
  const report = query.data;
  const heroBackground = isDark ? theme.colors.elevation.level3 : theme.colors.primary;
  const heroBorder = isDark ? theme.colors.primaryContainer : theme.colors.primary;
  const heroLabelColor = isDark ? theme.colors.secondary : theme.colors.primaryContainer;
  const heroTitleColor = isDark ? theme.colors.onSurface : theme.colors.onPrimary;
  const heroTextColor = isDark ? theme.colors.onSurfaceVariant : theme.colors.primaryContainer;
  const heroButtonColor = isDark ? theme.colors.primary : theme.colors.onPrimary;
  const heroButtonTextColor = isDark ? theme.colors.onPrimary : theme.colors.primary;
  const statusColor = (status?: string) => status === 'paid' ? theme.colors.tertiary : status === 'cancelled' ? theme.colors.error : theme.colors.secondary;
  return (
    <Screen title="Dashboard">
      <RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} />
      <AppCard style={{ backgroundColor: heroBackground, borderColor: heroBorder }}>
        <Text variant="labelLarge" style={{ color: heroLabelColor, fontWeight: '800' }}>Billji command center</Text>
        <Text variant="headlineMedium" style={{ color: heroTitleColor, fontWeight: '900', letterSpacing: -1, marginTop: 8 }}>Today billing pulse</Text>
        <Text style={{ color: heroTextColor, marginTop: 8 }}>Track invoices, stock, and cash flow without digging through desktop screens.</Text>
        <Button mode="contained" buttonColor={heroButtonColor} textColor={heroButtonTextColor} onPress={() => navigation.navigate('InvoicesTab', { screen: 'InvoiceCreate' })} style={styles.heroButton}>Create invoice</Button>
      </AppCard>
      <View style={styles.statRow}><StatCard label="Today" value={formatCurrency(report?.todaySales)} hint="Paid sales" /><StatCard label="This month" value={formatCurrency(report?.monthlySales)} hint="Paid sales" /></View>
      <View style={styles.statRow}><StatCard label="Invoices" value={report?.totalInvoices || 0} hint="All time" /><StatCard label="Pending" value={report?.pendingInvoices || 0} hint="Need follow-up" /></View>
      <ChartCard title="Sales trend" data={report?.salesTrend || []} />
      <AppCard>
        <View style={styles.sectionHeader}><View><Text variant="titleMedium" style={styles.sectionTitle}>Recent activity</Text><Text style={[styles.sectionHint, { color: theme.colors.onSurfaceVariant }]}>Latest invoices and payment state</Text></View><Button onPress={() => navigation.navigate('InvoicesTab', { screen: 'InvoiceList' })}>View all</Button></View>
        {report?.recentInvoices?.length ? report.recentInvoices.map((invoice) => (
          <Pressable key={invoice._id} onPress={() => navigation.navigate('InvoicesTab', { screen: 'InvoiceDetail', params: { id: invoice._id } })} style={[styles.activityRow, { backgroundColor: theme.colors.surfaceVariant }]}>
            <View style={[styles.iconBubble, { backgroundColor: theme.colors.primaryContainer }]}><MaterialCommunityIcons name="file-document-outline" size={22} color={theme.colors.primary} /></View>
            <View style={styles.rowContent}><Text numberOfLines={1} style={styles.rowTitle}>{invoice.customerSnapshot.name}</Text><Text numberOfLines={1} style={[styles.rowMeta, { color: theme.colors.onSurfaceVariant }]}>{invoice.invoiceNumber} - {formatDate(invoice.date)}</Text><View style={[styles.statusChip, { backgroundColor: statusColor(invoice.status) }]}><Text variant="labelSmall" style={styles.statusText}>{invoice.status}</Text></View></View>
            <View style={styles.amountBlock}><Text style={styles.amountText}>{formatCurrency(invoice.total)}</Text><MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.onSurfaceVariant} /></View>
          </Pressable>
        )) : <EmptyState title="No invoices yet" message="Create your first invoice to see recent activity here." />}
      </AppCard>
      <AppCard>
        <View style={styles.sectionHeader}><View><Text variant="titleMedium" style={styles.sectionTitle}>Top selling products</Text><Text style={[styles.sectionHint, { color: theme.colors.onSurfaceVariant }]}>Best performers by sales</Text></View></View>
        {report?.topProducts?.length ? report.topProducts.map((product, index) => (
          <View key={product.name} style={[styles.productRow, { backgroundColor: theme.colors.surfaceVariant }]}>
            <View style={[styles.rankBadge, { backgroundColor: index === 0 ? theme.colors.tertiaryContainer : theme.colors.primaryContainer }]}><Text style={[styles.rankText, { color: index === 0 ? theme.colors.tertiary : theme.colors.primary }]}>#{index + 1}</Text></View>
            <View style={styles.rowContent}><Text numberOfLines={1} style={styles.rowTitle}>{product.name}</Text><View style={styles.soldChip}><MaterialCommunityIcons name="cart-outline" size={14} color={theme.colors.onSurfaceVariant} /><Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{product.quantity} sold</Text></View></View>
            <View style={styles.salesBlock}><MaterialCommunityIcons name="trending-up" size={18} color={theme.colors.tertiary} /><Text style={styles.amountText}>{formatCurrency(product.sales)}</Text></View>
          </View>
        )) : <EmptyState title="No product sales" message="Products will appear after you generate invoices." />}
      </AppCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  activityRow: { alignItems: 'center', borderRadius: 22, flexDirection: 'row', gap: 12, marginTop: 10, padding: 12 },
  amountBlock: { alignItems: 'flex-end', flexDirection: 'row', gap: 2 },
  amountText: { fontWeight: '900', letterSpacing: -0.2 },
  heroButton: { alignSelf: 'flex-start', borderRadius: 16, marginTop: 18 },
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
  statRow: { flexDirection: 'row' },
  statusChip: { alignSelf: 'flex-start', borderRadius: 999, marginTop: 8, paddingHorizontal: 9, paddingVertical: 4 },
  statusText: { color: '#ffffff', fontWeight: '900', textTransform: 'uppercase' }
});
