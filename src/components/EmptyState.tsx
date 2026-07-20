import { Feather } from '@expo/vector-icons';
import { View } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';
import { appColors, radii, spacing, typeScale } from '@/theme/theme';

type Props = { title: string; message: string; actionLabel?: string; onAction?: () => void; hint?: string };
export function EmptyState({ title, message, actionLabel, onAction, hint }: Props) {
  const theme = useTheme();
  const colors = appColors(theme.dark);
  return (
    <View style={{ alignItems: 'center', padding: spacing.cardPadding }}>
      <View style={{ width: 54, height: 54, borderRadius: radii.pill, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
        <Feather name="file-plus" size={24} color={theme.colors.primary} />
      </View>
      <Text variant="titleMedium" style={{ ...typeScale.sectionTitle, textAlign: 'center' }}>{title}</Text>
      <Text style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 8 }}>{message}</Text>
      {hint ? (
        <Text style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 10, fontSize: 12, opacity: 0.85 }}>{hint}</Text>
      ) : null}
      {actionLabel && onAction ? <Button mode="contained" onPress={onAction} style={{ marginTop: 16, borderRadius: radii.input }}>{actionLabel}</Button> : null}
    </View>
  );
}
