import { StyleSheet, View } from 'react-native';
import { Ban, CalendarX2, ClipboardList, Clock, FileCheck, FileText, XCircle } from 'lucide-react-native';
import { Button, Text, useTheme } from 'react-native-paper';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Screen } from '@/components/Screen';
import { DocumentCustomerSection } from '@/features/documents/components/DocumentCustomerSection';
import { DocumentDetailFallback } from '@/features/documents/components/DocumentDetailFallback';
import { DocumentHeroCard, documentHeroActionStyles } from '@/features/documents/components/DocumentHeroCard';
import { DocumentLinkCard } from '@/features/documents/components/DocumentLinkCard';
import { DocumentNotice } from '@/features/documents/components/DocumentNotice';
import { DocumentItemRow, DocumentItemsSection } from '@/features/documents/components/DocumentItemsSection';
import { DocumentSection, DocumentDetailRow } from '@/features/documents/components/DocumentSection';
import { DocumentShareActions } from '@/features/documents/components/DocumentShareActions';
import { gstHeadsFor } from '@/features/documents/gstHeads';
import { useDocumentDetail } from '@/features/documents/useDocumentDetail';
import { QuotationDetailScreenProps } from '@/navigation/types';
import { PERMISSION, usePermissions } from '@/shared/hooks/usePermissions';
import { alpha, appColors, fontStyles, radii, spacing } from '@/theme/theme';
import { documentNumberOf } from '@/types';
import { formatCurrency, formatDate } from '@/utils/format';

/**
 * A quotation is an offer, not a bill. Nothing is owed on it, no stock moves, nothing is
 * posted to the ledger and no payment can be taken against it — so this screen shows no
 * amount due, no balance, no payment history and no "billed to". It answers the three
 * questions a quote actually raises: what was quoted, how long the price holds, and can it
 * still be turned into an invoice.
 *
 * Server states (documents/quotation): issued (live), void (already converted to an
 * invoice, once) and cancelled. validUntil is stored and printed on the PDF but the server
 * does not refuse conversion after it passes, so expiry is shown as information, never as a
 * block the UI invents.
 */

/** A quote stays valid for the whole of its last day, so compare against the day boundary. */
const isExpiredOn = (validUntil?: string | null) => {
  if (!validUntil) return false;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return new Date(validUntil).getTime() < startOfToday.getTime();
};

export function QuotationDetailScreen({ route, navigation }: QuotationDetailScreenProps) {
  const { id } = route.params;
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const { can } = usePermissions();
  const canConvert = can(PERMISSION.invoicesCreate);
  const canCancel = can(PERMISSION.invoicesUpdate);

  const detail = useDocumentDetail('quotation', id, {
    onConverted: (invoice) => navigation.navigate('InvoiceDetail', { id: invoice._id })
  });
  // invoiced = spent: the quote has already become an invoice and cannot become another.
  const { copy, isCancelled, isInvoiced: isConverted, isOpen, cancel, convert } = detail;
  const quotation = detail.document;

  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.06);

  if (detail.isLoading || !quotation) {
    return <DocumentDetailFallback kind="quotation" loading={detail.isLoading} onBack={() => navigation.goBack()} />;
  }

  const isExpired = isOpen && isExpiredOn(quotation.validUntil);
  const isWalkIn = !quotation.customer;
  const gstHeads = gstHeadsFor(quotation);

  const status = isCancelled ? 'cancelled' : isConverted ? 'invoiced' : isExpired ? 'expired' : 'open';
  const statusIcon = isCancelled ? XCircle : isConverted ? FileCheck : isExpired ? CalendarX2 : Clock;

  // The hero's second line is the validity line: for a live quote that is the whole point of
  // the document, and for a spent one it says what became of it.
  const headlineMeta = isCancelled
    ? 'Cancelled · this quote can no longer be invoiced'
    : isConverted
      ? 'Already converted to an invoice'
      : isExpired
        ? `Expired on ${formatDate(quotation.validUntil)}`
        : quotation.validUntil
          ? `Valid until ${formatDate(quotation.validUntil)}`
          : 'No expiry date · this price holds until you withdraw it';

  const itemRows: DocumentItemRow[] = quotation.items.map((item, index) => ({
    id: item._id || `${item.name}-${index}`,
    name: item.name,
    meta: `${item.quantity}${item.unit ? ` ${item.unit}` : ''} × ${formatCurrency(item.price)}`,
    total: formatCurrency(item.total ?? item.quantity * item.price)
  }));

  const noticeText = isCancelled
    ? 'This quotation was cancelled and can no longer be converted to an invoice.'
    : isConverted
      ? 'This quotation has already been invoiced. The invoice is the document to send and collect against.'
      : isExpired
        ? 'The price on this quote has lapsed. You can still invoice it, or raise a fresh quotation at current prices.'
        : 'An offer, not a bill — nothing is owed, no stock has moved, and nothing is collected until this becomes an invoice.';
  const NoticeIcon = isCancelled ? Ban : isConverted ? FileCheck : isExpired ? CalendarX2 : ClipboardList;
  const noticeTone = isCancelled ? colors.destructive : colors.primaryStrong;
  // The server records the link on the invoice it produced; the quotation detail response
  // resolves it back, so it is only ever present once this quote was actually converted.
  const linkedInvoice = quotation.linkedInvoice ?? null;

  return (
    <Screen title={documentNumberOf(quotation)}>
      {/* What was quoted, to when the price holds, and the one thing a live quote invites. */}
      <DocumentHeroCard
        eyebrow="Quotation"
        eyebrowIcon={ClipboardList}
        title={documentNumberOf(quotation)}
        subtitle={formatDate(quotation.date)}
        status={status}
        statusIcon={statusIcon}
        amountLabel="Quoted total"
        amount={formatCurrency(quotation.total)}
        amountMeta={headlineMeta}
        amountMuted={isCancelled || isConverted}
        primaryAction={
          canConvert && isOpen && convert ? (
            <Button
              mode="contained"
              icon={({ size, color }) => <FileText size={size} color={color} strokeWidth={2.2} />}
              buttonColor={isDark ? colors.primaryFixed : colors.primary}
              textColor="#FFFFFF"
              loading={convert.isPending}
              onPress={() => convert.mutate()}
              style={documentHeroActionStyles.button}
              contentStyle={documentHeroActionStyles.content}
            >
              Convert to invoice
            </Button>
          ) : null
        }
      />

      {/* A quote is written to be sent, so sharing sits directly under the hero — but a
          cancelled one would hand the customer a price that no longer stands. */}
      {detail.shareActions.length ? (
        <DocumentShareActions actions={detail.shareActions} busyAction={detail.busyAction} accessibilityLabelPrefix="Share quotation by" />
      ) : null}

      <DocumentSection>
        <DocumentNotice
          icon={NoticeIcon}
          tone={{ background: alpha(noticeTone, isDark ? 0.24 : 0.12), foreground: noticeTone }}
          text={noticeText}
        />
      </DocumentSection>

      {/* Once a quote has become an invoice, the invoice is the document that is sent and
          collected against — so a converted quote hands the user straight over to it. */}
      {linkedInvoice ? (
        <DocumentLinkCard
          label="INVOICE"
          icon={FileText}
          title={linkedInvoice.invoiceNumber}
          hint="Record payment, send or share"
          accessibilityLabel={`View invoice ${linkedInvoice.invoiceNumber}`}
          onPress={() => navigation.navigate('InvoiceDetail', { id: linkedInvoice.id })}
        />
      ) : null}

      <DocumentCustomerSection
        title="QUOTED TO"
        name={quotation.customerSnapshot.name}
        hint={isWalkIn ? 'Counter enquiry · no customer account' : 'Customer'}
        metaItems={detail.customerMetaItems}
      />

      <DocumentItemsSection title="QUOTED ITEMS" items={itemRows} />

      {/* Not a bill summary: this is what the offer is made of, ending in the quoted price. */}
      <DocumentSection title="QUOTATION SUMMARY">
        <View style={styles.detailRows}>
          <DocumentDetailRow label="Subtotal" value={formatCurrency(quotation.subtotal)} />
          {quotation.discount.amount > 0 ? (
            <DocumentDetailRow label="Discount" value={`-${formatCurrency(quotation.discount.amount)}`} />
          ) : null}
          {/* Quotes raised before the GST engine keep the single merged "Tax" row. */}
          {gstHeads.length ? (
            gstHeads.map((head) => <DocumentDetailRow key={head.label} label={head.label} value={formatCurrency(head.amount)} />)
          ) : quotation.tax.amount > 0 ? (
            <DocumentDetailRow label="Tax" value={formatCurrency(quotation.tax.amount)} />
          ) : null}
          {quotation.placeOfSupply?.state ? (
            <DocumentDetailRow
              label="Place of supply"
              value={`${quotation.placeOfSupply.state}${quotation.supplyType === 'inter' ? ' · inter-state' : ''}`}
            />
          ) : null}
        </View>
        <View style={[styles.grandTotal, { borderTopColor: cardBorder }]}>
          <Text style={[styles.grandTotalLabel, { color: theme.colors.onSurface }]}>Quoted total</Text>
          <Text style={[styles.grandTotalValue, { color: theme.colors.onSurface }]}>{formatCurrency(quotation.total)}</Text>
        </View>
      </DocumentSection>

      {/* Notes on a quotation are part of the offer the customer reads, so they are kept but
          stay below the numbers being offered. */}
      {quotation.notes ? (
        <DocumentSection title="NOTES">
          <Text style={[styles.bodyText, { color: theme.colors.onSurfaceVariant }]}>{quotation.notes}</Text>
        </DocumentSection>
      ) : null}

      {/* Withdrawing an offer is quiet and final, so it sits at the end. */}
      {canCancel && isOpen ? (
        <View style={styles.footerActions}>
          <Button
            mode="outlined"
            textColor={theme.colors.error}
            icon={({ size, color }) => <Ban size={size} color={color} strokeWidth={2.2} />}
            loading={cancel.isPending}
            onPress={() => detail.setCancelVisible(true)}
            style={[styles.footerButton, { borderColor: alpha(colors.destructive, isDark ? 0.55 : 0.38) }]}
          >
            {copy.cancelLabel}
          </Button>
        </View>
      ) : null}

      <ConfirmDialog
        visible={detail.cancelVisible}
        title={copy.cancelTitle}
        message={copy.cancelMessage(quotation)}
        confirmLabel={copy.cancelLabel}
        onCancel={() => detail.setCancelVisible(false)}
        onConfirm={() => {
          detail.setCancelVisible(false);
          cancel.mutate();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  bodyText: { ...fontStyles.medium, fontSize: 13, lineHeight: 19 },
  detailRows: { gap: 10 },
  footerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: spacing.section },
  footerButton: { borderRadius: radii.input, flexGrow: 1, flexShrink: 1 },
  grandTotal: {
    alignItems: 'center',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12
  },
  grandTotalLabel: { ...fontStyles.bold, fontSize: 15 },
  grandTotalValue: { ...fontStyles.bold, fontSize: 22, letterSpacing: -0.5 }
});
