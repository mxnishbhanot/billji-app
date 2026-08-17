import { memo, ReactNode, useCallback } from 'react';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from 'react-native-paper';
import { motion, shadows } from '@/design-system';
import { appColors, fontStyles, radii, spacing } from '@/theme/theme';

const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable);

type Props = {
  label: string;
  onPress?: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
};

export const PrimaryButton = memo(function PrimaryButton({
  label,
  onPress,
  icon,
  disabled,
  style,
  accessibilityLabel
}: Props) {
  const theme = useTheme();
  const colors = appColors(theme.dark);
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  const onPressIn = useCallback(() => {
    scale.value = withTiming(0.97, { duration: motion.tap });
  }, [scale]);

  const onPressOut = useCallback(() => {
    scale.value = withTiming(1, { duration: motion.tap });
  }, [scale]);

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      disabled={disabled}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[styles.pressable, animatedStyle, style, disabled ? styles.disabled : null]}
    >
      <LinearGradient
        colors={[colors.ctaStart, colors.ctaEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradient, shadows.cta]}
      >
        {icon}
        <Text style={styles.label}>{label}</Text>
      </LinearGradient>
    </AnimatedPressable>
  );
});

const styles = StyleSheet.create({
  disabled: { opacity: 0.55 },
  gradient: {
    alignItems: 'center',
    borderRadius: radii.button,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: 12
  },
  label: { ...fontStyles.bold, color: '#FFFFFF', fontSize: 16, letterSpacing: -0.2 },
  pressable: { borderRadius: radii.button }
});
