import { ReactNode, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { Button, Text, useTheme } from 'react-native-paper';
import { authApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { useAppDialog } from '@/components/AppDialog';
import { useAppToast } from '@/components/AppToast';
import { FormTextInput } from '@/components/FormTextInput';
import { PhoneInput } from '@/components/PhoneInput';
import { Screen } from '@/components/Screen';
import { queryKeys } from '@/shared/query/queryKeys';
import { useAuthStore } from '@/store/authStore';
import { alpha, appColors, fontStyles, radii, spacing, typeScale } from '@/theme/theme';
import { BusinessProfile, BusinessProfileFormValues } from '@/types';
import { GSTIN_LENGTH, PAN_LENGTH, isValidGstin } from '@/utils/gstin';
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

function ProfileSection({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  const colors = appColors(theme.dark);

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>{title}</Text>
      <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: theme.dark ? colors.border : alpha(colors.primaryStrong, 0.08) }]}>
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

  useEffect(() => {
    form.reset(profileDefaults(user?.businessProfile));
  }, [user, form]);

  const save = useMutation({
    mutationFn: authApi.updateSettings,
    onSuccess: async (response) => {
      await setUser(response.user);
      queryClient.invalidateQueries({ queryKey: queryKeys.report.all });
      showToast('Business profile saved', 'success');
    },
    onError: (error) => showDialog({ title: 'Could not save profile', message: apiErrorMessage(error), tone: 'error' })
  });

  const saveProfile = form.handleSubmit((values) => save.mutate(values));
  const inputBackground = isDark ? colors.surface : colors.card;

  const headerAction = (
    <Button
      mode="contained"
      compact
      loading={save.isPending}
      disabled={save.isPending}
      onPress={saveProfile}
      style={styles.saveButton}
      contentStyle={styles.saveButtonContent}
      labelStyle={styles.saveButtonLabel}
    >
      Save
    </Button>
  );

  return (
    <Screen title="Business Profile" headerAction={headerAction} contentStyle={styles.screenContent}>
      <ProfileSection title="BASIC INFO">
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

      <ProfileSection title="TAX & LEGAL">
        <FormTextInput
          control={form.control}
          name="gstNumber"
          label="GSTIN"
          autoCapitalize="characters"
          maxLength={GSTIN_LENGTH}
          style={{ backgroundColor: inputBackground }}
        />
        {gstNumber ? (
          gstinValid ? (
            <View style={[styles.verifiedPill, { backgroundColor: alpha(colors.accent, isDark ? 0.22 : 0.1), borderColor: alpha(colors.accent, isDark ? 0.36 : 0.22) }]}>
              <MaterialCommunityIcons name="check-circle-outline" size={13} color={colors.accent} />
              <Text style={[styles.verifiedText, { color: colors.accent }]}>Valid GSTIN</Text>
            </View>
          ) : (
            <View style={[styles.verifiedPill, { backgroundColor: alpha(colors.warning, isDark ? 0.22 : 0.1), borderColor: alpha(colors.warning, isDark ? 0.36 : 0.22) }]}>
              <MaterialCommunityIcons name="alert-circle-outline" size={13} color={colors.warning} />
              <Text style={[styles.verifiedText, { color: colors.warning }]}>Invalid GSTIN</Text>
            </View>
          )
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

      <ProfileSection title="ADDRESS">
        <FormTextInput
          control={form.control}
          name="address"
          label="Street address"
          multiline
          style={[styles.addressInput, { backgroundColor: inputBackground }]}
        />
        <View style={styles.inlineRow}>
          <View style={styles.inlineField}>
            <FormTextInput
              control={form.control}
              name="city"
              label="City"
              style={{ backgroundColor: inputBackground }}
            />
          </View>
          <View style={styles.inlineField}>
            <FormTextInput
              control={form.control}
              name="pinCode"
              label="PIN code"
              keyboardType="number-pad"
              maxLength={6}
              style={{ backgroundColor: inputBackground }}
            />
          </View>
        </View>
        <FormTextInput
          control={form.control}
          name="state"
          label="State"
          style={{ backgroundColor: inputBackground }}
        />
      </ProfileSection>
    </Screen>
  );
}

const styles = StyleSheet.create({
  addressInput: { minHeight: 72 },
  inlineField: { flex: 1, minWidth: 0 },
  inlineRow: { flexDirection: 'row', gap: 8 },
  saveButton: { borderRadius: radii.pill },
  saveButtonContent: { minHeight: 38, paddingHorizontal: 8 },
  saveButtonLabel: { ...fontStyles.bold, fontSize: 13, marginHorizontal: 8 },
  screenContent: { paddingTop: 8 },
  section: { marginBottom: 18 },
  sectionCard: { borderRadius: radii.lg, borderWidth: 1, padding: spacing.cardPadding },
  sectionLabel: { ...fontStyles.bold, fontSize: 11, letterSpacing: 1.1, marginBottom: 8, marginLeft: 2 },
  verifiedPill: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: radii.pill, borderWidth: 1, flexDirection: 'row', gap: 5, marginBottom: 16, marginTop: -8, paddingHorizontal: 10, paddingVertical: 5 },
  verifiedText: { ...typeScale.badgeLabel, fontSize: 10 }
});
