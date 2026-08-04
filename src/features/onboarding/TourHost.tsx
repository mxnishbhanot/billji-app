import { useEffect, useMemo, useState } from 'react';
import { BackHandler, Dimensions, Pressable, StyleSheet, View } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';
import Reanimated, {
  Easing,
  ReduceMotion,
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
import { useOnboarding, useOnboardingAnchors, useOnboardingOptional } from './OnboardingProvider';
import type { AnchorRect } from './types';

const PAD = 8;
const CARET_SIZE = 14;
const TOOLTIP_GAP = 14;
const TIP_AUTO_DISMISS_MS = 8000;

const SPRING = { damping: 19, stiffness: 190, mass: 0.7, reduceMotion: ReduceMotion.System } as const;

// Halo sits this far outside the cutout; the pulse only scales/fades it (0.97→1.03),
// never re-lays it out, so the ring never lands back on the highlighted element.
const HALO_SPREAD = 8;

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

/**
 * Poll for an anchor until it measures, then stop. A step may navigate to another
 * (lazily-mounted) screen before its anchor exists, so fixed retries aren't enough —
 * we poll every 150ms up to ~4s. rect is cleared on anchor change so the previous
 * step's cutout doesn't linger.
 */
const ANCHOR_POLL_MS = 150;
const ANCHOR_POLL_TRIES = 26; // ~4s

function useAnchorRect(anchorId: string | undefined, winW: number, winH: number) {
  // measureAnchor lives in the stable anchors context — reading it here (not the main
  // onboarding context) keeps this effect from tearing down the poll and resetting rect
  // to null on every progress mutation, before the first measure resolves.
  const measureAnchor = useOnboardingAnchors()?.measureAnchor;
  // Tag the measured rect with its anchorId so a stale rect from the previous step is
  // dropped by derivation (below) instead of a synchronous setState(null) in the effect,
  // which would trigger a cascading render on every step change.
  const [measured, setMeasured] = useState<{ id: string; rect: AnchorRect } | null>(null);

  useEffect(() => {
    if (!measureAnchor || !anchorId) return undefined;
    let cancelled = false;
    let tries = 0;
    let last: AnchorRect | null = null;
    const same = (a: AnchorRect | null, b: AnchorRect) =>
      !!a && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
    // Keep measuring for the whole poll window and let the cutout follow — the target
    // may still be scrolling into view (DashboardScreen animates scrollTo when a step
    // targets Reports). Never stop early on a stable read: an animated scroll reads
    // identical twice before it starts moving, which used to freeze the cutout on the
    // pre-scroll position.
    const attempt = async () => {
      const result = await measureAnchor(anchorId);
      if (cancelled) return;
      if (result) {
        // Only commit when the rect actually moved — an unchanged read must not
        // re-render the host (the cutout/tooltip positions are state now).
        if (!same(last, result)) setMeasured({ id: anchorId, rect: result });
        last = result;
      }
      if (++tries > ANCHOR_POLL_TRIES) clearInterval(id); // hard cap ~4s
    };
    const id = setInterval(() => void attempt(), ANCHOR_POLL_MS);
    void attempt(); // don't wait 150ms for the first try
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [measureAnchor, anchorId, winW, winH]);

  return measured && measured.id === anchorId ? measured.rect : null;
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
  // Own size, not Dimensions: anchors are measured with measureInWindow (app-window
  // coords), so the dim layer must live in that same space. Rendering it in a Modal
  // put its origin at the screen top instead, shifting every cutout up by the
  // status-bar inset — 43dp on the reporter's device, different on every other.
  const [overlay, setOverlay] = useState({ w: winW, h: winH });

  const tooltipWidth = Math.min(340, winW - 32);

  // The cutout is plain geometry, not animated props: an animated SVG Rect inside a
  // Mask forces react-native-svg to re-rasterise the whole full-screen dim layer every
  // frame (~10fps on mid-range Android). Recomputed only when the anchor moves.
  const hole = useMemo(() => (rect ? computeHole(rect) : null), [rect]);

  const pulse = useSharedValue(0);
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

  // Tooltip box + caret are pure geometry — derived in render, no state, no effect.
  const place = useMemo(() => {
    if (!tooltipH) return null;
    if (!hole) {
      return {
        x: (overlay.w - tooltipWidth) / 2,
        y: Math.max(insets.top + 32, overlay.h * 0.4),
        caret: null as { side: 'top' | 'bottom'; x: number } | null
      };
    }
    const centerX = hole.left + hole.width / 2;
    const x = clamp(centerX - tooltipWidth / 2, 16, Math.max(16, overlay.w - tooltipWidth - 16));
    const fitsBelow = hole.top + hole.height + TOOLTIP_GAP + tooltipH <= overlay.h - insets.bottom - 12;
    const fitsAbove = hole.top - TOOLTIP_GAP - tooltipH >= insets.top + 12;
    const placeBelow = step?.placement === 'top' ? !fitsAbove : fitsBelow || !fitsAbove;
    return {
      x,
      y: placeBelow
        ? hole.top + hole.height + TOOLTIP_GAP
        : Math.max(insets.top + 12, hole.top - TOOLTIP_GAP - tooltipH),
      caret: {
        side: (placeBelow ? 'top' : 'bottom') as 'top' | 'bottom',
        x: clamp(centerX - x - CARET_SIZE / 2, 20, tooltipWidth - 20 - CARET_SIZE)
      }
    };
  }, [hole, tooltipH, overlay.w, overlay.h, insets.top, insets.bottom, step?.placement, tooltipWidth]);

  // Entrance: reset on step change, play once the box has a position.
  const positioned = Boolean(place);
  useEffect(() => {
    tOpacity.value = 0;
    tShift.value = 10;
    if (!positioned) return;
    tOpacity.value = withDelay(90, withTiming(1, { duration: 200, reduceMotion: ReduceMotion.System }));
    tShift.value = withDelay(90, withSpring(0, SPRING));
  }, [stepIndex, positioned, tOpacity, tShift]);

  // Only opacity + transform animate — no layout props, so no per-frame layout pass.
  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.75 - pulse.value * 0.45,
    transform: [{ scale: 0.97 + pulse.value * 0.06 }]
  }));

  const tooltipStyle = useAnimatedStyle(() => ({
    opacity: tOpacity.value,
    transform: [{ translateY: tShift.value }]
  }));

  const dots = useMemo(() => Array.from({ length: stepCount }, (_, i) => i), [stepCount]);

  // No Modal any more, so hardware back has to be intercepted here or it would pop the
  // navigation stack behind the (still visible) tour.
  const { dismissTour } = onboarding;
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      dismissTour();
      return true;
    });
    return () => sub.remove();
  }, [dismissTour]);

  if (!active || !step) return null;

  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.12);

  return (
    <View
      style={styles.fill}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setOverlay((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
      }}
    >
      {/* Dim layer with a real rounded-rect cutout */}
      <Svg width={overlay.w} height={overlay.h} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <Mask id="tour-spotlight-mask">
              <Rect x={0} y={0} width={overlay.w} height={overlay.h} fill="#FFFFFF" />
              {hole ? (
                <Rect
                  x={hole.left}
                  y={hole.top}
                  width={hole.width}
                  height={hole.height}
                  rx={hole.radius}
                  ry={hole.radius}
                  fill="#000000"
                />
              ) : null}
            </Mask>
          </Defs>
          <Rect x={0} y={0} width={overlay.w} height={overlay.h} fill="rgba(10, 12, 26, 0.72)" mask="url(#tour-spotlight-mask)" />
        </Svg>

        {/* Backdrop swallows taps but never dismisses — only Skip does */}
        <Pressable style={StyleSheet.absoluteFill} accessible={false} onPress={() => {}} />

        {/* Pulsing halo ring around the cutout */}
        {hole ? (
          <Reanimated.View
            pointerEvents="none"
            style={[
              styles.halo,
              {
                borderColor: colors.primary,
                left: hole.left - HALO_SPREAD,
                top: hole.top - HALO_SPREAD,
                width: hole.width + HALO_SPREAD * 2,
                height: hole.height + HALO_SPREAD * 2,
                borderRadius: hole.radius + HALO_SPREAD
              },
              haloStyle
            ]}
          />
        ) : null}

        {/* The highlighted element itself is tappable to advance */}
        {hole ? (
          <View style={[styles.cutoutTap, { left: hole.left, top: hole.top, width: hole.width, height: hole.height }]}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={onboarding.nextTourStep}
              accessibilityRole="button"
              accessibilityLabel={`${step.title}. Tap to continue the tour.`}
            />
          </View>
        ) : null}

        {/* Tooltip card */}
        <Reanimated.View
          onLayout={(e) => setTooltipH(e.nativeEvent.layout.height)}
          style={[
            styles.tooltip,
            {
              width: tooltipWidth,
              backgroundColor: colors.card,
              borderColor: cardBorder,
              left: place?.x ?? (overlay.w - tooltipWidth) / 2,
              top: place?.y ?? overlay.h * 0.4
            },
            tooltipStyle
          ]}
        >
          {place?.caret ? (
            <View
              style={[
                styles.caret,
                {
                  backgroundColor: colors.card,
                  borderColor: cardBorder,
                  left: place.caret.x,
                  ...(place.caret.side === 'top'
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

  // Give the anchor poll (~4s) time to find a screen the step navigated to before bailing.
  useEffect(() => {
    if (rect) return undefined;
    const bail = setTimeout(dismissTour, 4500);
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
  // Above the absolute tab bar (elevation 14) — on Android sibling order alone loses to it.
  fill: { bottom: 0, elevation: 24, left: 0, position: 'absolute', right: 0, top: 0, zIndex: 100 },
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
