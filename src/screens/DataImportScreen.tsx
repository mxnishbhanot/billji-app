import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { ActivityIndicator, Button, Text, useTheme } from 'react-native-paper';
import { apiErrorMessage } from '@/api/client';
import { importsApi } from '@/api/endpoints';
import { AppCard } from '@/components/AppCard';
import { useAppDialog } from '@/components/AppDialog';
import { useAppToast } from '@/components/AppToast';
import { Screen } from '@/components/Screen';
import { PERMISSION, usePermissions } from '@/shared/hooks/usePermissions';
import { queryKeys } from '@/shared/query/queryKeys';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import { ImportPreview, ImportRowStatus, ImportType } from '@/types';

const TYPE_META: { type: ImportType; label: string; icon: 'users' | 'package'; permission: string }[] = [
  { type: 'customers', label: 'Customers', icon: 'users', permission: PERMISSION.customersManage },
  { type: 'products', label: 'Products', icon: 'package', permission: PERMISSION.productsManage }
];

const STATUS_META: Record<ImportRowStatus, { label: string; tone: 'good' | 'warn' | 'bad' }> = {
  create: { label: 'New', tone: 'good' },
  update: { label: 'Already exists', tone: 'warn' },
  duplicate: { label: 'Repeated in file', tone: 'warn' },
  error: { label: 'Needs fixing', tone: 'bad' }
};

export function DataImportScreen() {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const queryClient = useQueryClient();
  const { showDialog } = useAppDialog();
  const { showToast } = useAppToast();
  const { can } = usePermissions();

  const [type, setType] = useState<ImportType>('customers');
  const [fileName, setFileName] = useState('');
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<'skip' | 'update'>('skip');
  const [editingField, setEditingField] = useState<string | null>(null);

  const reset = () => {
    setFileName('');
    setCsv('');
    setPreview(null);
    setColumnMap({});
    setEditingField(null);
  };

  const analyse = useMutation({
    mutationFn: (input: { csv: string; map?: Record<string, string> }) =>
      importsApi.preview({ type, csv: input.csv, columnMap: input.map }),
    onSuccess: (result) => {
      setPreview(result);
      setColumnMap(result.columnMap);
    },
    // A missing required column is expected, not exceptional: keep the file loaded so the
    // user can map it by hand instead of picking it again.
    onError: (error) => showDialog({ title: 'Check the columns', message: apiErrorMessage(error), tone: 'error' })
  });

  const run = useMutation({
    mutationFn: () => importsApi.commit({ type, csv, columnMap, mode }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: type === 'customers' ? queryKeys.customers.all : queryKeys.products.all });
      reset();
      const summary = [
        `${result.created} added`,
        result.updated ? `${result.updated} updated` : '',
        result.skipped ? `${result.skipped} skipped` : '',
        result.failed ? `${result.failed} could not be read` : ''
      ]
        .filter(Boolean)
        .join(' · ');

      // Rows we could not read are worth stopping on; a clean import is just a toast.
      if (result.failed) showDialog({ title: 'Imported with some rows skipped', message: summary, tone: 'warning' });
      else showToast(summary, 'success');
    },
    onError: (error) => showDialog({ title: 'Could not import', message: apiErrorMessage(error), tone: 'error' })
  });

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      // Some Android file providers report a CSV as text/plain or octet-stream, so accept
      // anything and let the parser be the judge.
      type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel', '*/*'],
      copyToCacheDirectory: true
    });
    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    if (/\.xlsx?$/i.test(asset.name)) {
      showDialog({
        title: 'Save it as CSV first',
        message: 'Open the file in Excel or Google Sheets and choose File → Save as → CSV, then pick that file here.',
        tone: 'error'
      });
      return;
    }

    try {
      const contents = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
      setFileName(asset.name);
      setCsv(contents);
      setPreview(null);
      setColumnMap({});
      analyse.mutate({ csv: contents });
    } catch (error) {
      showDialog({ title: 'Could not read that file', message: apiErrorMessage(error), tone: 'error' });
    }
  };

  const setMapping = (field: string, header: string | null) => {
    const next = { ...columnMap };
    if (header) {
      // A header can only feed one field, so taking it releases it elsewhere.
      for (const key of Object.keys(next)) if (next[key] === header) delete next[key];
      next[field] = header;
    } else {
      delete next[field];
    }
    setEditingField(null);
    setColumnMap(next);
    analyse.mutate({ csv, map: next });
  };

  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.08);
  const toneColor = { good: colors.accent, warn: colors.warning, bad: colors.destructive };
  const allowed = TYPE_META.filter((meta) => can(meta.permission));
  const canImport = Boolean(preview && csv && (preview.counts.create > 0 || (mode === 'update' && preview.counts.update > 0)));

  if (!allowed.length) {
    return (
      <Screen title="Import data" scroll>
        <AppCard>
          <Text style={{ color: theme.colors.onSurfaceVariant }}>
            You need permission to manage customers or products before you can import them.
          </Text>
        </AppCard>
      </Screen>
    );
  }

  return (
    <Screen title="Import data" scroll>
      <AppCard>
        <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Bring your list across</Text>
        <Text style={[styles.body, { color: theme.colors.onSurfaceVariant }]}>
          Coming from Vyapar, Tally or a spreadsheet? Export your list, save it as CSV, and pick it below.
          We show you exactly what will happen before anything is written.
        </Text>

        <View style={styles.chipRow}>
          {allowed.map((meta) => {
            const active = meta.type === type;
            return (
              <Pressable
                key={meta.type}
                onPress={() => {
                  setType(meta.type);
                  reset();
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.typeChip, { backgroundColor: active ? theme.colors.primary : 'transparent', borderColor: active ? theme.colors.primary : cardBorder }]}
              >
                <Feather name={meta.icon} size={14} color={active ? '#FFFFFF' : theme.colors.onSurfaceVariant} />
                <Text style={[styles.typeChipLabel, { color: active ? '#FFFFFF' : theme.colors.onSurface }]}>{meta.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Button mode="contained" icon="file-upload-outline" style={styles.primaryButton} onPress={() => void pickFile()}>
          {fileName ? 'Choose a different file' : 'Choose CSV file'}
        </Button>
        {fileName ? <Text style={[styles.note, { color: theme.colors.onSurfaceVariant }]}>{fileName}</Text> : null}
      </AppCard>

      {analyse.isPending ? <ActivityIndicator color={theme.colors.primary} style={styles.loader} /> : null}

      {preview ? (
        <>
          <AppCard>
            <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Columns</Text>
            <Text style={[styles.body, { color: theme.colors.onSurfaceVariant }]}>
              We matched your headings to our fields. Tap one to change it.
            </Text>

            {preview.fields.map((field) => {
              const mapped = columnMap[field.name];
              const open = editingField === field.name;
              return (
                <View key={field.name}>
                  <Pressable
                    onPress={() => setEditingField(open ? null : field.name)}
                    accessibilityRole="button"
                    style={[styles.mapRow, { borderColor: cardBorder }]}
                  >
                    <Text style={[styles.mapField, { color: theme.colors.onSurface }]}>
                      {field.label}
                      {field.required ? <Text style={{ color: colors.destructive }}> *</Text> : null}
                    </Text>
                    <Text style={[styles.mapHeader, { color: mapped ? theme.colors.primary : theme.colors.onSurfaceVariant }]} numberOfLines={1}>
                      {mapped || 'Not imported'}
                    </Text>
                    <Feather name={open ? 'chevron-up' : 'chevron-down'} size={14} color={theme.colors.onSurfaceVariant} />
                  </Pressable>

                  {open ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.headerRow}>
                      {!field.required ? (
                        <Pressable onPress={() => setMapping(field.name, null)} style={[styles.headerChip, { borderColor: cardBorder }]}>
                          <Text style={[styles.headerChipLabel, { color: theme.colors.onSurfaceVariant }]}>Skip</Text>
                        </Pressable>
                      ) : null}
                      {preview.headers.filter(Boolean).map((header) => (
                        <Pressable
                          key={header}
                          onPress={() => setMapping(field.name, header)}
                          style={[styles.headerChip, { borderColor: header === mapped ? theme.colors.primary : cardBorder }]}
                        >
                          <Text style={[styles.headerChipLabel, { color: header === mapped ? theme.colors.primary : theme.colors.onSurface }]}>{header}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  ) : null}
                </View>
              );
            })}
          </AppCard>

          <AppCard>
            <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
              {preview.total} row{preview.total === 1 ? '' : 's'} in this file
            </Text>

            <View style={styles.countRow}>
              {(Object.keys(STATUS_META) as ImportRowStatus[])
                .filter((status) => preview.counts[status] > 0)
                .map((status) => (
                  <View key={status} style={[styles.countChip, { backgroundColor: alpha(toneColor[STATUS_META[status].tone], isDark ? 0.2 : 0.1) }]}>
                    <Text style={[styles.countValue, { color: toneColor[STATUS_META[status].tone] }]}>{preview.counts[status]}</Text>
                    <Text style={[styles.countLabel, { color: theme.colors.onSurfaceVariant }]}>{STATUS_META[status].label}</Text>
                  </View>
                ))}
            </View>

            {preview.counts.update ? (
              <>
                <Text style={[styles.body, { color: theme.colors.onSurfaceVariant }]}>
                  {preview.counts.update} row{preview.counts.update === 1 ? '' : 's'} match a record you already have
                  (same {preview.duplicateLabel}). What should we do with them?
                </Text>
                <View style={styles.chipRow}>
                  {(['skip', 'update'] as const).map((option) => {
                    const active = option === mode;
                    return (
                      <Pressable
                        key={option}
                        onPress={() => setMode(option)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        style={[styles.typeChip, { backgroundColor: active ? theme.colors.primary : 'transparent', borderColor: active ? theme.colors.primary : cardBorder }]}
                      >
                        <Text style={[styles.typeChipLabel, { color: active ? '#FFFFFF' : theme.colors.onSurface }]}>
                          {option === 'skip' ? 'Leave mine alone' : 'Update mine'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            {preview.preview.map((row) => (
              <View key={row.line} style={[styles.rowLine, { borderColor: cardBorder }]}>
                <Text style={[styles.rowLineNumber, { color: theme.colors.onSurfaceVariant }]}>{row.line}</Text>
                <View style={styles.rowLineText}>
                  <Text numberOfLines={1} style={[styles.rowLineLabel, { color: theme.colors.onSurface }]}>
                    {row.label || '(no name)'}
                  </Text>
                  {row.errors.length ? (
                    <Text style={[styles.rowLineError, { color: colors.destructive }]}>{row.errors.join(' · ')}</Text>
                  ) : row.duplicateOfLine ? (
                    <Text style={[styles.rowLineError, { color: colors.warning }]}>Same as row {row.duplicateOfLine}</Text>
                  ) : null}
                </View>
                <Text style={[styles.rowLineStatus, { color: toneColor[STATUS_META[row.status].tone] }]}>{STATUS_META[row.status].label}</Text>
              </View>
            ))}
            {preview.total > preview.preview.length ? (
              <Text style={[styles.note, { color: theme.colors.onSurfaceVariant }]}>
                Showing the first {preview.preview.length} rows. All {preview.total} will be processed.
              </Text>
            ) : null}

            <Button
              mode="contained"
              icon="database-import-outline"
              style={styles.primaryButton}
              loading={run.isPending}
              disabled={run.isPending || !canImport}
              onPress={() => run.mutate()}
            >
              {canImport ? 'Import now' : 'Nothing to import'}
            </Button>
            {preview.counts.error ? (
              <Text style={[styles.note, { color: theme.colors.onSurfaceVariant }]}>
                Rows that need fixing are skipped — the rest still import. Fix them in your file and run it again.
              </Text>
            ) : null}
          </AppCard>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { lineHeight: 20, marginBottom: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  countChip: { borderRadius: radii.md, flexGrow: 1, minWidth: '30%', paddingHorizontal: 12, paddingVertical: 10 },
  countLabel: { ...typeScale.caption, fontSize: 11 },
  countRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  countValue: { ...fontStyles.bold, fontSize: 18 },
  headerChip: { borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  headerChipLabel: { ...fontStyles.semiBold, fontSize: 12 },
  headerRow: { gap: 8, paddingBottom: 10, paddingRight: 4 },
  loader: { marginVertical: 20 },
  mapField: { ...fontStyles.semiBold, fontSize: 13, width: '38%' },
  mapHeader: { flex: 1, fontSize: 13, textAlign: 'right' },
  mapRow: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', gap: 10, paddingVertical: 12 },
  note: { fontSize: 12, lineHeight: 17, marginTop: 10 },
  primaryButton: { borderRadius: radii.input, marginTop: 12 },
  rowLine: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', gap: 10, paddingVertical: 10 },
  rowLineError: { fontSize: 11, marginTop: 2 },
  rowLineLabel: { ...fontStyles.semiBold, fontSize: 13 },
  rowLineNumber: { ...typeScale.caption, fontSize: 11, width: 24 },
  rowLineStatus: { ...fontStyles.semiBold, fontSize: 11 },
  rowLineText: { flex: 1, minWidth: 0 },
  sectionTitle: { ...typeScale.sectionTitle, marginBottom: 8 },
  typeChip: { alignItems: 'center', borderRadius: radii.pill, borderWidth: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingVertical: 8 },
  typeChipLabel: { ...fontStyles.semiBold, fontSize: 12 }
});
