import { ReactNode, memo, useEffect, useId, useMemo } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Reanimated, {
  Easing,
  FadeInDown,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming
} from 'react-native-reanimated';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, useTheme } from 'react-native-paper';
import Svg, { Circle, Defs, Ellipse, G, Line as SvgLine, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import {
  alpha,
  appColors,
  circleSizes,
  fontStyles,
  glass,
  hero,
  iconSizes,
  motion,
  numeric,
  radii,
  semantic,
  type SemanticAccent,
  shadow,
  spacing,
  springs,
  surfaceGradient,
  typeScale
} from '@/theme/theme';
import { tapLight, tapSelection } from '@/utils/haptics';

/**
 * Presentation-only building blocks for the dashboard. Every one of these is a pure view: data,
 * navigation, permissions and queries stay in DashboardScreen. Kept in a single module because they
 * exist to serve one screen — the moment a second screen needs one, promote it to its own file.
 *
 * House style: no flat fills. Every surface is a two-stop gradient plus a hairline top highlight
 * (see `surfaceGradient` / `glass` in theme.ts), which is what reads as "lit" rather than "coloured".
 */

/**
 * Unique gradient id per component instance. On native each <Svg> is its own root, but the web build
 * puts every gradient in one DOM, where a shared id makes the last definition win for all of them.
 * `useId()` output contains colons, which are illegal inside url(#…) — strip them.
 */
const useGradientId = (prefix: string) => `${prefix}${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

/** One corner radius for every tile on the dashboard grid — KPI cards and quick actions alike. */
const TILE_RADIUS = radii.lg + 2;

/**
 * SIGNATURE 1 — the BillJi pulse: three ascending rounded bars, the shape of a growing ledger.
 * It marks every section heading and the hero's brand row, and nothing else, so it stays a signature
 * rather than a texture. Bars are optically sized (the tallest is not simply 3×the shortest).
 */
export function BrandPulse({ color, size = 14, opacity = 1 }: { color: string; size?: number; opacity?: number }) {
  return (
    <Svg width={size * 0.78} height={size} viewBox="0 0 11 14" opacity={opacity}>
      <Rect x="0" y="7.5" width="2.6" height="6.5" rx="1.3" fill={color} opacity={0.55} />
      <Rect x="4.2" y="3.8" width="2.6" height="10.2" rx="1.3" fill={color} opacity={0.8} />
      <Rect x="8.4" y="0" width="2.6" height="14" rx="1.3" fill={color} />
    </Svg>
  );
}

/**
 * SIGNATURE 2 — the corner glint: a fixed diagonal light sweep across the top-left of every elevated
 * BillJi surface, plus the top-edge hairline. Same light source on every card is what makes a set of
 * surfaces read as one designed object instead of separately styled boxes.
 */
function CornerGlint({ radius, isDark }: { radius: number; isDark: boolean }) {
  const id = useGradientId('glint');
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0.85" y2="0.9">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={isDark ? 0.07 : 0.75} />
          <Stop offset="0.42" stopColor="#FFFFFF" stopOpacity={isDark ? 0.02 : 0.16} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" rx={radius} ry={radius} fill={`url(#${id})`} />
    </Svg>
  );
}

/** Mount reveal: short fade + rise, staggered by position. Reanimated only — no legacy Animated. */
export function Reveal({ index = 0, children, style }: { index?: number; children: ReactNode; style?: object }) {
  return (
    <Reanimated.View entering={FadeInDown.duration(motion.slow).delay(index * motion.stagger)} style={style}>
      {children}
    </Reanimated.View>
  );
}

/** Two-stop gradient fill + top-edge highlight, absolutely filling its parent. */
function SurfaceFill({
  colors: stops,
  highlight,
  radius,
  glint = false,
  isDark = false
}: {
  colors: readonly [string, string];
  highlight: string;
  radius: number;
  glint?: boolean;
  isDark?: boolean;
}) {
  const gradientId = useGradientId('surface');
  return (
    <>
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0.35" y2="1">
            <Stop offset="0" stopColor={stops[0]} />
            <Stop offset="1" stopColor={stops[1]} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" rx={radius} ry={radius} fill={`url(#${gradientId})`} />
      </Svg>
      {glint ? <CornerGlint radius={radius} isDark={isDark} /> : null}
      {/* Specular hairline: light lands on the top edge first. */}
      <View pointerEvents="none" style={[styles.topHighlight, { backgroundColor: highlight }]} />
    </>
  );
}

/**
 * Gradient icon capsule with a tone rim — the one glyph container on this screen. KPI cards and quick
 * action tiles share it, which is most of what makes the two read as the same family of tile.
 */
function IconCapsule({
  icon,
  accent,
  isDark,
  size,
  iconSize
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  accent: string;
  isDark: boolean;
  size: number;
  iconSize: number;
}) {
  const capsuleId = useGradientId('capsule');
  return (
    <View style={[styles.iconCapsule, { height: size, width: size }]}>
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={capsuleId} x1="0" y1="0" x2="0.3" y2="1">
            <Stop offset="0" stopColor={accent} stopOpacity={isDark ? 0.3 : 0.17} />
            <Stop offset="1" stopColor={accent} stopOpacity={isDark ? 0.14 : 0.07} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" rx={radii.lg} ry={radii.lg} fill={`url(#${capsuleId})`} />
      </Svg>
      <View style={[styles.iconCapsuleRim, { borderColor: alpha(accent, isDark ? 0.32 : 0.2) }]} />
      <MaterialCommunityIcons name={icon} size={iconSize} color={accent} />
    </View>
  );
}

/** Pressable that lifts on touch: spring scale, nothing else. Used by every tappable surface here. */
function LiftPressable({
  onPress,
  children,
  style,
  accessibilityLabel,
  haptic = tapLight,
  /** How far the surface travels on press. Bigger surfaces move less — heavy things feel heavy. */
  lift = 1.5,
  scale = motion.pressScale
}: {
  onPress: () => void;
  children: ReactNode;
  style?: object | object[];
  accessibilityLabel: string;
  haptic?: () => void;
  lift?: number;
  scale?: number;
}) {
  const pressed = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(pressed.value, [0, 1], [1, scale]) },
      { translateY: interpolate(pressed.value, [0, 1], [0, lift]) }
    ]
  }));
  return (
    <Reanimated.View style={animatedStyle}>
      <Pressable
        // react-hooks/immutability models every captured value as immutable, but writing to a
        // Reanimated SharedValue from an event handler is exactly its intended use — it keeps the
        // press animation on the UI thread instead of re-rendering on every touch.
        /* eslint-disable react-hooks/immutability */
        onPressIn={() => { pressed.value = withTiming(1, { duration: motion.fast, easing: Easing.out(Easing.quad) }); }}
        onPressOut={() => { pressed.value = withSpring(0, springs.snap); }}
        /* eslint-enable react-hooks/immutability */
        onPress={() => { haptic(); onPress(); }}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={style}
      >
        {children}
      </Pressable>
    </Reanimated.View>
  );
}

export function SectionHeading({ title, caption, actionLabel, onAction }: { title: string; caption?: string; actionLabel?: string; onAction?: () => void }) {
  const theme = useTheme();
  const colors = appColors(theme.dark);
  const accent = theme.dark ? colors.primary : colors.primaryStrong;
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.sectionMark}>
        <BrandPulse color={accent} size={13} />
      </View>
      <View style={styles.flex1}>
        <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>{title}</Text>
        {caption ? <Text style={[styles.sectionCaption, { color: theme.colors.onSurfaceVariant }]}>{caption}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable
          onPress={() => { tapLight(); onAction(); }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={({ pressed }) => [
            styles.sectionAction,
            { backgroundColor: alpha(colors.primary, pressed ? (theme.dark ? 0.26 : 0.16) : theme.dark ? 0.16 : 0.08), borderColor: alpha(accent, theme.dark ? 0.24 : 0.12) }
          ]}
        >
          <Text style={[styles.sectionActionText, { color: accent }]}>{actionLabel}</Text>
          <Feather name="arrow-up-right" size={iconSizes.xs} color={accent} />
        </Pressable>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ hero ---- */

/**
 * Hero backdrop: five stacked layers, drawn once as static SVG —
 * 1 deep three-stop gradient plane, 2 two soft light pools, 3 a specular arc (the "reflection" that
 * makes the plane feel curved), 4 faint flow lines for texture, 5 a floor vignette. The orbs that
 * float over this are separate, animated views.
 */
function HeroBackdrop({ isDark }: { isDark: boolean }) {
  const tone = hero(isDark);
  const id = useGradientId('hero');
  return (
    // width/height 100% are load-bearing: this is the only Svg here with a viewBox, and without them
    // it takes its height from the 360×250 aspect instead of the card. On a narrow screen the card is
    // taller than that ratio, which left the bottom of the hero unpainted — the "clipped card".
    <Svg pointerEvents="none" width="100%" height="100%" style={StyleSheet.absoluteFill} viewBox="0 0 360 250" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <LinearGradient id={`${id}Surface`} x1="0.1" y1="0" x2="0.9" y2="1">
          <Stop offset="0" stopColor={tone.gradient[0]} />
          <Stop offset="0.52" stopColor={tone.gradient[1]} />
          <Stop offset="1" stopColor={tone.gradient[2]} />
        </LinearGradient>
        <RadialGradient id={`${id}Pool`} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor={tone.glow} stopOpacity={isDark ? 0.36 : 0.44} />
          <Stop offset="1" stopColor={tone.glow} stopOpacity="0" />
        </RadialGradient>
        <LinearGradient id={`${id}Specular`} x1="0" y1="0" x2="1" y2="0.4">
          <Stop offset="0" stopColor={tone.stroke} stopOpacity="0" />
          {/* Toned down: at 0.26 this arc read as a second white object next to the CTA. */}
          <Stop offset="0.45" stopColor={tone.stroke} stopOpacity={isDark ? 0.12 : 0.15} />
          <Stop offset="1" stopColor={tone.stroke} stopOpacity="0" />
        </LinearGradient>
        <LinearGradient id={`${id}Floor`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#000000" stopOpacity="0" />
          {/* Darker floor: the CTA band sits on this, and a white pill needs a dark floor to read. */}
          <Stop offset="1" stopColor="#000000" stopOpacity={isDark ? 0.46 : 0.36} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width={360} height={250} fill={`url(#${id}Surface)`} />
      {/* One dominant light pool, top-right, matching the corner-glint light source on every card. */}
      <Ellipse cx={330} cy={10} rx={172} ry={126} fill={`url(#${id}Pool)`} />
      {/* The signature specular arc: reads as a curved plane catching light. Kept — it is the hero. */}
      <Path d="M -20 88 C 90 30, 210 26, 392 74 L 392 62 C 208 12, 88 16, -20 76 Z" fill={`url(#${id}Specular)`} />
      {/* Single flow line instead of two: enough texture to feel crafted, not enough to compete. */}
      <G opacity={isDark ? 0.12 : 0.15} stroke={tone.stroke} strokeWidth={1} fill="none" strokeLinecap="round">
        <Path d="M -20 196 C 72 162, 148 180, 220 146 S 318 92, 388 114" />
      </G>
      <Rect x="0" y="150" width={360} height={100} fill={`url(#${id}Floor)`} />
    </Svg>
  );
}

/** One floating orb: a glass sphere with a light pool inside and a rim, drifting on a long loop. */
function HeroOrb({
  size,
  top,
  left,
  right,
  delayFactor,
  isDark,
  active
}: {
  size: number;
  top?: number;
  left?: number;
  right?: number;
  delayFactor: number;
  isDark: boolean;
  active: boolean;
}) {
  const tone = hero(isDark);
  const orbId = useGradientId('orb');
  const drift = useSharedValue(0);

  useEffect(() => {
    if (!active) {
      cancelAnimation(drift);
      return;
    }
    // Long, low-amplitude loop on the UI thread. Cancelled when the screen loses focus so a
    // backgrounded dashboard costs nothing.
    drift.value = withRepeat(
      withTiming(1, { duration: 9000 + delayFactor * 2600, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
    return () => cancelAnimation(drift);
  }, [active, delayFactor, drift]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(drift.value, [0, 1], [0.5, 0.9]),
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [0, delayFactor % 2 === 0 ? 12 : -14]) },
      { translateY: interpolate(drift.value, [0, 1], [0, delayFactor % 2 === 0 ? -10 : 14]) },
      { scale: interpolate(drift.value, [0, 1], [0.96, 1.06]) }
    ]
  }));

  return (
    <Reanimated.View pointerEvents="none" style={[styles.heroOrb, { width: size, height: size, top, left, right }, animatedStyle]}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id={orbId} cx="0.34" cy="0.28" r="0.78">
            <Stop offset="0" stopColor={tone.stroke} stopOpacity={isDark ? 0.3 : 0.5} />
            <Stop offset="0.55" stopColor={tone.glow} stopOpacity={isDark ? 0.16 : 0.22} />
            <Stop offset="1" stopColor={tone.glow} stopOpacity="0.02" />
          </RadialGradient>
        </Defs>
        <Circle cx="50" cy="50" r="48" fill={`url(#${orbId})`} />
        <Circle cx="50" cy="50" r="47" fill="none" stroke={tone.stroke} strokeOpacity={isDark ? 0.16 : 0.28} strokeWidth="1" />
        <Ellipse cx="36" cy="30" rx="15" ry="9" fill={tone.stroke} opacity={isDark ? 0.14 : 0.26} transform="rotate(-24 36 30)" />
      </Svg>
    </Reanimated.View>
  );
}

/**
 * Business-health hero. Layer order: backdrop → floating orbs → content. The CTA and status chip are
 * passed in as nodes so tour anchors and permission checks stay in the screen that owns them.
 */
export function HeroCard({
  businessName,
  headline,
  metricValue,
  metricCaption,
  trendChange,
  statusLabel,
  statusTone = 'neutral',
  cta,
  animate = true
}: {
  businessName: string;
  headline: string;
  metricValue: string;
  metricCaption: string;
  trendChange: number | null;
  statusLabel: string;
  statusTone?: 'neutral' | 'alert';
  cta?: ReactNode;
  animate?: boolean;
}) {
  const isDark = useTheme().dark;
  const tone = hero(isDark);
  const fg = tone.foreground;
  const trendPositive = (trendChange ?? 0) >= 0;
  return (
    <View style={[styles.heroCard, { borderColor: alpha(tone.stroke, isDark ? 0.16 : 0.26) }, shadow(isDark, 'lg')]}>
      <HeroBackdrop isDark={isDark} />
      {/* Two orbs, not three: one anchors the lit corner, one balances the opposite baseline.
          The lower orb is deliberately kept above the CTA band — a pale orb behind a white pill
          merges into one shapeless blob and the CTA loses its edge. */}
      <HeroOrb size={126} top={-34} right={-36} delayFactor={0} isDark={isDark} active={animate} />
      <HeroOrb size={62} top={92} left={-26} delayFactor={1} isDark={isDark} active={animate} />

      <View style={styles.heroInner}>
        {/* 1 — who this is. The signature pulse sits with the name, never alone. */}
        <View style={styles.heroBrandRow}>
          <BrandPulse color={fg.eyebrow} size={13} />
          <Text numberOfLines={1} style={[styles.heroBusiness, { color: fg.primary }]}>{businessName}</Text>
        </View>

        {/* 2 — what this section is. */}
        <Text style={[styles.heroHeadline, { color: fg.muted }]}>{headline}</Text>

        {/* 3 — the number, and the only other thing allowed on its line. */}
        <View style={styles.heroMetricRow}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[styles.heroMetric, { color: fg.primary }]}>
            {metricValue}
          </Text>
          {trendChange != null ? (
            <View style={[styles.heroTrendChip, { backgroundColor: alpha(trendPositive ? '#10B981' : '#F87171', isDark ? 0.26 : 0.3), borderColor: alpha(tone.stroke, 0.18) }]}>
              <Feather name={trendPositive ? 'arrow-up-right' : 'arrow-down-right'} size={iconSizes.xs} color={fg.primary} />
              <Text style={[styles.heroTrendText, { color: fg.primary }]}>{trendPositive ? '+' : ''}{trendChange}%</Text>
            </View>
          ) : null}
        </View>

        {/* 4 — status: one line carrying the live dot, the state, and the supporting figure. */}
        <View style={styles.heroStatusRow}>
          <View style={[styles.heroStatusChip, { backgroundColor: alpha('#000000', 0.3), borderColor: alpha(statusTone === 'alert' ? '#FCA5A5' : tone.stroke, 0.26) }]}>
            <View style={[styles.heroPulseDot, { backgroundColor: statusTone === 'alert' ? '#FCA5A5' : '#6EE7B7' }]} />
            <Text numberOfLines={1} style={[styles.heroStatusText, { color: fg.primary }]}>{statusLabel}</Text>
          </View>
          <Text numberOfLines={1} style={[styles.heroCaption, { color: fg.secondary }]}>{metricCaption}</Text>
        </View>

        {/* 5 — the CTA, on its own baseline with the widest gap on the card above it. */}
        {cta ? <View style={styles.heroFooter}>{cta}</View> : null}
      </View>
    </View>
  );
}

/**
 * The strongest CTA in the product: a lit plate rather than a filled rectangle — vertical gradient,
 * inner top highlight, circular glyph capsule, and a two-layer shadow (a tight contact shadow under
 * a wide ambient one) so it reads as sitting *above* the hero rather than printed on it.
 */
const HERO_CTA_HEIGHT = 58;

export function HeroCta({ label, onPress, haptic }: { label: string; onPress: () => void; haptic: () => void }) {
  const isDark = useTheme().dark;
  const tone = hero(isDark);
  const fillId = useGradientId('ctaFill');
  return (
    <LiftPressable
      onPress={onPress}
      haptic={haptic}
      accessibilityLabel={label}
      lift={2}
      scale={0.965}
      style={[styles.heroCta, styles.heroCtaAmbient]}
    >
      {/* Amber plate with a light rim: the only warm-yellow object on the hero, so nothing behind it
          can flatten its edge. */}
      <View style={[styles.heroCtaContact, { borderColor: alpha('#FFFFFF', 0.4) }]}>
        <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id={fillId} x1="0" y1="0" x2="0.15" y2="1">
              <Stop offset="0" stopColor={tone.cta[0]} />
              <Stop offset="1" stopColor={tone.cta[1]} />
            </LinearGradient>
          </Defs>
          {/* rx must be a real radius, never radii.pill: SVG clamps rx to width/2, so 9999 turned this
              plate into a full ellipse — which is what made the CTA read as a shapeless blob. */}
          <Rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            rx={HERO_CTA_HEIGHT / 2}
            ry={HERO_CTA_HEIGHT / 2}
            fill={`url(#${fillId})`}
          />
        </Svg>
        <View style={[styles.heroCtaInnerHighlight, { backgroundColor: alpha('#FFFFFF', 0.55) }]} />
        <View style={[styles.heroCtaGlyph, { backgroundColor: alpha('#FFFFFF', 0.34) }]}>
          <Feather name="plus" size={iconSizes.md} color={tone.foreground.onCta} strokeWidth={3} />
        </View>
        <Text numberOfLines={1} style={[styles.heroCtaText, { color: tone.foreground.onCta }]}>{label}</Text>
      </View>
    </LiftPressable>
  );
}

/* ------------------------------------------------------------------- kpi ---- */

/** Mini area+line sparkline. Pure SVG, no chart engine — this runs four times per screen. */
function Sparkline({ points, accent, width, height = 30 }: { points: number[]; accent: string; width: number; height?: number }) {
  const sparkId = useGradientId('spark');
  const geometry = useMemo(() => {
    if (points.length < 2) return null;
    const max = Math.max(...points);
    const min = Math.min(...points);
    const span = max - min || 1;
    const stepX = width / (points.length - 1);
    const coords = points.map((value, index) => ({
      x: index * stepX,
      y: height - 3 - ((value - min) / span) * (height - 6)
    }));
    // Cardinal-ish smoothing: midpoint quadratics keep the curve soft without a spline library.
    let line = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 1; i < coords.length; i += 1) {
      const previous = coords[i - 1];
      const current = coords[i];
      const midX = (previous.x + current.x) / 2;
      line += ` Q ${midX} ${previous.y} ${midX} ${(previous.y + current.y) / 2} Q ${midX} ${current.y} ${current.x} ${current.y}`;
    }
    return { line, area: `${line} L ${coords[coords.length - 1].x} ${height} L ${coords[0].x} ${height} Z`, last: coords[coords.length - 1] };
  }, [points, width, height]);

  if (!geometry) return null;
  return (
    <Svg width={width} height={height} pointerEvents="none">
      <Defs>
        <LinearGradient id={sparkId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={accent} stopOpacity="0.28" />
          <Stop offset="1" stopColor={accent} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Path d={geometry.area} fill={`url(#${sparkId})`} />
      <Path d={geometry.line} fill="none" stroke={accent} strokeWidth={2} strokeLinecap="round" />
      <Circle cx={geometry.last.x} cy={geometry.last.y} r={2.6} fill={accent} />
    </Svg>
  );
}

export type KpiTone = SemanticAccent | 'primary';

/**
 * Premium KPI widget: lit gradient surface, gradient icon capsule, tabular figure, direction chip,
 * and an optional sparkline drawn from real per-day data. Every card answers "is this good?" —
 * either with a delta against the previous day or with a tone-carrying support line.
 */
const KPI_SPARK_HEIGHT = 18;

export function KpiCard({
  label,
  value,
  caption,
  tone = 'primary',
  icon,
  delta,
  deltaCaption,
  spark,
  meterFraction,
  onPress
}: {
  label: string;
  value: string | number;
  caption: string;
  tone?: KpiTone;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  delta?: number | null;
  deltaCaption?: string;
  spark?: number[];
  /** 0–1. Drawn as a share meter when a card has no honest time series to plot. */
  meterFraction?: number | null;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const accents = semantic(isDark);
  const lighting = glass(isDark);
  const fills = surfaceGradient(isDark);
  const washId = useGradientId('kpiWash');
  const { width: screenWidth } = useWindowDimensions();
  // Two cards per row inside the screen padding, minus the gutter between them and the card padding.
  const sparkWidth = Math.max(60, (screenWidth - spacing.screenPadding * 2 - spacing.sm) / 2 - spacing.sm * 2 - 6);
  const accent = tone === 'primary' ? (isDark ? colors.primary : colors.primaryStrong) : accents[tone];
  const deltaPositive = (delta ?? 0) >= 0;
  const deltaColor = delta == null ? accent : deltaPositive ? accents.revenue : colors.destructive;

  const body = (
    <View
      style={[
        styles.kpiCard,
        { borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.07) },
        shadow(isDark, 'sm')
      ]}
    >
      {/* Same surface recipe as QuickTile — raised gradient, TILE_RADIUS, glint — so the KPI block and
          the quick-action block read as one set of tiles instead of two unrelated card styles. */}
      <SurfaceFill colors={fills.raised} highlight={lighting.highlight} radius={TILE_RADIUS} glint isDark={isDark} />
      {/* Tone wash: a whisper of the semantic colour in the corner the icon sits in. */}
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id={washId} cx="0.1" cy="0.04" r="0.9">
            <Stop offset="0" stopColor={accent} stopOpacity={isDark ? 0.15 : 0.09} />
            <Stop offset="1" stopColor={accent} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" rx={TILE_RADIUS} ry={TILE_RADIUS} fill={`url(#${washId})`} />
      </Svg>

      {/* Fixed-height zones. Every card spends the same vertical budget on the same things, so the
          four of them share one baseline grid whether or not they carry a delta or a sparkline. */}
      <View style={styles.kpiTopRow}>
        <IconCapsule icon={icon} accent={accent} isDark={isDark} size={circleSizes.md} iconSize={iconSizes.md} />
        <View style={styles.kpiDeltaSlot}>
          {delta != null ? (
            <View style={[styles.kpiDeltaChip, { backgroundColor: alpha(deltaColor, isDark ? 0.2 : 0.12) }]}>
              <Feather name={deltaPositive ? 'trending-up' : 'trending-down'} size={10} color={deltaColor} />
              <Text style={[styles.kpiDeltaText, { color: deltaColor }]}>{deltaPositive ? '+' : ''}{delta}%</Text>
            </View>
          ) : null}
        </View>
      </View>

      <Text numberOfLines={1} style={[styles.kpiLabel, { color: theme.colors.onSurfaceVariant }]}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={[styles.kpiValue, { color: theme.colors.onSurface }]}>
        {value}
      </Text>
      <Text numberOfLines={1} style={[styles.kpiCaption, { color: theme.colors.onSurfaceVariant }]}>
        {deltaCaption ?? caption}
      </Text>

      <View style={styles.kpiSparkSlot}>
        {spark && spark.length > 1 ? (
          <Sparkline points={spark} accent={accent} width={sparkWidth} height={KPI_SPARK_HEIGHT} />
        ) : meterFraction != null ? (
          // Share meter: same vertical weight as a sparkline, still a real figure.
          <View style={[styles.kpiMeterTrack, { backgroundColor: alpha(accent, isDark ? 0.18 : 0.12) }]}>
            <View style={[styles.kpiMeterFill, { backgroundColor: accent, width: `${Math.min(100, Math.max(3, meterFraction * 100))}%` }]} />
          </View>
        ) : (
          <View style={[styles.kpiRule, { backgroundColor: alpha(accent, isDark ? 0.22 : 0.14) }]} />
        )}
      </View>
    </View>
  );

  if (!onPress) return <View style={styles.kpiCell}>{body}</View>;
  // The flex:1 cell must be the View, not LiftPressable's style: LiftPressable puts that style on the
  // inner Pressable, so `flex: 1` landed on a node whose animated wrapper had no flex of its own and
  // the card collapsed to its content width, leaving the row short of the screen edge.
  return (
    <View style={styles.kpiCell}>
      <LiftPressable onPress={onPress} accessibilityLabel={`${label}: ${value}. ${deltaCaption ?? caption}`}>
        {body}
      </LiftPressable>
    </View>
  );
}

/* --------------------------------------------------------------- alerts ---- */

/** High-urgency alert: tone-washed surface, left accent bar, amount-first, explicit CTA pill. */
export function DuesAlert({
  amount,
  message,
  supporting,
  actionLabel,
  onPress,
  accessibilityLabel
}: {
  amount: string;
  message: string;
  supporting: string;
  actionLabel: string;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const accent = colors.destructive;
  const washId = useGradientId('duesWash');
  return (
    <LiftPressable
      onPress={onPress}
      accessibilityLabel={accessibilityLabel ?? `${amount} outstanding. ${message}. ${actionLabel}`}
      style={[styles.duesCard, { borderColor: alpha(accent, isDark ? 0.36 : 0.22) }, shadow(isDark, 'sm')]}
    >
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={washId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={accent} stopOpacity={isDark ? 0.2 : 0.11} />
            <Stop offset="1" stopColor={accent} stopOpacity={isDark ? 0.08 : 0.04} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" rx={radii.xl} ry={radii.xl} fill={`url(#${washId})`} />
      </Svg>
      <View style={[styles.duesAccentBar, { backgroundColor: accent }]} />
      <View style={styles.duesBody}>
        <View style={styles.duesHeadRow}>
          <View style={[styles.duesIcon, { backgroundColor: alpha(accent, isDark ? 0.28 : 0.16), borderColor: alpha(accent, isDark ? 0.34 : 0.2) }]}>
            <Feather name="alert-circle" size={iconSizes.md} color={accent} />
          </View>
          <View style={styles.flex1}>
            <Text numberOfLines={1} style={[styles.duesLabel, { color: accent }]}>MONEY TO COLLECT</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.duesAmount, { color: theme.colors.onSurface }]}>
              {amount}
            </Text>
          </View>
        </View>
        <Text numberOfLines={2} style={[styles.duesMessage, { color: theme.colors.onSurfaceVariant }]}>{message}</Text>
        <View style={styles.duesFooter}>
          <Text numberOfLines={1} style={[styles.duesSupporting, { color: theme.colors.onSurfaceVariant }]}>{supporting}</Text>
          <View style={[styles.duesCta, { backgroundColor: accent }]}>
            <MaterialCommunityIcons name="whatsapp" size={iconSizes.sm} color="#FFFFFF" />
            <Text style={styles.duesCtaText}>{actionLabel}</Text>
          </View>
        </View>
      </View>
    </LiftPressable>
  );
}

/* -------------------------------------------------------- quick actions ---- */

/**
 * Feature tile, launcher-style: a tall lit plate with a large gradient icon capsule stacked above the
 * title. Vertical stacking is what separates a *shortcut* from a settings row — no chevron, because a
 * whole tile that lifts under the thumb already says "tappable".
 */
export function QuickTile({
  label,
  subtitle,
  icon,
  tone,
  onPress
}: {
  label: string;
  subtitle: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  tone: KpiTone;
  onPress: () => void;
}) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const accents = semantic(isDark);
  const lighting = glass(isDark);
  const fills = surfaceGradient(isDark);
  const accent = tone === 'primary' ? (isDark ? colors.primary : colors.primaryStrong) : accents[tone];
  return (
    <LiftPressable
      onPress={onPress}
      accessibilityLabel={`${label}. ${subtitle}`}
      lift={1}
      style={[styles.quickTile, { borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.07) }, shadow(isDark, 'sm')]}
    >
      <SurfaceFill colors={fills.raised} highlight={lighting.highlight} radius={TILE_RADIUS} glint isDark={isDark} />
      <IconCapsule icon={icon} accent={accent} isDark={isDark} size={circleSizes.lg} iconSize={iconSizes.lg + 2} />
      <Text numberOfLines={1} style={[styles.quickLabel, { color: theme.colors.onSurface }]}>{label}</Text>
      <Text numberOfLines={1} style={[styles.quickSubtitle, { color: theme.colors.onSurfaceVariant }]}>{subtitle}</Text>
    </LiftPressable>
  );
}

/* ------------------------------------------------------- segmented range ---- */

/** Sliding-pill segmented control. The indicator translates; the labels never move. */
export function RangeSegmented<T extends string>({
  options,
  value,
  onChange
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (next: T) => void;
}) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const activeIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const offset = useSharedValue(activeIndex);
  useEffect(() => { offset.value = withSpring(activeIndex, springs.snap); }, [activeIndex, offset]);
  const indicatorStyle = useAnimatedStyle(() => ({
    left: `${(offset.value * 100) / options.length}%`
  }));
  return (
    <View style={[styles.segmented, { backgroundColor: isDark ? colors.surfaceContainerLowest : colors.surfaceContainer, borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.08) }]}>
      <Reanimated.View
        style={[
          styles.segmentIndicator,
          { width: `${100 / options.length}%` },
          indicatorStyle
        ]}
      >
        <View style={[styles.segmentIndicatorFill, { backgroundColor: isDark ? colors.surfaceContainerHigh : colors.card }, shadow(isDark, 'xs')]} />
      </Reanimated.View>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => { if (!active) { tapSelection(); onChange(option.value); } }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`Show ${option.label}`}
            style={styles.segment}
          >
            <Text style={[styles.segmentText, { color: active ? (isDark ? colors.primary : colors.primaryStrong) : theme.colors.onSurfaceVariant }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------ recent activity ---- */

/** Card that groups the activity rows into one object with hairline dividers between them. */
export function ActivityGroup({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const lighting = glass(isDark);
  const fills = surfaceGradient(isDark);
  return (
    <View style={[styles.activityGroup, { borderColor: isDark ? colors.border : alpha(colors.primaryStrong, 0.07) }, shadow(isDark, 'xs')]}>
      <SurfaceFill colors={fills.card} highlight={lighting.highlight} radius={radii.xl} glint isDark={isDark} />
      {children}
    </View>
  );
}

/** One activity row: avatar + name/time on the left, amount + status on the right rail. */
export const ActivityRow = memo(function ActivityRow({
  name,
  activity,
  time,
  amount,
  statusLabel,
  positive,
  first,
  onPress
}: {
  name: string;
  activity: string;
  time: string;
  amount: string;
  statusLabel: string;
  positive: boolean;
  first?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const accents = semantic(isDark);
  const accent = positive ? accents.revenue : accents.pending;
  const initials = useMemo(() => {
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map((part) => part.charAt(0).toUpperCase()).join('') || '?';
  }, [name]);
  return (
    <Pressable
      onPress={() => { tapLight(); onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${activity}, ${amount}, ${statusLabel}, ${time}`}
      style={({ pressed }) => [
        styles.activityRow,
        !first ? { borderTopColor: isDark ? alpha('#FFFFFF', 0.06) : alpha(colors.primaryStrong, 0.07), borderTopWidth: StyleSheet.hairlineWidth } : null,
        pressed ? { backgroundColor: alpha(colors.primary, isDark ? 0.1 : 0.05) } : null
      ]}
    >
      <View style={[styles.activityAvatar, { backgroundColor: alpha(accent, isDark ? 0.2 : 0.12), borderColor: alpha(accent, isDark ? 0.3 : 0.16) }]}>
        <Text style={[styles.activityInitials, { color: accent }]}>{initials}</Text>
        <View style={[styles.activityBadge, { backgroundColor: accent, borderColor: colors.card }]}>
          <MaterialCommunityIcons name={positive ? 'check' : 'clock-outline'} size={9} color={isDark ? '#0B0D12' : '#FFFFFF'} />
        </View>
      </View>
      <View style={styles.flex1}>
        <Text numberOfLines={1} style={[styles.activityName, { color: theme.colors.onSurface }]}>{name}</Text>
        <Text numberOfLines={1} style={[styles.activityMeta, { color: theme.colors.onSurfaceVariant }]}>{activity} · {time}</Text>
      </View>
      {/* Fixed-width right rail: amounts and status pills share one right edge instead of each
          hugging its own content, which is what stops the column looking ragged. */}
      <View style={styles.activityRight}>
        <Text numberOfLines={1} style={[styles.activityAmount, { color: theme.colors.onSurface }]}>{amount}</Text>
        <View style={[styles.activityStatusPill, { backgroundColor: alpha(accent, isDark ? 0.2 : 0.12) }]}>
          <Text numberOfLines={1} style={[styles.activityStatusText, { color: accent }]}>{statusLabel}</Text>
        </View>
      </View>
    </Pressable>
  );
});

/* --------------------------------------------------------- empty state ---- */

/** Illustrated empty state: floating invoice card, light pool, orbiting dots. */
export function DashboardEmpty({ onCreate, canCreate }: { onCreate: () => void; canCreate: boolean }) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  const accent = isDark ? colors.primary : colors.primaryStrong;
  const id = useGradientId('empty');
  const float = useSharedValue(0);
  useEffect(() => {
    float.value = withRepeat(withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(float);
  }, [float]);
  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(float.value, [0, 1], [0, -8]) }]
  }));

  return (
    <View style={styles.emptyWrap}>
      <Reanimated.View style={floatStyle}>
        {/* 25% larger than before: this is the one moment on the screen meant to delight, so it gets
            room. Same viewBox, so every proportion inside is preserved. */}
        <Svg width={212} height={166} viewBox="0 0 168 132">
          <Defs>
            <RadialGradient id={`${id}Pool`} cx="0.5" cy="0.55" r="0.5">
              <Stop offset="0" stopColor={accent} stopOpacity={isDark ? 0.28 : 0.18} />
              <Stop offset="1" stopColor={accent} stopOpacity="0" />
            </RadialGradient>
            <LinearGradient id={`${id}Doc`} x1="0" y1="0" x2="0.6" y2="1">
              <Stop offset="0" stopColor={isDark ? '#262B38' : '#FFFFFF'} />
              <Stop offset="1" stopColor={isDark ? '#1A1E27' : '#F1F1FA'} />
            </LinearGradient>
            <LinearGradient id={`${id}Accent`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={accent} />
              <Stop offset="1" stopColor={colors.violet} />
            </LinearGradient>
          </Defs>
          <Ellipse cx="84" cy="74" rx="76" ry="52" fill={`url(#${id}Pool)`} />
          {/* Back card, slightly rotated, to imply a stack. */}
          <Rect x="46" y="22" width="76" height="90" rx="12" fill={`url(#${id}Doc)`} opacity={0.55} transform="rotate(-9 84 68)" stroke={alpha(accent, 0.2)} strokeWidth="1" />
          {/* Front invoice card. */}
          <Rect x="52" y="18" width="76" height="94" rx="12" fill={`url(#${id}Doc)`} stroke={alpha(accent, isDark ? 0.34 : 0.22)} strokeWidth="1" />
          <Rect x="62" y="30" width="34" height="7" rx="3.5" fill={`url(#${id}Accent)`} />
          <SvgLine x1="62" y1="49" x2="118" y2="49" stroke={alpha(accent, 0.3)} strokeWidth="3" strokeLinecap="round" />
          <SvgLine x1="62" y1="60" x2="104" y2="60" stroke={alpha(accent, 0.22)} strokeWidth="3" strokeLinecap="round" />
          <SvgLine x1="62" y1="71" x2="112" y2="71" stroke={alpha(accent, 0.22)} strokeWidth="3" strokeLinecap="round" />
          <Rect x="62" y="86" width="42" height="14" rx="7" fill={alpha(colors.accent, isDark ? 0.3 : 0.18)} />
          <Circle cx="104" cy="93" r="3" fill={colors.accent} />
          {/* Orbiting dots. */}
          <Circle cx="34" cy="40" r="4" fill={accent} opacity={0.55} />
          <Circle cx="140" cy="52" r="6" fill={colors.violet} opacity={0.4} />
          <Circle cx="126" cy="108" r="3.5" fill={colors.accent} opacity={0.6} />
        </Svg>
      </Reanimated.View>
      <Text style={[styles.emptyTitle, { color: theme.colors.onSurface }]}>Your first invoice starts here</Text>
      <Text style={[styles.emptyMessage, { color: theme.colors.onSurfaceVariant }]}>
        Bill a customer in under a minute — BillJi keeps the numbers, the reminders and the GST in order for you.
      </Text>
      {canCreate ? (
        <LiftPressable
          onPress={onCreate}
          accessibilityLabel="Create your first invoice"
          lift={2}
          scale={0.965}
          style={[styles.emptyCta, { backgroundColor: accent }, shadow(isDark, 'lg')]}
        >
          <View style={[styles.emptyCtaGlyph, { backgroundColor: alpha('#FFFFFF', 0.18) }]}>
            <Feather name="plus" size={iconSizes.sm} color="#FFFFFF" strokeWidth={3} />
          </View>
          <Text style={styles.emptyCtaText}>Create first invoice</Text>
        </LiftPressable>
      ) : null}
      <Text style={[styles.emptyHint, { color: theme.colors.onSurfaceVariant }]}>Tip: add a customer first so the next one is even faster.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  activityAmount: { ...fontStyles.bold, ...numeric, fontSize: 15, letterSpacing: -0.35, textAlign: 'right' },
  activityAvatar: { alignItems: 'center', borderRadius: radii.pill, borderWidth: 1, height: circleSizes.md, justifyContent: 'center', width: circleSizes.md },
  activityBadge: { alignItems: 'center', borderRadius: radii.pill, borderWidth: 1.5, bottom: -1, height: 16, justifyContent: 'center', position: 'absolute', right: -1, width: 16 },
  activityGroup: { borderRadius: radii.xl, borderWidth: 1, marginBottom: spacing.screenPadding, overflow: 'hidden' },
  activityInitials: { ...fontStyles.bold, fontSize: 13.5, letterSpacing: -0.3 },
  activityMeta: { ...typeScale.caption, fontSize: 11.5, marginTop: 2 },
  activityName: { ...fontStyles.bold, fontSize: 15, letterSpacing: -0.3 },
  activityRight: { alignItems: 'flex-end', gap: 5, minWidth: 82 },
  activityRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 66, paddingHorizontal: spacing.md - 2, paddingVertical: spacing.sm },
  activityStatusPill: { alignItems: 'center', borderRadius: radii.pill, minWidth: 60, paddingHorizontal: spacing.xs - 1, paddingVertical: 2 },
  activityStatusText: { ...fontStyles.bold, fontSize: 9.5, letterSpacing: 0.5 },

  duesAccentBar: { bottom: 0, left: 0, position: 'absolute', top: 0, width: 4 },
  duesAmount: { ...fontStyles.bold, ...numeric, fontSize: 26, letterSpacing: -0.9, marginTop: 2 },
  duesBody: { gap: spacing.xs, paddingLeft: spacing.base },
  duesCard: { borderRadius: radii.xl, borderWidth: 1, marginBottom: spacing.screenPadding, overflow: 'hidden', padding: spacing.md },
  duesCta: { alignItems: 'center', borderRadius: radii.pill, flexDirection: 'row', gap: spacing.base + 2, paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs + 1 },
  duesCtaText: { ...fontStyles.bold, color: '#FFFFFF', fontSize: 12.5 },
  duesFooter: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between', marginTop: spacing.base },
  duesHeadRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  duesIcon: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  duesLabel: { ...fontStyles.bold, fontSize: 10, letterSpacing: 1 },
  duesMessage: { ...typeScale.caption, fontSize: 12.5, lineHeight: 17 },
  duesSupporting: { ...typeScale.smallCaption, flexShrink: 1 },

  emptyCta: {
    alignItems: 'center',
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.xs + 2,
    height: 54,
    marginTop: spacing.lg,
    paddingLeft: spacing.xs,
    paddingRight: spacing.lg
  },
  emptyCtaGlyph: { alignItems: 'center', borderRadius: radii.pill, height: 38, justifyContent: 'center', width: 38 },
  emptyCtaText: { ...fontStyles.bold, color: '#FFFFFF', fontSize: 15, letterSpacing: -0.1 },
  emptyHint: { ...typeScale.smallCaption, marginTop: spacing.md, textAlign: 'center' },
  emptyMessage: { ...typeScale.bodyPrimary, fontSize: 13.5, lineHeight: 20, marginTop: spacing.xs, maxWidth: 306, textAlign: 'center' },
  emptyTitle: { ...typeScale.heroHeadline, fontSize: 20, letterSpacing: -0.5, marginTop: spacing.sm, textAlign: 'center' },
  emptyWrap: { alignItems: 'center', paddingBottom: spacing.sectionGapLg, paddingTop: spacing.xs },

  flex1: { flex: 1, minWidth: 0 },

  iconCapsule: { alignItems: 'center', borderRadius: radii.lg, justifyContent: 'center', overflow: 'hidden' },
  iconCapsuleRim: { borderColor: 'transparent', borderRadius: radii.lg, borderWidth: 1, bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },

  heroBrandRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  heroBusiness: { ...fontStyles.bold, flexShrink: 1, fontSize: 15.5, letterSpacing: -0.3 },
  heroCaption: { ...typeScale.smallCaption, flexShrink: 1, fontSize: 11.5 },
  heroCard: { borderRadius: 30, borderWidth: 1, marginBottom: spacing.screenPadding, overflow: 'hidden' },
  heroCta: { borderRadius: radii.pill, flex: 1 },
  // Shadow tinted warm brown, so the pill casts light rather than sitting in a cold grey hole.
  heroCtaAmbient: { elevation: 12, shadowColor: '#3A2408', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 20 },
  heroCtaContact: {
    alignItems: 'center',
    borderRadius: HERO_CTA_HEIGHT / 2,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs + 2,
    height: HERO_CTA_HEIGHT,
    overflow: 'hidden',
    paddingLeft: spacing.xs + 2,
    paddingRight: spacing.lg
  },
  heroCtaGlyph: { alignItems: 'center', borderRadius: radii.pill, height: circleSizes.xl, justifyContent: 'center', width: circleSizes.xl },
  heroCtaInnerHighlight: { height: StyleSheet.hairlineWidth, left: spacing.lg, position: 'absolute', right: spacing.lg, top: 0 },
  heroCtaText: { ...fontStyles.bold, flexShrink: 1, fontSize: 16, letterSpacing: -0.3 },
  // No socket band needed now the CTA is emerald — the hue does the separating.
  heroFooter: { flexDirection: 'row', marginTop: spacing.lg },
  // md above the eyebrow, lg above the CTA — the CTA keeps the widest gap on the card.
  heroHeadline: { ...fontStyles.semiBold, fontSize: 10.5, letterSpacing: 1.2, marginTop: spacing.md, textTransform: 'uppercase' },
  heroInner: { padding: spacing.screenPadding + 2 },
  heroMetric: { ...fontStyles.bold, ...numeric, flexShrink: 1, fontSize: 40, letterSpacing: -1.8, lineHeight: 46 },
  heroMetricRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs + 2, marginTop: spacing.base + 2 },
  heroOrb: { position: 'absolute' },
  heroPulseDot: { borderRadius: radii.pill, height: 6, width: 6 },
  heroStatusChip: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.base + 2,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: spacing.base + 1
  },
  heroStatusRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm },
  heroStatusText: { ...fontStyles.bold, fontSize: 10, letterSpacing: 0.4 },
  heroTrendChip: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.base,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.base - 1
  },
  heroTrendText: { ...fontStyles.bold, ...numeric, fontSize: 12 },

  // Zone budget per card, summing to the 154pt minHeight:
  //   padding 12 · capsule row 42 · label 6+13 · value 2+25 · caption 2+14 · chart 8+18 · padding 12
  kpiCaption: { ...typeScale.smallCaption, fontSize: 11, height: 14, marginTop: 2 },
  kpiCard: { borderRadius: TILE_RADIUS, borderWidth: 1, minHeight: 154, overflow: 'hidden', padding: spacing.sm },
  kpiCell: { flex: 1 },
  kpiDeltaChip: { alignItems: 'center', borderRadius: radii.pill, flexDirection: 'row', gap: 3, paddingHorizontal: spacing.xs - 1, paddingVertical: 2 },
  kpiDeltaSlot: { alignItems: 'flex-end', height: 18, justifyContent: 'center' },
  kpiDeltaText: { ...fontStyles.bold, ...numeric, fontSize: 10.5 },
  kpiLabel: { ...fontStyles.semiBold, fontSize: 10, letterSpacing: 1, lineHeight: 13, marginTop: spacing.base + 2, textTransform: 'uppercase' },
  kpiMeterFill: { borderRadius: radii.pill, height: 5 },
  kpiMeterTrack: { borderRadius: radii.pill, height: 5, overflow: 'hidden', width: '100%' },
  kpiRule: { borderRadius: radii.pill, height: 4, width: 28 },
  kpiSparkSlot: { height: KPI_SPARK_HEIGHT, justifyContent: 'flex-end', marginTop: spacing.xs },
  kpiTopRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, justifyContent: 'space-between' },
  kpiValue: { ...fontStyles.bold, ...numeric, fontSize: 22, letterSpacing: -0.8, lineHeight: 25, marginTop: 2 },

  quickLabel: { ...fontStyles.bold, fontSize: 15, letterSpacing: -0.3, marginTop: spacing.xs },
  quickSubtitle: { ...typeScale.smallCaption, fontSize: 11.5, marginTop: 2 },
  quickTile: {
    alignItems: 'flex-start',
    borderRadius: TILE_RADIUS,
    borderWidth: 1,
    minHeight: 118,
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm
  },

  sectionAction: { alignItems: 'center', borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.base, paddingHorizontal: spacing.sm, paddingVertical: spacing.base + 2 },
  sectionActionText: { ...fontStyles.bold, fontSize: 12 },
  sectionCaption: { ...typeScale.smallCaption, fontSize: 11.5, marginTop: 1 },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs + 2, justifyContent: 'space-between', marginBottom: spacing.headingGap },
  // Optical alignment: the mark's box is nudged so the title's cap-height, not its line-box, lines up.
  sectionMark: { alignItems: 'center', height: 16, justifyContent: 'center', paddingTop: 1, width: 11 },
  sectionTitle: { ...typeScale.sectionTitle, ...fontStyles.bold, fontSize: 16.5, letterSpacing: -0.35 },

  segment: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingVertical: spacing.base + 3 },
  segmentIndicator: { bottom: 3, position: 'absolute', top: 3 },
  segmentIndicatorFill: { borderRadius: radii.pill, flex: 1, marginHorizontal: 3 },
  segmentText: { ...fontStyles.bold, fontSize: 11.5, letterSpacing: 0.2 },
  segmented: { borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', padding: 0, position: 'relative' },

  topHighlight: { height: StyleSheet.hairlineWidth, left: spacing.md, position: 'absolute', right: spacing.md, top: 0 }
});
