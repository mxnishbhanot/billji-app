import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
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
import { PaperProvider } from 'react-native-paper';
import Reanimated, { FadeOut } from 'react-native-reanimated';
import { AppNavigator } from '@/navigation/AppNavigator';
import { AppSplash } from '@/components/AppSplash';
import { AppDialogProvider } from '@/components/AppDialog';
import { AppToastProvider } from '@/components/AppToast';
import { queryClient } from '@/query/queryClient';
import { queryPersistOptions } from '@/query/persistence';
import { setupChangeBridge } from '@/query/changeBridge';
import { setupNetworkBridge } from '@/query/networkBridge';
import { reportsApi } from '@/api/endpoints';
import { queryKeys } from '@/shared/query/queryKeys';
import { useAuthStore } from '@/store/authStore';
import { initAnalytics, setAnalyticsUser, wrapApp } from '@/services/analytics';
import { darkTheme, lightTheme } from '@/theme/theme';

// Don't let a slow first-install network call hold the splash hostage.
const PREFETCH_TIMEOUT_MS = 2500;
// Safety net in case the persisted-cache restore callback never fires.
const CACHE_RESTORE_TIMEOUT_MS = 1500;

function App() {
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
  // Local writes and sync merges invalidate the queries they affect — see changeBridge.
  useEffect(() => setupChangeBridge(queryClient), []);
  useEffect(() => { void initAnalytics(); }, []);
  // Push the signed-in identity to analytics on login and clear it on logout,
  // without coupling authStore to the analytics module. Seed once for the
  // already-hydrated user (subscribe only fires on subsequent changes).
  useEffect(() => {
    const seed = useAuthStore.getState().user;
    setAnalyticsUser(seed ? { id: seed.id, businessId: seed.businessId } : null);
    return useAuthStore.subscribe((state) =>
      setAnalyticsUser(state.user ? { id: state.user.id, businessId: state.user.businessId } : null)
    );
  }, []);

  const ready = hydrated && fontsLoaded && prefetched;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
      <PersistQueryClientProvider client={queryClient} persistOptions={queryPersistOptions} onSuccess={handleCacheRestored}>
        <PaperProvider theme={theme}>
          <AppDialogProvider>
            <SafeAreaProvider>
              <AppToastProvider>
                <StatusBar style={user?.businessProfile?.theme === 'dark' ? 'light' : 'dark'} />
                {ready ? <AppNavigator /> : null}
                {ready ? null : (
                  // Absolute + exiting FadeOut: the navigator mounts underneath and the
                  // splash fades off the top of it instead of cutting away.
                  <Reanimated.View style={StyleSheet.absoluteFill} exiting={FadeOut.duration(320)}>
                    <AppSplash />
                  </Reanimated.View>
                )}
              </AppToastProvider>
            </SafeAreaProvider>
          </AppDialogProvider>
        </PaperProvider>
      </PersistQueryClientProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

// Sentry's error boundary wraps the tree to capture render crashes. No-op until
// the native SDK is present (Expo Go / web), so this is always safe.
export default wrapApp(App);
