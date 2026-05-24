import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { AppCard } from './AppCard';

type Props = { label: string; value: string | number; hint?: string };
export function StatCard({ label, value, hint }: Props) {
  const theme = useTheme();
  return (
    <AppCard style={styles.card}>
      <View>
        <View style={[styles.accent, { backgroundColor: theme.colors.secondary }]} />
        <Text variant="labelMedium" style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>{label}</Text>
        <Text variant="titleLarge" style={[styles.value, { color: theme.colors.onSurface }]}>{value}</Text>
        {hint ? <Text variant="labelSmall" style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}>{hint}</Text> : null}
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  accent: {
    borderRadius: 999,
    height: 4,
    marginBottom: 12,
    width: 34
  },
  card: { flex: 1, marginHorizontal: 4 },
  hint: { marginTop: 3 },
  label: { fontWeight: '700', letterSpacing: 0.2 },
  value: { fontWeight: '900', letterSpacing: -0.5, marginTop: 4 }
});
