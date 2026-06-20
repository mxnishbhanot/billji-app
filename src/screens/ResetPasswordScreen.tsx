import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Button, Text, TextInput, useTheme } from 'react-native-paper';
import { authApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { AppCard } from '@/components/AppCard';
import { useAppDialog } from '@/components/AppDialog';
import { FormTextInput } from '@/components/FormTextInput';
import { ResetPasswordScreenProps } from '@/navigation/types';
import { alpha, appColors, fontStyles, radii, spacing, typeScale } from '@/theme/theme';
import { resetPasswordSchema } from '@/validation/schemas';

const billjiLogo = require('../../assets/main-logo-clean.png');

type ResetFormValues = { code: string; password: string; confirmPassword: string };

export function ResetPasswordScreen({ navigation, route }: ResetPasswordScreenProps) {
  const { email } = route.params;
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
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

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
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
                <Text style={styles.tagline}>Hisaab Apka, Growth Apki</Text>
              </View>
            </View>
          </View>

          <AppCard style={[styles.formCard, { borderColor: isDark ? alpha(colors.primary, 0.18) : alpha(colors.primaryStrong, 0.08) }]}>
            <View style={styles.formHeader}>
              <Text variant="headlineSmall" style={[styles.formTitle, { color: theme.colors.onSurface }]}>Reset password</Text>
              <Text style={[styles.formSubtitle, { color: theme.colors.onSurfaceVariant }]}>
                Enter the 6-digit code sent to {email} and choose a new password.
              </Text>
            </View>

            <FormTextInput
              control={form.control}
              name="code"
              label="6-digit code"
              keyboardType="number-pad"
              maxLength={6}
              left={<TextInput.Icon icon="shield-key-outline" />}
            />
            <FormTextInput
              control={form.control}
              name="password"
              label="New password"
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
            <FormTextInput
              control={form.control}
              name="confirmPassword"
              label="Confirm new password"
              secureTextEntry={!passwordVisible}
              left={<TextInput.Icon icon="lock-check-outline" />}
            />

            <Button
              mode="contained"
              icon="lock-reset"
              loading={mutation.isPending}
              onPress={form.handleSubmit((values) => mutation.mutate(values))}
              contentStyle={styles.primaryButtonContent}
              labelStyle={styles.primaryButtonLabel}
              style={styles.primaryButton}
            >
              Update password
            </Button>

            <Button
              mode="text"
              compact
              loading={resend.isPending}
              onPress={() => resend.mutate()}
              labelStyle={styles.resendLabel}
              style={styles.resendButton}
            >
              Didn't get a code? Resend
            </Button>

            <View style={[styles.switchRow, { borderColor: theme.colors.outlineVariant }]}>
              <Text style={[styles.switchText, { color: theme.colors.onSurfaceVariant }]}>Wrong email?</Text>
              <Button mode="text" compact onPress={() => navigation.navigate('ForgotPassword')} labelStyle={styles.switchButtonLabel}>
                Start over
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
    minHeight: 150,
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
    height: 96,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 96
  },
  logo: { height: 96, width: 96 },
  brandCopy: { flex: 1, minWidth: 0 },
  wordmarkRow: { flexDirection: 'row', marginBottom: 3 },
  wordmarkBill: { ...fontStyles.bold, color: '#FFFFFF', fontSize: 34, letterSpacing: -1.4, lineHeight: 40 },
  wordmarkJi: { ...fontStyles.bold, color: '#FF8A1F', fontSize: 34, letterSpacing: -1.4, lineHeight: 40 },
  tagline: { ...fontStyles.semiBold, color: alpha('#FFFFFF', 0.86), fontSize: 14, lineHeight: 20 },
  formCard: { borderRadius: radii.xl, marginBottom: 0 },
  formHeader: { marginBottom: spacing.md },
  formTitle: { ...fontStyles.bold, letterSpacing: -0.7, marginBottom: 4 },
  formSubtitle: { ...typeScale.bodyPrimary },
  primaryButton: { borderRadius: radii.input, marginTop: 2 },
  primaryButtonContent: { height: 52 },
  primaryButtonLabel: { ...fontStyles.bold, fontSize: 15 },
  resendButton: { alignSelf: 'center', marginTop: spacing.xs },
  resendLabel: { ...fontStyles.semiBold, fontSize: 13 },
  switchRow: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.sm,
    paddingTop: spacing.md
  },
  switchText: { ...typeScale.caption },
  switchButtonLabel: { ...fontStyles.semiBold, fontSize: 14 }
});
