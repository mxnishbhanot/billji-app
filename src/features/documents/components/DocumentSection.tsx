import { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { shadows } from '@/design-system';
import { alpha, appColors, fontStyles, spacing, typeScale } from '@/theme/theme';

/**
 * Section eyebrow + card, matching the Settings/Dashboard label-over-card rhythm.
 * Pure presentation — callers decide title, contents, and any per-row data.
 */
export function DocumentSection({
  title,
  trailing,
  children,
  cardStyle
}: {
  title?: string;
  trailing?: ReactNode;
  children: ReactNode;
  cardStyle?: object;
}) {
  const theme = useTheme();
  const colors = appColors(theme.dark);
  const border = theme.dark ? colors.border : alpha(colors.primaryStrong, 0.06);

  return (
    <View style={styles.section}>
      {title ? (
        <View style={styles.sectionLabelRow}>
          <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>{title}</Text>
          {trailing}
        </View>
      ) : null}
      <View style={[styles.card, theme.dark ? null : shadows.card, { backgroundColor: colors.card, borderColor: border }, cardStyle]}>
        {children}
      </View>
    </View>
  );
}

export function DocumentDetailRow({ label, value, emphasise }: { label: string; value: string; emphasise?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: theme.colors.onSurfaceVariant }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: emphasise ?? theme.colors.onSurface }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: 1, padding: spacing.cardPadding },
  detailLabel: { ...typeScale.bodyPrimary, flexShrink: 1, fontSize: 13.5 },
  detailRow: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  detailValue: { ...fontStyles.semiBold, fontSize: 13.5, textAlign: 'right' },
  section: { marginBottom: spacing.section },
  sectionLabel: { ...fontStyles.semiBold, fontSize: 10.5, letterSpacing: 0.9, textTransform: 'uppercase' },
  sectionLabelRow: { alignItems: 'center', flexDirection: 'row', gap: 8, marginBottom: 10, marginLeft: 4 }
});
