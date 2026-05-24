import { ReactNode } from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { Card, useTheme } from 'react-native-paper';

type Props = { children: ReactNode; style?: ViewStyle; onPress?: () => void };
export function AppCard({ children, style, onPress }: Props) {
  const theme = useTheme();
  return (
    <Card
      mode="elevated"
      style={[styles.card, { backgroundColor: theme.colors.elevation.level1, borderColor: theme.colors.outlineVariant }, style]}
      contentStyle={styles.content}
      onPress={onPress}
    >
      <Card.Content>{children}</Card.Content>
    </Card>
  );
}
const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    borderWidth: 1,
    elevation: 2,
    marginBottom: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 24
  },
  content: { paddingVertical: 4 }
});
