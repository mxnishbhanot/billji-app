import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { Screen } from '@/components/Screen';
import { SyncRetryButton } from '@/components/SyncStatus';
import { activeBusinessId } from '@/api/localFirst';
import { formatSyncDiagnostics, readSyncDiagnostics, type SyncDiagnostics } from '@/sync/diagnostics';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';

/**
 * The diagnostic view for offline sync. Not a user feature: this is what a support conversation
 * asks for instead of asking a shopkeeper to reproduce a bug that only happens on their phone,
 * their network and their data.
 *
 * Everything is selectable so the whole block can be long-pressed and copied — deliberately not a
 * clipboard dependency for one button.
 */

const AGE = (iso: string | null, now = Date.now()) => {
  if (!iso) return '—';
  const ms = now - Date.parse(iso);
  if (Number.isNaN(ms)) return '—';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
};

export function SyncDebugScreen() {
  const isDark = useTheme().dark;
  const colors = appColors(isDark);
  const [diagnostics, setDiagnostics] = useState<SyncDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    let cancelled = false;
    const businessId = activeBusinessId();
    if (!businessId) {
      setLoading(false);
      return () => undefined;
    }
    void readSyncDiagnostics(businessId)
      .then((next) => {
        if (!cancelled) setDiagnostics(next);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useFocusEffect(load);

  const border = isDark ? colors.border : alpha(colors.primaryStrong, 0.08);

  return (
    <Screen title="Sync diagnostics" contentStyle={styles.content}>
      {loading ? (
        <ActivityIndicator style={styles.loader} />
      ) : !diagnostics ? (
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          No local database on this device, so nothing is queued here.
        </Text>
      ) : (
        <>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: border }]}>
            <Text style={[styles.heading, { color: colors.mutedForeground }]}>QUEUE</Text>
            {(Object.keys(diagnostics.counts) as (keyof SyncDiagnostics['counts'])[]).map((status) => (
              <View key={status} style={styles.row}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>{status}</Text>
                <Text style={[styles.value, { color: colors.foreground }]}>{diagnostics.counts[status]}</Text>
              </View>
            ))}
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>oldest waiting</Text>
              <Text style={[styles.value, { color: colors.foreground }]}>{AGE(diagnostics.oldestPendingAt)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>last sync</Text>
              <Text style={[styles.value, { color: colors.foreground }]}>{AGE(diagnostics.lastSyncAt)} ago</Text>
            </View>
          </View>

          {diagnostics.lastError ? (
            <View style={[styles.card, { backgroundColor: colors.destructiveSoft, borderColor: alpha(colors.destructive, 0.35) }]}>
              <Text style={[styles.heading, { color: colors.destructive }]}>LAST ERROR</Text>
              <Text selectable style={[styles.mono, { color: colors.foreground }]}>
                {`${diagnostics.lastError.entityType}:${diagnostics.lastError.opType} · ${diagnostics.lastError.attempts} attempts\n${diagnostics.lastError.error}`}
              </Text>
            </View>
          ) : null}

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: border }]}>
            <Text style={[styles.heading, { color: colors.mutedForeground }]}>DEVICE</Text>
            <Text selectable style={[styles.mono, { color: colors.foreground }]}>
              {formatSyncDiagnostics(diagnostics)}
            </Text>
          </View>

          <SyncRetryButton label="Sync now" />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingBottom: 32 },
  loader: { marginTop: 24 },
  card: { borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 6 },
  heading: { ...fontStyles.bold, fontSize: 11, letterSpacing: 1.1 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { ...fontStyles.regular, fontSize: 13 },
  value: { ...fontStyles.bold, fontSize: 13 },
  body: { ...typeScale.caption, fontSize: 13 },
  mono: { ...fontStyles.regular, fontSize: 12, lineHeight: 18 }
});
