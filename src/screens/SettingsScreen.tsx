import { ComponentType, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  ArrowLeftRight,
  Bell,
  BookOpen,
  ChartColumn,
  ChevronRight,
  CloudAlert,
  Compass,
  Crown,
  Download,
  FileText,
  History,
  KeyRound,
  LogOut,
  LucideIcon,
  MoonStar,
  Pencil,
  Percent,
  RefreshCw,
  ShieldCheck,
  Store,
  Ticket,
  Upload,
  Users
} from 'lucide-react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { ActivityIndicator, Switch, Text, useTheme } from 'react-native-paper';
import { authApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { useAppDialog } from '@/components/AppDialog';
import { useAppToast } from '@/components/AppToast';
import { BrandLogoSheet } from '@/components/BrandLogoSheet';
import { BrandMark } from '@/components/BrandMark';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SecuritySessionsSheet } from '@/components/SecuritySessionsSheet';
import { WorkspaceSwitcherSheet } from '@/components/WorkspaceSwitcherSheet';
import { Screen } from '@/components/Screen';
import { PendingBadge } from '@/components/SyncStatus';
import { shadows } from '@/design-system';
import { pendingLocalSyncCount, wipeLocalBusinessData } from '@/db/wipeLocalData';
import { AppNavigation } from '@/navigation/types';
import { unregisterFromPush } from '@/services/push';
import { disconnectSocket } from '@/services/socket';
import { LIMIT } from '@/constants/entitlements';
import { useEntitlements } from '@/shared/hooks/useEntitlements';
import { useLogoPicker } from '@/shared/hooks/useLogoPicker';
import { PERMISSION, usePermissions } from '@/shared/hooks/usePermissions';
import { useSyncStatus } from '@/shared/hooks/useSyncStatus';
import { queryKeys } from '@/shared/query/queryKeys';
import { useAuthStore } from '@/store/authStore';
import { getAnalyticsConsent, setAnalyticsConsent } from '@/services/analytics';
import { useOnboardingOptional } from '@/features/onboarding';
import { BusinessProfileFormValues } from '@/types';
import { alpha, appColors, fontStyles, spacing } from '@/theme/theme';
import { settingsSchema } from '@/validation/schemas';

const cardBorder = (isDark: boolean, colors: ReturnType<typeof appColors>) =>
  isDark ? colors.border : alpha(colors.primaryStrong, 0.06);

/** Uppercase eyebrow + one hairline-separated card. Matches the Dashboard's label/card rhythm. */
function SettingsGroup({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  // Nulls come from permission gating — drop them so separators land between real rows only.
  const rows = (Array.isArray(children) ? children.flat() : [children]).filter(Boolean);

  return (
    <View style={styles.group}>
      <View style={styles.groupLabelRow}>
        <Icon size={13} color={colors.primaryStrong} strokeWidth={2.4} />
        <Text style={[styles.groupLabel, { color: theme.colors.onSurfaceVariant }]}>{title}</Text>
      </View>
      <View style={[styles.groupCard, shadows.card, { backgroundColor: colors.card, borderColor: cardBorder(isDark, colors) }]}>
        {rows.map((row, index) => (
          <View key={index}>
            {index > 0 ? <View style={[styles.rowDivider, { backgroundColor: cardBorder(isDark, colors) }]} /> : null}
            {row}
          </View>
        ))}
      </View>
    </View>
  );
}

type SettingsRowProps = {
  icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  title: string;
  subtitle: string;
  tone: string;
  onPress?: () => void;
  /** Sits left of the chevron (badge) or replaces it entirely on toggle rows. */
  trailing?: ReactNode;
  destructive?: boolean;
};

function SettingsRow({ icon: Icon, title, subtitle, tone, onPress, trailing, destructive }: SettingsRowProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${title}. ${subtitle}`}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: alpha(tone, theme.dark ? 0.1 : 0.05) }]}
    >
      <View style={[styles.rowIcon, { backgroundColor: alpha(tone, theme.dark ? 0.22 : 0.12) }]}>
        <Icon size={17} color={tone} strokeWidth={2.2} />
      </View>
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={[styles.rowTitle, { color: destructive ? tone : theme.colors.onSurface }]}>{title}</Text>
        <Text numberOfLines={1} style={[styles.rowSubtitle, { color: theme.colors.onSurfaceVariant }]}>{subtitle}</Text>
      </View>
      {trailing}
      {onPress ? <ChevronRight size={17} color={theme.colors.onSurfaceVariant} strokeWidth={2.2} /> : null}
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
  const { showDialog } = useAppDialog();
  const { showToast } = useAppToast();
  const { can } = usePermissions();
  // The header chip used to read "Pro Plan" for everyone. It now says what the business is actually on.
  const entitlements = useEntitlements();
  const planLabel = entitlements.plan.name || 'Starter';
  const documents = entitlements.usage(LIMIT.documentsPerMonth);
  const billingSubtitle = documents
    ? `${planLabel} · ${documents.used}${documents.unlimited ? '' : ` of ${documents.limit}`} documents this month`
    : planLabel;
  const canViewLedger = can(PERMISSION.reportsView);
  const canViewActivity = can(PERMISSION.settingsManage);
  const canViewTeam = can(PERMISSION.teamView);
  const canViewRoles = can(PERMISSION.rolesView);
  const canExportData = can(PERMISSION.settingsExport);
  const canImportData = can(PERMISSION.customersManage) || can(PERMISSION.productsManage);
  const [brandSheetVisible, setBrandSheetVisible] = useState(false);
  const [sessionsSheetVisible, setSessionsSheetVisible] = useState(false);
  const [workspaceSheetVisible, setWorkspaceSheetVisible] = useState(false);
  const [themeSaving, setThemeSaving] = useState(false);
  const [analyticsOn, setAnalyticsOn] = useState(true);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [pendingOnLogout, setPendingOnLogout] = useState(0);
  const { failed } = useSyncStatus();
  const onboarding = useOnboardingOptional();

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
      queryClient.invalidateQueries({ queryKey: queryKeys.onboarding.progress });
    },
    onError: (error) => showDialog({ title: 'Could not save settings', message: apiErrorMessage(error), tone: 'error' })
  });
  const sessionsQuery = useQuery({ queryKey: queryKeys.auth.sessions, queryFn: authApi.sessions, enabled: sessionsSheetVisible });
  const revokeSession = useMutation({
    mutationFn: authApi.revokeSession,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.auth.sessions }),
    onError: (error) => showDialog({ title: 'Could not revoke session', message: apiErrorMessage(error), tone: 'error' })
  });
  const requestSignOut = async () => {
    const pending = await pendingLocalSyncCount(user?.businessId ?? null);
    setPendingOnLogout(pending);
    setConfirmLogout(true);
  };

  const signOut = async () => {
    setConfirmLogout(false);
    // Drop the push registration while the session is still valid — afterwards the
    // DELETE would 401 and this phone would keep buzzing for the previous account.
    await unregisterFromPush();
    try {
      await authApi.logout();
    } catch {
      // Local sign out must still work if network/session already expired.
    }
    disconnectSocket();
    // Wipe offline books before clearing the in-memory session so another account
    // on this phone cannot read the previous tenant's SQLite data.
    await wipeLocalBusinessData({ clearSecureSession: true });
    queryClient.clear();
    await logout();
  };

  const setLogo = useCallback(
    (dataUri: string) => form.setValue('logoUrl', dataUri, { shouldDirty: true, shouldTouch: true, shouldValidate: true }),
    [form]
  );
  const pickLogo = useLogoPicker(setLogo);

  const saveBrand = form.handleSubmit((values) =>
    save.mutate(values, {
      onSuccess: () => {
        setBrandSheetVisible(false);
        showToast('Settings saved', 'success');
      }
    })
  );

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
        // Toast on Android + web; iOS feedback is the switch flip + spinner.
        onSuccess: () => showToast(`${nextTheme === 'dark' ? 'Dark' : 'Light'} theme on`),
        onError: () => form.setValue('theme', previousTheme, { shouldDirty: false }),
        onSettled: () => setThemeSaving(false)
      }
    );
  };

  const profileGaps = [!phone ? 'phone' : null, !businessEmail ? 'email' : null].filter(Boolean);

  return (
    <Screen title="Settings" contentStyle={styles.screenContent}>
      {/* Identity card, not a hero banner: same card surface, border and shadow as the Dashboard cards. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Edit business brand and logo"
        onPress={() => setBrandSheetVisible(true)}
        style={({ pressed }) => [
          styles.profileCard,
          shadows.card,
          { backgroundColor: colors.card, borderColor: cardBorder(isDark, colors), opacity: pressed ? 0.95 : 1 }
        ]}
      >
        <View style={[styles.profileLogo, { backgroundColor: alpha(colors.primary, isDark ? 0.2 : 0.1), borderColor: cardBorder(isDark, colors) }]}>
          <BrandMark size={48} imageUri={logoPreview} label={businessName} />
        </View>
        <View style={styles.profileContent}>
          <Text numberOfLines={1} style={[styles.profileName, { color: theme.colors.onSurface }]}>{businessName || 'Billji Business'}</Text>
          <Text numberOfLines={1} style={[styles.profileEmail, { color: theme.colors.onSurfaceVariant }]}>{businessEmail || user?.email}</Text>
          <View style={[styles.planPill, { backgroundColor: alpha(colors.primary, isDark ? 0.2 : 0.1) }]}>
            <ShieldCheck size={11} color={colors.primaryStrong} strokeWidth={2.4} />
            <Text style={[styles.planText, { color: colors.primaryStrong }]}>{planLabel}</Text>
          </View>
        </View>
        <View style={[styles.profileEdit, { backgroundColor: alpha(colors.primary, isDark ? 0.2 : 0.09) }]}>
          <Pencil size={16} color={colors.primaryStrong} strokeWidth={2.2} />
        </View>
      </Pressable>

      <SettingsGroup icon={Store} title="BUSINESS">
        <SettingsRow
          icon={Store}
          title="Business profile"
          subtitle={profileGaps.length ? `Add your ${profileGaps.join(' and ')}` : `${businessName || 'Name'} · ${phone}`}
          tone={colors.primary}
          onPress={() => navigation.navigate('BusinessProfile')}
        />
        <SettingsRow
          icon={Percent}
          title="GST & tax"
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
        <SettingsRow
          icon={FileText}
          title="Invoice template"
          subtitle={`Customise PDF · ${invoicePrefix || 'INV'}-0001`}
          tone={colors.categoryOrange}
          onPress={() => navigation.navigate('InvoiceTemplate')}
        />
      </SettingsGroup>

      {/* Hidden rather than disabled for a member with no billing permission at all (staff): a
          disabled row advertises a capability that will never exist for them. */}
      {can(PERMISSION.billingView) ? (
        <SettingsGroup icon={Crown} title="PLAN & BILLING">
          <SettingsRow
            icon={Crown}
            title="Plan & billing"
            subtitle={billingSubtitle}
            tone={colors.violet}
            onPress={() => navigation.navigate('Subscription')}
          />
        </SettingsGroup>
      ) : null}

      <SettingsGroup icon={Users} title="TEAM & WORKSPACE">
        {canViewTeam ? (
          <SettingsRow
            icon={Users}
            title="Team members"
            subtitle="Invite and manage your team"
            tone={colors.primary}
            onPress={() => navigation.navigate('Team')}
          />
        ) : null}
        {canViewRoles ? (
          <SettingsRow
            icon={ShieldCheck}
            title="Roles & permissions"
            subtitle="Control what each role can access"
            tone={colors.violet}
            onPress={() => navigation.navigate('Roles')}
          />
        ) : null}
        <SettingsRow
          icon={ArrowLeftRight}
          title="Switch business"
          subtitle="Change your active workspace"
          tone={colors.categoryBlue}
          onPress={() => setWorkspaceSheetVisible(true)}
        />
        <SettingsRow
          icon={Ticket}
          title="Join a business"
          subtitle="Enter an invite code from your email"
          tone={colors.accent}
          onPress={() => navigation.navigate('AcceptInvite')}
        />
      </SettingsGroup>

      {canViewLedger || canViewActivity || canExportData || canImportData ? (
        <SettingsGroup icon={BookOpen} title="RECORDS & DATA">
          {canViewLedger ? (
            <SettingsRow icon={BookOpen} title="Ledger" subtitle="Accounting entries" tone={colors.primary} onPress={() => navigation.navigate('Ledger')} />
          ) : null}
          {canViewActivity ? (
            <SettingsRow icon={History} title="Activity log" subtitle="Recent account actions" tone={colors.categoryBlue} onPress={() => navigation.navigate('ActivityLog')} />
          ) : null}
          {canExportData ? (
            <SettingsRow icon={Download} title="Export my data" subtitle="Download everything as CSV and JSON" tone={colors.violet} onPress={() => navigation.navigate('DataExport')} />
          ) : null}
          {canImportData ? (
            <SettingsRow icon={Upload} title="Import data" subtitle="Bring customers and products from a CSV" tone={colors.accent} onPress={() => navigation.navigate('DataImport')} />
          ) : null}
        </SettingsGroup>
      ) : null}

      <SettingsGroup icon={RefreshCw} title="NOTIFICATIONS & SYNC">
        <SettingsRow
          icon={Bell}
          title="Notifications"
          subtitle="Choose which alerts you see"
          tone={colors.violet}
          onPress={() => navigation.navigate('NotificationSettings')}
        />
        <SettingsRow
          icon={RefreshCw}
          title="Sync & storage"
          subtitle="Offline sync, Wi-Fi only, cached data"
          tone={colors.primary}
          onPress={() => navigation.navigate('SyncSettings')}
          trailing={<PendingBadge />}
        />
        <SettingsRow
          icon={CloudAlert}
          title="Sync issues"
          subtitle={failed > 0 ? `${failed} change${failed === 1 ? '' : 's'} need attention` : 'Conflicts and failed syncs'}
          tone={failed > 0 ? colors.destructive : colors.warning}
          onPress={() => navigation.navigate('SyncIssues')}
        />
      </SettingsGroup>

      <SettingsGroup icon={KeyRound} title="SECURITY">
        <SettingsRow
          icon={KeyRound}
          title="Security & sessions"
          subtitle="See where you're signed in"
          tone={colors.warning}
          onPress={() => setSessionsSheetVisible(true)}
        />
        <SettingsRow
          icon={ShieldCheck}
          title="Two-factor authentication"
          subtitle="Add a second step at login"
          tone={colors.accent}
          onPress={() => navigation.navigate('TwoFactorSetup')}
        />
      </SettingsGroup>

      <SettingsGroup icon={MoonStar} title="PREFERENCES">
        <SettingsRow
          icon={MoonStar}
          title="Appearance"
          subtitle={`${selectedTheme === 'dark' ? 'Dark' : 'Light'} theme`}
          tone={colors.categoryPurple}
          trailing={
            <View style={styles.switchTrailing}>
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
        <SettingsRow
          icon={ChartColumn}
          title="Usage analytics"
          subtitle="Share anonymous usage to improve Billji"
          tone={colors.accent}
          trailing={<Switch value={analyticsOn} onValueChange={toggleAnalytics} color={theme.colors.primary} />}
        />
      </SettingsGroup>

      <SettingsGroup icon={Compass} title="HELP">
        <SettingsRow
          icon={Compass}
          title="Take the app tour again"
          subtitle="Quick walkthrough of Home, Invoices, and Customers"
          tone={colors.primary}
          onPress={() => onboarding?.replayOrientation()}
        />
      </SettingsGroup>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Log out of this device"
        onPress={() => void requestSignOut()}
        style={({ pressed }) => [
          styles.logoutButton,
          {
            backgroundColor: alpha(colors.destructive, isDark ? (pressed ? 0.24 : 0.16) : pressed ? 0.12 : 0.07),
            borderColor: alpha(colors.destructive, isDark ? 0.32 : 0.18)
          }
        ]}
      >
        <LogOut size={17} color={colors.destructive} strokeWidth={2.2} />
        <Text style={[styles.logoutText, { color: colors.destructive }]}>Log out</Text>
      </Pressable>

      <Text style={[styles.versionText, { color: theme.colors.onSurfaceVariant }]}>Billji mobile v1.0.0</Text>

      <ConfirmDialog
        visible={confirmLogout}
        title={pendingOnLogout > 0 ? 'Unsynced changes on this device' : 'Log out?'}
        message={
          pendingOnLogout > 0
            ? `${pendingOnLogout} change${pendingOnLogout === 1 ? '' : 's'} have not synced yet. Logging out discards the offline copy of this business on this phone. Sync first if you need to keep them.`
            : 'This clears offline data for this business on this phone so the next account cannot see it.'
        }
        confirmLabel={pendingOnLogout > 0 ? 'Discard and log out' : 'Log out'}
        onCancel={() => setConfirmLogout(false)}
        onConfirm={() => void signOut()}
      />

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
  group: { marginBottom: spacing.section },
  groupCard: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  groupLabel: { ...fontStyles.semiBold, fontSize: 10.5, letterSpacing: 0.9, textTransform: 'uppercase' },
  groupLabelRow: { alignItems: 'center', flexDirection: 'row', gap: 6, marginBottom: 10, marginLeft: 4 },
  logoutButton: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 52
  },
  logoutText: { ...fontStyles.bold, fontSize: 14, letterSpacing: -0.2 },
  planPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 4,
    marginTop: 7,
    paddingHorizontal: 9,
    paddingVertical: 3
  },
  planText: { ...fontStyles.bold, fontSize: 10.5, letterSpacing: 0.1 },
  profileCard: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    marginBottom: spacing.section,
    padding: 16
  },
  profileContent: { flex: 1, minWidth: 0 },
  profileEdit: { alignItems: 'center', borderRadius: 999, height: 38, justifyContent: 'center', width: 38 },
  profileEmail: { ...fontStyles.medium, fontSize: 12, marginTop: 2 },
  profileLogo: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    height: 56,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 56
  },
  profileName: { ...fontStyles.bold, fontSize: 18, letterSpacing: -0.5, lineHeight: 24 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 66, paddingHorizontal: 14, paddingVertical: 11 },
  rowDivider: { height: StyleSheet.hairlineWidth, marginLeft: 62 },
  rowIcon: { alignItems: 'center', borderRadius: 11, height: 36, justifyContent: 'center', width: 36 },
  rowSubtitle: { ...fontStyles.medium, fontSize: 11.5, lineHeight: 16, marginTop: 2 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { ...fontStyles.bold, fontSize: 14, letterSpacing: -0.2 },
  screenContent: { paddingTop: 8 },
  switchTrailing: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  versionText: { ...fontStyles.medium, fontSize: 11.5, marginBottom: 8, marginTop: 16, textAlign: 'center' }
});
