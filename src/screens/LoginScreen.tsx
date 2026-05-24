import { View } from 'react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Button, Text, useTheme } from 'react-native-paper';
import { authApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { AppCard } from '@/components/AppCard';
import { useAppDialog } from '@/components/AppDialog';
import { BrandMark } from '@/components/BrandMark';
import { FormTextInput } from '@/components/FormTextInput';
import { Screen } from '@/components/Screen';
import { useAuthStore } from '@/store/authStore';
import { loginSchema } from '@/validation/schemas';

export function LoginScreen({ navigation }: any) {
  const theme = useTheme();
  const { showDialog } = useAppDialog();
  const setSession = useAuthStore((state) => state.setSession);
  const form = useForm<any>({ defaultValues: { email: '', password: '' }, resolver: zodResolver(loginSchema) });
  const mutation = useMutation({ mutationFn: authApi.login, onSuccess: setSession, onError: (error) => showDialog({ title: 'Login failed', message: apiErrorMessage(error, 'Login failed'), tone: 'error' }) });
  return (
    <Screen title="Billji" showNotifications={false}>
      <View style={{ gap: 16, marginTop: 24 }}>
        <View style={{ alignItems: 'center', paddingVertical: 26 }}>
          <BrandMark size={76} />
          <Text variant="displaySmall" style={{ color: theme.colors.onBackground, fontWeight: '900', letterSpacing: -1.5, marginTop: 18 }}>Billji</Text>
          <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, maxWidth: 280, textAlign: 'center' }}>Fast invoices, stock alerts, and sales clarity in one clean mobile desk.</Text>
        </View>
        <AppCard>
          <Text variant="headlineSmall" style={{ fontWeight: '900', marginBottom: 4 }}>Welcome back</Text>
          <Text style={{ color: theme.colors.onSurfaceVariant, marginBottom: 20 }}>Sign in to run today billing.</Text>
          <FormTextInput control={form.control} name="email" label="Email" keyboardType="email-address" autoCapitalize="none" />
          <FormTextInput control={form.control} name="password" label="Password" secureTextEntry />
          <Button mode="contained" loading={mutation.isPending} onPress={form.handleSubmit((values) => mutation.mutate(values))} style={{ borderRadius: 16 }}>Login</Button>
        </AppCard>
        <Button onPress={() => navigation.navigate('Register')}>Create account</Button>
      </View>
    </Screen>
  );
}
