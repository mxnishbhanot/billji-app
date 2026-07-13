import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import Reanimated, { Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { ActivityIndicator, Switch, Text, useTheme } from 'react-native-paper';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { authApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { useAppDialog } from '@/components/AppDialog';
import { BrandLogoSheet } from '@/components/BrandLogoSheet';
import { BrandMark } from '@/components/BrandMark';
import { SecuritySessionsSheet } from '@/components/SecuritySessionsSheet';
import { WorkspaceSwitcherSheet } from '@/components/WorkspaceSwitcherSheet';
import { Screen } from '@/components/Screen';
import { AppNavigation } from '@/navigation/types';
import { disconnectSocket } from '@/services/socket';
import { PERMISSION, usePermissions } from '@/shared/hooks/usePermissions';
import { queryKeys } from '@/shared/query/queryKeys';
import { useAuthStore } from '@/store/authStore';
import { getAnalyticsConsent, setAnalyticsConsent } from '@/services/analytics';
import { BusinessProfileFormValues } from '@/types';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import { settingsSchema } from '@/validation/schemas';

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
      <G opacity="0.2" stroke="#FFFFFF" strokeWidth={1.2} fill="none" strokeLinecap="round">
        <Path d="M -26 38 C 28 2, 84 2, 134 34 S 236 78, 392 14" />
        <Path d="M -30 72 C 38 28, 96 32, 154 66 S 270 116, 392 62" opacity={0.72} />
        <Path d="M -28 112 C 48 70, 116 82, 176 108 S 282 152, 390 102" opacity={0.58} />
        <Path d="M 32 156 C 92 112, 148 124, 204 142 S 294 178, 388 128" opacity={0.42} />
      </G>
      <G opacity="0.18" stroke="#FFFFFF" strokeWidth={1.1} fill="none">
        <Circle cx={272} cy={44} r={18} />
        <Circle cx={302} cy={76} r={8} />
        <Circle cx={70} cy={116} r={13} />
        <Circle cx={110} cy={28} r={6} />
      </G>
      <G opacity="0.08" stroke="#A5B4FC" strokeWidth={18} fill="none">
        <Path d="M 238 -18 C 284 16, 318 52, 386 48" />
        <Path d="M -34 144 C 36 106, 86 122, 146 162" />
      </G>
    </Svg>
  );
}

function FloatingHeroBubbles() {
  const first = useMemo(() => new Animated.Value(0), []);
  const second = useMemo(() => new Animated.Value(0), []);
  const third = useMemo(() => new Animated.Value(0), []);
  const fourth = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(first, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(first, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true })
        ]),
        Animated.sequence([
          Animated.timing(second, { toValue: 1, duration: 12000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(second, { toValue: 0, duration: 12000, easing: Easing.inOut(Easing.sin), useNativeDriver: true })
        ]),
        Animated.sequence([
          Animated.timing(third, { toValue: 1, duration: 15000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(third, { toValue: 0, duration: 15000, easing: Easing.inOut(Easing.sin), useNativeDriver: true })
        ]),
        Animated.sequence([
          Animated.timing(fourth, { toValue: 1, duration: 18000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(fourth, { toValue: 0, duration: 18000, easing: Easing.inOut(Easing.sin), useNativeDriver: true })
        ])
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [first, fourth, second, third]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View
        style={[
          styles.heroBubbleLarge,
          {
            opacity: first.interpolate({ inputRange: [0, 1], outputRange: [0.16, 0.26] }),
            transform: [
              { translateX: first.interpolate({ inputRange: [0, 1], outputRange: [0, -20] }) },
              { translateY: first.interpolate({ inputRange: [0, 1], outputRange: [0, 12] }) },
              { scale: first.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.08] }) }
            ]
          }
        ]}
      />
      <Animated.View
        style={[
          styles.heroBubbleSmall,
          {
            opacity: second.interpolate({ inputRange: [0, 1], outputRange: [0.1, 0.2] }),
            transform: [
              { translateX: second.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) },
              { translateY: second.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }) },
              { scale: second.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.1] }) }
            ]
          }
        ]}
      />
      <Animated.View
        style={[
          styles.heroBubbleMedium,
          {
            opacity: third.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.18] }),
            transform: [
              { translateX: third.interpolate({ inputRange: [0, 1], outputRange: [0, 24] }) },
              { translateY: third.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) },
              { scale: third.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.12] }) }
            ]
          }
        ]}
      />
      <Animated.View
        style={[
          styles.heroBubbleTiny,
          {
            opacity: fourth.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.22] }),
            transform: [
              { translateX: fourth.interpolate({ inputRange: [0, 1], outputRange: [0, -16] }) },
              { translateY: fourth.interpolate({ inputRange: [0, 1], outputRange: [0, -18] }) },
              { scale: fourth.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.14] }) }
            ]
          }
        ]}
      />
    </View>
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
  const navigation = useNavigation<AppNavigation>();
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = useMemo(() => appColors(isDark), [isDark]);
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((event) => { scrollY.value = event.contentOffset.y; });
  const heroParallaxStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 150], [1, 0.94], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(scrollY.value, [0, 150], [0, 22], Extrapolation.CLAMP) },
      { scale: interpolate(scrollY.value, [0, 150], [1, 0.975], Extrapolation.CLAMP) }
    ]
  }));
  const { showDialog } = useAppDialog();
  const { can } = usePermissions();
  const canViewLedger = can(PERMISSION.reportsView);
  const canViewActivity = can(PERMISSION.settingsManage);
  const canViewTeam = can(PERMISSION.teamView);
  const canViewRoles = can(PERMISSION.rolesView);
  const [brandSheetVisible, setBrandSheetVisible] = useState(false);
  const [sessionsSheetVisible, setSessionsSheetVisible] = useState(false);
  const [workspaceSheetVisible, setWorkspaceSheetVisible] = useState(false);
  const [themeSaving, setThemeSaving] = useState(false);
  const [analyticsOn, setAnalyticsOn] = useState(true);

  useEffect(() => {
    void getAnalyticsConsent().then(setAnalyticsOn);
  }, []);

  const toggleAnalytics = (enabled: boolean) => {
    setAnalyticsOn(enabled);
    void setAnalyticsConsent(enabled);
  };
  const form = useForm<BusinessProfileFormValues>({ defaultValues: { businessName: '', invoicePrefix: 'INV', theme: 'light', ...(user?.businessProfile || {}) }, resolver: zodResolver(settingsSchema) });
  const selectedTheme = useWatch({ control: form.control, name: 'theme' }) || 'light';
  const logoPreview = useWatch({ control: form.control, name: 'logoUrl' }) || '';
  const businessName = useWatch({ control: form.control, name: 'businessName' }) || '';
  const businessEmail = useWatch({ control: form.control, name: 'email' }) || '';
  const phone = useWatch({ control: form.control, name: 'phone' }) || '';
  const gstNumber = useWatch({ control: form.control, name: 'gstNumber' }) || '';
  const taxSettings = user?.businessProfile?.taxSettings;
  const invoicePrefix = useWatch({ control: form.control, name: 'invoicePrefix' }) || 'INV';

  useEffect(() => {
    form.reset({ businessName: '', invoicePrefix: 'INV', theme: 'light', ...(user?.businessProfile || {}) });
  }, [user, form]);

  const save = useMutation({
    mutationFn: authApi.updateSettings,
    onSuccess: async (response) => {
      await setUser(response.user);
      queryClient.invalidateQueries({ queryKey: queryKeys.report.all });
      showDialog({ title: 'Settings saved', message: 'Your business profile has been updated.', tone: 'success' });
    },
    onError: (error) => showDialog({ title: 'Could not save settings', message: apiErrorMessage(error), tone: 'error' })
  });
  const sessionsQuery = useQuery({ queryKey: queryKeys.auth.sessions, queryFn: authApi.sessions, enabled: sessionsSheetVisible });
  const revokeSession = useMutation({
    mutationFn: authApi.revokeSession,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.auth.sessions }),
    onError: (error) => showDialog({ title: 'Could not revoke session', message: apiErrorMessage(error), tone: 'error' })
  });
  const signOut = async () => {
    try {
      await authApi.logout();
    } catch {
      // Local sign out must still work if network/session already expired.
    }
    disconnectSocket();
    queryClient.clear();
    await logout();
  };

  const saveBrand = form.handleSubmit((values) => save.mutate(values, { onSuccess: () => setBrandSheetVisible(false) }));

  const setLogo = (dataUri: string) => form.setValue('logoUrl', dataUri, { shouldDirty: true, shouldTouch: true, shouldValidate: true });

  const pickLogoWeb = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showDialog({ title: 'Permission required', message: 'Photo library access is required to choose a business logo.', tone: 'warning' });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.95, base64: true });
    if (!result.canceled) {
      const asset = result.assets[0];
      if (!asset) return;
      setLogo(asset.base64 ? `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}` : asset.uri);
    }
  };

  const pickLogo = async () => {
    // Native crop UI (zoom / pan / rotate) is unavailable on web — fall back to the plain picker there.
    if (Platform.OS === 'web') {
      await pickLogoWeb();
      return;
    }

    // Lazy require: the crop picker registers a TurboModule at import time, which crashes
    // on dev clients built before the library was added. Fall back to the plain picker then.
    let cropPicker: typeof import('react-native-image-crop-picker').default;
    try {
      cropPicker = require('react-native-image-crop-picker').default;
    } catch {
      await pickLogoWeb();
      return;
    }

    try {
      const image = await cropPicker.openPicker({
        mediaType: 'photo',
        cropping: true,
        width: 1024,
        height: 1024,
        cropperCircleOverlay: true,
        // Lock rotation while scaling — two-finger pinch was accidentally rotating the image.
        // Rotation stays available via the rotate controls (cropperRotateButtonsHidden: false).
        enableRotationGesture: false,
        cropperRotateButtonsHidden: false,
        cropperToolbarTitle: 'Adjust logo',
        cropperActiveWidgetColor: '#4338CA',
        cropperStatusBarColor: '#1C1A4A',
        cropperToolbarColor: '#1C1A4A',
        cropperToolbarWidgetColor: '#FFFFFF',
        compressImageQuality: 0.95,
        includeBase64: true
      });
      if (image.data) setLogo(`data:${image.mime};base64,${image.data}`);
    } catch (error) {
      // User cancelled the picker/cropper — not an error.
      if ((error as { code?: string })?.code === 'E_PICKER_CANCELLED') return;
      showDialog({ title: 'Could not pick image', message: apiErrorMessage(error), tone: 'error' });
    }
  };

  const removeLogo = () => form.setValue('logoUrl', '', { shouldDirty: true, shouldTouch: true, shouldValidate: true });
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

  return (
    <Screen
      title="Settings"
      contentStyle={styles.screenContent}
      scrollViewProps={{
        scrollEventThrottle: 16,
        onScroll: scrollHandler
      }}
    >
      <Reanimated.View style={[styles.profileCard, { borderColor: alpha('#C3C0FF', 0.3) }, heroParallaxStyle]}>
        <SettingsHeroPattern />
        <FloatingHeroBubbles />
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
        <Pressable onPress={() => setBrandSheetVisible(true)} style={({ pressed }) => [styles.profileEdit, { backgroundColor: alpha('#1C1A4A', pressed ? 0.55 : 0.36), borderColor: alpha('#C3C0FF', 0.36) }]} hitSlop={8}>
          <Feather name="edit-2" size={18} color="#FFFFFF" />
        </Pressable>
      </Reanimated.View>

      <SettingsGroup title="BUSINESS">
        <SettingsRow icon="briefcase-outline" title="Business Profile" subtitle={`${businessName || 'Name'}, ${phone ? 'phone' : 'phone missing'}, ${businessEmail ? 'email' : 'email missing'}`} tone={colors.primary} onPress={() => navigation.navigate('BusinessProfile')} />
        <View style={[styles.rowDivider, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08) }]} />
        <SettingsRow
          icon="tag-outline"
          title="Tax Settings"
          subtitle={
            taxSettings?.defaultRate
              ? `Default GST ${taxSettings.defaultRate}%${gstNumber ? ` · ${gstNumber}` : ''}`
              : gstNumber
                ? `GST ${gstNumber}`
                : 'GST rates not configured'
          }
          tone={colors.warning}
          onPress={() => navigation.navigate('TaxSettings')}
        />
      </SettingsGroup>

      <SettingsGroup title="INVOICING">
        <SettingsRow icon="file-document-edit-outline" title="Invoice Template" subtitle={`Customize PDF · ${invoicePrefix || 'INV'}-0001`} tone={colors.primary} onPress={() => navigation.navigate('InvoiceTemplate')} />
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

      {canViewLedger || canViewActivity ? (
        <SettingsGroup title="RECORDS">
          {canViewLedger ? (
            <SettingsRow icon="book-open-outline" title="Ledger" subtitle="Accounting entries" tone={colors.primary} onPress={() => navigation.navigate('Ledger')} />
          ) : null}
          {canViewLedger && canViewActivity ? <View style={[styles.rowDivider, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08) }]} /> : null}
          {canViewActivity ? (
            <SettingsRow icon="history" title="Activity log" subtitle="Recent account actions" tone={colors.accent} onPress={() => navigation.navigate('ActivityLog')} />
          ) : null}
        </SettingsGroup>
      ) : null}

      <SettingsGroup title="WORKSPACE">
        {canViewTeam ? (
          <SettingsRow icon="account-group-outline" title="Team members" subtitle="Invite and manage your team" tone={colors.primary} onPress={() => navigation.navigate('Team')} />
        ) : null}
        {canViewTeam ? <View style={[styles.rowDivider, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08) }]} /> : null}
        {canViewRoles ? (
          <SettingsRow icon="shield-account-outline" title="Roles & permissions" subtitle="Control what each role can access" tone={colors.violet} onPress={() => navigation.navigate('Roles')} />
        ) : null}
        {canViewRoles ? <View style={[styles.rowDivider, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08) }]} /> : null}
        <SettingsRow icon="swap-horizontal" title="Switch business" subtitle="Change your active workspace" tone={colors.accent} onPress={() => setWorkspaceSheetVisible(true)} />
        <View style={[styles.rowDivider, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08) }]} />
        <SettingsRow icon="ticket-confirmation-outline" title="Join a business" subtitle="Enter an invite code from your email" tone={colors.primary} onPress={() => navigation.navigate('AcceptInvite')} />
      </SettingsGroup>

      <SettingsGroup title="ACCOUNT">
        <SettingsRow
          icon="bell-outline"
          title="Notifications"
          subtitle="Choose which alerts you see"
          tone={colors.violet}
          onPress={() => navigation.navigate('NotificationSettings')}
        />
        <View style={[styles.rowDivider, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08) }]} />
        <SettingsRow icon="shield-key-outline" title="Security & Sessions" subtitle="See where you're signed in" tone={colors.warning} onPress={() => setSessionsSheetVisible(true)} />
        <View style={[styles.rowDivider, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08) }]} />
        <SettingsRow icon="shield-lock-outline" title="Two-factor authentication" subtitle="Add a second step at login" tone={colors.accent} onPress={() => navigation.navigate('TwoFactorSetup')} />
        <View style={[styles.rowDivider, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08) }]} />
        <SettingsRow
          icon="chart-box-outline"
          title="Usage analytics"
          subtitle="Share anonymous usage to improve Billji"
          tone={colors.accent}
          trailing={<Switch value={analyticsOn} onValueChange={toggleAnalytics} color={theme.colors.primary} />}
        />
        <View style={[styles.rowDivider, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08) }]} />
        <SettingsRow
          icon="logout"
          title="Logout"
          subtitle="Sign out of this device"
          tone={colors.destructive}
          onPress={signOut}
          trailing={<Feather name="log-out" size={17} color={theme.colors.error} />}
        />
      </SettingsGroup>

      <Text style={[styles.versionText, { color: theme.colors.onSurfaceVariant }]}>Billji mobile v1.0.0</Text>

      <SecuritySessionsSheet
        visible={sessionsSheetVisible}
        sessions={sessionsQuery.data}
        loading={sessionsQuery.isLoading}
        revokingId={revokeSession.isPending ? revokeSession.variables : null}
        onRevoke={(id) => revokeSession.mutate(id)}
        onClose={() => setSessionsSheetVisible(false)}
      />

      <WorkspaceSwitcherSheet visible={workspaceSheetVisible} onClose={() => setWorkspaceSheetVisible(false)} />

      <BrandLogoSheet
        visible={brandSheetVisible}
        control={form.control}
        logoPreview={logoPreview}
        businessName={businessName}
        saving={save.isPending}
        onPickLogo={pickLogo}
        onRemoveLogo={removeLogo}
        onClose={() => setBrandSheetVisible(false)}
        onSave={saveBrand}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  appearanceTrailing: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  dialogScrollContent: { paddingHorizontal: 24, paddingVertical: 8 },
  group: { marginBottom: 16 },
  groupCard: { borderRadius: radii.lg, borderWidth: 1, overflow: 'hidden' },
  groupLabel: { ...fontStyles.bold, fontSize: 11, letterSpacing: 1.1, marginBottom: 8, marginLeft: 2 },
  planPill: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#FFFFFF', borderRadius: radii.pill, flexDirection: 'row', gap: 4, marginTop: 6, paddingHorizontal: 8, paddingVertical: 3 },
  planText: { ...fontStyles.bold, color: '#4338CA', fontSize: 10 },
  profileCard: { alignItems: 'center', borderRadius: 26, borderWidth: 1, flexDirection: 'row', gap: 14, marginBottom: 20, minHeight: 120, overflow: 'hidden', padding: 18 },
  profileContent: { flex: 1, minWidth: 0 },
  profileEdit: { alignItems: 'center', borderRadius: radii.pill, borderWidth: 1, height: 38, justifyContent: 'center', width: 38 },
  profileEmail: { ...typeScale.caption, color: 'rgba(255,255,255,0.82)', fontSize: 12, marginTop: 1 },
  heroBubbleLarge: { backgroundColor: alpha('#FFFFFF', 0.18), borderColor: alpha('#FFFFFF', 0.34), borderRadius: 70, borderWidth: 1, height: 140, position: 'absolute', right: -42, top: 54, width: 140 },
  heroBubbleMedium: { backgroundColor: alpha('#A5B4FC', 0.16), borderColor: alpha('#FFFFFF', 0.24), borderRadius: 48, borderWidth: 1, bottom: -28, height: 96, left: 48, position: 'absolute', width: 96 },
  heroBubbleSmall: { backgroundColor: alpha('#FFFFFF', 0.14), borderColor: alpha('#FFFFFF', 0.28), borderRadius: 38, borderWidth: 1, height: 76, left: -24, position: 'absolute', top: -22, width: 76 },
  heroBubbleTiny: { backgroundColor: alpha('#FFFFFF', 0.16), borderColor: alpha('#FFFFFF', 0.3), borderRadius: 23, borderWidth: 1, height: 46, position: 'absolute', right: 92, top: 24, width: 46 },
  profileLogo: { alignItems: 'center', borderRadius: radii.pill, borderWidth: 1, height: 64, justifyContent: 'center', overflow: 'hidden', width: 64 },
  profileName: { ...fontStyles.bold, color: '#FFFFFF', fontSize: 20, letterSpacing: -0.5, lineHeight: 26 },
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
