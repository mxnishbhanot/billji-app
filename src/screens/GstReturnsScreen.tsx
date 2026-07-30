import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Text, useTheme } from 'react-native-paper';
import { gstApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { useAppDialog } from '@/components/AppDialog';
import { useAppToast } from '@/components/AppToast';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { shareTextFile } from '@/services/download';
import { recentPeriods } from './GstReturnsScreen.periods';
import { queryKeys } from '@/shared/query/queryKeys';
import { useAuthStore } from '@/store/authStore';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import { Gstr1SectionKey } from '@/types';
import { formatCurrency } from '@/utils/format';

const SECTIONS: { key: Gstr1SectionKey; label: string; hint: string }[] = [
  { key: 'b2b', label: 'B2B', hint: 'Sales to GST-registered buyers' },
  { key: 'b2cl', label: 'B2CL', hint: 'Large out-of-state consumer sales' },
  { key: 'b2cs', label: 'B2CS', hint: 'All other consumer sales, totalled' },
  { key: 'hsn', label: 'HSN', hint: 'Everything sold, grouped by HSN code' }
];

export function GstReturnsScreen() {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const { showDialog } = useAppDialog();
  const { showToast } = useAppToast();
  const gstNumber = useAuthStore((state) => state.user?.businessProfile?.gstNumber) || '';
  // Computed once per mount: the list is derived from the clock, and re-deriving it mid
  // session would shuffle chips under the user's finger at midnight on the 1st.
  const periods = useMemo(() => recentPeriods(), []);
  const [period, setPeriod] = useState(periods[0].value);
  const [downloading, setDownloading] = useState<string | null>(null);

  const query = useQuery({
    queryKey: queryKeys.gst.gstr1(period),
    queryFn: () => gstApi.gstr1(period)
  });
  const report = query.data;

  const download = async (key: Gstr1SectionKey | 'gstr3b') => {
    if (downloading) return;
    setDownloading(key);
    try {
      const csv = key === 'gstr3b' ? await gstApi.gstr3bCsv(period) : await gstApi.sectionCsv(period, key);
      const name = key === 'gstr3b' ? `GSTR3B-${period}` : `GSTR1-${period}-${key}`;
      await shareTextFile(csv, `${name}.csv`, { mimeType: 'text/csv', uti: 'public.comma-separated-values-text', dialogTitle: name });
      showToast(`${name} ready to share`, 'success');
    } catch (error) {
      showDialog({ title: 'Could not prepare the file', message: apiErrorMessage(error), tone: 'error' });
    } finally {
      setDownloading(null);
    }
  };

  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.08);
  const activePeriodLabel = periods.find((item) => item.value === period)?.label || period;

  return (
    <Screen title="GST returns" contentStyle={styles.screenContent}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periodRow}>
        {periods.map((item) => {
          const active = item.value === period;
          return (
            <Pressable
              key={item.value}
              onPress={() => setPeriod(item.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[
                styles.periodChip,
                {
                  backgroundColor: active ? theme.colors.primary : colors.card,
                  borderColor: active ? theme.colors.primary : cardBorder
                }
              ]}
            >
              <Text style={[styles.periodLabel, { color: active ? '#FFFFFF' : theme.colors.onSurface }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {!gstNumber ? (
        <View style={[styles.notice, { backgroundColor: alpha(colors.warning, isDark ? 0.16 : 0.08), borderColor: alpha(colors.warning, 0.3) }]}>
          <MaterialCommunityIcons name="alert-outline" size={18} color={colors.warning} />
          <Text style={[styles.noticeText, { color: theme.colors.onSurface }]}>
            No GSTIN saved. Add it in Business Profile before filing — the return needs it.
          </Text>
        </View>
      ) : null}

      {query.isLoading ? (
        <ActivityIndicator color={theme.colors.primary} style={styles.loader} />
      ) : !report ? (
        <EmptyState title="Could not load the return" message={apiErrorMessage(query.error)} actionLabel="Retry" onAction={() => void query.refetch()} />
      ) : report.totals.invoiceCount === 0 ? (
        <EmptyState title={`No sales in ${activePeriodLabel}`} message="Nothing to file for this month. Pick another period above." />
      ) : (
        <>
          <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: cardBorder }]}>
            <Text style={[styles.summaryTitle, { color: theme.colors.onSurface }]}>{activePeriodLabel}</Text>
            <View style={styles.summaryGrid}>
              {[
                { label: 'Taxable value', value: formatCurrency(report.totals.taxableValue) },
                { label: 'Total tax', value: formatCurrency(report.totals.taxAmount) },
                { label: 'CGST', value: formatCurrency(report.totals.cgst) },
                { label: 'SGST', value: formatCurrency(report.totals.sgst) },
                { label: 'IGST', value: formatCurrency(report.totals.igst) },
                { label: 'Invoices', value: String(report.totals.invoiceCount) }
              ].map((cell) => (
                <View key={cell.label} style={styles.summaryCell}>
                  <Text style={[styles.summaryCellLabel, { color: theme.colors.onSurfaceVariant }]}>{cell.label.toUpperCase()}</Text>
                  <Text style={[styles.summaryCellValue, { color: theme.colors.onSurface }]}>{cell.value}</Text>
                </View>
              ))}
            </View>
            {report.totals.cancelledCount ? (
              <Text style={[styles.footnote, { color: theme.colors.onSurfaceVariant }]}>
                {report.totals.cancelledCount} cancelled invoice{report.totals.cancelledCount === 1 ? '' : 's'} excluded from the totals.
              </Text>
            ) : null}
          </View>

          {report.reconstructedInvoices ? (
            <View style={[styles.notice, { backgroundColor: alpha(colors.warning, isDark ? 0.16 : 0.08), borderColor: alpha(colors.warning, 0.3) }]}>
              <MaterialCommunityIcons name="information-outline" size={18} color={colors.warning} />
              <Text style={[styles.noticeText, { color: theme.colors.onSurface }]}>
                {report.reconstructedInvoices} invoice{report.reconstructedInvoices === 1 ? '' : 's'} predate per-item GST, so the CGST/SGST
                split was worked out from a single rate. Check those before filing.
              </Text>
            </View>
          ) : null}

          <Text style={[styles.sectionHeading, { color: theme.colors.onSurfaceVariant }]}>GSTR-1 SECTIONS</Text>
          {SECTIONS.map((section) => {
            const count = report.counts[section.key];
            const isBusy = downloading === section.key;
            return (
              <Pressable
                key={section.key}
                onPress={() => void download(section.key)}
                disabled={!count || Boolean(downloading)}
                accessibilityRole="button"
                accessibilityLabel={`Download ${section.label} as CSV`}
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: colors.card, borderColor: cardBorder, opacity: !count ? 0.55 : pressed ? 0.9 : 1 }
                ]}
              >
                <View style={[styles.rowBadge, { backgroundColor: alpha(theme.colors.primary, isDark ? 0.22 : 0.12) }]}>
                  <Text style={[styles.rowBadgeText, { color: theme.colors.primary }]}>{section.label}</Text>
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, { color: theme.colors.onSurface }]}>
                    {count} {count === 1 ? 'row' : 'rows'}
                  </Text>
                  <Text numberOfLines={2} style={[styles.rowHint, { color: theme.colors.onSurfaceVariant }]}>{section.hint}</Text>
                </View>
                {isBusy ? <ActivityIndicator size={18} color={theme.colors.primary} /> : <Feather name="download" size={18} color={count ? theme.colors.primary : theme.colors.onSurfaceVariant} />}
              </Pressable>
            );
          })}

          <Text style={[styles.sectionHeading, { color: theme.colors.onSurfaceVariant }]}>GSTR-3B</Text>
          <Pressable
            onPress={() => void download('gstr3b')}
            disabled={Boolean(downloading)}
            accessibilityRole="button"
            accessibilityLabel="Download GSTR-3B summary as CSV"
            style={({ pressed }) => [styles.row, { backgroundColor: colors.card, borderColor: cardBorder, opacity: pressed ? 0.9 : 1 }]}
          >
            <View style={[styles.rowBadge, { backgroundColor: alpha(colors.accent, isDark ? 0.22 : 0.12) }]}>
              <Text style={[styles.rowBadgeText, { color: colors.accent }]}>3B</Text>
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: theme.colors.onSurface }]}>Outward supplies summary</Text>
              <Text style={[styles.rowHint, { color: theme.colors.onSurfaceVariant }]}>One line per tax head for table 3.1(a)</Text>
            </View>
            {downloading === 'gstr3b' ? <ActivityIndicator size={18} color={theme.colors.primary} /> : <Feather name="download" size={18} color={theme.colors.primary} />}
          </Pressable>

          <Text style={[styles.footnote, { color: theme.colors.onSurfaceVariant }]}>
            Each file opens in your share sheet — send it to your accountant or save it to Drive.
          </Text>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  footnote: { ...typeScale.caption, fontSize: 12, marginTop: 10, textAlign: 'center' },
  loader: { marginVertical: 24 },
  notice: { alignItems: 'flex-start', borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', gap: 10, marginBottom: 14, padding: 12 },
  noticeText: { ...typeScale.caption, flex: 1, fontSize: 12, lineHeight: 17 },
  periodChip: { borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  periodLabel: { ...fontStyles.semiBold, fontSize: 12 },
  periodRow: { gap: 8, paddingBottom: 14, paddingRight: 4 },
  row: { alignItems: 'center', borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', gap: 12, marginBottom: 10, padding: 14 },
  rowBadge: { alignItems: 'center', borderRadius: radii.md, height: 38, justifyContent: 'center', minWidth: 48, paddingHorizontal: 6 },
  rowBadgeText: { ...fontStyles.bold, fontSize: 12 },
  rowHint: { ...typeScale.caption, fontSize: 12, marginTop: 2 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { ...fontStyles.bold, fontSize: 14 },
  screenContent: { paddingTop: 8 },
  sectionHeading: { ...fontStyles.bold, fontSize: 11, letterSpacing: 1.1, marginBottom: 8, marginTop: 6 },
  summaryCard: { borderRadius: radii.lg, borderWidth: 1, marginBottom: 14, padding: 16 },
  summaryCell: { minWidth: '30%' },
  summaryCellLabel: { ...fontStyles.bold, fontSize: 9, letterSpacing: 0.8 },
  summaryCellValue: { ...fontStyles.bold, fontSize: 15, marginTop: 3 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 12 },
  summaryTitle: { ...fontStyles.bold, fontSize: 16 }
});
