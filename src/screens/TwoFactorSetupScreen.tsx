import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Button, Text, TextInput, useTheme } from 'react-native-paper';
import QRCode from 'react-native-qrcode-svg';
import { twoFactorApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { AppCard } from '@/components/AppCard';
import { useAppDialog } from '@/components/AppDialog';
import { useAppToast } from '@/components/AppToast';
import { Screen } from '@/components/Screen';
import { queryKeys } from '@/shared/query/queryKeys';
import { clearTrustedDeviceToken } from '@/store/trustedDevice';
import { TwoFactorMethod } from '@/types';
import { alpha, appColors, fontStyles, radii, spacing, typeScale } from '@/theme/theme';

type Stage = 'home' | 'totp' | 'email' | 'backup' | 'confirm';
type ConfirmAction = 'disable' | 'regenerate';

const METHOD_LABEL: Record<TwoFactorMethod, string> = {
  none: 'Off',
  totp: 'Authenticator app',
  email: 'Email codes'
};

export function TwoFactorSetupScreen() {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const { showDialog } = useAppDialog();
  const { showToast } = useAppToast();
  const queryClient = useQueryClient();

  const statusQuery = useQuery({ queryKey: queryKeys.auth.twoFactor, queryFn: twoFactorApi.status });
  const status = statusQuery.data;
  const method = status?.method ?? 'none';

  const [view, setView] = useState<Stage>('home');
  const [totp, setTotp] = useState<{ otpauthUrl: string; secret: string } | null>(null);
  const [emailHint, setEmailHint] = useState<string | undefined>();
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  const refreshStatus = () => queryClient.invalidateQueries({ queryKey: queryKeys.auth.twoFactor });
  const goHome = () => { setView('home'); setCode(''); setConfirmAction(null); };
  const fail = (fallback: string) => (error: unknown) => showDialog({ title: 'Something went wrong', message: apiErrorMessage(error, fallback), tone: 'error' });

  // --- enrollment ---
  const startTotp = useMutation({
    mutationFn: twoFactorApi.totpSetup,
    onSuccess: (res) => { setTotp({ otpauthUrl: res.otpauthUrl || '', secret: res.secret || '' }); setCode(''); setView('totp'); },
    onError: fail('Could not start setup')
  });
  const enableTotp = useMutation({
    mutationFn: () => twoFactorApi.totpEnable(code.trim()),
    onSuccess: (res) => { setBackupCodes(res.backupCodes); setView('backup'); refreshStatus(); },
    onError: fail('That code is incorrect or expired')
  });
  const startEmail = useMutation({
    mutationFn: twoFactorApi.emailSetup,
    onSuccess: (res) => { setEmailHint(res.email); setCode(__DEV__ && res.devCode ? res.devCode : ''); setView('email'); },
    onError: fail('Could not send the code')
  });
  const enableEmail = useMutation({
    mutationFn: () => twoFactorApi.emailEnable(code.trim()),
    onSuccess: (res) => { setBackupCodes(res.backupCodes); setView('backup'); refreshStatus(); },
    onError: fail('That code is incorrect or expired')
  });

  // --- management (disable / regenerate) ---
  const beginConfirm = useMutation({
    mutationFn: async (action: ConfirmAction) => {
      // Email users need a code delivered before they can confirm; TOTP users
      // just read the current code from their app.
      if (method === 'email') {
        const res = await twoFactorApi.sendManageCode();
        return { action, email: res.email, devCode: res.devCode };
      }
      return { action, email: undefined as string | undefined, devCode: undefined as string | undefined };
    },
    onSuccess: ({ action, email, devCode }) => {
      setConfirmAction(action);
      setEmailHint(email);
      setCode(__DEV__ && devCode ? devCode : '');
      setView('confirm');
    },
    onError: fail('Could not start this action')
  });
  const submitConfirm = useMutation({
    mutationFn: async () => {
      if (confirmAction === 'disable') { await twoFactorApi.disable(code.trim()); return 'disable' as const; }
      const res = await twoFactorApi.regenerateBackupCodes(code.trim());
      return { kind: 'regenerate' as const, backupCodes: res.backupCodes };
    },
    onSuccess: async (result) => {
      refreshStatus();
      if (result === 'disable') {
        await clearTrustedDeviceToken();
        goHome();
        showToast('Two-factor turned off', 'success');
      } else {
        setBackupCodes(result.backupCodes);
        setCode('');
        setConfirmAction(null);
        setView('backup');
      }
    },
    onError: fail('That code is incorrect or expired')
  });

  if (statusQuery.isLoading) {
    return (
      <Screen title="Two-factor authentication" showNotifications={false}>
        <View style={styles.center}><ActivityIndicator /></View>
      </Screen>
    );
  }

  const codeField = (label: string, keyboard: 'number-pad' | 'default' = 'number-pad') => (
    <TextInput
      mode="outlined"
      label={label}
      value={code}
      onChangeText={setCode}
      keyboardType={keyboard}
      autoCapitalize="none"
      maxLength={keyboard === 'number-pad' ? 6 : 11}
      style={styles.input}
      outlineColor={theme.colors.outlineVariant}
      activeOutlineColor={theme.colors.primary}
      left={<TextInput.Icon icon="shield-key-outline" />}
    />
  );

  return (
    <Screen title="Two-factor authentication" showNotifications={false}>
      {view === 'home' ? (
        method === 'none' ? (
          <>
            <Text style={[styles.lead, { color: theme.colors.onSurfaceVariant }]}>
              Add a second step at login so a stolen password isn’t enough to get into your account. Choose one method.
            </Text>
            <ChoiceCard
              icon="cellphone-key"
              title="Authenticator app"
              subtitle="Use Google Authenticator, Authy or similar. Works offline. Recommended."
              tone={colors.primary}
              loading={startTotp.isPending}
              onPress={() => startTotp.mutate()}
            />
            <ChoiceCard
              icon="email-lock-outline"
              title="Email codes"
              subtitle="Get a one-time code by email each time you sign in."
              tone={colors.violet}
              loading={startEmail.isPending}
              onPress={() => startEmail.mutate()}
            />
          </>
        ) : (
          <>
            <AppCard style={styles.card}>
              <View style={styles.statusRow}>
                <View style={[styles.statusIcon, { backgroundColor: alpha(colors.accent, isDark ? 0.22 : 0.12) }]}>
                  <MaterialCommunityIcons name="shield-check" size={22} color={colors.accent} />
                </View>
                <View style={styles.statusCopy}>
                  <Text style={[styles.statusTitle, { color: theme.colors.onSurface }]}>Two-factor is on</Text>
                  <Text style={[styles.statusSub, { color: theme.colors.onSurfaceVariant }]}>
                    Method: {METHOD_LABEL[method]} · {status?.backupCodesRemaining ?? 0} backup codes left
                  </Text>
                </View>
              </View>
            </AppCard>
            <Button
              mode="outlined"
              icon="key-change"
              loading={beginConfirm.isPending && beginConfirm.variables === 'regenerate'}
              onPress={() => beginConfirm.mutate('regenerate')}
              style={styles.actionBtn}
              contentStyle={styles.actionBtnContent}
            >
              Regenerate backup codes
            </Button>
            <Button
              mode="contained"
              buttonColor={theme.colors.error}
              icon="shield-off-outline"
              loading={beginConfirm.isPending && beginConfirm.variables === 'disable'}
              onPress={() => beginConfirm.mutate('disable')}
              style={styles.actionBtn}
              contentStyle={styles.actionBtnContent}
            >
              Turn off two-factor
            </Button>
          </>
        )
      ) : null}

      {view === 'totp' ? (
        <AppCard style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Scan this QR code</Text>
          <Text style={[styles.sectionSub, { color: theme.colors.onSurfaceVariant }]}>
            Open your authenticator app, add an account, and scan the code below. Then enter the 6-digit code it shows.
          </Text>
          <View style={styles.qrWrap}>
            {totp?.otpauthUrl ? <QRCode value={totp.otpauthUrl} size={196} backgroundColor="#FFFFFF" /> : null}
          </View>
          <Text style={[styles.manualLabel, { color: theme.colors.onSurfaceVariant }]}>Can’t scan? Enter this key manually:</Text>
          <Text selectable style={[styles.secret, { color: theme.colors.onSurface, backgroundColor: isDark ? colors.surface : colors.card, borderColor: theme.colors.outlineVariant }]}>
            {totp?.secret}
          </Text>
          {codeField('6-digit code')}
          <Button mode="contained" icon="check" loading={enableTotp.isPending} disabled={code.trim().length < 6} onPress={() => enableTotp.mutate()} style={styles.actionBtn} contentStyle={styles.actionBtnContent}>
            Turn on two-factor
          </Button>
          <Button mode="text" onPress={goHome} compact>Cancel</Button>
        </AppCard>
      ) : null}

      {view === 'email' ? (
        <AppCard style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Check your email</Text>
          <Text style={[styles.sectionSub, { color: theme.colors.onSurfaceVariant }]}>
            We sent a 6-digit code to {emailHint || 'your email'}. Enter it below to turn on email two-factor.
          </Text>
          {codeField('6-digit code')}
          <Button mode="contained" icon="check" loading={enableEmail.isPending} disabled={code.trim().length < 6} onPress={() => enableEmail.mutate()} style={styles.actionBtn} contentStyle={styles.actionBtnContent}>
            Turn on two-factor
          </Button>
          <Button mode="text" compact loading={startEmail.isPending} onPress={() => startEmail.mutate()}>Resend code</Button>
          <Button mode="text" onPress={goHome} compact>Cancel</Button>
        </AppCard>
      ) : null}

      {view === 'confirm' ? (
        <AppCard style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
            {confirmAction === 'disable' ? 'Confirm turning off two-factor' : 'Confirm new backup codes'}
          </Text>
          <Text style={[styles.sectionSub, { color: theme.colors.onSurfaceVariant }]}>
            {method === 'email'
              ? `Enter the 6-digit code we sent to ${emailHint || 'your email'}.`
              : 'Enter the current 6-digit code from your authenticator app (or a backup code).'}
          </Text>
          {codeField(method === 'email' ? '6-digit code' : 'Code', 'default')}
          <Button
            mode="contained"
            buttonColor={confirmAction === 'disable' ? theme.colors.error : theme.colors.primary}
            icon={confirmAction === 'disable' ? 'shield-off-outline' : 'key-change'}
            loading={submitConfirm.isPending}
            disabled={code.trim().length < 6}
            onPress={() => submitConfirm.mutate()}
            style={styles.actionBtn}
            contentStyle={styles.actionBtnContent}
          >
            {confirmAction === 'disable' ? 'Turn off two-factor' : 'Regenerate codes'}
          </Button>
          <Button mode="text" onPress={goHome} compact>Cancel</Button>
        </AppCard>
      ) : null}

      {view === 'backup' ? (
        <AppCard style={styles.card}>
          <View style={styles.statusRow}>
            <View style={[styles.statusIcon, { backgroundColor: alpha(colors.warning, isDark ? 0.22 : 0.12) }]}>
              <MaterialCommunityIcons name="content-save-alert-outline" size={22} color={colors.warning} />
            </View>
            <View style={styles.statusCopy}>
              <Text style={[styles.statusTitle, { color: theme.colors.onSurface }]}>Save your backup codes</Text>
              <Text style={[styles.statusSub, { color: theme.colors.onSurfaceVariant }]}>
                Each code works once if you lose access to your {method === 'email' ? 'email' : 'authenticator'}. Store them somewhere safe — they won’t be shown again.
              </Text>
            </View>
          </View>
          <View style={[styles.codeGrid, { borderColor: theme.colors.outlineVariant, backgroundColor: isDark ? colors.surface : colors.card }]}>
            {backupCodes.map((c) => (
              <Text key={c} selectable style={[styles.backupCode, { color: theme.colors.onSurface }]}>{c}</Text>
            ))}
          </View>
          <Button mode="contained" icon="check" onPress={goHome} style={styles.actionBtn} contentStyle={styles.actionBtnContent}>
            I’ve saved them
          </Button>
        </AppCard>
      ) : null}
    </Screen>
  );
}

function ChoiceCard({ icon, title, subtitle, tone, loading, onPress }: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; subtitle: string; tone: string; loading?: boolean; onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <AppCard style={styles.choiceCard} onPress={loading ? undefined : onPress}>
      <View style={styles.choiceRow}>
        <View style={[styles.statusIcon, { backgroundColor: alpha(tone, theme.dark ? 0.22 : 0.12) }]}>
          <MaterialCommunityIcons name={icon} size={22} color={tone} />
        </View>
        <View style={styles.statusCopy}>
          <Text style={[styles.statusTitle, { color: theme.colors.onSurface }]}>{title}</Text>
          <Text style={[styles.statusSub, { color: theme.colors.onSurfaceVariant }]}>{subtitle}</Text>
        </View>
        {loading ? <ActivityIndicator size={18} /> : <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.onSurfaceVariant} />}
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64 },
  lead: { ...typeScale.bodyPrimary, marginBottom: spacing.md },
  card: { borderRadius: radii.xl, marginBottom: spacing.md, padding: spacing.lg },
  choiceCard: { borderRadius: radii.xl, marginBottom: spacing.md, padding: spacing.md },
  choiceRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  statusRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  statusIcon: { alignItems: 'center', borderRadius: radii.full, height: 44, justifyContent: 'center', width: 44 },
  statusCopy: { flex: 1, minWidth: 0 },
  statusTitle: { ...fontStyles.bold, fontSize: 16, marginBottom: 2 },
  statusSub: { ...typeScale.caption, lineHeight: 18 },
  sectionTitle: { ...fontStyles.bold, fontSize: 17, marginBottom: 4 },
  sectionSub: { ...typeScale.bodyPrimary, marginBottom: spacing.md },
  qrWrap: { alignItems: 'center', alignSelf: 'center', backgroundColor: '#FFFFFF', borderRadius: radii.lg, marginBottom: spacing.md, padding: 16 },
  manualLabel: { ...typeScale.caption, marginBottom: 6 },
  secret: { ...fontStyles.semiBold, borderRadius: radii.input, borderWidth: StyleSheet.hairlineWidth, fontSize: 15, letterSpacing: 2, marginBottom: spacing.md, paddingHorizontal: 14, paddingVertical: 12, textAlign: 'center' },
  input: { marginBottom: spacing.md },
  actionBtn: { borderRadius: radii.input, marginBottom: spacing.xs },
  actionBtnContent: { height: 50 },
  codeGrid: { borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', marginBottom: spacing.md, padding: spacing.md },
  backupCode: { ...fontStyles.semiBold, fontSize: 15, letterSpacing: 1, width: '46%' }
});
