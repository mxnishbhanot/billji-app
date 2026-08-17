import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { Text, TextInput, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, appColors, fontStyles, radii } from '@/theme/theme';
import { formatCurrency } from '@/utils/format';

type Props = {
  visible: boolean;
  balanceDue: number;
  availableCredit: number;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (amount: number) => void;
};

const money = (value: number) => Math.round(value * 100) / 100;

/**
 * Spending customer credit against one invoice. There is no source picker: the server
 * consumes the oldest credit first and the customer holds one pool, so asking which note to
 * spend would push an accounting distinction into a screen that does not need it.
 */
export function ApplyCreditSheet({ visible, balanceDue, availableCredit, loading, onClose, onSubmit }: Props) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const insets = useSafeAreaInsets();
  const [translateY] = useState(() => new Animated.Value(600));
  const [backdropOpacity] = useState(() => new Animated.Value(0));
  const [amount, setAmount] = useState('');
  const [wasVisible, setWasVisible] = useState(false);

  // Neither side can be exceeded: not the invoice, not the pool.
  const maxAmount = money(Math.min(balanceDue, availableCredit));

  // Reset on the closed -> open transition (render-phase state adjustment).
  if (visible && !wasVisible) {
    setWasVisible(true);
    setAmount(maxAmount > 0 ? String(maxAmount) : '');
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
  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.1);
  const inputBg = isDark ? colors.surfaceBright : theme.colors.surface;
  const inputOutline = isDark ? alpha(colors.outline, 0.8) : cardBorder;
  const submitInk = isDark ? '#241C67' : '#FFFFFF';

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
            <Text style={[styles.title, { color: theme.colors.onSurface }]}>Apply customer credit</Text>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <View style={[styles.panel, { backgroundColor: alpha(colors.primary, isDark ? 0.12 : 0.06), borderColor: cardBorder }]}>
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { color: theme.colors.onSurfaceVariant }]}>Invoice due</Text>
                <Text style={[styles.rowValue, { color: theme.colors.onSurface }]}>{formatCurrency(balanceDue)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { color: theme.colors.onSurfaceVariant }]}>Available credit</Text>
                <Text style={[styles.rowValue, { color: theme.colors.primary }]}>{formatCurrency(availableCredit)}</Text>
              </View>
            </View>

            <TextInput
              mode="outlined"
              label="Amount"
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={onChangeAmount}
              left={<TextInput.Icon icon="currency-inr" />}
              outlineColor={inputOutline}
              activeOutlineColor={theme.colors.primary}
              style={[styles.input, styles.amountInput, { backgroundColor: inputBg }]}
            />
            {maxAmount > 0 ? (
              <Pressable onPress={() => setAmount(String(maxAmount))} accessibilityRole="button">
                <Text style={[styles.maxHint, { color: theme.colors.primary }]}>Use max {formatCurrency(maxAmount)}</Text>
              </Pressable>
            ) : null}

            {/* Both remainders, live: the two numbers the user is actually deciding between. */}
            <View style={[styles.panel, { borderColor: cardBorder }]}>
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { color: theme.colors.onSurfaceVariant }]}>Remaining invoice due</Text>
                <Text style={[styles.rowValue, { color: theme.colors.onSurface }]}>{formatCurrency(money(balanceDue - numericAmount))}</Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { color: theme.colors.onSurfaceVariant }]}>Remaining credit</Text>
                <Text style={[styles.rowValue, { color: theme.colors.onSurface }]}>{formatCurrency(money(availableCredit - numericAmount))}</Text>
              </View>
            </View>
          </ScrollView>

          <Pressable
            onPress={() => canSubmit && onSubmit(numericAmount)}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.submitBtn,
              {
                backgroundColor: canSubmit ? (pressed ? colors.primaryStrong : theme.colors.primary) : colors.surfaceContainerHigh,
                shadowColor: isDark ? '#000000' : colors.primaryStrong
              }
            ]}
          >
            <Feather name="check" size={16} color={canSubmit ? submitInk : theme.colors.onSurfaceVariant} strokeWidth={3} />
            <Text style={[styles.submitLabel, { color: canSubmit ? submitInk : theme.colors.onSurfaceVariant }]}>
              {loading ? 'Applying...' : 'Apply credit'}
            </Text>
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  amountInput: { fontSize: 20 },
  fill: { flex: 1, justifyContent: 'flex-end' },
  grabber: { alignItems: 'center', paddingTop: 8 },
  grabberBar: { borderRadius: radii.pill, height: 4, width: 38 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 8 },
  input: { marginTop: 16 },
  maxHint: { ...fontStyles.bold, fontSize: 11.5, marginLeft: 4, marginTop: 6 },
  panel: { borderRadius: radii.lg, borderWidth: 1, gap: 8, marginTop: 16, padding: 14 },
  row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel: { ...fontStyles.medium, fontSize: 13 },
  rowValue: { ...fontStyles.semiBold, fontSize: 13 },
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
