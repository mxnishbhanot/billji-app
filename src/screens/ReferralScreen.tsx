import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, Share, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Text, TextInput, useTheme } from 'react-native-paper';
import { apiErrorMessage } from '@/api/client';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { StatusPill } from '@/components/StatusPill';
import { useAppDialog } from '@/components/AppDialog';
import { useAppToast } from '@/components/AppToast';
import {
  useApplyReferral,
  useMyReferral,
  useMyReferredUsers,
  useReferralEligibility,
  useReferralReconciler,
  useReferralRewards
} from '@/features/referrals/hooks/useReferral';
import { alpha, appColors, fontStyles, radii, spacing, typeScale } from '@/theme/theme';
import type { ReferralReward, ReferredUser } from '@/types';

const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

// The three states a referral can be in, in the reader's words rather than the schema's.
const REFERRAL_STATUS = {
  pending: { label: 'Joined', tone: 'pending' },
  converted: { label: 'Subscribed', tone: 'paid' },
  void: { label: 'Cancelled', tone: 'cancelled' }
} as const;

const REWARD_RULE_COPY: Record<string, string> = {
  referral_signup: 'Welcome bonus',
  referral_conversion: 'Someone you referred subscribed'
};

/**
 * Refer & earn, in full.
 *
 * Everything on this screen is read from the server and nothing is computed here — not the code,
 * not the counts, not whether the account may still enter someone else's code. The one rule worth
 * restating: a referrer is shown that someone joined, never who, so the names arrive already
 * masked and this screen must not try to improve on them.
 */
export function ReferralScreen() {
  const theme = useTheme();
  const colors = useMemo(() => appColors(theme.dark), [theme.dark]);
  const { showToast } = useAppToast();
  const { showDialog } = useAppDialog();

  // Delivers a code typed offline, or one whose signup attach never landed.
  useReferralReconciler();

  const mine = useMyReferral();
  const eligibility = useReferralEligibility();
  const referred = useMyReferredUsers();
  const rewards = useReferralRewards();
  const apply = useApplyReferral();
  const [code, setCode] = useState('');

  const refreshing = mine.isFetching || referred.isFetching || rewards.isFetching;
  const refresh = () => {
    void mine.refetch();
    void referred.refetch();
    void rewards.refetch();
    void eligibility.refetch();
  };

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
      // The message is the server's: it knows whether the code was wrong, already used, or no
      // longer possible because this account has paid before.
      onError: (error) => showDialog({ title: 'Could not apply that code', message: apiErrorMessage(error), tone: 'error' })
    });
  };

  const cardBorder = alpha(theme.colors.onSurface, theme.dark ? 0.14 : 0.08);
  const card = { backgroundColor: colors.card, borderColor: cardBorder };
  const stats = mine.data?.stats;

  return (
    <Screen
      title="Refer & earn"
      scrollViewProps={{ refreshControl: <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.primary} /> }}
    >
      <View style={[styles.hero, { backgroundColor: alpha(colors.primary, theme.dark ? 0.12 : 0.08), borderColor: alpha(colors.primary, 0.24) }]}>
        <Text style={[styles.heroTitle, { color: colors.foreground }]}>Give a month, get a month</Text>
        <Text style={[styles.heroBody, { color: colors.mutedForeground }]}>
          They get 1 month of BillJi Pro free. You get 1 month free the first time they subscribe.
        </Text>

        {mine.isLoading ? (
          <ActivityIndicator style={styles.loader} />
        ) : mine.data ? (
          <>
            {/* Tapping the code opens the same share sheet as the button — no clipboard dependency
                for what the share sheet already does, and sharing is what a referrer wants. */}
            <Pressable
              onPress={share}
              style={[styles.codeBox, { borderColor: colors.primary, backgroundColor: colors.card }]}
            >
              <Text style={[styles.code, { color: colors.primary }]}>{mine.data.code}</Text>
              <Feather name="share-2" size={16} color={colors.primary} />
            </Pressable>

            <Pressable
              onPress={share}
              style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1 }]}
            >
              <Feather name="gift" size={15} color={theme.colors.onPrimary} />
              <Text style={[styles.primaryLabel, { color: theme.colors.onPrimary }]}>Share my code</Text>
            </Pressable>
          </>
        ) : null}
      </View>

      {stats ? (
        <View style={styles.statRow}>
          {[
            { label: 'Joined', value: stats.totalReferrals },
            { label: 'Subscribed', value: stats.converted },
            { label: 'Free days', value: stats.freeDaysEarned }
          ].map((tile) => (
            <View key={tile.label} style={[styles.statTile, card]}>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{tile.value}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{tile.label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Shown only while the server still says this account is eligible. There is no time window,
          so eligibility is the only thing that can decide it. */}
      {eligibility.data?.eligible ? (
        <>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>HAVE A CODE?</Text>
          <View style={[styles.card, card]}>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>
              Enter a friend&apos;s code to start your free month of Pro.
            </Text>
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
              style={({ pressed }) => [styles.secondaryBtn, { borderColor: colors.primary, opacity: pressed ? 0.9 : 1 }]}
            >
              <Text style={[styles.secondaryLabel, { color: colors.primary }]}>
                {apply.isPending ? 'Applying…' : 'Apply code'}
              </Text>
            </Pressable>
          </View>
        </>
      ) : null}

      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>PEOPLE YOU REFERRED</Text>
      <View style={[styles.card, card]}>
        {referred.isLoading ? (
          <ActivityIndicator />
        ) : referred.data?.length ? (
          referred.data.map((row: ReferredUser, index) => (
            <View key={row.id} style={[styles.row, index > 0 && { borderTopColor: cardBorder, borderTopWidth: StyleSheet.hairlineWidth }]}>
              <View style={styles.rowCopy}>
                <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>{row.name}</Text>
                <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>
                  Joined {shortDate(row.joinedAt)}
                  {row.convertedAt ? ` · subscribed ${shortDate(row.convertedAt)}` : ''}
                </Text>
              </View>
              <StatusPill {...(REFERRAL_STATUS[row.status] ?? REFERRAL_STATUS.pending)} />
            </View>
          ))
        ) : (
          <EmptyState
            title="No one yet"
            message="Share your code with another business owner. You earn a free month the first time one of them subscribes."
          />
        )}
      </View>

      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>FREE TIME EARNED</Text>
      <View style={[styles.card, card]}>
        {rewards.isLoading ? (
          <ActivityIndicator />
        ) : rewards.data?.length ? (
          rewards.data.map((reward: ReferralReward, index) => (
            <View key={reward.id} style={[styles.row, index > 0 && { borderTopColor: cardBorder, borderTopWidth: StyleSheet.hairlineWidth }]}>
              <View style={styles.rowCopy}>
                <Text style={[styles.rowTitle, { color: colors.foreground }]}>
                  {REWARD_RULE_COPY[reward.rule] ?? reward.rule}
                </Text>
                <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>
                  {shortDate(reward.grantedAt)}
                  {reward.appliedPeriodEnd ? ` · plan now runs to ${shortDate(reward.appliedPeriodEnd)}` : ''}
                </Text>
              </View>
              <Text style={[styles.rewardDays, { color: reward.status === 'reversed' ? colors.mutedForeground : colors.primary }]}>
                {reward.status === 'reversed' ? '—' : `+${reward.days}d`}
              </Text>
            </View>
          ))
        ) : (
          <EmptyState
            title="Nothing earned yet"
            message="Free days land here the moment someone you referred starts paying."
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.sm,
    marginBottom: spacing.gridGap,
    padding: spacing.cardPadding
  },
  heroTitle: { ...fontStyles.bold, fontSize: 19, letterSpacing: -0.4 },
  heroBody: { ...fontStyles.regular, fontSize: 13, lineHeight: 19 },
  loader: { alignSelf: 'flex-start' },
  codeBox: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  code: { ...fontStyles.bold, fontSize: 22, letterSpacing: 3 },
  primaryBtn: {
    alignItems: 'center',
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 12
  },
  primaryLabel: { ...fontStyles.semiBold, fontSize: 14 },
  statRow: { flexDirection: 'row', gap: spacing.gap, marginBottom: spacing.gridGap },
  statTile: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    paddingVertical: spacing.sm
  },
  statValue: { ...fontStyles.bold, fontSize: 22 },
  statLabel: { ...typeScale.caption, marginTop: 2 },
  sectionLabel: { ...fontStyles.medium, fontSize: 11, letterSpacing: 0.6, marginBottom: 8, textTransform: 'uppercase' },
  card: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.gridGap,
    padding: spacing.cardPadding
  },
  body: { ...fontStyles.regular, fontSize: 13, lineHeight: 18, marginBottom: 8 },
  input: { backgroundColor: 'transparent', marginBottom: 8 },
  secondaryBtn: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, paddingVertical: 11 },
  secondaryLabel: { ...fontStyles.semiBold, fontSize: 14 },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, paddingVertical: 12 },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { ...fontStyles.semiBold, fontSize: 14 },
  rowMeta: { ...typeScale.caption, marginTop: 2 },
  rewardDays: { ...fontStyles.bold, fontSize: 15 }
});
