import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { useAppDialog } from '@/components/AppDialog';
import { useAppToast } from '@/components/AppToast';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Screen } from '@/components/Screen';
import { OfflineBanner } from '@/components/SyncStatus';
import {
  discardSyncIssue,
  keepLocalSyncIssue,
  keepServerSyncIssue,
  listSyncIssues,
  retrySyncIssue,
  type DeadLetter
} from '@/sync';
import { useSyncStatus } from '@/shared/hooks/useSyncStatus';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';

/**
 * Sync Issues: the human escape hatch for failed, conflicted and dead outbox operations.
 * Policy lives in conflictResolver; this screen only surfaces choices and calls the existing
 * retry / discard / keep-local / keep-server helpers.
 */

const ENTITY_LABEL: Record<string, string> = {
  products: 'Product',
  customers: 'Customer',
  invoices: 'Invoice',
  payments: 'Payment',
  expenses: 'Expense',
  suppliers: 'Supplier',
  purchases: 'Purchase',
  orders: 'Order',
  business: 'Business'
};

const statusTone = (status: DeadLetter['status'], colors: ReturnType<typeof appColors>) => {
  if (status === 'conflict') return colors.warning;
  if (status === 'dead') return colors.destructive;
  return colors.mutedForeground;
};

export function SyncIssuesScreen() {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const { showDialog } = useAppDialog();
  const { showToast } = useAppToast();
  const { failed, syncing } = useSyncStatus();

  const [issues, setIssues] = useState<DeadLetter[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [discardTarget, setDiscardTarget] = useState<DeadLetter | null>(null);

  const reload = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    void listSyncIssues()
      .then((next) => {
        if (!cancelled) setIssues(next);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useFocusEffect(reload);

  const run = async (opId: string, action: () => Promise<void>, okMessage: string) => {
    setBusyId(opId);
    try {
      await action();
      showToast(okMessage);
      reload();
    } catch (error) {
      showDialog({
        title: 'Could not update this change',
        message: (error as Error)?.message ?? 'Try again in a moment.',
        tone: 'error'
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Screen title="Sync issues" hideOfflineBanner contentStyle={styles.screenContent}>
      <OfflineBanner style={styles.banner} />

      <Text style={[styles.summary, { color: colors.mutedForeground }]}>
        {failed > 0
          ? `${failed} change${failed === 1 ? '' : 's'} need attention before they can sync.`
          : 'Nothing waiting — conflicts and failed syncs will show up here.'}
      </Text>

      {loading ? <ActivityIndicator style={styles.loader} /> : null}

      {!loading && issues.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: colors.card, borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08) }]}>
          <MaterialCommunityIcons name="cloud-check-outline" size={28} color={colors.accent} />
          <Text style={[styles.emptyTitle, { color: theme.colors.onSurface }]}>All clear</Text>
          <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
            When a change cannot sync, it lands here so you can retry or choose which version to keep.
          </Text>
        </View>
      ) : null}

      {issues.map((issue) => {
        const tone = statusTone(issue.status, colors);
        const busy = busyId === issue.opId || syncing;
        const isConflict = issue.status === 'conflict';
        const recoverable = issue.recoverable;

        return (
          <View
            key={issue.opId}
            style={[styles.card, { backgroundColor: colors.card, borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08) }]}
          >
            <View style={styles.cardHeader}>
              <View style={[styles.icon, { backgroundColor: alpha(tone, isDark ? 0.22 : 0.12) }]}>
                <MaterialCommunityIcons
                  name={isConflict ? 'swap-horizontal-bold' : issue.status === 'dead' ? 'cancel' : 'alert-circle-outline'}
                  size={18}
                  color={tone}
                />
              </View>
              <View style={styles.cardText}>
                <Text style={[styles.cardTitle, { color: theme.colors.onSurface }]}>
                  {ENTITY_LABEL[issue.entityType] ?? issue.entityType} · {issue.opType}
                </Text>
                <Text style={[styles.cardMeta, { color: tone }]}>{issue.status}</Text>
              </View>
            </View>

            <Text style={[styles.error, { color: colors.mutedForeground }]}>
              {issue.lastError || 'This change could not be synced.'}
            </Text>

            <View style={styles.actions}>
              {recoverable ? (
                <ActionChip
                  label="Retry"
                  disabled={busy}
                  onPress={() => void run(issue.opId, () => retrySyncIssue(issue.opId), 'Retrying…')}
                  color={colors.primary}
                />
              ) : null}
              {isConflict ? (
                <>
                  <ActionChip
                    label="Keep local"
                    disabled={busy}
                    onPress={() => void run(issue.opId, () => keepLocalSyncIssue(issue.opId), 'Keeping your version')}
                    color={colors.warning}
                  />
                  <ActionChip
                    label="Keep server"
                    disabled={busy}
                    onPress={() => void run(issue.opId, () => keepServerSyncIssue(issue.opId), 'Keeping server version')}
                    color={colors.accent}
                  />
                </>
              ) : null}
              <ActionChip
                label="Discard"
                disabled={busy}
                onPress={() => setDiscardTarget(issue)}
                color={colors.destructive}
              />
            </View>
          </View>
        );
      })}

      <ConfirmDialog
        visible={Boolean(discardTarget)}
        title="Discard this change?"
        message="It will be removed from this device and will not sync. This cannot be undone."
        confirmLabel="Discard"
        onCancel={() => setDiscardTarget(null)}
        onConfirm={() => {
          const target = discardTarget;
          setDiscardTarget(null);
          if (target) void run(target.opId, () => discardSyncIssue(target.opId), 'Discarded');
        }}
      />
    </Screen>
  );
}

function ActionChip({
  label,
  onPress,
  color,
  disabled
}: {
  label: string;
  onPress: () => void;
  color: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { borderColor: alpha(color, 0.4), backgroundColor: alpha(color, pressed ? 0.18 : 0.1), opacity: disabled ? 0.45 : 1 }
      ]}
    >
      <Text style={[styles.chipLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  banner: { marginBottom: 12 },
  card: { borderRadius: radii.card, borderWidth: 1, marginBottom: 12, padding: 14 },
  cardHeader: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  cardMeta: { ...typeScale.caption, marginTop: 2, textTransform: 'capitalize' },
  cardText: { flex: 1, minWidth: 0 },
  cardTitle: { ...fontStyles.semiBold, fontSize: 15 },
  chip: { borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  chipLabel: { ...fontStyles.semiBold, fontSize: 13 },
  empty: { alignItems: 'center', borderRadius: radii.card, borderWidth: 1, gap: 8, padding: 24 },
  emptyBody: { ...typeScale.bodyPrimaryMedium, textAlign: 'center' },
  emptyTitle: { ...fontStyles.semiBold, fontSize: 16 },
  error: { ...typeScale.bodyPrimaryMedium, marginTop: 10 },
  icon: { alignItems: 'center', borderRadius: radii.full, height: 36, justifyContent: 'center', width: 36 },
  loader: { marginVertical: 24 },
  screenContent: { paddingTop: 4 },
  summary: { ...typeScale.bodyPrimaryMedium, marginBottom: 14 }
});
