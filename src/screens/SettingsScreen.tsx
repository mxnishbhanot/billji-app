import { useEffect } from 'react';
import { Alert, Image, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { Button, SegmentedButtons, Text, useTheme } from 'react-native-paper';
import { authApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { AppCard } from '@/components/AppCard';
import { BrandMark } from '@/components/BrandMark';
import { FormTextInput } from '@/components/FormTextInput';
import { Screen } from '@/components/Screen';
import { useAuthStore } from '@/store/authStore';
import { settingsSchema } from '@/validation/schemas';

export function SettingsScreen() {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const logout = useAuthStore((state) => state.logout);
  const queryClient = useQueryClient();
  const paperTheme = useTheme();
  const form = useForm<any>({ defaultValues: { theme: 'light', ...(user?.businessProfile || {}) }, resolver: zodResolver(settingsSchema) });
  const selectedTheme = useWatch({ control: form.control, name: 'theme' }) || 'light';
  const logoPreview = useWatch({ control: form.control, name: 'logoUrl' }) || '';
  useEffect(() => { form.reset({ theme: 'light', ...(user?.businessProfile || {}) }); }, [user, form]);
  const save = useMutation({ mutationFn: authApi.updateSettings, onSuccess: async (response) => { await setUser(response.user); queryClient.invalidateQueries({ queryKey: ['report'] }); Alert.alert('Settings saved'); }, onError: (error) => Alert.alert('Could not save settings', apiErrorMessage(error)) });
  const pickLogo = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert('Permission required', 'Photo library access is required to choose a business logo.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.45, base64: true });
    if (!result.canceled) {
      const asset = result.assets[0];
      const dataUri = asset.base64 ? `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}` : asset.uri;
      form.setValue('logoUrl', dataUri, { shouldDirty: true });
    }
  };
  return (
    <Screen title="Settings">
      <AppCard><Text variant="titleMedium" style={{ fontWeight: '900', marginBottom: 12 }}>Business profile</Text>{logoPreview ? <Image source={{ uri: logoPreview }} style={{ width: 72, height: 72, borderRadius: 24, marginBottom: 12 }} /> : <View style={{ marginBottom: 12 }}><BrandMark size={72} /></View>}<Button mode="outlined" onPress={pickLogo} style={{ borderRadius: 16, marginBottom: 12 }}>Upload logo</Button><FormTextInput control={form.control} name="businessName" label="Business name" /><FormTextInput control={form.control} name="phone" label="Phone" keyboardType="phone-pad" /><FormTextInput control={form.control} name="gstNumber" label="GST number" /><FormTextInput control={form.control} name="email" label="Email" keyboardType="email-address" /><FormTextInput control={form.control} name="address" label="Address" multiline /><FormTextInput control={form.control} name="invoicePrefix" label="Invoice prefix" /><SegmentedButtons value={selectedTheme} onValueChange={(value) => form.setValue('theme', value as 'light' | 'dark', { shouldDirty: true })} buttons={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} /><Button mode="contained" loading={save.isPending} onPress={form.handleSubmit((values) => save.mutate(values))} style={{ borderRadius: 16, marginTop: 16 }}>Save settings</Button></AppCard>
      <AppCard><Text variant="titleMedium" style={{ fontWeight: '900' }}>Account</Text><Text style={{ color: paperTheme.colors.onSurfaceVariant, marginBottom: 12 }}>{user?.email}</Text><Button mode="outlined" onPress={() => logout()}>Logout</Button></AppCard>
    </Screen>
  );
}
