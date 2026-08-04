import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Text, useTheme } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { featureLabel } from '@/constants/entitlements';
import { track } from '@/services/analytics';
import { alpha, appColors, fontStyles, radii } from '@/theme/theme';
import type { AppNavigation } from '@/navigation/types';
import { UpgradeSheet } from './UpgradeSheet';

type Props = {
  feature: string;
  /** What the screen would have shown, in one line. */
  description?: string;
};

// The locked affordance. Rendered as an early return by a gated screen, so the screen below it never
// runs a query the server would answer with 402.
//
// Client gating is UX only: the server re-checks every request, which is why a screen may safely
// show this from the persisted session with no network.
export function LockedFeatureBadge({ feature, description }: Props) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = useMemo(() => appColors(isDark), [isDark]);
  const navigation = useNavigation<AppNavigation>();
  const [sheetOpen, setSheetOpen] = useState(false);

  const open = () => {
    track('paywall_shown', { reason: 'screen', key: feature });
    setSheetOpen(true);
  };

  return (
    <View style={styles.wrap}>
      <View style={[styles.icon, { backgroundColor: alpha(colors.violet, isDark ? 0.24 : 0.12) }]}>
        <Feather name="lock" size={22} color={colors.violet} />
      </View>
      <Text style={[styles.title, { color: theme.colors.onSurface }]}>{featureLabel(feature)} is on a paid plan</Text>
      <Text style={[styles.body, { color: theme.colors.onSurfaceVariant }]}>
        {description || 'Upgrade to unlock it. Nothing you have already created is affected.'}
      </Text>

      <Pressable onPress={open} style={({ pressed }) => [styles.btn, { backgroundColor: theme.colors.primary, opacity: pressed ? 0.9 : 1 }]}>
        <Text style={[styles.btnLabel, { color: theme.colors.onPrimary }]}>See what you get</Text>
      </Pressable>
      <Pressable onPress={() => navigation.navigate('SettingsTab', { screen: 'Subscription' })} style={styles.linkBtn}>
        <Text style={[styles.linkLabel, { color: theme.colors.onSurfaceVariant }]}>Your current plan</Text>
      </Pressable>

      <UpgradeSheet visible={sheetOpen} feature={feature} onClose={() => setSheetOpen(false)} />
    </View>
  );
}

/** Inline lock chip, for a row inside an otherwise-available screen. */
export function LockedChip({ label = 'Paid plan' }: { label?: string }) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);

  return (
    <View style={[styles.chip, { backgroundColor: alpha(colors.violet, isDark ? 0.22 : 0.1) }]}>
      <Feather name="lock" size={11} color={colors.violet} />
      <Text style={[styles.chipLabel, { color: colors.violet }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 24 },
  icon: { width: 52, height: 52, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { ...fontStyles.bold, fontSize: 17, textAlign: 'center' },
  body: { ...fontStyles.regular, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8, marginBottom: 20 },
  btn: { height: 46, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  btnLabel: { ...fontStyles.semiBold, fontSize: 15 },
  linkBtn: { height: 40, alignItems: 'center', justifyContent: 'center' },
  linkLabel: { ...fontStyles.medium, fontSize: 13 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill },
  chipLabel: { ...fontStyles.semiBold, fontSize: 11 }
});
