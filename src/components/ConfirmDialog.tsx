import { Button, Dialog, Portal, Text } from 'react-native-paper';

type Props = { visible: boolean; title: string; message: string; confirmLabel?: string; onCancel: () => void; onConfirm: () => void };
export function ConfirmDialog({ visible, title, message, confirmLabel = 'Confirm', onCancel, onConfirm }: Props) {
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onCancel}>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Content><Text>{message}</Text></Dialog.Content>
        <Dialog.Actions><Button onPress={onCancel}>Cancel</Button><Button onPress={onConfirm}>{confirmLabel}</Button></Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
