import { Feather } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';
import { alpha, appColors, iconSizes, radii, spacing, typeScale } from '@/theme/theme';

type Props = {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  hint?: string;
  /** Feather glyph for the badge. Defaults to the document icon. */
  icon?: keyof typeof Feather.glyphMap;
};

export function EmptyState({ title, message, actionLabel, onAction, hint, icon = 'file-plus' }: Props) {
  const theme = useTheme();
  const colors = appColors(theme.dark);
  return (
    <View style={styles.wrap}>
      <View style={[styles.badge, { backgroundColor: colors.primarySoft, borderColor: alpha(colors.primary, theme.dark ? 0.3 : 0.16) }]}>
        <Feather name={icon} size={iconSizes.lg} color={theme.colors.primary} />
      </View>
      <Text variant="titleMedium" style={[styles.title, { color: theme.colors.onSurface }]}>{title}</Text>
      <Text style={[styles.message, { color: theme.colors.onSurfaceVariant }]}>{message}</Text>
      {hint ? <Text style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}>{hint}</Text> : null}
      {actionLabel && onAction ? (
        <Button mode="contained" onPress={onAction} style={styles.action} contentStyle={styles.actionContent}>{actionLabel}</Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  action: { borderRadius: radii.pill, marginTop: spacing.md },
  actionContent: { height: 44, paddingHorizontal: spacing.md },
  badge: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 56,
    justifyContent: 'center',
    marginBottom: spacing.sm,
    width: 56
  },
  hint: { ...typeScale.caption, marginTop: spacing.xs, opacity: 0.85, textAlign: 'center' },
  message: { ...typeScale.bodyPrimary, fontSize: 14, lineHeight: 20, marginTop: spacing.base + 2, textAlign: 'center' },
  title: { ...typeScale.sectionTitle, textAlign: 'center' },
  wrap: { alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.lg }
});
