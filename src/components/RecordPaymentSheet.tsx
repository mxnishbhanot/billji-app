import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { Switch, Text, TextInput, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PaymentMethodChips } from '@/components/PaymentMethodChips';
import { splitDuesPayment } from '@/features/invoices/components/InvoiceBuilderParts';
import { alpha, appColors, fontStyles, radii } from '@/theme/theme';
import { PaymentMethod, RecordPaymentPayload } from '@/types';
import { formatCurrency } from '@/utils/format';

type Props = {
  visible: boolean;
  balanceDue: number;
  // Outstanding on the customer's OTHER unpaid invoices (excludes this one). When > 0,
  // the sheet offers a switch to settle those oldest-first alongside this invoice.
  previousDues?: number;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (payload: RecordPaymentPayload, settlePreviousDues: boolean) => void;
};

export function RecordPaymentSheet({ visible, balanceDue, previousDues = 0, loading, onClose, onSubmit }: Props) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const insets = useSafeAreaInsets();
  const [translateY] = useState(() => new Animated.Value(600));
  const [backdropOpacity] = useState(() => new Animated.Value(0));
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [settleDues, setSettleDues] = useState(false);
  const [wasVisible, setWasVisible] = useState(false);

  const hasPreviousDues = previousDues > 0;

  // Reset the form on the closed -> open transition (render-phase state adjustment).
  if (visible && !wasVisible) {
    setWasVisible(true);
    setAmount(balanceDue > 0 ? String(balanceDue) : '');
    setMethod('cash');
    setReference('');
    setNotes('');
    setSettleDues(false);
  } else if (!visible && wasVisible) {
    setWasVisible(false);
  }

  // Toggling "also settle previous dues" defaults the amount to clear everything
  // (this invoice + all previous dues); turning it off reverts to this invoice only.
  const toggleSettleDues = (value: boolean) => {
    setSettleDues(value);
    const target = value ? balanceDue + previousDues : balanceDue;
    setAmount(target > 0 ? String(Math.round(target * 100) / 100) : '');
  };

  useEffect(() => {
    Animated.parallel(
      visible
        ? [
            Animated.timing(translateY, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true })
          ]
        : [
            Animated.timing(translateY, { toValue: 600, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
            Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true })
          ]
    ).start();
  }, [visible, translateY, backdropOpacity]);

  // Hard cap: this invoice's due, or due + previous dues when settling those too.
  // Prevents recording a payment larger than what is actually owed.
  const maxAmount = Math.round((settleDues && hasPreviousDues ? balanceDue + previousDues : balanceDue) * 100) / 100;

  // Keep only digits + a single decimal point, then clamp to maxAmount.
  const onChangeAmount = (text: string) => {
    let cleaned = text.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    if (parts.length > 2) cleaned = `${parts[0]}.${parts.slice(1).join('')}`;
    if (cleaned === '' || cleaned === '.') {
      setAmount(cleaned);
      return;
    }
    const value = Number(cleaned);
    if (Number.isFinite(value) && maxAmount > 0 && value > maxAmount) cleaned = String(maxAmount);
    setAmount(cleaned);
  };

  const numericAmount = Number(amount || 0);
  const canSubmit = numericAmount > 0 && numericAmount <= maxAmount && !loading;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({ amount: numericAmount, method, reference: reference.trim() || undefined, notes: notes.trim() || undefined }, settleDues && hasPreviousDues);
  };

  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.1);
  // Preview how the entered amount splits when settling previous dues (oldest-first), mirroring the server.
  const split = settleDues && hasPreviousDues ? splitDuesPayment(numericAmount, previousDues, balanceDue) : null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
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
            <Text style={[styles.title, { color: theme.colors.onSurface }]}>Record payment</Text>
            {balanceDue > 0 ? (
              <View style={[styles.balanceChip, { backgroundColor: alpha(colors.primary, isDark ? 0.24 : 0.12) }]}>
                <Text style={[styles.balanceChipText, { color: theme.colors.primary }]}>Due {formatCurrency(balanceDue)}</Text>
              </View>
            ) : null}
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {hasPreviousDues ? (
              <View style={[styles.duesRow, { borderColor: cardBorder }]}>
                <View style={styles.duesText}>
                  <Text style={[styles.duesLabel, { color: theme.colors.onSurface }]}>Also settle previous dues</Text>
                  <Text style={[styles.duesSub, { color: theme.colors.onSurfaceVariant }]}>{formatCurrency(previousDues)} on earlier invoices</Text>
                </View>
                <Switch value={settleDues} onValueChange={toggleSettleDues} color={theme.colors.primary} />
              </View>
            ) : null}

            <TextInput
              mode="outlined"
              label="Amount"
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={onChangeAmount}
              left={<TextInput.Icon icon="currency-inr" />}
              style={styles.input}
            />
            {maxAmount > 0 ? (
              <Text style={[styles.amountHint, { color: theme.colors.onSurfaceVariant }]}>Maximum {formatCurrency(maxAmount)}</Text>
            ) : null}

            <Text style={[styles.fieldLabel, { color: theme.colors.onSurfaceVariant }]}>METHOD</Text>
            <PaymentMethodChips value={method} onChange={setMethod} borderColor={cardBorder} />

            {split ? (
              <View style={[styles.splitPanel, { backgroundColor: alpha(colors.primary, isDark ? 0.12 : 0.06), borderColor: cardBorder }]}>
                <View style={styles.splitRow}>
                  <Text style={[styles.splitLabel, { color: theme.colors.onSurfaceVariant }]}>To previous dues</Text>
                  <Text style={[styles.splitValue, { color: theme.colors.onSurface }]}>{formatCurrency(split.toDues)}</Text>
                </View>
                <View style={styles.splitRow}>
                  <Text style={[styles.splitLabel, { color: theme.colors.onSurfaceVariant }]}>To this invoice</Text>
                  <Text style={[styles.splitValue, { color: theme.colors.onSurface }]}>{formatCurrency(split.toInvoice)}</Text>
                </View>
                {split.invoiceRemaining > 0 ? (
                  <View style={styles.splitRow}>
                    <Text style={[styles.splitLabel, { color: theme.colors.onSurfaceVariant }]}>This invoice still due</Text>
                    <Text style={[styles.splitValue, { color: theme.colors.onSurface }]}>{formatCurrency(split.invoiceRemaining)}</Text>
                  </View>
                ) : null}
                {split.credit > 0 ? (
                  <View style={styles.splitRow}>
                    <Text style={[styles.splitLabel, { color: theme.colors.onSurfaceVariant }]}>Customer credit</Text>
                    <Text style={[styles.splitValue, { color: theme.colors.primary }]}>{formatCurrency(split.credit)}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            <TextInput mode="outlined" label="Reference (optional)" value={reference} onChangeText={setReference} style={styles.input} />
            <TextInput mode="outlined" label="Notes (optional)" value={notes} onChangeText={setNotes} multiline style={styles.input} />
          </ScrollView>

          <Pressable
            onPress={submit}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.submitBtn,
              {
                backgroundColor: canSubmit ? (pressed ? colors.primaryStrong : theme.colors.primary) : colors.surfaceContainerHigh,
                shadowColor: isDark ? '#000000' : colors.primaryStrong
              }
            ]}
          >
            <Feather name="check" size={16} color={canSubmit ? '#FFFFFF' : theme.colors.onSurfaceVariant} strokeWidth={3} />
            <Text style={[styles.submitLabel, { color: canSubmit ? '#FFFFFF' : theme.colors.onSurfaceVariant }]}>
              {loading ? 'Saving...' : 'Save payment'}
            </Text>
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  amountHint: { ...fontStyles.medium, fontSize: 11.5, marginLeft: 4, marginTop: 6 },
  balanceChip: { borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 },
  balanceChipText: { ...fontStyles.bold, fontSize: 11.5 },
  fieldLabel: { ...fontStyles.bold, fontSize: 11, letterSpacing: 1.2, marginBottom: 10, marginTop: 16 },
  duesRow: { alignItems: 'center', borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', gap: 12, justifyContent: 'space-between', marginTop: 12, paddingHorizontal: 14, paddingVertical: 12 },
  duesText: { flex: 1, minWidth: 0 },
  duesLabel: { ...fontStyles.semiBold, fontSize: 14 },
  duesSub: { ...fontStyles.medium, fontSize: 12, marginTop: 2 },
  splitPanel: { borderRadius: radii.lg, borderWidth: 1, gap: 8, marginTop: 16, padding: 14 },
  splitRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  splitLabel: { ...fontStyles.medium, fontSize: 13 },
  splitValue: { ...fontStyles.semiBold, fontSize: 13 },
  fill: { flex: 1, justifyContent: 'flex-end' },
  grabber: { alignItems: 'center', paddingTop: 8 },
  grabberBar: { borderRadius: radii.pill, height: 4, width: 38 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 8 },
  input: { marginTop: 12 },
  scrollContent: { paddingBottom: 8, paddingHorizontal: 18, paddingTop: 4 },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    elevation: 24,
    maxHeight: '90%',
    paddingTop: 6,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.25,
    shadowRadius: 24
  },
  submitBtn: {
    alignItems: 'center',
    borderRadius: radii.lg,
    elevation: 4,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginHorizontal: 18,
    marginTop: 12,
    paddingVertical: 14,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 14
  },
  submitLabel: { ...fontStyles.bold, fontSize: 14, letterSpacing: 0.2 },
  title: { ...fontStyles.bold, fontSize: 18, letterSpacing: -0.3 }
});
