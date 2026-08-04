import { useSyncExternalStore } from 'react';
import { getSyncSnapshot, subscribeToSync, syncPhase, type SyncPhase, type SyncSnapshot } from '@/sync/syncStatus';

/** The offline UI's only read of sync state. See sync/syncStatus for what backs it. */
export const useSyncStatus = (): SyncSnapshot & { phase: SyncPhase } => {
  const snapshot = useSyncExternalStore(subscribeToSync, getSyncSnapshot, getSyncSnapshot);
  return { ...snapshot, phase: syncPhase(snapshot) };
};
