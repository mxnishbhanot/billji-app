import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Button, Text, TextInput, useTheme } from 'react-native-paper';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { authApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { AppCard } from '@/components/AppCard';
import { useAppDialog } from '@/components/AppDialog';
import { FormTextInput } from '@/components/FormTextInput';
import { useAuthStore } from '@/store/authStore';
import { alpha, appColors, fontStyles, radii, spacing, typeScale } from '@/theme/theme';
import { registerSchema } from '@/validation/schemas';

const billjiLogo = require('../../assets/main-logo-clean.png');

function AuthHeroPattern() {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 360 190" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <LinearGradient id="authRegisterHeroGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#1C1A4A" />
          <Stop offset="0.5" stopColor="#2D2A6B" />
          <Stop offset="1" stopColor="#40388C" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width={360} height={190} fill="url(#authRegisterHeroGrad)" />
      <G opacity="0.2" stroke="#FFFFFF" strokeWidth={1.2} fill="none" strokeLinecap="round">
        <Path d="M -26 46 C 28 10, 84 10, 134 42 S 236 86, 392 22" />
        <Path d="M -30 82 C 38 38, 96 42, 154 76 S 270 126, 392 72" opacity={0.72} />
        <Path d="M -28 128 C 48 86, 116 98, 176 124 S 282 168, 390 118" opacity={0.58} />
        <Path d="M 32 190 C 92 146, 148 158, 204 176 S 294 212, 388 162" opacity={0.42} />
      </G>
      <G opacity="0.18" stroke="#FFFFFF" strokeWidth={1.1} fill="none">
        <Circle cx={272} cy={52} r={18} />
        <Circle cx={302} cy={84} r={8} />
        <Circle cx={70} cy={142} r={13} />
        <Circle cx={110} cy={36} r={6} />
      </G>
      <G opacity="0.08" stroke="#A5B4FC" strokeWidth={18} fill="none">
        <Path d="M 238 -18 C 284 16, 318 52, 386 48" />
        <Path d="M -34 176 C 36 138, 86 154, 146 194" />
      </G>
    </Svg>
  );
}

function FloatingBubbles() {
  const first = useMemo(() => new Animated.Value(0), []);
  const second = useMemo(() => new Animated.Value(0), []);
  const third = useMemo(() => new Animated.Value(0), []);
  const fourth = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(first, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(first, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true })
        ]),
        Animated.sequence([
          Animated.timing(second, { toValue: 1, duration: 12000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(second, { toValue: 0, duration: 12000, easing: Easing.inOut(Easing.sin), useNativeDriver: true })
        ]),
        Animated.sequence([
          Animated.timing(third, { toValue: 1, duration: 15000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(third, { toValue: 0, duration: 15000, easing: Easing.inOut(Easing.sin), useNativeDriver: true })
        ]),
        Animated.sequence([
          Animated.timing(fourth, { toValue: 1, duration: 18000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(fourth, { toValue: 0, duration: 18000, easing: Easing.inOut(Easing.sin), useNativeDriver: true })
        ])
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [first, fourth, second, third]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View
        style={[
          styles.bubbleLarge,
          {
            opacity: first.interpolate({ inputRange: [0, 1], outputRange: [0.16, 0.26] }),
            transform: [
              { translateX: first.interpolate({ inputRange: [0, 1], outputRange: [0, -20] }) },
              { translateY: first.interpolate({ inputRange: [0, 1], outputRange: [0, 12] }) },
              { scale: first.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.08] }) }
            ]
          }
        ]}
      />
      <Animated.View
        style={[
          styles.bubbleSmall,
          {
            opacity: second.interpolate({ inputRange: [0, 1], outputRange: [0.1, 0.2] }),
            transform: [
              { translateX: second.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) },
              { translateY: second.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }) },
              { scale: second.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.1] }) }
            ]
          }
        ]}
      />
      <Animated.View
        style={[
          styles.bubbleMedium,
          {
            opacity: third.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.18] }),
            transform: [
              { translateX: third.interpolate({ inputRange: [0, 1], outputRange: [0, 24] }) },
              { translateY: third.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) },
              { scale: third.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.12] }) }
            ]
          }
        ]}
      />
      <Animated.View
        style={[
          styles.bubbleTiny,
          {
            opacity: fourth.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.22] }),
            transform: [
              { translateX: fourth.interpolate({ inputRange: [0, 1], outputRange: [0, -16] }) },
              { translateY: fourth.interpolate({ inputRange: [0, 1], outputRange: [0, -18] }) },
              { scale: fourth.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.14] }) }
            ]
          }
        ]}
      />
    </View>
  );
}

export function RegisterScreen({ navigation }: any) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const { showDialog } = useAppDialog();
  const setSession = useAuthStore((state) => state.setSession);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const scrollY = useMemo(() => new Animated.Value(0), []);
  const heroParallaxStyle = {
    opacity: scrollY.interpolate({ inputRange: [0, 180], outputRange: [1, 0.94], extrapolate: 'clamp' }),
    transform: [
      { translateY: scrollY.interpolate({ inputRange: [0, 180], outputRange: [0, 24], extrapolate: 'clamp' }) },
      { scale: scrollY.interpolate({ inputRange: [0, 180], outputRange: [1, 0.97], extrapolate: 'clamp' }) }
    ]
  };
  const form = useForm<any>({ defaultValues: { name: '', email: '', password: '' }, resolver: zodResolver(registerSchema) });
  const mutation = useMutation({ mutationFn: authApi.register, onSuccess: setSession, onError: (error) => showDialog({ title: 'Registration failed', message: apiErrorMessage(error, 'Registration failed'), tone: 'error' }) });

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
      <Animated.ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
      >
        <View style={styles.shell}>
          <Animated.View style={[styles.heroPanel, { borderColor: alpha('#C3C0FF', 0.3) }, heroParallaxStyle]}>
            <AuthHeroPattern />
            <FloatingBubbles />
            <View style={styles.brandRow}>
              <View style={styles.logoWrap}>
                <Image source={billjiLogo} resizeMode="contain" style={styles.logo} />
              </View>
              <View style={styles.brandCopy}>
                <View style={styles.wordmarkRow}>
                  <Text style={styles.wordmarkBill}>Bill</Text>
                  <Text style={styles.wordmarkJi}>Ji</Text>
                </View>
                <Text style={styles.tagline}>Hisaab Apka, Growth Apki</Text>
              </View>
            </View>
          </Animated.View>

          <AppCard style={[styles.formCard, { borderColor: isDark ? alpha(colors.primary, 0.18) : alpha(colors.primaryStrong, 0.08) }]}>
            <View style={styles.formHeader}>
              <Text variant="titleLarge" style={[styles.formTitle, { color: theme.colors.onSurface }]}>Sign up</Text>
              <Text style={[styles.formSubtitle, { color: theme.colors.onSurfaceVariant }]}>Your business tools are ready after this step.</Text>
            </View>

            <Button
              mode="outlined"
              icon="google"
              onPress={() => showDialog({ title: 'Google sign up', message: 'Google sign up will be available after Google auth is connected.' })}
              contentStyle={styles.googleButtonContent}
              labelStyle={[styles.googleButtonLabel, { color: theme.colors.onSurface }]}
              style={[styles.googleButton, { borderColor: theme.colors.outlineVariant }]}
            >
              Sign up with Google
            </Button>

            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: theme.colors.outlineVariant }]} />
              <Text style={[styles.dividerText, { color: theme.colors.onSurfaceVariant }]}>or create with email</Text>
              <View style={[styles.dividerLine, { backgroundColor: theme.colors.outlineVariant }]} />
            </View>

            <FormTextInput control={form.control} name="name" label="Name" left={<TextInput.Icon icon="account-outline" />} />
            <FormTextInput control={form.control} name="email" label="Email" keyboardType="email-address" autoCapitalize="none" left={<TextInput.Icon icon="email-outline" />} />
            <FormTextInput
              control={form.control}
              name="password"
              label="Password"
              secureTextEntry={!passwordVisible}
              left={<TextInput.Icon icon="lock-outline" />}
              right={(
                <TextInput.Icon
                  icon={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
                  forceTextInputFocus={false}
                  onPress={() => setPasswordVisible((visible) => !visible)}
                />
              )}
            />

            <Button
              mode="contained"
              icon="account-plus-outline"
              loading={mutation.isPending}
              onPress={form.handleSubmit((values) => mutation.mutate(values))}
              contentStyle={styles.primaryButtonContent}
              labelStyle={styles.primaryButtonLabel}
              style={styles.primaryButton}
            >
              Create BillJi account
            </Button>

            <View style={[styles.switchRow, { borderColor: theme.colors.outlineVariant }]}>
              <Text style={[styles.switchText, { color: theme.colors.onSurfaceVariant }]}>Already with BillJi?</Text>
              <Button mode="text" compact onPress={() => navigation.navigate('Login')} labelStyle={styles.switchButtonLabel}>
                Login
              </Button>
            </View>
          </AppCard>
        </View>
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 36,
    paddingHorizontal: spacing.screenPadding
  },
  shell: {
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    minHeight: 640,
    paddingVertical: spacing.md
  },
  heroPanel: {
    backgroundColor: '#1C1A4A',
    borderRadius: radii.xl,
    borderWidth: 1,
    minHeight: 150,
    overflow: 'hidden',
    padding: spacing.lg,
    shadowColor: '#4338CA',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.08,
    shadowRadius: 28
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: 0
  },
  logoWrap: {
    alignItems: 'center',
    borderRadius: radii.full,
    backgroundColor: alpha('#FFFFFF', 0.96),
    height: 104,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 104
  },
  logo: {
    height: 104,
    width: 104
  },
  brandCopy: {
    flex: 1,
    minWidth: 0
  },
  wordmarkRow: {
    flexDirection: 'row',
    marginBottom: 3
  },
  wordmarkBill: {
    ...fontStyles.bold,
    color: '#FFFFFF',
    fontSize: 34,
    letterSpacing: -1.4,
    lineHeight: 40
  },
  wordmarkJi: {
    ...fontStyles.bold,
    color: '#FF8A1F',
    fontSize: 34,
    letterSpacing: -1.4,
    lineHeight: 40
  },
  tagline: {
    ...fontStyles.semiBold,
    color: alpha('#FFFFFF', 0.86),
    fontSize: 14,
    lineHeight: 20
  },
  bubbleLarge: {
    backgroundColor: alpha('#FFFFFF', 0.18),
    borderColor: alpha('#FFFFFF', 0.34),
    borderRadius: 70,
    borderWidth: 1,
    height: 140,
    position: 'absolute',
    right: -44,
    top: 34,
    width: 140
  },
  bubbleSmall: {
    backgroundColor: alpha('#FFFFFF', 0.14),
    borderColor: alpha('#FFFFFF', 0.28),
    borderRadius: 44,
    borderWidth: 1,
    height: 88,
    left: -26,
    position: 'absolute',
    top: -20,
    width: 88
  },
  bubbleMedium: {
    backgroundColor: alpha('#A5B4FC', 0.16),
    borderColor: alpha('#FFFFFF', 0.24),
    borderRadius: 52,
    borderWidth: 1,
    bottom: -34,
    height: 104,
    left: 28,
    position: 'absolute',
    width: 104
  },
  bubbleTiny: {
    backgroundColor: alpha('#FFFFFF', 0.16),
    borderColor: alpha('#FFFFFF', 0.3),
    borderRadius: 24,
    borderWidth: 1,
    height: 48,
    position: 'absolute',
    right: 74,
    top: 24,
    width: 48
  },
  formCard: {
    borderRadius: radii.xl,
    marginBottom: 0
  },
  formHeader: {
    marginBottom: spacing.md
  },
  formTitle: {
    ...fontStyles.bold,
    letterSpacing: -0.6,
    marginBottom: 4
  },
  formSubtitle: {
    ...typeScale.bodyPrimary
  },
  primaryButton: {
    borderRadius: radii.input,
    marginTop: 2
  },
  primaryButtonContent: {
    height: 52
  },
  primaryButtonLabel: {
    ...fontStyles.bold,
    fontSize: 15
  },
  googleButton: {
    borderRadius: radii.input,
    marginBottom: spacing.md
  },
  googleButtonContent: {
    height: 50
  },
  googleButtonLabel: {
    ...fontStyles.bold,
    fontSize: 15
  },
  dividerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth
  },
  dividerText: {
    ...typeScale.caption
  },
  switchRow: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.md
  },
  switchText: {
    ...typeScale.caption
  },
  switchButtonLabel: {
    ...fontStyles.semiBold,
    fontSize: 14
  }
});
