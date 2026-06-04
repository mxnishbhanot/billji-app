import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { reportsApi } from '@/api/endpoints';
import { AppCard } from '@/components/AppCard';
import { ChartCard } from '@/components/ChartCard';
import { DateRange, DateRangePicker } from '@/components/DateRangePicker';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { StatCard } from '@/components/StatCard';
import { ReportsScreenProps } from '@/navigation/types';
import { queryKeys } from '@/shared/query/queryKeys';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import { PaymentMethod } from '@/types';
import { formatCurrency, formatDate } from '@/utils/format';

const METHOD_META: Record<PaymentMethod, { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = {
  cash: { label: 'Cash', icon: 'cash' },
  upi: { label: 'UPI', icon: 'cellphone' },
  bank_transfer: { label: 'Bank transfer', icon: 'bank-outline' },
  card: { label: 'Card', icon: 'credit-card-outline' },
  cheque: { label: 'Cheque', icon: 'checkbook' },
  wallet: { label: 'Wallet', icon: 'wallet-outline' },
  other: { label: 'Other', icon: 'dots-horizontal' }
};

const displayRange = (range: DateRange) => {
  if (!range.from && !range.to) return 'All time';
  return `${range.from ? formatDate(range.from) : 'Start'} - ${range.to ? formatDate(range.to) : 'Today'}`;
};

type Preset = 'today' | 'week' | 'month' | 'custom';
const PRESETS: { key: Exclude<Preset, 'custom'>; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' }
];
const PRESET_LABEL: Record<Preset, string> = { today: 'Today', week: 'This week', month: 'This month', custom: 'Custom range' };

const toIso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const rangeForPreset = (key: Exclude<Preset, 'custom'>): DateRange => {
  const now = new Date();
  const today = toIso(now);
  if (key === 'today') return { from: today, to: today };
  if (key === 'week') return { from: toIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)), to: today };
  return { from: toIso(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
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
              helperText="Sales, collections, products, and customers follow this range. Outstanding dues always show the live total."
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

// Section wrapper: title + hint + optional "View all" action, then children.
function SectionCard({
  icon,
  title,
  hint,
  actionLabel,
  onAction,
  children,
  style
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  hint: string;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
  style?: object;
}) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  return (
    <AppCard style={[styles.sectionCard, style] as object}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIcon, { backgroundColor: alpha(colors.primary, isDark ? 0.2 : 0.1) }]}>
          <MaterialCommunityIcons name={icon} size={19} color={theme.colors.primary} />
        </View>
        <View style={styles.rowContent}>
          <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>{title}</Text>
          <Text style={[styles.sectionHint, { color: theme.colors.onSurfaceVariant }]}>{hint}</Text>
        </View>
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} hitSlop={8} style={styles.linkBtn}>
            <Text style={[styles.linkLabel, { color: theme.colors.primary }]}>{actionLabel}</Text>
            <Feather name="chevron-right" size={15} color={theme.colors.primary} />
          </Pressable>
        ) : null}
      </View>
      {children}
    </AppCard>
  );
}

// Hero number + caption inside a section.
function Hero({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.hero}>
      <Text style={[styles.heroLabel, { color: theme.colors.onSurfaceVariant }]}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.heroValue, { color: accent || theme.colors.onSurface }]}>{value}</Text>
    </View>
  );
}

// Horizontal share bar used for collected-vs-invoiced and method breakdown.
function ShareBar({ ratio, color }: { ratio: number; color: string }) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const pct = Math.max(0, Math.min(1, ratio || 0));
  return (
    <View style={[styles.shareTrack, { backgroundColor: isDark ? alpha(colors.border, 0.6) : alpha(colors.primaryStrong, 0.08) }]}>
      <View style={[styles.shareFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
    </View>
  );
}

export function ReportsScreen({ navigation }: ReportsScreenProps) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(theme.dark);
  const [preset, setPreset] = useState<Preset>('month');
  const [range, setRange] = useState<DateRange>(() => rangeForPreset('month'));
  const [draftRange, setDraftRange] = useState<DateRange>(range);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { data: report, isFetching, refetch } = useQuery({ queryKey: queryKeys.report.summary(range), queryFn: () => reportsApi.summary(range) });

  const selectPreset = (key: Exclude<Preset, 'custom'>) => {
    setPreset(key);
    setRange(rangeForPreset(key));
  };
  const openFilters = () => {
    setDraftRange(range);
    setFiltersOpen(true);
  };
  const applyFilters = () => {
    setPreset('custom');
    setRange(draftRange);
    setFiltersOpen(false);
  };
  const resetFilters = () => setDraftRange(rangeForPreset('month'));
  const rangeParams = { from: range.from, to: range.to };

  const viewInvoices = () => navigation.navigate('InvoicesTab', { screen: 'InvoiceList', params: { ...rangeParams, sort: 'newest', fromReports: true } });
  const viewUnpaidInvoices = () => navigation.navigate('InvoicesTab', { screen: 'InvoiceList', params: { status: 'pending', fromReports: true } });
  const viewProducts = () => navigation.navigate('CatalogTab', { screen: 'Products', params: { ...rangeParams, sort: 'top-sales', fromReports: true } });
  const viewCustomers = () => navigation.navigate('CustomersTab', { screen: 'Customers' });

  const sales = report?.sales;
  const collected = report?.collected;
  const dues = report?.dues;
  const performance = report?.performance;

  const collectRatio = collected && collected.invoicedInRange > 0 ? collected.range / collected.invoicedInRange : 0;
  const methodTotal = collected?.methodBreakdown.reduce((sum, m) => sum + m.amount, 0) || 0;

  return (
    <Screen title="Reports" contentStyle={styles.screenContent}>
      {/* Period selector — one control that every card below obeys */}
      <View style={styles.rangeBar}>
        <View style={[styles.segment, { backgroundColor: isDark ? alpha(colors.border, 0.5) : alpha(colors.primaryStrong, 0.06) }]}>
          {PRESETS.map((p) => {
            const active = preset === p.key;
            return (
              <Pressable key={p.key} onPress={() => selectPreset(p.key)} style={[styles.segChip, active && { backgroundColor: theme.colors.primary }]}>
                <Text style={[styles.segText, { color: active ? '#FFFFFF' : theme.colors.onSurfaceVariant }]}>{p.label}</Text>
              </Pressable>
            );
          })}
          <Pressable onPress={openFilters} style={[styles.segChip, styles.segChipCustom, preset === 'custom' && { backgroundColor: theme.colors.primary }]}>
            <Feather name="calendar" size={12} color={preset === 'custom' ? '#FFFFFF' : theme.colors.onSurfaceVariant} />
            <Text style={[styles.segText, { color: preset === 'custom' ? '#FFFFFF' : theme.colors.onSurfaceVariant }]}>Custom</Text>
          </Pressable>
        </View>
        <Pressable onPress={() => void refetch()} style={({ pressed }) => [styles.iconAction, { backgroundColor: alpha(colors.primary, pressed ? 0.22 : 0.12) }]}>
          <Feather name="refresh-cw" size={16} color={theme.colors.primary} />
        </Pressable>
      </View>
      <Text style={[styles.rangeCaption, { color: theme.colors.onSurfaceVariant }]}>
        {isFetching ? 'Refreshing...' : `${displayRange(range)}  ·  ${sales?.invoiceCount ?? 0} invoices`}
      </Text>

      {/* Q1 — How much did I sell? (invoiced) */}
      <SectionCard icon="cart-outline" title="How much did I sell?" hint="Invoiced amount you billed" actionLabel="Invoices" onAction={viewInvoices}>
        <Hero label={`Invoiced · ${PRESET_LABEL[preset]}`} value={formatCurrency(sales?.range)} />
      </SectionCard>

      <ChartCard title="Sales trend" data={sales?.trend || []} />

      {/* Q2 — How much did I collect? (payments) */}
      <SectionCard icon="cash-multiple" title="How much did I collect?" hint="Actual payments received">
        <View style={styles.splitRow}>
          <View style={styles.splitCell}>
            <Text style={[styles.splitLabel, { color: theme.colors.onSurfaceVariant }]}>Collected</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.splitValue, { color: colors.accent }]}>{formatCurrency(collected?.range)}</Text>
          </View>
          <View style={styles.splitCell}>
            <Text style={[styles.splitLabel, { color: theme.colors.onSurfaceVariant }]}>Not yet collected</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.splitValue, { color: theme.colors.onSurface }]}>{formatCurrency(collected?.uncollectedInRange)}</Text>
          </View>
        </View>
        <ShareBar ratio={collectRatio} color={colors.accent} />
        <Text style={[styles.shareCaption, { color: theme.colors.onSurfaceVariant }]}>
          {Math.round(collectRatio * 100)}% of {formatCurrency(collected?.invoicedInRange)} invoiced collected · {PRESET_LABEL[preset]}
        </Text>

        <Text style={[styles.subHead, { color: theme.colors.onSurface }]}>By payment method</Text>
        {collected?.methodBreakdown.length ? collected.methodBreakdown.map((m) => {
          const meta = METHOD_META[m.method] || METHOD_META.other;
          return (
            <View key={m.method} style={styles.methodRow}>
              <View style={[styles.methodIcon, { backgroundColor: alpha(colors.primary, isDark ? 0.2 : 0.1) }]}>
                <MaterialCommunityIcons name={meta.icon} size={16} color={theme.colors.primary} />
              </View>
              <View style={styles.rowContent}>
                <View style={styles.methodTop}>
                  <Text style={[styles.methodLabel, { color: theme.colors.onSurface }]}>{meta.label}</Text>
                  <Text style={[styles.methodAmount, { color: theme.colors.onSurface }]}>{formatCurrency(m.amount)}</Text>
                </View>
                <ShareBar ratio={methodTotal ? m.amount / methodTotal : 0} color={colors.primary} />
              </View>
            </View>
          );
        }) : <EmptyState title="No payments yet" message="Record a payment on an invoice to see collections here." />}
      </SectionCard>

      {/* Q3 — Who owes me money? (live snapshot) */}
      <SectionCard icon="account-clock-outline" title="Who owes me money?" hint="Live outstanding balance" actionLabel="Unpaid" onAction={viewUnpaidInvoices}>
        <Hero label="Total outstanding" value={formatCurrency(dues?.totalOutstanding)} accent={colors.warning} />
        <View style={styles.dueChips}>
          <Pressable onPress={viewUnpaidInvoices} style={[styles.dueChip, { backgroundColor: alpha(colors.destructive, isDark ? 0.16 : 0.08), borderColor: alpha(colors.destructive, 0.2) }]}>
            <Text style={[styles.dueChipValue, { color: colors.destructive }]}>{formatCurrency(dues?.unpaidAmount)}</Text>
            <Text style={[styles.dueChipLabel, { color: colors.destructive }]}>{dues?.unpaidCount ?? 0} unpaid</Text>
          </Pressable>
          <Pressable onPress={viewUnpaidInvoices} style={[styles.dueChip, { backgroundColor: alpha(colors.warning, isDark ? 0.16 : 0.08), borderColor: alpha(colors.warning, 0.2) }]}>
            <Text style={[styles.dueChipValue, { color: colors.warning }]}>{formatCurrency(dues?.partialAmount)}</Text>
            <Text style={[styles.dueChipLabel, { color: colors.warning }]}>{dues?.partialCount ?? 0} partial</Text>
          </Pressable>
        </View>

        <Text style={[styles.subHead, { color: theme.colors.onSurface }]}>Top customers by dues</Text>
        {dues?.topDebtors.length ? dues.topDebtors.map((d, index) => (
          <View key={`${d.customerId ?? d.name}-${index}`} style={[styles.listRow, { backgroundColor: colors.card, borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08) }]}>
            <View style={[styles.rankBadge, { backgroundColor: alpha(colors.warning, isDark ? 0.22 : 0.14) }]}>
              <Text style={[styles.rankText, { color: colors.warning }]}>#{index + 1}</Text>
            </View>
            <View style={styles.rowContent}>
              <Text numberOfLines={1} style={[styles.rowTitle, { color: theme.colors.onSurface }]}>{d.name}</Text>
              <Text style={[styles.rowMeta, { color: theme.colors.onSurfaceVariant }]}>{d.invoices} open invoice{d.invoices === 1 ? '' : 's'}</Text>
            </View>
            <Text style={[styles.amountText, { color: colors.warning }]}>{formatCurrency(d.balance)}</Text>
          </View>
        )) : <EmptyState title="All settled" message="No outstanding dues right now." />}
      </SectionCard>

      {/* Q4 — What is performing well? */}
      <SectionCard icon="trophy-outline" title="What is performing well?" hint="Top products, customers & invoice value">
        <View style={styles.avgRow}>
          <StatCard label="Avg invoice" value={formatCurrency(performance?.averageInvoiceValue)} hint="Per invoice" icon="calculator-variant-outline" />
        </View>

        <View style={styles.subHeadRow}>
          <Text style={[styles.subHead, styles.subHeadInline, { color: theme.colors.onSurface }]}>Top products</Text>
          <Pressable onPress={viewProducts} hitSlop={8} style={styles.linkBtn}>
            <Text style={[styles.linkLabel, { color: theme.colors.primary }]}>All</Text>
            <Feather name="chevron-right" size={15} color={theme.colors.primary} />
          </Pressable>
        </View>
        {performance?.topProducts.length ? performance.topProducts.map((product, index) => (
          <View key={`${product.name}-${index}`} style={[styles.listRow, { backgroundColor: colors.card, borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08) }]}>
            <View style={[styles.rankBadge, { backgroundColor: index === 0 ? alpha(colors.accent, isDark ? 0.22 : 0.14) : alpha(colors.primary, isDark ? 0.22 : 0.14) }]}>
              <Text style={[styles.rankText, { color: index === 0 ? colors.accent : colors.primary }]}>#{index + 1}</Text>
            </View>
            <View style={styles.rowContent}>
              <Text numberOfLines={1} style={[styles.rowTitle, { color: theme.colors.onSurface }]}>{product.name}</Text>
              <Text style={[styles.rowMeta, { color: theme.colors.onSurfaceVariant }]}>{product.quantity} units sold</Text>
            </View>
            <Text style={[styles.amountText, { color: theme.colors.onSurface }]}>{formatCurrency(product.sales)}</Text>
          </View>
        )) : <EmptyState title="No product data" message="Top products appear after invoices are created." />}

        <View style={styles.subHeadRow}>
          <Text style={[styles.subHead, styles.subHeadInline, { color: theme.colors.onSurface }]}>Top customers</Text>
          <Pressable onPress={viewCustomers} hitSlop={8} style={styles.linkBtn}>
            <Text style={[styles.linkLabel, { color: theme.colors.primary }]}>All</Text>
            <Feather name="chevron-right" size={15} color={theme.colors.primary} />
          </Pressable>
        </View>
        {performance?.topCustomers.length ? performance.topCustomers.map((c, index) => (
          <View key={`${c.customerId ?? c.name}-${index}`} style={[styles.listRow, { backgroundColor: colors.card, borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08) }]}>
            <View style={[styles.rankBadge, { backgroundColor: index === 0 ? alpha(colors.accent, isDark ? 0.22 : 0.14) : alpha(colors.primary, isDark ? 0.22 : 0.14) }]}>
              <Text style={[styles.rankText, { color: index === 0 ? colors.accent : colors.primary }]}>#{index + 1}</Text>
            </View>
            <View style={styles.rowContent}>
              <Text numberOfLines={1} style={[styles.rowTitle, { color: theme.colors.onSurface }]}>{c.name}</Text>
              <Text style={[styles.rowMeta, { color: theme.colors.onSurfaceVariant }]}>{c.invoices} invoice{c.invoices === 1 ? '' : 's'}</Text>
            </View>
            <Text style={[styles.amountText, { color: theme.colors.onSurface }]}>{formatCurrency(c.sales)}</Text>
          </View>
        )) : <EmptyState title="No customer data" message="Top customers appear after invoices are created." />}
      </SectionCard>

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
  amountText: { ...fontStyles.bold, fontSize: 15, letterSpacing: -0.25 },
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
  avgRow: { flexDirection: 'row', marginHorizontal: -6, marginTop: 12 },
  dueChip: { alignItems: 'center', borderRadius: radii.lg, borderWidth: 1, flex: 1, paddingVertical: 14 },
  dueChipLabel: { ...fontStyles.semiBold, fontSize: 11, letterSpacing: 0.3, marginTop: 4, textTransform: 'uppercase' },
  dueChipValue: { ...fontStyles.bold, fontSize: 18, letterSpacing: -0.3 },
  dueChips: { flexDirection: 'row', gap: 10, marginTop: 14 },
  grabber: { alignItems: 'center', paddingTop: 8 },
  grabberBar: { borderRadius: radii.pill, height: 4, width: 38 },
  hero: { marginTop: 14 },
  heroLabel: { ...fontStyles.semiBold, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase' },
  heroValue: { ...fontStyles.bold, fontSize: 30, letterSpacing: -0.8, lineHeight: 36, marginTop: 4 },
  iconAction: { alignItems: 'center', borderRadius: radii.md, height: 36, justifyContent: 'center', width: 36 },
  linkBtn: { alignItems: 'center', flexDirection: 'row', gap: 1 },
  linkLabel: { ...fontStyles.bold, fontSize: 13 },
  listRow: {
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
    padding: 13
  },
  methodAmount: { ...fontStyles.bold, fontSize: 14 },
  methodIcon: { alignItems: 'center', borderRadius: radii.md, height: 34, justifyContent: 'center', width: 34 },
  methodLabel: { ...fontStyles.semiBold, fontSize: 13.5 },
  methodRow: { alignItems: 'center', flexDirection: 'row', gap: 12, marginTop: 12 },
  methodTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  rangeBar: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  rangeCaption: { ...typeScale.caption, marginBottom: 14, marginTop: 8, paddingHorizontal: 2 },
  rankBadge: { alignItems: 'center', borderRadius: radii.pill, height: 38, justifyContent: 'center', width: 38 },
  rankText: { ...fontStyles.bold, fontSize: 12.5 },
  resetBtn: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  resetLabel: { ...fontStyles.bold, fontSize: 12 },
  rowContent: { flex: 1, minWidth: 0 },
  rowMeta: { ...typeScale.caption, marginTop: 3 },
  rowTitle: { ...fontStyles.bold, fontSize: 14.5 },
  screenContent: { paddingTop: 8 },
  sectionCard: { marginBottom: 16 },
  segChip: { alignItems: 'center', borderRadius: radii.md, flex: 1, flexDirection: 'row', gap: 4, justifyContent: 'center', paddingVertical: 9 },
  segChipCustom: { flexGrow: 1.3 },
  segText: { ...fontStyles.bold, fontSize: 12.5 },
  segment: { borderRadius: radii.lg, flex: 1, flexDirection: 'row', gap: 4, padding: 4 },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', gap: 10, marginBottom: 2 },
  sectionHint: { ...typeScale.caption, marginTop: 2 },
  sectionIcon: { alignItems: 'center', borderRadius: radii.md, height: 38, justifyContent: 'center', width: 38 },
  sectionTitle: { ...fontStyles.bold, fontSize: 15.5, letterSpacing: -0.2 },
  shareCaption: { ...typeScale.caption, marginTop: 8 },
  shareFill: { borderRadius: radii.pill, height: '100%' },
  shareTrack: { borderRadius: radii.pill, height: 8, marginTop: 12, overflow: 'hidden', width: '100%' },
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
  splitCell: { flex: 1 },
  splitLabel: { ...fontStyles.semiBold, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' },
  splitRow: { flexDirection: 'row', gap: 12, marginTop: 14 },
  splitValue: { ...fontStyles.bold, fontSize: 22, letterSpacing: -0.5, marginTop: 4 },
  subHead: { ...fontStyles.bold, fontSize: 13.5, marginTop: 20 },
  subHeadInline: { marginTop: 0 },
  subHeadRow: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 }
});
