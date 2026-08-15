import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { LucideGlyph } from '@/features/documents/components/DocumentShareActions';
import { fontStyles, radii } from '@/theme/theme';

/** Icon-chip colours. Shaped like statusTone()'s result so a caller can hand that straight in. */
export type NoticeTone = { background: string; foreground: string };

/**
 * One line of standing information about a document — cancelled, expired, what a credit did.
 * Pure presentation: the icon, the colour and the wording all come from the caller, so this
 * knows nothing about invoices, orders, credit notes or quotations. Renders the row only;
 * the parent decides which section it sits in.
 */
export function DocumentNotice({
  icon: Icon,
  tone,
  text,
  style
}: {
  icon: LucideGlyph;
  tone: NoticeTone;
  text: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.row, style]}>
      <View style={[styles.iconWrap, { backgroundColor: tone.background }]}>
        <Icon size={16} color={tone.foreground} strokeWidth={2.2} />
      </View>
      <Text style={[styles.text, { color: theme.colors.onSurfaceVariant }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  iconWrap: { alignItems: 'center', borderRadius: radii.pill, height: 32, justifyContent: 'center', width: 32 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  text: { ...fontStyles.medium, flex: 1, fontSize: 13, lineHeight: 19 }
});
