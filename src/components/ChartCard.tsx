import { Dimensions, StyleSheet, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { Text, useTheme } from 'react-native-paper';
import { alpha, appColors, radii, spacing, typeScale } from '@/theme/theme';
import { AppCard } from './AppCard';

type Props = { title?: string; data: { date: string; sales: number }[]; compact?: boolean };

const dayLabel = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(5) || '-';
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short' }).format(date);
};

export function ChartCard({ title, data, compact = false }: Props) {
  const theme = useTheme();
  const colors = appColors(theme.dark);
  const chartData = data.length ? data : [{ date: '-', sales: 0 }];
  const width = Math.min(Dimensions.get('window').width - 56, 520);
  return (
    <AppCard style={compact ? styles.compactCard : undefined}>
      {title ? (
        <View style={styles.header}>
          <Text variant="titleMedium" style={styles.title}>{title}</Text>
        </View>
      ) : null}
      <LineChart
        data={{ labels: chartData.map((item) => compact ? dayLabel(item.date) : item.date.slice(5)), datasets: [{ data: chartData.map((item) => Number(item.sales || 0)) }] }}
        width={width}
        height={compact ? 150 : 190}
        bezier
        yAxisLabel={compact ? '' : '₹'}
        fromZero
        withDots={!compact}
        withHorizontalLabels={!compact}
        withVerticalLines={false}
        chartConfig={{
          backgroundGradientFrom: colors.card,
          backgroundGradientTo: theme.dark ? colors.surface : colors.card,
          decimalPlaces: 0,
          color: (opacity = 1) => alpha(theme.colors.primary, opacity),
          labelColor: () => theme.colors.onSurfaceVariant,
          fillShadowGradient: theme.colors.primary,
          fillShadowGradientOpacity: theme.dark ? 0.2 : 0.16,
          propsForDots: { r: '4', strokeWidth: '2', stroke: colors.card },
          propsForBackgroundLines: { strokeDasharray: '4 6', stroke: theme.dark ? alpha(colors.border, 0.62) : theme.colors.outlineVariant }
        }}
        style={compact ? { ...styles.chart, ...styles.compactChart } : styles.chart}
        formatYLabel={(value) => Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
      />
    </AppCard>
  );
}

const styles = StyleSheet.create({
  chart: { borderRadius: radii.card, marginLeft: -spacing.cardPadding },
  compactCard: { marginBottom: 16 },
  compactChart: { marginBottom: -10, marginTop: -4 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  title: { ...typeScale.sectionTitle, fontSize: 18, lineHeight: 24 }
});
