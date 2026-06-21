import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Control, Controller, FieldValues, Path, useController } from 'react-hook-form';
import { HelperText, Text, TextInput, useTheme } from 'react-native-paper';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, appColors, fontStyles, radii, spacing, typeScale } from '@/theme/theme';

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

type Props<T extends FieldValues> = { control: Control<T>; name?: Path<T>; phoneName?: Path<T>; codeName?: Path<T>; label?: string };

export function PhoneInput<T extends FieldValues>({ control, name, phoneName, codeName = 'countryCode' as Path<T>, label = 'Phone' }: Props<T>) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const insets = useSafeAreaInsets();
  const [pickerOpen, setPickerOpen] = useState(false);
  const codeController = useController({ control, name: codeName });
  const currentCode = codeController.field.value || '+91';
  const resolvedPhoneName = phoneName ?? name ?? ('phone' as Path<T>);

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
            <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)} statusBarTranslucent>
              <Pressable style={styles.pickerBackdrop} onPress={() => setPickerOpen(false)}>
                <Pressable
                  style={[styles.pickerCard, { backgroundColor: colors.card, borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.1), marginBottom: insets.bottom }]}
                  onPress={() => {}}
                >
                  <View style={styles.pickerHeader}>
                    <Text style={[styles.pickerTitle, { color: theme.colors.onSurface }]}>Select country code</Text>
                    <Pressable onPress={() => setPickerOpen(false)} hitSlop={8} style={[styles.pickerClose, { backgroundColor: alpha(colors.primary, isDark ? 0.18 : 0.08) }]}>
                      <Feather name="x" size={16} color={theme.colors.onSurface} />
                    </Pressable>
                  </View>
                  <FlatList
                    data={COUNTRY_CODES}
                    keyExtractor={(item) => item.code}
                    style={styles.pickerList}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => (
                      <Pressable
                        onPress={() => handleCodeSelect(item)}
                        style={[styles.countryRow, item.code === currentCode && { backgroundColor: theme.colors.primaryContainer }]}
                      >
                        <Text style={{ ...fontStyles.medium, color: theme.colors.onSurface, width: 50 }}>{item.code}</Text>
                        <Text style={{ color: theme.colors.onSurface }}>{item.label}</Text>
                      </Pressable>
                    )}
                  />
                </Pressable>
              </Pressable>
            </Modal>
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
  pickerBackdrop: { backgroundColor: 'rgba(8, 9, 18, 0.55)', flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  pickerCard: { borderRadius: radii.lg, borderWidth: 1, elevation: 24, maxHeight: '70%', overflow: 'hidden', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 24 },
  pickerClose: { alignItems: 'center', borderRadius: radii.pill, height: 28, justifyContent: 'center', width: 28 },
  pickerHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 16 },
  pickerList: { paddingVertical: 8 },
  pickerTitle: { ...fontStyles.bold, fontSize: 16, letterSpacing: -0.3 },
  row: { flexDirection: 'row', gap: 8 },
});
