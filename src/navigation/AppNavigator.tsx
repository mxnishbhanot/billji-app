import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NavigationContainer, RouteProp, StackActions } from '@react-navigation/native';
import { BottomTabNavigationProp, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { AppState, BackHandler, Platform, StyleSheet, View } from 'react-native';
import Reanimated, { interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';
import { authApi } from '@/api/endpoints';
import { ReactNode, Suspense, lazy, useEffect, useRef } from 'react';
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
const DocumentsScreen = lazy(() => import('@/screens/DocumentsScreen').then((m) => ({ default: m.DocumentsScreen })));
const OrdersScreen = lazy(() => import('@/screens/OrdersScreen').then((m) => ({ default: m.OrdersScreen })));
const OrderBuilderScreen = lazy(() => import('@/screens/OrderBuilderScreen').then((m) => ({ default: m.OrderBuilderScreen })));
const OrderDetailScreen = lazy(() => import('@/screens/OrderDetailScreen').then((m) => ({ default: m.OrderDetailScreen })));
const ReportsScreen = lazy(() => import('@/screens/ReportsScreen').then((m) => ({ default: m.ReportsScreen })));
const PaymentsScreen = lazy(() => import('@/screens/PaymentsScreen').then((m) => ({ default: m.PaymentsScreen })));
const PaymentRemindersScreen = lazy(() => import('@/screens/PaymentRemindersScreen').then((m) => ({ default: m.PaymentRemindersScreen })));
const GstReturnsScreen = lazy(() => import('@/screens/GstReturnsScreen').then((m) => ({ default: m.GstReturnsScreen })));
const ExpensesScreen = lazy(() => import('@/screens/ExpensesScreen').then((m) => ({ default: m.ExpensesScreen })));
const PurchasesScreen = lazy(() => import('@/screens/PurchasesScreen').then((m) => ({ default: m.PurchasesScreen })));
const SettingsScreen = lazy(() => import('@/screens/SettingsScreen').then((m) => ({ default: m.SettingsScreen })));
const BusinessProfileScreen = lazy(() => import('@/screens/BusinessProfileScreen').then((m) => ({ default: m.BusinessProfileScreen })));
const TaxSettingsScreen = lazy(() => import('@/screens/TaxSettingsScreen').then((m) => ({ default: m.TaxSettingsScreen })));
const InvoiceTemplateScreen = lazy(() => import('@/screens/InvoiceTemplateScreen').then((m) => ({ default: m.InvoiceTemplateScreen })));
const NotificationSettingsScreen = lazy(() => import('@/screens/NotificationSettingsScreen').then((m) => ({ default: m.NotificationSettingsScreen })));
const SyncSettingsScreen = lazy(() => import('@/screens/SyncSettingsScreen').then((m) => ({ default: m.SyncSettingsScreen })));
const SyncIssuesScreen = lazy(() => import('@/screens/SyncIssuesScreen').then((m) => ({ default: m.SyncIssuesScreen })));
const SyncDebugScreen = lazy(() => import('@/screens/SyncDebugScreen').then((m) => ({ default: m.SyncDebugScreen })));
const ActivityLogScreen = lazy(() => import('@/screens/ActivityLogScreen').then((m) => ({ default: m.ActivityLogScreen })));
const LedgerScreen = lazy(() => import('@/screens/LedgerScreen').then((m) => ({ default: m.LedgerScreen })));
const DataExportScreen = lazy(() => import('@/screens/DataExportScreen').then((m) => ({ default: m.DataExportScreen })));
const DataImportScreen = lazy(() => import('@/screens/DataImportScreen').then((m) => ({ default: m.DataImportScreen })));
const TeamScreen = lazy(() => import('@/screens/TeamScreen').then((m) => ({ default: m.TeamScreen })));
const RolesScreen = lazy(() => import('@/screens/RolesScreen').then((m) => ({ default: m.RolesScreen })));
const RoleEditorScreen = lazy(() => import('@/screens/RoleEditorScreen').then((m) => ({ default: m.RoleEditorScreen })));
const SubscriptionScreen = lazy(() => import('@/screens/SubscriptionScreen').then((m) => ({ default: m.SubscriptionScreen })));
const PlansScreen = lazy(() => import('@/screens/PlansScreen').then((m) => ({ default: m.PlansScreen })));

// Plan gates, mirroring exactly what the backend guards (see middlewares/entitlement.js). Declared
// at module scope so the wrapper identity is stable — a component created during render would
// remount the screen on every state change.
const GatedGstReturnsScreen = withFeatureGate(FEATURE.advancedGstReports, 'GST returns', GstReturnsScreen);
const GatedExpensesScreen = withFeatureGate(FEATURE.expenses, 'Expenses', ExpensesScreen);
const GatedPurchasesScreen = withFeatureGate(FEATURE.purchases, 'Purchases', PurchasesScreen);
const GatedActivityLogScreen = withFeatureGate(FEATURE.auditLogs, 'Activity log', ActivityLogScreen);
const GatedDataExportScreen = withFeatureGate(FEATURE.dataExport, 'Export my data', DataExportScreen);
const GatedDataImportScreen = withFeatureGate(FEATURE.dataImport, 'Import data', DataImportScreen);
const GatedRoleEditorScreen = withFeatureGate(FEATURE.customRoles, 'Role', RoleEditorScreen);
const AcceptInviteScreen = lazy(() => import('@/screens/AcceptInviteScreen').then((m) => ({ default: m.AcceptInviteScreen })));
import { useAuthStore } from '@/store/authStore';
import { FEATURE } from '@/constants/entitlements';
import { withFeatureGate } from '@/components/FeatureGate';
import { attachPushListeners, registerForPush } from '@/services/push';
import { alpha, appColors, fontStyles, glass, radii, spacing, surfaceGradient, typeScale } from '@/theme/theme';
import { CelebrationOverlay, OnboardingProvider, TourAnchor, TourHost, WelcomeSheet, ANCHOR, useOnboardingOptional } from '@/features/onboarding';
import { navigationRef } from './navigationRef';
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
/**
 * Tab-bar vertical budget. Do not nudge one of these without re-doing the arithmetic — the label sits
 * a fixed distance off the bar's bottom edge, and any drift clips its descenders.
 *
 * The bar is full-bleed (edge to edge, no floating plate), so its surface spans the whole container
 * and nothing can crop the labels. Height and paddingBottom BOTH add insets.bottom, so every number
 * below is inset-independent — identical with and without a home indicator:
 *
 * The label is rendered by TabIcon, not by the navigator, so nothing outside these numbers adds to
 * the item's height:
 *
 *   surface      = the entire bar, 0..TAB_BAR_HEIGHT + insets.bottom
 *   content top  = TAB_BAR_TOP_PADDING             = 10
 *   content bot  = TAB_BAR_HEIGHT - BOTTOM_PADDING = 64 - 10 = 54
 *   content box  = 54 - 10                         = 44
 *   content need = iconSlot 28 + iconSlot marginBottom 2 + label lineHeight 14 = 44 ✓
 *   clearance below the label = (64 + insets.bottom) - 54 = 10 + insets.bottom  (≥ the 2pt minimum)
 */
const TAB_BAR_HEIGHT = 64;
const TAB_BAR_BOTTOM_PADDING = 10;
const TAB_BAR_TOP_PADDING = 10;
const tabIcons: Record<keyof TabParamList, { active: keyof typeof MaterialCommunityIcons.glyphMap; inactive: keyof typeof MaterialCommunityIcons.glyphMap }> = {
  DashboardTab: { active: 'home', inactive: 'home' },
  InvoicesTab: { active: 'file-document', inactive: 'file-document' },
  CatalogTab: { active: 'package-variant-closed', inactive: 'cube' },
  CustomersTab: { active: 'account-group', inactive: 'account-group' },
  SettingsTab: { active: 'cog', inactive: 'cog' }
};
const TAB_BAR_SIDE_PADDING = spacing.xs;
/** Tab labels. Mirrors each screen's `title` — TabIcon renders these itself. */
const tabTitles: Record<keyof TabParamList, string> = {
  DashboardTab: 'Home',
  InvoicesTab: 'Invoices',
  CatalogTab: 'Inventory',
  CustomersTab: 'Customers',
  SettingsTab: 'Settings'
};

/**
 * Tab-bar surface: full-bleed, edge to edge, the way a stock app bar sits — a two-stop gradient with a
 * hairline top border and a top-edge highlight. Presentation only — it is handed to `tabBarBackground`,
 * so routing, listeners and lazy loading are untouched by it.
 */
function TabBarBackground() {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const fills = surfaceGradient(isDark);
  const lighting = glass(isDark);
  return (
    <View style={[styles.tabSurface, { borderTopColor: isDark ? alpha('#FFFFFF', 0.08) : alpha(colors.primaryStrong, 0.09) }]}>
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgLinearGradient id="tabSurface" x1="0" y1="0" x2="0.2" y2="1">
            <Stop offset="0" stopColor={fills.raised[0]} />
            <Stop offset="1" stopColor={fills.raised[1]} />
          </SvgLinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#tabSurface)" />
      </Svg>
      <View style={[styles.tabSurfaceHighlight, { backgroundColor: lighting.highlight }]} />
    </View>
  );
}

/**
 * Icon + label, rendered as one unit. The label is ours rather than the navigator's on purpose: with
 * `tabBarShowLabel` the library owns the label's box and margins, and its arithmetic against our
 * custom height is what kept clipping the descenders. One View, one budget, nothing to fight.
 */
function TabIcon({ name, focused, color, label }: { name: keyof typeof MaterialCommunityIcons.glyphMap; focused: boolean; color: string; label: string }) {
  const theme = useTheme();
  const isDark = theme.dark;
  const progress = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    progress.value = withSpring(focused ? 1 : 0, { damping: 15, stiffness: 190 });
  }, [focused, progress]);
  const pillStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scaleX: interpolate(progress.value, [0, 1], [0.6, 1]) }, { scaleY: interpolate(progress.value, [0, 1], [0.7, 1]) }]
  }));
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(progress.value, [0, 1], [1, 1.08]) }, { translateY: interpolate(progress.value, [0, 1], [0, -1]) }]
  }));
  return (
    <View style={styles.tabItemContent}>
      <View style={styles.iconSlot}>
        <Reanimated.View style={[styles.iconPill, { backgroundColor: alpha(theme.colors.primary, isDark ? 0.22 : 0.13) }, pillStyle]} />
        <Reanimated.View style={iconStyle}>
          <MaterialCommunityIcons name={name} size={22} color={color} />
        </Reanimated.View>
      </View>
      <Text numberOfLines={1} style={[styles.tabLabel, { color }]}>{label}</Text>
    </View>
  );
}

// Anchored on the whole tab button, not the icon, so a coach mark highlights the label too.
const tabAnchors: Partial<Record<keyof TabParamList, string>> = {
  InvoicesTab: ANCHOR.tabInvoices,
  CustomersTab: ANCHOR.tabCustomers,
  CatalogTab: ANCHOR.tabCatalog,
  SettingsTab: ANCHOR.tabSettings
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
      <AuthStack.Screen name="AcceptInvite" component={AcceptInviteScreen} />
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
      <DashboardStack.Screen name="PaymentReminders" component={PaymentRemindersScreen} />
      <DashboardStack.Screen name="GstReturns" component={GatedGstReturnsScreen} />
      <DashboardStack.Screen name="Expenses" component={GatedExpensesScreen} />
      <DashboardStack.Screen name="Purchases" component={GatedPurchasesScreen} />
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
      <InvoiceStack.Screen name="Documents" component={DocumentsScreen} />
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
      <SettingsStack.Screen name="SyncSettings" component={SyncSettingsScreen} />
      <SettingsStack.Screen name="SyncIssues" component={SyncIssuesScreen} />
      <SettingsStack.Screen name="SyncDebug" component={SyncDebugScreen} />
      <SettingsStack.Screen name="ActivityLog" component={GatedActivityLogScreen} />
      <SettingsStack.Screen name="Ledger" component={LedgerScreen} />
      <SettingsStack.Screen name="DataExport" component={GatedDataExportScreen} />
      <SettingsStack.Screen name="DataImport" component={GatedDataImportScreen} />
      <SettingsStack.Screen name="TwoFactorSetup" component={TwoFactorSetupScreen} />
      <SettingsStack.Screen name="Team" component={TeamScreen} />
      <SettingsStack.Screen name="Roles" component={RolesScreen} />
      <SettingsStack.Screen name="RoleEditor" component={GatedRoleEditorScreen} />
      <SettingsStack.Screen name="Subscription" component={SubscriptionScreen} />
      <SettingsStack.Screen name="Plans" component={PlansScreen} />
      <SettingsStack.Screen name="AcceptInvite" component={AcceptInviteScreen} />
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
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1 }}>
      <Tabs.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
          tabBarHideOnKeyboard: true,
          // The label is drawn inside tabBarIcon (see TabIcon), so the navigator draws none.
          tabBarShowLabel: false,
          // Full-bleed bar, flush with the screen edges. The surface itself is drawn by
          // tabBarBackground so the container can stay transparent.
          tabBarStyle: {
            height: TAB_BAR_HEIGHT + insets.bottom,
            paddingBottom: TAB_BAR_BOTTOM_PADDING + insets.bottom,
            paddingTop: TAB_BAR_TOP_PADDING,
            paddingHorizontal: TAB_BAR_SIDE_PADDING,
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            width: '100%',
            backgroundColor: 'transparent',
            borderTopWidth: 0,
            borderLeftWidth: 0,
            borderRightWidth: 0,
            borderBottomWidth: 0,
            elevation: 0
          },
          tabBarBackground: () => <TabBarBackground />,
          tabBarItemStyle: styles.tabItem,
          tabBarButton: (props) => {
            const anchorId = tabAnchors[route.name as keyof TabParamList];
            // Must be PlatformPressable, not a plain Pressable: bottom-tabs passes an
            // `href` to the tab button, react-native-web renders that as a real <a>, and
            // only PlatformPressable preventDefault()s the click. A plain Pressable lets
            // the browser follow the link, which full-page-reloads the web app.
            const button = <PlatformPressable {...props} />;
            if (!anchorId) return button;
            return (
              <TourAnchor anchorId={anchorId} style={styles.tabButtonAnchor}>
                {button}
              </TourAnchor>
            );
          },
          tabBarIcon: ({ color, focused }) => {
            const icon = tabIcons[route.name as keyof TabParamList];
            return <TabIcon name={focused ? icon.active : icon.inactive} focused={focused} color={color} label={tabTitles[route.name as keyof TabParamList]} />;
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

function OnboardingRouteListener() {
  const onboarding = useOnboardingOptional();
  // The onboarding context value changes whenever progress mutates, which re-runs
  // this effect. Dedupe by route name (in a ref that survives re-subscription) so
  // a notify that mutates progress can't loop back into another notify.
  const lastRouteRef = useRef<string | null>(null);
  const notifyRef = useRef(onboarding?.notifyRouteFocus);
  notifyRef.current = onboarding?.notifyRouteFocus;
  useEffect(() => {
    if (!onboarding || !navigationRef.isReady()) return undefined;
    const notify = () => {
      const name = navigationRef.getCurrentRoute()?.name;
      if (!name || name === lastRouteRef.current) return;
      lastRouteRef.current = name;
      notifyRef.current?.(name);
    };
    notify();
    return navigationRef.addListener('state', notify);
  }, [onboarding]);
  return null;
}

function AppShell() {
  return (
    <OnboardingProvider>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="MainTabs" component={AppTabs} />
      </RootStack.Navigator>
      <WelcomeSheet />
      <TourHost />
      <CelebrationOverlay />
      <OnboardingRouteListener />
    </OnboardingProvider>
  );
}

export function AppNavigator() {
  const token = useAuthStore((state) => state.token);
  const businessId = useAuthStore((state) => state.user?.businessId);

  // Push registration is per session AND per workspace: switching business must move
  // this device so notifications follow the workspace the user is actually in. Asked
  // for only once signed in — a permission prompt on first launch gets denied.
  useEffect(() => {
    if (!token || !businessId) return undefined;
    void registerForPush();
    return attachPushListeners();
  }, [token, businessId]);

  // Keep client permissions fresh: a server-side re-role/disable isn't reflected in a
  // long-lived session otherwise. Refresh the user on launch (once a token exists) and
  // whenever the app returns to the foreground. Backend still enforces per request.
  useEffect(() => {
    if (!token) return undefined;
    const refresh = () => {
      authApi
        .me()
        .then((user) => useAuthStore.getState().setUser(user))
        .catch(() => {});
    };
    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => subscription.remove();
  }, [token]);

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
    borderRadius: radii.pill,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0
  },
  iconSlot: { alignItems: 'center', height: 28, justifyContent: 'center', marginBottom: 2, width: 54 },
  lazyFallback: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  tabButtonAnchor: { flex: 1 },
  tabItem: { flex: 1, paddingTop: 0 },
  tabItemContent: { alignItems: 'center', justifyContent: 'center' },
  // lineHeight 14 (not 13) so 10.5pt descenders have room inside the 44pt budget above.
  tabLabel: { ...typeScale.smallCaption, ...fontStyles.semiBold, fontSize: 10.5, letterSpacing: 0.1, lineHeight: 14, textAlign: 'center' },
  tabSurface: { borderTopWidth: StyleSheet.hairlineWidth, bottom: 0, left: 0, overflow: 'hidden', position: 'absolute', right: 0, top: 0 },
  tabSurfaceHighlight: { height: StyleSheet.hairlineWidth, left: 0, position: 'absolute', right: 0, top: 0 }
});
