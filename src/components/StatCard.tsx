import { StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, useTheme } from 'react-native-paper';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import { AppCard } from './AppCard';

type StatTone = 'primary' | 'success' | 'warning' | 'danger';
type Props = { label: string; value: string | number; hint?: string; tone?: StatTone; icon?: keyof typeof MaterialCommunityIcons.glyphMap };

export function StatCard({ label, value, hint, tone = 'primary', icon }: Props) {
  const theme = useTheme();
  const colors = appColors(theme.dark);
  const accent =
    tone === 'success' ? colors.accent :
    tone === 'warning' ? colors.warning :
    tone === 'danger' ? colors.destructive :
    colors.primary;
  const tileColor = theme.dark ? alpha(accent, 0.18) : alpha(accent, 0.1);
  return (
    <AppCard style={styles.card}>
      <View style={styles.shell}>
        <View style={styles.topRow}>
          <Text style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>{label}</Text>
          {icon ? (
            <View style={[styles.iconTile, { backgroundColor: tileColor }]}>
              <MaterialCommunityIcons name={icon} size={18} color={accent} />
            </View>
          ) : null}
        </View>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={[styles.value, { color: theme.colors.onSurface }]}
        >
          {value}
        </Text>
        {hint ? <Text style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}>{hint}</Text> : null}
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, marginHorizontal: 6, minHeight: 100 },
  hint: { ...typeScale.caption, fontSize: 11, marginTop: 6 },
  iconTile: {
    alignItems: 'center',
    borderRadius: radii.md,
    height: 32,
    justifyContent: 'center',
    width: 32
  },
  label: { ...fontStyles.semiBold, flex: 1, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase' as const },
  shell: { flex: 1, justifyContent: 'space-between' },
  topRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  value: { ...fontStyles.bold, fontSize: 22, letterSpacing: -0.6, lineHeight: 24, marginTop: 10 }
});
