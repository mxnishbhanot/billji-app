import { ReactNode, useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Switch, Text, useTheme } from 'react-native-paper';
import { useAppDialog } from '@/components/AppDialog';
import { useAppToast } from '@/components/AppToast';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Screen } from '@/components/Screen';
import { OfflineBanner, QueueCounter, SyncRetryButton } from '@/components/SyncStatus';
import { AppNavigation } from '@/navigation/types';
import { clearCachedData, formatBytes, readStorageUsage, type StorageUsage } from '@/services/storage';
import { useSyncPreferences } from '@/shared/hooks/useSyncPreferences';
import { useSyncStatus } from '@/shared/hooks/useSyncStatus';
import { setSyncPreference } from '@/sync/syncPreferences';
import { autoSyncBlockedBy } from '@/sync/syncStatus';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';

/**
 * One screen for everything about syncing: what is happening now, when the device is allowed
 * to sync on its own, and what all of it costs in storage.
 *
 * The switches are device-local (see sync/syncPreferences) — "Wi-Fi only" is about this
 * phone's data plan, so it does not follow the user to another device.
 */

function Group({ title, children }: { title: string; children: ReactNode }) {
  const isDark = useTheme().dark;
  const colors = appColors(isDark);
  const border = isDark ? colors.border : alpha(colors.primaryStrong, 0.08);

  return (
    <>
      <Text style={[styles.groupTitle, { color: colors.mutedForeground }]}>{title}</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: border }]}>{children}</View>
    </>
  );
}

function Row({
  icon,
  tone,
  title,
  subtitle,
  trailing,
  first = false
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  tone: string;
  title: string;
  subtitle: string;
  trailing?: ReactNode;
  first?: boolean;
}) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);

  return (
    <>
      {first ? null : (
        <View style={[styles.divider, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08) }]} />
      )}
      <View style={styles.row}>
        <View style={[styles.rowIcon, { backgroundColor: alpha(tone, isDark ? 0.22 : 0.12) }]}>
          <MaterialCommunityIcons name={icon} size={18} color={tone} />
        </View>
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, { color: theme.colors.onSurface }]}>{title}</Text>
          <Text style={[styles.rowSubtitle, { color: theme.colors.onSurfaceVariant }]}>{subtitle}</Text>
        </View>
        {trailing}
      </View>
    </>
  );
}

const BLOCKED_REASON: Record<NonNullable<ReturnType<typeof autoSyncBlockedBy>>, string> = {
  'auto-off': 'Automatic sync is off — use Sync now',
  'wifi-only': 'Waiting for Wi-Fi',
  offline: 'Waiting for a connection'
};

export function SyncSettingsScreen() {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const navigation = useNavigation<AppNavigation>();
  const queryClient = useQueryClient();
  const { showDialog } = useAppDialog();
  const { showToast } = useAppToast();

  const { pending, failed, syncing, online, wifi } = useSyncStatus();
  const preferences = useSyncPreferences();

  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  // Measured on focus rather than on an interval: the numbers only move when the user has
  // been elsewhere in the app.
  const loadUsage = useCallback(() => {
    let cancelled = false;
    void readStorageUsage().then((next) => {
      if (!cancelled) setUsage(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useFocusEffect(loadUsage);

  const onClearCache = async () => {
    setConfirmClear(false);
    setClearing(true);
    try {
      await clearCachedData(queryClient);
      loadUsage();
      showToast('Cached data cleared');
    } catch {
      showDialog({ title: 'Could not clear the cache', message: 'Try again in a moment.', tone: 'error' });
    } finally {
      setClearing(false);
    }
  };

  const blocked = autoSyncBlockedBy();
  const queued = pending + failed;
  const autoSubtitle = preferences.auto
    ? blocked
      ? BLOCKED_REASON[blocked]
      : 'Syncing on its own when the connection allows'
    : 'Nothing syncs until you tap Sync now';

  return (
    <Screen title="Sync" hideOfflineBanner contentStyle={styles.screenContent}>
      <OfflineBanner style={styles.banner} />

      <QueueCounter style={styles.counter} onPress={() => navigation.navigate('SyncIssues')} />

      {failed > 0 ? (
        <Pressable
          onPress={() => navigation.navigate('SyncIssues')}
          style={[styles.issuesLink, { backgroundColor: colors.destructiveSoft, borderColor: alpha(colors.destructive, 0.35) }]}
        >
          <MaterialCommunityIcons name="cloud-alert" size={18} color={colors.destructive} />
          <Text style={[styles.issuesLinkText, { color: colors.destructive }]}>
            {failed} sync issue{failed === 1 ? '' : 's'} — review
          </Text>
        </Pressable>
      ) : null}

      <Group title="MANUAL SYNC">
        <Row
          first
          icon="cloud-sync-outline"
          tone={colors.primary}
          title="Sync now"
          subtitle={
            syncing
              ? 'Sending your changes…'
              : queued > 0
                ? `${queued} change${queued === 1 ? '' : 's'} to send`
                : 'Send and fetch everything right now'
          }
          trailing={<SyncRetryButton label="Sync now" />}
        />
      </Group>

      <Group title="AUTOMATIC SYNC">
        <Row
          first
          icon="autorenew"
          tone={colors.accent}
          title="Auto sync"
          subtitle={autoSubtitle}
          trailing={
            <Switch
              value={preferences.auto}
              onValueChange={(value) => void setSyncPreference('auto', value)}
              color={theme.colors.primary}
            />
          }
        />
        <Row
          icon="wifi"
          tone={colors.violet}
          title="Wi-Fi only"
          subtitle={
            preferences.wifiOnly
              ? online && !wifi
                ? 'On mobile data — automatic syncs are paused'
                : 'Automatic syncs wait for Wi-Fi'
              : 'Sync on mobile data as well'
          }
          trailing={
            <View style={preferences.auto ? undefined : styles.disabled}>
              <Switch
                value={preferences.wifiOnly}
                disabled={!preferences.auto}
                onValueChange={(value) => void setSyncPreference('wifiOnly', value)}
                color={theme.colors.primary}
              />
            </View>
          }
        />
        <Row
          icon="cellphone-arrow-down"
          tone={colors.warning}
          title="Background sync"
          // ponytail: foreground-resume only. A true OS background fetch needs
          // expo-background-task + a native rebuild; add it when the queue routinely
          // outlives a session.
          subtitle="Also sync whenever you reopen the app"
          trailing={
            <View style={preferences.auto ? undefined : styles.disabled}>
              <Switch
                value={preferences.background}
                disabled={!preferences.auto}
                onValueChange={(value) => void setSyncPreference('background', value)}
                color={theme.colors.primary}
              />
            </View>
          }
        />
      </Group>

      <Group title="TROUBLESHOOTING">
        <Row
          first
          icon="stethoscope"
          tone={colors.mutedForeground}
          title="Sync diagnostics"
          subtitle="Queue status, the last error and this device's numbering series"
          trailing={
            <Text
              accessibilityRole="button"
              onPress={() => navigation.navigate('SyncDebug')}
              style={[styles.action, { color: colors.primary }]}
            >
              Open
            </Text>
          }
        />
      </Group>

      <Group title="STORAGE USAGE">
        <Row
          first
          icon="database-outline"
          tone={colors.primary}
          title="Database size"
          subtitle="Your invoices, customers and queued changes on this device"
          trailing={
            usage ? (
              <Text style={[styles.value, { color: theme.colors.onSurface }]}>{formatBytes(usage.database)}</Text>
            ) : (
              <ActivityIndicator size={16} color={theme.colors.primary} />
            )
          }
        />
        <Row
          icon="folder-download-outline"
          tone={colors.accent}
          title="Cached data"
          subtitle="Downloaded copies that can be fetched again"
          trailing={
            usage ? (
              <Text style={[styles.value, { color: theme.colors.onSurface }]}>{formatBytes(usage.cache)}</Text>
            ) : (
              <ActivityIndicator size={16} color={theme.colors.primary} />
            )
          }
        />
        <Row
          icon="broom"
          tone={colors.destructive}
          title="Clear cache"
          subtitle={
            queued > 0
              ? `Keeps the ${queued} change${queued === 1 ? '' : 's'} still waiting to sync`
              : 'Frees space without losing your records'
          }
          trailing={
            clearing ? (
              <ActivityIndicator size={16} color={theme.colors.error} />
            ) : (
              <Text
                accessibilityRole="button"
                onPress={() => setConfirmClear(true)}
                style={[styles.action, { color: theme.colors.error }]}
              >
                Clear
              </Text>
            )
          }
        />
      </Group>

      <Text style={[styles.footnote, { color: theme.colors.onSurfaceVariant }]}>
        Everything you create works offline and is saved on this device first. Syncing only decides when it reaches the
        server.
      </Text>

      <ConfirmDialog
        visible={confirmClear}
        title="Clear cached data?"
        message="Removes downloaded copies of your invoices, customers and reports from this device. Nothing you created is lost — anything waiting to sync stays queued, and the rest is downloaded again when you need it."
        confirmLabel="Clear cache"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => void onClearCache()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  action: { ...fontStyles.bold, fontSize: 13, paddingHorizontal: 4, paddingVertical: 6 },
  banner: { marginBottom: 14 },
  card: { borderRadius: radii.lg, borderWidth: 1, marginBottom: 14 },
  counter: { marginBottom: 18 },
  disabled: { opacity: 0.45 },
  divider: { height: 1, marginLeft: 60 },
  footnote: { ...typeScale.caption, marginTop: 2, paddingHorizontal: 2 },
  groupTitle: { ...fontStyles.bold, fontSize: 11, letterSpacing: 1.1, marginBottom: 8, marginLeft: 2, marginTop: 4 },
  issuesLink: {
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  issuesLinkText: { ...fontStyles.semiBold, fontSize: 14 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 58, paddingHorizontal: 14, paddingVertical: 10 },
  rowIcon: { alignItems: 'center', borderRadius: radii.md, height: 34, justifyContent: 'center', width: 34 },
  rowSubtitle: { ...typeScale.caption, fontSize: 12, marginTop: 2 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { ...fontStyles.bold, fontSize: 14 },
  screenContent: { paddingTop: 8 },
  value: { ...fontStyles.bold, fontSize: 13 }
});
