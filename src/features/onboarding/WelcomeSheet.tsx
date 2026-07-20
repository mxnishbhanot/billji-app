import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark } from '@/components/BrandMark';
import { PERMISSION, usePermissions } from '@/shared/hooks/usePermissions';
import { useAuthStore } from '@/store/authStore';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import { useOnboardingOptional } from './OnboardingProvider';

export function WelcomeSheet() {
  const onboarding = useOnboardingOptional();
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const insets = useSafeAreaInsets();
  const { can } = usePermissions();
  const user = useAuthStore((s) => s.user);

  const visible = onboarding?.welcomeVisible ?? false;
  // Keep the modal mounted through the exit animation.
  const [mounted, setMounted] = useState(visible);
  const translateY = useRef(new Animated.Value(480)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) setMounted(true);
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: visible ? 0 : 480,
        duration: visible ? 320 : 220,
        easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.timing(backdropOpacity, { toValue: visible ? 1 : 0, duration: visible ? 240 : 180, useNativeDriver: true })
    ]).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [visible, translateY, backdropOpacity]);

  if (!onboarding || !mounted) return null;

  const firstName = user?.name?.trim().split(/\s+/)[0];
  const isCreator = can(PERMISSION.invoicesCreate);
  const valueProp = isCreator
    ? 'Create and share your first invoice in under 2 minutes.'
    : 'Everything your team bills, in one place.';

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onboarding.declineWelcome}>
      <View style={styles.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8, 9, 18, 0.55)', opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onboarding.declineWelcome} accessibilityLabel="Close welcome" />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.1),
              paddingBottom: 20 + insets.bottom,
              transform: [{ translateY }]
            }
          ]}
        >
          <View style={styles.grabber}>
            <View style={[styles.grabberBar, { backgroundColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.18) }]} />
          </View>

          <View style={styles.body}>
            <View style={[styles.markHalo, { backgroundColor: alpha(colors.primary, isDark ? 0.2 : 0.08) }]}>
              <BrandMark size={56} imageUri={user?.businessProfile?.logoUrl} label={user?.businessProfile?.businessName || 'BillJi'} />
            </View>
            <Text style={[styles.title, { color: theme.colors.onSurface }]}>
              {firstName ? `Welcome to BillJi, ${firstName}` : 'Welcome to BillJi'}
            </Text>
            <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>{valueProp}</Text>

            <Button
              mode="contained"
              onPress={onboarding.acceptWelcome}
              style={styles.primaryBtn}
              contentStyle={styles.primaryBtnContent}
            >
              Show me around
            </Button>
            <Pressable onPress={onboarding.declineWelcome} hitSlop={8} style={styles.secondaryBtn}>
              <Text style={[styles.secondaryText, { color: theme.colors.onSurfaceVariant }]}>I'll explore myself</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 18 },
  fill: { flex: 1, justifyContent: 'flex-end' },
  grabber: { alignItems: 'center', paddingTop: 8 },
  grabberBar: { borderRadius: radii.pill, height: 4, width: 38 },
  markHalo: {
    alignItems: 'center',
    borderRadius: radii.pill,
    height: 84,
    justifyContent: 'center',
    marginBottom: 16,
    width: 84
  },
  primaryBtn: { alignSelf: 'stretch', borderRadius: radii.input, marginTop: 24 },
  primaryBtnContent: { paddingVertical: 4 },
  secondaryBtn: { marginTop: 14, paddingVertical: 6 },
  secondaryText: { ...fontStyles.medium, fontSize: 14 },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    elevation: 24,
    paddingTop: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.25,
    shadowRadius: 24
  },
  subtitle: { ...typeScale.bodyMd, fontSize: 15, lineHeight: 22, marginTop: 8, textAlign: 'center' },
  title: { ...fontStyles.bold, fontSize: 22, letterSpacing: -0.4, textAlign: 'center' }
});
