import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Button, Switch, Text, TextInput, useTheme } from 'react-native-paper';
import { twoFactorApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { AppCard } from '@/components/AppCard';
import { useAppDialog } from '@/components/AppDialog';
import { FormTextInput } from '@/components/FormTextInput';
import { TwoFactorChallengeScreenProps } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { setTrustedDeviceToken } from '@/store/trustedDevice';
import { alpha, appColors, fontStyles, radii, spacing, typeScale } from '@/theme/theme';
import { twoFactorCodeSchema } from '@/validation/schemas';

const billjiLogo = require('../../assets/main-logo-clean.png');

type CodeForm = { code: string };

export function TwoFactorChallengeScreen({ navigation, route }: TwoFactorChallengeScreenProps) {
  const { challengeToken, method, email, devCode } = route.params;
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const { showDialog } = useAppDialog();
  const setSession = useAuthStore((state) => state.setSession);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [useBackupCode, setUseBackupCode] = useState(false);

  const form = useForm<CodeForm>({
    // Prefill the emailed code in dev builds (backend echoes it when no provider).
    defaultValues: { code: __DEV__ && devCode ? devCode : '' },
    resolver: zodResolver(twoFactorCodeSchema)
  });

  const verify = useMutation({
    mutationFn: (values: CodeForm) => twoFactorApi.verify({ challengeToken, code: values.code.trim(), rememberDevice }),
    onSuccess: async (session) => {
      if (rememberDevice && session.trustedDeviceToken) {
        await setTrustedDeviceToken(session.trustedDeviceToken);
      }
      // Setting the session flips the navigator from the auth stack to the app.
      await setSession(session);
    },
    onError: (error) => showDialog({ title: "Couldn't verify", message: apiErrorMessage(error, 'That code is incorrect or expired'), tone: 'error' })
  });

  const resend = useMutation({
    mutationFn: () => twoFactorApi.resend(challengeToken),
    onSuccess: (res) => {
      if (__DEV__ && res.devCode) form.setValue('code', res.devCode);
      showDialog({ title: 'Code sent', message: `A new code was sent to ${email || 'your email'}.` });
    },
    onError: (error) => showDialog({ title: 'Could not resend', message: apiErrorMessage(error, 'Please try again'), tone: 'error' })
  });

  const isEmail = method === 'email';
  const subtitle = useBackupCode
    ? 'Enter one of the backup codes you saved when you turned on two-factor authentication.'
    : isEmail
      ? `Enter the 6-digit code we sent to ${email || 'your email'}.`
      : 'Enter the 6-digit code from your authenticator app.';

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.shell}>
          <View style={[styles.heroPanel, { borderColor: alpha('#C3C0FF', 0.3) }]}>
            <View style={styles.brandRow}>
              <View style={styles.logoWrap}>
                <Image source={billjiLogo} resizeMode="contain" style={styles.logo} />
              </View>
              <View style={styles.brandCopy}>
                <View style={styles.wordmarkRow}>
                  <Text style={styles.wordmarkBill}>Bill</Text>
                  <Text style={styles.wordmarkJi}>Ji</Text>
                </View>
                <Text style={styles.tagline}>Two-step verification</Text>
              </View>
            </View>
          </View>

          <AppCard style={[styles.formCard, { borderColor: isDark ? alpha(colors.primary, 0.18) : alpha(colors.primaryStrong, 0.08) }]}>
            <View style={styles.formHeader}>
              <Text variant="headlineSmall" style={[styles.formTitle, { color: theme.colors.onSurface }]}>Verify it’s you</Text>
              <Text style={[styles.formSubtitle, { color: theme.colors.onSurfaceVariant }]}>{subtitle}</Text>
            </View>

            <FormTextInput
              control={form.control}
              name="code"
              label={useBackupCode ? 'Backup code' : '6-digit code'}
              keyboardType={useBackupCode ? 'default' : 'number-pad'}
              autoCapitalize="none"
              autoComplete={useBackupCode ? 'off' : 'one-time-code'}
              maxLength={useBackupCode ? 11 : 6}
              left={<TextInput.Icon icon={useBackupCode ? 'key-variant' : 'shield-key-outline'} />}
            />

            <View style={styles.rememberRow}>
              <View style={styles.rememberCopy}>
                <Text style={[styles.rememberTitle, { color: theme.colors.onSurface }]}>Trust this device</Text>
                <Text style={[styles.rememberSubtitle, { color: theme.colors.onSurfaceVariant }]}>Skip codes on this device for 30 days</Text>
              </View>
              <Switch value={rememberDevice} onValueChange={setRememberDevice} color={theme.colors.primary} />
            </View>

            <Button
              mode="contained"
              icon="check-decagram"
              loading={verify.isPending}
              onPress={form.handleSubmit((values) => verify.mutate(values))}
              contentStyle={styles.primaryButtonContent}
              labelStyle={styles.primaryButtonLabel}
              style={styles.primaryButton}
            >
              Verify &amp; continue
            </Button>

            {isEmail && !useBackupCode ? (
              <Button mode="text" compact loading={resend.isPending} onPress={() => resend.mutate()} labelStyle={styles.linkLabel} style={styles.linkButton}>
                Didn’t get a code? Resend
              </Button>
            ) : null}

            <Button mode="text" compact onPress={() => setUseBackupCode((v) => !v)} labelStyle={styles.linkLabel} style={styles.linkButton}>
              {useBackupCode ? 'Use my authenticator / email code' : 'Use a backup code instead'}
            </Button>

            <View style={[styles.switchRow, { borderColor: theme.colors.outlineVariant }]}>
              <Button mode="text" compact onPress={() => navigation.navigate('Login')} labelStyle={styles.switchButtonLabel}>
                Back to login
              </Button>
            </View>
          </AppCard>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 36, paddingHorizontal: spacing.screenPadding },
  shell: { flex: 1, gap: spacing.md, justifyContent: 'center', minHeight: 620, paddingVertical: spacing.md },
  heroPanel: {
    backgroundColor: '#1C1A4A',
    borderRadius: radii.xl,
    borderWidth: 1,
    minHeight: 130,
    overflow: 'hidden',
    padding: spacing.lg,
    shadowColor: '#4338CA',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.08,
    shadowRadius: 28
  },
  brandRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  logoWrap: {
    alignItems: 'center',
    borderRadius: radii.full,
    backgroundColor: alpha('#FFFFFF', 0.96),
    height: 84,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 84
  },
  logo: { height: 84, width: 84 },
  brandCopy: { flex: 1, minWidth: 0 },
  wordmarkRow: { flexDirection: 'row', marginBottom: 3 },
  wordmarkBill: { ...fontStyles.bold, color: '#FFFFFF', fontSize: 32, letterSpacing: -1.4, lineHeight: 38 },
  wordmarkJi: { ...fontStyles.bold, color: '#FF8A1F', fontSize: 32, letterSpacing: -1.4, lineHeight: 38 },
  tagline: { ...fontStyles.semiBold, color: alpha('#FFFFFF', 0.86), fontSize: 14, lineHeight: 20, marginBottom: 2 },
  formCard: { borderRadius: radii.xl, marginBottom: 0 },
  formHeader: { marginBottom: spacing.md },
  formTitle: { ...fontStyles.bold, letterSpacing: -0.7, marginBottom: 4 },
  formSubtitle: { ...typeScale.bodyPrimary },
  rememberRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between', marginBottom: spacing.sm, marginTop: -4 },
  rememberCopy: { flex: 1, minWidth: 0 },
  rememberTitle: { ...fontStyles.semiBold, fontSize: 14 },
  rememberSubtitle: { ...typeScale.caption },
  primaryButton: { borderRadius: radii.input, marginTop: 2 },
  primaryButtonContent: { height: 52 },
  primaryButtonLabel: { ...fontStyles.bold, fontSize: 15 },
  linkButton: { alignSelf: 'center', marginTop: spacing.xs },
  linkLabel: { ...fontStyles.semiBold, fontSize: 13 },
  switchRow: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.sm,
    paddingTop: spacing.sm
  },
  switchButtonLabel: { ...fontStyles.semiBold, fontSize: 14 }
});
