import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { fontStyles, radii, statusTone } from '@/theme/theme';
import { InvoicePaymentStatus } from '@/types';

type StatusPillProps = {
  label: string;
  /** statusTone keyword (e.g. 'paid' | 'pending' | 'cancelled'); defaults to label */
  tone?: string;
};

export function StatusPill({ label, tone }: StatusPillProps) {
  const isDark = useTheme().dark;
  const palette = statusTone(tone ?? label, isDark);
  return (
    <View style={[styles.pill, { backgroundColor: palette.background, borderColor: palette.border }]}>
      <Text style={[styles.label, { color: palette.foreground }]}>{label}</Text>
    </View>
  );
}

const PAYMENT_STATUS_META: Record<InvoicePaymentStatus, { label: string; tone: string }> = {
  paid: { label: 'Paid', tone: 'paid' },
  partial: { label: 'Partial', tone: 'pending' },
  unpaid: { label: 'Unpaid', tone: 'pending' },
  refunded: { label: 'Refunded', tone: 'refunded' }
};

export const paymentStatusMeta = (status?: InvoicePaymentStatus | string | null) =>
  (status && PAYMENT_STATUS_META[status as InvoicePaymentStatus]) || null;

const styles = StyleSheet.create({
  label: { ...fontStyles.semiBold, fontSize: 11, letterSpacing: 0.4, textTransform: 'capitalize' },
  pill: { alignSelf: 'flex-start', borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 4 }
});
