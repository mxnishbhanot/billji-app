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
import { ResetPasswordScreenProps } from '@/navigation/types';
import { appColors, fontStyles, radii, spacing, typeScale } from '@/theme/theme';
import { resetPasswordSchema } from '@/validation/schemas';

type ResetFormValues = { code: string; password: string; confirmPassword: string };

export function ResetPasswordScreen({ navigation, route }: ResetPasswordScreenProps) {
  const { email } = route.params;
  const theme = useTheme();
  const colors = appColors(theme.dark);
  const compact = useAuthCompact();
  const { showDialog } = useAppDialog();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const form = useForm<ResetFormValues>({
    defaultValues: { code: '', password: '', confirmPassword: '' },
    resolver: zodResolver(resetPasswordSchema)
  });

  const mutation = useMutation({
    mutationFn: (values: ResetFormValues) => authApi.confirmPasswordReset(email, values.code, values.password),
    onSuccess: () => {
      showDialog({ title: 'Password updated', message: 'Your password has been reset. Please sign in with your new password.' });
      navigation.navigate('Login');
    },
    onError: (error) => showDialog({ title: 'Reset failed', message: apiErrorMessage(error, 'Please try again'), tone: 'error' })
  });

  const resend = useMutation({
    mutationFn: () => authApi.requestPasswordReset(email),
    onSuccess: () => showDialog({ title: 'Code sent', message: `A new reset code was sent to ${email}.` }),
    onError: (error) => showDialog({ title: 'Could not resend', message: apiErrorMessage(error, 'Please try again'), tone: 'error' })
  });

  const fieldStyle = { marginBottom: compact ? spacing.xs : spacing.sm };

  return (
    <AuthShell
      title="Reset password"
      subtitle={`Enter the 6-digit code sent to ${email} and choose a new password.`}
      footer={(
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>Wrong email?</Text>
          <Button mode="text" compact onPress={() => navigation.navigate('ForgotPassword')} labelStyle={styles.footerLink}>
            Start over
          </Button>
        </View>
      )}
    >
      <FormTextInput
        control={form.control}
        name="code"
        label="6-digit code"
        keyboardType="number-pad"
        maxLength={6}
        dense={compact}
        style={fieldStyle}
        left={<TextInput.Icon icon="shield-key-outline" />}
      />
      <FormTextInput
        control={form.control}
        name="password"
        label="New password"
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
      <FormTextInput
        control={form.control}
        name="confirmPassword"
        label="Confirm new password"
        secureTextEntry={!passwordVisible}
        dense={compact}
        style={fieldStyle}
        left={<TextInput.Icon icon="lock-check-outline" />}
      />

      <Button
        mode="contained"
        loading={mutation.isPending}
        onPress={form.handleSubmit((values) => mutation.mutate(values))}
        contentStyle={{ height: compact ? 46 : 52 }}
        labelStyle={styles.primaryLabel}
        style={styles.primary}
      >
        Update password
      </Button>

      <Button mode="text" compact loading={resend.isPending} onPress={() => resend.mutate()} labelStyle={styles.linkLabel} style={styles.link}>
        Didn’t get a code? Resend
      </Button>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  primary: { borderRadius: radii.input },
  primaryLabel: { ...fontStyles.bold, fontSize: 15 },
  link: { alignSelf: 'center', marginTop: 2 },
  linkLabel: { ...fontStyles.semiBold, fontSize: 13 },
  footer: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginTop: spacing.sm },
  footerText: { ...typeScale.caption },
  footerLink: { ...fontStyles.semiBold, fontSize: 14, marginHorizontal: 6 }
});
