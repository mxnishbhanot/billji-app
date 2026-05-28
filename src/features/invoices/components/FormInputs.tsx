import { TextInput, TextInputProps } from 'react-native-paper';
import { radii } from '@/theme/theme';

type Props = Omit<TextInputProps, 'mode'> & {
  cardBorder: string;
  inputBackground: string;
};

export function MoneyInput({ cardBorder, inputBackground, style, ...props }: Props) {
  return (
    <TextInput
      mode="outlined"
      keyboardType="decimal-pad"
      outlineColor={cardBorder}
      outlineStyle={{ borderRadius: radii.input }}
      style={[{ backgroundColor: inputBackground, fontSize: 14 }, style]}
      {...props}
    />
  );
}

export function QuantityInput({ cardBorder, inputBackground, style, ...props }: Props) {
  return (
    <TextInput
      mode="outlined"
      keyboardType="number-pad"
      outlineColor={cardBorder}
      outlineStyle={{ borderRadius: radii.input }}
      style={[{ backgroundColor: inputBackground, fontSize: 14 }, style]}
      {...props}
    />
  );
}
