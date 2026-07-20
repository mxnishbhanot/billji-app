import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { AppNavigation } from '@/navigation/types';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import { useOnboardingOptional } from './OnboardingProvider';
import type { TaskIconName, TourDefinition } from './types';

type Props = { visible: boolean; onClose: () => void };

const GUIDE_ICONS: Record<string, TaskIconName> = {
  'orders-intro-v1': 'clipboard-text-outline',
  'team-intro-v1': 'account-group-outline',
  'template-intro-v1': 'palette-outline',
  'products-speed-v1': 'package-variant-closed'
};

/** Bring the screen that hosts the guide's anchor on screen before replaying it. */
function navigateForGuide(navigation: AppNavigation, guide: TourDefinition) {
  const nav = navigation as any;
  switch (guide.route) {
    case 'OrderList':
      nav.navigate('InvoicesTab', { screen: 'OrderList' });
      break;
    case 'Team':
      nav.navigate('Team');
      break;
    case 'InvoiceTemplate':
      nav.navigate('InvoiceTemplate');
      break;
    default:
      nav.navigate('DashboardTab', { screen: 'DashboardHome' });
  }
}

export function FeatureGuidesSheet({ visible, onClose }: Props) {
  const onboarding = useOnboardingOptional();
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<AppNavigation>();

  const [mounted, setMounted] = useState(visible);
  const translateY = useRef(new Animated.Value(560)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) setMounted(true);
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: visible ? 0 : 560,
        duration: visible ? 280 : 220,
        easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.timing(backdropOpacity, { toValue: visible ? 1 : 0, duration: visible ? 220 : 180, useNativeDriver: true })
    ]).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [visible, translateY, backdropOpacity]);

  if (!onboarding || !mounted) return null;

  const guides = onboarding.featureGuides;
  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.1);

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8, 9, 18, 0.55)', opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close feature guides" />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: colors.card, borderColor: cardBorder, paddingBottom: 12 + insets.bottom, transform: [{ translateY }] }
          ]}
        >
          <View style={styles.grabber}>
            <View style={[styles.grabberBar, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.18) }]} />
          </View>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: theme.colors.onSurface }]}>Feature guides</Text>
              <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>Replay a quick tip for any feature you can access</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={[styles.closeBtn, { backgroundColor: alpha(colors.primary, isDark ? 0.18 : 0.08) }]}>
              <Feather name="x" size={16} color={theme.colors.onSurface} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {guides.map((guide) => (
              <Pressable
                key={guide.id}
                onPress={() => {
                  onClose();
                  navigateForGuide(navigation, guide);
                  onboarding.replayFeatureGuide(guide.id);
                }}
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: isDark ? colors.surface : '#FFFFFF', borderColor: cardBorder, opacity: pressed ? 0.85 : 1 }
                ]}
              >
                <View style={[styles.rowIcon, { backgroundColor: alpha(colors.primary, isDark ? 0.18 : 0.08) }]}>
                  <MaterialCommunityIcons name={GUIDE_ICONS[guide.id] || 'lightbulb-on-outline'} size={18} color={colors.primary} />
                </View>
                <View style={styles.rowText}>
                  <Text numberOfLines={1} style={[styles.rowTitle, { color: theme.colors.onSurface }]}>{guide.title}</Text>
                  <Text numberOfLines={2} style={[styles.rowSub, { color: theme.colors.onSurfaceVariant }]}>{guide.description}</Text>
                </View>
                <Feather name="play-circle" size={20} color={colors.primary} />
              </Pressable>
            ))}
            {!guides.length ? (
              <Text style={[styles.empty, { color: theme.colors.onSurfaceVariant }]}>No guides available for your role.</Text>
            ) : null}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  closeBtn: { alignItems: 'center', borderRadius: radii.pill, height: 28, justifyContent: 'center', width: 28 },
  empty: { ...typeScale.caption, fontSize: 13, paddingVertical: 12, textAlign: 'center' },
  fill: { flex: 1, justifyContent: 'flex-end' },
  grabber: { alignItems: 'center', paddingTop: 8 },
  grabberBar: { borderRadius: radii.pill, height: 4, width: 38 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingHorizontal: 18, paddingTop: 8 },
  headerText: { flex: 1, minWidth: 0 },
  row: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: 12, marginBottom: 10, padding: 13 },
  rowIcon: { alignItems: 'center', borderRadius: radii.md, height: 36, justifyContent: 'center', width: 36 },
  rowSub: { ...typeScale.caption, fontSize: 12, marginTop: 2 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { ...fontStyles.semiBold, fontSize: 14 },
  scrollContent: { paddingHorizontal: 18, paddingTop: 14 },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    elevation: 24,
    maxHeight: '70%',
    paddingTop: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.25,
    shadowRadius: 24
  },
  subtitle: { ...typeScale.caption, fontSize: 12.5, marginTop: 2 },
  title: { ...fontStyles.bold, fontSize: 18, letterSpacing: -0.3 }
});
