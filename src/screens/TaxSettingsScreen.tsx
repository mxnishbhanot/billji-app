import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Switch, Text, useTheme } from 'react-native-paper';
import { authApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { useAppDialog } from '@/components/AppDialog';
import { useAppToast } from '@/components/AppToast';
import { Screen } from '@/components/Screen';
import { queryKeys } from '@/shared/query/queryKeys';
import { useAuthStore } from '@/store/authStore';
import { AppNavigation } from '@/navigation/types';
import { TaxSettings } from '@/types';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import { stateCodeFromGstin, stateCodeFromName, stateNameForCode } from '@/shared/gst/gstStates';
import { isValidGstin } from '@/utils/gstin';

const GST_SLABS = [
  { rate: 5, description: 'Essential goods, food items' },
  { rate: 12, description: 'Processed foods, business services' },
  { rate: 18, description: 'Standard goods & services' },
  { rate: 28, description: 'Luxury goods, vehicles' }
] as const;

const taxDefaults = (settings?: TaxSettings): TaxSettings => ({
  defaultRate: settings?.defaultRate ?? 0,
  pricesIncludeTax: settings?.pricesIncludeTax ?? false,
  compoundTax: settings?.compoundTax ?? false
});

function SectionLabel({ title }: { title: string }) {
  const theme = useTheme();
  return <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>{title}</Text>;
}

export function TaxSettingsScreen() {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const queryClient = useQueryClient();
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const { showDialog } = useAppDialog();
  const { showToast } = useAppToast();
  const navigation = useNavigation<AppNavigation>();
  const [settings, setSettings] = useState<TaxSettings>(taxDefaults(user?.businessProfile?.taxSettings));

  useEffect(() => {
    setSettings(taxDefaults(user?.businessProfile?.taxSettings));
  }, [user]);

  const save = useMutation({
    mutationFn: authApi.updateSettings,
    onSuccess: async (response) => {
      await setUser(response.user);
      queryClient.invalidateQueries({ queryKey: queryKeys.report.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.onboarding.progress });
      showToast('Tax settings saved', 'success');
    },
    onError: (error) => showDialog({ title: 'Could not save tax settings', message: apiErrorMessage(error), tone: 'error' })
  });

  const gstNumber = user?.businessProfile?.gstNumber || '';
  const gstinVerified = Boolean(gstNumber) && isValidGstin(gstNumber);
  // Supplier state drives every CGST/SGST-vs-IGST decision. The GSTIN wins when set —
  // the server derives it the same way, so this is a read-only reflection of that.
  const stateCode =
    user?.businessProfile?.stateCode || stateCodeFromGstin(gstNumber) || stateCodeFromName(user?.businessProfile?.state || '');
  const stateName = stateNameForCode(stateCode) || user?.businessProfile?.state || '';
  const bannerTitle = gstNumber ? 'GST Registered' : 'GST not registered';
  const bannerSubtitle = gstNumber
    ? `Default rate: ${settings.defaultRate}%${gstinVerified ? ' · GSTIN verified' : ' · GSTIN needs review'}`
    : 'Tap to add your GSTIN in Business Profile';

  // Slab toggles act as a single-select default rate: turning one on clears the others.
  const toggleSlab = (rate: number) =>
    setSettings((prev) => ({ ...prev, defaultRate: prev.defaultRate === rate ? 0 : rate }));
  const toggleBehaviour = (key: 'pricesIncludeTax' | 'compoundTax') => (value: boolean) =>
    setSettings((prev) => ({ ...prev, [key]: value }));

  const headerAction = (
    <Button
      mode="contained"
      compact
      loading={save.isPending}
      disabled={save.isPending}
      onPress={() => save.mutate({ taxSettings: settings })}
      style={styles.saveButton}
      contentStyle={styles.saveButtonContent}
      labelStyle={styles.saveButtonLabel}
    >
      Save
    </Button>
  );

  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.08);

  return (
    <Screen title="Tax Settings" headerAction={headerAction} contentStyle={styles.screenContent}>
      {/* GSTIN lives on the business profile — the banner is the shortcut there so this screen
          isn't a dead end when it's missing. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={gstNumber ? 'Edit GSTIN in Business Profile' : 'Add GSTIN in Business Profile'}
        onPress={() => navigation.navigate('BusinessProfile')}
        style={({ pressed }) => [
          styles.banner,
          {
            backgroundColor: alpha(colors.primary, isDark ? 0.14 : 0.07),
            borderColor: alpha(colors.primary, isDark ? 0.3 : 0.16)
          },
          pressed && styles.cardPressed
        ]}
      >
        <View style={[styles.bannerIcon, { backgroundColor: alpha(colors.primary, isDark ? 0.26 : 0.14) }]}>
          <MaterialCommunityIcons name="percent-outline" size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.bannerText}>
          <Text style={[styles.bannerTitle, { color: theme.colors.primary }]}>{bannerTitle}</Text>
          <Text style={[styles.bannerSubtitle, { color: theme.colors.onSurfaceVariant }]}>{bannerSubtitle}</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.onSurfaceVariant} />
      </Pressable>

      <SectionLabel title="GST SLAB RATES" />
      {GST_SLABS.map((slab) => {
        const active = settings.defaultRate === slab.rate;
        return (
          <Pressable
            key={slab.rate}
            onPress={() => toggleSlab(slab.rate)}
            style={({ pressed }) => [
              styles.slabCard,
              {
                backgroundColor: active ? alpha(colors.primary, isDark ? 0.1 : 0.05) : colors.card,
                borderColor: active ? alpha(colors.primary, isDark ? 0.45 : 0.3) : cardBorder
              },
              pressed && styles.cardPressed
            ]}
          >
            <View
              style={[
                styles.slabBadge,
                { backgroundColor: active ? alpha(colors.primary, isDark ? 0.26 : 0.12) : isDark ? colors.surface : alpha(colors.primaryStrong, 0.05) }
              ]}
            >
              <Text style={[styles.slabBadgeText, { color: active ? theme.colors.primary : theme.colors.onSurface }]}>{slab.rate}%</Text>
            </View>
            <View style={styles.slabText}>
              <Text style={[styles.slabTitle, { color: theme.colors.onSurface }]}>GST {slab.rate}%</Text>
              <Text style={[styles.slabDescription, { color: theme.colors.onSurfaceVariant }]}>{slab.description}</Text>
              {active ? (
                <View style={styles.defaultRow}>
                  <MaterialCommunityIcons name="check" size={13} color={colors.accent} />
                  <Text style={[styles.defaultText, { color: colors.accent }]}>Default rate</Text>
                </View>
              ) : null}
            </View>
            {/* Display-only: the wrapping Pressable owns the tap. A live Switch here double-fires
                (onValueChange + bubbled card onPress), toggling twice and snapping back. */}
            <View pointerEvents="none">
              <Switch value={active} color={theme.colors.primary} />
            </View>
          </Pressable>
        );
      })}

      <SectionLabel title="PLACE OF BUSINESS" />
      <View style={[styles.behaviourCard, { backgroundColor: colors.card, borderColor: cardBorder }]}>
        <View style={styles.behaviourRow}>
          <View style={[styles.behaviourIcon, { backgroundColor: alpha(colors.primary, isDark ? 0.22 : 0.12) }]}>
            <MaterialCommunityIcons name="map-marker-outline" size={18} color={theme.colors.primary} />
          </View>
          <View style={styles.behaviourText}>
            <Text style={[styles.behaviourTitle, { color: theme.colors.onSurface }]}>{stateName || 'State not set'}</Text>
            <Text style={[styles.behaviourSubtitle, { color: theme.colors.onSurfaceVariant }]}>
              {gstNumber
                ? 'Taken from your GSTIN. Sales inside this state are CGST + SGST; outside it, IGST.'
                : 'Set your state in Business Profile so GST splits correctly.'}
            </Text>
          </View>
        </View>
      </View>

      <SectionLabel title="TAX BEHAVIOUR" />
      <View style={[styles.behaviourCard, { backgroundColor: colors.card, borderColor: cardBorder }]}>
        <View style={styles.behaviourRow}>
          <View style={[styles.behaviourIcon, { backgroundColor: alpha(colors.violet, isDark ? 0.22 : 0.12) }]}>
            <MaterialCommunityIcons name="layers-triple-outline" size={18} color={colors.violet} />
          </View>
          <View style={styles.behaviourText}>
            <Text style={[styles.behaviourTitle, { color: theme.colors.onSurface }]}>Prices include GST</Text>
            <Text style={[styles.behaviourSubtitle, { color: theme.colors.onSurfaceVariant }]}>Tax is included in item price</Text>
          </View>
          <Switch value={settings.pricesIncludeTax} onValueChange={toggleBehaviour('pricesIncludeTax')} color={theme.colors.primary} />
        </View>
        <View style={[styles.rowDivider, { backgroundColor: cardBorder }]} />
        <View style={styles.behaviourRow}>
          <View style={[styles.behaviourIcon, { backgroundColor: alpha(colors.warning, isDark ? 0.22 : 0.12) }]}>
            <MaterialCommunityIcons name="calculator-variant-outline" size={18} color={colors.warning} />
          </View>
          <View style={styles.behaviourText}>
            <Text style={[styles.behaviourTitle, { color: theme.colors.onSurface }]}>Compound Tax</Text>
            <Text style={[styles.behaviourSubtitle, { color: theme.colors.onSurfaceVariant }]}>Apply tax on top of other taxes</Text>
          </View>
          <Switch value={settings.compoundTax} onValueChange={toggleBehaviour('compoundTax')} color={theme.colors.primary} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: { alignItems: 'center', borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', gap: 12, marginBottom: 20, padding: 14 },
  bannerIcon: { alignItems: 'center', borderRadius: radii.md, height: 40, justifyContent: 'center', width: 40 },
  bannerSubtitle: { ...typeScale.caption, fontSize: 12, marginTop: 2 },
  bannerText: { flex: 1, minWidth: 0 },
  bannerTitle: { ...fontStyles.bold, fontSize: 14 },
  behaviourCard: { borderRadius: radii.lg, borderWidth: 1, marginBottom: 18 },
  behaviourIcon: { alignItems: 'center', borderRadius: radii.md, height: 34, justifyContent: 'center', width: 34 },
  behaviourRow: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 64, paddingHorizontal: 14, paddingVertical: 10 },
  behaviourSubtitle: { ...typeScale.caption, fontSize: 12, marginTop: 2 },
  behaviourText: { flex: 1, minWidth: 0 },
  behaviourTitle: { ...fontStyles.bold, fontSize: 14 },
  cardPressed: { opacity: 0.9 },
  defaultRow: { alignItems: 'center', flexDirection: 'row', gap: 4, marginTop: 4 },
  defaultText: { ...fontStyles.semiBold, fontSize: 12 },
  rowDivider: { height: 1, marginLeft: 60 },
  saveButton: { borderRadius: radii.pill },
  saveButtonContent: { minHeight: 38, paddingHorizontal: 8 },
  saveButtonLabel: { ...fontStyles.bold, fontSize: 13, marginHorizontal: 8 },
  screenContent: { paddingTop: 8 },
  sectionLabel: { ...fontStyles.bold, fontSize: 11, letterSpacing: 1.1, marginBottom: 8, marginLeft: 2 },
  slabBadge: { alignItems: 'center', borderRadius: radii.md, height: 44, justifyContent: 'center', width: 52 },
  slabBadgeText: { ...fontStyles.bold, fontSize: 15 },
  slabCard: { alignItems: 'center', borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', gap: 12, marginBottom: 10, padding: 14 },
  slabDescription: { ...typeScale.caption, fontSize: 12, marginTop: 2 },
  slabText: { flex: 1, minWidth: 0 },
  slabTitle: { ...fontStyles.bold, fontSize: 14 }
});
