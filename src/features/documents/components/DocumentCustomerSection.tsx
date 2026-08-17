import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { User } from 'lucide-react-native';
import { alpha, appColors, fontStyles, radii } from '@/theme/theme';
import { LucideGlyph } from './DocumentShareActions';
import { DocumentSection } from './DocumentSection';

export type CustomerMetaItem = { key: string; icon: LucideGlyph; text: string; numberOfLines?: number };

/**
 * Party card (customer/billed-to/etc.) — avatar + name + hint, then an optional
 * meta block of icon+text rows. The caller decides the section title ("Billed To",
 * "Quoted To", …) and which meta rows apply; nothing document-specific lives here.
 */
export function DocumentCustomerSection({
  title,
  name,
  hint,
  metaItems
}: {
  title: string;
  name: string;
  hint: string;
  metaItems: CustomerMetaItem[];
}) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.06);

  return (
    <DocumentSection title={title}>
      <View style={styles.customerRow}>
        <View style={[styles.customerAvatar, { backgroundColor: alpha(colors.primary, isDark ? 0.2 : 0.12) }]}>
          <User size={18} color={colors.primaryStrong} strokeWidth={2.2} />
        </View>
        <View style={styles.customerText}>
          <Text numberOfLines={2} style={[styles.customerName, { color: theme.colors.onSurface }]}>{name}</Text>
          <Text style={[styles.customerHint, { color: theme.colors.onSurfaceVariant }]}>{hint}</Text>
        </View>
      </View>
      {metaItems.length ? (
        <View style={[styles.customerMeta, { borderTopColor: cardBorder }]}>
          {metaItems.map(({ key, icon: Icon, text, numberOfLines }) => (
            <View key={key} style={styles.metaRow}>
              <Icon size={14} color={theme.colors.onSurfaceVariant} strokeWidth={2.2} />
              <Text numberOfLines={numberOfLines} style={[styles.metaText, { color: theme.colors.onSurfaceVariant }]}>{text}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </DocumentSection>
  );
}

const styles = StyleSheet.create({
  customerAvatar: { alignItems: 'center', borderRadius: radii.pill, height: 40, justifyContent: 'center', width: 40 },
  customerHint: { ...fontStyles.medium, fontSize: 11.5, marginTop: 2 },
  customerMeta: { borderTopWidth: 1, gap: 8, marginTop: 12, paddingTop: 12 },
  customerName: { ...fontStyles.bold, fontSize: 16, letterSpacing: -0.3, lineHeight: 22 },
  customerRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  customerText: { flex: 1, minWidth: 0 },
  metaRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 8 },
  metaText: { ...fontStyles.medium, flex: 1, fontSize: 12.5, lineHeight: 18 }
});
