import { useEffect } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
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
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}><Text variant="titleMedium" style={{ fontWeight: '900' }}>Recent activity</Text><Button onPress={() => navigation.navigate('InvoicesTab', { screen: 'InvoiceList' })}>View all</Button></View>
        {report?.recentInvoices?.length ? report.recentInvoices.map((invoice) => (
          <AppCard key={invoice._id} onPress={() => navigation.navigate('InvoicesTab', { screen: 'InvoiceDetail', params: { id: invoice._id } })}>
            <Text style={{ fontWeight: '900' }}>{invoice.customerSnapshot.name}</Text>
            <Text style={{ color: theme.colors.onSurfaceVariant }}>{invoice.invoiceNumber} - {formatDate(invoice.date)}</Text>
            <Text variant="titleMedium" style={{ fontWeight: '900', marginTop: 4 }}>{formatCurrency(invoice.total)} · {invoice.status}</Text>
          </AppCard>
        )) : <EmptyState title="No invoices yet" message="Create your first invoice to see recent activity here." />}
      </AppCard>
      <AppCard>
        <Text variant="titleMedium" style={{ fontWeight: '900', marginBottom: 10 }}>Top selling products</Text>
        {report?.topProducts?.length ? report.topProducts.map((product) => <View key={product.name} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}><Text>{product.name}\n{product.quantity} sold</Text><Text style={{ fontWeight: '900' }}>{formatCurrency(product.sales)}</Text></View>) : <EmptyState title="No product sales" message="Products will appear after you generate invoices." />}
      </AppCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroButton: { alignSelf: 'flex-start', borderRadius: 16, marginTop: 18 },
  statRow: { flexDirection: 'row' }
});
