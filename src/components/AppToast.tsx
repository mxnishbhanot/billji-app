import { ReactNode, createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { Portal, Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { alpha, appColors, fontStyles, radii } from '@/theme/theme';

type ToastTone = 'success' | 'error' | 'info';
type AppToastContextValue = { showToast: (message: string, tone?: ToastTone) => void };

const AppToastContext = createContext<AppToastContextValue | undefined>(undefined);

const TONE_ICON: Record<ToastTone, keyof typeof MaterialCommunityIcons.glyphMap> = {
  success: 'check-circle',
  error: 'alert-circle',
  info: 'information'
};

export function AppToastProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      setToast({ message, tone });
      if (timer.current) clearTimeout(timer.current);
      Animated.timing(anim, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(anim, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(
          ({ finished }) => finished && setToast(null)
        );
      }, 1900);
    },
    [anim]
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  const toneColor = (tone: ToastTone) =>
    tone === 'error' ? theme.colors.error : tone === 'info' ? colors.primary : colors.accent;
  // Dark: elevated dark pill, bright text, vibrant tone icon. Light: solid brand pill, white text.
  const bg = isDark ? colors.surfaceContainerHighest : colors.primaryStrong;
  const fg = isDark ? '#F8F9FD' : '#FFFFFF';

  return (
    <AppToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Portal>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.toast,
              {
                // Clear the bottom navbar/home indicator.
                bottom: insets.bottom + 72,
                backgroundColor: bg,
                borderColor: isDark ? alpha('#FFFFFF', 0.1) : 'transparent',
                borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
                opacity: anim,
                transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }]
              }
            ]}
          >
            <MaterialCommunityIcons name={TONE_ICON[toast.tone]} size={18} color={toneColor(toast.tone)} />
            <Text style={[styles.toastText, { color: fg }]}>{toast.message}</Text>
          </Animated.View>
        </Portal>
      ) : null}
    </AppToastContext.Provider>
  );
}

export function useAppToast() {
  const context = useContext(AppToastContext);
  if (!context) throw new Error('useAppToast must be used within AppToastProvider');
  return context;
}

const styles = StyleSheet.create({
  toast: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: radii.pill,
    elevation: 6,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 11,
    position: 'absolute',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 16
  },
  toastText: { ...fontStyles.bold, fontSize: 13.5, letterSpacing: 0.1 }
});
