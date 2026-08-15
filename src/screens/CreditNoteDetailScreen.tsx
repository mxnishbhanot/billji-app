import { StyleSheet, View } from 'react-native';
import { BadgeCheck, Ban, FileText, PackageOpen, Undo2, XCircle } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { Button, Text, useTheme } from 'react-native-paper';
import { invoicesApi } from '@/api/endpoints';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Screen } from '@/components/Screen';
import { DocumentCustomerSection } from '@/features/documents/components/DocumentCustomerSection';
import { DocumentDetailFallback } from '@/features/documents/components/DocumentDetailFallback';
import { DocumentHeroCard } from '@/features/documents/components/DocumentHeroCard';
import { DocumentLinkCard } from '@/features/documents/components/DocumentLinkCard';
import { DocumentNotice } from '@/features/documents/components/DocumentNotice';
import { DocumentItemRow, DocumentItemsSection } from '@/features/documents/components/DocumentItemsSection';
import { DocumentSection, DocumentDetailRow } from '@/features/documents/components/DocumentSection';
import { DocumentShareActions } from '@/features/documents/components/DocumentShareActions';
import { gstHeadsFor } from '@/features/documents/gstHeads';
import { useDocumentDetail } from '@/features/documents/useDocumentDetail';
import { CreditNoteDetailScreenProps } from '@/navigation/types';
import { PERMISSION, usePermissions } from '@/shared/hooks/usePermissions';
import { queryKeys } from '@/shared/query/queryKeys';
import { alpha, appColors, fontStyles, radii, spacing } from '@/theme/theme';
import { documentNumberOf } from '@/types';
import { formatCurrency, formatDate } from '@/utils/format';

/**
 * A credit note is not a bill: nothing is owed on it and nothing is collected against it.
 * It records goods coming back and money being given back — so this screen answers
 * "how much was credited, against which invoice, for what, and is that credit still live",
 * and deliberately shows no payment, balance or due information at all.
 *
 * Two states exist server-side (documents/credit_note): issued and cancelled. There is no
 * partial application, no allocation and no refund workflow, so none is shown here.
 */
export function CreditNoteDetailScreen({ route, navigation }: CreditNoteDetailScreenProps) {
  const { id } = route.params;
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const { can } = usePermissions();
  const canCancel = can(PERMISSION.invoicesUpdate);

  const detail = useDocumentDetail('credit_note', id);
  const { copy, isCancelled, cancel } = detail;
  const creditNote = detail.document;

  // The credit note only stores the source invoice's id; its number comes from the invoice
  // itself. The link is navigable either way — this query only supplies the label.
  const sourceInvoiceId = creditNote?.sourceInvoice ?? null;
  const sourceInvoiceQuery = useQuery({
    queryKey: queryKeys.invoices.detail(sourceInvoiceId ?? ''),
    queryFn: () => invoicesApi.get(sourceInvoiceId as string),
    enabled: Boolean(sourceInvoiceId)
  });

  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.06);

  if (detail.isLoading || !creditNote) {
    return <DocumentDetailFallback kind="credit_note" loading={detail.isLoading} onBack={() => navigation.goBack()} />;
  }

  // A credit note against a counter sale has no Customer row — the snapshot carries the label.
  const isWalkIn = !creditNote.customer;
  const sourceInvoiceNumber = sourceInvoiceQuery.data ? documentNumberOf(sourceInvoiceQuery.data) : '';
  const gstHeads = gstHeadsFor(creditNote);
  // Stock only moved for items that are actually catalogue products.
  const restoredStock = creditNote.items.some((item) => item.product);
  const effectTone = { background: alpha(colors.primary, isDark ? 0.24 : 0.12), foreground: colors.primaryStrong };

  const itemRows: DocumentItemRow[] = creditNote.items.map((item, index) => ({
    id: item._id || `${item.name}-${index}`,
    name: item.name,
    meta: `${item.quantity}${item.unit ? ` ${item.unit}` : ''} × ${formatCurrency(item.price)}`,
    total: formatCurrency(item.total)
  }));

  // What the number means: credit given back, not money owed. Once withdrawn, the figure is
  // history — so it is stated in the past tense and dimmed.
  const headlineLabel = isCancelled ? 'Credit withdrawn' : 'Credit issued';
  const headlineMeta = isCancelled
    ? 'Cancelled · the customer owes this amount again'
    : sourceInvoiceNumber
      ? `Credited against ${sourceInvoiceNumber}`
      : 'Credited against the original invoice';

  return (
    <Screen title={documentNumberOf(creditNote)}>
      {/* Summary: what was credited, when, against what, and whether the credit still stands. */}
      <DocumentHeroCard
        eyebrow="Credit note"
        eyebrowIcon={Undo2}
        title={documentNumberOf(creditNote)}
        subtitle={formatDate(creditNote.date)}
        status={isCancelled ? 'cancelled' : 'issued'}
        statusIcon={isCancelled ? XCircle : BadgeCheck}
        amountLabel={headlineLabel}
        amount={formatCurrency(creditNote.total)}
        amountMeta={headlineMeta}
        amountMuted={isCancelled}
      />

      {/* Share a cancelled credit note and the customer holds a document for credit they no
          longer have — the hook applies the same rule the documents list does. */}
      {detail.shareActions.length ? (
        <DocumentShareActions actions={detail.shareActions} busyAction={detail.busyAction} accessibilityLabelPrefix="Share credit note by" />
      ) : null}

      {isCancelled ? (
        <DocumentSection>
          <DocumentNotice
            icon={Ban}
            tone={{ background: alpha(colors.destructive, isDark ? 0.24 : 0.12), foreground: colors.destructive }}
            text={
              creditNote.cancelReason
                ? `This credit note was cancelled: ${creditNote.cancelReason}`
                : 'This credit note was cancelled and can no longer be shared.'
            }
          />
        </DocumentSection>
      ) : null}

      {/* The invoice is what the credit reverses — the single most useful jump from here. */}
      {sourceInvoiceId ? (
        <DocumentLinkCard
          label="CREDITED AGAINST"
          icon={FileText}
          title={sourceInvoiceNumber || 'Original invoice'}
          hint="The supply this credit reverses"
          accessibilityLabel={sourceInvoiceNumber ? `View invoice ${sourceInvoiceNumber}` : 'View the credited invoice'}
          onPress={() => navigation.navigate('InvoiceDetail', { id: sourceInvoiceId })}
        />
      ) : null}

      <DocumentCustomerSection
        title="ISSUED TO"
        name={creditNote.customerSnapshot.name}
        hint={isWalkIn ? 'Counter sale · no customer account' : 'Customer'}
        metaItems={detail.customerMetaItems}
      />

      <DocumentItemsSection title="RETURNED ITEMS" items={itemRows} />

      {/* Not a bill summary: this is what the credit is made of, ending in what was credited. */}
      <DocumentSection title="CREDIT SUMMARY">
        <View style={styles.detailRows}>
          <DocumentDetailRow label="Value of returned items" value={formatCurrency(creditNote.subtotal)} />
          {creditNote.discount.amount > 0 ? (
            <DocumentDetailRow label="Discount reversed" value={`-${formatCurrency(creditNote.discount.amount)}`} />
          ) : null}
          {/* The credit files the same tax heads as the supply it reverses. Documents from
              before the GST engine keep the single merged "Tax" row they were created with. */}
          {gstHeads.length ? (
            gstHeads.map((head) => <DocumentDetailRow key={head.label} label={`${head.label} reversed`} value={formatCurrency(head.amount)} />)
          ) : creditNote.tax.amount > 0 ? (
            <DocumentDetailRow label="Tax reversed" value={formatCurrency(creditNote.tax.amount)} />
          ) : null}
          {creditNote.placeOfSupply?.state ? (
            <DocumentDetailRow
              label="Place of supply"
              value={`${creditNote.placeOfSupply.state}${creditNote.supplyType === 'inter' ? ' · inter-state' : ''}`}
            />
          ) : null}
        </View>
        <View style={[styles.grandTotal, { borderTopColor: cardBorder }]}>
          <Text style={[styles.grandTotalLabel, { color: theme.colors.onSurface }]}>Total credited</Text>
          <Text style={[styles.grandTotalValue, { color: theme.colors.onSurface }]}>{formatCurrency(creditNote.total)}</Text>
        </View>
      </DocumentSection>

      {/* What the credit actually did, in the two places a shop owner cares about. */}
      {!isCancelled ? (
        <DocumentSection title="EFFECT">
          <DocumentNotice
            icon={Undo2}
            tone={effectTone}
            text={
              isWalkIn
                ? 'The sale was reversed in your accounts and reported as a credit note in GST returns.'
                : `${formatCurrency(creditNote.total)} was taken off what ${creditNote.customerSnapshot.name} owes you.`
            }
          />
          {restoredStock ? (
            <DocumentNotice icon={PackageOpen} tone={effectTone} text="Returned units went back into stock." style={styles.effectRowSpaced} />
          ) : null}
        </DocumentSection>
      ) : null}

      {creditNote.reason ? (
        <DocumentSection title="REASON FOR CREDIT">
          <Text style={[styles.bodyText, { color: theme.colors.onSurfaceVariant }]}>{creditNote.reason}</Text>
        </DocumentSection>
      ) : null}

      {creditNote.notes ? (
        <DocumentSection title="NOTES">
          <Text style={[styles.bodyText, { color: theme.colors.onSurfaceVariant }]}>{creditNote.notes}</Text>
        </DocumentSection>
      ) : null}

      {/* Tertiary: withdrawing a credit is destructive and rare, so it stays at the end. */}
      {canCancel && !isCancelled ? (
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
        message={copy.cancelMessage(creditNote)}
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
  effectRowSpaced: { marginTop: 12 },
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
  grandTotalValue: { ...fontStyles.bold, fontSize: 22, letterSpacing: -0.5 },
});
