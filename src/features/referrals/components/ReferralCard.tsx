import { useMemo, useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Text, TextInput, useTheme } from 'react-native-paper';
import { apiErrorMessage } from '@/api/client';
import { useAppDialog } from '@/components/AppDialog';
import { useAppToast } from '@/components/AppToast';
import { alpha, appColors, fontStyles, radii } from '@/theme/theme';
import {
  useApplyReferral,
  useMyReferral,
  useReferralEligibility,
  useReferralReconciler
} from '../hooks/useReferral';

/**
 * Refer & earn, on the subscription screen.
 *
 * Two halves, and which one is shown is the SERVER's answer, never a local guess: everyone gets their
 * own code to share, and the "enter a code" box appears only while this account is still eligible —
 * there is no time window, so eligibility is the only thing that can decide it.
 *
 * Applying offline is allowed and queues an operation. What is never allowed is showing Pro because
 * a code was typed: the plan changes when the server says it did, through the same subscription read
 * every other plan change uses.
 */
export function ReferralCard() {
  const theme = useTheme();
  const colors = useMemo(() => appColors(theme.dark), [theme.dark]);
  const { showToast } = useAppToast();
  const { showDialog } = useAppDialog();

  // Delivers a code that was typed offline, or one whose signup attach failed.
  useReferralReconciler();

  const mine = useMyReferral();
  const eligibility = useReferralEligibility();
  const apply = useApplyReferral();
  const [code, setCode] = useState('');

  const share = async () => {
    const myCode = mine.data?.code;
    if (!myCode) return;
    await Share.share({
      message: `Bill your customers in seconds with BillJi. Use my code ${myCode} when you sign up and get 1 month of BillJi Pro free.`
    }).catch(() => undefined);
  };

  const submit = () => {
    const entered = code.trim().toUpperCase();
    if (entered.length < 6) {
      showDialog({ title: 'Enter a referral code', message: 'A BillJi referral code is at least 6 characters.', tone: 'error' });
      return;
    }

    apply.mutate(entered, {
      onSuccess: (result) => {
        setCode('');
        showToast(
          result.queued
            ? "Code saved. We'll apply it as soon as you're back online."
            : 'Referral applied. 1 month of BillJi Pro is on us.'
        );
      },
      // The message is the server's: it knows whether the code was wrong, already used, or no longer
      // possible because this account has paid before.
      onError: (error) => showDialog({ title: 'Could not apply that code', message: apiErrorMessage(error), tone: 'error' })
    });
  };

  const cardBorder = alpha(theme.colors.onSurface, theme.dark ? 0.14 : 0.08);
  const stats = mine.data?.stats;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: cardBorder }]}>
      <View style={styles.row}>
        <Feather name="gift" size={16} color={theme.colors.primary} />
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>Refer & earn</Text>
      </View>
      <Text style={[styles.body, { color: theme.colors.onSurfaceVariant }]}>
        Share your code. They get 1 month of Pro free, and you get 1 month free when they first subscribe.
      </Text>

      {mine.isLoading ? (
        <ActivityIndicator style={styles.loader} />
      ) : mine.data ? (
        <>
          {/* Tapping the code opens the same share sheet as the button — no clipboard dependency for
              what the share sheet already does, and sharing is what a referrer actually wants. */}
          <Pressable onPress={share} style={[styles.codeBox, { borderColor: theme.colors.primary, backgroundColor: alpha(theme.colors.primary, 0.08) }]}>
            <Text style={[styles.code, { color: theme.colors.primary }]}>{mine.data.code}</Text>
            <Feather name="share-2" size={14} color={theme.colors.primary} />
          </Pressable>

          <Pressable onPress={share} style={({ pressed }) => [styles.shareBtn, { backgroundColor: theme.colors.primary, opacity: pressed ? 0.9 : 1 }]}>
            <Text style={[styles.shareLabel, { color: theme.colors.onPrimary }]}>Share my code</Text>
          </Pressable>

          {stats ? (
            <Text style={[styles.stats, { color: theme.colors.onSurfaceVariant }]}>
              {stats.totalReferrals} joined · {stats.converted} subscribed · {stats.freeDaysEarned} free days earned
            </Text>
          ) : null}
        </>
      ) : null}

      {eligibility.data?.eligible ? (
        <View style={styles.applyBlock}>
          <Text style={[styles.applyLabel, { color: theme.colors.onSurfaceVariant }]}>Have someone&apos;s code?</Text>
          <TextInput
            mode="outlined"
            dense
            value={code}
            onChangeText={(value) => setCode(value.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
            placeholder="BILLJI8X"
            style={styles.input}
          />
          <Pressable
            onPress={submit}
            disabled={apply.isPending}
            style={({ pressed }) => [styles.secondaryBtn, { borderColor: theme.colors.primary, opacity: pressed ? 0.9 : 1 }]}
          >
            <Text style={[styles.secondaryLabel, { color: theme.colors.primary }]}>
              {apply.isPending ? 'Applying…' : 'Apply code'}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 10, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { ...fontStyles.semiBold, fontSize: 15 },
  body: { ...fontStyles.regular, fontSize: 13, lineHeight: 18 },
  loader: { alignSelf: 'flex-start' },
  codeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: 10,
    paddingHorizontal: 14
  },
  code: { ...fontStyles.semiBold, fontSize: 18, letterSpacing: 2 },
  shareBtn: { borderRadius: radii.md, paddingVertical: 11, alignItems: 'center' },
  shareLabel: { ...fontStyles.semiBold, fontSize: 14 },
  stats: { ...fontStyles.regular, fontSize: 12 },
  applyBlock: { gap: 8, marginTop: 4 },
  applyLabel: { ...fontStyles.medium, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: 'transparent' },
  secondaryBtn: { borderRadius: radii.md, borderWidth: 1, paddingVertical: 10, alignItems: 'center' },
  secondaryLabel: { ...fontStyles.semiBold, fontSize: 14 }
});
