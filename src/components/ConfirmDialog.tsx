import { StyleSheet } from 'react-native';
import { Button, Dialog, Portal, Text, useTheme } from 'react-native-paper';
import { radii, typeScale } from '@/theme/theme';

type Props = { visible: boolean; title: string; message: string; confirmLabel?: string; onCancel: () => void; onConfirm: () => void };
export function ConfirmDialog({ visible, title, message, confirmLabel = 'Confirm', onCancel, onConfirm }: Props) {
  const theme = useTheme();
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onCancel} style={styles.dialog}>
        <Dialog.Title style={[styles.title, { color: theme.colors.error }]}>{title}</Dialog.Title>
        <Dialog.Content><Text style={{ color: theme.colors.onSurfaceVariant }}>{message}</Text></Dialog.Content>
        <Dialog.Actions><Button onPress={onCancel}>Cancel</Button><Button textColor={theme.colors.error} onPress={onConfirm}>{confirmLabel}</Button></Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: { borderRadius: radii.card },
  title: typeScale.screenTitle
});
