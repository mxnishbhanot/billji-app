import { StyleSheet, View } from 'react-native';
import { Ban, FileCheck, FileText, PackageCheck, PackageX, Truck, XCircle } from 'lucide-react-native';
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
import { ChallanDetailScreenProps } from '@/navigation/types';
import { PERMISSION, usePermissions } from '@/shared/hooks/usePermissions';
import { alpha, appColors, fontStyles, radii, spacing } from '@/theme/theme';
import { documentNumberOf } from '@/types';
import { formatCurrency, formatDate } from '@/utils/format';

/**
 * A delivery challan records goods leaving, not money owed. The server deducts stock the
 * moment it is issued (documents rules: stockDirection -1), posts nothing to the ledger,
 * counts as no supply and moves no customer balance — so this screen carries no amount due,
 * no balance, no paid state and no payment action. Its total exists because the challan is
 * printed with the goods and the PDF itself says the amounts are for reference only, so it
 * is headlined as the goods value, never as a bill.
 *
 * Server states (documents/delivery_challan): issued (goods out, not yet billed), void
 * (already converted to an invoice, once) and cancelled (stock put back). There is no
 * partial-delivery or fulfilment workflow behind this document, so none is shown.
 */

export function ChallanDetailScreen({ route, navigation }: ChallanDetailScreenProps) {
  const { id } = route.params;
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const { can } = usePermissions();
  const canConvert = can(PERMISSION.invoicesCreate);
  const canCancel = can(PERMISSION.invoicesUpdate);

  const detail = useDocumentDetail('delivery_challan', id, {
    onConverted: (invoice) => navigation.navigate('InvoiceDetail', { id: invoice._id })
  });
  const { copy, isCancelled, isInvoiced, isOpen, lifecycle: status, cancel, convert } = detail;
  const challan = detail.document;

  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.06);

  if (detail.isLoading || !challan) {
    return <DocumentDetailFallback kind="delivery_challan" loading={detail.isLoading} onBack={() => navigation.goBack()} />;
  }

  const isWalkIn = !challan.customer;
  const gstHeads = gstHeadsFor(challan);

  const statusIcon = isCancelled ? XCircle : isInvoiced ? FileCheck : Truck;

  // What this challan actually did to stock, counted by the server from the movements it
  // wrote — not inferred from the document type. A line only moves stock when it points at a
  // tracked product, so a challan of custom lines legitimately moved nothing. `undefined`
  // means the field was not reported (a response cached before it existed), and the screen
  // then says nothing about stock rather than guessing.
  const stock = challan.stockEffect;
  const movedStock = stock ? stock.products > 0 : null;
  const stockUnits = stock ? `${stock.quantity} ${stock.quantity === 1 ? 'unit' : 'units'}` : '';

  // The hero's second line answers the question the goods raise: have they been billed yet?
  const headlineMeta = isCancelled
    ? movedStock
      ? 'Cancelled · the goods went back into stock'
      : 'Cancelled · this challan can no longer be invoiced'
    : isInvoiced
      ? 'Already invoiced · the invoice carries the amount due'
      : 'Goods delivered · reference value only, nothing is owed on this challan';

  // What left the shelf is the point of the document, so the quantity takes the bold slot
  // the other documents give to the line amount, and the money drops to the meta line.
  const itemRows: DocumentItemRow[] = challan.items.map((item, index) => ({
    id: item._id || `${item.name}-${index}`,
    name: item.name,
    meta: `${formatCurrency(item.price)} each · ${formatCurrency(item.total ?? item.quantity * item.price)}`,
    total: `${item.quantity}${item.unit ? ` ${item.unit}` : ''}`
  }));

  const noticeText = isCancelled
    ? movedStock
      ? 'This challan was cancelled. The goods went back into stock and it can no longer be invoiced.'
      : 'This challan was cancelled and can no longer be invoiced.'
    : isInvoiced
      ? movedStock
        ? 'These goods have been invoiced. The invoice is the document to collect against; the stock was not deducted a second time.'
        : 'These goods have been invoiced. The invoice is the document to collect against.'
      : movedStock
        ? `A record of goods sent, not a bill. ${stockUnits} came off stock when this challan was issued, and nothing is owed until it becomes an invoice.`
        : movedStock === false
          ? 'A record of goods sent, not a bill. Nothing on it is a stock-tracked item, so inventory is unchanged, and nothing is owed until it becomes an invoice.'
          : 'A record of goods sent, not a bill. Nothing is owed until it becomes an invoice.';
  const NoticeIcon = isCancelled ? PackageX : isInvoiced ? FileCheck : PackageCheck;
  const noticeTone = isCancelled ? colors.destructive : colors.primaryStrong;
  // The server records the link on the invoice it produced; the challan detail response
  // resolves it back, so it is only ever present once this challan was actually converted.
  const linkedInvoice = challan.linkedInvoice ?? null;

  return (
    <Screen title={documentNumberOf(challan)}>
      {/* What went out, to whom it was billed if at all, and the one action an open challan invites. */}
      <DocumentHeroCard
        eyebrow="Delivery challan"
        eyebrowIcon={Truck}
        title={documentNumberOf(challan)}
        subtitle={formatDate(challan.date)}
        status={status}
        statusIcon={statusIcon}
        amountLabel="Goods value"
        amount={formatCurrency(challan.total)}
        amountMeta={headlineMeta}
        amountMuted={isCancelled || isInvoiced}
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

      {/* A challan travels with the goods, so sharing sits directly under the hero. */}
      {detail.shareActions.length ? (
        <DocumentShareActions actions={detail.shareActions} busyAction={detail.busyAction} accessibilityLabelPrefix="Share challan by" />
      ) : null}

      <DocumentSection>
        <DocumentNotice
          icon={NoticeIcon}
          tone={{ background: alpha(noticeTone, isDark ? 0.24 : 0.12), foreground: noticeTone }}
          text={noticeText}
        />
      </DocumentSection>

      {/* Once the goods are billed, the invoice is the document that is collected against. */}
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
        title="DELIVERED TO"
        name={challan.customerSnapshot.name}
        hint={isWalkIn ? 'Counter delivery · no customer account' : 'Customer'}
        metaItems={detail.customerMetaItems}
      />

      <DocumentItemsSection title="GOODS DELIVERED" items={itemRows} />

      {/* The two facts a challan is asked for after the goods have gone: did stock actually
          move, and has this been billed yet. The stock line is the server's count of the
          movements this document wrote, so it is omitted rather than guessed when absent. */}
      <DocumentSection title="STOCK & BILLING">
        <View style={styles.detailRows}>
          {stock ? (
            <DocumentDetailRow
              label="Stock"
              value={
                !movedStock
                  ? 'No stock-tracked items'
                  : stock.reversed
                    ? `${stockUnits} returned to stock`
                    : `${stockUnits} deducted on issue`
              }
            />
          ) : null}
          <DocumentDetailRow
            label="Billing"
            value={isInvoiced ? (linkedInvoice ? `Invoiced · ${linkedInvoice.invoiceNumber}` : 'Invoiced') : isCancelled ? 'Not invoiced' : 'Not invoiced yet'}
          />
        </View>
      </DocumentSection>

      {/* The value the challan is printed with, so the goods can be checked against it on
          delivery. Not a bill summary: it ends at what the goods are worth. */}
      <DocumentSection title="GOODS VALUE">
        <View style={styles.detailRows}>
          <DocumentDetailRow label="Subtotal" value={formatCurrency(challan.subtotal)} />
          {challan.discount.amount > 0 ? (
            <DocumentDetailRow label="Discount" value={`-${formatCurrency(challan.discount.amount)}`} />
          ) : null}
          {/* Challans raised before the GST engine keep the single merged "Tax" row. */}
          {gstHeads.length ? (
            gstHeads.map((head) => <DocumentDetailRow key={head.label} label={head.label} value={formatCurrency(head.amount)} />)
          ) : challan.tax.amount > 0 ? (
            <DocumentDetailRow label="Tax" value={formatCurrency(challan.tax.amount)} />
          ) : null}
          {challan.placeOfSupply?.state ? (
            <DocumentDetailRow
              label="Place of supply"
              value={`${challan.placeOfSupply.state}${challan.supplyType === 'inter' ? ' · inter-state' : ''}`}
            />
          ) : null}
        </View>
        <View style={[styles.grandTotal, { borderTopColor: cardBorder }]}>
          <Text style={[styles.grandTotalLabel, { color: theme.colors.onSurface }]}>Goods value</Text>
          <Text style={[styles.grandTotalValue, { color: theme.colors.onSurface }]}>{formatCurrency(challan.total)}</Text>
        </View>
      </DocumentSection>

      {/* Notes travel with the goods — delivery instructions live here in practice — so they
          stay readable, below what was sent. */}
      {challan.notes ? (
        <DocumentSection title="NOTES">
          <Text style={[styles.bodyText, { color: theme.colors.onSurfaceVariant }]}>{challan.notes}</Text>
        </DocumentSection>
      ) : null}

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
        message={copy.cancelMessage(challan)}
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
