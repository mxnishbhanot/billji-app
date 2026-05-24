import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PaperProvider, Text } from 'react-native-paper';
import { AppNavigator } from '@/navigation/AppNavigator';
import { BrandMark } from '@/components/BrandMark';
import { queryClient } from '@/query/queryClient';
import { useAuthStore } from '@/store/authStore';
import { darkTheme, lightTheme } from '@/theme/theme';

export default function App() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const hydrate = useAuthStore((state) => state.hydrate);
  const user = useAuthStore((state) => state.user);
  const theme = user?.businessProfile?.theme === 'dark' ? darkTheme : lightTheme;

  useEffect(() => { void hydrate(); }, [hydrate]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <PaperProvider theme={theme}>
          <SafeAreaProvider>
            <StatusBar style={user?.businessProfile?.theme === 'dark' ? 'light' : 'dark'} />
            {hydrated ? <AppNavigator /> : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}>
                <BrandMark size={64} />
                <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 18 }} />
                <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 12 }}>Opening Billji...</Text>
              </View>
            )}
          </SafeAreaProvider>
        </PaperProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
