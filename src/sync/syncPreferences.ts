import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * How the device is allowed to sync. Three switches, stored on the device rather than the
 * business: "only on Wi-Fi" is a statement about this phone's data plan, not about the shop.
 *
 * Kept apart from syncStatus so the policy can be read without pulling in the engines.
 */

export type SyncPreferences = {
  /** Sync on its own when the connection comes back. Off means manual only. */
  auto: boolean;
  /** Hold automatic syncs until the device is on Wi-Fi. A manual sync always goes. */
  wifiOnly: boolean;
  /** Also sync when the app is reopened, not only when connectivity changes. */
  background: boolean;
};

export const SYNC_PREFERENCES_KEY = 'billji.syncPrefs.v1';

export const DEFAULT_SYNC_PREFERENCES: SyncPreferences = { auto: true, wifiOnly: false, background: true };

/** Tolerant on purpose: a corrupt or half-written value must not disable syncing. */
export const parseSyncPreferences = (raw: string | null): SyncPreferences => {
  if (!raw) return { ...DEFAULT_SYNC_PREFERENCES };
  try {
    const parsed = JSON.parse(raw) as Partial<SyncPreferences> | null;
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_SYNC_PREFERENCES };
    return {
      auto: typeof parsed.auto === 'boolean' ? parsed.auto : DEFAULT_SYNC_PREFERENCES.auto,
      wifiOnly: typeof parsed.wifiOnly === 'boolean' ? parsed.wifiOnly : DEFAULT_SYNC_PREFERENCES.wifiOnly,
      background: typeof parsed.background === 'boolean' ? parsed.background : DEFAULT_SYNC_PREFERENCES.background
    };
  } catch {
    return { ...DEFAULT_SYNC_PREFERENCES };
  }
};

let preferences: SyncPreferences = { ...DEFAULT_SYNC_PREFERENCES };
let loaded: Promise<SyncPreferences> | null = null;
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) listener();
};

export const getSyncPreferences = () => preferences;

/** Reads the stored value once. Later calls return the same promise. */
export const loadSyncPreferences = () => {
  if (!loaded) {
    loaded = AsyncStorage.getItem(SYNC_PREFERENCES_KEY)
      .then((raw) => {
        preferences = parseSyncPreferences(raw);
        emit();
        return preferences;
      })
      .catch(() => preferences);
  }
  return loaded;
};

/** Applies a switch immediately and persists it. The UI never waits on storage. */
export const setSyncPreference = async <K extends keyof SyncPreferences>(key: K, value: SyncPreferences[K]) => {
  if (preferences[key] === value) return;
  preferences = { ...preferences, [key]: value };
  emit();
  try {
    await AsyncStorage.setItem(SYNC_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch (error) {
    console.warn('[syncPreferences] could not save the sync settings', error);
  }
};

export const subscribeToSyncPreferences = (listener: () => void) => {
  listeners.add(listener);
  void loadSyncPreferences();
  return () => {
    listeners.delete(listener);
  };
};

/** Test seam. */
export const resetSyncPreferences = () => {
  preferences = { ...DEFAULT_SYNC_PREFERENCES };
  loaded = null;
  listeners.clear();
};
