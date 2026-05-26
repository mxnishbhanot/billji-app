import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Controller, useController } from 'react-hook-form';
import { Dialog, HelperText, Portal, Text, TextInput, useTheme } from 'react-native-paper';
import { fontStyles, radii, spacing, typeScale } from '@/theme/theme';

export const COUNTRY_CODES = [
  { code: '+91', country: 'IN', label: 'India' },
  { code: '+1', country: 'US', label: 'United States' },
  { code: '+44', country: 'GB', label: 'United Kingdom' },
  { code: '+61', country: 'AU', label: 'Australia' },
  { code: '+971', country: 'AE', label: 'UAE' },
  { code: '+966', country: 'SA', label: 'Saudi Arabia' },
  { code: '+65', country: 'SG', label: 'Singapore' },
  { code: '+49', country: 'DE', label: 'Germany' },
  { code: '+33', country: 'FR', label: 'France' },
  { code: '+81', country: 'JP', label: 'Japan' },
  { code: '+86', country: 'CN', label: 'China' },
  { code: '+55', country: 'BR', label: 'Brazil' },
  { code: '+27', country: 'ZA', label: 'South Africa' },
  { code: '+234', country: 'NG', label: 'Nigeria' },
  { code: '+254', country: 'KE', label: 'Kenya' },
];

type Props = { control: any; name?: string; phoneName?: string; codeName?: string; label?: string };

export function PhoneInput({ control, name, phoneName, codeName = 'countryCode', label = 'Phone' }: Props) {
  const theme = useTheme();
  const [pickerOpen, setPickerOpen] = useState(false);
  const codeController = useController({ control, name: codeName });
  const currentCode = codeController.field.value || '+91';
  const resolvedPhoneName = phoneName ?? name ?? 'phone';

  return (
    <Controller
      control={control}
      name={resolvedPhoneName}
      render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => {
        const handleDigitsChange = (text: string) => {
          onChange(text.replace(/[^0-9]/g, ''));
        };

        const handleCodeSelect = (entry: typeof COUNTRY_CODES[0]) => {
          codeController.field.onChange(entry.code);
          setPickerOpen(false);
        };

        return (
          <>
            <View style={styles.row}>
              <Pressable
                onPress={() => setPickerOpen(true)}
                style={[styles.codeButton, { backgroundColor: theme.colors.elevation.level1, borderColor: error ? theme.colors.error : theme.colors.outlineVariant }]}
              >
                <Text style={{ ...fontStyles.medium, color: theme.colors.onSurface }}>{currentCode}</Text>
                <Text style={{ ...typeScale.badgeLabel, color: theme.colors.onSurfaceVariant }}>▼</Text>
              </Pressable>
              <TextInput
                mode="outlined"
                label={label}
                value={value == null ? '' : String(value)}
                onBlur={onBlur}
                onChangeText={handleDigitsChange}
                error={Boolean(error)}
                keyboardType="phone-pad"
                maxLength={10}
                style={[styles.phoneInput, { backgroundColor: theme.colors.elevation.level1 }]}
                outlineStyle={styles.outline}
                outlineColor={theme.colors.outlineVariant}
                activeOutlineColor={theme.colors.primary}
              />
            </View>
            {error?.message ? <HelperText type="error" visible style={styles.helper}>{error.message}</HelperText> : null}
            <Portal>
              <Dialog visible={pickerOpen} onDismiss={() => setPickerOpen(false)}>
                <Dialog.Title>Select country code</Dialog.Title>
                <Dialog.ScrollArea style={{ maxHeight: 350 }}>
                  <FlatList
                    data={COUNTRY_CODES}
                    keyExtractor={(item) => item.code}
                    renderItem={({ item }) => (
                      <Pressable
                        onPress={() => handleCodeSelect(item)}
                        style={[styles.countryRow, item.code === currentCode && { backgroundColor: theme.colors.primaryContainer }]}
                      >
                        <Text style={{ ...fontStyles.medium, width: 50 }}>{item.code}</Text>
                        <Text>{item.label}</Text>
                      </Pressable>
                    )}
                  />
                </Dialog.ScrollArea>
              </Dialog>
            </Portal>
          </>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  codeButton: { borderRadius: radii.input, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: 'center', height: 56, paddingHorizontal: spacing.gridGap, marginBottom: spacing.gridGap },
  countryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.gridGap, paddingVertical: spacing.cardPaddingCompact, paddingHorizontal: spacing.cardPadding },
  helper: { marginTop: -8 },
  outline: { borderRadius: radii.input },
  phoneInput: { flex: 1, marginBottom: spacing.gridGap },
  row: { flexDirection: 'row', gap: 8 },
});
