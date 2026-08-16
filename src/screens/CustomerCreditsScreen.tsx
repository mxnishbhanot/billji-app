import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { paymentsApi } from '@/api/endpoints';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { DocumentSection, DocumentDetailRow } from '@/features/documents/components/DocumentSection';
import { CustomerCreditsScreenProps } from '@/navigation/types';
import { queryKeys } from '@/shared/query/queryKeys';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import { CustomerCredit } from '@/types';
import { formatCurrency, formatDate } from '@/utils/format';

/**
 * What the customer can still spend, itemised. Credit notes and overpayments are listed
 * together in the order they will be consumed (oldest first) because that is the order the
 * server applies them in — the list is the explanation of the single number above it.
 */
export function CustomerCreditsScreen({ route }: CustomerCreditsScreenProps) {
  const { customerId, customerName } = route.params;
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);

  const query = useQuery({
    queryKey: queryKeys.payments.customerCredits(customerId),
    queryFn: () => paymentsApi.customerCredits(customerId)
  });

  const credits: CustomerCredit[] = query.data?.credits ?? [];
  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.08);

  return (
    <Screen title="Available credit">
      <DocumentSection title={customerName}>
        <DocumentDetailRow
          label="Available credit"
          value={formatCurrency(query.data?.availableCredit ?? 0)}
          emphasise={theme.colors.primary}
        />
      </DocumentSection>

      {query.isLoading ? (
        <ActivityIndicator color={theme.colors.primary} style={styles.loader} />
      ) : credits.length ? (
        <DocumentSection title="Oldest is used first">
          {credits.map((credit) => (
            <View key={`${credit.source}-${credit.id}`} style={[styles.row, { borderColor: cardBorder }]}>
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: theme.colors.onSurface }]}>
                  {credit.source === 'credit_note' ? credit.reference || 'Credit note' : credit.reference || 'Overpayment'}
                </Text>
                <Text style={[styles.rowMeta, { color: theme.colors.onSurfaceVariant }]}>
                  {formatDate(credit.date)} · {credit.source === 'credit_note' ? 'issued' : 'received'} {formatCurrency(credit.total)} ·
                  {' '}applied {formatCurrency(credit.applied)}
                </Text>
              </View>
              <Text style={[styles.rowValue, { color: theme.colors.primary }]}>{formatCurrency(credit.remaining)}</Text>
            </View>
          ))}
        </DocumentSection>
      ) : (
        <EmptyState
          title="No credit available"
          message="Credit appears here when a credit note is issued to this customer, or when they pay more than a bill's total."
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: 24 },
  row: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 12, justifyContent: 'space-between', paddingVertical: 12 },
  rowMeta: { ...typeScale.bodyPrimary, fontSize: 12 },
  rowText: { flexShrink: 1, gap: 2 },
  rowTitle: { ...fontStyles.semiBold, fontSize: 13.5 },
  rowValue: { ...fontStyles.bold, fontSize: 14 }
});
