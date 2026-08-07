import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Reanimated, { Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Text, useTheme } from 'react-native-paper';
import { reportsApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { useAppDialog } from '@/components/AppDialog';
import { ChartCard } from '@/components/ChartCard';
import {
  ActivityGroup,
  ActivityRow,
  DashboardEmpty,
  DuesAlert,
  HeroCard,
  HeroCta,
  KpiCard,
  type KpiTone,
  QuickTile,
  RangeSegmented,
  Reveal,
  SectionHeading
} from '@/components/DashboardParts';
import { Screen } from '@/components/Screen';
import { UsageMeter } from '@/components/UsageMeter';
import { LIMIT } from '@/constants/entitlements';
import { useEntitlements } from '@/shared/hooks/useEntitlements';
import { DashboardScreenProps } from '@/navigation/types';
import { PERMISSION, usePermissions } from '@/shared/hooks/usePermissions';
import { queryKeys } from '@/shared/query/queryKeys';
import { useAuthStore } from '@/store/authStore';
import { TourAnchor, ANCHOR, useOnboardingOptional } from '@/features/onboarding';
import { alpha, appColors, fontStyles, radii, shadow, spacing, typeScale } from '@/theme/theme';
import { formatCurrency, formatDate } from '@/utils/format';
import { tapLight, tapMedium } from '@/utils/haptics';

const activityTime = (value?: string | Date | null) => {
  if (!value) return 'Just now';
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return formatDate(value);
  const date = new Date(timestamp);
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const day = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${time} • ${day}`;
};
const padDatePart = (value: number) => String(value).padStart(2, '0');
const formatISODate = (date: Date) => `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
const recentActivityRange = () => {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
  return { from: formatISODate(start), to: formatISODate(today) };
};
const todayRange = () => {
  const today = new Date();
  const iso = formatISODate(today);
  return { from: iso, to: iso };
};
const monthRange = () => {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  return { from: formatISODate(start), to: formatISODate(today) };
};
const daysBackRange = (days: number) => {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1));
  return { from: formatISODate(start), to: formatISODate(today) };
};
const greetingLabel = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning 👋';
  if (hour < 17) return 'Good afternoon 👋';
  return 'Good evening 👋';
};
const currentMonthLabel = () => new Date().toLocaleString('en-IN', { month: 'long' });

const TREND_RANGES = [
  { label: '7D', value: '7d' as const, days: 7, maxPoints: 7 },
  { label: '30D', value: '30d' as const, days: 30, maxPoints: 30 },
  { label: '90D', value: '90d' as const, days: 90, maxPoints: 90 }
];
type TrendRangeValue = (typeof TREND_RANGES)[number]['value'];

export function DashboardScreen({ navigation }: DashboardScreenProps) {
  const theme = useTheme();
  const { showDialog } = useAppDialog();
  const { can } = usePermissions();
  const canCreateInvoice = can(PERMISSION.invoicesCreate);
  const isDark = theme.dark;
  const isFocused = useIsFocused();
  const colors = useMemo(() => appColors(isDark), [isDark]);
  const businessName = useAuthStore((state) => state.user?.businessProfile?.businessName)?.trim();
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((event) => { scrollY.value = event.contentOffset.y; });
  const heroParallaxStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 210], [1, 0.92], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(scrollY.value, [0, 210], [0, 30], Extrapolation.CLAMP) },
      { scale: interpolate(scrollY.value, [0, 210], [1, 0.968], Extrapolation.CLAMP) }
    ]
  }));
  const documentQuota = useEntitlements().usage(LIMIT.documentsPerMonth);
  const query = useQuery({ queryKey: queryKeys.report.all, queryFn: () => reportsApi.summary() });

  useEffect(() => {
    if (query.error) showDialog({ title: 'Could not load dashboard', message: apiErrorMessage(query.error), tone: 'error' });
  }, [query.error, showDialog]);

  const report = query.data;

  // Chart range. 7D is already in the summary payload, so it costs no request; the wider ranges use
  // the same /reports/summary endpoint with the from/to params the Reports screen already passes.
  const [trendRange, setTrendRange] = useState<TrendRangeValue>('7d');
  const activeRange = TREND_RANGES.find((option) => option.value === trendRange) ?? TREND_RANGES[0];
  const rangeParams = useMemo(() => daysBackRange(activeRange.days), [activeRange.days]);
  const rangedQuery = useQuery({
    queryKey: queryKeys.report.summary(rangeParams),
    queryFn: () => reportsApi.summary(rangeParams),
    enabled: trendRange !== '7d'
  });

  const salesTrend = useMemo(() => report?.salesTrend ?? [], [report?.salesTrend]);
  const chartTrend = trendRange === '7d' ? salesTrend : rangedQuery.data?.salesTrend ?? salesTrend;

  // Real per-day series, so the sparklines and deltas are data — never decoration.
  const salesSpark = useMemo(() => salesTrend.map((point) => Number(point.sales || 0)), [salesTrend]);
  const invoiceSpark = useMemo(() => salesTrend.map((point) => Number(point.invoices || 0)), [salesTrend]);
  const dayOverDay = useMemo(() => {
    if (salesSpark.length < 2) return null;
    const last = salesSpark[salesSpark.length - 1];
    const previous = salesSpark[salesSpark.length - 2];
    if (previous === 0) return last === 0 ? 0 : 100;
    return Math.round(((last - previous) / previous) * 100);
  }, [salesSpark]);
  const yesterdayValue = salesSpark.length >= 2 ? salesSpark[salesSpark.length - 2] : null;
  const weekTotal = useMemo(() => salesSpark.reduce((sum, value) => sum + value, 0), [salesSpark]);
  const totalInvoices = report?.totalInvoices || 0;
  const pendingInvoices = report?.pendingInvoices || 0;
  const pendingShare = totalInvoices ? pendingInvoices / totalInvoices : 0;

  // Semantic accents: money is emerald, risk is amber, documents are cyan, the month stays brand
  // indigo. Four accents, each earning its meaning — the surfaces themselves stay neutral.
  const stats: { label: string; value: string | number; caption: string; tone?: KpiTone; icon: keyof typeof MaterialCommunityIcons.glyphMap; delta?: number | null; deltaCaption?: string; spark?: number[]; meterFraction?: number | null; onPress?: () => void }[] = useMemo(() => [
    {
      label: 'Today',
      value: formatCurrency(report?.todaySales),
      caption: 'Collected today',
      tone: 'revenue',
      icon: 'credit-card-check-outline',
      delta: dayOverDay,
      deltaCaption: yesterdayValue != null ? `vs ${formatCurrency(yesterdayValue)} yesterday` : 'Collected today',
      spark: salesSpark,
      onPress: () => navigation.navigate('InvoicesTab', { screen: 'InvoiceList', params: { status: 'paid', ...todayRange(), sort: 'newest', fromReports: true } })
    },
    {
      label: 'This month',
      value: formatCurrency(report?.monthlySales),
      caption: `${formatCurrency(weekTotal)} in the last 7 days`,
      tone: 'reports',
      icon: 'calendar-month-outline',
      spark: salesSpark,
      onPress: () => navigation.navigate('InvoicesTab', { screen: 'InvoiceList', params: { status: 'paid', ...monthRange(), sort: 'newest', fromReports: true } })
    },
    {
      label: 'Invoices',
      value: totalInvoices,
      caption: 'Raised all time',
      tone: 'inventory',
      icon: 'file-document-outline',
      spark: invoiceSpark,
      onPress: () => navigation.navigate('InvoicesTab', { screen: 'InvoiceList' })
    },
    {
      label: 'Pending',
      value: pendingInvoices,
      caption: pendingInvoices > 0 ? 'Waiting on payment' : 'Nothing to chase',
      tone: pendingInvoices > 0 ? 'pending' : 'revenue',
      icon: 'clock-alert-outline',
      // No honest per-day series for open invoices, so the fourth slot carries their share of the
      // total instead of a fabricated line — same visual weight, still a real number.
      meterFraction: pendingShare,
      onPress: () => navigation.navigate('InvoicesTab', { screen: 'InvoiceList', params: { status: 'pending' } })
    }
  ], [navigation, report?.todaySales, report?.monthlySales, totalInvoices, pendingInvoices, pendingShare, dayOverDay, yesterdayValue, salesSpark, invoiceSpark, weekTotal]);

  // Dues are an all-time snapshot, not range-bound — the alert is the entry point to
  // the reminder flow, so it only appears when there is actually money to chase.
  const duesOutstanding = report?.dues?.totalOutstanding ?? 0;
  const duesCount = (report?.dues?.unpaidCount ?? 0) + (report?.dues?.partialCount ?? 0);
  const topDebtor = report?.dues?.topDebtors?.[0];

  const quickActions: { label: string; subtitle: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; tone: KpiTone; onPress: () => void; anchorId?: string }[] = useMemo(() => [
    { label: 'Invoices', subtitle: 'Create & manage', icon: 'file-document-multiple-outline', tone: 'primary', onPress: () => navigation.navigate('InvoicesTab', { screen: 'InvoiceList' }) },
    // Orders moved to a labelled tile on the Invoices screen, next to quotes and notes;
    // this slot now goes to money-out, which had no entry point at all.
    { label: 'Expenses', subtitle: 'Track spending', icon: 'cash-minus', tone: 'expenses', onPress: () => navigation.navigate('Expenses') },
    { label: 'Products', subtitle: 'Manage stock', icon: 'package-variant-closed', tone: 'inventory', onPress: () => navigation.navigate('CatalogTab', { screen: 'Products' }) },
    { label: 'Reports', subtitle: 'View insights', icon: 'chart-box-outline', tone: 'reports', onPress: () => navigation.navigate('Reports'), anchorId: ANCHOR.reportsButton }
  ], [navigation]);
  const viewAllRecentActivity = () => {
    navigation.navigate('InvoicesTab', {
      screen: 'InvoiceList',
      params: { ...recentActivityRange(), sort: 'newest', fromReports: true }
    });
  };

  const recent = report?.recentInvoices ?? [];
  const onboarding = useOnboardingOptional();
  const scrollRef = useRef<ScrollView>(null);

  // The Create Invoice button is at the top of this screen. If the tour targets it
  // while the user is scrolled down, snap to top so the spotlight lands on it.
  const activeTour = onboarding?.activeTour;
  const quickRailY = useRef(0);
  useEffect(() => {
    const anchorId = activeTour?.tour.steps[activeTour.stepIndex]?.anchorId;
    if (anchorId === ANCHOR.createInvoice) {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } else if (anchorId === ANCHOR.reportsButton) {
      // Reports lives in the quick-action rail further down; bring it into view.
      scrollRef.current?.scrollTo({ y: quickRailY.current, animated: true });
    }
  }, [activeTour]);

  return (
    // Subtitle is the greeting only: it is one short line, and appending the business name
    // ellipsized it mid-word — the hero already carries the name directly below.
    <Screen
      title="Dashboard"
      subtitle={greetingLabel()}
      scrollRef={scrollRef}
      contentStyle={styles.screenContent}
      scrollViewProps={{
        scrollEventThrottle: 16,
        onScroll: scrollHandler,
        refreshControl: (
          <RefreshControl
            refreshing={query.isFetching && !query.isPending}
            onRefresh={() => { tapLight(); void query.refetch(); }}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={isDark ? colors.surfaceContainerHigh : colors.card}
          />
        )
      }}
    >
      <Reanimated.View style={heroParallaxStyle}>
        <HeroCard
          businessName={businessName || 'Your business'}
          headline={`Collected in ${currentMonthLabel()}`}
          metricValue={formatCurrency(report?.monthlySales)}
          metricCaption={
            query.isPending
              ? 'Loading the latest figures…'
              : `${formatCurrency(report?.todaySales)} in today`
          }
          trendChange={dayOverDay}
          statusLabel={duesOutstanding > 0 ? `${duesCount} to collect` : 'All settled'}
          statusTone={duesOutstanding > 0 ? 'alert' : 'neutral'}
          animate={isFocused}
          cta={
            canCreateInvoice ? (
              <TourAnchor anchorId={ANCHOR.createInvoice} style={styles.heroCtaAnchor}>
                <HeroCta
                  label="Create invoice"
                  haptic={tapMedium}
                  onPress={() => navigation.navigate('InvoicesTab', { screen: 'InvoiceCreate' })}
                />
              </TourAnchor>
            ) : undefined
          }
        />
      </Reanimated.View>

      {/* Appears only once the month is 80% spent, so it is a nudge and not furniture. Tapping goes
          to the plan screen, which is where the number can actually be changed. */}
      {documentQuota && !documentQuota.unlimited && documentQuota.percentUsed >= 80 ? (
        <Reveal index={1}>
          <Pressable
            onPress={() => { tapLight(); navigation.navigate('SettingsTab', { screen: 'Plans' }); }}
            accessibilityRole="button"
            accessibilityLabel={`${documentQuota.label} usage. ${documentQuota.remaining === 0 ? 'Upgrade to keep billing' : 'See plans'}`}
            style={({ pressed }) => [
              styles.quotaCard,
              shadow(isDark, 'xs'),
              { backgroundColor: colors.card, borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08), opacity: pressed ? 0.95 : 1 }
            ]}
          >
            <UsageMeter row={documentQuota} compact />
            <Text style={[styles.quotaCta, { color: theme.colors.primary }]}>
              {documentQuota.remaining === 0 ? 'Upgrade to keep billing →' : 'See plans →'}
            </Text>
          </Pressable>
        </Reveal>
      ) : null}

      {duesOutstanding > 0 ? (
        <Reveal index={2}>
          <DuesAlert
            amount={formatCurrency(duesOutstanding)}
            message={`${duesCount} customer${duesCount === 1 ? '' : 's'} owe you money. Nudge them on WhatsApp before it ages further.`}
            supporting={topDebtor ? `Largest: ${topDebtor.name} · ${formatCurrency(topDebtor.balance)}` : 'Reminders go out with the invoice attached'}
            actionLabel="Send reminders"
            accessibilityLabel={`Send payment reminders for ${formatCurrency(duesOutstanding)} outstanding across ${duesCount} customers`}
            onPress={() => { tapMedium(); navigation.navigate('PaymentReminders'); }}
          />
        </Reveal>
      ) : null}

      <Reveal index={3}>
        <View style={styles.kpiRow}>
          {stats.slice(0, 2).map((item) => <KpiCard key={item.label} {...item} />)}
        </View>
      </Reveal>
      <Reveal index={4}>
        <View style={[styles.kpiRow, styles.kpiRowLast]}>
          {stats.slice(2).map((item) => <KpiCard key={item.label} {...item} />)}
        </View>
      </Reveal>

      <Reveal index={5}>
        <SectionHeading title="Quick actions" caption="Everything you reach for daily" />
        <View style={styles.quickGrid} onLayout={(e) => { quickRailY.current = e.nativeEvent.layout.y; }}>
          {quickActions.map((item) => {
            const tile = <QuickTile label={item.label} subtitle={item.subtitle} icon={item.icon} tone={item.tone} onPress={item.onPress} />;
            return item.anchorId
              ? <TourAnchor key={item.label} anchorId={item.anchorId} style={styles.quickCell}>{tile}</TourAnchor>
              : <View key={item.label} style={styles.quickCell}>{tile}</View>;
          })}
        </View>
      </Reveal>

      {/* No outer heading here: the chart card owns its own title, and two titles for one object is
          what made the hierarchy read muddy. */}
      <Reveal index={6} style={styles.chartBlock}>
        <ChartCard
          title="Sales trend"
          data={chartTrend}
          maxPoints={activeRange.maxPoints}
          subtitle={rangedQuery.isFetching ? 'Loading range…' : 'Drag across the line to read any day'}
          legendLabel={`Daily collections · last ${activeRange.days} days`}
          showTrendChip={false}
          headerAccessory={
            <View style={styles.rangeControl}>
              <RangeSegmented options={TREND_RANGES} value={trendRange} onChange={setTrendRange} />
            </View>
          }
        />
      </Reveal>

      <Reveal index={7}>
        <SectionHeading title="Recent activity" caption="Latest invoices and payments" actionLabel="View all" onAction={viewAllRecentActivity} />
        {recent.length ? (
          <ActivityGroup>
            {recent.slice(0, 5).map((invoice, index) => {
              const isPaid = invoice.status === 'paid';
              return (
                <ActivityRow
                  key={invoice._id}
                  first={index === 0}
                  name={invoice.customerSnapshot.name}
                  activity={isPaid ? 'Payment received' : 'Invoice raised'}
                  time={activityTime(invoice.createdAt || invoice.date)}
                  amount={formatCurrency(invoice.total)}
                  statusLabel={isPaid ? 'PAID' : 'PENDING'}
                  positive={isPaid}
                  onPress={() => navigation.navigate('InvoicesTab', { screen: 'InvoiceDetail', params: { id: invoice._id } })}
                />
              );
            })}
          </ActivityGroup>
        ) : (
          <DashboardEmpty
            canCreate={canCreateInvoice}
            onCreate={() => { tapMedium(); navigation.navigate('InvoicesTab', { screen: 'InvoiceCreate' }); }}
          />
        )}
      </Reveal>
    </Screen>
  );
}

/**
 * Vertical rhythm, stated once so it can be read at a glance:
 *   inside a group (KPI row → KPI row)      spacing.xs           8
 *   group → its next section                spacing.screenPadding 20
 *   section → section (quick actions, chart) spacing.sectionGapLg 28
 *   hero / dues / quota → next block        spacing.screenPadding 20  (set on the components)
 *   section heading → its content           spacing.headingGap   12  (set in SectionHeading)
 * Nothing on this screen uses a gap that is not one of those four.
 */
const styles = StyleSheet.create({
  chartBlock: { marginBottom: spacing.sectionGapLg - spacing.md },
  heroCtaAnchor: { flex: 1 },
  // kpiRow is not a wrapping row — its cells are flex:1, so `gap` is safe there.
  kpiRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xs },
  kpiRowLast: { marginBottom: spacing.screenPadding },
  quickCell: { width: '48.5%' },
  // No column `gap` here: 48.5% + 48.5% + a 12pt gap exceeds 100% of the content width, which wrapped
  // the second tile onto its own row. space-between supplies the 3% gutter instead; rowGap only.
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: spacing.sectionGapLg, rowGap: spacing.sm },
  quotaCard: { borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth, marginBottom: spacing.screenPadding, paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.sm },
  quotaCta: { ...typeScale.caption, ...fontStyles.semiBold, marginTop: spacing.xs },
  rangeControl: { width: 128 },
  screenContent: { paddingTop: spacing.xs }
});
