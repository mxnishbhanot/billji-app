import { useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Text, useTheme } from 'react-native-paper';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { reportsApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { useAppDialog } from '@/components/AppDialog';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { StatCard } from '@/components/StatCard';
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
      <G opacity="0.18">
        {Array.from({ length: 14 }).map((_, row) =>
          Array.from({ length: 22 }).map((__, col) => (
            <Circle key={`${row}-${col}`} cx={col * 18 + 9} cy={row * 18 + 9} r={1} fill="#FFFFFF" />
          ))
        )}
      </G>
      <Circle cx={342} cy={220} r={86} fill="#6366F1" opacity={0.22} />
      <Circle cx={-12} cy={-12} r={70} fill="#F472B6" opacity={0.08} />
    </Svg>
  );
}

type TrendChartProps = {
  currency: string;
  data: { label: string; value: number }[];
  accent: string;
  gridColor: string;
  baselineColor: string;
  axisLabelColor: string;
  dotFill: string;
};

function TrendChart({ currency, data, accent, gridColor, baselineColor, axisLabelColor, dotFill }: TrendChartProps) {
  const [width, setWidth] = useState(0);
  const chartHeight = 144;
  const padding = 6;

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (next && next !== width) setWidth(next);
  };

  const points = data.length ? data : [{ label: '-', value: 0 }];
  const maxValue = Math.max(...points.map((p) => p.value), 100);
  const stepX = points.length > 1 && width ? (width - padding * 2) / (points.length - 1) : 0;
  const coords = points.map((point, index) => ({
    x: padding + index * stepX,
    y: chartHeight - padding - (point.value / maxValue) * (chartHeight - padding * 2)
  }));

  const pathParts: string[] = [];
  coords.forEach((coord, index) => {
    if (index === 0) {
      pathParts.push(`M ${coord.x} ${coord.y}`);
      return;
    }
    const prev = coords[index - 1];
    const midX = (prev.x + coord.x) / 2;
    pathParts.push(`C ${midX} ${prev.y}, ${midX} ${coord.y}, ${coord.x} ${coord.y}`);
  });
  const linePath = pathParts.join(' ');
  const lastCoord = coords[coords.length - 1] ?? { x: 0, y: chartHeight };
  const firstCoord = coords[0] ?? { x: 0, y: chartHeight };
  const areaPath = `${linePath} L ${lastCoord.x} ${chartHeight} L ${firstCoord.x} ${chartHeight} Z`;

  return (
    <View style={chartStyles.container} onLayout={onLayout}>
      {width ? (
        <Svg width={width} height={chartHeight}>
          <Defs>
            <LinearGradient id="splineFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={accent} stopOpacity={0.32} />
              <Stop offset="1" stopColor={accent} stopOpacity={0} />
            </LinearGradient>
            <LinearGradient id="splineStroke" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={accent} />
              <Stop offset="0.5" stopColor="#6366F1" />
              <Stop offset="1" stopColor={accent} />
            </LinearGradient>
          </Defs>
          <Path d={`M 0 ${padding} L ${width} ${padding}`} stroke={gridColor} strokeDasharray="4 6" strokeWidth={1} />
          <Path d={`M 0 ${chartHeight / 2} L ${width} ${chartHeight / 2}`} stroke={gridColor} strokeDasharray="4 6" strokeWidth={1} />
          <Path d={`M 0 ${chartHeight - padding} L ${width} ${chartHeight - padding}`} stroke={baselineColor} strokeWidth={1} />
          <Path d={areaPath} fill="url(#splineFill)" />
          <Path d={linePath} stroke="url(#splineStroke)" strokeWidth={3.5} strokeLinecap="round" fill="none" />
          {coords.map((coord, index) => {
            const isLast = index === coords.length - 1;
            return (
              <Circle
                key={`${coord.x}-${coord.y}-${index}`}
                cx={coord.x}
                cy={coord.y}
                r={isLast ? 5 : 4}
                fill={isLast ? accent : dotFill}
                stroke={isLast ? dotFill : accent}
                strokeWidth={isLast ? 2 : 2.5}
              />
            );
          })}
        </Svg>
      ) : (
        <View style={{ height: chartHeight }} />
      )}
      <View style={chartStyles.xAxis}>
        {points.map((point, index) => (
          <Text key={`${point.label}-${index}`} style={[chartStyles.axisLabel, { color: axisLabelColor }]}>{point.label}</Text>
        ))}
      </View>
      <View style={chartStyles.yAxis} pointerEvents="none">
        <Text style={[chartStyles.axisLabel, { color: axisLabelColor }]}>{currency}{maxValue >= 1000 ? `${Math.round(maxValue / 100) / 10}k` : Math.round(maxValue)}</Text>
        <Text style={[chartStyles.axisLabel, { color: axisLabelColor }]}>{currency}{Math.round(maxValue / 2)}</Text>
        <Text style={[chartStyles.axisLabel, { color: axisLabelColor }]}>0</Text>
      </View>
    </View>
  );
}

export function DashboardScreen({ navigation }: any) {
  const theme = useTheme();
  const { showDialog } = useAppDialog();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const query = useQuery({ queryKey: ['report'], queryFn: reportsApi.summary });

  useEffect(() => {
    if (query.error) showDialog({ title: 'Could not load dashboard', message: apiErrorMessage(query.error), tone: 'error' });
  }, [query.error, showDialog]);

  const report = query.data;

  const stats: { label: string; value: string | number; hint: string; tone?: 'primary' | 'success' | 'warning' | 'danger'; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
    { label: 'TODAY', value: formatCurrency(report?.todaySales), hint: 'Paid sales', icon: 'credit-card' },
    { label: 'THIS MONTH', value: formatCurrency(report?.monthlySales), hint: 'Paid sales', icon: 'calendar-month' },
    { label: 'INVOICES', value: report?.totalInvoices || 0, hint: 'All time', icon: 'file-document' },
    { label: 'PENDING', value: report?.pendingInvoices || 0, hint: 'Need follow-up', tone: 'warning', icon: 'clock' }
  ];

  const quickActions: { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; onPress: () => void }[] = [
    { label: 'Invoices', icon: 'file-document', onPress: () => navigation.navigate('InvoicesTab', { screen: 'InvoiceList' }) },
    { label: 'Products', icon: 'package-variant-closed', onPress: () => navigation.navigate('CatalogTab', { screen: 'Products' }) },
    { label: 'Reports', icon: 'chart-box', onPress: () => navigation.navigate('Reports') }
  ];

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

  return (
    <Screen title="Dashboard" contentStyle={styles.screenContent}>
      <View style={[styles.heroCard, { borderColor: alpha('#C3C0FF', 0.3) }]}>
        <HeroPattern />
        <View style={styles.heroInner}>
          <View style={[styles.heroEyebrowBadge, { borderColor: alpha('#FFFFFF', 0.22), backgroundColor: alpha('#1C1A4A', 0.4) }]}>
            <Text style={styles.heroEyebrow}>BILLJI COMMAND CENTER</Text>
          </View>
          <Text style={styles.heroTitle}>Today billing pulse</Text>
          <Text style={styles.heroBody}>Track invoices, stock, and cash flow without digging through desktop screens.</Text>
          <View style={styles.heroActions}>
            <Button
              mode="contained"
              icon={({ size, color }) => <Feather name="plus" size={size} color={color} strokeWidth={3} />}
              buttonColor="#FFFFFF"
              textColor={colors.primaryStrong}
              onPress={() => navigation.navigate('InvoicesTab', { screen: 'InvoiceCreate' })}
              contentStyle={styles.heroButtonContent}
              labelStyle={styles.heroButtonLabel}
              style={styles.heroButton}
            >
              Create Invoice
            </Button>
            <Pressable
              onPress={() => void query.refetch()}
              style={({ pressed }) => [styles.heroGhostButton, { borderColor: alpha('#C3C0FF', 0.36), backgroundColor: alpha('#1C1A4A', pressed ? 0.55 : 0.36) }]}
            >
              <Feather name="refresh-cw" size={18} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      </View>

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
          baselineColor={isDark ? colors.border : '#D9DADE'}
          axisLabelColor={theme.colors.onSurfaceVariant}
          dotFill={colors.card}
        />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Recent activity</Text>
        <Pressable onPress={() => navigation.navigate('InvoicesTab', { screen: 'InvoiceList' })}>
          <Text style={[styles.viewAll, { color: colors.primary }]}>View all</Text>
        </Pressable>
      </View>
      {recent.length ? recent.slice(0, 3).map((invoice) => {
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
        <EmptyState title="No invoices yet" message="Create your first invoice to see recent activity here." />
      )}
    </Screen>
  );
}

const chartStyles = StyleSheet.create({
  axisLabel: { ...fontStyles.medium, fontSize: 10 },
  container: { paddingLeft: 28, width: '100%' },
  xAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingHorizontal: 4 },
  yAxis: { bottom: 22, height: 144, justifyContent: 'space-between', left: 0, position: 'absolute', top: 0 }
});

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
  heroButton: { borderRadius: radii.pill, elevation: 4, shadowColor: '#000000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 10 },
  heroButtonContent: { height: 42, paddingHorizontal: 14 },
  heroButtonLabel: { ...fontStyles.bold, fontSize: 14 },
  heroCard: { borderRadius: 26, borderWidth: 1, marginBottom: 20, overflow: 'hidden' },
  heroEyebrow: { ...fontStyles.bold, color: '#C7D2FE', fontSize: 10, letterSpacing: 1.4 },
  heroEyebrowBadge: { alignSelf: 'flex-start', borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3 },
  heroGhostButton: { alignItems: 'center', borderRadius: radii.pill, borderWidth: 1, height: 38, justifyContent: 'center', width: 38 },
  heroInner: { padding: 22 },
  heroTitle: { ...fontStyles.bold, color: '#FFFFFF', fontSize: 22, letterSpacing: -0.6, lineHeight: 28, marginTop: 10 },
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
