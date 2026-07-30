import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Text, TextInput, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, EXPENSE_PAYMENT_METHODS } from '@/constants/expenses';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import { Expense, ExpenseCategory, ExpensePayload, PaymentMethod } from '@/types';

type Props = {
  visible: boolean;
  expense: Expense | null;
  saving: boolean;
  onSubmit: (payload: ExpensePayload) => void;
  onClose: () => void;
};

const money = (value: string) => Math.round((Number(value) || 0) * 100) / 100;

/**
 * Bottom sheet matching ProductFormSheet / CustomItemSheet.
 *
 * Remounted per open via `key`, so the form state is seeded from `expense` at mount
 * instead of being resynced by an effect — a cancelled edit can never leak into the next
 * one, and there is no cascading render on open.
 */
export function ExpenseFormSheet({ visible, expense, saving, onSubmit, onClose }: Props) {
  return (
    <ExpenseFormSheetBody
      key={visible ? expense?._id ?? 'new' : 'closed'}
      visible={visible}
      expense={expense}
      saving={saving}
      onSubmit={onSubmit}
      onClose={onClose}
    />
  );
}

function ExpenseFormSheetBody({ visible, expense, saving, onSubmit, onClose }: Props) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const insets = useSafeAreaInsets();
  const [translateY] = useState(() => new Animated.Value(700));
  const [backdropOpacity] = useState(() => new Animated.Value(0));

  // Seeded once at mount — the wrapper remounts this body whenever the sheet opens.
  const [amount, setAmount] = useState(() => (expense ? String(expense.amount) : ''));
  const [taxAmount, setTaxAmount] = useState(() => (expense?.taxAmount ? String(expense.taxAmount) : ''));
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? 'other');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(expense?.paymentMethod ?? 'cash');
  const [vendorName, setVendorName] = useState(expense?.vendorName ?? '');
  const [notes, setNotes] = useState(expense?.notes ?? '');
  const [error, setError] = useState('');

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: visible ? 0 : 700, duration: visible ? 280 : 220, easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: visible ? 1 : 0, duration: visible ? 220 : 180, useNativeDriver: true })
    ]).start();
  }, [visible, translateY, backdropOpacity]);

  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.1);
  const inputBackground = isDark ? colors.surface : '#FFFFFF';
  const total = money(amount) + money(taxAmount);

  const submit = () => {
    if (money(amount) <= 0) {
      setError('Enter an amount greater than zero');
      return;
    }
    setError('');
    onSubmit({
      amount: money(amount),
      taxAmount: money(taxAmount),
      category,
      paymentMethod,
      vendorName: vendorName.trim(),
      notes: notes.trim()
    });
  };

  const inputProps = {
    mode: 'outlined' as const,
    outlineColor: theme.colors.outlineVariant,
    activeOutlineColor: theme.colors.primary,
    outlineStyle: styles.inputOutline,
    style: [styles.input, { backgroundColor: inputBackground }]
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8, 9, 18, 0.55)', opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[styles.sheet, { backgroundColor: colors.card, borderColor: cardBorder, paddingBottom: 12 + insets.bottom, transform: [{ translateY }] }]}
        >
          <View style={styles.grabber}>
            <View style={[styles.grabberBar, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.18) }]} />
          </View>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.colors.onSurface }]}>{expense ? 'Edit expense' : 'Record expense'}</Text>
            <Pressable onPress={onClose} hitSlop={8} style={[styles.closeBtn, { backgroundColor: alpha(colors.primary, isDark ? 0.18 : 0.08) }]}>
              <Feather name="x" size={16} color={theme.colors.onSurface} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
            <View style={styles.row}>
              <View style={styles.rowItem}>
                <TextInput {...inputProps} label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
              </View>
              <View style={styles.rowItem}>
                <TextInput {...inputProps} label="GST paid (optional)" value={taxAmount} onChangeText={setTaxAmount} keyboardType="decimal-pad" />
              </View>
            </View>
            {total > 0 ? (
              <Text style={[styles.totalHint, { color: theme.colors.onSurfaceVariant }]}>Total recorded: ₹{total.toLocaleString('en-IN')}</Text>
            ) : null}
            {error ? <Text style={[styles.error, { color: theme.colors.error }]}>{error}</Text> : null}

            <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>CATEGORY</Text>
            <View style={styles.chipWrap}>
              {EXPENSE_CATEGORIES.map((key) => {
                const active = key === category;
                return (
                  <Pressable
                    key={key}
                    onPress={() => setCategory(key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[styles.chip, { backgroundColor: active ? theme.colors.primary : 'transparent', borderColor: active ? theme.colors.primary : cardBorder }]}
                  >
                    <Text style={[styles.chipLabel, { color: active ? '#FFFFFF' : theme.colors.onSurface }]}>{EXPENSE_CATEGORY_LABELS[key]}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>PAID BY</Text>
            <View style={styles.chipWrap}>
              {EXPENSE_PAYMENT_METHODS.map((method) => {
                const active = method.key === paymentMethod;
                return (
                  <Pressable
                    key={method.key}
                    onPress={() => setPaymentMethod(method.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[styles.chip, { backgroundColor: active ? theme.colors.primary : 'transparent', borderColor: active ? theme.colors.primary : cardBorder }]}
                  >
                    <Text style={[styles.chipLabel, { color: active ? '#FFFFFF' : theme.colors.onSurface }]}>{method.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput {...inputProps} label="Paid to (optional)" value={vendorName} onChangeText={setVendorName} maxLength={120} />
            <TextInput {...inputProps} label="Note (optional)" value={notes} onChangeText={setNotes} multiline numberOfLines={2} maxLength={1000} />
          </ScrollView>

          <Pressable
            onPress={submit}
            disabled={saving}
            style={({ pressed }) => [styles.saveBtn, { backgroundColor: pressed ? colors.primaryStrong : theme.colors.primary, opacity: saving ? 0.8 : 1 }]}
          >
            {saving ? <ActivityIndicator size={16} color="#FFFFFF" /> : <Feather name="check" size={16} color="#FFFFFF" strokeWidth={3} />}
            <Text style={styles.saveLabel}>{expense ? 'Save changes' : 'Record expense'}</Text>
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  chip: { borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  chipLabel: { ...fontStyles.semiBold, fontSize: 12 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  closeBtn: { alignItems: 'center', borderRadius: radii.md, height: 30, justifyContent: 'center', width: 30 },
  error: { ...typeScale.caption, fontSize: 12, marginBottom: 8 },
  fill: { flex: 1, justifyContent: 'flex-end' },
  grabber: { alignItems: 'center', paddingVertical: 8 },
  grabberBar: { borderRadius: radii.pill, height: 4, width: 40 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 8, paddingHorizontal: 18 },
  input: { marginBottom: 10 },
  inputOutline: { borderRadius: radii.input },
  row: { flexDirection: 'row', gap: 12 },
  rowItem: { flex: 1 },
  saveBtn: { alignItems: 'center', borderRadius: radii.input, flexDirection: 'row', gap: 8, justifyContent: 'center', marginHorizontal: 18, marginTop: 4, paddingVertical: 14 },
  saveLabel: { ...fontStyles.bold, color: '#FFFFFF', fontSize: 14 },
  scrollContent: { paddingHorizontal: 18 },
  sectionLabel: { ...fontStyles.bold, fontSize: 10, letterSpacing: 1, marginBottom: 8 },
  sheet: { borderTopLeftRadius: radii.card, borderTopRightRadius: radii.card, borderWidth: 1, maxHeight: '88%' },
  title: { ...fontStyles.bold, fontSize: 17 },
  totalHint: { ...typeScale.caption, fontSize: 12, marginBottom: 10 }
});
