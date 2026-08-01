import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Text, useTheme } from 'react-native-paper';
import { documentsApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { useAppDialog } from '@/components/AppDialog';
import { useAppToast } from '@/components/AppToast';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { StatusPill } from '@/components/StatusPill';
import { DocumentsScreenProps } from '@/navigation/types';
import { PERMISSION, usePermissions } from '@/shared/hooks/usePermissions';
import { openOrSharePdf } from '@/services/pdf';
import { queryKeys } from '@/shared/query/queryKeys';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import { documentNumberOf, Invoice, SalesDocumentKind } from '@/types';
import { formatCurrency, formatDate } from '@/utils/format';

const KINDS: { key: SalesDocumentKind; label: string; empty: string; convertLabel?: string }[] = [
  { key: 'quotation', label: 'Quotations', empty: 'Quote a price before you bill it. Convert a quote to an invoice in one tap.', convertLabel: 'Convert to invoice' },
  { key: 'delivery_challan', label: 'Challans', empty: 'Send goods now and bill later. A challan moves stock without charging.', convertLabel: 'Convert to invoice' },
  { key: 'credit_note', label: 'Credit notes', empty: 'Credit a customer when goods come back. Raise one from the invoice itself.' }
];

// void = spent, i.e. already turned into an invoice. Worth its own wording so the row does
// not read as an error.
const statusMetaFor = (document: Invoice) => {
  if (document.documentStatus === 'cancelled') return { label: 'Cancelled', tone: 'cancelled' };
  if (document.documentStatus === 'void') return { label: 'Invoiced', tone: 'paid' };
  return { label: 'Open', tone: 'pending' };
};

export function DocumentsScreen({ navigation, route }: DocumentsScreenProps) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const queryClient = useQueryClient();
  const { showDialog } = useAppDialog();
  const { showToast } = useAppToast();
  const { can } = usePermissions();
  const canCreate = can(PERMISSION.invoicesCreate);
  const [kind, setKind] = useState<SalesDocumentKind>(route.params?.documentType ?? 'quotation');
  const [pendingCancel, setPendingCancel] = useState<Invoice | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);

  // Customers routinely forward a quotation for internal approval before ordering, so
  // sending it is a first-class action here — the PDF itself is watermarked and states
  // that it is not a tax invoice.
  const share = async (document: Invoice) => {
    setSharingId(document._id);
    try {
      await openOrSharePdf(document.pdfUrl, documentNumberOf(document));
    } catch (error) {
      showDialog({ title: 'Could not share', message: apiErrorMessage(error), tone: 'error' });
    } finally {
      setSharingId(null);
    }
  };

  const active = KINDS.find((item) => item.key === kind) ?? KINDS[0];

  const query = useQuery({
    queryKey: queryKeys.documents.list(kind),
    queryFn: () => documentsApi.list(kind)
  });
  const documents = query.data ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.documents.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.report.all });
  };

  const convert = useMutation({
    mutationFn: (id: string) => documentsApi.convert(kind, id),
    onSuccess: (invoice) => {
      invalidate();
      showToast(`Invoice ${documentNumberOf(invoice)} created`, 'success');
      navigation.navigate('InvoiceDetail', { id: invoice._id });
    },
    onError: (error) => showDialog({ title: 'Could not convert', message: apiErrorMessage(error), tone: 'error' })
  });

  const cancel = useMutation({
    mutationFn: (id: string) => documentsApi.cancel(kind, id),
    onSuccess: () => {
      setPendingCancel(null);
      invalidate();
      showToast('Cancelled', 'success');
    },
    onError: (error) => {
      setPendingCancel(null);
      showDialog({ title: 'Could not cancel', message: apiErrorMessage(error), tone: 'error' });
    }
  });

  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.08);
  const headerAction = canCreate ? (
    <Pressable
      onPress={() => navigation.navigate('InvoiceCreate', { documentType: kind })}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`New ${active.label.replace(/s$/, '').toLowerCase()}`}
      style={[styles.headerBtn, { backgroundColor: theme.colors.primary }]}
    >
      <Feather name="plus" size={18} color="#FFFFFF" strokeWidth={3} />
    </Pressable>
  ) : undefined;

  return (
    <Screen title="Documents" headerAction={headerAction} contentStyle={styles.screenContent}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
        {KINDS.map((item) => {
          const selected = item.key === kind;
          return (
            <Pressable
              key={item.key}
              onPress={() => setKind(item.key)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[
                styles.tabChip,
                { backgroundColor: selected ? theme.colors.primary : colors.card, borderColor: selected ? theme.colors.primary : cardBorder }
              ]}
            >
              <Text style={[styles.tabLabel, { color: selected ? '#FFFFFF' : theme.colors.onSurface }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {query.isLoading ? (
        <ActivityIndicator color={theme.colors.primary} style={styles.loader} />
      ) : documents.length ? (
        documents.map((document) => {
          const meta = statusMetaFor(document);
          const canConvert = Boolean(active.convertLabel) && document.documentStatus === 'issued';
          const canCancelRow = document.documentStatus === 'issued';
          const canShare = document.documentStatus !== 'cancelled' && Boolean(document.pdfUrl);
          return (
            <View key={document._id} style={[styles.card, { backgroundColor: colors.card, borderColor: cardBorder }]}>
              <View style={styles.cardHead}>
                <View style={styles.cardText}>
                  <Text style={[styles.cardNumber, { color: theme.colors.onSurface }]}>{documentNumberOf(document)}</Text>
                  <Text numberOfLines={1} style={[styles.cardMeta, { color: theme.colors.onSurfaceVariant }]}>
                    {document.customerSnapshot?.name} · {formatDate(document.date)}
                  </Text>
                </View>
                <View style={styles.cardRight}>
                  <Text style={[styles.cardAmount, { color: theme.colors.onSurface }]}>{formatCurrency(document.total)}</Text>
                  <StatusPill label={meta.label} tone={meta.tone} />
                </View>
              </View>

              {canConvert || canCancelRow || canShare ? (
                <View style={[styles.actionRow, { borderTopColor: cardBorder }]}>
                  {canShare ? (
                    <Pressable
                      onPress={() => void share(document)}
                      disabled={sharingId === document._id}
                      accessibilityRole="button"
                      accessibilityLabel={`Send ${documentNumberOf(document)}`}
                      style={styles.action}
                    >
                      <Feather name="send" size={14} color={theme.colors.primary} />
                      <Text style={[styles.actionLabel, { color: theme.colors.primary }]}>
                        {sharingId === document._id ? 'Preparing…' : 'Send'}
                      </Text>
                    </Pressable>
                  ) : null}
                  {canConvert && canCreate ? (
                    <Pressable
                      onPress={() => convert.mutate(document._id)}
                      disabled={convert.isPending}
                      accessibilityRole="button"
                      style={styles.action}
                    >
                      <Feather name="file-text" size={14} color={theme.colors.primary} />
                      <Text style={[styles.actionLabel, { color: theme.colors.primary }]}>{active.convertLabel}</Text>
                    </Pressable>
                  ) : null}
                  {canCancelRow ? (
                    <Pressable
                      onPress={() => setPendingCancel(document)}
                      accessibilityRole="button"
                      style={styles.action}
                    >
                      <Feather name="x-circle" size={14} color={colors.destructive} />
                      <Text style={[styles.actionLabel, { color: colors.destructive }]}>Cancel</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })
      ) : (
        <EmptyState
          title={`No ${active.label.toLowerCase()} yet`}
          message={active.empty}
          actionLabel={canCreate && kind !== 'credit_note' ? `New ${active.label.replace(/s$/, '').toLowerCase()}` : undefined}
          onAction={canCreate && kind !== 'credit_note' ? () => navigation.navigate('InvoiceCreate', { documentType: kind }) : undefined}
        />
      )}

      <ConfirmDialog
        visible={Boolean(pendingCancel)}
        title="Cancel this document?"
        message={
          kind === 'delivery_challan'
            ? 'Stock sent on this challan goes back into inventory.'
            : kind === 'credit_note'
              ? 'The credit is withdrawn and the customer owes the amount again.'
              : 'The quotation can no longer be converted to an invoice.'
        }
        confirmLabel="Cancel document"
        onConfirm={() => pendingCancel && cancel.mutate(pendingCancel._id)}
        onCancel={() => setPendingCancel(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  action: { alignItems: 'center', flexDirection: 'row', gap: 6, paddingVertical: 4 },
  actionLabel: { ...fontStyles.semiBold, fontSize: 13 },
  actionRow: { borderTopWidth: 1, flexDirection: 'row', gap: 20, marginTop: 12, paddingTop: 10 },
  card: { borderRadius: radii.lg, borderWidth: 1, marginBottom: 10, padding: 14 },
  cardAmount: { ...fontStyles.bold, fontSize: 15 },
  cardHead: { flexDirection: 'row', gap: 12 },
  cardMeta: { ...typeScale.caption, fontSize: 12, marginTop: 2 },
  cardNumber: { ...fontStyles.bold, fontSize: 15 },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  cardText: { flex: 1, minWidth: 0 },
  headerBtn: { alignItems: 'center', borderRadius: radii.md, height: 40, justifyContent: 'center', width: 40 },
  loader: { marginVertical: 24 },
  screenContent: { paddingTop: 8 },
  tabChip: { borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  tabLabel: { ...fontStyles.semiBold, fontSize: 13 },
  tabRow: { gap: 8, paddingBottom: 14, paddingRight: 4 }
});
