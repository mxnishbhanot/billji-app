import { TextInput, TextInputProps } from 'react-native-paper';
import { radii } from '@/theme/theme';
import { sanitizeDecimal, sanitizeInteger } from '@/utils/number';

type Props = Omit<TextInputProps, 'mode'> & {
  cardBorder: string;
  inputBackground: string;
};

export function MoneyInput({ cardBorder, inputBackground, style, onChangeText, ...props }: Props) {
  return (
    <TextInput
      mode="outlined"
      keyboardType="decimal-pad"
      outlineColor={cardBorder}
      outlineStyle={{ borderRadius: radii.input }}
      style={[{ backgroundColor: inputBackground, fontSize: 14 }, style]}
      onChangeText={onChangeText ? (text) => onChangeText(sanitizeDecimal(text)) : undefined}
      {...props}
    />
  );
}

export function QuantityInput({ cardBorder, inputBackground, style, onChangeText, ...props }: Props) {
  return (
    <TextInput
      mode="outlined"
      keyboardType="number-pad"
      outlineColor={cardBorder}
      outlineStyle={{ borderRadius: radii.input }}
      style={[{ backgroundColor: inputBackground, fontSize: 14 }, style]}
      onChangeText={onChangeText ? (text) => onChangeText(sanitizeInteger(text)) : undefined}
      {...props}
    />
  );
}
