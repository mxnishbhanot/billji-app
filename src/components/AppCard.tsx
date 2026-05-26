import { ReactNode } from 'react';
import { StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { Card, useTheme } from 'react-native-paper';
import { alpha, appColors, radii, spacing } from '@/theme/theme';

type Props = { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void };
export function AppCard({ children, style, onPress }: Props) {
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = appColors(isDark);
  return (
    <Card
      mode="outlined"
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: isDark ? theme.colors.outlineVariant : alpha(colors.primaryStrong, 0.06),
          elevation: isDark ? 0 : 2,
          shadowColor: isDark ? theme.colors.primary : colors.primaryStrong,
          shadowOpacity: isDark ? 0.08 : 0.05
        },
        style
      ]}
      onPress={onPress}
    >
      <Card.Content style={styles.content}>{children}</Card.Content>
    </Card>
  );
}
const styles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    elevation: 2,
    marginBottom: spacing.gridGap,
    shadowColor: '#4338CA',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 20
  },
  content: { padding: spacing.cardPadding }
});
