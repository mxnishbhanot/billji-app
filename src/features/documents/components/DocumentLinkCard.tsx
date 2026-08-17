import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { Text, useTheme } from 'react-native-paper';
import { DocumentSection } from '@/features/documents/components/DocumentSection';
import { LucideGlyph } from '@/features/documents/components/DocumentShareActions';
import { alpha, appColors, fontStyles, radii, spacing } from '@/theme/theme';

/**
 * A tappable row pointing at another document. Pure presentation: the label, icon, wording
 * and what a tap does are all the caller's, so this knows nothing about invoices, orders,
 * credit notes or quotations — and holds no navigation of its own.
 */
export function DocumentLinkCard({
  label,
  icon: Icon,
  title,
  hint,
  onPress,
  accessibilityLabel
}: {
  /** Section eyebrow above the card, e.g. "INVOICE" or "CREDITED AGAINST". */
  label?: string;
  icon: LucideGlyph;
  title: string;
  hint: string;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);

  return (
    <DocumentSection title={label} cardStyle={styles.card}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
        style={({ pressed }) => [styles.link, { opacity: pressed ? 0.85 : 1 }]}
      >
        <View style={[styles.iconWrap, { backgroundColor: alpha(colors.primary, isDark ? 0.26 : 0.12) }]}>
          <Icon size={17} color={colors.primaryStrong} strokeWidth={2.2} />
        </View>
        <View style={styles.text}>
          <Text numberOfLines={1} style={[styles.title, { color: theme.colors.onSurface }]}>{title}</Text>
          <Text style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}>{hint}</Text>
        </View>
        <ChevronRight size={18} color={theme.colors.primary} strokeWidth={2.4} />
      </Pressable>
    </DocumentSection>
  );
}

const styles = StyleSheet.create({
  card: { paddingHorizontal: 0, paddingVertical: 0 },
  hint: { ...fontStyles.medium, fontSize: 11.5, marginTop: 2 },
  iconWrap: { alignItems: 'center', borderRadius: radii.pill, height: 34, justifyContent: 'center', width: 34 },
  link: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingHorizontal: spacing.cardPadding, paddingVertical: 14 },
  text: { flex: 1, minWidth: 0 },
  title: { ...fontStyles.bold, fontSize: 15, letterSpacing: -0.2 }
});
