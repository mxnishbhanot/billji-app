import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from 'react-native-paper';
import { BackHandler, Platform, StyleSheet, View } from 'react-native';
import { useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DashboardScreen } from '@/screens/DashboardScreen';
import { LoginScreen } from '@/screens/LoginScreen';
import { RegisterScreen } from '@/screens/RegisterScreen';
import { ProductsScreen } from '@/screens/ProductsScreen';
import { CustomersScreen } from '@/screens/CustomersScreen';
import { CustomerDetailScreen } from '@/screens/CustomerDetailScreen';
import { InvoicesScreen } from '@/screens/InvoicesScreen';
import { InvoiceBuilderScreen } from '@/screens/InvoiceBuilderScreen';
import { InvoiceDetailScreen } from '@/screens/InvoiceDetailScreen';
import { DraftsScreen } from '@/screens/DraftsScreen';
import { ReportsScreen } from '@/screens/ReportsScreen';
import { PaymentsScreen } from '@/screens/PaymentsScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { BusinessProfileScreen } from '@/screens/BusinessProfileScreen';
import { ActivityLogScreen } from '@/screens/ActivityLogScreen';
import { LedgerScreen } from '@/screens/LedgerScreen';
import { useAuthStore } from '@/store/authStore';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import {
  AuthStackParamList,
  CatalogStackParamList,
  CustomersStackParamList,
  DashboardStackParamList,
  InvoiceStackParamList,
  RootStackParamList,
  SettingsStackParamList,
  TabParamList
} from './types';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();
const DashboardStack = createNativeStackNavigator<DashboardStackParamList>();
const InvoiceStack = createNativeStackNavigator<InvoiceStackParamList>();
const CatalogStack = createNativeStackNavigator<CatalogStackParamList>();
const CustomersStack = createNativeStackNavigator<CustomersStackParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();
const TAB_BAR_HEIGHT = 72;
const TAB_BAR_BOTTOM_PADDING = 10;
const tabIcons: Record<keyof TabParamList, { active: keyof typeof MaterialCommunityIcons.glyphMap; inactive: keyof typeof MaterialCommunityIcons.glyphMap }> = {
  DashboardTab: { active: 'home', inactive: 'home' },
  InvoicesTab: { active: 'file-document', inactive: 'file-document' },
  CatalogTab: { active: 'package-variant-closed', inactive: 'cube' },
  CustomersTab: { active: 'account-group', inactive: 'account-group' },
  SettingsTab: { active: 'cog', inactive: 'cog' }
};

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
}

function DashboardNavigator() {
  return (
    <DashboardStack.Navigator screenOptions={{ headerShown: false }}>
      <DashboardStack.Screen name="DashboardHome" component={DashboardScreen} />
      <DashboardStack.Screen name="Reports" component={ReportsScreen} />
      <DashboardStack.Screen name="Payments" component={PaymentsScreen} />
    </DashboardStack.Navigator>
  );
}

function InvoiceNavigator() {
  return (
    <InvoiceStack.Navigator screenOptions={{ headerShown: false }}>
      <InvoiceStack.Screen name="InvoiceList" component={InvoicesScreen} />
      <InvoiceStack.Screen name="InvoiceCreate" component={InvoiceBuilderScreen} />
      <InvoiceStack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} />
      <InvoiceStack.Screen name="Drafts" component={DraftsScreen} />
    </InvoiceStack.Navigator>
  );
}

function CatalogNavigator() {
  return (
    <CatalogStack.Navigator screenOptions={{ headerShown: false }}>
      <CatalogStack.Screen name="Products" component={ProductsScreen} />
      <CatalogStack.Screen name="Customers" component={CustomersScreen} />
      <CatalogStack.Screen name="CustomerDetail" component={CustomerDetailScreen} />
    </CatalogStack.Navigator>
  );
}

function CustomersNavigator() {
  return (
    <CustomersStack.Navigator screenOptions={{ headerShown: false }}>
      <CustomersStack.Screen name="Customers" component={CustomersScreen} />
      <CustomersStack.Screen name="CustomerDetail" component={CustomerDetailScreen} />
    </CustomersStack.Navigator>
  );
}

function SettingsNavigator() {
  return (
    <SettingsStack.Navigator screenOptions={{ headerShown: false }}>
      <SettingsStack.Screen name="SettingsHome" component={SettingsScreen} />
      <SettingsStack.Screen name="BusinessProfile" component={BusinessProfileScreen} />
      <SettingsStack.Screen name="ActivityLog" component={ActivityLogScreen} />
      <SettingsStack.Screen name="Ledger" component={LedgerScreen} />
    </SettingsStack.Navigator>
  );
}

function AppTabs() {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1 }}>
      <Tabs.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
          tabBarHideOnKeyboard: true,
          tabBarLabelPosition: 'below-icon',
          tabBarLabelStyle: styles.tabLabel,
          tabBarStyle: {
            height: TAB_BAR_HEIGHT + insets.bottom,
            paddingBottom: TAB_BAR_BOTTOM_PADDING + insets.bottom,
            paddingTop: 10,
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            width: '100%',
            backgroundColor: theme.colors.surface,
            borderRadius: 0,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: isDark ? theme.colors.outlineVariant : alpha(colors.primaryStrong, 0.1),
            borderLeftWidth: 0,
            borderRightWidth: 0,
            borderBottomWidth: 0,
            elevation: 14,
            shadowColor: isDark ? '#000000' : colors.primaryStrong,
            shadowOffset: { width: 0, height: -6 },
            shadowOpacity: isDark ? 0.45 : 0.06,
            shadowRadius: 14
          },
          tabBarItemStyle: styles.tabItem,
          tabBarIcon: ({ color, focused }) => {
            const icon = tabIcons[route.name as keyof TabParamList];
            return (
              <View style={[styles.iconPill, focused && { backgroundColor: alpha(theme.colors.primary, isDark ? 0.2 : 0.14) }]}>
                <MaterialCommunityIcons name={focused ? icon.active : icon.inactive} size={focused ? 22 : 21} color={color} />
              </View>
            );
          }
        })}
      >
        <Tabs.Screen name="DashboardTab" component={DashboardNavigator} options={{ title: 'Home' }} />
        <Tabs.Screen
          name="InvoicesTab"
          component={InvoiceNavigator}
          options={{ title: 'Invoices', popToTopOnBlur: true }}
        />
        <Tabs.Screen name="CatalogTab" component={CatalogNavigator} options={{ title: 'Inventory' }} />
        <Tabs.Screen name="CustomersTab" component={CustomersNavigator} options={{ title: 'Customers', popToTopOnBlur: true }} />
        <Tabs.Screen name="SettingsTab" component={SettingsNavigator} options={{ title: 'Settings', popToTopOnBlur: true }} />
      </Tabs.Navigator>
    </View>
  );
}

function AppShell() {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="MainTabs" component={AppTabs} />
    </RootStack.Navigator>
  );
}

export function AppNavigator() {
  const token = useAuthStore((state) => state.token);

  useEffect(() => {
    if (Platform.OS !== 'android' || !token) return undefined;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const currentRouteName = String(navigationRef.getCurrentRoute()?.name || '');
      if (currentRouteName !== 'DashboardTab' && currentRouteName !== 'DashboardHome') return false;

      BackHandler.exitApp();
      return true;
    });

    return () => subscription.remove();
  }, [token]);

  return <NavigationContainer ref={navigationRef}>{token ? <AppShell /> : <AuthNavigator />}</NavigationContainer>;
}

const styles = StyleSheet.create({
  iconPill: {
    alignItems: 'center',
    borderRadius: radii.pill,
    height: 30,
    justifyContent: 'center',
    marginBottom: 2,
    width: 56
  },
  tabItem: { flex: 1, paddingTop: 0 },
  tabLabel: { ...typeScale.smallCaption, ...fontStyles.medium, fontSize: 11, lineHeight: 14, marginTop: 2 }
});
