import { useEffect, useMemo, useState } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';
import Reanimated, {
  Easing,
  ReduceMotion,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming
} from 'react-native-reanimated';
import Svg, { Defs, Mask, Rect } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import { useOnboarding, useOnboardingOptional } from './OnboardingProvider';
import type { AnchorRect } from './types';

const PAD = 8;
const CARET_SIZE = 14;
const TOOLTIP_GAP = 14;
const TIP_AUTO_DISMISS_MS = 8000;

const AnimatedRect = Reanimated.createAnimatedComponent(Rect);

const SPRING = { damping: 19, stiffness: 190, mass: 0.7, reduceMotion: ReduceMotion.System } as const;

type Hole = { left: number; top: number; width: number; height: number; radius: number };

function computeHole(rect: AnchorRect): Hole {
  const height = rect.height + PAD * 2;
  return {
    left: rect.x - PAD,
    top: rect.y - PAD,
    width: rect.width + PAD * 2,
    height,
    radius: Math.min(24, height / 2)
  };
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** Measure an anchor with a couple of retries so late layouts (tab bar, lazy content) settle in. */
function useAnchorRect(anchorId: string | undefined, winW: number, winH: number) {
  const onboarding = useOnboardingOptional();
  const [rect, setRect] = useState<AnchorRect | null>(null);

  useEffect(() => {
    if (!onboarding || !anchorId) return undefined;
    let cancelled = false;
    const measure = async () => {
      const measured = await onboarding.measureAnchor(anchorId);
      if (!cancelled && measured) setRect(measured);
    };
    void measure();
    // Retries let late layouts settle (tab bar, lazily mounted screens after a deep link).
    const timers = [260, 720, 1500].map((ms) => setTimeout(() => void measure(), ms));
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [onboarding, anchorId, winW, winH]);

  return rect;
}

function useWindowSize() {
  const [win, setWin] = useState(Dimensions.get('window'));
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setWin(window));
    return () => sub.remove();
  }, []);
  return win;
}

export function TourHost() {
  const onboarding = useOnboardingOptional();
  const active = onboarding?.activeTour ?? null;
  if (!onboarding || !active) return null;
  return active.mode === 'spotlight' ? <SpotlightTour /> : <SoftTip />;
}

// ---------------------------------------------------------------------------
// Spotlight mode — orientation tour
// ---------------------------------------------------------------------------

function SpotlightTour() {
  const onboarding = useOnboarding();
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const insets = useSafeAreaInsets();
  const win = useWindowSize();
  const { width: winW, height: winH } = win;

  const active = onboarding.activeTour;
  const stepIndex = active?.stepIndex ?? 0;
  const step = active ? active.tour.steps[stepIndex] : null;
  const stepCount = active?.tour.steps.length ?? 0;
  const isLast = stepIndex >= stepCount - 1;

  const rect = useAnchorRect(step?.anchorId, winW, winH);
  const [tooltipH, setTooltipH] = useState(0);
  const [caret, setCaret] = useState<{ side: 'top' | 'bottom'; x: number } | null>(null);

  const tooltipWidth = Math.min(340, winW - 32);

  // Spotlight cutout shared values
  const hx = useSharedValue(winW / 2);
  const hy = useSharedValue(winH / 2);
  const hw = useSharedValue(0);
  const hh = useSharedValue(0);
  const hr = useSharedValue(0);
  const hasRect = useSharedValue(0);
  const pulse = useSharedValue(0);

  // Tooltip shared values
  const tpx = useSharedValue((winW - tooltipWidth) / 2);
  const tpy = useSharedValue(winH * 0.4);
  const tOpacity = useSharedValue(0);
  const tShift = useSharedValue(10);

  // Halo pulse loop
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
      undefined,
      ReduceMotion.System
    );
  }, [pulse]);

  // Reset tooltip entrance on step change
  useEffect(() => {
    tOpacity.value = 0;
    tShift.value = 10;
  }, [stepIndex, tOpacity, tShift]);

  // Move the cutout to the measured anchor
  useEffect(() => {
    if (!rect) return;
    const hole = computeHole(rect);
    hx.value = withSpring(hole.left, SPRING);
    hy.value = withSpring(hole.top, SPRING);
    hw.value = withSpring(hole.width, SPRING);
    hh.value = withSpring(hole.height, SPRING);
    hr.value = withSpring(hole.radius, SPRING);
    hasRect.value = withTiming(1, { duration: 180 });
  }, [rect, hx, hy, hw, hh, hr, hasRect]);

  // Position the tooltip once its height is known
  useEffect(() => {
    if (!tooltipH) return;
    let x: number;
    let y: number;
    if (!rect) {
      x = (winW - tooltipWidth) / 2;
      y = Math.max(insets.top + 32, winH * 0.4);
      setCaret(null);
    } else {
      const hole = computeHole(rect);
      const centerX = hole.left + hole.width / 2;
      x = clamp(centerX - tooltipWidth / 2, 16, Math.max(16, winW - tooltipWidth - 16));
      const fitsBelow = hole.top + hole.height + TOOLTIP_GAP + tooltipH <= winH - insets.bottom - 12;
      const fitsAbove = hole.top - TOOLTIP_GAP - tooltipH >= insets.top + 12;
      const preferTop = step?.placement === 'top';
      const placeBelow = preferTop ? !fitsAbove : fitsBelow || !fitsAbove;
      y = placeBelow
        ? hole.top + hole.height + TOOLTIP_GAP
        : Math.max(insets.top + 12, hole.top - TOOLTIP_GAP - tooltipH);
      setCaret({
        side: placeBelow ? 'top' : 'bottom',
        x: clamp(centerX - x - CARET_SIZE / 2, 20, tooltipWidth - 20 - CARET_SIZE)
      });
    }
    tpx.value = withSpring(x, SPRING);
    tpy.value = withSpring(y, SPRING);
    tOpacity.value = withDelay(90, withTiming(1, { duration: 200, reduceMotion: ReduceMotion.System }));
    tShift.value = withDelay(90, withSpring(0, SPRING));
  }, [rect, tooltipH, winW, winH, insets.top, insets.bottom, stepIndex, step?.placement, tooltipWidth, tpx, tpy, tOpacity, tShift]);

  const cutoutProps = useAnimatedProps(() => ({
    x: hx.value,
    y: hy.value,
    width: hw.value * hasRect.value,
    height: hh.value * hasRect.value,
    rx: hr.value,
    ry: hr.value
  }));

  const haloStyle = useAnimatedStyle(() => {
    const spread = 5 + pulse.value * 7;
    return {
      left: hx.value - spread,
      top: hy.value - spread,
      width: hw.value + spread * 2,
      height: hh.value + spread * 2,
      borderRadius: hr.value + spread,
      opacity: hasRect.value * (0.75 - pulse.value * 0.45)
    };
  });

  const cutoutTapStyle = useAnimatedStyle(() => ({
    left: hx.value,
    top: hy.value,
    width: hw.value,
    height: hh.value,
    opacity: hasRect.value
  }));

  const tooltipStyle = useAnimatedStyle(() => ({
    left: tpx.value,
    top: tpy.value,
    opacity: tOpacity.value,
    transform: [{ translateY: tShift.value }]
  }));

  const dots = useMemo(() => Array.from({ length: stepCount }, (_, i) => i), [stepCount]);

  if (!active || !step) return null;

  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.12);

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onboarding.dismissTour}>
      <View style={styles.fill}>
        {/* Dim layer with a real rounded-rect cutout */}
        <Svg width={winW} height={winH} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <Mask id="tour-spotlight-mask">
              <Rect x={0} y={0} width={winW} height={winH} fill="#FFFFFF" />
              <AnimatedRect animatedProps={cutoutProps} fill="#000000" />
            </Mask>
          </Defs>
          <Rect x={0} y={0} width={winW} height={winH} fill="rgba(10, 12, 26, 0.72)" mask="url(#tour-spotlight-mask)" />
        </Svg>

        {/* Backdrop swallows taps but never dismisses — only Skip does */}
        <Pressable style={StyleSheet.absoluteFill} accessible={false} onPress={() => {}} />

        {/* Pulsing halo ring around the cutout */}
        <Reanimated.View pointerEvents="none" style={[styles.halo, { borderColor: colors.primary }, haloStyle]} />

        {/* The highlighted element itself is tappable to advance */}
        <Reanimated.View style={[styles.cutoutTap, cutoutTapStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onboarding.nextTourStep}
            accessibilityRole="button"
            accessibilityLabel={`${step.title}. Tap to continue the tour.`}
          />
        </Reanimated.View>

        {/* Tooltip card */}
        <Reanimated.View
          onLayout={(e) => setTooltipH(e.nativeEvent.layout.height)}
          style={[
            styles.tooltip,
            { width: tooltipWidth, backgroundColor: colors.card, borderColor: cardBorder },
            tooltipStyle
          ]}
        >
          {caret ? (
            <View
              style={[
                styles.caret,
                {
                  backgroundColor: colors.card,
                  borderColor: cardBorder,
                  left: caret.x,
                  ...(caret.side === 'top'
                    ? { top: -CARET_SIZE / 2, borderLeftWidth: 1, borderTopWidth: 1 }
                    : { bottom: -CARET_SIZE / 2, borderRightWidth: 1, borderBottomWidth: 1 })
                }
              ]}
            />
          ) : null}

          <View style={styles.dotsRow}>
            {dots.map((i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === stepIndex
                    ? { width: 18, backgroundColor: colors.primary }
                    : { backgroundColor: alpha(colors.primary, isDark ? 0.35 : 0.2) }
                ]}
              />
            ))}
          </View>

          <Text style={[styles.title, { color: theme.colors.onSurface }]}>{step.title}</Text>
          <Text style={[styles.body, { color: theme.colors.onSurfaceVariant }]}>{step.description}</Text>

          <View style={styles.actions}>
            <Pressable onPress={onboarding.dismissTour} hitSlop={8} style={styles.skipBtn}>
              <Text style={[styles.skipText, { color: theme.colors.onSurfaceVariant }]}>Skip tour</Text>
            </Pressable>
            <Button mode="contained" onPress={onboarding.nextTourStep} style={{ borderRadius: radii.input }} contentStyle={styles.nextBtnContent}>
              {isLast ? 'Done' : 'Next'}
            </Button>
          </View>
        </Reanimated.View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Tip mode — soft, non-blocking anchored callout
// ---------------------------------------------------------------------------

function SoftTip() {
  const onboarding = useOnboarding();
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const insets = useSafeAreaInsets();
  const win = useWindowSize();
  const { width: winW, height: winH } = win;

  const active = onboarding.activeTour;
  const step = active ? active.tour.steps[active.stepIndex] : null;
  const rect = useAnchorRect(step?.anchorId, winW, winH);
  const [cardH, setCardH] = useState(0);

  const opacity = useSharedValue(0);
  const shift = useSharedValue(8);

  const cardWidth = Math.min(300, winW - 32);
  const { dismissTour } = onboarding;

  // Auto-dismiss: quietly after 8s, or quickly when the anchor never materialises.
  useEffect(() => {
    const auto = setTimeout(dismissTour, TIP_AUTO_DISMISS_MS);
    return () => clearTimeout(auto);
  }, [dismissTour]);

  useEffect(() => {
    if (rect) return undefined;
    const bail = setTimeout(dismissTour, 2500);
    return () => clearTimeout(bail);
  }, [rect, dismissTour]);

  useEffect(() => {
    if (!rect || !cardH) return;
    opacity.value = withTiming(1, { duration: 220, reduceMotion: ReduceMotion.System });
    shift.value = withSpring(0, SPRING);
  }, [rect, cardH, opacity, shift]);

  const entranceStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: shift.value }]
  }));

  if (!active || !step || !rect) return null;

  const hole = computeHole(rect);
  const centerX = hole.left + hole.width / 2;
  const x = clamp(centerX - cardWidth / 2, 16, Math.max(16, winW - cardWidth - 16));
  const fitsBelow = hole.top + hole.height + TOOLTIP_GAP + cardH <= winH - insets.bottom - 12;
  const placeBelow = step.placement === 'top' ? false : fitsBelow;
  const y = placeBelow
    ? hole.top + hole.height + TOOLTIP_GAP
    : Math.max(insets.top + 12, hole.top - TOOLTIP_GAP - cardH);
  const caretX = clamp(centerX - x - CARET_SIZE / 2, 18, cardWidth - 18 - CARET_SIZE);
  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.14);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Reanimated.View
        onLayout={(e) => setCardH(e.nativeEvent.layout.height)}
        style={[
          styles.tipCard,
          { left: x, top: y, width: cardWidth, backgroundColor: colors.card, borderColor: cardBorder },
          entranceStyle
        ]}
      >
        <View
          style={[
            styles.caret,
            {
              backgroundColor: colors.card,
              borderColor: cardBorder,
              left: caretX,
              ...(placeBelow
                ? { top: -CARET_SIZE / 2, borderLeftWidth: 1, borderTopWidth: 1 }
                : { bottom: -CARET_SIZE / 2, borderRightWidth: 1, borderBottomWidth: 1 })
            }
          ]}
        />
        <View style={styles.tipHeader}>
          <View style={[styles.tipIcon, { backgroundColor: alpha(colors.primary, isDark ? 0.2 : 0.1) }]}>
            <Feather name="zap" size={13} color={colors.primary} />
          </View>
          <Text style={[styles.tipTitle, { color: theme.colors.onSurface }]}>{step.title}</Text>
          <Pressable onPress={onboarding.dismissTour} hitSlop={10} accessibilityLabel="Dismiss tip">
            <Feather name="x" size={16} color={theme.colors.onSurfaceVariant} />
          </Pressable>
        </View>
        <Text style={[styles.tipBody, { color: theme.colors.onSurfaceVariant }]}>{step.description}</Text>
      </Reanimated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  body: { ...typeScale.caption, fontSize: 14, lineHeight: 21, marginTop: 6 },
  caret: {
    height: CARET_SIZE,
    position: 'absolute',
    transform: [{ rotate: '45deg' }],
    width: CARET_SIZE
  },
  cutoutTap: { position: 'absolute' },
  dot: { borderRadius: radii.pill, height: 6, width: 6 },
  dotsRow: { flexDirection: 'row', gap: 5, marginBottom: 10 },
  fill: { flex: 1 },
  halo: { borderRadius: 20, borderWidth: 2, position: 'absolute' },
  nextBtnContent: { paddingHorizontal: 6 },
  skipBtn: { paddingVertical: 6 },
  skipText: { ...fontStyles.medium, fontSize: 13 },
  tipBody: { ...typeScale.caption, fontSize: 13, lineHeight: 19, marginTop: 8 },
  tipCard: {
    borderRadius: 16,
    borderWidth: 1,
    elevation: 10,
    padding: 14,
    position: 'absolute',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14
  },
  tipHeader: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  tipIcon: { alignItems: 'center', borderRadius: radii.pill, height: 24, justifyContent: 'center', width: 24 },
  tipTitle: { ...fontStyles.bold, flex: 1, fontSize: 14 },
  title: { ...fontStyles.bold, fontSize: 18, letterSpacing: -0.3 },
  tooltip: {
    borderRadius: 20,
    borderWidth: 1,
    elevation: 12,
    padding: 18,
    position: 'absolute',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 18
  }
});
