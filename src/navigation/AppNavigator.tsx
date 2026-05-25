import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { FAB, useTheme } from 'react-native-paper';
import { BackHandler, PanResponder, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DashboardScreen } from '@/screens/DashboardScreen';
import { LoginScreen } from '@/screens/LoginScreen';
import { RegisterScreen } from '@/screens/RegisterScreen';
import { ProductsScreen } from '@/screens/ProductsScreen';
import { CustomersScreen } from '@/screens/CustomersScreen';
import { InvoicesScreen } from '@/screens/InvoicesScreen';
import { InvoiceBuilderScreen } from '@/screens/InvoiceBuilderScreen';
import { InvoiceDetailScreen } from '@/screens/InvoiceDetailScreen';
import { ReportsScreen } from '@/screens/ReportsScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { useAuthStore } from '@/store/authStore';

const AuthStack = createNativeStackNavigator<any>();
const InvoiceStack = createNativeStackNavigator<any>();
const CatalogStack = createNativeStackNavigator<any>();
const Tabs = createBottomTabNavigator<any>();
const navigationRef = createNavigationContainerRef<any>();
const TAB_BAR_HEIGHT = 72;
const TAB_BAR_BOTTOM_PADDING = 12;
const FAB_BOTTOM_OFFSET = 104;
const FAB_EDGE_GAP = 16;
const FAB_SIZE = 56;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const getDefaultFabPosition = (width: number, height: number, bottomInset: number) => ({
  x: width - FAB_SIZE - 22,
  y: height - FAB_SIZE - FAB_BOTTOM_OFFSET - bottomInset
});
const clampFabPosition = (position: { x: number; y: number }, width: number, height: number, topInset: number, bottomInset: number) => {
  const minX = FAB_EDGE_GAP;
  const maxX = Math.max(minX, width - FAB_SIZE - FAB_EDGE_GAP);
  const minY = topInset + FAB_EDGE_GAP;
  const maxY = Math.max(minY, height - FAB_SIZE - TAB_BAR_HEIGHT - bottomInset - 24);

  return {
    x: clamp(position.x, minX, maxX),
    y: clamp(position.y, minY, maxY)
  };
};

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
}

function InvoiceNavigator() {
  return (
    <InvoiceStack.Navigator screenOptions={{ headerShown: false }}>
      <InvoiceStack.Screen name="InvoiceList" component={InvoicesScreen} />
      <InvoiceStack.Screen name="InvoiceCreate" component={InvoiceBuilderScreen} />
      <InvoiceStack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} />
    </InvoiceStack.Navigator>
  );
}

function CatalogNavigator() {
  return (
    <CatalogStack.Navigator screenOptions={{ headerShown: false }}>
      <CatalogStack.Screen name="Products" component={ProductsScreen} />
      <CatalogStack.Screen name="Customers" component={CustomersScreen} />
    </CatalogStack.Navigator>
  );
}

function AppTabs() {
  const theme = useTheme();
  const isDark = theme.dark;
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [fabPosition, setFabPosition] = useState(() => clampFabPosition(getDefaultFabPosition(width, height, insets.bottom), width, height, insets.top, insets.bottom));
  const fabPositionRef = useRef(fabPosition);
  const dragStartRef = useRef(fabPosition);

  useEffect(() => {
    fabPositionRef.current = fabPosition;
  }, [fabPosition]);

  useEffect(() => {
    setFabPosition((position) => clampFabPosition(position, width, height, insets.top, insets.bottom));
  }, [height, insets.bottom, insets.top, width]);

  const fabPanResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, gestureState) => Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4,
    onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4,
    onPanResponderGrant: () => {
      dragStartRef.current = fabPositionRef.current;
    },
    onPanResponderMove: (_, gestureState) => {
      setFabPosition(clampFabPosition({
        x: dragStartRef.current.x + gestureState.dx,
        y: dragStartRef.current.y + gestureState.dy
      }, width, height, insets.top, insets.bottom));
    }
  }), [height, insets.bottom, insets.top, width]);

  return (
    <View style={{ flex: 1 }}>
      <Tabs.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
          tabBarHideOnKeyboard: true,
          tabBarLabelStyle: styles.tabLabel,
          tabBarStyle: {
            height: TAB_BAR_HEIGHT + insets.bottom,
            paddingBottom: TAB_BAR_BOTTOM_PADDING + insets.bottom,
            paddingTop: 10,
            marginHorizontal: 16,
            marginBottom: 12,
            position: 'absolute',
            backgroundColor: isDark ? theme.colors.elevation.level2 : theme.colors.elevation.level1,
            borderColor: isDark ? theme.colors.outlineVariant : 'transparent',
            borderTopWidth: 0,
            borderWidth: isDark ? 1 : 0,
            borderRadius: 28,
            elevation: isDark ? 6 : 12,
            shadowColor: isDark ? theme.colors.primary : '#000000',
            shadowOffset: { width: 0, height: 14 },
            shadowOpacity: isDark ? 0.08 : 0.14,
            shadowRadius: 24
          },
          tabBarItemStyle: styles.tabItem,
          tabBarIcon: ({ color, size }) => {
            const icons: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
              DashboardTab: 'view-dashboard-outline',
              InvoicesTab: 'file-document-outline',
              CatalogTab: 'package-variant-closed',
              ReportsTab: 'chart-line',
              SettingsTab: 'cog-outline'
            };
            return <MaterialCommunityIcons name={icons[route.name]} size={size} color={color} />;
          }
        })}
      >
        <Tabs.Screen name="DashboardTab" component={DashboardScreen} options={{ title: 'Home' }} />
        <Tabs.Screen
          name="InvoicesTab"
          component={InvoiceNavigator}
          options={{ title: 'Invoices' }}
          listeners={({ navigation }) => ({
            tabPress: (event) => {
              event.preventDefault();
              navigation.navigate('InvoicesTab', { screen: 'InvoiceList' });
            }
          })}
        />
        <Tabs.Screen name="CatalogTab" component={CatalogNavigator} options={{ title: 'Products' }} />
        <Tabs.Screen name="ReportsTab" component={ReportsScreen} options={{ title: 'Reports' }} />
        <Tabs.Screen name="SettingsTab" component={SettingsScreen} options={{ title: 'Settings' }} />
      </Tabs.Navigator>
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <View
          {...fabPanResponder.panHandlers}
          style={[styles.fabContainer, { left: fabPosition.x, top: fabPosition.y }]}
        >
          <FAB
            icon="plus"
            color={theme.colors.onPrimary}
            style={[
              styles.fab,
              {
                backgroundColor: theme.colors.primary,
                borderColor: isDark ? theme.colors.primaryContainer : 'transparent',
                borderWidth: isDark ? 1 : 0,
                shadowColor: isDark ? theme.colors.primary : '#000000',
                shadowOpacity: isDark ? 0.18 : 0.16
              }
            ]}
            onPress={() => navigationRef.navigate('InvoicesTab', { screen: 'InvoiceCreate' })}
            testID="quick-create-fab"
          />
        </View>
      </View>
    </View>
  );
}

export function AppNavigator() {
  const token = useAuthStore((state) => state.token);

  useEffect(() => {
    if (Platform.OS !== 'android' || !token) return undefined;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (navigationRef.getCurrentRoute()?.name !== 'DashboardTab') return false;

      BackHandler.exitApp();
      return true;
    });

    return () => subscription.remove();
  }, [token]);

  return <NavigationContainer ref={navigationRef}>{token ? <AppTabs /> : <AuthNavigator />}</NavigationContainer>;
}

const styles = StyleSheet.create({
  fab: {
    borderRadius: 22,
    elevation: 8
  },
  fabContainer: {
    position: 'absolute'
  },
  tabItem: { borderRadius: 22 },
  tabLabel: { fontSize: 11, fontWeight: '800' }
});
