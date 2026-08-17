import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Button, Text, TextInput, useTheme } from 'react-native-paper';
import { apiErrorMessage } from '@/api/client';
import { documentsApi, invoicesApi } from '@/api/endpoints';
import { useAppDialog } from '@/components/AppDialog';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { DocumentSection, DocumentDetailRow } from '@/features/documents/components/DocumentSection';
import {
  CreditNoteLine,
  creditableRemaining,
  creditNoteBlocker,
  creditNoteLinesFrom,
  creditNotePayloadItems,
  creditNoteTotal,
  setLineQuantity
} from '@/features/documents/creditNoteBuilder';
import { CreditNoteBuilderScreenProps } from '@/navigation/types';
import { queryKeys } from '@/shared/query/queryKeys';
import { alpha, appColors, fontStyles, radii, spacing, typeScale } from '@/theme/theme';
import { documentNumberOf } from '@/types';
import { formatCurrency } from '@/utils/format';

/**
 * Issuing a credit note against an invoice. Deliberately not the invoice builder: there is
 * no customer picker, no product search, no discount editor and no draft — the customer,
 * the prices and the lines all come from the source invoice, and the only decision the user
 * makes is how much of it is coming back and why.
 */
export function CreditNoteBuilderScreen({ navigation, route }: CreditNoteBuilderScreenProps) {
  const { sourceInvoiceId } = route.params;
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const queryClient = useQueryClient();
  const { showDialog } = useAppDialog();

  const [lines, setLines] = useState<CreditNoteLine[] | null>(null);
  const [reason, setReason] = useState('');

  const query = useQuery({
    queryKey: queryKeys.invoices.detail(sourceInvoiceId),
    queryFn: () => invoicesApi.get(sourceInvoiceId)
  });
  const invoice = query.data;

  // Seeded once from the invoice; after that the user's edits own the list.
  const currentLines = lines ?? (invoice ? creditNoteLinesFrom(invoice) : []);
  const remaining = invoice ? creditableRemaining(invoice) : 0;
  const total = useMemo(
    () => (invoice ? creditNoteTotal(currentLines, invoice) : 0),
    [currentLines, invoice]
  );
  const blocker = creditNoteBlocker({ lines: currentLines, reason, total, remaining });

  const create = useMutation({
    mutationFn: () =>
      documentsApi.create('credit_note', {
        ...(invoice?.customer ? { customerId: invoice.customer } : {}),
        items: creditNotePayloadItems(currentLines),
        taxRate: invoice?.tax?.rate ?? 0,
        discountType: 'flat',
        discountValue: 0,
        notes: '',
        ...(invoice?.placeOfSupply?.code ? { placeOfSupplyCode: invoice.placeOfSupply.code } : {}),
        sourceInvoiceId,
        reason: reason.trim()
      }),
    onSuccess: (document) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.report.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      navigation.replace('CreditNoteDetail', { id: document._id });
    },
    onError: (error) => showDialog({ title: 'Could not create credit note', message: apiErrorMessage(error), tone: 'error' })
  });

  if (query.isLoading) {
    return (
      <Screen title="New credit note">
        <ActivityIndicator style={styles.loader} />
      </Screen>
    );
  }

  if (!invoice) {
    return (
      <Screen title="New credit note">
        <EmptyState title="Invoice not found" message="The invoice this credit note belongs to could not be loaded." />
      </Screen>
    );
  }

  const setQuantity = (key: string, quantity: number) => setLines(setLineQuantity(currentLines, key, quantity));
  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.08);
  const overCap = total > remaining;

  return (
    <Screen title="New credit note">
      <DocumentSection title="Against invoice">
        <DocumentDetailRow label="Invoice" value={documentNumberOf(invoice)} />
        <DocumentDetailRow label="Invoice total" value={formatCurrency(invoice.total)} />
        <DocumentDetailRow label="Already credited" value={formatCurrency(invoice.creditedAmount ?? 0)} />
        <DocumentDetailRow label="Still creditable" value={formatCurrency(remaining)} emphasise={theme.colors.primary} />
      </DocumentSection>

      <DocumentSection title="Returned items">
        {currentLines.map((line) => (
          <View key={line.key} style={[styles.line, { borderColor: cardBorder }]}>
            <View style={styles.lineText}>
              <Text style={[styles.lineName, { color: theme.colors.onSurface }]}>{line.name}</Text>
              <Text style={[styles.lineMeta, { color: theme.colors.onSurfaceVariant }]}>
                {formatCurrency(line.price)} · billed {line.billedQuantity}
                {line.unit ? ` ${line.unit}` : ''}
              </Text>
            </View>
            <View style={[styles.stepper, { borderColor: cardBorder, backgroundColor: colors.card }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Return one less ${line.name}`}
                disabled={line.quantity <= 0}
                onPress={() => setQuantity(line.key, line.quantity - 1)}
                style={styles.stepperBtn}
              >
                <Minus size={14} color={line.quantity <= 0 ? theme.colors.onSurfaceDisabled : theme.colors.onSurface} strokeWidth={2.4} />
              </Pressable>
              <Text style={[styles.stepperValue, { color: theme.colors.onSurface }]}>{line.quantity}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Return one more ${line.name}`}
                disabled={line.quantity >= line.billedQuantity}
                onPress={() => setQuantity(line.key, line.quantity + 1)}
                style={styles.stepperBtn}
              >
                <Plus
                  size={14}
                  color={line.quantity >= line.billedQuantity ? theme.colors.onSurfaceDisabled : theme.colors.onSurface}
                  strokeWidth={2.4}
                />
              </Pressable>
            </View>
          </View>
        ))}
      </DocumentSection>

      <DocumentSection title="Reason">
        <TextInput
          mode="outlined"
          label="Why is this being credited?"
          value={reason}
          onChangeText={setReason}
          multiline
          maxLength={500}
          outlineColor={cardBorder}
          activeOutlineColor={theme.colors.primary}
          style={[styles.reason, { backgroundColor: colors.card }]}
        />
      </DocumentSection>

      <DocumentSection title="Credit note total">
        <DocumentDetailRow
          label="Credit to issue"
          value={formatCurrency(total)}
          emphasise={overCap ? theme.colors.error : theme.colors.primary}
        />
        {blocker ? <Text style={[styles.blocker, { color: theme.colors.error }]}>{blocker}</Text> : null}
        <Button
          mode="contained"
          disabled={Boolean(blocker) || create.isPending}
          loading={create.isPending}
          onPress={() => create.mutate()}
          style={styles.submit}
        >
          Issue credit note
        </Button>
      </DocumentSection>
    </Screen>
  );
}

const styles = StyleSheet.create({
  blocker: { ...typeScale.bodyPrimary, fontSize: 12.5, marginTop: 8 },
  line: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 12, justifyContent: 'space-between', paddingVertical: 12 },
  lineMeta: { ...typeScale.bodyPrimary, fontSize: 12 },
  lineName: { ...fontStyles.semiBold, fontSize: 13.5 },
  lineText: { flexShrink: 1, gap: 2 },
  loader: { marginTop: spacing.section },
  reason: { minHeight: 88 },
  stepper: { alignItems: 'center', borderRadius: radii.input, borderWidth: 1, flexDirection: 'row' },
  stepperBtn: { alignItems: 'center', height: 34, justifyContent: 'center', width: 34 },
  stepperValue: { ...fontStyles.semiBold, fontSize: 13.5, minWidth: 24, textAlign: 'center' },
  submit: { borderRadius: radii.input, marginTop: 14 }
});
