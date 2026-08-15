import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import { DocumentSection } from './DocumentSection';

export type DocumentItemRow = { id: string; name: string; meta: string; total: string };

/**
 * Line-item list. Takes already-formatted rows (name / "qty unit × price" / total
 * string) — no quantity/price/currency math happens in here, that stays with the caller.
 */
export function DocumentItemsSection({ title = 'ITEMS', items }: { title?: string; items: DocumentItemRow[] }) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.06);

  return (
    <DocumentSection
      title={title}
      trailing={
        <View style={[styles.countBadge, { backgroundColor: alpha(colors.primary, isDark ? 0.2 : 0.12) }]}>
          <Text style={[styles.countBadgeText, { color: colors.primaryStrong }]}>{items.length}</Text>
        </View>
      }
      cardStyle={styles.listCard}
    >
      {items.map((item, index) => (
        <View key={item.id} style={styles.itemRow}>
          {index > 0 ? <View style={[styles.itemDivider, { backgroundColor: cardBorder }]} /> : null}
          <View style={styles.itemInner}>
            <View style={styles.itemContent}>
              <Text style={[styles.itemName, { color: theme.colors.onSurface }]}>{item.name}</Text>
              <Text style={[styles.itemMeta, { color: theme.colors.onSurfaceVariant }]}>{item.meta}</Text>
            </View>
            <Text style={[styles.itemTotal, { color: theme.colors.onSurface }]}>{item.total}</Text>
          </View>
        </View>
      ))}
    </DocumentSection>
  );
}

const styles = StyleSheet.create({
  countBadge: { alignItems: 'center', borderRadius: radii.pill, minWidth: 24, paddingHorizontal: 8, paddingVertical: 2 },
  countBadgeText: { ...fontStyles.bold, fontSize: 11 },
  itemContent: { flex: 1, minWidth: 0 },
  itemDivider: { height: StyleSheet.hairlineWidth, marginBottom: 12 },
  itemInner: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  itemMeta: { ...typeScale.caption, fontSize: 12, marginTop: 3 },
  itemName: { ...fontStyles.semiBold, fontSize: 14, lineHeight: 20 },
  itemRow: { paddingVertical: 8 },
  itemTotal: { ...fontStyles.bold, fontSize: 14, lineHeight: 20 },
  listCard: { paddingVertical: 6 }
});
