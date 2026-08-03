import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { subscribeToChanges } from '../db/changeBus';
import { isDatabaseAvailable } from '../db/connection';
import { countOperations } from '../db/outbox';
import { getSetting, setSetting } from '../db/settings';
import { useAuthStore } from '../store/authStore';
import { ensureDeviceSeries } from './deviceSeries';
import { createPullEngine, type PullEngine } from './pullEngine';
import { createPushEngine, type PushEngine } from './pushEngine';
import { getSyncPreferences, loadSyncPreferences, subscribeToSyncPreferences } from './syncPreferences';

/**
 * What the offline UI reads. One module-level store, because "am I offline, and how much is
 * waiting?" is a property of the device, not of a screen — every badge on every screen has
 * to agree, and a per-screen hook would give each one its own answer.
 *
 * It owns no transport and no queue: the engines below already do. This is a projection of
 * their state plus the connectivity flag React Query already tracks, in a shape a badge can
 * render without knowing what an outbox is.
 */

/** Device-local, so it lives in `settings` alongside the pull cursors. */
export const LAST_SYNC_KEY = 'sync.lastSyncAt';

export type SyncSnapshot = {
  online: boolean;
  /** On Wi-Fi rather than cellular. What the "Wi-Fi only" preference gates on. */
  wifi: boolean;
  syncing: boolean;
  /** Queued and in-flight operations — the queue counter. */
  pending: number;
  /** Out of retries, conflicted or abandoned. Needs a person. */
  failed: number;
  lastSyncAt: string | null;
  error: string | null;
};

/** The single label the badges render from. Order matters: worse states win. */
export type SyncPhase = 'syncing' | 'offline' | 'failed' | 'pending' | 'synced';

export const syncPhase = (snapshot: SyncSnapshot): SyncPhase => {
  if (snapshot.syncing) return 'syncing';
  if (!snapshot.online) return 'offline';
  if (snapshot.failed > 0) return 'failed';
  if (snapshot.pending > 0) return 'pending';
  return 'synced';
};

/** "just now" / "5m ago" / "3h ago" / "2d ago". Null timestamp means never synced. */
export const formatLastSync = (iso: string | null, now = Date.now()): string => {
  if (!iso) return 'Never synced';
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return 'Never synced';

  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return 'Synced just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Synced ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Synced ${hours}h ago`;
  return `Synced ${Math.round(hours / 24)}d ago`;
};

const INITIAL: SyncSnapshot = {
  online: true,
  wifi: true,
  syncing: false,
  pending: 0,
  failed: 0,
  lastSyncAt: null,
  error: null
};

let snapshot: SyncSnapshot = { ...INITIAL, online: onlineManager.isOnline() };
const listeners = new Set<() => void>();

// useSyncExternalStore compares snapshots by identity: only replace the object when a field
// actually moved, or every unrelated refresh re-renders every badge.
const set = (patch: Partial<SyncSnapshot>) => {
  const keys = Object.keys(patch) as (keyof SyncSnapshot)[];
  if (keys.every((key) => snapshot[key] === patch[key])) return;
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
};

export const getSyncSnapshot = () => snapshot;

const activeBusinessId = () => useAuthStore.getState().user?.businessId ?? null;

let engines: { businessId: string; deviceId?: string; push: PushEngine; pull: PullEngine } | null = null;

const enginesFor = (businessId: string, deviceId?: string) => {
  if (engines?.businessId !== businessId || engines.deviceId !== deviceId) {
    engines = {
      businessId,
      deviceId,
      // The device id travels on every sync request: the server uses it to prove that an
      // invoice number came from the series it belongs to.
      push: createPushEngine({ businessId, deviceId }),
      pull: createPullEngine({ businessId, deviceId })
    };
  }
  return engines;
};

/** Recounts the outbox. Cheap enough to call on every local write. */
export const refreshSyncCounts = async () => {
  const businessId = activeBusinessId();
  if (!businessId || !isDatabaseAvailable()) {
    set({ pending: 0, failed: 0 });
    return;
  }

  try {
    const [pending, failed] = await Promise.all([
      countOperations({ businessId, status: ['pending', 'inflight'] }),
      countOperations({ businessId, status: ['failed', 'conflict', 'dead'] })
    ]);
    set({ pending, failed });
  } catch (error) {
    // A badge that cannot count is a badge, not an outage.
    console.warn('[syncStatus] could not count queued operations', error);
  }
};

/**
 * Push, then pull. Never throws: the button that calls it reads the result off the snapshot.
 * `lastSyncAt` only advances on a clean pass — a half-finished sync must not read as fresh.
 */
export const syncNow = async (): Promise<void> => {
  const businessId = activeBusinessId();
  if (!businessId || !isDatabaseAvailable() || snapshot.syncing) return;
  if (!onlineManager.isOnline()) {
    set({ error: 'No connection' });
    return;
  }

  set({ syncing: true, error: null });

  // Before anything is sent: confirm this device's numbering series and re-read where the
  // series has reached, so the next offline invoice cannot reuse a number issued elsewhere.
  const { deviceId } = await ensureDeviceSeries(businessId);
  const { push, pull } = enginesFor(businessId, deviceId);

  try {
    await push.recover();
    const pushed = await push.push();
    const pulled = await pull.pull();
    const failure = pushed.reason ?? pulled.collections.find((collection) => collection.error)?.error ?? null;

    if (!failure) {
      const at = new Date().toISOString();
      await setSetting(LAST_SYNC_KEY, at);
      set({ lastSyncAt: at });
    }
    set({ error: failure });
  } catch (error) {
    set({ error: (error as Error)?.message ?? 'Sync failed' });
  } finally {
    set({ syncing: false });
    await refreshSyncCounts();
  }
};

/** The Retry action: requeue everything recoverable, then sync. */
export const retrySync = async (): Promise<void> => {
  const businessId = activeBusinessId();
  if (businessId && isDatabaseAvailable()) {
    try {
      await enginesFor(businessId, engines?.deviceId).push.retryAll();
    } catch (error) {
      console.warn('[syncStatus] could not requeue failed operations', error);
    }
  }
  await syncNow();
};

/** Automatic passes are rate-limited; a manual "Sync now" is never held back. */
const AUTO_SYNC_INTERVAL_MS = 60_000;
let lastAutoSyncAt = 0;

/**
 * Why an automatic sync would be skipped, or null when it may run. Split out from the
 * trigger so the settings screen can explain the policy in the same words it enforces.
 */
export const autoSyncBlockedBy = (): 'auto-off' | 'wifi-only' | 'offline' | null => {
  const preferences = getSyncPreferences();
  if (!preferences.auto) return 'auto-off';
  if (!snapshot.online) return 'offline';
  if (preferences.wifiOnly && !snapshot.wifi) return 'wifi-only';
  return null;
};

/**
 * The automatic trigger, honouring the three switches in Sync settings. 'reopen' passes are
 * additionally gated on the background switch — that is the only thing that fires them.
 */
const autoSync = async (trigger: 'reconnect' | 'reopen') => {
  const preferences = getSyncPreferences();
  if (trigger === 'reopen' && !preferences.background) return;
  if (autoSyncBlockedBy()) return;

  const now = Date.now();
  if (now - lastAutoSyncAt < AUTO_SYNC_INTERVAL_MS) return;
  lastAutoSyncAt = now;
  await syncNow();
};

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

// A pull page emits one flush, but a busy screen still writes in bursts. Coalesce.
const scheduleRefresh = () => {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void refreshSyncCounts();
  }, 400);
};

const loadLastSync = async () => {
  if (!isDatabaseAvailable()) return;
  try {
    set({ lastSyncAt: await getSetting(LAST_SYNC_KEY) });
  } catch (error) {
    console.warn('[syncStatus] could not read the last sync time', error);
  }
};

let wired = false;

const wire = () => {
  onlineManager.subscribe((online) => {
    const returned = online && !snapshot.online;
    set({ online });
    if (returned) void autoSync('reconnect');
  });
  // onlineManager only carries a boolean; the Wi-Fi/cellular distinction comes from NetInfo.
  NetInfo.addEventListener((state) => set({ wifi: state.type === 'wifi' }));
  AppState.addEventListener('change', (next) => {
    if (next === 'active') void autoSync('reopen');
  });
  subscribeToChanges(scheduleRefresh);
  // Turning a switch back on should not wait for the next reconnect to take effect.
  subscribeToSyncPreferences(() => {
    if (!autoSyncBlockedBy() && snapshot.pending > 0) void autoSync('reconnect');
  });
  useAuthStore.subscribe((state, previous) => {
    if (state.user?.businessId === previous.user?.businessId) return;
    engines = null;
    set({ ...INITIAL, online: snapshot.online, wifi: snapshot.wifi });
    void loadLastSync();
    void refreshSyncCounts();
  });
  void loadSyncPreferences();
  void loadLastSync();
  void refreshSyncCounts();
};

/** useSyncExternalStore's subscribe. Wires the sources on the first subscriber. */
export const subscribeToSync = (listener: () => void) => {
  listeners.add(listener);
  if (!wired) {
    wired = true;
    wire();
  }
  return () => {
    listeners.delete(listener);
  };
};

/** Test seam. */
export const resetSyncStatus = () => {
  snapshot = { ...INITIAL };
  listeners.clear();
  engines = null;
};
