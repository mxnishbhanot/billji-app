import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { UseFormReturn } from 'react-hook-form';
import { CategoryAutocomplete } from '@/components/CategoryAutocomplete';
import { FormTextInput } from '@/components/FormTextInput';
import { UnitInput } from '@/components/UnitInput';
import { DEFAULT_UNIT } from '@/constants/units';
import { alpha, appColors, fontStyles, radii } from '@/theme/theme';
import { ProductFormValues } from '@/types';

// Add / edit product as a bottom sheet (matches CustomerPickerSheet & filters).
// Replaces the old Paper Dialog so the inventory create flow feels consistent with
// the rest of the app and gives the form room for the category type-ahead and the
// tabbed unit picker.
type Props = {
  visible: boolean;
  isEdit: boolean;
  form: UseFormReturn<ProductFormValues>;
  categories: string[];
  categoriesLoading?: boolean;
  saving: boolean;
  onSubmit: () => void;
  onClose: () => void;
};

export function ProductFormSheet({ visible, isEdit, form, categories, categoriesLoading = false, saving, onSubmit, onClose }: Props) {
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
            <Text style={[styles.title, { color: theme.colors.onSurface }]}>{isEdit ? 'Edit product' : 'Add product'}</Text>
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
            <View style={styles.row}>
              <View style={styles.rowItem}>
                <FormTextInput control={form.control} name="price" label="Price" keyboardType="decimal-pad" />
              </View>
              <View style={styles.rowItem}>
                <FormTextInput control={form.control} name="stockQuantity" label="Stock" keyboardType="number-pad" />
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.rowItem}>
                <FormTextInput control={form.control} name="sku" label="SKU (optional)" autoCapitalize="characters" />
              </View>
              <View style={styles.rowItem}>
                <FormTextInput control={form.control} name="lowStockThreshold" label="Low stock alert" keyboardType="number-pad" />
              </View>
            </View>
            <CategoryAutocomplete control={form.control} name="category" categories={categories} />
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
            disabled={saving}
            style={({ pressed }) => [
              styles.saveBtn,
              {
                backgroundColor: pressed ? colors.primaryStrong : theme.colors.primary,
                shadowColor: isDark ? '#000000' : colors.primaryStrong,
                opacity: saving ? 0.8 : 1
              }
            ]}
          >
            {saving ? (
              <ActivityIndicator size={16} color="#FFFFFF" />
            ) : (
              <Feather name="check" size={16} color="#FFFFFF" strokeWidth={3} />
            )}
            <Text style={styles.saveLabel}>{isEdit ? 'Save changes' : 'Add product'}</Text>
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
  row: { flexDirection: 'row', gap: 12 },
  rowItem: { flex: 1 },
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
  unitBlock: { marginTop: 4 }
});
