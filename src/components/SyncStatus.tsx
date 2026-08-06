import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import Reanimated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSyncStatus } from '@/shared/hooks/useSyncStatus';
import { formatLastSync, retrySync, syncNow, type SyncPhase } from '@/sync/syncStatus';
import { alpha, appColors, fontStyles, radii, spacing } from '@/theme/theme';

/**
 * The offline surface: banner, badges, counter, retry. Six small pieces rather than one
 * widget, because they belong in different places — a header, a tab icon, a settings row —
 * and every one of them reads the same store, so they can never disagree.
 *
 * Nothing here is mounted by default. Drop a piece into a screen where it earns its space.
 */

type Tone = { fg: string; bg: string; border: string };

const toneFor = (phase: SyncPhase, isDark: boolean): Tone => {
  const colors = appColors(isDark);
  const tone = (base: string, soft: string): Tone => ({
    fg: base,
    bg: soft,
    border: alpha(base, isDark ? 0.3 : 0.34)
  });

  if (phase === 'offline') return tone(colors.mutedForeground, colors.surfaceContainerHigh);
  if (phase === 'failed') return tone(colors.destructive, colors.destructiveSoft);
  if (phase === 'pending') return tone(colors.warning, colors.warningSoft);
  if (phase === 'syncing') return tone(colors.primary, colors.primarySoft);
  return tone(colors.accent, colors.accentSoft);
};

const PHASE_ICON: Record<SyncPhase, keyof typeof MaterialCommunityIcons.glyphMap> = {
  offline: 'cloud-off-outline',
  syncing: 'cloud-sync-outline',
  pending: 'cloud-upload-outline',
  failed: 'cloud-alert',
  synced: 'cloud-check-outline'
};

const phaseLabel = (phase: SyncPhase, pending: number, failed: number) => {
  if (phase === 'syncing') return 'Syncing';
  if (phase === 'offline') return pending > 0 ? `Offline · ${pending}` : 'Offline';
  if (phase === 'failed') return `${failed} failed`;
  if (phase === 'pending') return `${pending} to sync`;
  return 'Synced';
};

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

// -- Offline banner ---------------------------------------------------------------------

/**
 * A slim bar for the top of a screen. Visible only when there is something to say: no
 * connection, or operations that stopped retrying. It slides away on its own once the
 * queue drains, so a screen never has to decide whether to render it.
 */
export function OfflineBanner({ style }: { style?: StyleProp<ViewStyle> }) {
  const { phase, pending, failed, error } = useSyncStatus();
  const isDark = useTheme().dark;
  const colors = appColors(isDark);
  const tone = toneFor(phase, isDark);

  // 'pending' is shown too. It used to be silent, which meant a queue that had stopped draining
  // looked exactly like a queue with nothing in it — the state most worth telling the user about
  // was the one state with no indicator anywhere outside the Settings screen.
  if (phase !== 'offline' && phase !== 'failed' && phase !== 'pending') return null;

  const offline = phase === 'offline';
  const title = offline
    ? "You're offline"
    : phase === 'pending'
      ? `${plural(pending, 'change')} waiting to sync`
      : `${plural(failed, 'change')} didn't sync`;
  // The reason a pass stopped is rendered when there is one. It was already being recorded and
  // never displayed, so every sync failure reached the user as silence.
  const subtitle = offline
    ? pending > 0
      ? `${plural(pending, 'change')} saved here, syncing when you're back`
      : 'Everything you do is saved on this device'
    : phase === 'pending'
      ? error ?? 'Saved on this device, syncing now'
      : error ?? 'Tap retry, or review them in the sync queue';

  return (
    <Reanimated.View
      entering={FadeInUp.duration(240)}
      exiting={FadeOutUp.duration(180)}
      style={[styles.banner, { backgroundColor: tone.bg, borderColor: tone.border }, style]}
    >
      <View style={[styles.bannerIcon, { backgroundColor: alpha(tone.fg, isDark ? 0.22 : 0.16) }]}>
        <MaterialCommunityIcons name={PHASE_ICON[phase]} size={18} color={tone.fg} />
      </View>
      <View style={styles.bannerText}>
        <Text style={[styles.bannerTitle, { color: colors.foreground }]}>{title}</Text>
        <Text numberOfLines={2} style={[styles.bannerSubtitle, { color: colors.mutedForeground }]}>
          {subtitle}
        </Text>
      </View>
      {offline ? null : <SyncRetryButton compact />}
    </Reanimated.View>
  );
}

// -- Sync badge -------------------------------------------------------------------------

/**
 * The always-on pill: one glance says which of the five states the device is in. Tapping it
 * starts a sync, so it doubles as the manual trigger in a header.
 */
export function SyncBadge({
  onPress,
  style,
  showLabel = true,
  hideWhenSynced = false
}: {
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  showLabel?: boolean;
  /** Headers: the "all good" state is the default, so saying it costs space and says nothing. */
  hideWhenSynced?: boolean;
}) {
  const { phase, pending, failed, syncing, online } = useSyncStatus();
  const isDark = useTheme().dark;
  const tone = toneFor(phase, isDark);
  const press = useCallback(() => (onPress ? onPress() : void syncNow()), [onPress]);

  if (hideWhenSynced && phase === 'synced') return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Sync status: ${phaseLabel(phase, pending, failed)}`}
      disabled={syncing || !online}
      onPress={press}
      style={({ pressed }) => [
        styles.badge,
        { backgroundColor: tone.bg, borderColor: tone.border, opacity: pressed ? 0.7 : 1 },
        style
      ]}
    >
      {syncing ? (
        <ActivityIndicator size={12} color={tone.fg} />
      ) : (
        <MaterialCommunityIcons name={PHASE_ICON[phase]} size={14} color={tone.fg} />
      )}
      {showLabel ? <Text style={[styles.badgeLabel, { color: tone.fg }]}>{phaseLabel(phase, pending, failed)}</Text> : null}
    </Pressable>
  );
}

// -- Pending badge ----------------------------------------------------------------------

/**
 * The count bubble for an icon or a tab. Renders nothing when the queue is empty, so it can
 * sit absolutely positioned over whatever it annotates and cost nothing when idle.
 */
export function PendingBadge({ style, max = 99 }: { style?: StyleProp<ViewStyle>; max?: number }) {
  const { pending, failed } = useSyncStatus();
  const isDark = useTheme().dark;
  const colors = appColors(isDark);
  const count = pending + failed;

  if (count === 0) return null;

  // Failures outrank a queue that is merely waiting: red means a person is needed.
  const background = failed > 0 ? colors.destructive : colors.warning;

  return (
    <View
      accessibilityLabel={`${plural(count, 'change')} waiting to sync`}
      style={[styles.pendingBadge, { backgroundColor: background, borderColor: colors.card }, style]}
    >
      <Text style={styles.pendingBadgeLabel}>{count > max ? `${max}+` : count}</Text>
    </View>
  );
}

// -- Last sync --------------------------------------------------------------------------

/** "Synced 5m ago". Re-renders itself once a minute so the text never goes stale on screen. */
export function LastSync({ style, showIcon = true }: { style?: StyleProp<ViewStyle>; showIcon?: boolean }) {
  const { lastSyncAt, syncing } = useSyncStatus();
  const isDark = useTheme().dark;
  const colors = appColors(isDark);
  const [, tick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => tick((value) => value + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={[styles.lastSync, style]}>
      {showIcon ? <MaterialCommunityIcons name="clock-outline" size={13} color={colors.mutedForeground} /> : null}
      <Text style={[styles.lastSyncLabel, { color: colors.mutedForeground }]}>
        {syncing ? 'Syncing now…' : formatLastSync(lastSyncAt)}
      </Text>
    </View>
  );
}

// -- Retry ------------------------------------------------------------------------------

/**
 * Requeues everything recoverable and syncs. Disabled while offline or already syncing —
 * a retry with no connection is a spinner that lies.
 */
export function SyncRetryButton({
  compact = false,
  label = 'Retry',
  style
}: {
  compact?: boolean;
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { syncing, online } = useSyncStatus();
  const isDark = useTheme().dark;
  const colors = appColors(isDark);
  const disabled = syncing || !online;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy: syncing }}
      disabled={disabled}
      onPress={() => void retrySync()}
      style={({ pressed }) => [
        compact ? styles.retryCompact : styles.retry,
        {
          backgroundColor: colors.primary,
          opacity: disabled ? 0.45 : pressed ? 0.82 : 1
        },
        style
      ]}
    >
      {syncing ? (
        <ActivityIndicator size={13} color="#FFFFFF" />
      ) : (
        <MaterialCommunityIcons name="refresh" size={14} color="#FFFFFF" />
      )}
      <Text style={styles.retryLabel}>{syncing ? 'Syncing' : label}</Text>
    </Pressable>
  );
}

// -- Queue counter ----------------------------------------------------------------------

/**
 * The settings-row view of the queue: how much is waiting, what failed, when it last landed,
 * and the way to act on it. The one place that shows all four at once.
 */
export function QueueCounter({ style, onPress }: { style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const { phase, pending, failed } = useSyncStatus();
  const isDark = useTheme().dark;
  const colors = appColors(isDark);
  const tone = toneFor(phase, isDark);

  const headline =
    pending + failed === 0 ? 'Everything is synced' : `${plural(pending + failed, 'change')} waiting to sync`;

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.counter,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed && onPress ? 0.85 : 1 },
        style
      ]}
    >
      <View style={[styles.counterIcon, { backgroundColor: tone.bg }]}>
        <MaterialCommunityIcons name={PHASE_ICON[phase]} size={20} color={tone.fg} />
      </View>

      <View style={styles.counterBody}>
        <Text style={[styles.counterTitle, { color: colors.foreground }]}>{headline}</Text>
        <View style={styles.counterMeta}>
          <LastSync />
          {failed > 0 ? (
            <Text style={[styles.counterFailed, { color: colors.destructive }]}>· {failed} failed</Text>
          ) : null}
        </View>
      </View>

      {pending + failed > 0 ? <SyncRetryButton compact label={failed > 0 ? 'Retry' : 'Sync'} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  badgeLabel: { ...fontStyles.semiBold, fontSize: 11, letterSpacing: 0.2 },
  banner: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10
  },
  bannerIcon: { alignItems: 'center', borderRadius: radii.pill, height: 32, justifyContent: 'center', width: 32 },
  bannerSubtitle: { ...fontStyles.regular, fontSize: 12, lineHeight: 16 },
  bannerText: { flex: 1, gap: 2 },
  bannerTitle: { ...fontStyles.semiBold, fontSize: 13, lineHeight: 18 },
  counter: {
    alignItems: 'center',
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.cardPaddingCompact
  },
  counterBody: { flex: 1, gap: 2 },
  counterFailed: { ...fontStyles.semiBold, fontSize: 12 },
  counterIcon: { alignItems: 'center', borderRadius: radii.md, height: 40, justifyContent: 'center', width: 40 },
  counterMeta: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  counterTitle: { ...fontStyles.semiBold, fontSize: 14, lineHeight: 20 },
  lastSync: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  lastSyncLabel: { ...fontStyles.regular, fontSize: 12 },
  pendingBadge: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: 2,
    justifyContent: 'center',
    minWidth: 18,
    paddingHorizontal: 4,
    paddingVertical: 1
  },
  pendingBadgeLabel: { ...fontStyles.bold, color: '#FFFFFF', fontSize: 10, lineHeight: 13 },
  retry: {
    alignItems: 'center',
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9
  },
  retryCompact: {
    alignItems: 'center',
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  retryLabel: { ...fontStyles.semiBold, color: '#FFFFFF', fontSize: 12 }
});
