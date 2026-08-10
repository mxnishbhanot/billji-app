import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AlertCircle, BarChart3, Box, Calendar, Clock, FileText, Wallet, Zap } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from 'react-native-paper';
import { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { reportsApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { useAppDialog } from '@/components/AppDialog';
import {
  DashboardHeader,
  HeroCard,
  MetricCard,
  QuickActionCard,
  RecentActivity,
  SalesTrendCard
} from '@/components/dashboard';
import { Screen } from '@/components/Screen';
import { UsageMeter } from '@/components/UsageMeter';
import { LIMIT } from '@/constants/entitlements';
import { TourAnchor, ANCHOR, useOnboardingOptional } from '@/features/onboarding';
import { DashboardScreenProps } from '@/navigation/types';
import { PERMISSION, usePermissions } from '@/shared/hooks/usePermissions';
import { useEntitlements } from '@/shared/hooks/useEntitlements';
import { queryKeys } from '@/shared/query/queryKeys';
import { alpha, appColors, fontStyles, radii, spacing, typeScale } from '@/theme/theme';
import { formatCurrency } from '@/utils/format';

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

export function DashboardScreen({ navigation }: DashboardScreenProps) {
  const theme = useTheme();
  const { showDialog } = useAppDialog();
  const { can } = usePermissions();
  const canCreateInvoice = can(PERMISSION.invoicesCreate);
  const isDark = theme.dark;
  const colors = useMemo(() => appColors(isDark), [isDark]);
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });
  const documentQuota = useEntitlements().usage(LIMIT.documentsPerMonth);
  const query = useQuery({ queryKey: queryKeys.report.all, queryFn: () => reportsApi.summary() });

  useEffect(() => {
    if (query.error) showDialog({ title: 'Could not load dashboard', message: apiErrorMessage(query.error), tone: 'error' });
  }, [query.error, showDialog]);

  const report = query.data;

  // Each card gets its own daily series; older backends only send salesTrend, so fall back to it.
  const sparks = useMemo(() => {
    const legacy = (report?.salesTrend ?? []).map((point) => Number(point.sales || 0)).slice(-7);
    const fallback = legacy.length > 1 ? legacy : [];
    const pick = (series?: number[]) => (series && series.length > 1 ? series : fallback);
    const trends = report?.metricTrends;
    return {
      today: pick(trends?.today),
      month: pick(trends?.month),
      invoices: pick(trends?.invoices),
      pending: pick(trends?.pending)
    };
  }, [report?.metricTrends, report?.salesTrend]);

  const metrics = useMemo(
    () => [
      {
        key: 'today',
        label: 'TODAY',
        value: formatCurrency(report?.todaySales),
        hint: 'Collected today',
        icon: Wallet,
        accent: colors.categoryGreen,
        sparkData: sparks.today,
        onPress: () =>
          navigation.navigate('InvoicesTab', {
            screen: 'InvoiceList',
            params: { status: 'paid', ...todayRange(), sort: 'newest', fromReports: true }
          })
      },
      {
        key: 'month',
        label: 'THIS MONTH',
        value: formatCurrency(report?.monthlySales),
        hint: 'Collected this month',
        icon: Calendar,
        accent: colors.categoryPurple,
        sparkData: sparks.month,
        onPress: () =>
          navigation.navigate('InvoicesTab', {
            screen: 'InvoiceList',
            params: { status: 'paid', ...monthRange(), sort: 'newest', fromReports: true }
          })
      },
      {
        key: 'invoices',
        label: 'INVOICES',
        value: report?.totalInvoices || 0,
        hint: 'All time',
        icon: FileText,
        accent: colors.categoryOrange,
        sparkData: sparks.invoices,
        onPress: () => navigation.navigate('InvoicesTab', { screen: 'InvoiceList' })
      },
      {
        key: 'pending',
        label: 'PENDING',
        value: report?.pendingInvoices || 0,
        hint: 'Need follow-up',
        icon: Clock,
        accent: colors.categoryBlue,
        sparkData: sparks.pending,
        onPress: () => navigation.navigate('InvoicesTab', { screen: 'InvoiceList', params: { status: 'pending' } })
      }
    ],
    [colors, navigation, report, sparks]
  );

  const duesOutstanding = report?.dues?.totalOutstanding ?? 0;
  const duesCount = (report?.dues?.unpaidCount ?? 0) + (report?.dues?.partialCount ?? 0);

  const quickActions = useMemo(
    () => [
      {
        key: 'invoices',
        title: 'Invoices',
        subtitle: 'Create & manage',
        icon: FileText,
        accent: colors.categoryOrange,
        onPress: () => navigation.navigate('InvoicesTab', { screen: 'InvoiceList' })
      },
      {
        key: 'expenses',
        title: 'Expenses',
        subtitle: 'Track spending',
        icon: Wallet,
        accent: colors.categoryOrange,
        onPress: () => navigation.navigate('Expenses')
      },
      {
        key: 'products',
        title: 'Products',
        subtitle: 'Manage stock',
        icon: Box,
        accent: colors.categoryGreen,
        onPress: () => navigation.navigate('CatalogTab', { screen: 'Products' })
      },
      {
        key: 'reports',
        title: 'Reports',
        subtitle: 'View insights',
        icon: BarChart3,
        accent: colors.categoryPurple,
        onPress: () => navigation.navigate('Reports'),
        anchorId: ANCHOR.reportsButton
      }
    ],
    [colors, navigation]
  );

  const viewAllRecentActivity = useCallback(() => {
    navigation.navigate('InvoicesTab', {
      screen: 'InvoiceList',
      params: { ...recentActivityRange(), sort: 'newest', fromReports: true }
    });
  }, [navigation]);

  const createInvoice = useCallback(() => {
    navigation.navigate('InvoicesTab', { screen: 'InvoiceCreate' });
  }, [navigation]);

  const trendData = useMemo(
    () =>
      (report?.salesTrend ?? []).map((point) => {
        const date = new Date(point.date);
        const label = Number.isNaN(date.getTime())
          ? point.date.slice(5)
          : `${date.getDate()} ${date.toLocaleString('en-IN', { month: 'short' })}`;
        return { label, value: Number(point.sales || 0), date: point.date };
      }),
    [report?.salesTrend]
  );

  const recent = report?.recentInvoices ?? [];
  const onboarding = useOnboardingOptional();
  const scrollRef = useRef<ScrollView>(null);
  const activeTour = onboarding?.activeTour;
  const quickRailY = useRef(0);

  useEffect(() => {
    const anchorId = activeTour?.tour.steps[activeTour.stepIndex]?.anchorId;
    if (anchorId === ANCHOR.createInvoice) {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } else if (anchorId === ANCHOR.reportsButton) {
      scrollRef.current?.scrollTo({ y: quickRailY.current, animated: true });
    }
  }, [activeTour]);

  const settled = duesOutstanding <= 0;

  return (
    <Screen
      title="Dashboard"
      scrollRef={scrollRef}
      contentStyle={styles.screenContent}
      renderHeader={() => <DashboardHeader />}
      scrollViewProps={{
        scrollEventThrottle: 16,
        onScroll: scrollHandler
      }}
    >
      <HeroCard
        collectionAmount={formatCurrency(report?.todaySales)}
        todayInAmount={formatCurrency(report?.todaySales)}
        settled={settled}
        canCreateInvoice={canCreateInvoice}
        onCreateInvoice={createInvoice}
        createInvoiceAnchor={(children) => <TourAnchor anchorId={ANCHOR.createInvoice}>{children}</TourAnchor>}
        invoices={report?.totalInvoices || 0}
        customers={report?.totalCustomers || 0}
        products={report?.totalProducts || 0}
        pending={report?.pendingInvoices || 0}
        onInvoices={() => navigation.navigate('InvoicesTab', { screen: 'InvoiceList' })}
        onCustomers={() => navigation.navigate('CustomersTab', { screen: 'Customers' })}
        onProducts={() => navigation.navigate('CatalogTab', { screen: 'Products' })}
        onPending={() => navigation.navigate('InvoicesTab', { screen: 'InvoiceList', params: { status: 'pending' } })}
        scrollY={scrollY}
      />

      {documentQuota && !documentQuota.unlimited && documentQuota.percentUsed >= 80 ? (
        <Pressable
          onPress={() => navigation.navigate('SettingsTab', { screen: 'Plans' })}
          style={({ pressed }) => [
            styles.quotaCard,
            {
              backgroundColor: colors.card,
              borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08),
              opacity: pressed ? 0.95 : 1
            }
          ]}
        >
          <UsageMeter row={documentQuota} compact />
          <Text style={[styles.quotaCta, { color: theme.colors.primary }]}>
            {documentQuota.remaining === 0 ? 'Upgrade to keep billing →' : 'See plans →'}
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.metricRow}>
        {metrics.map((item) => (
          <MetricCard
            key={item.key}
            label={item.label}
            value={item.value}
            hint={item.hint}
            icon={item.icon}
            accent={item.accent}
            sparkData={item.sparkData}
            onPress={item.onPress}
          />
        ))}
      </View>

      {duesOutstanding > 0 ? (
        <Pressable
          onPress={() => navigation.navigate('PaymentReminders')}
          accessibilityRole="button"
          accessibilityLabel={`Send payment reminders for ${formatCurrency(duesOutstanding)} outstanding`}
          style={({ pressed }) => [
            styles.duesBanner,
            {
              backgroundColor: alpha(colors.destructive, isDark ? 0.16 : 0.07),
              borderColor: alpha(colors.destructive, isDark ? 0.32 : 0.18),
              opacity: pressed ? 0.92 : 1
            }
          ]}
        >
          <View style={[styles.duesIcon, { backgroundColor: alpha(colors.destructive, isDark ? 0.26 : 0.14) }]}>
            <AlertCircle size={18} color={colors.destructive} strokeWidth={2} />
          </View>
          <View style={styles.duesText}>
            <Text style={[styles.duesAmount, { color: colors.destructive }]}>{formatCurrency(duesOutstanding)} pending</Text>
            <Text numberOfLines={1} style={[styles.duesHint, { color: theme.colors.onSurfaceVariant }]}>
              {duesCount} customer{duesCount === 1 ? '' : 's'} to chase · tap to send WhatsApp reminders
            </Text>
          </View>
        </Pressable>
      ) : null}

      <View
        style={styles.quickSection}
        onLayout={(e) => {
          quickRailY.current = e.nativeEvent.layout.y;
        }}
      >
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIcon, { backgroundColor: alpha(colors.primary, isDark ? 0.2 : 0.1) }]}>
            <Zap size={16} color={colors.primary} strokeWidth={2} />
          </View>
          <View style={styles.sectionText}>
            <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Quick actions</Text>
            <Text style={[styles.sectionSubtitle, { color: theme.colors.onSurfaceVariant }]}>Everything you need, right here</Text>
          </View>
        </View>
        <View style={styles.quickGrid}>
          {quickActions.map((item) => {
            const card = (
              <QuickActionCard
                title={item.title}
                subtitle={item.subtitle}
                icon={item.icon}
                accent={item.accent}
                onPress={item.onPress}
              />
            );
            return item.anchorId ? (
              <TourAnchor key={item.key} anchorId={item.anchorId} style={styles.quickCell}>
                {card}
              </TourAnchor>
            ) : (
              <View key={item.key} style={styles.quickCell}>
                {card}
              </View>
            );
          })}
        </View>
      </View>

      <SalesTrendCard data={trendData} />

      <RecentActivity
        invoices={recent}
        onViewAll={viewAllRecentActivity}
        onPressInvoice={(id) => navigation.navigate('InvoicesTab', { screen: 'InvoiceDetail', params: { id } })}
        canCreateInvoice={canCreateInvoice}
        onCreateInvoice={createInvoice}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  duesAmount: { ...fontStyles.bold, fontSize: 15 },
  duesBanner: {
    alignItems: 'center',
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: spacing.section,
    marginTop: 4,
    padding: 14
  },
  duesHint: { ...typeScale.caption, fontSize: 12, marginTop: 2 },
  duesIcon: { alignItems: 'center', borderRadius: radii.md, height: 36, justifyContent: 'center', width: 36 },
  duesText: { flex: 1, minWidth: 0 },
  metricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: spacing.section },
  quickCell: { flexBasis: '47%', flexGrow: 1, maxWidth: '48%' },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.gap },
  quickSection: { marginBottom: spacing.section },
  quotaCard: {
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.gap,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  quotaCta: { ...fontStyles.semiBold, fontSize: 12, marginTop: 8 },
  screenContent: { paddingTop: 4 },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', gap: 10, marginBottom: 14 },
  sectionIcon: {
    alignItems: 'center',
    borderRadius: 10,
    height: 32,
    justifyContent: 'center',
    width: 32
  },
  sectionSubtitle: { ...typeScale.caption, fontSize: 12, marginTop: 1 },
  sectionText: { flex: 1, minWidth: 0 },
  sectionTitle: { ...fontStyles.bold, fontSize: 18 }
});
