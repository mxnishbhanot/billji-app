import { memo, ReactNode, useCallback } from 'react';
import { Pressable, StyleSheet, ViewStyle } from 'react-native';
import { LucideIcon } from 'lucide-react-native';
import Reanimated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from 'react-native-paper';
import { motion, shadows } from '@/design-system';
import { alpha, appColors, radii } from '@/theme/theme';

const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable);

type Props = {
  icon: LucideIcon;
  onPress?: () => void;
  accessibilityLabel: string;
  size?: number;
  tone?: 'soft' | 'ghost';
  color?: string;
  badge?: ReactNode;
  style?: ViewStyle;
};

export const IconButton = memo(function IconButton({
  icon: Icon,
  onPress,
  accessibilityLabel,
  size = 20,
  tone = 'soft',
  color,
  badge,
  style
}: Props) {
  const theme = useTheme();
  const colors = appColors(theme.dark);
  const scale = useSharedValue(1);
  const iconColor = color || theme.colors.onSurface;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  const onPressIn = useCallback(() => {
    scale.value = withTiming(0.92, { duration: motion.tap });
  }, [scale]);

  const onPressOut = useCallback(() => {
    scale.value = withTiming(1, { duration: motion.tap });
  }, [scale]);

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={10}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[
        styles.button,
        tone === 'soft'
          ? [
              shadows.card,
              {
                backgroundColor: colors.card,
                borderColor: theme.dark ? colors.border : alpha(colors.primaryStrong, 0.07),
                borderWidth: 1
              }
            ]
          : { backgroundColor: 'transparent' },
        animatedStyle,
        style
      ]}
    >
      <Icon size={size} color={iconColor} strokeWidth={2} />
      {badge}
    </AnimatedPressable>
  );
});

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: radii.full,
    height: 42,
    justifyContent: 'center',
    width: 42
  }
});
