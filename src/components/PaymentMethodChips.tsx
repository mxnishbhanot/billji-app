import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, useTheme } from 'react-native-paper';
import { alpha, fontStyles, radii } from '@/theme/theme';
import { PaymentMethod } from '@/types';

export const PAYMENT_METHOD_OPTIONS: { label: string; value: PaymentMethod; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { label: 'Cash', value: 'cash', icon: 'cash' },
  { label: 'UPI', value: 'upi', icon: 'qrcode-scan' },
  { label: 'Bank', value: 'bank_transfer', icon: 'bank-outline' },
  { label: 'Card', value: 'card', icon: 'credit-card-outline' },
  { label: 'Cheque', value: 'cheque', icon: 'checkbook' },
  { label: 'Other', value: 'other', icon: 'dots-horizontal' }
];

export function PaymentMethodChips({
  value,
  onChange,
  borderColor
}: {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  borderColor: string;
}) {
  const theme = useTheme();
  const isDark = theme.dark;

  return (
    <View style={styles.chipWrap}>
      {PAYMENT_METHOD_OPTIONS.map((option) => {
        const active = value === option.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[
              styles.chip,
              {
                backgroundColor: active ? alpha(theme.colors.primary, isDark ? 0.28 : 0.16) : 'transparent',
                borderColor: active ? alpha(theme.colors.primary, isDark ? 0.55 : 0.45) : borderColor
              }
            ]}
          >
            <MaterialCommunityIcons name={option.icon} size={14} color={active ? theme.colors.primary : theme.colors.onSurfaceVariant} />
            <Text style={[styles.chipLabel, { color: active ? theme.colors.primary : theme.colors.onSurface }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
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
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 }
});
