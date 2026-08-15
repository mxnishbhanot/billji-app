import { useCallback, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput as RNTextInput, View, type TextStyle } from 'react-native';
import {
  Ban,
  CalendarClock,
  CalendarX2,
  ClipboardList,
  FileCheck,
  FileText,
  Package,
  Plus,
  Search,
  Send,
  Truck,
  Undo2,
  X,
  XCircle
} from 'lucide-react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Text, useTheme } from 'react-native-paper';
import { documentsApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { useAppDialog } from '@/components/AppDialog';
import { useAppToast } from '@/components/AppToast';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { DOCUMENT_COPY } from '@/features/documents/documentCopy';
import {
  DocumentCardAction,
  DocumentListCard,
  DocumentListSkeleton
} from '@/features/documents/components/DocumentListCard';
import { LucideGlyph } from '@/features/documents/components/DocumentShareActions';
import { DocumentLifecycle, documentLifecycle } from '@/features/documents/lifecycle';
import { DocumentsScreenProps } from '@/navigation/types';
import { PERMISSION, usePermissions } from '@/shared/hooks/usePermissions';
import { openOrSharePdf } from '@/services/pdf';
import { queryKeys } from '@/shared/query/queryKeys';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import { documentNumberOf, Invoice, SalesDocumentKind } from '@/types';
import { formatCurrency, formatDate } from '@/utils/format';

/**
 * The three non-invoice sales documents, in one list.
 *
 * They share a card shape but not a meaning: a quotation is an offer whose price expires, a
 * challan is goods that already left the shelf, a credit note is money given back. What each
 * one puts on its context line, what its status word is and which action it invites are all
 * decided here, per type — DocumentListCard itself never asks which type it is rendering.
 *
 * Everything the screen can do is what the API already supports: list, convert, cancel,
 * share. There is no filter or sort UI because the endpoint offers neither beyond its fixed
 * newest-first order.
 */

/** A quote stays valid for the whole of its last day, so compare against the day boundary. */
const isExpiredOn = (validUntil?: string | null) => {
  if (!validUntil) return false;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return new Date(validUntil).getTime() < startOfToday.getTime();
};

const unitsOf = (document: Invoice) => document.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
const countLabel = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

type Context = { icon: LucideGlyph; text: string; muted?: boolean };
type KindUi = {
  key: SalesDocumentKind;
  /** Tab label and the word the empty state / create action is built from. */
  label: string;
  singular: string;
  icon: LucideGlyph;
  emptyMessage: string;
  /** Absent for credit notes: the server converts nothing from them. */
  convertLabel?: string;
  status: (document: Invoice, lifecycle: DocumentLifecycle) => { label: string; tone: string };
  context: (document: Invoice, lifecycle: DocumentLifecycle) => Context;
};

const KINDS: KindUi[] = [
  {
    key: 'quotation',
    label: 'Quotations',
    singular: 'quotation',
    icon: ClipboardList,
    emptyMessage: 'Quote a price before you bill it. Convert a quote to an invoice in one tap.',
    convertLabel: 'Convert to invoice',
    // An offer's status is about whether the price still stands, so an open quote past its
    // date reads "Expired" — informational only, the server still allows conversion.
    status: (document, lifecycle) =>
      lifecycle === 'cancelled'
        ? { label: 'Cancelled', tone: 'cancelled' }
        : lifecycle === 'invoiced'
          ? { label: 'Invoiced', tone: 'paid' }
          : isExpiredOn(document.validUntil)
            ? { label: 'Expired', tone: 'expired' }
            : { label: 'Open', tone: 'pending' },
    context: (document, lifecycle) => {
      if (lifecycle === 'cancelled') return { icon: Ban, text: 'Cancelled · can no longer be invoiced', muted: true };
      if (lifecycle === 'invoiced') return { icon: FileCheck, text: 'Already converted to an invoice', muted: true };
      if (!document.validUntil) return { icon: CalendarClock, text: 'No expiry date · this price holds until you withdraw it' };
      return isExpiredOn(document.validUntil)
        ? { icon: CalendarX2, text: `Expired on ${formatDate(document.validUntil)}` }
        : { icon: CalendarClock, text: `Valid until ${formatDate(document.validUntil)}` };
    }
  },
  {
    key: 'delivery_challan',
    label: 'Challans',
    singular: 'challan',
    icon: Truck,
    emptyMessage: 'Send goods now and bill later. A challan moves stock without charging.',
    convertLabel: 'Convert to invoice',
    status: (_document, lifecycle) =>
      lifecycle === 'cancelled'
        ? { label: 'Cancelled', tone: 'cancelled' }
        : lifecycle === 'invoiced'
          ? { label: 'Invoiced', tone: 'paid' }
          : { label: 'Issued', tone: 'issued' },
    // What left the shelf is the point of the document, so the goods take the context line
    // and the money stays a reference figure in the amount slot.
    context: (document, lifecycle) => {
      if (lifecycle === 'cancelled') return { icon: Ban, text: 'Cancelled · can no longer be invoiced', muted: true };
      if (lifecycle === 'invoiced') return { icon: FileCheck, text: 'Already invoiced · the invoice carries the amount due', muted: true };
      return {
        icon: Package,
        text: `${countLabel(document.items.length, 'item')} · ${countLabel(unitsOf(document), 'unit')} delivered`
      };
    }
  },
  {
    key: 'credit_note',
    label: 'Credit notes',
    singular: 'credit note',
    icon: Undo2,
    emptyMessage: 'Credit a customer when goods come back. Raise one from the invoice itself.',
    status: (_document, lifecycle) =>
      lifecycle === 'cancelled' ? { label: 'Cancelled', tone: 'cancelled' } : { label: 'Issued', tone: 'issued' },
    // The list response carries the source invoice as an id only, not its number, so the
    // reason the credit was given is the honest thing to show beside it.
    context: (document, lifecycle) =>
      lifecycle === 'cancelled'
        ? { icon: Ban, text: 'Cancelled · the customer owes this amount again', muted: true }
        : {
            icon: Undo2,
            text: document.reason?.trim() || `${countLabel(document.items.length, 'item')} credited against the original invoice`
          }
  }
];

const webSearchInputStyle = { outlineStyle: 'none', outlineWidth: 0 } as unknown as TextStyle;

export function DocumentsScreen({ navigation, route }: DocumentsScreenProps) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const queryClient = useQueryClient();
  const { showDialog } = useAppDialog();
  const { showToast } = useAppToast();
  const { can } = usePermissions();
  const canCreate = can(PERMISSION.invoicesCreate);
  // Cancelling reverses stock and forecloses conversion, so it takes the same permission the
  // document's own detail screen requires — the list used to offer it to anyone.
  const canCancel = can(PERMISSION.invoicesUpdate);
  const [kind, setKind] = useState<SalesDocumentKind>(route.params?.documentType ?? 'quotation');
  const [pendingCancel, setPendingCancel] = useState<Invoice | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const active = KINDS.find((item) => item.key === kind) ?? KINDS[0];
  const copy = DOCUMENT_COPY[kind];

  const query = useQuery({
    queryKey: queryKeys.documents.list(kind),
    queryFn: () => documentsApi.list(kind)
  });
  const documents = query.data ?? [];

  // The endpoint returns the whole (capped) list in one call, so narrowing it is a local
  // match on the two things anyone searches a document by — its number and its customer.
  const term = search.trim().toLowerCase();
  const visible = term
    ? documents.filter(
        (document) =>
          documentNumberOf(document).toLowerCase().includes(term) ||
          (document.customerSnapshot?.name ?? '').toLowerCase().includes(term)
      )
    : documents;

  // Customers routinely forward a quotation for internal approval before ordering, so
  // sending it is a first-class action here — the PDF itself is watermarked and states
  // that it is not a tax invoice.
  const share = useCallback(
    async (document: Invoice) => {
      setSharingId(document._id);
      try {
        await openOrSharePdf(document.pdfUrl, documentNumberOf(document));
      } catch (error) {
        showDialog({ title: 'Could not share', message: apiErrorMessage(error), tone: 'error' });
      } finally {
        setSharingId(null);
      }
    },
    [showDialog]
  );

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
  const createLabel = `New ${active.singular}`;
  const headerAction = canCreate ? (
    <Pressable
      onPress={() => navigation.navigate('InvoiceCreate', { documentType: kind })}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={createLabel}
      style={({ pressed }) => [
        styles.headerBtn,
        { backgroundColor: pressed ? colors.primaryStrong : theme.colors.primary, shadowColor: isDark ? '#000000' : colors.primaryStrong }
      ]}
    >
      <Plus size={20} color="#FFFFFF" strokeWidth={2.6} />
    </Pressable>
  ) : undefined;

  const openDetail = useCallback(
    (document: Invoice) => {
      if (kind === 'credit_note') return navigation.navigate('CreditNoteDetail', { id: document._id });
      if (kind === 'quotation') return navigation.navigate('QuotationDetail', { id: document._id });
      return navigation.navigate('ChallanDetail', { id: document._id });
    },
    [kind, navigation]
  );

  // Not hand-memoized: the compiler already caches this, and a manual dependency list here
  // silently omits the cancel setter it closes over.
  const renderCard = ({ item }: { item: Invoice }) => {
      const lifecycle = documentLifecycle(item);
      const status = active.status(item, lifecycle);
      const context = active.context(item, lifecycle);
      const isOpen = item.documentStatus === 'issued';
      const number = documentNumberOf(item);

      // One primary act per state: turn it into an invoice while that is still possible,
      // otherwise send it. Cancel stays a quiet, right-aligned last resort.
      const convertAction: DocumentCardAction | undefined =
        active.convertLabel && isOpen && canCreate
          ? { label: active.convertLabel, icon: FileText, onPress: () => convert.mutate(item._id), disabled: convert.isPending }
          : undefined;
      const shareAction: DocumentCardAction | undefined =
        item.documentStatus !== 'cancelled' && item.pdfUrl
          ? { label: sharingId === item._id ? 'Preparing…' : 'Send', icon: Send, onPress: () => void share(item), busy: sharingId === item._id }
          : undefined;
      const cancelAction: DocumentCardAction | undefined = isOpen && canCancel
        ? { label: 'Cancel', icon: XCircle, onPress: () => setPendingCancel(item) }
        : undefined;

      return (
        <DocumentListCard
          icon={active.icon}
          number={number}
          meta={`${item.customerSnapshot?.name ?? 'Walk-in customer'} · ${formatDate(item.date)}`}
          amount={formatCurrency(item.total)}
          status={status.label}
          statusToneKey={status.tone}
          contextIcon={context.icon}
          contextText={context.text}
          contextMuted={context.muted}
          primaryAction={convertAction ?? shareAction}
          secondaryAction={convertAction ? shareAction : undefined}
          destructiveAction={cancelAction}
          onPress={() => openDetail(item)}
          accessibilityLabel={`View ${number}`}
        />
    );
  };

  const listHeader = (
    <View style={styles.stickyHeader}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
        {KINDS.map((item) => {
          const selected = item.key === kind;
          return (
            <Pressable
              key={item.key}
              onPress={() => setKind(item.key)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.tabChip,
                {
                  backgroundColor: selected ? (isDark ? colors.primaryFixed : theme.colors.primary) : colors.card,
                  borderColor: selected ? 'transparent' : cardBorder,
                  opacity: pressed ? 0.9 : 1
                }
              ]}
            >
              <Text
                style={[
                  styles.tabLabel,
                  { color: selected ? (isDark ? theme.colors.onPrimaryContainer : '#FFFFFF') : theme.colors.onSurfaceVariant }
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {documents.length || term ? (
        <View style={[styles.searchWrap, { backgroundColor: colors.card, borderColor: cardBorder }]}>
          <Search size={16} color={theme.colors.onSurfaceVariant} strokeWidth={2.2} />
          <RNTextInput
            value={search}
            onChangeText={setSearch}
            placeholder={`Search ${active.label.toLowerCase()}`}
            placeholderTextColor={theme.colors.onSurfaceVariant}
            accessibilityLabel={`Search ${active.label.toLowerCase()}`}
            returnKeyType="search"
            style={[styles.searchInput, webSearchInputStyle, { color: theme.colors.onSurface }]}
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
              <X size={16} color={theme.colors.onSurfaceVariant} strokeWidth={2.2} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {visible.length ? (
        <Text style={[styles.countText, { color: theme.colors.onSurfaceVariant }]}>
          {countLabel(visible.length, active.singular)}
        </Text>
      ) : null}
    </View>
  );

  return (
    <Screen title="Documents" scroll={false} headerAction={headerAction} contentStyle={styles.screenContent}>
      {listHeader}
      <FlatList
        data={visible}
        keyExtractor={(item) => item._id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshing={query.isRefetching && !query.isLoading}
        onRefresh={() => query.refetch()}
        removeClippedSubviews
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        renderItem={renderCard}
        ListEmptyComponent={
          query.isLoading ? (
            <DocumentListSkeleton />
          ) : term ? (
            <EmptyState
              title={`No ${active.label.toLowerCase()} match “${search.trim()}”`}
              message="Search by document number or customer name."
              actionLabel="Clear search"
              onAction={() => setSearch('')}
            />
          ) : (
            <EmptyState
              title={`No ${active.label.toLowerCase()} yet`}
              message={active.emptyMessage}
              actionLabel={canCreate && kind !== 'credit_note' ? createLabel : undefined}
              onAction={canCreate && kind !== 'credit_note' ? () => navigation.navigate('InvoiceCreate', { documentType: kind }) : undefined}
            />
          )
        }
      />

      {/* Same wording the document's own detail screen uses — what cancelling costs is not
          something to read two different accounts of. */}
      <ConfirmDialog
        visible={Boolean(pendingCancel)}
        title={copy.cancelTitle}
        message={pendingCancel ? copy.cancelMessage(pendingCancel) : ''}
        confirmLabel={copy.cancelLabel}
        onConfirm={() => pendingCancel && cancel.mutate(pendingCancel._id)}
        onCancel={() => setPendingCancel(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  countText: { ...typeScale.caption, fontSize: 12, marginLeft: 4 },
  headerBtn: {
    alignItems: 'center',
    borderRadius: radii.pill,
    elevation: 4,
    height: 42,
    justifyContent: 'center',
    marginLeft: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    width: 42
  },
  list: { flex: 1 },
  listContent: { paddingBottom: 24 },
  screenContent: { flex: 1 },
  searchInput: { ...fontStyles.regular, flex: 1, fontSize: 14, paddingHorizontal: 0, paddingVertical: 0 },
  searchWrap: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 46,
    paddingHorizontal: 14
  },
  stickyHeader: { gap: 12, marginBottom: 12, paddingTop: 4 },
  tabChip: { borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 9 },
  tabLabel: { ...fontStyles.semiBold, fontSize: 13 },
  tabRow: { gap: 8, paddingRight: 4 }
});
