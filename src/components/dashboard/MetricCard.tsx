import { memo, useCallback, useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LucideIcon } from 'lucide-react-native';
import Reanimated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from 'react-native-paper';
import { motion, shadows } from '@/design-system';
import { Sparkline } from '@/components/dashboard/Sparkline';
import { FittedAmount } from '@/components/dashboard/FittedAmount';
import { alpha, appColors, fontStyles } from '@/theme/theme';

const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable);
const CARD_PADDING = 14;

type Props = {
  label: string;
  value: string | number;
  /** Short form (₹1.25L) shown when the full figure will not fit; tap reveals the full one. */
  valueCompact?: string;
  hint?: string;
  icon: LucideIcon;
  accent: string;
  sparkData?: number[];
  onPress?: () => void;
};

export const MetricCard = memo(function MetricCard({
  label,
  value,
  valueCompact,
  hint,
  icon: Icon,
  accent,
  sparkData,
  onPress
}: Props) {
  const theme = useTheme();
  const colors = appColors(theme.dark);
  const { width } = useWindowDimensions();
  const scale = useSharedValue(1);
  // Measured rather than derived: the card's width comes from a flex basis plus the
  // row gap, which the window width alone does not tell us.
  const [innerWidth, setInnerWidth] = useState(140);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setInnerWidth(Math.max(40, event.nativeEvent.layout.width - CARD_PADDING * 2 - 2));
  }, []);

  // Two per row on phones so labels and hints have room; the reference's 4-up
  // only comes back once each card can still hold "Collected this month".
  const basisStyle = useMemo(() => ({ flexBasis: width >= 700 ? '22%' : '47%' } as const), [width]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  const onPressIn = useCallback(() => {
    scale.value = withTiming(0.98, { duration: motion.elevation });
  }, [scale]);

  const onPressOut = useCallback(() => {
    scale.value = withTiming(1, { duration: motion.elevation });
  }, [scale]);

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={`${label} ${value}`}
      onPress={onPress}
      onLayout={onLayout}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[
        styles.card,
        basisStyle,
        shadows.card,
        {
          backgroundColor: colors.card,
          borderColor: theme.dark ? colors.border : alpha(colors.primaryStrong, 0.06)
        },
        animatedStyle
      ]}
    >
      <View style={[styles.iconTile, { backgroundColor: alpha(accent, theme.dark ? 0.22 : 0.13) }]}>
        <Icon size={17} color={accent} strokeWidth={2.2} />
      </View>
      <Text style={[styles.label, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>
        {label}
      </Text>
      <FittedAmount
        full={String(value)}
        compact={valueCompact}
        available={innerWidth}
        maxFontSize={22}
        minFontSize={15}
        compactBelow={17}
        style={styles.value}
        color={theme.colors.onSurface}
      />
      {hint ? (
        <Text style={[styles.hint, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
      <Sparkline color={accent} data={sparkData} width={120} height={26} />
    </AnimatedPressable>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: 1,
    flexGrow: 1,
    minHeight: 152,
    minWidth: 0,
    padding: CARD_PADDING
  },
  hint: { ...fontStyles.medium, fontSize: 11, lineHeight: 15, marginTop: 4 },
  iconTile: {
    alignItems: 'center',
    borderRadius: 11,
    height: 34,
    justifyContent: 'center',
    marginBottom: 12,
    width: 34
  },
  label: { ...fontStyles.semiBold, fontSize: 10, letterSpacing: 0.7, textTransform: 'uppercase' },
  value: { ...fontStyles.bold, fontSize: 22, letterSpacing: -0.6, lineHeight: 27, marginTop: 6 }
});
