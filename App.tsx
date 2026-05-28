import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold
} from '@expo-google-fonts/plus-jakarta-sans';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PaperProvider, Text } from 'react-native-paper';
import { AppNavigator } from '@/navigation/AppNavigator';
import { AppDialogProvider } from '@/components/AppDialog';
import { BrandMark } from '@/components/BrandMark';
import { queryClient } from '@/query/queryClient';
import { queryPersistOptions } from '@/query/persistence';
import { setupNetworkBridge } from '@/query/networkBridge';
import { useAuthStore } from '@/store/authStore';
import { darkTheme, lightTheme } from '@/theme/theme';

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

  useEffect(() => { void hydrate(); }, [hydrate]);
  useEffect(() => setupNetworkBridge(), []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PersistQueryClientProvider client={queryClient} persistOptions={queryPersistOptions}>
        <PaperProvider theme={theme}>
          <AppDialogProvider>
            <SafeAreaProvider>
              <StatusBar style={user?.businessProfile?.theme === 'dark' ? 'light' : 'dark'} />
              {hydrated && fontsLoaded ? <AppNavigator /> : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}>
                  <BrandMark size={64} />
                  <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 18 }} />
                  <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 12 }}>Opening Billji...</Text>
                </View>
              )}
            </SafeAreaProvider>
          </AppDialogProvider>
        </PaperProvider>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}
