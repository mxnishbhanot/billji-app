import { useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Text, useTheme } from 'react-native-paper';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import { AppCard } from './AppCard';

type Props = { title?: string; data: { date: string; sales: number }[]; compact?: boolean };

const chartLabel = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(5) || '-';
  return `${date.getDate()} ${date.toLocaleString('en-IN', { month: 'short' })}`;
};

export function ChartCard({ title, data, compact = false }: Props) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(theme.dark);
  const [width, setWidth] = useState(0);
  const chartHeight = compact ? 132 : 144;
  const padding = 6;
  const chartData = useMemo(() => (data.length ? data : [{ date: '-', sales: 0 }]).slice(-5).map((point) => ({
    label: chartLabel(point.date),
    value: Number(point.sales || 0)
  })), [data]);
  const maxValue = Math.max(...chartData.map((point) => point.value), 100);
  const stepX = chartData.length > 1 && width ? (width - padding * 2) / (chartData.length - 1) : 0;
  const coords = chartData.map((point, index) => ({
    x: padding + index * stepX,
    y: chartHeight - padding - (point.value / maxValue) * (chartHeight - padding * 2)
  }));
  const linePath = coords.map((coord, index) => {
    if (index === 0) return `M ${coord.x} ${coord.y}`;
    const prev = coords[index - 1];
    const midX = (prev.x + coord.x) / 2;
    return `C ${midX} ${prev.y}, ${midX} ${coord.y}, ${coord.x} ${coord.y}`;
  }).join(' ');
  const lastCoord = coords[coords.length - 1] ?? { x: 0, y: chartHeight };
  const firstCoord = coords[0] ?? { x: 0, y: chartHeight };
  const areaPath = `${linePath} L ${lastCoord.x} ${chartHeight} L ${firstCoord.x} ${chartHeight} Z`;
  const trendChange = useMemo(() => {
    if (chartData.length < 2) return null;
    const last = chartData[chartData.length - 1].value;
    const prev = chartData[chartData.length - 2].value;
    if (prev === 0) return last === 0 ? 0 : 100;
    return Math.round(((last - prev) / prev) * 100);
  }, [chartData]);
  const accent = isDark ? colors.primary : colors.primaryStrong;
  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (next && next !== width) setWidth(next);
  };

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
      <View style={styles.chartShell} onLayout={onLayout}>
        {width ? (
          <Svg width={width} height={chartHeight}>
            <Defs>
              <LinearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={accent} stopOpacity={0.32} />
                <Stop offset="1" stopColor={accent} stopOpacity={0} />
              </LinearGradient>
              <LinearGradient id="chartStroke" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={accent} />
                <Stop offset="0.5" stopColor="#6366F1" />
                <Stop offset="1" stopColor={accent} />
              </LinearGradient>
            </Defs>
            <Path d={`M 0 ${padding} L ${width} ${padding}`} stroke={isDark ? alpha(colors.outline, 0.45) : '#E2E1EE'} strokeDasharray="4 6" strokeWidth={1} />
            <Path d={`M 0 ${chartHeight / 2} L ${width} ${chartHeight / 2}`} stroke={isDark ? alpha(colors.outline, 0.45) : '#E2E1EE'} strokeDasharray="4 6" strokeWidth={1} />
            <Path d={`M 0 ${chartHeight - padding} L ${width} ${chartHeight - padding}`} stroke={isDark ? colors.border : '#D9DADE'} strokeWidth={1} />
            <Path d={areaPath} fill="url(#chartFill)" />
            <Path d={linePath} stroke="url(#chartStroke)" strokeWidth={3.5} strokeLinecap="round" fill="none" />
            {coords.map((coord, index) => {
              const isLast = index === coords.length - 1;
              return (
                <Circle
                  key={`${coord.x}-${coord.y}-${index}`}
                  cx={coord.x}
                  cy={coord.y}
                  r={isLast ? 5 : 4}
                  fill={isLast ? accent : colors.card}
                  stroke={isLast ? colors.card : accent}
                  strokeWidth={isLast ? 2 : 2.5}
                />
              );
            })}
          </Svg>
        ) : (
          <View style={{ height: chartHeight }} />
        )}
        <View style={styles.xAxis}>
          {chartData.map((point, index) => (
            <Text key={`${point.label}-${index}`} style={[styles.axisLabel, { color: theme.colors.onSurfaceVariant }]}>{point.label}</Text>
          ))}
        </View>
        <View style={[styles.yAxis, { height: chartHeight }]} pointerEvents="none">
          <Text style={[styles.axisLabel, { color: theme.colors.onSurfaceVariant }]}>₹{maxValue >= 1000 ? `${Math.round(maxValue / 100) / 10}k` : Math.round(maxValue)}</Text>
          <Text style={[styles.axisLabel, { color: theme.colors.onSurfaceVariant }]}>₹{Math.round(maxValue / 2)}</Text>
          <Text style={[styles.axisLabel, { color: theme.colors.onSurfaceVariant }]}>0</Text>
        </View>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  axisLabel: { ...fontStyles.medium, fontSize: 10 },
  changeChip: { alignItems: 'center', borderRadius: radii.pill, flexDirection: 'row', gap: 4, paddingHorizontal: 10, paddingVertical: 3 },
  changeText: { ...fontStyles.bold, fontSize: 12 },
  chartShell: { paddingLeft: 28, width: '100%' },
  compactCard: { marginBottom: 16 },
  flex1: { flex: 1, minWidth: 0 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  subtitle: { ...typeScale.caption, fontSize: 11, marginTop: 2 },
  title: { ...fontStyles.bold, fontSize: 16 },
  xAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingHorizontal: 4 },
  yAxis: { bottom: 22, justifyContent: 'space-between', left: 0, position: 'absolute', top: 0 }
});
