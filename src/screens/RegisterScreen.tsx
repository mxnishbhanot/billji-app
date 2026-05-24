import { Alert, View } from 'react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Button, Text, useTheme } from 'react-native-paper';
import { authApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { AppCard } from '@/components/AppCard';
import { BrandMark } from '@/components/BrandMark';
import { FormTextInput } from '@/components/FormTextInput';
import { Screen } from '@/components/Screen';
import { useAuthStore } from '@/store/authStore';
import { registerSchema } from '@/validation/schemas';

export function RegisterScreen({ navigation }: any) {
  const theme = useTheme();
  const setSession = useAuthStore((state) => state.setSession);
  const form = useForm<any>({ defaultValues: { name: '', email: '', password: '' }, resolver: zodResolver(registerSchema) });
  const mutation = useMutation({ mutationFn: authApi.register, onSuccess: setSession, onError: (error) => Alert.alert('Registration failed', apiErrorMessage(error, 'Registration failed')) });
  return (
    <Screen title="Billji" showNotifications={false}>
      <View style={{ gap: 16, marginTop: 24 }}>
        <View style={{ alignItems: 'center', paddingVertical: 22 }}>
          <BrandMark size={70} />
          <Text variant="headlineLarge" style={{ color: theme.colors.onBackground, fontWeight: '900', letterSpacing: -1, marginTop: 18 }}>Start with Billji</Text>
          <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}>Set up billing, customers, products, and reports in minutes.</Text>
        </View>
        <AppCard>
          <Text variant="titleLarge" style={{ fontWeight: '900', marginBottom: 16 }}>Create account</Text>
          <FormTextInput control={form.control} name="name" label="Name" />
          <FormTextInput control={form.control} name="email" label="Email" keyboardType="email-address" autoCapitalize="none" />
          <FormTextInput control={form.control} name="password" label="Password" secureTextEntry />
          <Button mode="contained" loading={mutation.isPending} onPress={form.handleSubmit((values) => mutation.mutate(values))} style={{ borderRadius: 16 }}>Register</Button>
        </AppCard>
        <Button onPress={() => navigation.navigate('Login')}>Already have an account? Login</Button>
      </View>
    </Screen>
  );
}
