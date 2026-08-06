import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { Button, Dialog, Portal, Text, TextInput, useTheme } from 'react-native-paper';
import { useAppDialog } from '@/components/AppDialog';
import { useAppToast } from '@/components/AppToast';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { apiErrorMessage } from '@/api/client';
import { authApi } from '@/api/endpoints';
import { pendingLocalSyncCount } from '@/db/wipeLocalData';
import { useAuthStore } from '@/store/authStore';
import { radii, typeScale } from '@/theme/theme';
import { useAdoptBusiness } from './useAdoptBusiness';

type Props = { visible: boolean; onClose: () => void };

/**
 * Create a workspace the user owns, and switch into it.
 *
 * One component for both entry points — the workspace switcher and the non-owner billing screen —
 * so the two cannot drift on the part that matters: the local database is wiped before the new
 * workspace is adopted, exactly as on a switch.
 *
 * Order is load-bearing. The unsynced-changes warning comes BEFORE the network call, so a user who
 * backs out has not left an orphan business on the server.
 */
export function CreateBusinessDialog({ visible, onClose }: Props) {
  const theme = useTheme();
  const { showDialog } = useAppDialog();
  const { showToast } = useAppToast();
  const adopt = useAdoptBusiness();
  const userName = useAuthStore((state) => state.user?.name);
  const currentBusinessId = useAuthStore((state) => state.user?.businessId ?? null);

  // null = untouched, so the field shows the signup-style default without an effect to seed it.
  const [typed, setTyped] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [confirming, setConfirming] = useState(false);

  const name = typed ?? (userName ? `${userName}'s Business` : '');
  const dismiss = () => {
    setTyped(null);
    onClose();
  };

  const createBusiness = useMutation({
    mutationFn: authApi.createBusiness,
    onSuccess: async (user) => {
      await adopt(user);
      showToast(`${user.businessProfile?.businessName || 'Business'} created. You're the owner.`);
      dismiss();
    },
    // A 402/403 here is the entitlement gate on a SECOND owned workspace, measured against this
    // user's own plan. The message already says which plan and what to do.
    onError: (error) => showDialog({ title: 'Could not create the business', message: apiErrorMessage(error), tone: 'error' })
  });

  const submit = async () => {
    const businessName = name.trim();
    if (!businessName || createBusiness.isPending) return;

    // Creating switches away from the current workspace, so the same data-loss warning as a switch
    // applies — and it has to happen before anything is created.
    const pending = await pendingLocalSyncCount(currentBusinessId);
    if (pending > 0) {
      setPendingCount(pending);
      setConfirming(true);
      return;
    }
    createBusiness.mutate({ businessName });
  };

  return (
    <>
      <Portal>
        <Dialog visible={visible && !confirming} onDismiss={dismiss} style={styles.dialog}>
          <Dialog.Title style={styles.title}>Create a business</Dialog.Title>
          <Dialog.Content>
            <Text style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
              You will be the owner of this business and can manage its plan yourself.
            </Text>
            <TextInput mode="outlined" label="Business name" value={name} onChangeText={setTyped} maxLength={120} autoFocus />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={dismiss}>Cancel</Button>
            <Button onPress={() => void submit()} disabled={!name.trim() || createBusiness.isPending} loading={createBusiness.isPending}>
              Create
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <ConfirmDialog
        visible={confirming}
        title="Unsynced changes on this device"
        message={`${pendingCount} change${pendingCount === 1 ? '' : 's'} have not synced for the current business. Creating a new one discards the offline copy on this phone.`}
        confirmLabel="Discard and create"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          createBusiness.mutate({ businessName: name.trim() });
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  dialog: { borderRadius: radii.card },
  title: typeScale.screenTitle
});
