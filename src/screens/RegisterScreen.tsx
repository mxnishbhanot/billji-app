import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Button, Text, TextInput, useTheme } from 'react-native-paper';
import { authApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { useAppDialog } from '@/components/AppDialog';
import { AuthShell, useAuthCompact } from '@/components/AuthShell';
import { FormTextInput } from '@/components/FormTextInput';
import { RegisterScreenProps } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { GoogleSignInCancelled, signInWithGoogle } from '@/services/googleAuth';
import { LoginResult, isTwoFactorChallenge } from '@/types';
import { appColors, fontStyles, radii, spacing, typeScale } from '@/theme/theme';
import { registerSchema } from '@/validation/schemas';
import { reconcilePendingReferral } from '@/features/referrals/reconcile';
import { savePendingReferralCode } from '@/features/referrals/pendingCode';

type FormValues = { name: string; email: string; password: string; referralCode?: string };

export function RegisterScreen({ navigation }: RegisterScreenProps) {
  const theme = useTheme();
  const colors = appColors(theme.dark);
  const compact = useAuthCompact();
  const { showDialog } = useAppDialog();
  const setSession = useAuthStore((state) => state.setSession);
  const [passwordVisible, setPasswordVisible] = useState(false);
  // Optional and rarely used, so it stays behind a link: four fields plus a code do not
  // fit a short screen, and nobody should read a referral box as a requirement.
  const [referralOpen, setReferralOpen] = useState(false);

  const form = useForm<FormValues>({
    defaultValues: { name: '', email: '', password: '', referralCode: '' },
    resolver: zodResolver(registerSchema)
  });
  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
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

  const fieldStyle = { marginBottom: compact ? spacing.xs : spacing.sm };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Billing, stock and payments — ready in a minute."
      footer={(
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>Already with BillJi?</Text>
          <Button mode="text" compact onPress={() => navigation.navigate('Login')} labelStyle={styles.footerLink}>
            Login
          </Button>
        </View>
      )}
    >
      <Button
        mode="outlined"
        icon="google"
        loading={googleMutation.isPending}
        disabled={googleMutation.isPending}
        onPress={() => googleMutation.mutate()}
        contentStyle={{ height: compact ? 44 : 48 }}
        labelStyle={[styles.googleLabel, { color: colors.foreground }]}
        style={[styles.google, { borderColor: theme.colors.outlineVariant }]}
      >
        Sign up with Google
      </Button>

      <View style={[styles.dividerRow, { marginVertical: compact ? spacing.xs : spacing.sm }]}>
        <View style={[styles.dividerLine, { backgroundColor: theme.colors.outlineVariant }]} />
        <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>or use email</Text>
        <View style={[styles.dividerLine, { backgroundColor: theme.colors.outlineVariant }]} />
      </View>

      <FormTextInput control={form.control} name="name" label="Name" dense={compact} style={fieldStyle} left={<TextInput.Icon icon="account-outline" />} />
      <FormTextInput control={form.control} name="email" label="Email" keyboardType="email-address" autoCapitalize="none" dense={compact} style={fieldStyle} left={<TextInput.Icon icon="email-outline" />} />
      <FormTextInput
        control={form.control}
        name="password"
        label="Password"
        secureTextEntry={!passwordVisible}
        dense={compact}
        style={fieldStyle}
        left={<TextInput.Icon icon="lock-outline" />}
        right={(
          <TextInput.Icon
            icon={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
            forceTextInputFocus={false}
            onPress={() => setPasswordVisible((visible) => !visible)}
          />
        )}
      />

      {referralOpen ? (
        <FormTextInput
          control={form.control}
          name="referralCode"
          label="Referral code"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={12}
          dense={compact}
          style={fieldStyle}
          left={<TextInput.Icon icon="gift-outline" />}
        />
      ) : (
        <Button mode="text" compact onPress={() => setReferralOpen(true)} labelStyle={styles.referralLabel} style={styles.referral}>
          Have a referral code?
        </Button>
      )}

      <Button
        mode="contained"
        loading={mutation.isPending}
        onPress={form.handleSubmit((values) => mutation.mutate(values))}
        contentStyle={{ height: compact ? 46 : 52 }}
        labelStyle={styles.primaryLabel}
        style={styles.primary}
      >
        Create account
      </Button>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  google: { borderRadius: radii.input, borderWidth: 1 },
  googleLabel: { ...fontStyles.semiBold, fontSize: 15 },
  dividerRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { ...typeScale.caption },
  referral: { alignSelf: 'flex-start', marginBottom: 4, marginTop: -4 },
  referralLabel: { ...fontStyles.semiBold, fontSize: 13 },
  primary: { borderRadius: radii.input },
  primaryLabel: { ...fontStyles.bold, fontSize: 15 },
  footer: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginTop: spacing.sm },
  footerText: { ...typeScale.caption },
  footerLink: { ...fontStyles.semiBold, fontSize: 14, marginHorizontal: 6 }
});
