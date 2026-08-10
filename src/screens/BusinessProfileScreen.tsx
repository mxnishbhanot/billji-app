import { ReactNode, useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BadgeCheck, Camera, LucideIcon, MapPin, Percent, ShieldCheck, Store, Trash2, TriangleAlert } from 'lucide-react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { Button, Text, useTheme } from 'react-native-paper';
import { authApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { useAppDialog } from '@/components/AppDialog';
import { useAppToast } from '@/components/AppToast';
import { BrandMark } from '@/components/BrandMark';
import { FormTextInput } from '@/components/FormTextInput';
import { IndiaAddressFields } from '@/components/IndiaAddressFields';
import { PhoneInput } from '@/components/PhoneInput';
import { Screen } from '@/components/Screen';
import { shadows } from '@/design-system';
import { useLogoPicker } from '@/shared/hooks/useLogoPicker';
import { queryKeys } from '@/shared/query/queryKeys';
import { useAuthStore } from '@/store/authStore';
import { alpha, appColors, fontStyles, radii, spacing } from '@/theme/theme';
import { BusinessProfile, BusinessProfileFormValues } from '@/types';
import { GSTIN_LENGTH, PAN_LENGTH, isValidGstin } from '@/utils/gstin';
import { stateFromGstin } from '@/utils/indiaAddress';
import { settingsSchema } from '@/validation/schemas';

const profileDefaults = (profile?: BusinessProfile): BusinessProfileFormValues => ({
  businessName: profile?.businessName || '',
  logoUrl: profile?.logoUrl || '',
  gstNumber: profile?.gstNumber || '',
  phone: profile?.phone || '',
  countryCode: profile?.countryCode || '+91',
  email: profile?.email || '',
  address: profile?.address || '',
  invoicePrefix: profile?.invoicePrefix || 'INV',
  theme: profile?.theme || 'light',
  website: profile?.website || '',
  panNumber: profile?.panNumber || '',
  city: profile?.city || '',
  pinCode: profile?.pinCode || '',
  state: profile?.state || ''
});

const cardBorder = (isDark: boolean, colors: ReturnType<typeof appColors>) =>
  isDark ? colors.border : alpha(colors.primaryStrong, 0.06);

/** Same eyebrow + single card rhythm as the Settings groups. */
function ProfileSection({ icon: Icon, title, hint, children }: { icon: LucideIcon; title: string; hint: string; children: ReactNode }) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);

  return (
    <View style={styles.section}>
      <View style={styles.sectionLabelRow}>
        <Icon size={13} color={colors.primaryStrong} strokeWidth={2.4} />
        <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>{title}</Text>
      </View>
      <Text style={[styles.sectionHint, { color: theme.colors.onSurfaceVariant }]}>{hint}</Text>
      <View style={[styles.sectionCard, shadows.card, { backgroundColor: colors.card, borderColor: cardBorder(isDark, colors) }]}>
        {children}
      </View>
    </View>
  );
}

export function BusinessProfileScreen() {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const queryClient = useQueryClient();
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const { showDialog } = useAppDialog();
  const { showToast } = useAppToast();
  const form = useForm<BusinessProfileFormValues>({
    defaultValues: profileDefaults(user?.businessProfile),
    resolver: zodResolver(settingsSchema)
  });
  const gstNumber = useWatch({ control: form.control, name: 'gstNumber' }) || '';
  const gstinValid = isValidGstin(gstNumber);
  const gstStateApplied = useRef('');
  const businessName = useWatch({ control: form.control, name: 'businessName' }) || '';
  const logoUrl = useWatch({ control: form.control, name: 'logoUrl' }) || '';
  const city = useWatch({ control: form.control, name: 'city' }) || '';
  const state = useWatch({ control: form.control, name: 'state' }) || '';

  useEffect(() => {
    form.reset(profileDefaults(user?.businessProfile));
    gstStateApplied.current = '';
  }, [user, form]);

  // When GSTIN becomes valid, fill empty state from the GST state code (once per GSTIN).
  useEffect(() => {
    if (!gstinValid) return;
    const inferred = stateFromGstin(gstNumber);
    if (!inferred || gstStateApplied.current === gstNumber) return;
    const current = form.getValues('state')?.trim();
    if (!current) {
      form.setValue('state', inferred, { shouldDirty: true });
    }
    gstStateApplied.current = gstNumber;
  }, [gstinValid, gstNumber, form]);

  const save = useMutation({
    mutationFn: authApi.updateSettings,
    onSuccess: async (response) => {
      await setUser(response.user);
      queryClient.invalidateQueries({ queryKey: queryKeys.report.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.onboarding.progress });
      showToast('Business profile saved', 'success');
    },
    onError: (error) => showDialog({ title: 'Could not save profile', message: apiErrorMessage(error), tone: 'error' })
  });

  const saveProfile = form.handleSubmit((values) => save.mutate(values));
  // Logo lands in the form like any other field — it saves with the Save button, no separate sheet.
  const setLogo = useCallback(
    (dataUri: string) => form.setValue('logoUrl', dataUri, { shouldDirty: true, shouldTouch: true, shouldValidate: true }),
    [form]
  );
  const pickLogo = useLogoPicker(setLogo);
  const inputBackground = isDark ? colors.surface : colors.card;

  const headerAction = (
    <Button
      mode="contained"
      compact
      loading={save.isPending}
      // Nothing edited yet → nothing to save; keeps the header honest instead of firing a no-op PUT.
      disabled={save.isPending || !form.formState.isDirty}
      onPress={saveProfile}
      style={styles.saveButton}
      contentStyle={styles.saveButtonContent}
      labelStyle={styles.saveButtonLabel}
    >
      Save
    </Button>
  );

  const locationLine = [city, state].filter(Boolean).join(', ');

  return (
    <Screen title="Business Profile" headerAction={headerAction} contentStyle={styles.screenContent}>
      {/* Live preview of what customers see on the invoice — same card surface as the Settings identity card. */}
      <View style={[styles.identityCard, shadows.card, { backgroundColor: colors.card, borderColor: cardBorder(isDark, colors) }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={logoUrl ? 'Change business logo' : 'Add business logo'}
          onPress={() => void pickLogo()}
          style={({ pressed }) => [
            styles.identityLogo,
            { backgroundColor: alpha(colors.primary, isDark ? 0.2 : 0.1), borderColor: cardBorder(isDark, colors), opacity: pressed ? 0.85 : 1 }
          ]}
        >
          <View style={styles.identityLogoClip}>
            <BrandMark size={48} imageUri={logoUrl} label={businessName} />
          </View>
          <View style={[styles.identityLogoBadge, { backgroundColor: colors.primary, borderColor: colors.card }]}>
            <Camera size={10} color="#FFFFFF" strokeWidth={2.6} />
          </View>
        </Pressable>
        <View style={styles.identityText}>
          <Text numberOfLines={1} style={[styles.identityName, { color: theme.colors.onSurface }]}>
            {businessName || 'Your business name'}
          </Text>
          <Text numberOfLines={1} style={[styles.identityMeta, { color: theme.colors.onSurfaceVariant }]}>
            {locationLine || 'Add your address to print it on invoices'}
          </Text>
          {gstNumber ? (
            <View style={[styles.identityPill, { backgroundColor: alpha(gstinValid ? colors.accent : colors.warning, isDark ? 0.2 : 0.1) }]}>
              <ShieldCheck size={11} color={gstinValid ? colors.accent : colors.warning} strokeWidth={2.4} />
              <Text style={[styles.identityPillText, { color: gstinValid ? colors.accent : colors.warning }]}>{gstNumber}</Text>
            </View>
          ) : null}
        </View>
        {logoUrl ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove business logo"
            hitSlop={8}
            onPress={() => form.setValue('logoUrl', '', { shouldDirty: true, shouldTouch: true, shouldValidate: true })}
            style={({ pressed }) => [styles.identityRemove, { backgroundColor: alpha(colors.destructive, isDark ? (pressed ? 0.26 : 0.16) : pressed ? 0.14 : 0.08) }]}
          >
            <Trash2 size={15} color={colors.destructive} strokeWidth={2.2} />
          </Pressable>
        ) : null}
      </View>

      <ProfileSection icon={Store} title="BASIC INFO" hint="Shown on every invoice you send">
        <FormTextInput
          control={form.control}
          name="businessName"
          label="Business name"
          style={{ backgroundColor: inputBackground }}
        />
        <PhoneInput control={form.control} name="phone" />
        <FormTextInput
          control={form.control}
          name="email"
          label="Business email"
          keyboardType="email-address"
          autoCapitalize="none"
          style={{ backgroundColor: inputBackground }}
        />
        <FormTextInput
          control={form.control}
          name="website"
          label="Website"
          keyboardType="url"
          autoCapitalize="none"
          placeholder="https://yourbiz.com"
          style={{ backgroundColor: inputBackground }}
        />
      </ProfileSection>

      <ProfileSection icon={Percent} title="TAX & LEGAL" hint="Used for GST invoices and returns">
        <FormTextInput
          control={form.control}
          name="gstNumber"
          label="GSTIN"
          autoCapitalize="characters"
          maxLength={GSTIN_LENGTH}
          style={{ backgroundColor: inputBackground }}
        />
        {gstNumber ? (
          <View style={[styles.verifiedPill, { backgroundColor: alpha(gstinValid ? colors.accent : colors.warning, isDark ? 0.2 : 0.1) }]}>
            {gstinValid ? (
              <BadgeCheck size={13} color={colors.accent} strokeWidth={2.3} />
            ) : (
              <TriangleAlert size={13} color={colors.warning} strokeWidth={2.3} />
            )}
            <Text style={[styles.verifiedText, { color: gstinValid ? colors.accent : colors.warning }]}>
              {gstinValid ? 'Valid GSTIN' : 'Invalid GSTIN'}
            </Text>
          </View>
        ) : null}
        <FormTextInput
          control={form.control}
          name="panNumber"
          label="PAN"
          autoCapitalize="characters"
          maxLength={PAN_LENGTH}
          style={{ backgroundColor: inputBackground }}
        />
      </ProfileSection>

      <ProfileSection icon={MapPin} title="ADDRESS" hint="PIN code fills state and city for you">
        <FormTextInput
          control={form.control}
          name="address"
          label="Street address"
          multiline
          style={[styles.addressInput, { backgroundColor: inputBackground }]}
        />
        <IndiaAddressFields
          control={form.control}
          setValue={form.setValue}
          inputStyle={{ backgroundColor: inputBackground }}
        />
      </ProfileSection>
    </Screen>
  );
}

const styles = StyleSheet.create({
  addressInput: { minHeight: 76 },
  identityCard: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    marginBottom: spacing.section,
    padding: 16
  },
  identityLogo: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    height: 56,
    justifyContent: 'center',
    width: 56
  },
  identityLogoBadge: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 2,
    bottom: -2,
    height: 20,
    justifyContent: 'center',
    position: 'absolute',
    right: -2,
    width: 20
  },
  identityLogoClip: { alignItems: 'center', borderRadius: 999, height: 54, justifyContent: 'center', overflow: 'hidden', width: 54 },
  identityMeta: { ...fontStyles.medium, fontSize: 12, marginTop: 2 },
  identityName: { ...fontStyles.bold, fontSize: 18, letterSpacing: -0.5, lineHeight: 24 },
  identityPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 4,
    marginTop: 7,
    paddingHorizontal: 9,
    paddingVertical: 3
  },
  identityPillText: { ...fontStyles.bold, fontSize: 10.5, letterSpacing: 0.2 },
  identityRemove: { alignItems: 'center', borderRadius: 999, height: 36, justifyContent: 'center', width: 36 },
  identityText: { flex: 1, minWidth: 0 },
  saveButton: { borderRadius: radii.pill },
  saveButtonContent: { minHeight: 40, paddingHorizontal: 10 },
  saveButtonLabel: { ...fontStyles.bold, fontSize: 13, letterSpacing: -0.1, marginHorizontal: 8 },
  screenContent: { paddingTop: 8 },
  section: { marginBottom: spacing.section },
  // paddingBottom 0: the last input's own 16pt margin becomes the card's bottom padding.
  sectionCard: { borderRadius: 20, borderWidth: 1, paddingBottom: 0, paddingHorizontal: 14, paddingTop: 16 },
  sectionHint: { ...fontStyles.medium, fontSize: 11.5, marginBottom: 10, marginLeft: 4 },
  sectionLabel: { ...fontStyles.semiBold, fontSize: 10.5, letterSpacing: 0.9, textTransform: 'uppercase' },
  sectionLabelRow: { alignItems: 'center', flexDirection: 'row', gap: 6, marginBottom: 3, marginLeft: 4 },
  verifiedPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 5,
    marginBottom: 16,
    marginTop: -6,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  verifiedText: { ...fontStyles.bold, fontSize: 10.5, letterSpacing: 0.2 }
});
