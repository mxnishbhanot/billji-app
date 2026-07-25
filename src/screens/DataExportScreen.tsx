import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Button, Text, useTheme } from 'react-native-paper';
import { apiErrorMessage } from '@/api/client';
import { exportsApi } from '@/api/endpoints';
import { AppCard } from '@/components/AppCard';
import { useAppDialog } from '@/components/AppDialog';
import { useAppToast } from '@/components/AppToast';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { StatusPill } from '@/components/StatusPill';
import { shareDataExport } from '@/services/download';
import { queryKeys } from '@/shared/query/queryKeys';
import { DataExport } from '@/types';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';

const STATUS_META: Record<DataExport['status'], { label: string; tone: string }> = {
  queued: { label: 'Preparing', tone: 'pending' },
  processing: { label: 'Preparing', tone: 'pending' },
  completed: { label: 'Ready', tone: 'paid' },
  failed: { label: 'Failed', tone: 'cancelled' }
};

const INCLUDED = [
  { icon: 'users', label: 'Customers, with balances and addresses' },
  { icon: 'package', label: 'Products, stock levels and movements' },
  { icon: 'file-text', label: 'Invoices and orders, with every line item' },
  { icon: 'credit-card', label: 'Payments, allocations and refunds' },
  { icon: 'book-open', label: 'Ledger entries and your business profile' }
] as const;

const formatSize = (bytes: number) => {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date(value));
  } catch {
    return '';
  }
};

const formatDate = (value?: string | null) => {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
  } catch {
    return '';
  }
};

const isPending = (row?: DataExport) => row?.status === 'queued' || row?.status === 'processing';

export function DataExportScreen() {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = useMemo(() => appColors(isDark), [isDark]);
  const queryClient = useQueryClient();
  const { showDialog } = useAppDialog();
  const { showToast } = useAppToast();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const exportsQuery = useQuery({
    queryKey: queryKeys.exports.all,
    queryFn: exportsApi.list,
    // The archive is built by a background job, so poll while one is in flight. The
    // socket 'exports:changed' event also invalidates this key.
    refetchInterval: (query) => (query.state.data?.some(isPending) ? 5000 : false)
  });

  const rows = exportsQuery.data ?? [];
  const latest = rows[0];
  const preparing = rows.some(isPending);

  const request = useMutation({
    mutationFn: exportsApi.request,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.exports.all });
      showToast('Preparing your export. This usually takes a few seconds.', 'success');
    },
    onError: (error) => showDialog({ title: 'Could not start export', message: apiErrorMessage(error), tone: 'error' })
  });

  const download = async (row: DataExport) => {
    setDownloadingId(row.id);
    try {
      const { url, fileName } = await exportsApi.downloadUrl(row.id);
      await shareDataExport(url, fileName || row.fileName);
      await queryClient.invalidateQueries({ queryKey: queryKeys.exports.all });
    } catch (error) {
      showDialog({ title: 'Could not download export', message: apiErrorMessage(error), tone: 'error' });
    } finally {
      setDownloadingId(null);
    }
  };

  const renderRow = (row: DataExport) => {
    const meta = STATUS_META[row.status];
    const downloadable = row.status === 'completed' && !row.isExpired;

    return (
      <AppCard key={row.id}>
        <View style={styles.rowHeader}>
          <View style={styles.rowHeaderText}>
            <Text style={[styles.rowTitle, { color: theme.colors.onSurface }]}>{formatDateTime(row.requestedAt)}</Text>
            <Text style={[styles.rowSubtitle, { color: theme.colors.onSurfaceVariant }]}>
              {row.status === 'completed'
                ? [
                    formatSize(row.sizeBytes),
                    row.isExpired ? 'Link expired' : `Available until ${formatDate(row.expiresAt)}`,
                    // Only claimed when the send actually succeeded.
                    row.emailedAt ? 'Emailed to you' : ''
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : row.status === 'failed'
                  ? row.error || 'Something went wrong'
                  : 'Building your archive'}
            </Text>
          </View>
          <StatusPill label={row.isExpired && row.status === 'completed' ? 'Expired' : meta.label} tone={row.isExpired ? 'cancelled' : meta.tone} />
        </View>

        {downloadable ? (
          <Button
            mode="contained"
            icon="download"
            style={styles.downloadButton}
            loading={downloadingId === row.id}
            disabled={downloadingId === row.id}
            onPress={() => void download(row)}
          >
            Download
          </Button>
        ) : null}

        {row.status === 'completed' && row.isExpired ? (
          <Text style={[styles.expiredHint, { color: theme.colors.onSurfaceVariant }]}>
            Archives are deleted after 7 days. Request a new export to get a fresh copy.
          </Text>
        ) : null}
      </AppCard>
    );
  };

  return (
    <Screen title="Export my data" scroll>
      <AppCard>
        <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Everything, in one file</Text>
        <Text style={[styles.body, { color: theme.colors.onSurfaceVariant }]}>
          We build a ZIP containing your whole workspace as spreadsheets (CSV) you can open in Excel or
          Google Sheets, plus raw JSON if you are moving to another system.
        </Text>

        <View style={styles.list}>
          {INCLUDED.map((item) => (
            <View key={item.label} style={styles.listItem}>
              <View style={[styles.listIcon, { backgroundColor: alpha(colors.primary, isDark ? 0.22 : 0.12) }]}>
                <Feather name={item.icon} size={14} color={colors.primary} />
              </View>
              <Text style={[styles.listLabel, { color: theme.colors.onSurface }]}>{item.label}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.note, { color: theme.colors.onSurfaceVariant }]}>
          Invoice PDFs are not included — you can share any invoice as a PDF from its detail screen.
          Passwords and login details are never exported.
        </Text>

        <Button
          mode="contained"
          icon="database-export"
          style={styles.primaryButton}
          loading={request.isPending}
          disabled={request.isPending || preparing}
          onPress={() => request.mutate()}
        >
          {preparing ? 'Preparing export…' : latest ? 'Request a new export' : 'Export my data'}
        </Button>
        <Text style={[styles.note, { color: theme.colors.onSurfaceVariant }]}>
          You can request one export an hour. Download it here when it is ready — we will email you a
          link too, if email is set up for your account.
        </Text>
      </AppCard>

      <Text style={[styles.groupLabel, { color: theme.colors.onSurfaceVariant }]}>YOUR EXPORTS</Text>

      {exportsQuery.isLoading ? (
        <ActivityIndicator color={theme.colors.primary} style={styles.loader} />
      ) : rows.length ? (
        rows.map(renderRow)
      ) : (
        <EmptyState
          title="No exports yet"
          message="When you request an export it shows up here, ready to download."
          hint="Links stay valid for 7 days."
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { lineHeight: 20, marginBottom: 14 },
  downloadButton: { borderRadius: radii.input, marginTop: 14 },
  expiredHint: { fontSize: 12, marginTop: 10 },
  groupLabel: { ...fontStyles.semiBold, fontSize: 11, letterSpacing: 0.8, marginBottom: 10, marginTop: 6 },
  list: { gap: 10, marginBottom: 14 },
  listIcon: { alignItems: 'center', borderRadius: radii.pill, height: 26, justifyContent: 'center', width: 26 },
  listItem: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  listLabel: { flex: 1, fontSize: 13 },
  loader: { marginVertical: 24 },
  note: { fontSize: 12, lineHeight: 17, marginTop: 12 },
  primaryButton: { borderRadius: radii.input, marginTop: 16 },
  rowHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  rowHeaderText: { flex: 1 },
  rowSubtitle: { fontSize: 12, marginTop: 3 },
  rowTitle: { ...fontStyles.semiBold, fontSize: 14 },
  sectionTitle: { ...typeScale.sectionTitle, marginBottom: 8 }
});
