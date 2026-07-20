import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, TextInput, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PaymentMethodChips } from '@/components/PaymentMethodChips';
import { alpha, appColors, fontStyles, radii } from '@/theme/theme';
import { CustomerOutstanding, PaymentMethod } from '@/types';
import { formatCurrency, formatDate } from '@/utils/format';
import { sanitizeDecimal } from '@/utils/number';

type Props = {
  visible: boolean;
  outstanding: CustomerOutstanding;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (payload: { amount: number; method: PaymentMethod; invoiceIds: string[]; allowCredit: boolean; reference?: string }) => void;
};

export function CollectDuesSheet({ visible, outstanding, loading, onClose, onSubmit }: Props) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const insets = useSafeAreaInsets();
  const [translateY] = useState(() => new Animated.Value(600));
  const [backdropOpacity] = useState(() => new Animated.Value(0));
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  // Optionally target specific invoices. Empty = auto-apply oldest-first across all dues.
  const [selected, setSelected] = useState<string[]>([]);
  const [wasVisible, setWasVisible] = useState(false);

  // Reset the form on the closed -> open transition (render-phase state adjustment).
  if (visible && !wasVisible) {
    setWasVisible(true);
    setAmount(outstanding.totalOutstanding > 0 ? String(outstanding.totalOutstanding) : '');
    setMethod('cash');
    setReference('');
    setSelected([]);
  } else if (!visible && wasVisible) {
    setWasVisible(false);
  }

  const toggleInvoice = (id: string) => setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  // Targets stay in the (oldest-first) order the API returned them.
  const targetInvoices = selected.length ? outstanding.invoices.filter((invoice) => selected.includes(invoice.id)) : outstanding.invoices;
  const targetIds = targetInvoices.map((invoice) => invoice.id);
  const targetTotal = Math.round(targetInvoices.reduce((sum, invoice) => sum + invoice.balanceDue, 0) * 100) / 100;

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

  const numericAmount = Number(amount || 0);
  const exceedsTarget = numericAmount > targetTotal;
  const canSubmit = numericAmount > 0 && !exceedsTarget && targetIds.length > 0 && !loading;
  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.1);

  const submit = () => {
    if (!canSubmit) return;
    // Collecting dues never parks an advance — cap at the targeted invoices' balance.
    onSubmit({ amount: numericAmount, method, invoiceIds: targetIds, allowCredit: false, reference: reference.trim() || undefined });
  };

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
            <Text style={[styles.title, { color: theme.colors.onSurface }]}>Collect dues</Text>
            {outstanding.totalOutstanding > 0 ? (
              <View style={[styles.balanceChip, { backgroundColor: alpha(colors.warning, isDark ? 0.24 : 0.14) }]}>
                <Text style={[styles.balanceChipText, { color: colors.warning }]}>Due {formatCurrency(outstanding.totalOutstanding)}</Text>
              </View>
            ) : null}
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <TextInput
              mode="outlined"
              label="Amount"
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={(text) => setAmount(sanitizeDecimal(text))}
              left={<TextInput.Icon icon="currency-inr" />}
              error={exceedsTarget}
              style={styles.input}
            />
            <Text style={[styles.hint, { color: exceedsTarget ? theme.colors.error : theme.colors.onSurfaceVariant, marginTop: 6 }]}>
              {exceedsTarget ? `Max ${formatCurrency(targetTotal)} for the ${selected.length ? 'selected' : 'outstanding'} invoices` : `Max ${formatCurrency(targetTotal)}`}
            </Text>

            <Text style={[styles.fieldLabel, { color: theme.colors.onSurfaceVariant }]}>METHOD</Text>
            <PaymentMethodChips value={method} onChange={setMethod} borderColor={cardBorder} />

            <TextInput
              mode="outlined"
              label="UPI / cheque / bank ref (optional)"
              value={reference}
              onChangeText={setReference}
              style={styles.input}
            />

            <Text style={[styles.fieldLabel, { color: theme.colors.onSurfaceVariant }]}>APPLY TO</Text>
            <Text style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}>
              {selected.length ? 'Applied to selected invoices (oldest first).' : 'Auto-applied to oldest dues first. Tap to target specific invoices.'}
            </Text>
            {outstanding.invoices.map((invoice) => {
              const active = selected.includes(invoice.id);
              return (
                <Pressable
                  key={invoice.id}
                  onPress={() => toggleInvoice(invoice.id)}
                  style={[styles.invoiceRow, active ? { backgroundColor: alpha(theme.colors.primary, isDark ? 0.18 : 0.1), borderRadius: radii.md } : null]}
                >
                  <MaterialCommunityIcons
                    name={active ? 'checkbox-marked' : 'checkbox-blank-outline'}
                    size={20}
                    color={active ? theme.colors.primary : theme.colors.onSurfaceVariant}
                  />
                  <View style={styles.flex1}>
                    <Text style={[styles.invoiceNumber, { color: theme.colors.onSurface }]}>{invoice.invoiceNumber}</Text>
                    <Text style={[styles.invoiceMeta, { color: theme.colors.onSurfaceVariant }]}>{formatDate(invoice.date)}</Text>
                  </View>
                  <Text style={[styles.invoiceAmount, { color: theme.colors.onSurface }]}>{formatCurrency(invoice.balanceDue)}</Text>
                </Pressable>
              );
            })}
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
              {loading ? 'Saving...' : 'Collect payment'}
            </Text>
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  balanceChip: { borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 },
  balanceChipText: { ...fontStyles.bold, fontSize: 11.5 },
  fieldLabel: { ...fontStyles.bold, fontSize: 11, letterSpacing: 1.2, marginBottom: 10, marginTop: 16 },
  fill: { flex: 1, justifyContent: 'flex-end' },
  flex1: { flex: 1, minWidth: 0 },
  grabber: { alignItems: 'center', paddingTop: 8 },
  grabberBar: { borderRadius: radii.pill, height: 4, width: 38 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 8 },
  hint: { ...fontStyles.regular, fontSize: 11.5, marginBottom: 6, marginTop: -4 },
  input: { marginTop: 12 },
  invoiceAmount: { ...fontStyles.bold, fontSize: 13.5 },
  invoiceMeta: { ...fontStyles.regular, fontSize: 11.5, marginTop: 2 },
  invoiceNumber: { ...fontStyles.semiBold, fontSize: 13.5 },
  invoiceRow: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between', marginVertical: 3, paddingHorizontal: 8, paddingVertical: 10 },
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
