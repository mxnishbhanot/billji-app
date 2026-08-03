import { useSyncExternalStore } from 'react';
import { getSyncPreferences, subscribeToSyncPreferences, type SyncPreferences } from '@/sync/syncPreferences';

/** The three sync switches. Writes go through `setSyncPreference`. */
export const useSyncPreferences = (): SyncPreferences =>
  useSyncExternalStore(subscribeToSyncPreferences, getSyncPreferences, getSyncPreferences);
