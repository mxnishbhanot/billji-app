import { useEffect, useState } from 'react';
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
import { LoginScreenProps } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { GoogleSignInCancelled, signInWithGoogle } from '@/services/googleAuth';
import { appColors, fontStyles, radii, spacing, typeScale } from '@/theme/theme';
import { LoginResult, isTwoFactorChallenge } from '@/types';
import { loginSchema } from '@/validation/schemas';

export function LoginScreen({ navigation }: LoginScreenProps) {
  const theme = useTheme();
  const colors = appColors(theme.dark);
  const compact = useAuthCompact();
  const { showDialog } = useAppDialog();
  const setSession = useAuthStore((state) => state.setSession);
  const logoutReason = useAuthStore((state) => state.logoutReason);
  const clearLogoutReason = useAuthStore((state) => state.clearLogoutReason);
  const [passwordVisible, setPasswordVisible] = useState(false);

  // Surface a friendly explanation when the app force-signed-out (e.g. this device
  // was signed out from another phone) instead of a raw "jwt expired" failure.
  useEffect(() => {
    if (!logoutReason) return;
    showDialog({ title: 'Signed out', message: logoutReason });
    clearLogoutReason();
  }, [logoutReason, showDialog, clearLogoutReason]);

  const form = useForm<{ email: string; password: string }>({ defaultValues: { email: '', password: '' }, resolver: zodResolver(loginSchema) });
  // Login/Google may return a session or, when 2FA is on, a challenge to complete.
  const handleAuthResult = (result: LoginResult) => {
    if (isTwoFactorChallenge(result)) {
      navigation.navigate('TwoFactorChallenge', { challengeToken: result.challengeToken, method: result.method, email: result.email, devCode: result.devCode });
      return;
    }
    void setSession(result);
  };
  const mutation = useMutation({ mutationFn: authApi.login, onSuccess: handleAuthResult, onError: (error) => showDialog({ title: 'Login failed', message: apiErrorMessage(error, 'Login failed'), tone: 'error' }) });
  const googleMutation = useMutation({
    mutationFn: async () => authApi.google(await signInWithGoogle()),
    onSuccess: handleAuthResult,
    onError: (error) => {
      if (error instanceof GoogleSignInCancelled) return;
      showDialog({ title: 'Google sign in failed', message: apiErrorMessage(error, 'Google sign in failed'), tone: 'error' });
    }
  });

  const fieldStyle = { marginBottom: compact ? spacing.xs : spacing.sm };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to pick up where you left off."
      footer={(
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>New to BillJi?</Text>
          <Button mode="text" compact onPress={() => navigation.navigate('Register')} labelStyle={styles.footerLink}>
            Create account
          </Button>
          <Text style={[styles.footerDot, { color: colors.mutedForeground }]}>·</Text>
          <Button mode="text" compact onPress={() => navigation.navigate('AcceptInvite')} labelStyle={styles.footerLink}>
            Invite code
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
        Continue with Google
      </Button>

      <View style={[styles.dividerRow, { marginVertical: compact ? spacing.xs : spacing.sm }]}>
        <View style={[styles.dividerLine, { backgroundColor: theme.colors.outlineVariant }]} />
        <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>or use email</Text>
        <View style={[styles.dividerLine, { backgroundColor: theme.colors.outlineVariant }]} />
      </View>

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

      <Button mode="text" compact onPress={() => navigation.navigate('ForgotPassword')} labelStyle={styles.forgotLabel} style={styles.forgot}>
        Forgot password?
      </Button>

      <Button
        mode="contained"
        loading={mutation.isPending}
        onPress={form.handleSubmit((values) => mutation.mutate(values))}
        contentStyle={{ height: compact ? 46 : 52 }}
        labelStyle={styles.primaryLabel}
        style={styles.primary}
      >
        Login
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
  forgot: { alignSelf: 'flex-end', marginBottom: 4, marginTop: -4 },
  forgotLabel: { ...fontStyles.semiBold, fontSize: 13 },
  primary: { borderRadius: radii.input },
  primaryLabel: { ...fontStyles.bold, fontSize: 15 },
  footer: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginTop: spacing.sm },
  footerText: { ...typeScale.caption },
  footerDot: { ...typeScale.caption, marginHorizontal: 2 },
  footerLink: { ...fontStyles.semiBold, fontSize: 14, marginHorizontal: 6 }
});
