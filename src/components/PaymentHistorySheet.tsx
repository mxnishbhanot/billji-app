import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusPill } from '@/components/StatusPill';
import { alpha, appColors, fontStyles, radii } from '@/theme/theme';
import { Payment, PaymentMethod } from '@/types';
import { formatCurrency, formatDate } from '@/utils/format';

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash',
  upi: 'UPI',
  bank_transfer: 'Bank transfer',
  card: 'Card',
  cheque: 'Cheque',
  wallet: 'Wallet',
  other: 'Other'
};

const recordTone = (status: string) =>
  status === 'completed' ? 'paid' : status === 'failed' ? 'cancelled' : status === 'refunded' ? 'refunded' : 'pending';

type Props = {
  visible: boolean;
  payments: Payment[];
  loading?: boolean;
  onClose: () => void;
};

export function PaymentHistorySheet({ visible, payments, loading, onClose }: Props) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const insets = useSafeAreaInsets();
  const [translateY] = useState(() => new Animated.Value(600));
  const [backdropOpacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true })
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 600, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true })
      ]).start();
    }
  }, [visible, translateY, backdropOpacity]);

  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.1);
  const totalReceived = payments
    .filter((p) => p.type === 'receipt' && p.status === 'completed')
    .reduce((sum, p) => sum + p.amount, 0);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8, 9, 18, 0.55)', opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: colors.card, borderColor: cardBorder, paddingBottom: 16 + insets.bottom, transform: [{ translateY }] }
          ]}
        >
          <View style={styles.grabber}>
            <View style={[styles.grabberBar, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.18) }]} />
          </View>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.colors.onSurface }]}>Payment history</Text>
            {payments.length ? (
              <View style={[styles.totalChip, { backgroundColor: colors.accentSoft }]}>
                <Text style={[styles.totalChipText, { color: colors.accent }]}>{formatCurrency(totalReceived)} received</Text>
              </View>
            ) : null}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {payments.length === 0 ? (
              <View style={styles.empty}>
                <MaterialCommunityIcons name="cash-remove" size={32} color={theme.colors.onSurfaceVariant} />
                <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
                  {loading ? 'Loading payments...' : 'No payments recorded yet'}
                </Text>
              </View>
            ) : (
              payments.map((payment) => {
                const isRefund = payment.type === 'refund';
                return (
                  <View key={payment._id} style={[styles.row, { borderColor: cardBorder }]}>
                    <View style={[styles.iconWrap, { backgroundColor: alpha(isRefund ? colors.destructive : colors.accent, isDark ? 0.22 : 0.14) }]}>
                      <MaterialCommunityIcons
                        name={isRefund ? 'cash-refund' : 'cash-plus'}
                        size={18}
                        color={isRefund ? colors.destructive : colors.accent}
                      />
                    </View>
                    <View style={styles.rowBody}>
                      <View style={styles.rowTop}>
                        <Text style={[styles.rowMethod, { color: theme.colors.onSurface }]}>{METHOD_LABEL[payment.method] ?? payment.method}</Text>
                        <Text style={[styles.rowAmount, { color: isRefund ? colors.destructive : theme.colors.onSurface }]}>
                          {isRefund ? '-' : ''}{formatCurrency(payment.amount)}
                        </Text>
                      </View>
                      <View style={styles.rowMetaLine}>
                        <Text style={[styles.rowDate, { color: theme.colors.onSurfaceVariant }]}>{formatDate(payment.receivedAt ?? payment.createdAt ?? '')}</Text>
                        <StatusPill label={payment.status} tone={recordTone(payment.status)} />
                      </View>
                      {payment.reference ? (
                        <Text style={[styles.rowRef, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>
                          Ref: {payment.reference}
                        </Text>
                      ) : null}
                      {payment.notes ? (
                        <Text style={[styles.rowRef, { color: theme.colors.onSurfaceVariant }]} numberOfLines={2}>
                          {payment.notes}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: 10, paddingVertical: 36 },
  emptyText: { ...fontStyles.medium, fontSize: 13 },
  fill: { flex: 1, justifyContent: 'flex-end' },
  grabber: { alignItems: 'center', paddingTop: 8 },
  grabberBar: { borderRadius: radii.pill, height: 4, width: 38 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 8 },
  iconWrap: { alignItems: 'center', borderRadius: radii.pill, height: 38, justifyContent: 'center', width: 38 },
  row: { borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: 12, marginTop: 10, padding: 12 },
  rowAmount: { ...fontStyles.bold, fontSize: 15 },
  rowBody: { flex: 1, gap: 6, minWidth: 0 },
  rowDate: { ...fontStyles.regular, fontSize: 12 },
  rowMetaLine: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  rowMethod: { ...fontStyles.semiBold, fontSize: 14 },
  rowRef: { ...fontStyles.regular, fontSize: 12 },
  rowTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  scrollContent: { paddingBottom: 8, paddingHorizontal: 18, paddingTop: 4 },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    elevation: 24,
    maxHeight: '85%',
    paddingTop: 6,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.25,
    shadowRadius: 24
  },
  title: { ...fontStyles.bold, fontSize: 18, letterSpacing: -0.3 },
  totalChip: { borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 },
  totalChipText: { ...fontStyles.bold, fontSize: 11.5 }
});
