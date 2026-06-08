import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Text, useTheme } from 'react-native-paper';
import { draftsApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { useAppDialog } from '@/components/AppDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { StatusPill } from '@/components/StatusPill';
import { DraftsScreenProps } from '@/navigation/types';
import { queryKeys } from '@/shared/query/queryKeys';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import { DraftDocument, InvoiceDraftPayload } from '@/types';
import { calculateClientTotals, formatCurrency, formatDate } from '@/utils/format';

type InvoiceDraft = DraftDocument<InvoiceDraftPayload>;

const draftTotal = (payload: InvoiceDraftPayload) =>
  calculateClientTotals({
    items: payload.items || [],
    taxRate: Number(payload.taxRate || 0),
    discountType: payload.discountType,
    discountValue: Number(payload.discountValue || 0)
  }).total;

export function DraftsScreen({ navigation }: DraftsScreenProps) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = useMemo(() => appColors(isDark), [isDark]);
  const queryClient = useQueryClient();
  const { showDialog } = useAppDialog();
  const [deleting, setDeleting] = useState<InvoiceDraft | null>(null);
  const query = useQuery({ queryKey: queryKeys.drafts.all, queryFn: () => draftsApi.list('invoice') });
  const drafts = useMemo(() => query.data ?? [], [query.data]);
  const remove = useMutation({
    mutationFn: (localDraftId: string) => draftsApi.remove(localDraftId),
    onSuccess: () => { setDeleting(null); queryClient.invalidateQueries({ queryKey: queryKeys.drafts.all }); },
    onError: (error) => showDialog({ title: 'Could not discard draft', message: apiErrorMessage(error), tone: 'error' })
  });

  const renderRow = useCallback(({ item }: { item: InvoiceDraft }) => {
    const customerName = item.payload?.selectedCustomer?.name || 'No customer yet';
    const itemCount = item.payload?.items?.length || 0;
    return (
      <Pressable
        onPress={() => navigation.navigate('InvoiceCreate')}
        style={({ pressed }) => [styles.card, { backgroundColor: colors.card, borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08), shadowColor: isDark ? '#000000' : colors.primaryStrong, opacity: pressed ? 0.94 : 1 }]}
      >
        <View style={styles.cardTop}>
          <View style={styles.flex1}>
            <Text numberOfLines={1} style={[styles.title, { color: theme.colors.onSurface }]}>{customerName}</Text>
            <Text numberOfLines={1} style={[styles.meta, { color: theme.colors.onSurfaceVariant }]}>
              {itemCount} item{itemCount === 1 ? '' : 's'}  ·  Edited {formatDate(item.lastEditedAt)}
            </Text>
          </View>
          <Text style={[styles.amount, { color: theme.colors.onSurface }]}>{formatCurrency(draftTotal(item.payload))}</Text>
        </View>
        <View style={[styles.cardDivider, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.06) }]} />
        <View style={styles.cardBottom}>
          <StatusPill label={item.dirty ? 'Unsynced' : 'Synced'} tone={item.dirty ? 'pending' : 'synced'} />
          <Pressable onPress={() => setDeleting(item)} hitSlop={8} style={[styles.discardBtn, { backgroundColor: alpha(colors.destructive, isDark ? 0.16 : 0.08) }]}>
            <Feather name="trash-2" size={14} color={theme.colors.error} />
            <Text style={[styles.discardText, { color: theme.colors.error }]}>Discard</Text>
          </Pressable>
        </View>
      </Pressable>
    );
  }, [navigation, colors, isDark, theme]);

  return (
    <Screen title="Drafts" scroll={false} contentStyle={styles.screenContent}>
      {drafts.length ? (
        <View style={[styles.noteCard, { backgroundColor: alpha(colors.primary, isDark ? 0.14 : 0.07), borderColor: alpha(colors.primary, isDark ? 0.24 : 0.14) }]}>
          <Feather name="info" size={14} color={theme.colors.primary} />
          <Text style={[styles.noteText, { color: theme.colors.onSurface }]}>Opening the invoice builder restores your most recent draft.</Text>
        </View>
      ) : null}
      <FlatList
        data={drafts}
        keyExtractor={(item) => item.localDraftId}
        style={styles.list}
        contentContainerStyle={[styles.listContent, !drafts.length && styles.emptyListContent]}
        showsVerticalScrollIndicator={false}
        refreshing={query.isRefetching}
        onRefresh={() => query.refetch()}
        ListEmptyComponent={query.isLoading ? <ActivityIndicator color={theme.colors.primary} style={styles.emptyLoader} /> : <EmptyState title="No saved drafts" message="Unfinished invoices are saved here automatically while you build them." />}
        renderItem={renderRow}
      />
      <ConfirmDialog
        visible={Boolean(deleting)}
        title="Discard draft?"
        message="This permanently removes the saved draft. This cannot be undone."
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.localDraftId)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  amount: { ...fontStyles.bold, fontSize: 16, letterSpacing: -0.3 },
  card: { borderRadius: radii.lg, borderWidth: 1, elevation: 2, marginBottom: 12, padding: 16, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 16 },
  cardBottom: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  cardDivider: { height: 1, marginBottom: 12, marginTop: 14 },
  cardTop: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  discardBtn: { alignItems: 'center', borderRadius: radii.pill, flexDirection: 'row', gap: 5, paddingHorizontal: 12, paddingVertical: 6 },
  discardText: { ...fontStyles.semiBold, fontSize: 12 },
  emptyListContent: { flexGrow: 1 },
  emptyLoader: { marginTop: 40 },
  flex1: { flex: 1, minWidth: 0 },
  list: { flex: 1 },
  listContent: { paddingBottom: 24 },
  meta: { ...typeScale.caption, fontSize: 12, marginTop: 2 },
  noteCard: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: 8, marginBottom: 14, paddingHorizontal: 12, paddingVertical: 10 },
  noteText: { ...typeScale.caption, flex: 1, fontSize: 12 },
  screenContent: { flex: 1 },
  title: { ...fontStyles.bold, fontSize: 15 }
});
