import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';

type Props = { title: string; message: string; actionLabel?: string; onAction?: () => void };
export function EmptyState({ title, message, actionLabel, onAction }: Props) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: 28 }}>
      <View style={{ width: 54, height: 54, borderRadius: 22, backgroundColor: theme.colors.primaryContainer, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
        <MaterialCommunityIcons name="file-document-plus-outline" size={24} color={theme.colors.primary} />
      </View>
      <Text variant="titleMedium" style={{ fontWeight: '900', textAlign: 'center' }}>{title}</Text>
      <Text style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 8 }}>{message}</Text>
      {actionLabel && onAction ? <Button mode="contained" onPress={onAction} style={{ marginTop: 16, borderRadius: 16 }}>{actionLabel}</Button> : null}
    </View>
  );
}
