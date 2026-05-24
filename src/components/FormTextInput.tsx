import { Controller } from 'react-hook-form';
import { StyleSheet } from 'react-native';
import { TextInput, TextInputProps, useTheme } from 'react-native-paper';

type Props = Omit<TextInputProps, 'value' | 'onChangeText'> & { control: any; name: string };

export function FormTextInput({ control, name, style, ...props }: Props) {
  const theme = useTheme();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
        <TextInput
          mode="outlined"
          value={value == null ? '' : String(value)}
          onBlur={onBlur}
          onChangeText={onChange}
          error={Boolean(error)}
          style={[styles.input, { backgroundColor: theme.colors.elevation.level1 }, style]}
          outlineStyle={styles.outline}
          outlineColor={theme.colors.outlineVariant}
          activeOutlineColor={theme.colors.primary}
          {...props}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  input: { marginBottom: 12 },
  outline: { borderRadius: 18 }
});
