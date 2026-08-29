import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Button, Switch, Text, TextInput, useTheme } from 'react-native-paper';
import { twoFactorApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { useAppDialog } from '@/components/AppDialog';
import { AuthShell, useAuthCompact } from '@/components/AuthShell';
import { FormTextInput } from '@/components/FormTextInput';
import { TwoFactorChallengeScreenProps } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { setTrustedDeviceToken } from '@/store/trustedDevice';
import { alpha, appColors, fontStyles, radii, spacing, typeScale } from '@/theme/theme';
import { twoFactorCodeSchema } from '@/validation/schemas';

type CodeForm = { code: string };

export function TwoFactorChallengeScreen({ navigation, route }: TwoFactorChallengeScreenProps) {
  const { challengeToken, method, email, devCode } = route.params;
  const theme = useTheme();
  const colors = appColors(theme.dark);
  const compact = useAuthCompact();
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
    <AuthShell
      title="Verify it’s you"
      subtitle={subtitle}
      footer={(
        <View style={styles.footer}>
          <Button mode="text" compact onPress={() => navigation.navigate('Login')} labelStyle={styles.footerLink}>
            Back to login
          </Button>
        </View>
      )}
    >
      <FormTextInput
        control={form.control}
        name="code"
        label={useBackupCode ? 'Backup code' : '6-digit code'}
        keyboardType={useBackupCode ? 'default' : 'number-pad'}
        autoCapitalize="none"
        autoComplete={useBackupCode ? 'off' : 'one-time-code'}
        maxLength={useBackupCode ? 11 : 6}
        dense={compact}
        style={{ marginBottom: compact ? spacing.xs : spacing.sm }}
        left={<TextInput.Icon icon={useBackupCode ? 'key-variant' : 'shield-key-outline'} />}
      />

      <View style={[styles.rememberRow, { backgroundColor: alpha(colors.primary, theme.dark ? 0.1 : 0.07) }]}>
        <View style={styles.rememberCopy}>
          <Text style={[styles.rememberTitle, { color: colors.foreground }]}>Trust this device</Text>
          <Text style={[styles.rememberSubtitle, { color: colors.mutedForeground }]}>Skip codes on this device for 30 days</Text>
        </View>
        <Switch value={rememberDevice} onValueChange={setRememberDevice} color={colors.primary} />
      </View>

      <Button
        mode="contained"
        loading={verify.isPending}
        onPress={form.handleSubmit((values) => verify.mutate(values))}
        contentStyle={{ height: compact ? 46 : 52 }}
        labelStyle={styles.primaryLabel}
        style={styles.primary}
      >
        Verify &amp; continue
      </Button>

      {isEmail && !useBackupCode ? (
        <Button mode="text" compact loading={resend.isPending} onPress={() => resend.mutate()} labelStyle={styles.linkLabel} style={styles.link}>
          Didn’t get a code? Resend
        </Button>
      ) : null}

      <Button mode="text" compact onPress={() => setUseBackupCode((v) => !v)} labelStyle={styles.linkLabel} style={styles.link}>
        {useBackupCode ? 'Use my authenticator / email code' : 'Use a backup code instead'}
      </Button>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  rememberRow: {
    alignItems: 'center',
    borderRadius: radii.input,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  rememberCopy: { flex: 1, minWidth: 0 },
  rememberTitle: { ...fontStyles.semiBold, fontSize: 14 },
  rememberSubtitle: { ...typeScale.caption },
  primary: { borderRadius: radii.input },
  primaryLabel: { ...fontStyles.bold, fontSize: 15 },
  link: { alignSelf: 'center', marginTop: 2 },
  linkLabel: { ...fontStyles.semiBold, fontSize: 13 },
  footer: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginTop: spacing.sm },
  footerLink: { ...fontStyles.semiBold, fontSize: 14, marginHorizontal: 6 }
});
