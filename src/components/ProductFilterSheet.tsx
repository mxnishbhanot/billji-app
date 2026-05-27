import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, appColors, fontStyles, radii } from '@/theme/theme';

export type ProductStockPreset = 'all' | 'available' | 'low' | 'out';
export type ProductPricePreset = 'any' | 'under-500' | '500-2000' | 'over-2000';
export type ProductSortOption = 'updated' | 'top-sales' | 'name-asc' | 'price-high' | 'price-low' | 'stock-low';

export type ProductFilterValues = {
  category: string;
  stockStatus: ProductStockPreset;
  priceRange: ProductPricePreset;
  sort: ProductSortOption;
};

export const defaultProductFilterValues: ProductFilterValues = {
  category: '',
  stockStatus: 'all',
  priceRange: 'any',
  sort: 'updated'
};

export const resolveProductPriceRange = (preset: ProductPricePreset): { minPrice: string; maxPrice: string } => {
  if (preset === 'under-500') return { minPrice: '', maxPrice: '500' };
  if (preset === '500-2000') return { minPrice: '500', maxPrice: '2000' };
  if (preset === 'over-2000') return { minPrice: '2000', maxPrice: '' };
  return { minPrice: '', maxPrice: '' };
};

const STOCK_OPTIONS: { label: string; value: ProductStockPreset; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { label: 'All', value: 'all', icon: 'package-variant-closed' },
  { label: 'Available', value: 'available', icon: 'check-circle-outline' },
  { label: 'Low stock', value: 'low', icon: 'alert-circle-outline' },
  { label: 'Out', value: 'out', icon: 'close-circle-outline' }
];

const PRICE_OPTIONS: { label: string; value: ProductPricePreset; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { label: 'Any', value: 'any', icon: 'tag-outline' },
  { label: 'Under ₹500', value: 'under-500', icon: 'tag-outline' },
  { label: '₹500 – ₹2k', value: '500-2000', icon: 'tag-multiple-outline' },
  { label: 'Over ₹2k', value: 'over-2000', icon: 'tag-heart-outline' }
];

const SORT_OPTIONS: { label: string; value: ProductSortOption; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { label: 'Recently updated', value: 'updated', icon: 'arrow-down' },
  { label: 'Top sales', value: 'top-sales', icon: 'chart-line' },
  { label: 'Name A-Z', value: 'name-asc', icon: 'sort-alphabetical-ascending' },
  { label: 'Highest price', value: 'price-high', icon: 'cash-plus' },
  { label: 'Lowest price', value: 'price-low', icon: 'cash-minus' },
  { label: 'Lowest stock', value: 'stock-low', icon: 'sort-numeric-ascending' }
];

type Props = {
  visible: boolean;
  values: ProductFilterValues;
  categories?: string[];
  categoriesLoading?: boolean;
  onChange: (values: ProductFilterValues) => void;
  onClose: () => void;
  onApply: () => void;
};

export function ProductFilterSheet({ visible, values, categories = [], categoriesLoading = false, onChange, onClose, onApply }: Props) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const insets = useSafeAreaInsets();
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [translateY] = useState(() => new Animated.Value(600));
  const [backdropOpacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true })
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 600, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true })
      ]).start(() => setCategoryOpen(false));
    }
  }, [visible, translateY, backdropOpacity]);

  const setField = <K extends keyof ProductFilterValues>(key: K, value: ProductFilterValues[K]) => onChange({ ...values, [key]: value });
  const reset = () => onChange(defaultProductFilterValues);
  const selectCategory = (category: string) => {
    setField('category', category);
    setCategoryOpen(false);
  };

  const renderChip = <T,>(opt: { label: string; value: T; icon: keyof typeof MaterialCommunityIcons.glyphMap }, active: boolean, onPress: () => void) => (
    <Pressable
      key={String(opt.value)}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? alpha(theme.colors.primary, isDark ? 0.28 : 0.16) : 'transparent',
          borderColor: active ? alpha(theme.colors.primary, isDark ? 0.55 : 0.45) : isDark ? colors.border : alpha(colors.primaryStrong, 0.2)
        }
      ]}
    >
      <MaterialCommunityIcons
        name={opt.icon}
        size={14}
        color={active ? theme.colors.primary : theme.colors.onSurfaceVariant}
      />
      <Text style={[styles.chipLabel, { color: active ? theme.colors.primary : theme.colors.onSurface }]}>{opt.label}</Text>
      {active ? <Feather name="check" size={12} color={theme.colors.primary} /> : null}
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8, 9, 18, 0.55)', opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.1),
              paddingBottom: 16 + insets.bottom,
              transform: [{ translateY }]
            }
          ]}
        >
          <View style={styles.grabber}>
            <View style={[styles.grabberBar, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.18) }]} />
          </View>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.colors.onSurface }]}>Filter products</Text>
            <Pressable onPress={reset} style={styles.resetBtn} hitSlop={8}>
              <Feather name="rotate-ccw" size={14} color={theme.colors.primary} />
              <Text style={[styles.resetLabel, { color: theme.colors.primary }]}>Reset</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>CATEGORY</Text>
              <Pressable
                onPress={() => setCategoryOpen((open) => !open)}
                style={[styles.categorySelect, { backgroundColor: isDark ? colors.surface : colors.card, borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.18) }]}
              >
                <View style={styles.categorySelectLeft}>
                  <Feather name="folder" size={16} color={theme.colors.onSurfaceVariant} />
                  <Text numberOfLines={1} style={[styles.categorySelectText, { color: values.category ? theme.colors.onSurface : theme.colors.onSurfaceVariant }]}>
                    {values.category || 'All categories'}
                  </Text>
                </View>
                {categoriesLoading ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <Feather name={categoryOpen ? 'chevron-up' : 'chevron-down'} size={16} color={theme.colors.onSurfaceVariant} />
                )}
              </Pressable>
              {categoryOpen ? (
                <View style={[styles.dropdown, { backgroundColor: colors.card, borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.12) }]}>
                  <Pressable onPress={() => selectCategory('')} style={styles.dropdownItem}>
                    <Text style={[styles.dropdownText, { color: theme.colors.onSurface }]}>All categories</Text>
                    {!values.category ? <Feather name="check" size={14} color={theme.colors.primary} /> : null}
                  </Pressable>
                  {categories.map((category) => (
                    <Pressable key={category} onPress={() => selectCategory(category)} style={styles.dropdownItem}>
                      <Text numberOfLines={1} style={[styles.dropdownText, { color: theme.colors.onSurface }]}>{category}</Text>
                      {values.category === category ? <Feather name="check" size={14} color={theme.colors.primary} /> : null}
                    </Pressable>
                  ))}
                  {!categoriesLoading && !categories.length ? (
                    <Text style={[styles.dropdownEmpty, { color: theme.colors.onSurfaceVariant }]}>No saved categories yet</Text>
                  ) : null}
                </View>
              ) : null}
            </View>

            <View style={[styles.divider, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08) }]} />

            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>STOCK</Text>
              <View style={styles.chipWrap}>
                {STOCK_OPTIONS.map((opt) => renderChip(opt, values.stockStatus === opt.value, () => setField('stockStatus', opt.value)))}
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08) }]} />

            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>PRICE RANGE</Text>
              <View style={styles.chipWrap}>
                {PRICE_OPTIONS.map((opt) => renderChip(opt, values.priceRange === opt.value, () => setField('priceRange', opt.value)))}
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08) }]} />

            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>SORT BY</Text>
              <View style={styles.chipWrap}>
                {SORT_OPTIONS.map((opt) => renderChip(opt, values.sort === opt.value, () => setField('sort', opt.value)))}
              </View>
            </View>
          </ScrollView>

          <Pressable
            onPress={onApply}
            style={({ pressed }) => [
              styles.applyBtn,
              {
                backgroundColor: pressed ? colors.primaryStrong : theme.colors.primary,
                shadowColor: isDark ? '#000000' : colors.primaryStrong
              }
            ]}
          >
            <Feather name="check" size={16} color="#FFFFFF" strokeWidth={3} />
            <Text style={styles.applyLabel}>Apply filters</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  applyBtn: {
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
  applyLabel: { ...fontStyles.bold, color: '#FFFFFF', fontSize: 14, letterSpacing: 0.2 },
  categorySelect: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  categorySelectLeft: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 10, minWidth: 0 },
  categorySelectText: { ...fontStyles.medium, flex: 1, fontSize: 14 },
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
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  divider: { height: 1, marginHorizontal: 18, marginVertical: 4 },
  dropdown: { borderRadius: radii.md, borderWidth: 1, overflow: 'hidden' },
  dropdownEmpty: { ...fontStyles.medium, fontSize: 12, paddingHorizontal: 12, paddingVertical: 10 },
  dropdownItem: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between', minHeight: 40, paddingHorizontal: 12, paddingVertical: 9 },
  dropdownText: { ...fontStyles.semiBold, flex: 1, fontSize: 13 },
  fill: { flex: 1, justifyContent: 'flex-end' },
  grabber: { alignItems: 'center', paddingTop: 8 },
  grabberBar: { borderRadius: radii.pill, height: 4, width: 38 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 8 },
  resetBtn: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  resetLabel: { ...fontStyles.bold, fontSize: 12 },
  scrollContent: { paddingBottom: 4 },
  section: { gap: 10, paddingHorizontal: 18, paddingVertical: 14 },
  sectionLabel: { ...fontStyles.bold, fontSize: 11, letterSpacing: 1.2 },
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
  title: { ...fontStyles.bold, fontSize: 18, letterSpacing: -0.3 }
});
