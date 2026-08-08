import { Fragment, memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Box, Clock, FileText, Users } from 'lucide-react-native';
import { useTheme } from 'react-native-paper';
import { alpha, appColors, fontStyles } from '@/theme/theme';

/**
 * Narrowest the stub can get while still fitting "Customers" without truncating:
 * padding 10 + icon 28 + gap 8 + label 58 + gap 8 + value 16 + padding 10.
 */
export const HERO_RAIL_MIN_WIDTH = 138;

type RailItem = {
  key: string;
  label: string;
  value: number | string;
  onPress?: () => void;
};

type Props = {
  invoices: number;
  customers: number;
  products: number;
  pending: number;
  onInvoices?: () => void;
  onCustomers?: () => void;
  onProducts?: () => void;
  onPending?: () => void;
};

export const HeroStatRail = memo(function HeroStatRail({
  invoices,
  customers,
  products,
  pending,
  onInvoices,
  onCustomers,
  onProducts,
  onPending
}: Props) {
  const theme = useTheme();
  const colors = appColors(theme.dark);

  const items: (RailItem & { icon: typeof FileText; color: string })[] = [
    { key: 'invoices', label: 'Invoices', value: invoices, onPress: onInvoices, icon: FileText, color: colors.categoryOrange },
    { key: 'customers', label: 'Customers', value: customers, onPress: onCustomers, icon: Users, color: colors.categoryPurple },
    { key: 'products', label: 'Products', value: products, onPress: onProducts, icon: Box, color: colors.categoryGreen },
    { key: 'pending', label: 'Pending', value: pending, onPress: onPending, icon: Clock, color: colors.categoryOrange }
  ];

  return (
    <View style={[styles.rail, { backgroundColor: colors.card }]}>
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <Fragment key={item.key}>
            {index > 0 ? <View style={[styles.divider, { borderColor: alpha(colors.outline, 0.4) }]} /> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.label} ${item.value}`}
              onPress={item.onPress}
              style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
            >
              <View style={[styles.iconWrap, { backgroundColor: alpha(item.color, theme.dark ? 0.24 : 0.14) }]}>
                <Icon size={15} color={item.color} strokeWidth={2.1} />
              </View>
              <Text style={[styles.label, { color: theme.colors.onSurface }]} numberOfLines={1}>
                {item.label}
              </Text>
              <Text style={[styles.value, { color: theme.colors.onSurface }]}>{item.value}</Text>
            </Pressable>
          </Fragment>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  divider: { borderStyle: 'dashed', borderTopWidth: StyleSheet.hairlineWidth, marginHorizontal: 2 },
  iconWrap: {
    alignItems: 'center',
    borderRadius: 10,
    height: 28,
    justifyContent: 'center',
    width: 28
  },
  label: { ...fontStyles.medium, flex: 1, fontSize: 11.5, letterSpacing: -0.2, minWidth: 0 },
  pressed: { opacity: 0.65 },
  rail: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 44,
    paddingVertical: 5
  },
  value: { ...fontStyles.bold, fontSize: 13.5, letterSpacing: -0.2 }
});
