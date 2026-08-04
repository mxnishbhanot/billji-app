import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { alpha, appColors, fontStyles, radii } from '@/theme/theme';
import type { UsageRow } from '@/types';

type Props = {
  row: UsageRow;
  /** Hides the "resets on" line where space is tight (the dashboard card). */
  compact?: boolean;
};

const resetLabel = (resetsAt: string | null) => {
  if (!resetsAt) return '';
  const date = new Date(resetsAt);
  return `Resets ${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
};

// One usage row: label, used-of-limit, a bar. Shared by the dashboard and the subscription screen so
// the same number can never be drawn two different ways.
//
// `limit: null` means unlimited in the billing contract — the bar is not drawn at all then, because
// a progress bar with no ceiling is a lie.
export function UsageMeter({ row, compact = false }: Props) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = useMemo(() => appColors(isDark), [isDark]);

  const overLimit = row.overage > 0 || (row.limit !== null && row.used > row.limit);
  const tone = overLimit ? colors.destructive : row.percentUsed >= 80 ? colors.warning : colors.primary;
  const width = row.unlimited ? 0 : Math.min(100, Math.max(row.percentUsed, row.used > 0 ? 4 : 0));

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={[styles.label, { color: theme.colors.onSurface }]} numberOfLines={1}>
          {row.label}
        </Text>
        <Text style={[styles.value, { color: overLimit ? colors.destructive : theme.colors.onSurfaceVariant }]}>
          {row.unlimited ? `${row.used} · Unlimited` : `${row.used} of ${row.limit}`}
        </Text>
      </View>

      {row.unlimited ? null : (
        <View style={[styles.track, { backgroundColor: alpha(tone, isDark ? 0.22 : 0.12) }]}>
          <View style={[styles.fill, { width: `${width}%`, backgroundColor: tone }]} />
        </View>
      )}

      {compact ? null : (
        <Text style={[styles.meta, { color: theme.colors.onSurfaceVariant }]}>
          {overLimit
            ? `${row.overage} over your plan${row.resetsAt ? ` · ${resetLabel(row.resetsAt)}` : ''}`
            : resetLabel(row.resetsAt)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, paddingVertical: 6 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label: { ...fontStyles.medium, fontSize: 14, flexShrink: 1 },
  value: { ...fontStyles.semiBold, fontSize: 13 },
  track: { height: 6, borderRadius: radii.pill, overflow: 'hidden' },
  fill: { height: 6, borderRadius: radii.pill },
  meta: { ...fontStyles.regular, fontSize: 12 }
});
