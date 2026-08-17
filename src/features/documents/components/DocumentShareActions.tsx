import { ComponentType } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ActivityIndicator, useTheme } from 'react-native-paper';
import { shadows } from '@/design-system';
import { alpha, appColors, fontStyles, radii, spacing } from '@/theme/theme';

export type LucideGlyph = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

export type ShareAction = { label: string; icon: LucideGlyph; onPress: () => void };

/**
 * Share tile row (PDF/WhatsApp/Email/…). Purely presentational: which actions exist,
 * their icons, and what a tap does are all decided by the caller — this only renders
 * the row and the busy/disabled state for whichever tile is mid-flight.
 */
export function DocumentShareActions({
  actions,
  busyAction,
  accessibilityLabelPrefix = 'Share document by'
}: {
  actions: ShareAction[];
  busyAction: string | null;
  /** e.g. "Share invoice by" — kept caller-supplied so no document type is hardcoded here. */
  accessibilityLabelPrefix?: string;
}) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.06);

  return (
    <View style={styles.actionRow}>
      {actions.map((action) => {
        const isBusy = busyAction === action.label;
        const disabled = Boolean(busyAction) && !isBusy;
        const Icon = action.icon;
        return (
          <Pressable
            key={action.label}
            accessibilityRole="button"
            accessibilityLabel={`${accessibilityLabelPrefix} ${action.label}`}
            onPress={action.onPress}
            disabled={Boolean(busyAction)}
            style={({ pressed }) => [
              styles.actionTile,
              isDark ? null : shadows.card,
              { backgroundColor: colors.card, borderColor: cardBorder, opacity: pressed ? 0.85 : disabled ? 0.5 : 1 }
            ]}
          >
            <View style={[styles.actionIconWrap, { backgroundColor: alpha(colors.primary, isDark ? 0.26 : 0.12) }]}>
              {isBusy ? (
                <ActivityIndicator size={16} color={theme.colors.primary} />
              ) : (
                <Icon size={17} color={colors.primaryStrong} strokeWidth={2.2} />
              )}
            </View>
            <Text numberOfLines={1} style={[styles.actionLabel, { color: theme.colors.onSurface }]}>{isBusy ? 'Preparing…' : action.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  actionIconWrap: { alignItems: 'center', borderRadius: radii.pill, height: 34, justifyContent: 'center', width: 34 },
  actionLabel: { ...fontStyles.semiBold, fontSize: 12 },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: spacing.section },
  actionTile: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    gap: 8,
    paddingHorizontal: 6,
    paddingVertical: 14
  }
});
