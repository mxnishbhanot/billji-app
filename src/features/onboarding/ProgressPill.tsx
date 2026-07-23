import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import Reanimated, {
  ReduceMotion,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, appColors, fontStyles, radii } from '@/theme/theme';
import { ANCHOR } from './registry';
import { TourAnchor } from './TourAnchor';
import { useOnboardingOptional } from './OnboardingProvider';

const AnimatedCircle = Reanimated.createAnimatedComponent(Circle);

const RING_SIZE = 22;
const RING_STROKE = 2.5;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;

const SPRING = { damping: 16, stiffness: 200, mass: 0.7, reduceMotion: ReduceMotion.System } as const;

/** Small animated progress ring used inside the pill and the Getting Started sheet. */
export function ProgressRing({ fraction, size = RING_SIZE, stroke = RING_STROKE, trackColor, fillColor }: {
  fraction: number;
  size?: number;
  stroke?: number;
  trackColor: string;
  fillColor: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withSpring(fraction, SPRING);
  }, [fraction, progress]);

  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: c * (1 - progress.value)
  }));

  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
      <AnimatedCircle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={fillColor}
        strokeWidth={stroke}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={`${c} ${c}`}
        animatedProps={ringProps}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}

/**
 * Floating "Getting started" pill, anchored bottom-right above the tab bar.
 * Springs in on mount and bounces when a task completes.
 */
export function ProgressPill() {
  const onboarding = useOnboardingOptional();
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const insets = useSafeAreaInsets();

  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0);
  const prevDoneRef = useRef<number | null>(null);

  const visible = Boolean(onboarding?.checklistVisible);
  const progress = onboarding?.progress ?? null;
  const tasks = onboarding?.checklistTasks ?? [];

  const doneCount = tasks.filter((t) => {
    const s = progress?.checklist.items[t.key]?.status;
    return s === 'completed' || s === 'skipped';
  }).length;

  useEffect(() => {
    if (!visible) return;
    scale.value = withSpring(1, SPRING);
    opacity.value = withSpring(1, SPRING);
  }, [visible, scale, opacity]);

  // Gentle bounce when another task lands
  useEffect(() => {
    if (!visible) return;
    if (prevDoneRef.current !== null && doneCount > prevDoneRef.current) {
      scale.value = withSequence(withSpring(1.1, { ...SPRING, stiffness: 320 }), withSpring(1, SPRING));
    }
    prevDoneRef.current = doneCount;
  }, [doneCount, visible, scale]);

  const entrance = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }]
  }));

  if (!onboarding || !visible || !progress) return null;

  const total = tasks.length;
  const fraction = total ? doneCount / total : 0;

  return (
    <Reanimated.View
      style={[styles.wrap, { bottom: 88 + insets.bottom }, entrance]}
      pointerEvents="box-none"
    >
      <TourAnchor anchorId={ANCHOR.checklist}>
        <Pressable
          onPress={() => onboarding.setChecklistSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Getting started, ${doneCount} of ${total} done. Open checklist.`}
          style={({ pressed }) => [
            styles.pill,
            {
              backgroundColor: colors.card,
              borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.14),
              opacity: pressed ? 0.9 : 1
            }
          ]}
        >
          <ProgressRing
            fraction={fraction}
            trackColor={alpha(colors.primary, isDark ? 0.25 : 0.14)}
            fillColor={colors.primary}
          />
          <Text style={[styles.label, { color: theme.colors.onSurface }]}>
            Getting started · {doneCount}/{total}
          </Text>
        </Pressable>
      </TourAnchor>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  label: { ...fontStyles.semiBold, fontSize: 13 },
  pill: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    elevation: 10,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14
  },
  wrap: { alignItems: 'flex-end', position: 'absolute', right: 16, zIndex: 40 }
});
