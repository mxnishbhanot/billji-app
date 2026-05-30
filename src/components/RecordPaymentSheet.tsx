import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, TextInput, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, appColors, fontStyles, radii } from '@/theme/theme';
import { PaymentMethod, RecordPaymentPayload } from '@/types';
import { formatCurrency } from '@/utils/format';

const METHOD_OPTIONS: { label: string; value: PaymentMethod; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { label: 'Cash', value: 'cash', icon: 'cash' },
  { label: 'UPI', value: 'upi', icon: 'qrcode-scan' },
  { label: 'Bank', value: 'bank_transfer', icon: 'bank-outline' },
  { label: 'Card', value: 'card', icon: 'credit-card-outline' },
  { label: 'Cheque', value: 'cheque', icon: 'checkbook' },
  { label: 'Other', value: 'other', icon: 'dots-horizontal' }
];

type Props = {
  visible: boolean;
  balanceDue: number;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (payload: RecordPaymentPayload) => void;
};

export function RecordPaymentSheet({ visible, balanceDue, loading, onClose, onSubmit }: Props) {
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
  const [wasVisible, setWasVisible] = useState(false);

  // Reset the form on the closed -> open transition (render-phase state adjustment).
  if (visible && !wasVisible) {
    setWasVisible(true);
    setAmount(balanceDue > 0 ? String(balanceDue) : '');
    setMethod('cash');
    setReference('');
    setNotes('');
  } else if (!visible && wasVisible) {
    setWasVisible(false);
  }

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
  const canSubmit = numericAmount > 0 && !loading;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({ amount: numericAmount, method, reference: reference.trim() || undefined, notes: notes.trim() || undefined });
  };

  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.1);

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
            <Text style={[styles.title, { color: theme.colors.onSurface }]}>Record payment</Text>
            {balanceDue > 0 ? (
              <View style={[styles.balanceChip, { backgroundColor: alpha(colors.primary, isDark ? 0.24 : 0.12) }]}>
                <Text style={[styles.balanceChipText, { color: theme.colors.primary }]}>Due {formatCurrency(balanceDue)}</Text>
              </View>
            ) : null}
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <TextInput
              mode="outlined"
              label="Amount"
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
              left={<TextInput.Icon icon="currency-inr" />}
              style={styles.input}
            />

            <Text style={[styles.fieldLabel, { color: theme.colors.onSurfaceVariant }]}>METHOD</Text>
            <View style={styles.chipWrap}>
              {METHOD_OPTIONS.map((option) => {
                const active = method === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setMethod(option.value)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active ? alpha(theme.colors.primary, isDark ? 0.28 : 0.16) : 'transparent',
                        borderColor: active ? alpha(theme.colors.primary, isDark ? 0.55 : 0.45) : cardBorder
                      }
                    ]}
                  >
                    <MaterialCommunityIcons name={option.icon} size={14} color={active ? theme.colors.primary : theme.colors.onSurfaceVariant} />
                    <Text style={[styles.chipLabel, { color: active ? theme.colors.primary : theme.colors.onSurface }]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>

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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  balanceChip: { borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 },
  balanceChipText: { ...fontStyles.bold, fontSize: 11.5 },
  chip: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  chipLabel: { ...fontStyles.semiBold, fontSize: 12.5 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  fieldLabel: { ...fontStyles.bold, fontSize: 11, letterSpacing: 1.2, marginBottom: 10, marginTop: 16 },
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
