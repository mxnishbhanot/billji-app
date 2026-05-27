import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { reportsApi } from '@/api/endpoints';
import { AppCard } from '@/components/AppCard';
import { ChartCard } from '@/components/ChartCard';
import { DateRange, DateRangePicker } from '@/components/DateRangePicker';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { StatCard } from '@/components/StatCard';
import { alpha, appColors, fontStyles, radii, statusTone, typeScale } from '@/theme/theme';
import { formatCurrency, formatDate } from '@/utils/format';

const REPORT_STATUSES: { key: 'pending' | 'paid' | 'cancelled'; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { key: 'pending', label: 'Pending', icon: 'clock-outline' },
  { key: 'paid', label: 'Paid', icon: 'check-decagram' },
  { key: 'cancelled', label: 'Cancelled', icon: 'close-circle-outline' }
];

const displayRange = (range: DateRange) => {
  if (!range.from && !range.to) return 'Any time';
  return `${range.from ? formatDate(range.from) : 'Start'} - ${range.to ? formatDate(range.to) : 'Today'}`;
};

function ReportRangeSheet({
  visible,
  value,
  onChange,
  onClose,
  onApply,
  onReset
}: {
  visible: boolean;
  value: DateRange;
  onChange: (value: DateRange) => void;
  onClose: () => void;
  onApply: () => void;
  onReset: () => void;
}) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const insets = useSafeAreaInsets();
  const [translateY] = useState(() => new Animated.Value(520));
  const [backdropOpacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true })
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 520, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true })
      ]).start();
    }
  }, [visible, translateY, backdropOpacity]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.sheetFill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8, 9, 18, 0.55)', opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.1),
              paddingBottom: 16 + insets.bottom,
              transform: [{ translateY }]
            }
          ]}
        >
          <View style={styles.grabber}>
            <View style={[styles.grabberBar, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.18) }]} />
          </View>
          <View style={styles.sheetHeader}>
            <View>
              <Text style={[styles.sheetTitle, { color: theme.colors.onSurface }]}>Filter reports</Text>
              <Text style={[styles.sheetSubtitle, { color: theme.colors.onSurfaceVariant }]}>Choose date range for analytics.</Text>
            </View>
            <Pressable onPress={onReset} style={styles.resetBtn} hitSlop={8}>
              <Feather name="rotate-ccw" size={14} color={theme.colors.primary} />
              <Text style={[styles.resetLabel, { color: theme.colors.primary }]}>Reset</Text>
            </Pressable>
          </View>

          <View style={styles.sheetContent}>
            <DateRangePicker
              value={value}
              onChange={onChange}
              helperText="Charts, counts, top products, and activity follow this range."
            />
          </View>

          <Pressable
            onPress={onApply}
            style={({ pressed }) => [
              styles.applyBtn,
              {
                backgroundColor: pressed ? colors.primaryStrong : theme.colors.primary,
                shadowColor: isDark ? '#000000' : colors.primaryStrong
              }
            ]}
          >
            <Feather name="check" size={16} color="#FFFFFF" strokeWidth={3} />
            <Text style={styles.applyLabel}>Apply filter</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function ReportsScreen({ navigation }: any) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(theme.dark);
  const [range, setRange] = useState<DateRange>({ from: '', to: '' });
  const [draftRange, setDraftRange] = useState<DateRange>(range);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { data: report, isFetching, refetch } = useQuery({ queryKey: ['report', range], queryFn: () => reportsApi.summary(range) });

  const openFilters = () => {
    setDraftRange(range);
    setFiltersOpen(true);
  };
  const applyFilters = () => {
    setRange(draftRange);
    setFiltersOpen(false);
  };
  const resetFilters = () => setDraftRange({ from: '', to: '' });
  const reportRangeParams = { from: range.from, to: range.to };
  const viewAllProducts = () => {
    navigation.navigate('CatalogTab', {
      screen: 'Products',
      params: { ...reportRangeParams, sort: 'top-sales', fromReports: true }
    });
  };
  const viewAllInvoices = () => {
    navigation.navigate('InvoicesTab', {
      screen: 'InvoiceList',
      params: { ...reportRangeParams, sort: 'newest', fromReports: true }
    });
  };

  const reportStats = [
    { label: 'Today', value: formatCurrency(report?.todaySales), hint: 'Paid sales', tone: 'success' as const, icon: 'credit-card-outline' as const },
    { label: 'Weekly', value: formatCurrency(report?.weeklySales), hint: 'Paid sales', icon: 'calendar-week' as const },
    { label: 'Monthly', value: formatCurrency(report?.monthlySales), hint: 'Paid sales', icon: 'calendar-month-outline' as const },
    { label: 'Avg invoice', value: formatCurrency(report?.averageInvoiceValue), hint: 'Per invoice', icon: 'calculator-variant-outline' as const }
  ];

  return (
    <Screen title="Reports" contentStyle={styles.screenContent}>
      <AppCard style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <View style={[styles.summaryIconTile, { backgroundColor: alpha(colors.primary, isDark ? 0.2 : 0.1) }]}>
            <MaterialCommunityIcons name="chart-box-outline" size={21} color={theme.colors.primary} />
          </View>
          <View style={styles.rowContent}>
            <Text style={[styles.summaryTitle, { color: theme.colors.onSurface }]}>Reports overview</Text>
            <Text style={[styles.summarySubtitle, { color: theme.colors.onSurfaceVariant }]}>{displayRange(range)}</Text>
          </View>
          <Pressable
            onPress={() => void refetch()}
            style={({ pressed }) => [styles.iconAction, { backgroundColor: alpha(colors.primary, pressed ? 0.18 : 0.1) }]}
          >
            <Feather name="refresh-cw" size={17} color={theme.colors.primary} />
          </Pressable>
        </View>

        <View style={styles.summaryBody}>
          <View style={styles.summaryMetric}>
            <Text style={[styles.summaryLabel, { color: theme.colors.onSurfaceVariant }]}>{report?.rangeLabel || 'Selected range'}</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.summaryValue, { color: theme.colors.onSurface }]}>{formatCurrency(report?.rangeSales)}</Text>
          </View>
          <View style={styles.summarySide}>
            <View style={[styles.invoiceMiniChip, { backgroundColor: alpha(colors.primary, isDark ? 0.18 : 0.1), borderColor: alpha(colors.primary, isDark ? 0.3 : 0.18) }]}>
              <MaterialCommunityIcons name="file-document-multiple-outline" size={15} color={theme.colors.primary} />
              <Text style={[styles.invoiceMiniText, { color: theme.colors.primary }]}>{report?.totalInvoices || 0} invoices</Text>
            </View>
            {isFetching ? <Text style={[styles.syncText, { color: theme.colors.onSurfaceVariant }]}>Refreshing...</Text> : null}
          </View>
        </View>

        <Pressable
          onPress={openFilters}
          style={({ pressed }) => [
            styles.filterButton,
            {
              backgroundColor: pressed ? alpha(colors.primary, isDark ? 0.24 : 0.14) : alpha(colors.primary, isDark ? 0.16 : 0.08),
              borderColor: alpha(colors.primary, isDark ? 0.28 : 0.16)
            }
          ]}
        >
          <Feather name="sliders" size={15} color={theme.colors.primary} />
          <Text style={[styles.filterButtonText, { color: theme.colors.primary }]}>Filter</Text>
          <Feather name="chevron-up" size={14} color={theme.colors.primary} />
        </Pressable>
      </AppCard>

      <View style={styles.statRow}>{reportStats.slice(0, 2).map((item) => <StatCard key={item.label} {...item} />)}</View>
      <View style={styles.statRow}>{reportStats.slice(2).map((item) => <StatCard key={item.label} {...item} />)}</View>

      <ChartCard title="Sales trend" data={report?.salesTrend || []} />

      <AppCard style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View>
            <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Invoice counts</Text>
            <Text style={[styles.sectionHint, { color: theme.colors.onSurfaceVariant }]}>Status mix for selected range</Text>
          </View>
        </View>
        <View style={styles.countGrid}>
          {REPORT_STATUSES.map((status) => {
            const tone = statusTone(status.key, theme.dark);
            return (
              <View key={status.key} style={[styles.countBox, { backgroundColor: tone.background, borderColor: tone.border }]}>
                <View style={[styles.countIconTile, { backgroundColor: alpha(tone.foreground, isDark ? 0.22 : 0.12) }]}>
                  <MaterialCommunityIcons name={status.icon} size={16} color={tone.foreground} />
                </View>
                <Text variant="headlineSmall" style={[styles.countValue, { color: tone.foreground }]}>{report?.invoiceCounts?.[status.key] || 0}</Text>
                <Text style={[styles.countLabel, { color: tone.foreground }]}>{status.label}</Text>
              </View>
            );
          })}
        </View>
      </AppCard>

      <AppCard style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View>
            <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Top products</Text>
            <Text style={[styles.sectionHint, { color: theme.colors.onSurfaceVariant }]}>Ranked by sales in selected range</Text>
          </View>
          <Button compact onPress={viewAllProducts}>View all</Button>
        </View>
        {report?.topProducts?.length ? report.topProducts.slice(0, 5).map((product, index) => (
          <View key={`${product.name}-${index}`} style={[styles.productRow, { backgroundColor: colors.card, borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08), shadowColor: isDark ? '#000000' : colors.primaryStrong }]}>
            <View style={[styles.rankBadge, { backgroundColor: index === 0 ? alpha(colors.accent, isDark ? 0.22 : 0.14) : alpha(colors.primary, isDark ? 0.22 : 0.14) }]}>
              <Text style={[styles.rankText, { color: index === 0 ? colors.accent : colors.primary }]}>#{index + 1}</Text>
            </View>
            <View style={styles.rowContent}>
              <Text numberOfLines={1} style={[styles.rowTitle, { color: theme.colors.onSurface }]}>{product.name}</Text>
              <View style={styles.soldChip}>
                <Feather name="shopping-cart" size={14} color={theme.colors.onSurfaceVariant} />
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{product.quantity} units sold</Text>
              </View>
            </View>
            <View style={styles.salesBlock}>
              <View style={[styles.trendChip, { backgroundColor: alpha(colors.accent, isDark ? 0.2 : 0.12) }]}>
                <Feather name="trending-up" size={13} color={colors.accent} />
              </View>
              <Text style={[styles.amountText, { color: theme.colors.onSurface }]}>{formatCurrency(product.sales)}</Text>
            </View>
          </View>
        )) : <EmptyState title="No product data" message="Top products appear after invoices are created." />}
      </AppCard>

      <AppCard style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View>
            <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Recent activity</Text>
            <Text style={[styles.sectionHint, { color: theme.colors.onSurfaceVariant }]}>Latest invoices in this view</Text>
          </View>
          <Button compact onPress={viewAllInvoices}>View all</Button>
        </View>
        {report?.recentInvoices?.length ? report.recentInvoices.slice(0, 5).map((invoice) => {
          const tone = statusTone(invoice.status, theme.dark);
          return (
            <Pressable
              key={invoice._id}
              onPress={() => navigation.navigate('InvoicesTab', { screen: 'InvoiceDetail', params: { id: invoice._id } })}
              style={({ pressed }) => [
                styles.activityRow,
                {
                  backgroundColor: colors.card,
                  borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08),
                  shadowColor: isDark ? '#000000' : colors.primaryStrong,
                  opacity: pressed ? 0.94 : 1
                }
              ]}
            >
              <View style={[styles.iconBubble, { backgroundColor: alpha(colors.primary, isDark ? 0.22 : 0.14) }]}>
                <Feather name="file-text" size={20} color={theme.colors.primary} />
              </View>
              <View style={styles.rowContent}>
                <Text numberOfLines={1} style={[styles.rowTitle, { color: theme.colors.onSurface }]}>{invoice.customerSnapshot.name}</Text>
                <Text numberOfLines={1} style={[styles.rowMeta, { color: theme.colors.onSurfaceVariant }]}>
                  <Text style={{ ...fontStyles.semiBold, color: theme.colors.onSurfaceVariant }}>{invoice.invoiceNumber}</Text>
                  {`  -  ${formatDate(invoice.date)}`}
                </Text>
                <View style={[styles.statusChip, { backgroundColor: tone.background, borderColor: tone.border }]}>
                  <Text variant="labelSmall" style={[styles.statusText, { color: tone.foreground }]}>{invoice.status}</Text>
                </View>
              </View>
              <View style={styles.amountBlock}>
                <Text style={[styles.amountText, { color: theme.colors.onSurface }]}>{formatCurrency(invoice.total)}</Text>
                <View style={styles.viewHint}>
                  <Text style={[styles.viewHintLabel, { color: theme.colors.primary }]}>View</Text>
                  <Feather name="chevron-right" size={15} color={theme.colors.primary} />
                </View>
              </View>
            </Pressable>
          );
        }) : <EmptyState title="No recent invoices" message="Recent invoices appear after matching sales activity." />}
      </AppCard>

      <ReportRangeSheet
        visible={filtersOpen}
        value={draftRange}
        onChange={setDraftRange}
        onClose={() => setFiltersOpen(false)}
        onApply={applyFilters}
        onReset={resetFilters}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  activityRow: {
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    elevation: 2,
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    padding: 14,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16
  },
  amountBlock: { alignItems: 'flex-end', gap: 6 },
  amountText: { ...fontStyles.bold, fontSize: 15, letterSpacing: -0.25 },
  countBox: { alignItems: 'center', borderRadius: radii.lg, borderWidth: 1, flex: 1, paddingHorizontal: 8, paddingVertical: 14 },
  countGrid: { flexDirection: 'row', gap: 8, marginTop: 12 },
  countIconTile: { alignItems: 'center', borderRadius: radii.md, height: 30, justifyContent: 'center', marginBottom: 8, width: 30 },
  countLabel: { ...fontStyles.semiBold, fontSize: 11, letterSpacing: 0.3, marginTop: 2 },
  countValue: { ...fontStyles.bold, fontSize: 23, lineHeight: 28 },
  applyBtn: {
    alignItems: 'center',
    borderRadius: radii.lg,
    elevation: 4,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginHorizontal: 18,
    marginTop: 10,
    paddingVertical: 14,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 14
  },
  applyLabel: { ...fontStyles.bold, color: '#FFFFFF', fontSize: 14, letterSpacing: 0.2 },
  filterButton: { alignItems: 'center', borderRadius: radii.pill, borderWidth: 1, flexDirection: 'row', gap: 7, justifyContent: 'center', marginTop: 14, paddingVertical: 10 },
  filterButtonText: { ...fontStyles.bold, fontSize: 12.5 },
  grabber: { alignItems: 'center', paddingTop: 8 },
  grabberBar: { borderRadius: radii.pill, height: 4, width: 38 },
  iconBubble: { alignItems: 'center', borderRadius: radii.card, height: 42, justifyContent: 'center', width: 42 },
  iconAction: { alignItems: 'center', borderRadius: radii.md, height: 36, justifyContent: 'center', width: 36 },
  invoiceMiniChip: { alignItems: 'center', borderRadius: radii.pill, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 9, paddingVertical: 5 },
  invoiceMiniText: { ...fontStyles.bold, fontSize: 11 },
  productRow: {
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    elevation: 2,
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    padding: 14,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16
  },
  rankBadge: { alignItems: 'center', borderRadius: radii.pill, height: 42, justifyContent: 'center', width: 42 },
  rankText: { ...fontStyles.bold, fontSize: 13 },
  resetBtn: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  resetLabel: { ...fontStyles.bold, fontSize: 12 },
  rowContent: { flex: 1, minWidth: 0 },
  rowMeta: { ...typeScale.caption, marginTop: 2 },
  rowTitle: { ...fontStyles.bold, fontSize: 15 },
  salesBlock: { alignItems: 'flex-end', gap: 6 },
  screenContent: { paddingTop: 8 },
  sectionCard: { marginBottom: 16 },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  sectionHint: { ...typeScale.caption, marginTop: 2 },
  sectionTitle: { ...fontStyles.bold, fontSize: 16 },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    elevation: 24,
    maxHeight: '86%',
    paddingTop: 6,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.25,
    shadowRadius: 24
  },
  sheetContent: { paddingHorizontal: 18, paddingTop: 18 },
  sheetFill: { flex: 1, justifyContent: 'flex-end' },
  sheetHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 8 },
  sheetSubtitle: { ...typeScale.caption, marginTop: 2 },
  sheetTitle: { ...fontStyles.bold, fontSize: 18, letterSpacing: -0.3 },
  soldChip: { alignItems: 'center', flexDirection: 'row', gap: 5, marginTop: 6 },
  statRow: { flexDirection: 'row', marginBottom: 2, marginHorizontal: -6 },
  statusChip: { alignSelf: 'flex-start', borderRadius: radii.badge, borderWidth: 1, marginTop: 8, paddingHorizontal: 9, paddingVertical: 4 },
  statusText: { ...fontStyles.semiBold, fontSize: 11, letterSpacing: 0.4, textTransform: 'capitalize' },
  summaryBody: { alignItems: 'flex-end', flexDirection: 'row', gap: 12, justifyContent: 'space-between', marginTop: 16 },
  summaryCard: { marginBottom: 14 },
  summaryHeader: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  summaryIconTile: { alignItems: 'center', borderRadius: radii.md, height: 40, justifyContent: 'center', width: 40 },
  summaryLabel: { ...fontStyles.semiBold, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase' },
  summaryMetric: { flex: 1, minWidth: 0 },
  summarySide: { alignItems: 'flex-end', gap: 6 },
  summarySubtitle: { ...typeScale.caption, marginTop: 2 },
  summaryTitle: { ...fontStyles.bold, fontSize: 15 },
  summaryValue: { ...fontStyles.bold, fontSize: 28, letterSpacing: -0.7, lineHeight: 34 },
  syncText: { ...typeScale.caption, fontSize: 11 },
  trendChip: { alignItems: 'center', borderRadius: radii.pill, height: 26, justifyContent: 'center', width: 26 },
  viewHint: { alignItems: 'center', flexDirection: 'row', gap: 2 },
  viewHintLabel: { ...fontStyles.bold, fontSize: 12 }
});
