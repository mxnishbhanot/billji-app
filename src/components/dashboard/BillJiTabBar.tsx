import { memo, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Home, FileText, Package, Users, MoreHorizontal } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from 'react-native-paper';
import Reanimated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { TourAnchor, ANCHOR } from '@/features/onboarding';
import { motion, shadows } from '@/design-system';
import { TabParamList } from '@/navigation/types';
import { alpha, appColors, fontStyles } from '@/theme/theme';

const TAB_LABELS: Record<keyof TabParamList, string> = {
  DashboardTab: 'Home',
  InvoicesTab: 'Invoices',
  CatalogTab: 'Inventory',
  CustomersTab: 'Customers',
  SettingsTab: 'More'
};

const TAB_ICONS = {
  DashboardTab: Home,
  InvoicesTab: FileText,
  CatalogTab: Package,
  CustomersTab: Users,
  SettingsTab: MoreHorizontal
} as const;

const tabAnchors: Partial<Record<keyof TabParamList, string>> = {
  InvoicesTab: ANCHOR.tabInvoices,
  CustomersTab: ANCHOR.tabCustomers,
  CatalogTab: ANCHOR.tabCatalog,
  SettingsTab: ANCHOR.tabSettings
};

export const TAB_BAR_CONTENT_HEIGHT = 66;
export const TAB_BAR_BOTTOM_GAP = 12;

type TabItemProps = {
  routeName: keyof TabParamList;
  label: string;
  focused: boolean;
  onPress: () => void;
  onLongPress: () => void;
};

const TabItem = memo(function TabItem({ routeName, label, focused, onPress, onLongPress }: TabItemProps) {
  const theme = useTheme();
  const colors = appColors(theme.dark);
  const Icon = TAB_ICONS[routeName];
  const progress = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(focused ? 1 : 0, { duration: motion.navigation });
  }, [focused, progress]);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.86 + progress.value * 0.14 }]
  }));

  const content = (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onLongPress}
      hitSlop={6}
      style={styles.item}
    >
      <View style={styles.iconSlot}>
        <Reanimated.View
          style={[
            styles.pill,
            { backgroundColor: alpha(colors.primary, theme.dark ? 0.28 : 0.14) },
            pillStyle
          ]}
        />
        <Icon
          size={21}
          color={focused ? colors.primaryStrong : theme.colors.onSurfaceVariant}
          strokeWidth={focused ? 2.3 : 1.9}
        />
      </View>
      <Text
        style={[
          styles.label,
          { color: focused ? colors.primaryStrong : theme.colors.onSurfaceVariant },
          focused ? styles.labelActive : null
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );

  const anchorId = tabAnchors[routeName];
  if (!anchorId) return content;
  return (
    <TourAnchor anchorId={anchorId} style={styles.anchor}>
      {content}
    </TourAnchor>
  );
});

export const BillJiTabBar = memo(function BillJiTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const colors = appColors(theme.dark);
  const insets = useSafeAreaInsets();

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View
        style={[
          styles.bar,
          shadows.tabBar,
          {
            backgroundColor: colors.card,
            borderColor: theme.dark ? colors.border : alpha(colors.primaryStrong, 0.08)
          }
        ]}
      >
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const { options } = descriptors[route.key];
          const routeName = route.name as keyof TabParamList;
          const label = TAB_LABELS[routeName] || options.title || route.name;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };

          return (
            <TabItem
              key={route.key}
              routeName={routeName}
              label={label}
              focused={focused}
              onPress={onPress}
              onLongPress={onLongPress}
            />
          );
        })}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  anchor: { flex: 1 },
  bar: {
    alignItems: 'center',
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    height: TAB_BAR_CONTENT_HEIGHT,
    marginHorizontal: 14,
    paddingHorizontal: 4
  },
  iconSlot: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 46
  },
  item: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingVertical: 4
  },
  label: { ...fontStyles.medium, fontSize: 10.5, letterSpacing: -0.1, marginTop: 4 },
  labelActive: { ...fontStyles.bold },
  pill: {
    ...StyleSheet.absoluteFill,
    borderRadius: 12,
    left: 5,
    right: 5
  },
  wrap: {
    bottom: TAB_BAR_BOTTOM_GAP,
    left: 0,
    position: 'absolute',
    right: 0
  }
});
