import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { HelperText, Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Controller, type UseFormReturn } from 'react-hook-form';
import { FormTextInput } from '@/components/FormTextInput';
import { UnitInput } from '@/components/UnitInput';
import { MoneyInput, QuantityInput } from '@/features/invoices/components/FormInputs';
import { DEFAULT_UNIT } from '@/constants/units';
import { alpha, appColors, fontStyles, radii } from '@/theme/theme';
import { CustomItemFormValues } from '@/types';

// Custom line item as a bottom sheet (matches ProductFormSheet & CustomerFormSheet).
// Replaces the old Paper Dialog so the invoice/order builder add-item flow feels
// consistent with the rest of the app.
type Props = {
  visible: boolean;
  form: UseFormReturn<CustomItemFormValues>;
  onSubmit: () => void;
  onClose: () => void;
};

export function CustomItemSheet({ visible, form, onSubmit, onClose }: Props) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const insets = useSafeAreaInsets();
  const [translateY] = useState(() => new Animated.Value(700));
  const [backdropOpacity] = useState(() => new Animated.Value(0));
  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.1);
  const inputBackground = isDark ? colors.surface : '#FFFFFF';

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true })
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 700, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true })
      ]).start();
    }
  }, [visible, translateY, backdropOpacity]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8, 9, 18, 0.55)', opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              borderColor: cardBorder,
              paddingBottom: 12 + insets.bottom,
              transform: [{ translateY }]
            }
          ]}
        >
          <View style={styles.grabber}>
            <View style={[styles.grabberBar, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.18) }]} />
          </View>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.colors.onSurface }]}>Custom item</Text>
            <Pressable onPress={onClose} hitSlop={8} style={[styles.closeBtn, { backgroundColor: alpha(colors.primary, isDark ? 0.18 : 0.08) }]}>
              <Feather name="x" size={16} color={theme.colors.onSurface} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          >
            <FormTextInput control={form.control} name="name" label="Name" autoCapitalize="words" />
            {/* Controller-driven like FormTextInput: price defaults to empty, so without a
                visible error a failed submit looked like the Add button doing nothing. */}
            <Controller
              control={form.control}
              name="price"
              render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
                <>
                  <MoneyInput
                    cardBorder={cardBorder}
                    inputBackground={inputBackground}
                    label="Price"
                    value={value}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    error={Boolean(error)}
                    activeOutlineColor={theme.colors.primary}
                    style={error?.message ? undefined : styles.field}
                  />
                  {error?.message ? <HelperText type="error" visible>{error.message}</HelperText> : null}
                </>
              )}
            />
            <Controller
              control={form.control}
              name="quantity"
              render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
                <>
                  <QuantityInput
                    cardBorder={cardBorder}
                    inputBackground={inputBackground}
                    label="Quantity"
                    value={value}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    error={Boolean(error)}
                    activeOutlineColor={theme.colors.primary}
                    style={error?.message ? undefined : styles.field}
                  />
                  {error?.message ? <HelperText type="error" visible>{error.message}</HelperText> : null}
                </>
              )}
            />
            <View style={styles.unitBlock}>
              <UnitInput
                value={form.watch('unit') || DEFAULT_UNIT}
                onChange={(value) => form.setValue('unit', value)}
                cardBorder={cardBorder}
                inputBackground={inputBackground}
              />
            </View>
          </ScrollView>

          <Pressable
            onPress={onSubmit}
            style={({ pressed }) => [
              styles.saveBtn,
              {
                backgroundColor: pressed ? colors.primaryStrong : theme.colors.primary,
                shadowColor: isDark ? '#000000' : colors.primaryStrong
              }
            ]}
          >
            <Feather name="plus" size={16} color="#FFFFFF" strokeWidth={3} />
            <Text style={styles.saveLabel}>Add item</Text>
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  closeBtn: { alignItems: 'center', borderRadius: radii.pill, height: 28, justifyContent: 'center', width: 28 },
  fill: { flex: 1, justifyContent: 'flex-end' },
  grabber: { alignItems: 'center', paddingTop: 8 },
  grabberBar: { borderRadius: radii.pill, height: 4, width: 38 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 8 },
  saveBtn: {
    alignItems: 'center',
    borderRadius: radii.lg,
    elevation: 4,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginHorizontal: 18,
    marginTop: 10,
    paddingVertical: 14,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 14
  },
  saveLabel: { ...fontStyles.bold, color: '#FFFFFF', fontSize: 14, letterSpacing: 0.2 },
  scrollContent: { paddingHorizontal: 18, paddingTop: 16 },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    elevation: 24,
    maxHeight: '92%',
    paddingTop: 6,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.25,
    shadowRadius: 24
  },
  title: { ...fontStyles.bold, fontSize: 18, letterSpacing: -0.3 },
  field: { marginBottom: 14 },
  unitBlock: { marginTop: 10 }
});
