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
import { ForgotPasswordScreenProps } from '@/navigation/types';
import { appColors, fontStyles, radii, spacing, typeScale } from '@/theme/theme';
import { forgotPasswordSchema } from '@/validation/schemas';

export function ForgotPasswordScreen({ navigation }: ForgotPasswordScreenProps) {
  const theme = useTheme();
  const colors = appColors(theme.dark);
  const compact = useAuthCompact();
  const { showDialog } = useAppDialog();
  const form = useForm<{ email: string }>({ defaultValues: { email: '' }, resolver: zodResolver(forgotPasswordSchema) });

  const mutation = useMutation({
    mutationFn: (email: string) => authApi.requestPasswordReset(email),
    onSuccess: (data, email) => {
      // Backend returns the code in dev only; pass it through so the next screen
      // can prefill it during local testing.
      navigation.navigate('ResetPassword', { email });
      if (data.resetCode) {
        showDialog({ title: 'Dev code', message: `Reset code: ${data.resetCode}` });
      }
    },
    onError: (error) => showDialog({ title: 'Could not send code', message: apiErrorMessage(error, 'Please try again'), tone: 'error' })
  });

  return (
    <AuthShell
      title="Forgot password"
      subtitle="Enter your account email and we'll send a 6-digit reset code."
      footer={(
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>Remembered it?</Text>
          <Button mode="text" compact onPress={() => navigation.navigate('Login')} labelStyle={styles.footerLink}>
            Back to login
          </Button>
        </View>
      )}
    >
      <FormTextInput
        control={form.control}
        name="email"
        label="Email"
        keyboardType="email-address"
        autoCapitalize="none"
        dense={compact}
        style={{ marginBottom: compact ? spacing.xs : spacing.sm }}
        left={<TextInput.Icon icon="email-outline" />}
      />

      <Button
        mode="contained"
        loading={mutation.isPending}
        onPress={form.handleSubmit((values) => mutation.mutate(values.email))}
        contentStyle={{ height: compact ? 46 : 52 }}
        labelStyle={styles.primaryLabel}
        style={styles.primary}
      >
        Send reset code
      </Button>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  primary: { borderRadius: radii.input },
  primaryLabel: { ...fontStyles.bold, fontSize: 15 },
  footer: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginTop: spacing.sm },
  footerText: { ...typeScale.caption },
  footerLink: { ...fontStyles.semiBold, fontSize: 14, marginHorizontal: 6 }
});
