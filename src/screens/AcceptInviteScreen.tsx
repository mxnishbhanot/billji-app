import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { isAxiosError } from 'axios';
import { Button, Text, TextInput, useTheme } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { teamApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { AppCard } from '@/components/AppCard';
import { useAppDialog } from '@/components/AppDialog';
import { FormTextInput } from '@/components/FormTextInput';
import { AppNavigation } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { alpha, appColors, fontStyles, radii, spacing, typeScale } from '@/theme/theme';
import { acceptInviteSchema } from '@/validation/schemas';

type FormValues = { code: string; name?: string; password?: string };

// Reads the ApiError code that the backend may attach at body.details.code or body.code.
const errorCode = (error: unknown): string | undefined => {
  if (!isAxiosError(error)) return undefined;
  const data = error.response?.data as { code?: string; details?: { code?: string } } | undefined;
  return data?.details?.code || data?.code;
};

export function AcceptInviteScreen() {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const navigation = useNavigation<AppNavigation>();
  const { showDialog } = useAppDialog();
  const setSession = useAuthStore((state) => state.setSession);
  const signedIn = useAuthStore((state) => Boolean(state.token));
  const [passwordVisible, setPasswordVisible] = useState(false);

  const form = useForm<FormValues>({ defaultValues: { code: '', name: '', password: '' }, resolver: zodResolver(acceptInviteSchema) });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => teamApi.acceptInvite({ token: values.code.trim(), name: values.name?.trim() || undefined, password: values.password || undefined }),
    onSuccess: (result) => {
      // New users come back with a session (token) → sign straight in.
      if (result.token) {
        void setSession(result);
        return;
      }
      // Existing users are added to the business but must sign in / switch to it.
      showDialog({
        title: 'Invitation accepted',
        message: result.message || 'You have joined the business. Sign in to access it, or use Switch business.',
        tone: 'success'
      });
      if (signedIn) navigation.goBack();
      else navigation.navigate('Login');
    },
    onError: (error) => {
      if (errorCode(error) === 'ACCOUNT_SETUP_REQUIRED') {
        showDialog({ title: 'Set up your account', message: 'This email has no BillJi account yet. Enter your name and a password (8+ characters) to create one.', tone: 'error' });
        return;
      }
      showDialog({ title: 'Could not accept invite', message: apiErrorMessage(error, 'Could not accept invite'), tone: 'error' });
    }
  });

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.shell}>
          <AppCard style={[styles.card, { borderColor: isDark ? alpha(colors.primary, 0.18) : alpha(colors.primaryStrong, 0.08) }]}>
            <Text variant="headlineSmall" style={[styles.title, { color: theme.colors.onSurface }]}>Join a business</Text>
            <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>Paste the invite code from your email. New to BillJi? Add your name and a password to create your account.</Text>

            <FormTextInput control={form.control} name="code" label="Invite code" autoCapitalize="none" autoCorrect={false} left={<TextInput.Icon icon="ticket-confirmation-outline" />} />
            <FormTextInput control={form.control} name="name" label="Your name (new users)" left={<TextInput.Icon icon="account-outline" />} />
            <FormTextInput
              control={form.control}
              name="password"
              label="Password (new users)"
              secureTextEntry={!passwordVisible}
              left={<TextInput.Icon icon="lock-outline" />}
              right={<TextInput.Icon icon={passwordVisible ? 'eye-off-outline' : 'eye-outline'} forceTextInputFocus={false} onPress={() => setPasswordVisible((v) => !v)} />}
            />

            <Button
              mode="contained"
              icon="account-check"
              loading={mutation.isPending}
              onPress={form.handleSubmit((values) => mutation.mutate(values))}
              contentStyle={styles.primaryButtonContent}
              labelStyle={styles.primaryButtonLabel}
              style={styles.primaryButton}
            >
              Accept invitation
            </Button>

            <Button mode="text" compact onPress={() => navigation.goBack()} style={styles.backButton}>
              Cancel
            </Button>
          </AppCard>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 36, paddingHorizontal: spacing.screenPadding },
  shell: { flex: 1, justifyContent: 'center', paddingVertical: spacing.md },
  card: { borderRadius: radii.xl, marginBottom: 0 },
  title: { ...fontStyles.bold, letterSpacing: -0.7, marginBottom: 4 },
  subtitle: { ...typeScale.bodyPrimary, marginBottom: spacing.md },
  primaryButton: { borderRadius: radii.input, marginTop: spacing.sm },
  primaryButtonContent: { height: 52 },
  primaryButtonLabel: { ...fontStyles.bold, fontSize: 15 },
  backButton: { alignSelf: 'center', marginTop: spacing.xs }
});
