import { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { alpha, appColors, fontStyles, radii, statusTone } from '@/theme/theme';
import { LucideGlyph } from './DocumentShareActions';
import { DocumentSection } from './DocumentSection';

/**
 * The hero card every document detail screen opens with: what this document is, when it was
 * raised, what state it is in, what it is worth, and the one action that state invites.
 *
 * Pure presentation — it is handed strings and an element, and knows nothing about invoices,
 * orders or any other document type. The caller decides the wording, the glyphs, and what the
 * action does; `statusTone` maps the status word to its colour the same way the lists do.
 */
export function DocumentHeroCard({
  eyebrow,
  eyebrowIcon: EyebrowIcon,
  title,
  subtitle,
  status,
  statusIcon: StatusIcon,
  amountLabel,
  amount,
  amountMeta,
  amountMuted,
  primaryAction
}: {
  eyebrow?: string;
  eyebrowIcon?: LucideGlyph;
  title: string;
  subtitle: string;
  status: string;
  statusIcon: LucideGlyph;
  amountLabel: string;
  amount: string;
  amountMeta: string;
  /** Dims the figure when it is no longer a live number (a voided document, say). */
  amountMuted?: boolean;
  primaryAction?: ReactNode;
}) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const tone = statusTone(status, isDark);
  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.06);

  return (
    <DocumentSection>
      {eyebrow ? (
        <View style={styles.eyebrowRow}>
          {EyebrowIcon ? <EyebrowIcon size={13} color={theme.colors.onSurfaceVariant} strokeWidth={2.4} /> : null}
          <Text style={[styles.eyebrow, { color: theme.colors.onSurfaceVariant }]}>{eyebrow}</Text>
        </View>
      ) : null}
      <View style={styles.summaryHead}>
        <View style={styles.summaryHeadText}>
          <Text numberOfLines={1} style={[styles.docNumber, { color: theme.colors.onSurface }]}>{title}</Text>
          <Text style={[styles.docDate, { color: theme.colors.onSurfaceVariant }]}>{subtitle}</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: tone.background, borderColor: alpha(tone.foreground, isDark ? 0.42 : 0.3) }]}>
          <StatusIcon size={13} color={tone.foreground} strokeWidth={2.3} />
          <Text style={[styles.statusText, { color: tone.foreground }]}>{status}</Text>
        </View>
      </View>
      <View style={[styles.summaryAmountBlock, { borderTopColor: cardBorder }]}>
        <Text style={[styles.amountLabel, { color: theme.colors.onSurfaceVariant }]}>{amountLabel}</Text>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          style={[styles.amountValue, { color: amountMuted ? theme.colors.onSurfaceVariant : theme.colors.onSurface }]}
        >
          {amount}
        </Text>
        <Text style={[styles.amountMeta, { color: theme.colors.onSurfaceVariant }]}>{amountMeta}</Text>
      </View>
      {primaryAction}
    </DocumentSection>
  );
}

/** Shared styling for the hero's primary button, so every document's CTA sits identically. */
export const documentHeroActionStyles = StyleSheet.create({
  button: { borderRadius: radii.input, marginTop: 16 },
  content: { paddingVertical: 4 }
});

const styles = StyleSheet.create({
  amountLabel: { ...fontStyles.semiBold, fontSize: 10.5, letterSpacing: 0.9, textTransform: 'uppercase' },
  amountMeta: { ...fontStyles.medium, fontSize: 12.5, marginTop: 4 },
  amountValue: { ...fontStyles.bold, fontSize: 32, letterSpacing: -0.9, lineHeight: 40, marginTop: 2 },
  docDate: { ...fontStyles.medium, fontSize: 12.5, marginTop: 3 },
  docNumber: { ...fontStyles.bold, fontSize: 18, letterSpacing: -0.4 },
  eyebrow: { ...fontStyles.semiBold, fontSize: 10.5, letterSpacing: 0.9, textTransform: 'uppercase' },
  eyebrowRow: { alignItems: 'center', flexDirection: 'row', gap: 6, marginBottom: 8 },
  statusPill: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  statusText: { ...fontStyles.bold, fontSize: 11, letterSpacing: 0.3, textTransform: 'capitalize' },
  summaryAmountBlock: { borderTopWidth: 1, marginTop: 14, paddingTop: 14 },
  summaryHead: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  summaryHeadText: { flex: 1, minWidth: 0 }
});
