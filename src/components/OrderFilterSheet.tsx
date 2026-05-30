import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, appColors, fontStyles, radii } from '@/theme/theme';
import { InvoicePaymentStatus, OrderFulfillmentStatus, OrderStatus } from '@/types';

export type OrderDateRangePreset = 'all' | 'today' | 'week' | 'month' | 'last-month';
export type OrderAmountRangePreset = 'any' | 'under-5k' | '5k-15k' | 'over-15k';
export type OrderSortOption = 'newest' | 'oldest' | 'amount-high' | 'amount-low';

export type OrderFilterValues = {
  orderStatus: '' | OrderStatus;
  paymentStatus: '' | InvoicePaymentStatus;
  fulfillmentStatus: '' | OrderFulfillmentStatus;
  dateRange: OrderDateRangePreset;
  amountRange: OrderAmountRangePreset;
  sort: OrderSortOption;
};

export const defaultOrderFilterValues: OrderFilterValues = {
  orderStatus: '',
  paymentStatus: '',
  fulfillmentStatus: '',
  dateRange: 'all',
  amountRange: 'any',
  sort: 'newest'
};

const pad = (value: number) => String(value).padStart(2, '0');
const formatISODate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const resolveOrderDateRange = (preset: OrderDateRangePreset): { from: string; to: string } => {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfToday = formatISODate(today);

  if (preset === 'today') return { from: endOfToday, to: endOfToday };
  if (preset === 'week') {
    const weekStart = new Date(start);
    weekStart.setDate(start.getDate() - 6);
    return { from: formatISODate(weekStart), to: endOfToday };
  }
  if (preset === 'month') {
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: formatISODate(monthStart), to: endOfToday };
  }
  if (preset === 'last-month') {
    const monthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
    return { from: formatISODate(monthStart), to: formatISODate(monthEnd) };
  }
  return { from: '', to: '' };
};

export const resolveOrderAmountRange = (preset: OrderAmountRangePreset): { minAmount: string; maxAmount: string } => {
  if (preset === 'under-5k') return { minAmount: '', maxAmount: '5000' };
  if (preset === '5k-15k') return { minAmount: '5000', maxAmount: '15000' };
  if (preset === 'over-15k') return { minAmount: '15000', maxAmount: '' };
  return { minAmount: '', maxAmount: '' };
};

const STATUS_OPTIONS: { label: string; value: OrderFilterValues['orderStatus']; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { label: 'All', value: '', icon: 'inbox-multiple' },
  { label: 'Draft', value: 'draft', icon: 'file-document-edit-outline' },
  { label: 'Confirmed', value: 'confirmed', icon: 'check-decagram' },
  { label: 'Fulfilled', value: 'fulfilled', icon: 'truck-check-outline' },
  { label: 'Cancelled', value: 'cancelled', icon: 'close-circle-outline' }
];

const PAYMENT_OPTIONS: { label: string; value: OrderFilterValues['paymentStatus']; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { label: 'All', value: '', icon: 'cash-multiple' },
  { label: 'Unpaid', value: 'unpaid', icon: 'cash-remove' },
  { label: 'Partial', value: 'partial', icon: 'cash-clock' },
  { label: 'Paid', value: 'paid', icon: 'cash-check' },
  { label: 'Refunded', value: 'refunded', icon: 'cash-refund' }
];

const FULFILLMENT_OPTIONS: { label: string; value: OrderFilterValues['fulfillmentStatus']; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { label: 'All', value: '', icon: 'truck-outline' },
  { label: 'Pending', value: 'pending', icon: 'truck-fast-outline' },
  { label: 'Delivered', value: 'delivered', icon: 'truck-check-outline' },
  { label: 'Returned', value: 'returned', icon: 'truck-remove-outline' },
  { label: 'Not applicable', value: 'not_applicable', icon: 'minus-circle-outline' }
];

const DATE_OPTIONS: { label: string; value: OrderDateRangePreset; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { label: 'Any time', value: 'all', icon: 'calendar-blank-outline' },
  { label: 'This week', value: 'week', icon: 'calendar-week-outline' },
  { label: 'This month', value: 'month', icon: 'calendar-month-outline' },
  { label: 'Last month', value: 'last-month', icon: 'calendar-arrow-left' }
];

const AMOUNT_OPTIONS: { label: string; value: OrderAmountRangePreset; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { label: 'Any', value: 'any', icon: 'tag-outline' },
  { label: 'Under ₹5k', value: 'under-5k', icon: 'tag-outline' },
  { label: '₹5k - ₹15k', value: '5k-15k', icon: 'tag-multiple-outline' },
  { label: 'Over ₹15k', value: 'over-15k', icon: 'tag-heart-outline' }
];

const SORT_OPTIONS: { label: string; value: OrderSortOption; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { label: 'Newest', value: 'newest', icon: 'arrow-down' },
  { label: 'Oldest', value: 'oldest', icon: 'arrow-up' },
  { label: 'Highest amount', value: 'amount-high', icon: 'cash-plus' },
  { label: 'Lowest amount', value: 'amount-low', icon: 'cash-minus' }
];

type Props = {
  visible: boolean;
  values: OrderFilterValues;
  onChange: (values: OrderFilterValues) => void;
  onClose: () => void;
  onApply: () => void;
};

export function OrderFilterSheet({ visible, values, onChange, onClose, onApply }: Props) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const insets = useSafeAreaInsets();
  const [translateY] = useState(() => new Animated.Value(650));
  const [backdropOpacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true })
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 650, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true })
      ]).start();
    }
  }, [visible, translateY, backdropOpacity]);

  const setField = <K extends keyof OrderFilterValues>(key: K, value: OrderFilterValues[K]) => onChange({ ...values, [key]: value });
  const reset = () => onChange(defaultOrderFilterValues);

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
      <MaterialCommunityIcons name={opt.icon} size={14} color={active ? theme.colors.primary : theme.colors.onSurfaceVariant} />
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
            <Text style={[styles.title, { color: theme.colors.onSurface }]}>Filter orders</Text>
            <Pressable onPress={reset} style={styles.resetBtn} hitSlop={8}>
              <Feather name="rotate-ccw" size={14} color={theme.colors.primary} />
              <Text style={[styles.resetLabel, { color: theme.colors.primary }]}>Reset</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>ORDER STATUS</Text>
              <View style={styles.chipWrap}>{STATUS_OPTIONS.map((opt) => renderChip(opt, values.orderStatus === opt.value, () => setField('orderStatus', opt.value)))}</View>
            </View>

            <View style={[styles.divider, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08) }]} />

            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>PAYMENT STATUS</Text>
              <View style={styles.chipWrap}>{PAYMENT_OPTIONS.map((opt) => renderChip(opt, values.paymentStatus === opt.value, () => setField('paymentStatus', opt.value)))}</View>
            </View>

            <View style={[styles.divider, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08) }]} />

            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>FULFILLMENT</Text>
              <View style={styles.chipWrap}>{FULFILLMENT_OPTIONS.map((opt) => renderChip(opt, values.fulfillmentStatus === opt.value, () => setField('fulfillmentStatus', opt.value)))}</View>
            </View>

            <View style={[styles.divider, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08) }]} />

            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>DATE RANGE</Text>
              <View style={styles.chipWrap}>{DATE_OPTIONS.map((opt) => renderChip(opt, values.dateRange === opt.value, () => setField('dateRange', opt.value)))}</View>
            </View>

            <View style={[styles.divider, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08) }]} />

            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>AMOUNT RANGE</Text>
              <View style={styles.chipWrap}>{AMOUNT_OPTIONS.map((opt) => renderChip(opt, values.amountRange === opt.value, () => setField('amountRange', opt.value)))}</View>
            </View>

            <View style={[styles.divider, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08) }]} />

            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>SORT BY</Text>
              <View style={styles.chipWrap}>{SORT_OPTIONS.map((opt) => renderChip(opt, values.sort === opt.value, () => setField('sort', opt.value)))}</View>
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
