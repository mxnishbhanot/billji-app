import { StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, useTheme } from 'react-native-paper';
import { alpha, appColors, fontStyles, iconSizes, radii, shadow, spacing, typeScale } from '@/theme/theme';
import { AppCard } from './AppCard';

type StatTone = 'primary' | 'success' | 'warning' | 'danger';
type Props = { label: string; value: string | number; hint?: string; tone?: StatTone; icon?: keyof typeof MaterialCommunityIcons.glyphMap; onPress?: () => void };

export function StatCard({ label, value, hint, tone = 'primary', icon, onPress }: Props) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const accent =
    tone === 'success' ? colors.accent :
    tone === 'warning' ? colors.warning :
    tone === 'danger' ? colors.destructive :
    colors.primary;
  const tileColor = isDark ? alpha(accent, 0.2) : alpha(accent, 0.1);
  return (
    <AppCard style={[styles.card, shadow(isDark, 'sm')]} onPress={onPress}>
      <View style={styles.shell}>
        <View style={styles.topRow}>
          {icon ? (
            <View style={[styles.iconTile, { backgroundColor: tileColor }]}>
              <MaterialCommunityIcons name={icon} size={iconSizes.md} color={accent} />
            </View>
          ) : null}
          <Text numberOfLines={1} style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>{label}</Text>
        </View>
        <View>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={[styles.value, { color: theme.colors.onSurface }]}
          >
            {value}
          </Text>
          {hint ? <Text numberOfLines={1} style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}>{hint}</Text> : null}
        </View>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  // The icon leads the row now and the label sits beside it: two left-aligned rails
  // (icon+label, then value+hint) scan faster than a label/icon split across the card.
  card: { flex: 1, marginHorizontal: spacing.base + 2, minHeight: 112 },
  hint: { ...typeScale.smallCaption, marginTop: spacing.base },
  iconTile: {
    alignItems: 'center',
    borderRadius: radii.md,
    height: 30,
    justifyContent: 'center',
    width: 30
  },
  label: { ...fontStyles.semiBold, flexShrink: 1, fontSize: 11, letterSpacing: 0.7, textTransform: 'uppercase' as const },
  shell: { flex: 1, gap: spacing.sm, justifyContent: 'space-between' },
  topRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  value: { ...typeScale.cardValue, fontSize: 24, letterSpacing: -0.7, lineHeight: 28 }
});
