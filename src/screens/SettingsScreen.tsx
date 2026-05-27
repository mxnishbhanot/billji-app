import { ReactNode, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { ActivityIndicator, Button, Dialog, Portal, Switch, Text, useTheme } from 'react-native-paper';
import Svg, { Circle, Defs, G, LinearGradient, Rect, Stop } from 'react-native-svg';
import { authApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { useAppDialog } from '@/components/AppDialog';
import { BrandMark } from '@/components/BrandMark';
import { FormTextInput } from '@/components/FormTextInput';
import { Screen } from '@/components/Screen';
import { useAuthStore } from '@/store/authStore';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import { settingsSchema } from '@/validation/schemas';

type SettingsPanel = 'brand' | 'tax' | 'invoice' | 'account' | null;
type SettingsRowProps = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  subtitle: string;
  tone: string;
  onPress?: () => void;
  trailing?: ReactNode;
};

function SettingsHeroPattern() {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 360 150" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <LinearGradient id="settingsHeroGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#1C1A4A" />
          <Stop offset="0.5" stopColor="#2D2A6B" />
          <Stop offset="1" stopColor="#40388C" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width={360} height={150} fill="url(#settingsHeroGrad)" />
      <G opacity="0.16">
        {Array.from({ length: 10 }).map((_, row) =>
          Array.from({ length: 22 }).map((__, col) => (
            <Circle key={`${row}-${col}`} cx={col * 18 + 9} cy={row * 18 + 9} r={1} fill="#FFFFFF" />
          ))
        )}
      </G>
      <Circle cx={340} cy={150} r={78} fill="#6366F1" opacity={0.22} />
      <Circle cx={-10} cy={-10} r={58} fill="#F472B6" opacity={0.08} />
    </Svg>
  );
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  const colors = appColors(theme.dark);

  return (
    <View style={styles.group}>
      <Text style={[styles.groupLabel, { color: theme.colors.onSurfaceVariant }]}>{title}</Text>
      <View style={[styles.groupCard, { backgroundColor: colors.card, borderColor: theme.dark ? colors.border : alpha(colors.primaryStrong, 0.08) }]}>
        {children}
      </View>
    </View>
  );
}

function SettingsRow({ icon, title, subtitle, tone, onPress, trailing }: SettingsRowProps) {
  const theme = useTheme();

  return (
    <Pressable disabled={!onPress} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={[styles.rowIcon, { backgroundColor: alpha(tone, theme.dark ? 0.22 : 0.12) }]}>
        <MaterialCommunityIcons name={icon} size={18} color={tone} />
      </View>
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={[styles.rowTitle, { color: theme.colors.onSurface }]}>{title}</Text>
        <Text numberOfLines={1} style={[styles.rowSubtitle, { color: theme.colors.onSurfaceVariant }]}>{subtitle}</Text>
      </View>
      {trailing ?? <Feather name="chevron-right" size={17} color={theme.colors.onSurfaceVariant} />}
    </Pressable>
  );
}

export function SettingsScreen() {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const logout = useAuthStore((state) => state.logout);
  const queryClient = useQueryClient();
  const navigation = useNavigation<any>();
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const { showDialog } = useAppDialog();
  const [activePanel, setActivePanel] = useState<SettingsPanel>(null);
  const [themeSaving, setThemeSaving] = useState(false);
  const form = useForm<any>({ defaultValues: { theme: 'light', ...(user?.businessProfile || {}) }, resolver: zodResolver(settingsSchema) });
  const selectedTheme = useWatch({ control: form.control, name: 'theme' }) || 'light';
  const logoPreview = useWatch({ control: form.control, name: 'logoUrl' }) || '';
  const businessName = useWatch({ control: form.control, name: 'businessName' }) || '';
  const businessEmail = useWatch({ control: form.control, name: 'email' }) || '';
  const phone = useWatch({ control: form.control, name: 'phone' }) || '';
  const gstNumber = useWatch({ control: form.control, name: 'gstNumber' }) || '';
  const invoicePrefix = useWatch({ control: form.control, name: 'invoicePrefix' }) || 'INV';

  useEffect(() => {
    form.reset({ theme: 'light', ...(user?.businessProfile || {}) });
  }, [user, form]);

  const save = useMutation({
    mutationFn: authApi.updateSettings,
    onSuccess: async (response) => {
      await setUser(response.user);
      queryClient.invalidateQueries({ queryKey: ['report'] });
      showDialog({ title: 'Settings saved', message: 'Your business profile has been updated.', tone: 'success' });
    },
    onError: (error) => showDialog({ title: 'Could not save settings', message: apiErrorMessage(error), tone: 'error' })
  });

  const saveAndClose = form.handleSubmit((values) => save.mutate(values, { onSuccess: () => setActivePanel(null) }));

  const pickLogo = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showDialog({ title: 'Permission required', message: 'Photo library access is required to choose a business logo.', tone: 'warning' });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.6, base64: true });
    if (!result.canceled) {
      const asset = result.assets[0];
      if (!asset) return;
      const dataUri = asset.base64 ? `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}` : asset.uri;
      form.setValue('logoUrl', dataUri, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
    }
  };

  const removeLogo = () => form.setValue('logoUrl', '', { shouldDirty: true, shouldTouch: true, shouldValidate: true });
  const closePanel = () => setActivePanel(null);
  const toggleTheme = (enabled: boolean) => {
    if (themeSaving || save.isPending) return;

    const nextTheme = enabled ? 'dark' : 'light';
    const previousTheme = selectedTheme === 'dark' ? 'dark' : 'light';
    form.setValue('theme', nextTheme, { shouldDirty: true });
    setThemeSaving(true);
    save.mutate(
      { ...form.getValues(), theme: nextTheme },
      {
        onError: () => form.setValue('theme', previousTheme, { shouldDirty: false }),
        onSettled: () => setThemeSaving(false)
      }
    );
  };

  const renderPanel = () => {
    if (activePanel === 'account') {
      return (
        <>
          <Dialog.Title>Account</Dialog.Title>
          <Dialog.Content>
            <View style={[styles.readOnlyBox, { backgroundColor: isDark ? colors.surface : alpha(colors.primaryStrong, 0.04), borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08) }]}>
              <Text style={[styles.readOnlyLabel, { color: theme.colors.onSurfaceVariant }]}>Login email</Text>
              <Text style={[styles.readOnlyValue, { color: theme.colors.onSurface }]}>{user?.email}</Text>
              <Text style={[styles.readOnlyHint, { color: theme.colors.onSurfaceVariant }]}>This is only used for signing in. Business email is managed separately.</Text>
            </View>
          </Dialog.Content>
          <Dialog.Actions><Button onPress={closePanel}>Close</Button></Dialog.Actions>
        </>
      );
    }

    if (activePanel === 'brand') {
      return (
        <>
          <Dialog.Title>Brand & Logo</Dialog.Title>
          <Dialog.Content>
            <View style={styles.dialogLogoRow}>
              <View style={[styles.dialogLogoFrame, { backgroundColor: isDark ? colors.surface : alpha(colors.primaryStrong, 0.04), borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.1) }]}>
                <BrandMark size={72} imageUri={logoPreview} label={businessName} />
              </View>
              <View style={styles.dialogLogoActions}>
                <Button mode="outlined" onPress={pickLogo}>Choose photo</Button>
                {logoPreview ? <Button textColor={theme.colors.error} onPress={removeLogo}>Remove</Button> : null}
              </View>
            </View>
            <FormTextInput control={form.control} name="businessName" label="Business name" />
          </Dialog.Content>
          <Dialog.Actions><Button onPress={closePanel}>Cancel</Button><Button loading={save.isPending} onPress={saveAndClose}>Save</Button></Dialog.Actions>
        </>
      );
    }

    if (activePanel === 'tax') {
      return (
        <>
          <Dialog.Title>Tax Settings</Dialog.Title>
          <Dialog.Content>
            <FormTextInput control={form.control} name="gstNumber" label="GST number" />
          </Dialog.Content>
          <Dialog.Actions><Button onPress={closePanel}>Cancel</Button><Button loading={save.isPending} onPress={saveAndClose}>Save</Button></Dialog.Actions>
        </>
      );
    }

    if (activePanel === 'invoice') {
      return (
        <>
          <Dialog.Title>Invoice Numbering</Dialog.Title>
          <Dialog.Content>
            <View style={[styles.prefixPreview, { backgroundColor: alpha(colors.primary, isDark ? 0.16 : 0.08), borderColor: alpha(colors.primary, isDark ? 0.28 : 0.16) }]}>
              <MaterialCommunityIcons name="file-document-outline" size={18} color={theme.colors.primary} />
              <Text style={[styles.prefixPreviewText, { color: theme.colors.primary }]}>{invoicePrefix || 'INV'}-0001</Text>
            </View>
            <FormTextInput control={form.control} name="invoicePrefix" label="Invoice prefix" />
          </Dialog.Content>
          <Dialog.Actions><Button onPress={closePanel}>Cancel</Button><Button loading={save.isPending} onPress={saveAndClose}>Save</Button></Dialog.Actions>
        </>
      );
    }

    return null;
  };

  return (
    <Screen title="Settings" contentStyle={styles.screenContent}>
      <View style={[styles.profileCard, { borderColor: alpha('#C3C0FF', 0.3) }]}>
        <SettingsHeroPattern />
        <View style={[styles.profileLogo, { backgroundColor: alpha('#FFFFFF', 0.16), borderColor: alpha('#FFFFFF', 0.24) }]}>
          <BrandMark size={56} imageUri={logoPreview} label={businessName} />
        </View>
        <View style={styles.profileContent}>
          <Text numberOfLines={1} style={styles.profileName}>{businessName || 'Billji Business'}</Text>
          <Text numberOfLines={1} style={styles.profileEmail}>{businessEmail || user?.email}</Text>
          <View style={styles.planPill}>
            <Feather name="shield" size={10} color={colors.primaryStrong} />
            <Text style={styles.planText}>Pro Plan</Text>
          </View>
        </View>
        <Pressable onPress={() => setActivePanel('brand')} style={({ pressed }) => [styles.profileEdit, { backgroundColor: alpha('#1C1A4A', pressed ? 0.55 : 0.36), borderColor: alpha('#C3C0FF', 0.36) }]} hitSlop={8}>
          <Feather name="edit-2" size={18} color="#FFFFFF" />
        </Pressable>
      </View>

      <SettingsGroup title="BUSINESS">
        <SettingsRow icon="briefcase-outline" title="Business Profile" subtitle={`${businessName || 'Name'}, ${phone ? 'phone' : 'phone missing'}, ${businessEmail ? 'email' : 'email missing'}`} tone={colors.primary} onPress={() => navigation.navigate('BusinessProfile')} />
        <View style={[styles.rowDivider, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08) }]} />
        <SettingsRow icon="tag-outline" title="Tax Settings" subtitle={gstNumber ? `GST ${gstNumber}` : 'GST number not set'} tone={colors.warning} onPress={() => setActivePanel('tax')} />
      </SettingsGroup>

      <SettingsGroup title="INVOICING">
        <SettingsRow icon="counter" title="Invoice Numbering" subtitle={`${invoicePrefix || 'INV'}-0001 format`} tone={colors.primary} onPress={() => setActivePanel('invoice')} />
        <View style={[styles.rowDivider, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08) }]} />
        <SettingsRow
          icon="theme-light-dark"
          title="Appearance"
          subtitle={`${selectedTheme === 'dark' ? 'Dark' : 'Light'} theme`}
          tone={colors.accent}
          trailing={
            <View style={styles.appearanceTrailing}>
              {themeSaving ? <ActivityIndicator size={18} color={theme.colors.primary} /> : null}
              <Switch
                value={selectedTheme === 'dark'}
                onValueChange={toggleTheme}
                color={theme.colors.primary}
                disabled={themeSaving || save.isPending}
              />
            </View>
          }
        />
      </SettingsGroup>

      <SettingsGroup title="ACCOUNT">
        <SettingsRow icon="account-circle-outline" title="Login Account" subtitle={user?.email || 'Signed in'} tone={colors.primary} onPress={() => setActivePanel('account')} />
        <View style={[styles.rowDivider, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08) }]} />
        <SettingsRow
          icon="logout"
          title="Logout"
          subtitle="Sign out of this device"
          tone={colors.destructive}
          onPress={() => logout()}
          trailing={<Feather name="log-out" size={17} color={theme.colors.error} />}
        />
      </SettingsGroup>

      <Text style={[styles.versionText, { color: theme.colors.onSurfaceVariant }]}>Billji mobile v1.0.0</Text>

      <Portal>
        <Dialog visible={Boolean(activePanel)} onDismiss={closePanel}>
          {renderPanel()}
        </Dialog>
      </Portal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  appearanceTrailing: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  dialogLogoActions: { flex: 1, gap: 8, justifyContent: 'center' },
  dialogLogoFrame: { alignItems: 'center', borderRadius: 18, borderWidth: 1, height: 88, justifyContent: 'center', overflow: 'hidden', width: 88 },
  dialogLogoRow: { flexDirection: 'row', gap: 14, marginBottom: 12 },
  dialogScrollContent: { paddingHorizontal: 24, paddingVertical: 8 },
  group: { marginBottom: 16 },
  groupCard: { borderRadius: radii.lg, borderWidth: 1, overflow: 'hidden' },
  groupLabel: { ...fontStyles.bold, fontSize: 11, letterSpacing: 1.1, marginBottom: 8, marginLeft: 2 },
  planPill: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#FFFFFF', borderRadius: radii.pill, flexDirection: 'row', gap: 4, marginTop: 6, paddingHorizontal: 8, paddingVertical: 3 },
  planText: { ...fontStyles.bold, color: '#4338CA', fontSize: 10 },
  prefixPreview: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: radii.pill, borderWidth: 1, flexDirection: 'row', gap: 7, marginBottom: 12, paddingHorizontal: 12, paddingVertical: 7 },
  prefixPreviewText: { ...fontStyles.bold, fontSize: 12 },
  profileCard: { alignItems: 'center', borderRadius: 26, borderWidth: 1, flexDirection: 'row', gap: 14, marginBottom: 20, minHeight: 120, overflow: 'hidden', padding: 18 },
  profileContent: { flex: 1, minWidth: 0 },
  profileEdit: { alignItems: 'center', borderRadius: radii.pill, borderWidth: 1, height: 38, justifyContent: 'center', width: 38 },
  profileEmail: { ...typeScale.caption, color: 'rgba(255,255,255,0.82)', fontSize: 12, marginTop: 1 },
  profileLogo: { alignItems: 'center', borderRadius: radii.pill, borderWidth: 1, height: 64, justifyContent: 'center', overflow: 'hidden', width: 64 },
  profileName: { ...fontStyles.bold, color: '#FFFFFF', fontSize: 20, letterSpacing: -0.5, lineHeight: 26 },
  readOnlyBox: { borderRadius: radii.lg, borderWidth: 1, padding: 12 },
  readOnlyHint: { ...typeScale.caption, fontSize: 12, lineHeight: 18, marginTop: 8 },
  readOnlyLabel: { ...fontStyles.semiBold, fontSize: 10, letterSpacing: 0.7, textTransform: 'uppercase' },
  readOnlyValue: { ...fontStyles.bold, fontSize: 14, marginTop: 2 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 72, paddingHorizontal: 14, paddingVertical: 10 },
  rowDivider: { height: 1, marginLeft: 64 },
  rowIcon: { alignItems: 'center', borderRadius: radii.md, height: 34, justifyContent: 'center', width: 34 },
  rowPressed: { opacity: 0.88 },
  rowSubtitle: { ...typeScale.caption, fontSize: 12, marginTop: 2 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { ...fontStyles.bold, fontSize: 14 },
  screenContent: { paddingTop: 8 },
  versionText: { ...typeScale.caption, marginBottom: 16, marginTop: 2, textAlign: 'center' }
});
