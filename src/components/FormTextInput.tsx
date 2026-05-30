import { Control, Controller, FieldValues, Path } from 'react-hook-form';
import { StyleSheet } from 'react-native';
import { HelperText, TextInput, TextInputProps, useTheme } from 'react-native-paper';
import { appColors, radii, spacing } from '@/theme/theme';

type Props<T extends FieldValues> = Omit<TextInputProps, 'value' | 'onChangeText'> & { control: Control<T>; name: Path<T> };

export function FormTextInput<T extends FieldValues>({ control, name, style, ...props }: Props<T>) {
  const theme = useTheme();
  const colors = appColors(theme.dark);
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
        <>
          <TextInput
            mode="outlined"
            value={value == null ? '' : String(value)}
            onBlur={onBlur}
            onChangeText={onChange}
            error={Boolean(error)}
            style={[styles.input, { backgroundColor: theme.dark ? colors.surface : colors.card }, style]}
            outlineStyle={styles.outline}
            outlineColor={theme.colors.outlineVariant}
            activeOutlineColor={theme.colors.primary}
            textColor={theme.colors.onSurface}
            placeholderTextColor={theme.colors.onSurfaceVariant}
            cursorColor={theme.colors.primary}
            selectionColor={colors.primarySoft}
            {...props}
          />
          {error?.message ? <HelperText type="error" visible>{error.message}</HelperText> : null}
        </>
      )}
    />
  );
}

const styles = StyleSheet.create({
  input: { marginBottom: spacing.gridGap },
  outline: { borderRadius: radii.input }
});
