import { useEffect, useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';
import Reanimated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useAppToast } from '@/components/AppToast';
import { alpha, appColors, billjiPalette, fontStyles, radii, typeScale } from '@/theme/theme';
import { useOnboardingOptional } from './OnboardingProvider';

const AUTO_DISMISS_MS = 4000;
const PARTICLE_COUNT = 14;
const FALL_DURATION_MS = 1600;

type ParticleSpec = {
  startX: number;
  drift: number;
  size: number;
  color: string;
  delay: number;
  spin: number;
  isRect: boolean;
};

function makeParticles(winW: number, isDark: boolean): ParticleSpec[] {
  const palette = billjiPalette[isDark ? 'dark' : 'light'];
  const colors = [palette.primary, palette.accent, palette.warning, palette.violet, palette.secondary];
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    startX: Math.random() * winW,
    drift: (Math.random() - 0.5) * 120,
    size: 6 + Math.random() * 5,
    color: colors[i % colors.length],
    delay: Math.random() * 400,
    spin: (Math.random() - 0.5) * 720,
    isRect: i % 2 === 0
  }));
}

function Particle({ spec, winH }: { spec: ParticleSpec; winH: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      spec.delay,
      withTiming(1, { duration: FALL_DURATION_MS, easing: Easing.in(Easing.quad), reduceMotion: ReduceMotion.System })
    );
  }, [progress, spec.delay]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value < 0.75 ? 1 : (1 - progress.value) * 4,
    transform: [
      { translateX: spec.startX + spec.drift * progress.value },
      { translateY: -40 + progress.value * winH * 0.95 },
      { rotate: `${spec.spin * progress.value}deg` }
    ]
  }));

  return (
    <Reanimated.View
      pointerEvents="none"
      style={[
        styles.particle,
        {
          width: spec.size,
          height: spec.isRect ? spec.size * 1.8 : spec.size,
          borderRadius: spec.isRect ? 2 : spec.size / 2,
          backgroundColor: spec.color
        },
        style
      ]}
    />
  );
}

function CelebrationView({ onDone }: { onDone: () => void }) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const { width: winW, height: winH } = Dimensions.get('window');

  const particles = useMemo(() => makeParticles(winW, isDark), [winW, isDark]);

  const cardScale = useSharedValue(0.85);
  const cardOpacity = useSharedValue(0);

  useEffect(() => {
    cardScale.value = withDelay(150, withSpring(1, { damping: 15, stiffness: 220, reduceMotion: ReduceMotion.System }));
    cardOpacity.value = withDelay(150, withTiming(1, { duration: 220, reduceMotion: ReduceMotion.System }));
    const timer = setTimeout(onDone, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [cardScale, cardOpacity, onDone]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }]
  }));

  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.12);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {particles.map((spec, i) => (
        <Particle key={i} spec={spec} winH={winH} />
      ))}

      <View style={styles.centerWrap} pointerEvents="box-none">
        <Reanimated.View style={[styles.card, { backgroundColor: colors.card, borderColor: cardBorder }, cardStyle]}>
          <View style={[styles.badge, { backgroundColor: alpha(colors.accent, isDark ? 0.2 : 0.14) }]}>
            <Feather name="check" size={26} color={colors.accent} />
          </View>
          <Text style={[styles.title, { color: theme.colors.onSurface }]}>Your first invoice is out the door</Text>
          <Text style={[styles.body, { color: theme.colors.onSurfaceVariant }]}>That's the hard part done.</Text>
          <Button mode="contained" onPress={onDone} style={styles.continueBtn} contentStyle={styles.continueBtnContent}>
            Continue
          </Button>
        </Reanimated.View>
      </View>
    </View>
  );
}

export function CelebrationOverlay() {
  const onboarding = useOnboardingOptional();
  const reduceMotion = useReducedMotion();
  const { showToast } = useAppToast();

  const celebration = onboarding?.celebration ?? null;
  const clearCelebration = onboarding?.clearCelebration;

  // Under reduced motion, skip confetti entirely and fall back to a plain toast.
  useEffect(() => {
    if (!celebration || !reduceMotion || !clearCelebration) return;
    showToast('Your first invoice is out the door!');
    clearCelebration();
  }, [celebration, reduceMotion, clearCelebration, showToast]);

  if (!onboarding || !celebration || reduceMotion) return null;

  return <CelebrationView onDone={onboarding.clearCelebration} />;
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', borderRadius: radii.pill, height: 52, justifyContent: 'center', marginBottom: 14, width: 52 },
  body: { ...typeScale.caption, fontSize: 14, lineHeight: 20, marginTop: 6, textAlign: 'center' },
  card: {
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    elevation: 16,
    maxWidth: 340,
    padding: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 24,
    width: '100%'
  },
  centerWrap: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  continueBtn: { alignSelf: 'stretch', borderRadius: radii.input, marginTop: 20 },
  continueBtnContent: { paddingVertical: 2 },
  particle: { left: 0, position: 'absolute', top: 0 },
  title: { ...fontStyles.bold, fontSize: 19, letterSpacing: -0.3, textAlign: 'center' }
});
