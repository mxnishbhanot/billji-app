import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { alpha, appColors, fontStyles, radii } from '@/theme/theme';
import type { AppNavigation } from '@/navigation/types';
import { useMyReferral } from '../hooks/useReferral';

/**
 * The referral teaser on the subscription screen: the code, what it is worth, and the way in.
 *
 * Deliberately not a second copy of the referral screen. Sharing, applying someone else's code,
 * who has joined and what has been earned all live on ReferralScreen — duplicating the apply flow
 * here would mean two places that could disagree about what the server said.
 */
export function ReferralCard() {
  const theme = useTheme();
  const colors = useMemo(() => appColors(theme.dark), [theme.dark]);
  const navigation = useNavigation<AppNavigation>();
  const mine = useMyReferral();

  const open = () => navigation.navigate('SettingsTab', { screen: 'Referrals' });
  const cardBorder = alpha(theme.colors.onSurface, theme.dark ? 0.14 : 0.08);

  return (
    <Pressable
      onPress={open}
      style={({ pressed }) => [styles.card, { backgroundColor: colors.card, borderColor: cardBorder, opacity: pressed ? 0.9 : 1 }]}
    >
      <View style={styles.row}>
        <Feather name="gift" size={16} color={colors.primary} />
        <Text style={[styles.title, { color: colors.foreground }]}>Refer & earn</Text>
        <View style={styles.spacer} />
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
      </View>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>
        They get 1 month of Pro free. You get 1 month free when they first subscribe.
      </Text>

      {mine.isLoading ? (
        <ActivityIndicator style={styles.loader} />
      ) : mine.data ? (
        <View style={styles.footer}>
          <View style={[styles.codeChip, { backgroundColor: alpha(colors.primary, 0.1), borderColor: alpha(colors.primary, 0.28) }]}>
            <Text style={[styles.code, { color: colors.primary }]}>{mine.data.code}</Text>
          </View>
          <Text style={[styles.stats, { color: colors.mutedForeground }]}>
            {mine.data.stats.totalReferrals} joined · {mine.data.stats.freeDaysEarned} free days
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, gap: 10, marginBottom: 12, padding: 16 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  spacer: { flex: 1 },
  title: { ...fontStyles.semiBold, fontSize: 15 },
  body: { ...fontStyles.regular, fontSize: 13, lineHeight: 18 },
  loader: { alignSelf: 'flex-start' },
  footer: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  codeChip: { borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 5 },
  code: { ...fontStyles.bold, fontSize: 14, letterSpacing: 2 },
  stats: { ...fontStyles.regular, fontSize: 12, flex: 1 }
});
