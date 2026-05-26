import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { Button, SegmentedButtons, Text, useTheme } from 'react-native-paper';
import { authApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { AppCard } from '@/components/AppCard';
import { useAppDialog } from '@/components/AppDialog';
import { BrandMark } from '@/components/BrandMark';
import { FormTextInput } from '@/components/FormTextInput';
import { PhoneInput } from '@/components/PhoneInput';
import { Screen } from '@/components/Screen';
import { useAuthStore } from '@/store/authStore';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import { settingsSchema } from '@/validation/schemas';

export function SettingsScreen() {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const logout = useAuthStore((state) => state.logout);
  const queryClient = useQueryClient();
  const paperTheme = useTheme();
  const colors = appColors(paperTheme.dark);
  const { showDialog } = useAppDialog();
  const form = useForm<any>({ defaultValues: { theme: 'light', ...(user?.businessProfile || {}) }, resolver: zodResolver(settingsSchema) });
  const selectedTheme = useWatch({ control: form.control, name: 'theme' }) || 'light';
  const logoPreview = useWatch({ control: form.control, name: 'logoUrl' }) || '';
  const businessName = useWatch({ control: form.control, name: 'businessName' }) || '';
  useEffect(() => { form.reset({ theme: 'light', ...(user?.businessProfile || {}) }); }, [user, form]);
  const save = useMutation({ mutationFn: authApi.updateSettings, onSuccess: async (response) => { await setUser(response.user); queryClient.invalidateQueries({ queryKey: ['report'] }); showDialog({ title: 'Settings saved', message: 'Your business profile has been updated.', tone: 'success' }); }, onError: (error) => showDialog({ title: 'Could not save settings', message: apiErrorMessage(error), tone: 'error' }) });
  const pickLogo = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return showDialog({ title: 'Permission required', message: 'Photo library access is required to choose a business logo.', tone: 'warning' });
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.6, base64: true });
    if (!result.canceled) {
      const asset = result.assets[0];
      if (!asset) return;
      const dataUri = asset.base64 ? `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}` : asset.uri;
      form.setValue('logoUrl', dataUri, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
    }
  };
  const removeLogo = () => form.setValue('logoUrl', '', { shouldDirty: true, shouldTouch: true, shouldValidate: true });
  return (
    <Screen title="Settings">
      <AppCard style={[styles.profileCard, { backgroundColor: paperTheme.dark ? colors.primaryStrong : colors.primary, borderColor: paperTheme.dark ? alpha(colors.primary, 0.42) : colors.primary }]}>
        <View pointerEvents="none" style={[styles.profileGlow, { backgroundColor: alpha('#FFFFFF', paperTheme.dark ? 0.09 : 0.14) }]} />
        <View style={styles.profileHeader}>
          <View style={[styles.logoFrame, styles.profileLogo, { backgroundColor: alpha('#FFFFFF', 0.15), borderColor: alpha('#FFFFFF', 0.24) }]}>
            <BrandMark size={68} imageUri={logoPreview} label={businessName} />
          </View>
          <View style={styles.logoContent}>
            <Text variant="headlineSmall" style={styles.profileName}>{businessName || 'Billji Business'}</Text>
            <Text style={styles.profileEmail}>{user?.email}</Text>
            <View style={styles.planBadge}><Text variant="labelSmall" style={styles.planText}>Pro plan</Text></View>
          </View>
        </View>
      </AppCard>
      <AppCard>
        <Text variant="titleMedium" style={styles.sectionTitle}>Business profile</Text>
        <View style={styles.logoRow}>
          <View style={[styles.logoFrame, { backgroundColor: paperTheme.dark ? colors.surface : paperTheme.colors.surfaceVariant, borderColor: paperTheme.colors.outlineVariant }]}>
            <BrandMark size={72} imageUri={logoPreview} label={businessName} />
          </View>
          <View style={styles.logoContent}>
            <Text variant="labelLarge" style={styles.logoTitle}>Business logo</Text>
            <Text style={[styles.logoHelp, { color: paperTheme.colors.onSurfaceVariant }]}>Choose an image from your gallery. Preview updates here, then tap Save settings.</Text>
            <View style={styles.logoButtons}>
              <Button mode="outlined" onPress={pickLogo} style={styles.logoButton}>Choose photo</Button>
              {logoPreview ? <Button mode="text" textColor={paperTheme.colors.error} onPress={removeLogo}>Remove</Button> : null}
            </View>
          </View>
        </View>
        <FormTextInput control={form.control} name="businessName" label="Business name" />
        <PhoneInput control={form.control} name="phone" />
        <FormTextInput control={form.control} name="gstNumber" label="GST number" />
        <FormTextInput control={form.control} name="email" label="Email" keyboardType="email-address" />
        <FormTextInput control={form.control} name="address" label="Address" multiline />
        <FormTextInput control={form.control} name="invoicePrefix" label="Invoice prefix" />
        <SegmentedButtons value={selectedTheme} onValueChange={(value) => form.setValue('theme', value as 'light' | 'dark', { shouldDirty: true })} buttons={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
        <Button mode="contained" loading={save.isPending} onPress={form.handleSubmit((values) => save.mutate(values))} style={styles.saveButton}>Save settings</Button>
      </AppCard>
      <AppCard><Text variant="titleMedium" style={styles.sectionTitle}>Account</Text><Text style={{ color: paperTheme.colors.onSurfaceVariant, marginBottom: 12 }}>{user?.email}</Text><Button mode="outlined" textColor={paperTheme.colors.error} onPress={() => logout()} style={styles.logoutButton}>Logout</Button><Text variant="labelSmall" style={[styles.versionText, { color: paperTheme.colors.onSurfaceVariant }]}>Billji mobile v1.0.0</Text></AppCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { ...typeScale.sectionTitle, marginBottom: 12 },
  logoRow: { flexDirection: 'row', gap: 14, marginBottom: 16 },
  logoFrame: {
    alignItems: 'center',
    borderRadius: radii.card,
    borderWidth: 1,
    height: 88,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 88
  },
  logoContent: { flex: 1 },
  logoTitle: fontStyles.medium,
  logoHelp: { lineHeight: 20, marginTop: 4 },
  logoButtons: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  logoButton: { borderRadius: radii.input },
  logoutButton: { borderRadius: radii.input },
  planBadge: { alignSelf: 'flex-start', backgroundColor: '#FFFFFF', borderRadius: radii.badge, marginTop: 10, paddingHorizontal: 10, paddingVertical: 4 },
  planText: { ...typeScale.badgeLabel, color: '#4F46E5' },
  profileCard: { overflow: 'hidden' },
  profileEmail: { color: 'rgba(255,255,255,0.76)', marginTop: 3 },
  profileGlow: { borderRadius: 999, height: 150, position: 'absolute', right: -56, top: -70, width: 150 },
  profileHeader: { alignItems: 'center', flexDirection: 'row', gap: 14 },
  profileLogo: { height: 78, width: 78 },
  profileName: { ...typeScale.heroHeadline, color: '#FFFFFF', letterSpacing: -0.5 },
  saveButton: { borderRadius: radii.input, marginTop: 16 },
  versionText: { marginTop: 14, textAlign: 'center' }
});
