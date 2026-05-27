import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, appColors, fontStyles, radii } from '@/theme/theme';

export type CustomerBillingStatus = 'all' | 'invoiced' | 'notInvoiced' | 'pending' | 'paid';
export type CustomerSortOption = 'updated' | 'newest' | 'oldest' | 'name-asc';

export type CustomerFilterValues = {
  billingStatus: CustomerBillingStatus;
  sort: CustomerSortOption;
};

export const defaultCustomerFilterValues: CustomerFilterValues = {
  billingStatus: 'all',
  sort: 'updated'
};

const BILLING_OPTIONS: { label: string; value: CustomerBillingStatus; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { label: 'All customers', value: 'all', icon: 'account-group-outline' },
  { label: 'Has invoices', value: 'invoiced', icon: 'file-document-check-outline' },
  { label: 'Never invoiced', value: 'notInvoiced', icon: 'file-document-remove-outline' },
  { label: 'Pending payment', value: 'pending', icon: 'clock-outline' },
  { label: 'Paid invoice', value: 'paid', icon: 'check-decagram-outline' }
];

const SORT_OPTIONS: { label: string; value: CustomerSortOption; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { label: 'Recently updated', value: 'updated', icon: 'arrow-down' },
  { label: 'Newest customers', value: 'newest', icon: 'account-plus-outline' },
  { label: 'Oldest customers', value: 'oldest', icon: 'history' },
  { label: 'Name A-Z', value: 'name-asc', icon: 'sort-alphabetical-ascending' }
];

type Props = {
  visible: boolean;
  values: CustomerFilterValues;
  onChange: (values: CustomerFilterValues) => void;
  onClose: () => void;
  onApply: () => void;
};

export function CustomerFilterSheet({ visible, values, onChange, onClose, onApply }: Props) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const insets = useSafeAreaInsets();
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
      ]).start();
    }
  }, [visible, translateY, backdropOpacity]);

  const reset = () => onChange(defaultCustomerFilterValues);
  const setField = <K extends keyof CustomerFilterValues>(key: K, value: CustomerFilterValues[K]) => onChange({ ...values, [key]: value });

  const renderChip = <T,>(option: { label: string; value: T; icon: keyof typeof MaterialCommunityIcons.glyphMap }, active: boolean, onPress: () => void) => (
    <Pressable
      key={String(option.value)}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? alpha(theme.colors.primary, isDark ? 0.28 : 0.16) : 'transparent',
          borderColor: active ? alpha(theme.colors.primary, isDark ? 0.55 : 0.45) : isDark ? colors.border : alpha(colors.primaryStrong, 0.2)
        }
      ]}
    >
      <MaterialCommunityIcons name={option.icon} size={14} color={active ? theme.colors.primary : theme.colors.onSurfaceVariant} />
      <Text style={[styles.chipLabel, { color: active ? theme.colors.primary : theme.colors.onSurface }]}>{option.label}</Text>
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
            <Text style={[styles.title, { color: theme.colors.onSurface }]}>Filter customers</Text>
            <Pressable onPress={reset} style={styles.resetBtn} hitSlop={8}>
              <Feather name="rotate-ccw" size={14} color={theme.colors.primary} />
              <Text style={[styles.resetLabel, { color: theme.colors.primary }]}>Reset</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>BILLING ACTIVITY</Text>
              <View style={styles.chipWrap}>
                {BILLING_OPTIONS.map((option) => renderChip(option, values.billingStatus === option.value, () => setField('billingStatus', option.value)))}
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08) }]} />

            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>SORT BY</Text>
              <View style={styles.chipWrap}>
                {SORT_OPTIONS.map((option) => renderChip(option, values.sort === option.value, () => setField('sort', option.value)))}
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
