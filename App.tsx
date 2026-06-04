import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, View } from 'react-native';
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold
} from '@expo-google-fonts/plus-jakarta-sans';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PaperProvider, Text } from 'react-native-paper';
import { AppNavigator } from '@/navigation/AppNavigator';
import { AppDialogProvider } from '@/components/AppDialog';
import { queryClient } from '@/query/queryClient';
import { queryPersistOptions } from '@/query/persistence';
import { setupNetworkBridge } from '@/query/networkBridge';
import { reportsApi } from '@/api/endpoints';
import { queryKeys } from '@/shared/query/queryKeys';
import { useAuthStore } from '@/store/authStore';
import { darkTheme, lightTheme } from '@/theme/theme';

const billjiLogo = require('./assets/main-logo-clean.png');

// Don't let a slow first-install network call hold the splash hostage.
const PREFETCH_TIMEOUT_MS = 2500;
// Safety net in case the persisted-cache restore callback never fires.
const CACHE_RESTORE_TIMEOUT_MS = 1500;

export default function App() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const hydrate = useAuthStore((state) => state.hydrate);
  const user = useAuthStore((state) => state.user);
  const theme = user?.businessProfile?.theme === 'dark' ? darkTheme : lightTheme;
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold
  });

  // Splash prefetch: while the splash is up, restore the persisted query cache and
  // warm the dashboard report query so the first screen paints with data instead of
  // a skeleton. Capped by timeouts so the splash never hangs on a slow network.
  const [cacheRestored, setCacheRestored] = useState(false);
  const [prefetched, setPrefetched] = useState(false);
  const handleCacheRestored = useCallback(() => setCacheRestored(true), []);

  useEffect(() => {
    const timer = setTimeout(() => setCacheRestored(true), CACHE_RESTORE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated || !cacheRestored || prefetched) return undefined;
    if (!useAuthStore.getState().token) {
      setPrefetched(true);
      return undefined;
    }
    let cancelled = false;
    const finish = () => { if (!cancelled) setPrefetched(true); };
    const timer = setTimeout(finish, PREFETCH_TIMEOUT_MS);
    // prefetchQuery respects staleTime, so on warm starts with a fresh persisted
    // cache this resolves instantly without a network call.
    void queryClient
      .prefetchQuery({ queryKey: queryKeys.report.all, queryFn: () => reportsApi.summary() })
      .finally(() => { clearTimeout(timer); finish(); });
    return () => { cancelled = true; clearTimeout(timer); };
  }, [hydrated, cacheRestored, prefetched]);

  useEffect(() => { void hydrate(); }, [hydrate]);
  useEffect(() => setupNetworkBridge(), []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
      <PersistQueryClientProvider client={queryClient} persistOptions={queryPersistOptions} onSuccess={handleCacheRestored}>
        <PaperProvider theme={theme}>
          <AppDialogProvider>
            <SafeAreaProvider>
              <StatusBar style={user?.businessProfile?.theme === 'dark' ? 'light' : 'dark'} />
              {hydrated && fontsLoaded && prefetched ? <AppNavigator /> : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}>
                  <Image source={billjiLogo} resizeMode="contain" style={{ width: 96, height: 96 }} />
                  <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 18 }} />
                  <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 12 }}>Opening Billji...</Text>
                </View>
              )}
            </SafeAreaProvider>
          </AppDialogProvider>
        </PaperProvider>
      </PersistQueryClientProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
