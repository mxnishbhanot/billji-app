import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LucideIcon } from 'lucide-react-native';
import Reanimated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from 'react-native-paper';
import { motion, shadows } from '@/design-system';
import { alpha, appColors, fontStyles, radii, spacing, typeScale } from '@/theme/theme';

const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable);

type Props = {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  accent: string;
  onPress?: () => void;
};

export const QuickActionCard = memo(function QuickActionCard({
  title,
  subtitle,
  icon: Icon,
  accent,
  onPress
}: Props) {
  const theme = useTheme();
  const colors = appColors(theme.dark);
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  const onPressIn = useCallback(() => {
    scale.value = withTiming(0.97, { duration: motion.elevation });
  }, [scale]);

  const onPressOut = useCallback(() => {
    scale.value = withTiming(1, { duration: motion.elevation });
  }, [scale]);

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[
        styles.card,
        shadows.action,
        {
          backgroundColor: colors.card,
          borderColor: theme.dark ? colors.border : alpha(colors.primaryStrong, 0.06)
        },
        animatedStyle
      ]}
    >
      <View style={[styles.iconTile, { backgroundColor: alpha(accent, theme.dark ? 0.22 : 0.12) }]}>
        <Icon size={22} color={accent} strokeWidth={2} />
      </View>
      <Text style={[styles.title, { color: theme.colors.onSurface }]}>{title}</Text>
      <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>{subtitle}</Text>
    </AnimatedPressable>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    flex: 1,
    minHeight: 118,
    padding: spacing.cardPadding
  },
  iconTile: {
    alignItems: 'center',
    borderRadius: radii.md,
    height: 40,
    justifyContent: 'center',
    marginBottom: 12,
    width: 40
  },
  subtitle: { ...typeScale.caption, fontSize: 12, marginTop: 4 },
  title: { ...fontStyles.bold, fontSize: 15 }
});
