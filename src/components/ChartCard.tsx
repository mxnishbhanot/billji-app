import { ReactNode, useId, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Text, useTheme } from 'react-native-paper';
import { runOnJS, useAnimatedReaction } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Path, Stop } from 'react-native-svg';
import { CartesianChart, Line, Area, useChartPressState } from 'victory-native';
import { useFont, LinearGradient as SkiaLinearGradient, vec, Circle as SkiaCircle } from '@shopify/react-native-skia';
import { alpha, appColors, fontStyles, iconSizes, radii, shadow, spacing, typeScale } from '@/theme/theme';
import { formatCurrency } from '@/utils/format';
import { AppCard } from './AppCard';

type Props = {
  title?: string;
  data: { date: string; sales: number }[];
  compact?: boolean;
  /** Overrides the default "Daily billing analytics" caption. */
  subtitle?: string;
  /** Renders a legend row under the chart naming the plotted series. */
  legendLabel?: string;
  /** Off when the surrounding screen already shows the same trend figure (dashboard hero). */
  showTrendChip?: boolean;
  /** Right-hand slot in the header — a range segmented control, for example. */
  headerAccessory?: ReactNode;
  /** How many trailing points to plot. Defaults to the last 5 days. */
  maxPoints?: number;
};

const CHART_FONT = require('@expo-google-fonts/plus-jakarta-sans/500Medium/PlusJakartaSans_500Medium.ttf');

const chartLabel = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(5) || '-';
  return `${date.getDate()} ${date.toLocaleString('en-IN', { month: 'short' })}`;
};

export function ChartCard({ title, data, compact = false, subtitle, legendLabel, showTrendChip = true, headerAccessory, maxPoints = 5 }: Props) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(theme.dark);
  const font = useFont(CHART_FONT, 10);
  const emptyGradientId = `chartEmpty${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const chartHeight = compact ? 132 : 168;
  const chartData = useMemo(() => (data.length ? data : [{ date: '-', sales: 0 }]).slice(-maxPoints).map((point, index) => ({
    x: index,
    y: Number(point.sales || 0),
    label: chartLabel(point.date)
  })), [data, maxPoints]);

  // Scrub-to-read: dragging across the chart swaps the subtitle for that day's figure. The shared
  // values drive the marker on the UI thread; only a change of *index* crosses into React.
  const { state: pressState } = useChartPressState({ x: 0, y: { y: 0 } });
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  useAnimatedReaction(
    () => (pressState.isActive.value ? pressState.matchedIndex.value : -1),
    (current, previous) => {
      if (current !== previous) runOnJS(setActiveIndex)(current >= 0 ? current : null);
    }
  );
  const activePoint = activeIndex != null ? chartData[activeIndex] : undefined;
  const trendChange = useMemo(() => {
    if (chartData.length < 2) return null;
    const last = chartData[chartData.length - 1].y;
    const prev = chartData[chartData.length - 2].y;
    if (prev === 0) return last === 0 ? 0 : 100;
    return Math.round(((last - prev) / prev) * 100);
  }, [chartData]);
  const accent = isDark ? colors.primary : colors.primaryStrong;
  // Grid recedes behind the data instead of competing with it.
  const gridColor = alpha(colors.border, isDark ? 0.34 : 0.5);
  const axisLabelColor = alpha(theme.colors.onSurfaceVariant, 0.85);
  // A single point, or a range where nothing was collected, is "no data yet" — not a flat line
  // stretched across an empty box, which reads as a broken chart.
  const hasPlottableData = chartData.length >= 2 && chartData.some((point) => point.y > 0);

  return (
    <AppCard style={[compact ? styles.compactCard : null, shadow(isDark, 'md')]}>
      {title ? (
        <View style={styles.header}>
          <View style={styles.flex1}>
            <Text variant="titleMedium" style={[styles.title, { color: theme.colors.onSurface }]}>{title}</Text>
            {activePoint ? (
              <View style={[styles.readoutChip, { backgroundColor: alpha(accent, isDark ? 0.22 : 0.12) }]}>
                <Text numberOfLines={1} style={[styles.readout, { color: accent }]}>
                  {activePoint.label} · {formatCurrency(activePoint.y)}
                </Text>
              </View>
            ) : (
              <Text numberOfLines={1} style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>{subtitle ?? 'Daily billing analytics'}</Text>
            )}
          </View>
          {headerAccessory}
          {showTrendChip && trendChange != null ? (
            <View
              style={[
                styles.changeChip,
                {
                  backgroundColor: trendChange >= 0 ? alpha(colors.accent, isDark ? 0.2 : 0.12) : alpha(colors.destructive, isDark ? 0.2 : 0.12),
                  borderColor: alpha(trendChange >= 0 ? colors.accent : colors.destructive, isDark ? 0.3 : 0.22)
                }
              ]}
            >
              <Feather name={trendChange >= 0 ? 'trending-up' : 'trending-down'} size={iconSizes.xs} color={trendChange >= 0 ? colors.accent : colors.destructive} />
              <Text style={[styles.changeText, { color: trendChange >= 0 ? colors.accent : colors.destructive }]}>{trendChange >= 0 ? '+' : ''}{trendChange}%</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {!hasPlottableData ? (
        <View style={[styles.emptyChart, { height: chartHeight, borderColor: alpha(colors.border, isDark ? 0.5 : 0.7) }]}>
          {/* A calm placeholder curve at low opacity: shows what will appear here, promises nothing. */}
          <Svg width="100%" height={chartHeight * 0.62} viewBox="0 0 240 80" preserveAspectRatio="none">
            <Defs>
              <SvgLinearGradient id={emptyGradientId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={accent} stopOpacity={isDark ? 0.16 : 0.12} />
                <Stop offset="1" stopColor={accent} stopOpacity="0" />
              </SvgLinearGradient>
            </Defs>
            <Path d="M 0 62 C 40 46, 68 66, 104 44 S 176 20, 240 34 L 240 80 L 0 80 Z" fill={`url(#${emptyGradientId})`} />
            <Path
              d="M 0 62 C 40 46, 68 66, 104 44 S 176 20, 240 34"
              fill="none"
              stroke={alpha(accent, isDark ? 0.4 : 0.34)}
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray="5 6"
            />
          </Svg>
          <Text style={[styles.emptyChartTitle, { color: theme.colors.onSurface }]}>No collections in this range yet</Text>
          <Text style={[styles.emptyChartHint, { color: theme.colors.onSurfaceVariant }]}>Your trend line appears once payments land.</Text>
        </View>
      ) : (
      <View style={{ height: chartHeight }}>
        <CartesianChart
          data={chartData}
          xKey="x"
          yKeys={['y']}
          chartPressState={pressState}
          domainPadding={{ left: 16, right: 16, top: 24, bottom: 8 }}
          axisOptions={{
            font,
            lineColor: gridColor,
            labelColor: axisLabelColor,
            // Dense ranges get fewer x ticks so the axis never turns into a smear.
            tickCount: { x: Math.min(chartData.length, 6), y: 3 },
            formatXLabel: (value) => chartData[value]?.label ?? '',
            formatYLabel: (value) => (value >= 1000 ? `₹${Math.round(value / 100) / 10}k` : `₹${Math.round(value)}`)
          }}
        >
          {({ points, chartBounds }) => {
            const last = points.y[points.y.length - 1];
            return (
              <>
                <Area points={points.y} y0={chartBounds.bottom} curveType="natural" animate={{ type: 'timing', duration: 500 }}>
                  {/* Three stops: a denser shoulder under the line, fading well before the axis. */}
                  <SkiaLinearGradient
                    start={vec(0, chartBounds.top)}
                    end={vec(0, chartBounds.bottom)}
                    colors={[alpha(accent, 0.32), alpha(accent, 0.1), alpha(accent, 0)]}
                    positions={[0, 0.55, 1]}
                  />
                </Area>
                <Line points={points.y} color={accent} strokeWidth={3} curveType="natural" animate={{ type: 'timing', duration: 500 }} />
                {last?.y != null ? (
                  <>
                    {/* Halo + dot on the latest point: the eye lands on "now" first. */}
                    <SkiaCircle cx={last.x} cy={last.y} r={9} color={alpha(accent, 0.22)} />
                    <SkiaCircle cx={last.x} cy={last.y} r={5} color={accent} />
                  </>
                ) : null}
                {activePoint ? (
                  <SkiaCircle cx={pressState.x.position} cy={pressState.y.y.position} r={6} color={accent} />
                ) : null}
              </>
            );
          }}
        </CartesianChart>
      </View>
      )}
      {legendLabel && hasPlottableData ? (
        <View style={styles.legend}>
          <View style={[styles.legendDot, { backgroundColor: accent }]} />
          <Text style={[styles.legendText, { color: theme.colors.onSurfaceVariant }]}>{legendLabel}</Text>
        </View>
      ) : null}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  changeChip: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.base,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: spacing.base
  },
  changeText: { ...fontStyles.bold, fontSize: 12 },
  compactCard: { marginBottom: spacing.md },
  emptyChart: {
    alignItems: 'center',
    borderRadius: radii.lg,
    borderStyle: 'dashed',
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    overflow: 'hidden'
  },
  emptyChartHint: { ...typeScale.smallCaption, marginTop: 2, textAlign: 'center' },
  emptyChartTitle: { ...fontStyles.semiBold, fontSize: 13, marginTop: spacing.xs, textAlign: 'center' },
  flex1: { flex: 1, minWidth: 0 },
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between', marginBottom: spacing.sm },
  legend: { alignItems: 'center', flexDirection: 'row', gap: spacing.base + 2, marginTop: spacing.xs },
  legendDot: { borderRadius: radii.pill, height: 8, width: 8 },
  legendText: { ...typeScale.caption },
  readout: { ...fontStyles.bold, fontSize: 11.5 },
  readoutChip: { alignSelf: 'flex-start', borderRadius: radii.pill, marginTop: 3, paddingHorizontal: spacing.xs, paddingVertical: 2 },
  subtitle: { ...typeScale.caption, marginTop: 2 },
  title: { ...typeScale.sectionTitle, ...fontStyles.bold }
});
