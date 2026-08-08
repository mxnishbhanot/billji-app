import { memo, useMemo, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { useTheme } from 'react-native-paper';
import { motion, shadows } from '@/design-system';
import { alpha, appColors, fontStyles, spacing, typeScale } from '@/theme/theme';
import { formatCurrency } from '@/utils/format';

export type TrendPoint = { label: string; value: number; date?: string };

type RangeKey = '7D' | '30D' | '90D';

type Props = {
  data: TrendPoint[];
};

const RANGES: RangeKey[] = ['7D', '30D', '90D'];

const sliceForRange = (data: TrendPoint[], range: RangeKey) => {
  const count = range === '7D' ? 7 : range === '30D' ? 30 : 90;
  if (!data.length) return [{ label: '-', value: 0 }];
  return data.slice(-count);
};

export const SalesTrendCard = memo(function SalesTrendCard({ data }: Props) {
  const theme = useTheme();
  const colors = appColors(theme.dark);
  const [range, setRange] = useState<RangeKey>('7D');
  const chartWidth = Dimensions.get('window').width - spacing.screenPadding * 2 - 32 - 6;

  const points = useMemo(() => sliceForRange(data, range), [data, range]);
  const chartData = useMemo(
    () => points.map((point) => ({ value: point.value, label: point.label })),
    [points]
  );
  // An all-zero series collapses the y-range and the chart renders as a bare axis,
  // so give it a nominal ceiling to draw a proper flat baseline against.
  const maxValue = useMemo(
    () => (points.some((point) => point.value > 0) ? undefined : 100),
    [points]
  );

  return (
    <View
      style={[
        styles.card,
        shadows.card,
        {
          backgroundColor: colors.card,
          borderColor: theme.dark ? colors.border : alpha(colors.primaryStrong, 0.06)
        }
      ]}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: theme.colors.onSurface }]}>Sales trend</Text>
          <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>Your collections over time</Text>
        </View>
        <View style={[styles.segment, { backgroundColor: theme.dark ? colors.surfaceContainer : colors.surfaceContainerLow }]}>
          {RANGES.map((item) => {
            const active = item === range;
            return (
              <Pressable
                key={item}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setRange(item)}
                style={[
                  styles.segmentItem,
                  active
                    ? { backgroundColor: alpha(colors.primaryStrong, theme.dark ? 0.3 : 0.14) }
                    : null
                ]}
              >
                <Text
                  style={[
                    styles.segmentLabel,
                    { color: active ? colors.primaryStrong : theme.colors.onSurfaceVariant }
                  ]}
                >
                  {item}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.chartWrap}>
        <LineChart
          data={chartData}
          height={150}
          width={chartWidth}
          maxValue={maxValue}
          animationDuration={motion.chart}
          color={colors.primaryStrong}
          thickness={2.5}
          strokeDashArray={[7, 6]}
          hideDataPoints={chartData.length > 14}
          dataPointsColor={colors.primaryStrong}
          dataPointsRadius={4}
          hideRules
          showVerticalLines
          verticalLinesColor={theme.dark ? alpha(colors.outline, 0.3) : '#EFE2D9'}
          verticalLinesThickness={1}
          verticalLinesStrokeDashArray={[4, 5]}
          hideYAxisText
          yAxisLabelWidth={0}
          yAxisThickness={0}
          xAxisThickness={0}
          xAxisLabelTextStyle={{ color: theme.colors.onSurfaceVariant, fontSize: 10 }}
          noOfSections={3}
          adjustToWidth
          initialSpacing={18}
          endSpacing={18}
          pointerConfig={{
            pointerStripHeight: 140,
            pointerStripColor: alpha(colors.primaryStrong, 0.28),
            pointerStripWidth: 1,
            pointerColor: colors.primaryStrong,
            radius: 5,
            pointerLabelWidth: 110,
            pointerLabelHeight: 42,
            activatePointersOnLongPress: false,
            autoAdjustPointerLabelPosition: true,
            pointerLabelComponent: (items: { value?: number; label?: string }[]) => {
              const item = items?.[0];
              return (
                <View style={[styles.tooltip, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.tooltipValue, { color: theme.colors.onSurface }]}>
                    {formatCurrency(item?.value ?? 0)}
                  </Text>
                  <Text style={[styles.tooltipLabel, { color: theme.colors.onSurfaceVariant }]}>
                    {item?.label ?? ''}
                  </Text>
                </View>
              );
            }
          }}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: spacing.section,
    paddingBottom: 10,
    paddingHorizontal: 16,
    paddingTop: 16
  },
  chartWrap: { marginLeft: -6, marginTop: 14, overflow: 'hidden' },
  header: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  headerText: { flex: 1, minWidth: 0 },
  segment: {
    borderRadius: 14,
    flexDirection: 'row',
    padding: 3
  },
  segmentItem: {
    alignItems: 'center',
    borderRadius: 11,
    justifyContent: 'center',
    minHeight: 28,
    minWidth: 38,
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  segmentLabel: { ...fontStyles.bold, fontSize: 11.5, textAlign: 'center' },
  subtitle: { ...fontStyles.medium, fontSize: 11.5, marginTop: 2 },
  title: { ...fontStyles.bold, fontSize: 17, letterSpacing: -0.4 },
  tooltip: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  tooltipLabel: { ...typeScale.caption, fontSize: 10, marginTop: 1 },
  tooltipValue: { ...fontStyles.bold, fontSize: 12 }
});
