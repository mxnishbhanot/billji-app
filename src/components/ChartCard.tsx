import { Dimensions, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { Text, useTheme } from 'react-native-paper';
import { AppCard } from './AppCard';

type Props = { title: string; data: { date: string; sales: number }[] };
const withOpacity = (hex: string, opacity: number) => {
  const normalized = hex.replace('#', '');
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
};

export function ChartCard({ title, data }: Props) {
  const theme = useTheme();
  const chartData = data.length ? data : [{ date: '-', sales: 0 }];
  const width = Math.min(Dimensions.get('window').width - 56, 520);
  return (
    <AppCard>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <Text variant="titleMedium" style={{ fontWeight: '900' }}>{title}</Text>
        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>7 days</Text>
      </View>
      <LineChart
        data={{ labels: chartData.map((item) => item.date.slice(5)), datasets: [{ data: chartData.map((item) => Number(item.sales || 0)) }] }}
        width={width}
        height={210}
        bezier
        yAxisLabel="₹"
        fromZero
        chartConfig={{
          backgroundGradientFrom: theme.colors.elevation.level1,
          backgroundGradientTo: theme.colors.surfaceVariant,
          decimalPlaces: 0,
          color: (opacity = 1) => withOpacity(theme.colors.primary, opacity),
          labelColor: () => theme.colors.onSurfaceVariant,
          propsForDots: { r: '4', strokeWidth: '2', stroke: theme.colors.elevation.level1 },
          propsForBackgroundLines: { strokeDasharray: '4 6', stroke: theme.colors.outlineVariant }
        }}
        style={{ borderRadius: 22, marginLeft: -16 }}
        formatYLabel={(value) => Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
      />
    </AppCard>
  );
}
