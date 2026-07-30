import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { ActivityIndicator, Text, TextInput, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { purchasesApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { useAppDialog } from '@/components/AppDialog';
import { EXPENSE_PAYMENT_METHODS } from '@/constants/expenses';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import { PaymentMethod, PurchaseBill } from '@/types';
import { formatCurrency } from '@/utils/format';

const money = (value: string) => Math.round((Number(value) || 0) * 100) / 100;

export function PayVendorSheet({
  visible,
  bill,
  onClose,
  onPaid
}: {
  visible: boolean;
  bill: PurchaseBill | null;
  onClose: () => void;
  onPaid: () => void;
}) {
  // Remount per bill so the amount always starts from that bill's balance.
  return visible && bill ? <PayVendorSheetBody key={bill._id} bill={bill} onClose={onClose} onPaid={onPaid} /> : null;
}

function PayVendorSheetBody({ bill, onClose, onPaid }: { bill: PurchaseBill; onClose: () => void; onPaid: () => void }) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const insets = useSafeAreaInsets();
  const { showDialog } = useAppDialog();

  const [amount, setAmount] = useState(String(bill.balanceDue));
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');

  const pay = useMutation({
    mutationFn: () => purchasesApi.payVendor(bill.vendor, { amount: money(amount), method, billId: bill._id, reference: reference.trim() }),
    onSuccess: onPaid,
    onError: (apiError) => showDialog({ title: 'Could not record payment', message: apiErrorMessage(apiError), tone: 'error' })
  });

  const submit = () => {
    const value = money(amount);
    if (value <= 0) return setError('Enter an amount greater than zero');
    // Mirrors the server rule so the user is told before a round trip.
    if (value > bill.balanceDue) return setError(`This bill only has ${formatCurrency(bill.balanceDue)} outstanding`);
    setError('');
    pay.mutate();
  };

  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.1);
  const inputProps = {
    mode: 'outlined' as const,
    outlineColor: theme.colors.outlineVariant,
    activeOutlineColor: theme.colors.primary,
    outlineStyle: styles.inputOutline,
    style: [styles.input, { backgroundColor: isDark ? colors.surface : '#FFFFFF' }]
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: cardBorder, paddingBottom: 12 + insets.bottom }]}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: theme.colors.onSurface }]}>Pay {bill.vendorSnapshot?.name}</Text>
              <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
                {bill.billNumber} · {formatCurrency(bill.balanceDue)} outstanding
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={[styles.closeBtn, { backgroundColor: alpha(colors.primary, isDark ? 0.18 : 0.08) }]}>
              <Feather name="x" size={16} color={theme.colors.onSurface} />
            </Pressable>
          </View>

          <View style={styles.body}>
            <TextInput {...inputProps} label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" autoFocus />
            {error ? <Text style={[styles.error, { color: theme.colors.error }]}>{error}</Text> : null}

            <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>PAID BY</Text>
            <View style={styles.chipWrap}>
              {EXPENSE_PAYMENT_METHODS.map((option) => {
                const active = option.key === method;
                return (
                  <Pressable
                    key={option.key}
                    onPress={() => setMethod(option.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[styles.chip, { backgroundColor: active ? theme.colors.primary : 'transparent', borderColor: active ? theme.colors.primary : cardBorder }]}
                  >
                    <Text style={[styles.chipLabel, { color: active ? '#FFFFFF' : theme.colors.onSurface }]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput {...inputProps} label="Reference (optional)" value={reference} onChangeText={setReference} maxLength={160} />

            <Pressable
              onPress={submit}
              disabled={pay.isPending}
              style={({ pressed }) => [styles.saveBtn, { backgroundColor: pressed ? colors.primaryStrong : theme.colors.primary, opacity: pay.isPending ? 0.8 : 1 }]}
            >
              {pay.isPending ? <ActivityIndicator size={16} color="#FFFFFF" /> : <Feather name="check" size={16} color="#FFFFFF" strokeWidth={3} />}
              <Text style={styles.saveLabel}>Record payment</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(8, 9, 18, 0.55)', flex: 1 },
  body: { paddingHorizontal: 18 },
  chip: { borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  chipLabel: { ...fontStyles.semiBold, fontSize: 12 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  closeBtn: { alignItems: 'center', borderRadius: radii.md, height: 30, justifyContent: 'center', width: 30 },
  error: { ...typeScale.caption, fontSize: 12, marginBottom: 8 },
  fill: { flex: 1, justifyContent: 'flex-end' },
  header: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between', paddingBottom: 10, paddingHorizontal: 18, paddingTop: 16 },
  headerText: { flex: 1, minWidth: 0 },
  input: { marginBottom: 10 },
  inputOutline: { borderRadius: radii.input },
  saveBtn: { alignItems: 'center', borderRadius: radii.input, flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 4, paddingVertical: 14 },
  saveLabel: { ...fontStyles.bold, color: '#FFFFFF', fontSize: 14 },
  sectionLabel: { ...fontStyles.bold, fontSize: 10, letterSpacing: 1, marginBottom: 8 },
  sheet: { borderTopLeftRadius: radii.card, borderTopRightRadius: radii.card, borderWidth: 1 },
  subtitle: { ...typeScale.caption, fontSize: 12, marginTop: 2 },
  title: { ...fontStyles.bold, fontSize: 17 }
});
