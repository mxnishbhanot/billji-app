import { ReactNode, createContext, useCallback, useContext, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Button, Dialog, Portal, Text, useTheme } from 'react-native-paper';
import { radii, typeScale } from '@/theme/theme';

type DialogTone = 'default' | 'success' | 'error' | 'warning';
type AppDialogOptions = {
  title: string;
  message?: string;
  actionLabel?: string;
  tone?: DialogTone;
};

type AppDialogContextValue = {
  showDialog: (options: AppDialogOptions) => void;
};

const AppDialogContext = createContext<AppDialogContextValue | undefined>(undefined);

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const [dialog, setDialog] = useState<AppDialogOptions | null>(null);
  const showDialog = useCallback((options: AppDialogOptions) => setDialog(options), []);
  const value = useMemo(() => ({ showDialog }), [showDialog]);
  const toneColor =
    dialog?.tone === 'error' ? theme.colors.error :
    dialog?.tone === 'success' ? theme.colors.tertiary :
    dialog?.tone === 'warning' ? theme.colors.secondary :
    theme.colors.primary;

  return (
    <AppDialogContext.Provider value={value}>
      {children}
      <Portal>
        <Dialog visible={Boolean(dialog)} onDismiss={() => setDialog(null)} style={styles.dialog}>
          <Dialog.Title style={[styles.title, { color: toneColor }]}>{dialog?.title}</Dialog.Title>
          {dialog?.message ? (
            <Dialog.Content>
              <Text style={{ color: theme.colors.onSurfaceVariant }}>{dialog.message}</Text>
            </Dialog.Content>
          ) : null}
          <Dialog.Actions>
            <Button textColor={toneColor} onPress={() => setDialog(null)}>{dialog?.actionLabel || 'OK'}</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </AppDialogContext.Provider>
  );
}

export function useAppDialog() {
  const context = useContext(AppDialogContext);
  if (!context) throw new Error('useAppDialog must be used within AppDialogProvider');
  return context;
}

const styles = StyleSheet.create({
  dialog: { borderRadius: radii.card },
  title: typeScale.screenTitle
});
