import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Reanimated, { Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Text, useTheme } from 'react-native-paper';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { CartesianChart, Line, Area } from 'victory-native';
import { useFont, LinearGradient as SkiaLinearGradient, vec, Circle as SkiaCircle } from '@shopify/react-native-skia';
import { reportsApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { useAppDialog } from '@/components/AppDialog';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { StatCard } from '@/components/StatCard';
import { DashboardScreenProps } from '@/navigation/types';
import { PERMISSION, usePermissions } from '@/shared/hooks/usePermissions';
import { queryKeys } from '@/shared/query/queryKeys';
import { GettingStartedSheet, ProgressPill, TourAnchor, ANCHOR, useOnboardingOptional } from '@/features/onboarding';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import { formatCurrency, formatDate } from '@/utils/format';

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

function HeroPattern() {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 360 210" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <LinearGradient id="heroGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#1C1A4A" />
          <Stop offset="0.5" stopColor="#2D2A6B" />
          <Stop offset="1" stopColor="#40388C" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width={360} height={210} fill="url(#heroGrad)" />
      <G opacity="0.2" stroke="#FFFFFF" strokeWidth={1.2} fill="none" strokeLinecap="round">
        <Path d="M -26 48 C 28 12, 84 12, 134 44 S 236 88, 392 24" />
        <Path d="M -30 82 C 38 38, 96 42, 154 76 S 270 126, 392 72" opacity={0.72} />
        <Path d="M -28 126 C 48 84, 116 96, 176 122 S 282 166, 390 116" opacity={0.58} />
        <Path d="M 32 202 C 92 158, 148 170, 204 188 S 294 224, 388 174" opacity={0.42} />
      </G>
      <G opacity="0.18" stroke="#FFFFFF" strokeWidth={1.1} fill="none">
        <Circle cx={272} cy={54} r={18} />
        <Circle cx={302} cy={86} r={8} />
        <Circle cx={70} cy={154} r={13} />
        <Circle cx={110} cy={38} r={6} />
      </G>
      <G opacity="0.08" stroke="#A5B4FC" strokeWidth={18} fill="none">
        <Path d="M 238 -18 C 284 16, 318 52, 386 48" />
        <Path d="M -34 188 C 36 150, 86 166, 146 206" />
      </G>
    </Svg>
  );
}

function FloatingHeroBubbles() {
  const first = useMemo(() => new Animated.Value(0), []);
  const second = useMemo(() => new Animated.Value(0), []);
  const third = useMemo(() => new Animated.Value(0), []);
  const fourth = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(first, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(first, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true })
        ]),
        Animated.sequence([
          Animated.timing(second, { toValue: 1, duration: 12000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(second, { toValue: 0, duration: 12000, easing: Easing.inOut(Easing.sin), useNativeDriver: true })
        ]),
        Animated.sequence([
          Animated.timing(third, { toValue: 1, duration: 15000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(third, { toValue: 0, duration: 15000, easing: Easing.inOut(Easing.sin), useNativeDriver: true })
        ]),
        Animated.sequence([
          Animated.timing(fourth, { toValue: 1, duration: 18000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(fourth, { toValue: 0, duration: 18000, easing: Easing.inOut(Easing.sin), useNativeDriver: true })
        ])
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [first, fourth, second, third]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View
        style={[
          styles.heroBubbleLarge,
          {
            opacity: first.interpolate({ inputRange: [0, 1], outputRange: [0.16, 0.26] }),
            transform: [
              { translateX: first.interpolate({ inputRange: [0, 1], outputRange: [0, -20] }) },
              { translateY: first.interpolate({ inputRange: [0, 1], outputRange: [0, 12] }) },
              { scale: first.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.08] }) }
            ]
          }
        ]}
      />
      <Animated.View
        style={[
          styles.heroBubbleSmall,
          {
            opacity: second.interpolate({ inputRange: [0, 1], outputRange: [0.1, 0.2] }),
            transform: [
              { translateX: second.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) },
              { translateY: second.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }) },
              { scale: second.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.1] }) }
            ]
          }
        ]}
      />
      <Animated.View
        style={[
          styles.heroBubbleMedium,
          {
            opacity: third.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.18] }),
            transform: [
              { translateX: third.interpolate({ inputRange: [0, 1], outputRange: [0, 24] }) },
              { translateY: third.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) },
              { scale: third.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.12] }) }
            ]
          }
        ]}
      />
      <Animated.View
        style={[
          styles.heroBubbleTiny,
          {
            opacity: fourth.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.22] }),
            transform: [
              { translateX: fourth.interpolate({ inputRange: [0, 1], outputRange: [0, -16] }) },
              { translateY: fourth.interpolate({ inputRange: [0, 1], outputRange: [0, -18] }) },
              { scale: fourth.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.14] }) }
            ]
          }
        ]}
      />
    </View>
  );
}

type TrendChartProps = {
  currency: string;
  data: { label: string; value: number }[];
  accent: string;
  gridColor: string;
  axisLabelColor: string;
};

const CHART_FONT = require('@expo-google-fonts/plus-jakarta-sans/500Medium/PlusJakartaSans_500Medium.ttf');

function TrendChart({ currency, data, accent, gridColor, axisLabelColor }: TrendChartProps) {
  const font = useFont(CHART_FONT, 10);
  const chartHeight = 168;
  const points = data.length ? data : [{ label: '-', value: 0 }];
  const chartData = points.map((point, index) => ({ x: index, y: point.value }));

  return (
    <View style={{ height: chartHeight }}>
      <CartesianChart
        data={chartData}
        xKey="x"
        yKeys={['y']}
        domainPadding={{ left: 16, right: 16, top: 24, bottom: 8 }}
        axisOptions={{
          font,
          lineColor: gridColor,
          labelColor: axisLabelColor,
          tickCount: { x: points.length, y: 3 },
          formatXLabel: (value) => points[value]?.label ?? '',
          formatYLabel: (value) => (value >= 1000 ? `${currency}${Math.round(value / 100) / 10}k` : `${currency}${Math.round(value)}`)
        }}
      >
        {({ points: pts, chartBounds }) => {
          const last = pts.y[pts.y.length - 1];
          return (
            <>
              <Area points={pts.y} y0={chartBounds.bottom} curveType="natural" animate={{ type: 'timing', duration: 500 }}>
                <SkiaLinearGradient start={vec(0, chartBounds.top)} end={vec(0, chartBounds.bottom)} colors={[alpha(accent, 0.34), alpha(accent, 0)]} />
              </Area>
              <Line points={pts.y} color={accent} strokeWidth={3.5} curveType="natural" animate={{ type: 'timing', duration: 500 }} />
              {last?.y != null ? <SkiaCircle cx={last.x} cy={last.y} r={5} color={accent} /> : null}
            </>
          );
        }}
      </CartesianChart>
    </View>
  );
}

export function DashboardScreen({ navigation }: DashboardScreenProps) {
  const theme = useTheme();
  const { showDialog } = useAppDialog();
  const { can } = usePermissions();
  const canCreateInvoice = can(PERMISSION.invoicesCreate);
  const isDark = theme.dark;
  const colors = useMemo(() => appColors(isDark), [isDark]);
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((event) => { scrollY.value = event.contentOffset.y; });
  const heroParallaxStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 190], [1, 0.94], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(scrollY.value, [0, 190], [0, 26], Extrapolation.CLAMP) },
      { scale: interpolate(scrollY.value, [0, 190], [1, 0.975], Extrapolation.CLAMP) }
    ]
  }));
  const query = useQuery({ queryKey: queryKeys.report.all, queryFn: () => reportsApi.summary() });

  useEffect(() => {
    if (query.error) showDialog({ title: 'Could not load dashboard', message: apiErrorMessage(query.error), tone: 'error' });
  }, [query.error, showDialog]);

  const report = query.data;

  const stats: { label: string; value: string | number; hint: string; tone?: 'primary' | 'success' | 'warning' | 'danger'; icon: keyof typeof MaterialCommunityIcons.glyphMap; onPress?: () => void }[] = [
    {
      label: 'TODAY',
      value: formatCurrency(report?.todaySales),
      hint: 'Collected',
      icon: 'credit-card',
      onPress: () => navigation.navigate('InvoicesTab', { screen: 'InvoiceList', params: { status: 'paid', ...todayRange(), sort: 'newest', fromReports: true } })
    },
    {
      label: 'THIS MONTH',
      value: formatCurrency(report?.monthlySales),
      hint: 'Collected',
      icon: 'calendar-month',
      onPress: () => navigation.navigate('InvoicesTab', { screen: 'InvoiceList', params: { status: 'paid', ...monthRange(), sort: 'newest', fromReports: true } })
    },
    {
      label: 'INVOICES',
      value: report?.totalInvoices || 0,
      hint: 'All time',
      icon: 'file-document',
      onPress: () => navigation.navigate('InvoicesTab', { screen: 'InvoiceList' })
    },
    {
      label: 'PENDING',
      value: report?.pendingInvoices || 0,
      hint: 'Need follow-up',
      tone: 'warning',
      icon: 'clock',
      onPress: () => navigation.navigate('InvoicesTab', { screen: 'InvoiceList', params: { status: 'pending' } })
    }
  ];

  const quickActions: { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; onPress: () => void }[] = [
    { label: 'Invoices', icon: 'file-document', onPress: () => navigation.navigate('InvoicesTab', { screen: 'InvoiceList' }) },
    { label: 'Orders', icon: 'clipboard-list-outline', onPress: () => navigation.navigate('InvoicesTab', { screen: 'OrderList' }) },
    { label: 'Products', icon: 'package-variant-closed', onPress: () => navigation.navigate('CatalogTab', { screen: 'Products' }) },
    { label: 'Reports', icon: 'chart-box', onPress: () => navigation.navigate('Reports') }
  ];
  const viewAllRecentActivity = () => {
    navigation.navigate('InvoicesTab', {
      screen: 'InvoiceList',
      params: { ...recentActivityRange(), sort: 'newest', fromReports: true }
    });
  };

  const trendData = useMemo(() => (report?.salesTrend ?? []).slice(-5).map((point) => {
    const date = new Date(point.date);
    const label = Number.isNaN(date.getTime()) ? point.date.slice(5) : `${date.getDate()} ${date.toLocaleString('en-IN', { month: 'short' })}`;
    return { label, value: Number(point.sales || 0) };
  }), [report?.salesTrend]);

  const trendChange = useMemo(() => {
    if (trendData.length < 2) return null;
    const last = trendData[trendData.length - 1].value;
    const prev = trendData[trendData.length - 2].value;
    if (prev === 0) return last === 0 ? 0 : 100;
    return Math.round(((last - prev) / prev) * 100);
  }, [trendData]);

  const recent = report?.recentInvoices ?? [];
  const onboarding = useOnboardingOptional();
  const scrollRef = useRef<ScrollView>(null);

  // The Create Invoice button is at the top of this screen. If the tour targets it
  // while the user is scrolled down, snap to top so the spotlight lands on it.
  const activeTour = onboarding?.activeTour;
  useEffect(() => {
    if (activeTour?.tour.steps[activeTour.stepIndex]?.anchorId === ANCHOR.createInvoice) {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  }, [activeTour]);

  return (
    <>
    <Screen
      title="Dashboard"
      scrollRef={scrollRef}
      contentStyle={styles.screenContent}
      scrollViewProps={{
        scrollEventThrottle: 16,
        onScroll: scrollHandler
      }}
    >
      <Reanimated.View style={[styles.heroCard, { borderColor: alpha('#C3C0FF', 0.3) }, heroParallaxStyle]}>
        <HeroPattern />
        <FloatingHeroBubbles />
        <View style={styles.heroInner}>
          <View style={[styles.heroEyebrowBadge, { borderColor: alpha('#FFFFFF', 0.22), backgroundColor: alpha('#1C1A4A', 0.4) }]}>
            <Text style={styles.heroEyebrow}>BILLJI COMMAND CENTER</Text>
          </View>
          <Text style={styles.heroTitle}>Today billing pulse</Text>
          <Text style={styles.heroBody}>Track invoices, stock, and cash flow without digging through desktop screens.</Text>
          <View style={styles.heroActions}>
            {canCreateInvoice ? (
              <TourAnchor anchorId={ANCHOR.createInvoice}>
                <Button
                  mode="contained"
                  icon={({ size, color }) => <Feather name="plus" size={size} color={color} strokeWidth={3} />}
                  buttonColor="#FFFFFF"
                  textColor="#4338CA"
                  onPress={() => navigation.navigate('InvoicesTab', { screen: 'InvoiceCreate' })}
                  contentStyle={styles.heroButtonContent}
                  labelStyle={styles.heroButtonLabel}
                  style={styles.heroButton}
                >
                  Create Invoice
                </Button>
              </TourAnchor>
            ) : <View />}
            <Pressable
              onPress={() => void query.refetch()}
              style={({ pressed }) => [styles.heroGhostButton, { borderColor: alpha('#C3C0FF', 0.36), backgroundColor: alpha('#1C1A4A', pressed ? 0.55 : 0.36) }]}
            >
              <Feather name="refresh-cw" size={18} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      </Reanimated.View>

      <View style={styles.statRow}>{stats.slice(0, 2).map((item) => <StatCard key={item.label} {...item} />)}</View>
      <View style={styles.statRow}>{stats.slice(2).map((item) => <StatCard key={item.label} {...item} />)}</View>

      <View style={styles.quickRail}>
        {quickActions.map((item) => (
          <Pressable
            key={item.label}
            onPress={item.onPress}
            style={({ pressed }) => [
              styles.quickAction,
              {
                backgroundColor: pressed ? alpha(colors.primary, isDark ? 0.22 : 0.12) : alpha(colors.primary, isDark ? 0.14 : 0.06),
                borderColor: alpha(colors.primary, isDark ? 0.24 : 0.12)
              }
            ]}
          >
            <View style={[styles.quickIconTile, { backgroundColor: isDark ? colors.surfaceBright : colors.card, shadowColor: isDark ? '#000000' : colors.primaryStrong }]}>
              <MaterialCommunityIcons name={item.icon} size={24} color={isDark ? colors.primary : colors.primaryStrong} />
            </View>
            <Text style={[styles.quickLabel, { color: theme.colors.onSurface }]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.06) }]}>
        <View style={styles.chartHeader}>
          <View style={styles.flex1}>
            <Text style={[styles.chartTitle, { color: theme.colors.onSurface }]}>Sales Trend</Text>
            <Text style={[styles.chartSubtitle, { color: theme.colors.onSurfaceVariant }]}>Daily billing analytics</Text>
          </View>
          {trendChange != null ? (
            <View style={[styles.changeChip, { backgroundColor: trendChange >= 0 ? alpha(colors.accent, isDark ? 0.2 : 0.12) : alpha(colors.destructive, isDark ? 0.2 : 0.12) }]}>
              <Feather name={trendChange >= 0 ? 'trending-up' : 'trending-down'} size={13} color={trendChange >= 0 ? colors.accent : colors.destructive} />
              <Text style={[styles.changeText, { color: trendChange >= 0 ? colors.accent : colors.destructive }]}>{trendChange >= 0 ? '+' : ''}{trendChange}%</Text>
            </View>
          ) : null}
        </View>
        <TrendChart
          currency="₹"
          data={trendData}
          accent={isDark ? colors.primary : colors.primaryStrong}
          gridColor={isDark ? alpha(colors.outline, 0.45) : '#E2E1EE'}
          axisLabelColor={theme.colors.onSurfaceVariant}
        />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Recent activity</Text>
        <Pressable onPress={viewAllRecentActivity}>
          <Text style={[styles.viewAll, { color: colors.primary }]}>View all</Text>
        </Pressable>
      </View>
      {recent.length ? recent.slice(0, 5).map((invoice) => {
        const isPaid = invoice.status === 'paid';
        const tileColor = isPaid ? alpha(colors.accent, isDark ? 0.2 : 0.12) : alpha(colors.primary, isDark ? 0.2 : 0.1);
        const iconColor = isPaid ? colors.accent : colors.primary;
        return (
          <Pressable
            key={invoice._id}
            onPress={() => navigation.navigate('InvoicesTab', { screen: 'InvoiceDetail', params: { id: invoice._id } })}
            style={[styles.activityRow, { backgroundColor: colors.card, borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.06) }]}
          >
            <View style={[styles.activityIcon, { backgroundColor: tileColor }]}>
              <MaterialCommunityIcons name={isPaid ? 'credit-card' : 'file-document'} size={16} color={iconColor} />
            </View>
            <View style={styles.flex1}>
              <Text numberOfLines={1} style={[styles.activityTitle, { color: theme.colors.onSurface }]}>
                {isPaid ? 'Payment received' : 'Invoice'} for {invoice.customerSnapshot.name} ({formatCurrency(invoice.total)})
              </Text>
              <Text style={[styles.activityTime, { color: theme.colors.onSurfaceVariant }]}>{activityTime(invoice.createdAt || invoice.date)}</Text>
            </View>
            <Feather name="chevron-right" size={16} color={theme.colors.onSurfaceVariant} />
          </Pressable>
        );
      }) : (
        <EmptyState
          title="No invoices yet"
          message="Create your first invoice to see recent activity here."
          actionLabel={canCreateInvoice ? 'Create Invoice' : undefined}
          onAction={canCreateInvoice ? () => navigation.navigate('InvoicesTab', { screen: 'InvoiceCreate' }) : undefined}
          hint="Tip: add a customer first so the next invoice is faster."
        />
      )}
    </Screen>
    {onboarding ? (
      <>
        <ProgressPill />
        <GettingStartedSheet />
      </>
    ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  activityIcon: { alignItems: 'center', borderRadius: 12, height: 36, justifyContent: 'center', width: 36 },
  activityRow: { alignItems: 'center', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 12, marginBottom: 12, paddingHorizontal: 14, paddingVertical: 12 },
  activityTime: { ...typeScale.caption, fontSize: 11, marginTop: 2 },
  activityTitle: { ...fontStyles.bold, fontSize: 13 },

  changeChip: { alignItems: 'center', borderRadius: radii.pill, flexDirection: 'row', gap: 4, paddingHorizontal: 10, paddingVertical: 3 },
  changeText: { ...fontStyles.bold, fontSize: 12 },
  chartCard: { borderRadius: 22, borderWidth: 1, marginBottom: 18, paddingBottom: 6, paddingHorizontal: 18, paddingTop: 18 },
  chartHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  chartSubtitle: { ...typeScale.caption, fontSize: 11, marginTop: 2 },
  chartTitle: { ...fontStyles.bold, fontSize: 16 },
  flex1: { flex: 1, minWidth: 0 },
  heroActions: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
  heroBody: { color: 'rgba(255,255,255,0.78)', fontSize: 13, lineHeight: 20, marginTop: 6, maxWidth: 320 },
  heroBubbleLarge: { backgroundColor: alpha('#FFFFFF', 0.18), borderColor: alpha('#FFFFFF', 0.34), borderRadius: 78, borderWidth: 1, height: 156, position: 'absolute', right: -44, top: 96, width: 156 },
  heroBubbleMedium: { backgroundColor: alpha('#A5B4FC', 0.16), borderColor: alpha('#FFFFFF', 0.24), borderRadius: 60, borderWidth: 1, bottom: -28, height: 120, left: 30, position: 'absolute', width: 120 },
  heroBubbleSmall: { backgroundColor: alpha('#FFFFFF', 0.14), borderColor: alpha('#FFFFFF', 0.28), borderRadius: 46, borderWidth: 1, height: 92, left: -26, position: 'absolute', top: -18, width: 92 },
  heroBubbleTiny: { backgroundColor: alpha('#FFFFFF', 0.16), borderColor: alpha('#FFFFFF', 0.3), borderRadius: 26, borderWidth: 1, height: 52, position: 'absolute', right: 94, top: 40, width: 52 },
  heroButton: { borderRadius: radii.pill, elevation: 4, shadowColor: '#000000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 10 },
  heroButtonContent: { height: 42, paddingHorizontal: 14 },
  heroButtonLabel: { ...fontStyles.bold, fontSize: 14 },
  heroCard: { borderRadius: 26, borderWidth: 1, marginBottom: 20, overflow: 'hidden' },
  heroEyebrow: { ...fontStyles.bold, color: '#C7D2FE', fontSize: 10, letterSpacing: 1.4 },
  heroEyebrowBadge: { alignSelf: 'flex-start', borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3 },
  heroGhostButton: { alignItems: 'center', borderRadius: radii.pill, borderWidth: 1, height: 38, justifyContent: 'center', width: 38 },
  heroInner: { padding: 22 },
  heroTitle: { ...fontStyles.bold, color: '#FFFFFF', fontSize: 22, letterSpacing: -0.6, lineHeight: 30, marginTop: 10 },
  quickAction: { alignItems: 'center', borderRadius: 18, borderWidth: 1, flex: 1, gap: 8, paddingHorizontal: 6, paddingVertical: 14 },
  quickIconTile: { alignItems: 'center', borderRadius: 12, elevation: 3, height: 44, justifyContent: 'center', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, width: 44 },
  quickLabel: { ...fontStyles.bold, fontSize: 12 },
  quickRail: { flexDirection: 'row', gap: 10, marginBottom: 20, marginTop: 10 },
  screenContent: { paddingTop: 8 },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, marginTop: 4 },
  sectionTitle: { ...fontStyles.bold, fontSize: 16 },
  statRow: { flexDirection: 'row', marginBottom: 2, marginHorizontal: -6 },
  viewAll: { ...fontStyles.bold, fontSize: 12 }
});
