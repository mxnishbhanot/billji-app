import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Text, useTheme } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { featureLabel, formatPaise } from '@/constants/entitlements';
import { track } from '@/services/analytics';
import { alpha, appColors, fontStyles, radii } from '@/theme/theme';
import type { AppNavigation } from '@/navigation/types';
import type { RequiredPlan } from '@/types';

type Props = {
  visible: boolean;
  /** The blocked feature key, when the block was a feature. */
  feature?: string | null;
  /** The spent limit key, when the block was a quota. */
  metric?: string | null;
  limit?: number | null;
  currentPlan?: string | null;
  /** Plans the server named as granting this. Never a hardcoded "requires Pro". */
  requiredPlans?: RequiredPlan[];
  message?: string;
  onClose: () => void;
};

// The locked-feature flow: what is locked, what the cheapest plan that unlocks it costs, one button
// to the plans screen. Driven entirely by what the server said — `requiredPlans` is computed there
// by scanning plans, so an admin re-pricing a plan changes this copy with no app release.
export function UpgradeSheet({ visible, feature, metric, limit, currentPlan, requiredPlans = [], message, onClose }: Props) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<AppNavigation>();
  const [translateY] = useState(() => new Animated.Value(700));
  const [backdropOpacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: visible ? 0 : 700, duration: visible ? 280 : 220, easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: visible ? 1 : 0, duration: visible ? 220 : 180, useNativeDriver: true })
    ]).start();
  }, [visible, translateY, backdropOpacity]);

  useEffect(() => {
    if (visible) track('paywall_shown', { reason: feature ? 'feature' : 'limit', key: feature || metric || 'unknown' });
  }, [visible, feature, metric]);

  const cheapest = requiredPlans[0] ?? null;
  const monthly = cheapest?.prices?.find((price) => price.interval === 'month') || cheapest?.prices?.[0] || null;
  const title = feature ? `${featureLabel(feature)} is on a paid plan` : 'You have used your plan limit';
  const body =
    message ||
    (metric
      ? `Your ${currentPlan || 'current'} plan includes ${limit ?? 'a limited number of'} per month. Upgrade to keep going.`
      : 'Upgrade to unlock it. Everything you have already created stays exactly where it is.');

  const openPlans = () => {
    track('upgrade_started', { source: feature ? 'feature_lock' : 'limit_reached', key: feature || metric || 'unknown' });
    onClose();
    navigation.navigate('SettingsTab', { screen: 'Plans' });
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8, 9, 18, 0.55)', opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.1),
              paddingBottom: 16 + insets.bottom,
              transform: [{ translateY }]
            }
          ]}
        >
          <View style={styles.grabber}>
            <View style={[styles.grabberBar, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.18) }]} />
          </View>

          <View style={[styles.icon, { backgroundColor: alpha(colors.violet, isDark ? 0.24 : 0.12) }]}>
            <Feather name="lock" size={20} color={colors.violet} />
          </View>

          <Text style={[styles.title, { color: theme.colors.onSurface }]}>{title}</Text>
          <Text style={[styles.body, { color: theme.colors.onSurfaceVariant }]}>{body}</Text>

          {cheapest ? (
            <View style={[styles.planCard, { backgroundColor: alpha(colors.primary, isDark ? 0.16 : 0.07), borderColor: alpha(colors.primary, 0.25) }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.planName, { color: theme.colors.onSurface }]}>{cheapest.name}</Text>
                <Text style={[styles.planMeta, { color: theme.colors.onSurfaceVariant }]}>Unlocks this and everything below it</Text>
              </View>
              {monthly ? (
                <Text style={[styles.planPrice, { color: theme.colors.primary }]}>
                  {formatPaise(monthly.amount)}
                  <Text style={[styles.planPer, { color: theme.colors.onSurfaceVariant }]}>{monthly.interval === 'year' ? '/yr' : '/mo'}</Text>
                </Text>
              ) : null}
            </View>
          ) : null}

          <Pressable onPress={openPlans} style={({ pressed }) => [styles.primaryBtn, { backgroundColor: theme.colors.primary, opacity: pressed ? 0.9 : 1 }]}>
            <Text style={[styles.primaryLabel, { color: theme.colors.onPrimary }]}>See plans</Text>
          </Pressable>
          <Pressable onPress={onClose} style={styles.secondaryBtn}>
            <Text style={[styles.secondaryLabel, { color: theme.colors.onSurfaceVariant }]}>Not now</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20 },
  grabber: { alignItems: 'center', paddingTop: 8, paddingBottom: 12 },
  grabberBar: { width: 44, height: 4, borderRadius: radii.pill },
  icon: { width: 44, height: 44, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title: { ...fontStyles.bold, fontSize: 18, marginBottom: 6 },
  body: { ...fontStyles.regular, fontSize: 14, lineHeight: 20, marginBottom: 16 },
  planCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.md, padding: 14, marginBottom: 16 },
  planName: { ...fontStyles.semiBold, fontSize: 15 },
  planMeta: { ...fontStyles.regular, fontSize: 12, marginTop: 2 },
  planPrice: { ...fontStyles.bold, fontSize: 18 },
  planPer: { ...fontStyles.regular, fontSize: 12 },
  primaryBtn: { height: 48, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  primaryLabel: { ...fontStyles.semiBold, fontSize: 15 },
  secondaryBtn: { height: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryLabel: { ...fontStyles.medium, fontSize: 14 }
});
