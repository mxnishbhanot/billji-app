import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NavigationContainer, RouteProp, StackActions, createNavigationContainerRef } from '@react-navigation/native';
import { BottomTabNavigationProp, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, useTheme } from 'react-native-paper';
import { BackHandler, Platform, StyleSheet, View } from 'react-native';
import { ReactNode, Suspense, lazy, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// Dashboard and Login stay static — they are the first screens painted after splash.
import { DashboardScreen } from '@/screens/DashboardScreen';
import { LoginScreen } from '@/screens/LoginScreen';
// Everything else lazy-loads on first navigation so the initial frame doesn't pay
// the require() cost of all 20 screen modules (bottom-tabs lazy-mounts, but static
// imports still execute every screen module as soon as the tab bar renders).
const RegisterScreen = lazy(() => import('@/screens/RegisterScreen').then((m) => ({ default: m.RegisterScreen })));
const ForgotPasswordScreen = lazy(() => import('@/screens/ForgotPasswordScreen').then((m) => ({ default: m.ForgotPasswordScreen })));
const ResetPasswordScreen = lazy(() => import('@/screens/ResetPasswordScreen').then((m) => ({ default: m.ResetPasswordScreen })));
const TwoFactorChallengeScreen = lazy(() => import('@/screens/TwoFactorChallengeScreen').then((m) => ({ default: m.TwoFactorChallengeScreen })));
const TwoFactorSetupScreen = lazy(() => import('@/screens/TwoFactorSetupScreen').then((m) => ({ default: m.TwoFactorSetupScreen })));
const ProductsScreen = lazy(() => import('@/screens/ProductsScreen').then((m) => ({ default: m.ProductsScreen })));
const CustomersScreen = lazy(() => import('@/screens/CustomersScreen').then((m) => ({ default: m.CustomersScreen })));
const CustomerDetailScreen = lazy(() => import('@/screens/CustomerDetailScreen').then((m) => ({ default: m.CustomerDetailScreen })));
const InvoicesScreen = lazy(() => import('@/screens/InvoicesScreen').then((m) => ({ default: m.InvoicesScreen })));
const InvoiceBuilderScreen = lazy(() => import('@/screens/InvoiceBuilderScreen').then((m) => ({ default: m.InvoiceBuilderScreen })));
const InvoicePreviewScreen = lazy(() => import('@/screens/InvoicePreviewScreen').then((m) => ({ default: m.InvoicePreviewScreen })));
const InvoiceDetailScreen = lazy(() => import('@/screens/InvoiceDetailScreen').then((m) => ({ default: m.InvoiceDetailScreen })));
const DraftsScreen = lazy(() => import('@/screens/DraftsScreen').then((m) => ({ default: m.DraftsScreen })));
const OrdersScreen = lazy(() => import('@/screens/OrdersScreen').then((m) => ({ default: m.OrdersScreen })));
const OrderBuilderScreen = lazy(() => import('@/screens/OrderBuilderScreen').then((m) => ({ default: m.OrderBuilderScreen })));
const OrderDetailScreen = lazy(() => import('@/screens/OrderDetailScreen').then((m) => ({ default: m.OrderDetailScreen })));
const ReportsScreen = lazy(() => import('@/screens/ReportsScreen').then((m) => ({ default: m.ReportsScreen })));
const PaymentsScreen = lazy(() => import('@/screens/PaymentsScreen').then((m) => ({ default: m.PaymentsScreen })));
const SettingsScreen = lazy(() => import('@/screens/SettingsScreen').then((m) => ({ default: m.SettingsScreen })));
const BusinessProfileScreen = lazy(() => import('@/screens/BusinessProfileScreen').then((m) => ({ default: m.BusinessProfileScreen })));
const TaxSettingsScreen = lazy(() => import('@/screens/TaxSettingsScreen').then((m) => ({ default: m.TaxSettingsScreen })));
const InvoiceTemplateScreen = lazy(() => import('@/screens/InvoiceTemplateScreen').then((m) => ({ default: m.InvoiceTemplateScreen })));
const NotificationSettingsScreen = lazy(() => import('@/screens/NotificationSettingsScreen').then((m) => ({ default: m.NotificationSettingsScreen })));
const ActivityLogScreen = lazy(() => import('@/screens/ActivityLogScreen').then((m) => ({ default: m.ActivityLogScreen })));
const LedgerScreen = lazy(() => import('@/screens/LedgerScreen').then((m) => ({ default: m.LedgerScreen })));
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

// Suspense boundary for lazy screens — shows a spinner for the brief moment a
// screen module loads on first navigation.
function LazyScreenBoundary({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <View style={styles.lazyFallback}>
          <ActivityIndicator />
        </View>
      }
    >
      {children}
    </Suspense>
  );
}

const renderWithSuspense = ({ children }: { children: ReactNode }) => <LazyScreenBoundary>{children}</LazyScreenBoundary>;

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }} screenLayout={renderWithSuspense}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <AuthStack.Screen name="ResetPassword" component={ResetPasswordScreen} />
      <AuthStack.Screen name="TwoFactorChallenge" component={TwoFactorChallengeScreen} />
    </AuthStack.Navigator>
  );
}

function DashboardNavigator() {
  return (
    <DashboardStack.Navigator screenOptions={{ headerShown: false }} screenLayout={renderWithSuspense}>
      <DashboardStack.Screen name="DashboardHome" component={DashboardScreen} />
      <DashboardStack.Screen name="Reports" component={ReportsScreen} />
      <DashboardStack.Screen name="Payments" component={PaymentsScreen} />
    </DashboardStack.Navigator>
  );
}

function InvoiceNavigator() {
  return (
    <InvoiceStack.Navigator initialRouteName="InvoiceList" screenOptions={{ headerShown: false }} screenLayout={renderWithSuspense}>
      {/* OrderList reached only from the dashboard Orders button; no in-place list swap, no push animation. */}
      <InvoiceStack.Screen name="InvoiceList" component={InvoicesScreen} options={{ animation: 'none' }} />
      <InvoiceStack.Screen name="InvoiceCreate" component={InvoiceBuilderScreen} />
      <InvoiceStack.Screen name="InvoicePreview" component={InvoicePreviewScreen} />
      <InvoiceStack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} />
      <InvoiceStack.Screen name="Drafts" component={DraftsScreen} />
      <InvoiceStack.Screen name="OrderList" component={OrdersScreen} options={{ animation: 'none' }} />
      <InvoiceStack.Screen name="OrderCreate" component={OrderBuilderScreen} />
      <InvoiceStack.Screen name="OrderDetail" component={OrderDetailScreen} />
    </InvoiceStack.Navigator>
  );
}

function CatalogNavigator() {
  return (
    <CatalogStack.Navigator screenOptions={{ headerShown: false }} screenLayout={renderWithSuspense}>
      <CatalogStack.Screen name="Products" component={ProductsScreen} />
      <CatalogStack.Screen name="Customers" component={CustomersScreen} />
      <CatalogStack.Screen name="CustomerDetail" component={CustomerDetailScreen} />
    </CatalogStack.Navigator>
  );
}

function CustomersNavigator() {
  return (
    <CustomersStack.Navigator screenOptions={{ headerShown: false }} screenLayout={renderWithSuspense}>
      <CustomersStack.Screen name="Customers" component={CustomersScreen} />
      <CustomersStack.Screen name="CustomerDetail" component={CustomerDetailScreen} />
    </CustomersStack.Navigator>
  );
}

function SettingsNavigator() {
  return (
    <SettingsStack.Navigator screenOptions={{ headerShown: false }} screenLayout={renderWithSuspense}>
      <SettingsStack.Screen name="SettingsHome" component={SettingsScreen} />
      <SettingsStack.Screen name="BusinessProfile" component={BusinessProfileScreen} />
      <SettingsStack.Screen name="TaxSettings" component={TaxSettingsScreen} />
      <SettingsStack.Screen name="InvoiceTemplate" component={InvoiceTemplateScreen} />
      <SettingsStack.Screen name="NotificationSettings" component={NotificationSettingsScreen} />
      <SettingsStack.Screen name="ActivityLog" component={ActivityLogScreen} />
      <SettingsStack.Screen name="Ledger" component={LedgerScreen} />
      <SettingsStack.Screen name="TwoFactorSetup" component={TwoFactorSetupScreen} />
    </SettingsStack.Navigator>
  );
}

// popToTopOnBlur is unreliable in @react-navigation/bottom-tabs 7.x (pops on refocus, sometimes
// not at all — see react-navigation#12512), so reset the nested stack explicitly on tab blur.
const popNestedStackOnBlur = ({
  navigation,
  route
}: {
  navigation: BottomTabNavigationProp<TabParamList>;
  route: RouteProp<TabParamList, keyof TabParamList>;
}) => ({
  blur: () => {
    const tabRoute = navigation.getState().routes.find((item) => item.key === route.key);
    const nestedState = tabRoute?.state;
    if (nestedState?.key && typeof nestedState.index === 'number' && nestedState.index > 0) {
      navigation.dispatch({ ...StackActions.popToTop(), target: nestedState.key });
    }
  }
});

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
          listeners={popNestedStackOnBlur}
        />
        <Tabs.Screen name="CatalogTab" component={CatalogNavigator} options={{ title: 'Inventory' }} />
        <Tabs.Screen
          name="CustomersTab"
          component={CustomersNavigator}
          options={{ title: 'Customers', popToTopOnBlur: true }}
          listeners={popNestedStackOnBlur}
        />
        <Tabs.Screen
          name="SettingsTab"
          component={SettingsNavigator}
          options={{ title: 'Settings', popToTopOnBlur: true }}
          listeners={popNestedStackOnBlur}
        />
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
  lazyFallback: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  tabItem: { flex: 1, paddingTop: 0 },
  tabLabel: { ...typeScale.smallCaption, ...fontStyles.medium, fontSize: 11, lineHeight: 14, marginTop: 2 }
});
