import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Text, useTheme } from 'react-native-paper';
import { CartesianChart, Line, Area } from 'victory-native';
import { useFont, LinearGradient as SkiaLinearGradient, vec, Circle as SkiaCircle } from '@shopify/react-native-skia';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import { AppCard } from './AppCard';

type Props = { title?: string; data: { date: string; sales: number }[]; compact?: boolean };

const CHART_FONT = require('@expo-google-fonts/plus-jakarta-sans/500Medium/PlusJakartaSans_500Medium.ttf');

const chartLabel = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(5) || '-';
  return `${date.getDate()} ${date.toLocaleString('en-IN', { month: 'short' })}`;
};

export function ChartCard({ title, data, compact = false }: Props) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(theme.dark);
  const font = useFont(CHART_FONT, 10);
  const chartHeight = compact ? 132 : 144;
  const chartData = useMemo(() => (data.length ? data : [{ date: '-', sales: 0 }]).slice(-5).map((point, index) => ({
    x: index,
    y: Number(point.sales || 0),
    label: chartLabel(point.date)
  })), [data]);
  const trendChange = useMemo(() => {
    if (chartData.length < 2) return null;
    const last = chartData[chartData.length - 1].y;
    const prev = chartData[chartData.length - 2].y;
    if (prev === 0) return last === 0 ? 0 : 100;
    return Math.round(((last - prev) / prev) * 100);
  }, [chartData]);
  const accent = isDark ? colors.primary : colors.primaryStrong;
  const gridColor = isDark ? alpha(colors.outline, 0.45) : '#E2E1EE';
  const axisLabelColor = theme.colors.onSurfaceVariant;

  return (
    <AppCard style={compact ? styles.compactCard : undefined}>
      {title ? (
        <View style={styles.header}>
          <View style={styles.flex1}>
            <Text variant="titleMedium" style={[styles.title, { color: theme.colors.onSurface }]}>{title}</Text>
            <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>Daily billing analytics</Text>
          </View>
          {trendChange != null ? (
            <View style={[styles.changeChip, { backgroundColor: trendChange >= 0 ? alpha(colors.accent, isDark ? 0.2 : 0.12) : alpha(colors.destructive, isDark ? 0.2 : 0.12) }]}>
              <Feather name={trendChange >= 0 ? 'trending-up' : 'trending-down'} size={13} color={trendChange >= 0 ? colors.accent : colors.destructive} />
              <Text style={[styles.changeText, { color: trendChange >= 0 ? colors.accent : colors.destructive }]}>{trendChange >= 0 ? '+' : ''}{trendChange}%</Text>
            </View>
          ) : null}
        </View>
      ) : null}
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
            tickCount: { x: chartData.length, y: 3 },
            formatXLabel: (value) => chartData[value]?.label ?? '',
            formatYLabel: (value) => (value >= 1000 ? `₹${Math.round(value / 100) / 10}k` : `₹${Math.round(value)}`)
          }}
        >
          {({ points, chartBounds }) => {
            const last = points.y[points.y.length - 1];
            return (
              <>
                <Area points={points.y} y0={chartBounds.bottom} curveType="natural" animate={{ type: 'timing', duration: 500 }}>
                  <SkiaLinearGradient start={vec(0, chartBounds.top)} end={vec(0, chartBounds.bottom)} colors={[alpha(accent, 0.34), alpha(accent, 0)]} />
                </Area>
                <Line points={points.y} color={accent} strokeWidth={3.5} curveType="natural" animate={{ type: 'timing', duration: 500 }} />
                {last?.y != null ? <SkiaCircle cx={last.x} cy={last.y} r={5} color={accent} /> : null}
              </>
            );
          }}
        </CartesianChart>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  changeChip: { alignItems: 'center', borderRadius: radii.pill, flexDirection: 'row', gap: 4, paddingHorizontal: 10, paddingVertical: 3 },
  changeText: { ...fontStyles.bold, fontSize: 12 },
  compactCard: { marginBottom: 16 },
  flex1: { flex: 1, minWidth: 0 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  subtitle: { ...typeScale.caption, fontSize: 11, marginTop: 2 },
  title: { ...fontStyles.bold, fontSize: 16 }
});
