import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { shadows } from '@/design-system';
import { alpha, appColors, fontStyles, radii, statusTone } from '@/theme/theme';
import { LucideGlyph } from './DocumentShareActions';

/**
 * One row of a sales-document list: what the document is, who it is for, what it is worth,
 * where it stands, and the one thing it invites next.
 *
 * Pure presentation. It is handed strings, glyphs and callbacks; it knows nothing about
 * quotations, challans or credit notes — the list screen decides the wording, the context
 * line and which actions a given state offers, so the three types stay distinguishable
 * without this component branching on any of them.
 */
export type DocumentCardAction = {
  label: string;
  icon: LucideGlyph;
  onPress: () => void;
  /** Shows a spinner in place of the icon (a share that is preparing the PDF, say). */
  busy?: boolean;
  disabled?: boolean;
};

export const DocumentListCard = memo(function DocumentListCard({
  icon: Icon,
  number,
  meta,
  amount,
  status,
  statusToneKey,
  contextIcon: ContextIcon,
  contextText,
  contextMuted,
  primaryAction,
  secondaryAction,
  destructiveAction,
  onPress,
  accessibilityLabel
}: {
  icon: LucideGlyph;
  number: string;
  /** Customer and date, already joined by the caller. */
  meta: string;
  amount: string;
  status: string;
  /** statusTone keyword; defaults to the status word itself. */
  statusToneKey?: string;
  contextIcon: LucideGlyph;
  contextText: string;
  /** Dims the context line when it describes a document that is no longer live. */
  contextMuted?: boolean;
  primaryAction?: DocumentCardAction;
  secondaryAction?: DocumentCardAction;
  destructiveAction?: DocumentCardAction;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const border = isDark ? colors.border : alpha(colors.primaryStrong, 0.06);
  const tone = statusTone(statusToneKey ?? status, isDark);
  const contextColor = contextMuted ? theme.colors.onSurfaceVariant : colors.primaryStrong;
  const hasActions = Boolean(primaryAction || secondaryAction || destructiveAction);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.card,
        isDark ? null : shadows.card,
        { backgroundColor: colors.card, borderColor: border, opacity: pressed ? 0.92 : 1 }
      ]}
    >
      <View style={styles.head}>
        <View style={[styles.iconChip, { backgroundColor: alpha(colors.primary, isDark ? 0.22 : 0.1) }]}>
          <Icon size={17} color={colors.primaryStrong} strokeWidth={2.2} />
        </View>
        <View style={styles.headText}>
          <Text numberOfLines={1} style={[styles.number, { color: theme.colors.onSurface }]}>{number}</Text>
          <Text numberOfLines={1} style={[styles.meta, { color: theme.colors.onSurfaceVariant }]}>{meta}</Text>
        </View>
        <View style={styles.headRight}>
          <Text numberOfLines={1} style={[styles.amount, { color: theme.colors.onSurface }]}>{amount}</Text>
          <View style={[styles.statusPill, { backgroundColor: tone.background, borderColor: tone.border }]}>
            <Text style={[styles.statusText, { color: tone.foreground }]}>{status}</Text>
          </View>
        </View>
      </View>

      <View style={styles.contextRow}>
        <ContextIcon size={13} color={contextColor} strokeWidth={2.2} />
        <Text numberOfLines={2} style={[styles.contextText, { color: contextColor }]}>{contextText}</Text>
      </View>

      {hasActions ? (
        <View style={[styles.actionRow, { borderTopColor: border }]}>
          {primaryAction ? (
            <CardAction
              action={primaryAction}
              background={isDark ? colors.primaryFixed : theme.colors.primary}
              foreground={isDark ? theme.colors.onPrimaryContainer : '#FFFFFF'}
            />
          ) : null}
          {secondaryAction ? (
            <CardAction action={secondaryAction} background="transparent" foreground={theme.colors.onSurface} borderColor={border} />
          ) : null}
          {destructiveAction ? (
            <CardAction
              action={destructiveAction}
              background="transparent"
              foreground={colors.destructive}
              style={styles.destructive}
            />
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
});

function CardAction({
  action,
  background,
  foreground,
  borderColor,
  style
}: {
  action: DocumentCardAction;
  background: string;
  foreground: string;
  borderColor?: string;
  style?: object;
}) {
  const Icon = action.icon;
  return (
    <Pressable
      onPress={action.onPress}
      disabled={action.disabled || action.busy}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      hitSlop={4}
      style={({ pressed }) => [
        styles.action,
        { backgroundColor: background, borderColor: borderColor ?? 'transparent', borderWidth: borderColor ? 1 : 0 },
        style,
        { opacity: pressed ? 0.85 : action.disabled ? 0.5 : 1 }
      ]}
    >
      {action.busy ? <ActivityIndicator size={13} color={foreground} /> : <Icon size={14} color={foreground} strokeWidth={2.3} />}
      <Text numberOfLines={1} style={[styles.actionLabel, { color: foreground }]}>{action.label}</Text>
    </Pressable>
  );
}

/** Placeholder rows while the first page loads — same silhouette as the real card, no motion. */
export function DocumentListSkeleton({ rows = 4 }: { rows?: number }) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const border = isDark ? colors.border : alpha(colors.primaryStrong, 0.06);
  const block = { backgroundColor: alpha(colors.mutedForeground, isDark ? 0.16 : 0.09) };

  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Loading documents">
      {Array.from({ length: rows }).map((_, index) => (
        <View
          key={index}
          style={[styles.card, isDark ? null : shadows.card, { backgroundColor: colors.card, borderColor: border }]}
        >
          <View style={styles.head}>
            <View style={[styles.iconChip, block]} />
            <View style={styles.headText}>
              <View style={[styles.skeletonLine, styles.skeletonNumber, block]} />
              <View style={[styles.skeletonLine, styles.skeletonMeta, block]} />
            </View>
            <View style={[styles.skeletonLine, styles.skeletonAmount, block]} />
          </View>
          <View style={[styles.skeletonLine, styles.skeletonContext, block]} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  actionLabel: { ...fontStyles.semiBold, fontSize: 12.5 },
  actionRow: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14, paddingTop: 12 },
  amount: { ...fontStyles.bold, fontSize: 16, letterSpacing: -0.3 },
  card: { borderRadius: 20, borderWidth: 1, marginBottom: 12, padding: 16 },
  contextRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 7, marginTop: 12 },
  contextText: { ...fontStyles.medium, flex: 1, fontSize: 12.5, lineHeight: 17 },
  destructive: { marginLeft: 'auto' },
  head: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  headRight: { alignItems: 'flex-end', gap: 6, maxWidth: '42%' },
  headText: { flex: 1, minWidth: 0 },
  iconChip: { alignItems: 'center', borderRadius: radii.pill, height: 36, justifyContent: 'center', width: 36 },
  meta: { ...fontStyles.medium, fontSize: 12.5, marginTop: 3 },
  number: { ...fontStyles.bold, fontSize: 15, letterSpacing: -0.2 },
  skeletonAmount: { height: 14, width: 70 },
  skeletonContext: { height: 11, marginTop: 16, width: '55%' },
  skeletonLine: { borderRadius: radii.sm },
  skeletonMeta: { height: 11, marginTop: 8, width: '65%' },
  skeletonNumber: { height: 13, width: '48%' },
  statusPill: { borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 3 },
  statusText: { ...fontStyles.semiBold, fontSize: 11, letterSpacing: 0.3 }
});
