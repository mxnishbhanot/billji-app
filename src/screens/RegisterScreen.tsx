import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';
import Reanimated, { Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
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
import { RegisterScreenProps } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { GoogleSignInCancelled, signInWithGoogle } from '@/services/googleAuth';
import { LoginResult, isTwoFactorChallenge } from '@/types';
import { alpha, appColors, fontStyles, radii, spacing, typeScale } from '@/theme/theme';
import { registerSchema } from '@/validation/schemas';
import { reconcilePendingReferral } from '@/features/referrals/reconcile';
import { savePendingReferralCode } from '@/features/referrals/pendingCode';

const billjiLogo = require('../../assets/main-logo-clean.png');

function AuthHeroPattern() {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 360 260" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <LinearGradient id="authRegisterHeroGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#1C1A4A" />
          <Stop offset="0.5" stopColor="#2D2A6B" />
          <Stop offset="1" stopColor="#40388C" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width={360} height={260} fill="url(#authRegisterHeroGrad)" />
      <G opacity="0.2" stroke="#FFFFFF" strokeWidth={1.2} fill="none" strokeLinecap="round">
        <Path d="M -26 58 C 28 22, 84 22, 134 54 S 236 98, 392 34" />
        <Path d="M -30 102 C 38 58, 96 62, 154 96 S 270 146, 392 92" opacity={0.72} />
        <Path d="M -28 158 C 48 116, 116 128, 176 154 S 282 198, 390 148" opacity={0.58} />
        <Path d="M 32 244 C 92 200, 148 212, 204 230 S 294 266, 388 216" opacity={0.42} />
      </G>
      <G opacity="0.18" stroke="#FFFFFF" strokeWidth={1.1} fill="none">
        <Circle cx={272} cy={64} r={18} />
        <Circle cx={302} cy={96} r={8} />
        <Circle cx={70} cy={178} r={13} />
        <Circle cx={110} cy={48} r={6} />
      </G>
      <G opacity="0.08" stroke="#A5B4FC" strokeWidth={18} fill="none">
        <Path d="M 238 -18 C 284 16, 318 52, 386 48" />
        <Path d="M -34 232 C 36 194, 86 210, 146 250" />
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

export function RegisterScreen({ navigation }: RegisterScreenProps) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const { showDialog } = useAppDialog();
  const setSession = useAuthStore((state) => state.setSession);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((event) => { scrollY.value = event.contentOffset.y; });
  const heroParallaxStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 180], [1, 0.94], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(scrollY.value, [0, 180], [0, 24], Extrapolation.CLAMP) },
      { scale: interpolate(scrollY.value, [0, 180], [1, 0.97], Extrapolation.CLAMP) }
    ]
  }));
  const form = useForm<{ name: string; email: string; password: string; referralCode?: string }>({
    defaultValues: { name: '', email: '', password: '', referralCode: '' },
    resolver: zodResolver(registerSchema)
  });
  const mutation = useMutation({
    mutationFn: async (values: { name: string; email: string; password: string; referralCode?: string }) => {
      // Saved BEFORE the request: a signup cannot happen offline (the server mints the account and the
      // tokens), so if this attempt never reaches the server the code has to survive until one does.
      if (values.referralCode) await savePendingReferralCode(values.referralCode);
      return authApi.register(values);
    },
    onSuccess: async (session) => {
      await setSession(session);
      // Applied at signup, or queued as an APPLY_REFERRAL for the sync engine to deliver. Either way the
      // reward is the server's to grant and arrives as a subscription.
      const businessId = session.user?.businessId;
      if (businessId) {
        await reconcilePendingReferral({ businessId, signupResult: session.referral ?? null }).catch(() => undefined);
      }
    },
    onError: (error) => showDialog({ title: 'Registration failed', message: apiErrorMessage(error, 'Registration failed'), tone: 'error' })
  });
  const googleMutation = useMutation({
    mutationFn: async () => authApi.google(await signInWithGoogle()),
    // An existing Google account may already have 2FA on — route to the challenge.
    onSuccess: (result: LoginResult) => {
      if (isTwoFactorChallenge(result)) {
        navigation.navigate('TwoFactorChallenge', { challengeToken: result.challengeToken, method: result.method, email: result.email, devCode: result.devCode });
        return;
      }
      void setSession(result);
    },
    onError: (error) => {
      if (error instanceof GoogleSignInCancelled) return;
      showDialog({ title: 'Google sign up failed', message: apiErrorMessage(error, 'Google sign up failed'), tone: 'error' });
    }
  });

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        scrollEventThrottle={16}
        onScroll={scrollHandler}
      >
        <View style={styles.shell}>
          <Reanimated.View style={[styles.heroPanel, { borderColor: alpha('#C3C0FF', 0.3) }, heroParallaxStyle]}>
            <AuthHeroPattern />
            <FloatingBubbles />
            <View style={styles.logoWrap}>
              <Image source={billjiLogo} resizeMode="contain" style={styles.logo} />
            </View>

            <View style={styles.wordmarkRow}>
              <Text style={styles.wordmarkBill}>Bill</Text>
              <Text style={styles.wordmarkJi}>Ji</Text>
            </View>
            <Text style={styles.tagline}>Hisaab Apka, Growth Apki</Text>
          </Reanimated.View>

          <AppCard style={[styles.formCard, { borderColor: isDark ? alpha(colors.primary, 0.18) : alpha(colors.primaryStrong, 0.08) }]}>
            <View style={styles.formHeader}>
              <Text variant="titleLarge" style={[styles.formTitle, { color: theme.colors.onSurface }]}>Sign up</Text>
              <Text style={[styles.formSubtitle, { color: theme.colors.onSurfaceVariant }]}>Your business tools are ready after this step.</Text>
            </View>

            <Button
              mode="outlined"
              icon="google"
              loading={googleMutation.isPending}
              disabled={googleMutation.isPending}
              onPress={() => googleMutation.mutate()}
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

            {/* Last field, and optional: nobody should think a code is required to sign up. */}
            <FormTextInput
              control={form.control}
              name="referralCode"
              label="Referral code (optional)"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={12}
              left={<TextInput.Icon icon="gift-outline" />}
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
      </KeyboardAwareScrollView>
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
    paddingVertical: spacing.md
  },
  heroPanel: {
    alignItems: 'center',
    backgroundColor: '#1C1A4A',
    borderRadius: radii.xl,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    shadowColor: '#4338CA',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.08,
    shadowRadius: 28
  },
  logoWrap: {
    alignItems: 'center',
    borderRadius: radii.full,
    backgroundColor: alpha('#FFFFFF', 0.96),
    height: 76,
    justifyContent: 'center',
    marginBottom: spacing.xs,
    overflow: 'hidden',
    width: 76
  },
  logo: {
    height: 76,
    width: 76
  },
  wordmarkRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
    marginTop: spacing.xs
  },
  wordmarkBill: {
    ...fontStyles.bold,
    color: '#FFFFFF',
    fontSize: 30,
    letterSpacing: -1.4,
    lineHeight: 38
  },
  wordmarkJi: {
    ...fontStyles.bold,
    color: '#1E7FFF',
    fontSize: 30,
    letterSpacing: -1.4,
    lineHeight: 38
  },
  tagline: {
    ...fontStyles.semiBold,
    color: alpha('#FFFFFF', 0.88),
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.xs
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
