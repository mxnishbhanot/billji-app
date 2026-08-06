import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { subscribeToChanges } from '../db/changeBus';
import { isDatabaseAvailable, openDatabase } from '../db/connection';
import { countOperations, getOperation } from '../db/outbox';
import { getSetting, setSetting } from '../db/settings';
import { useAuthStore } from '../store/authStore';
import { ensureDeviceSeries } from './deviceSeries';
import { createPullEngine, type PullEngine } from './pullEngine';
import { createPushEngine, type PushEngine } from './pushEngine';
import type { DeadLetter } from './queueManager';
import { getSyncPreferences, loadSyncPreferences, subscribeToSyncPreferences } from './syncPreferences';
import { syncError, syncLog } from './syncLog';

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

/** Surfaces a fail-closed local write so the Sync badge / Settings can point at Sync Issues. */
export const reportLocalWriteFailure = (message: string) => {
  set({ error: message || 'Local save failed' });
};

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
  if (!isDatabaseAvailable()) {
    set({ pending: 0, failed: 0 });
    return;
  }
  // Signed out: the queue is still on disk, so the last known counts stay on screen. Zeroing them
  // told the user their unsent work had gone — which is exactly what a 401-triggered logout in the
  // middle of an offline stretch looks like, and it is not true.
  if (!businessId) return;

  try {
    const [pending, failed] = await Promise.all([
      countOperations({ businessId, status: ['pending', 'inflight'] }),
      countOperations({ businessId, status: ['failed', 'conflict', 'dead'] })
    ]);
    set({ pending, failed });
  } catch (error) {
    // A badge that cannot count is a badge, not an outage.
    syncError('count_failed', error);
  }
};

/** Why a pass is running. Travels into the logs, which is how a stuck queue gets diagnosed. */
export type SyncTrigger =
  | 'launch'
  | 'reconnect'
  | 'reopen'
  | 'manual'
  | 'preferences'
  | 'retry'
  | 'referral'
  /** A pass that ran out of time with work still queued, asking for the rest. */
  | 'continuation';

/** Accepted operations older than this are deleted after a clean pass. */
const PRUNE_AFTER_MS = 7 * 24 * 60 * 60_000;
/**
 * Maintenance is idempotent but not free — confirming the series is a round trip. Launch runs it
 * before deciding whether a pass is even allowed, and the pass that follows would otherwise run it
 * again immediately: two /sync/device calls, two recoveries and two prunes on every start.
 */
const MAINTENANCE_INTERVAL_MS = 60_000;
let lastMaintenanceAt = 0;

/**
 * Maintenance, which is not the same thing as syncing and must not be buried inside it.
 *
 * Releasing crashed in-flight rows, confirming the numbering series and pruning accepted
 * operations are launch-and-occasionally jobs. They used to live inside the push path, which is
 * why none of them ran on a device that never reached a push: a fresh install therefore never got
 * an invoice series and never issued an offline invoice, and the outbox was never pruned at all.
 */
const runMaintenance = async (businessId: string): Promise<{ deviceId?: string }> => {
  if (Date.now() - lastMaintenanceAt < MAINTENANCE_INTERVAL_MS) return { deviceId: engines?.deviceId };
  lastMaintenanceAt = Date.now();

  let deviceId: string | undefined;

  try {
    // Confirming the series is also how the device learns that invoices were issued elsewhere
    // while it was away, so it cannot reuse a number already on a customer's bill.
    ({ deviceId } = await ensureDeviceSeries(businessId));
  } catch (error) {
    syncError('series_failed', error);
  }

  try {
    const { push } = enginesFor(businessId, deviceId);
    // An inflight op is one nobody is holding any more — the app was killed mid-push.
    await push.recover();
    const pruned = await push.prune(new Date(Date.now() - PRUNE_AFTER_MS).toISOString());
    if (pruned > 0) syncLog('queue_pruned', { pruned });
  } catch (error) {
    syncError('maintenance_failed', error);
  }

  return { deviceId };
};

/**
 * Push, then pull. Never throws: the caller reads the result off the snapshot.
 * `lastSyncAt` only advances on a clean pass — a half-finished sync must not read as fresh.
 */
const runSync = async (trigger: SyncTrigger): Promise<void> => {
  const businessId = activeBusinessId();
  // Every reason a pass does not start is logged. These used to be silent returns, and on a device
  // that launches offline the result was a bootstrap line followed by nothing at all — the exact
  // "why is nothing happening?" that the diagnostics exist to answer. `snapshot.online` lags
  // `onlineManager` by one tick at launch, so the gate that actually stops the pass is this one.
  if (!businessId || !isDatabaseAvailable()) {
    syncLog('sync_skipped', { trigger, blockedBy: businessId ? 'no-database' : 'no-business' });
    return;
  }
  if (snapshot.syncing) {
    syncLog('sync_skipped', { trigger, blockedBy: 'already-syncing' });
    return;
  }
  if (!onlineManager.isOnline()) {
    set({ error: 'No connection' });
    syncLog('sync_skipped', { trigger, blockedBy: 'offline' });
    return;
  }

  set({ syncing: true, error: null });
  const startedAt = Date.now();
  syncLog('sync_start', { trigger, pending: snapshot.pending, failed: snapshot.failed, wifi: snapshot.wifi });

  const { deviceId } = await runMaintenance(businessId);
  const { push, pull } = enginesFor(businessId, deviceId);

  try {
    const pushed = await push.push();
    const pulled = await pull.pull();
    const failure = pushed.reason ?? pulled.collections.find((collection) => collection.error)?.error ?? null;

    if (!failure) {
      const at = new Date().toISOString();
      await setSetting(LAST_SYNC_KEY, at);
      set({ lastSyncAt: at });
    }
    set({ error: failure });

    // Out of time with work still queued: ask for the rest. Any other stop reason means either the
    // queue is drained or something is holding it, and neither is helped by asking again.
    if (pushed.stopped === 'deadline' && pushed.hasMore) scheduleContinuation();
    else continuations = 0;

    syncLog(failure ? 'sync_failed' : 'sync_end', {
      trigger,
      durationMs: Date.now() - startedAt,
      stopped: pushed.stopped,
      passes: pushed.passes,
      done: pushed.done,
      retried: pushed.retried,
      deferred: pushed.deferred,
      conflicts: pushed.conflicts,
      dead: pushed.dead,
      hasMore: pushed.hasMore,
      error: failure
    });
  } catch (error) {
    set({ error: (error as Error)?.message ?? 'Sync failed' });
    syncError('sync_failed', error, { trigger, durationMs: Date.now() - startedAt });
  } finally {
    set({ syncing: false });
    await refreshSyncCounts();
  }
};

/** The manual "Sync now": never rate-limited, never gated on the Wi-Fi-only preference. */
export const syncNow = (): Promise<void> => runSync('manual');

/** The Retry action: requeue everything recoverable, then sync. */
export const retrySync = async (): Promise<void> => {
  const businessId = activeBusinessId();
  if (businessId && isDatabaseAvailable()) {
    try {
      await enginesFor(businessId, engines?.deviceId).push.retryAll();
    } catch (error) {
      syncError('retry_all_failed', error);
    }
  }
  await syncNow();
};

const pushForActiveBusiness = () => {
  const businessId = activeBusinessId();
  if (!businessId || !isDatabaseAvailable()) return null;
  return enginesFor(businessId, engines?.deviceId).push;
};

/** Failed / conflict / dead operations for the Sync Issues screen. */
export const listSyncIssues = async (): Promise<DeadLetter[]> => {
  const push = pushForActiveBusiness();
  if (!push) return [];
  try {
    return await push.deadLetters();
  } catch (error) {
    syncError('list_issues_failed', error);
    return [];
  }
};

export const retrySyncIssue = async (opId: string): Promise<void> => {
  const push = pushForActiveBusiness();
  if (!push) return;
  await push.retry(opId);
  await refreshSyncCounts();
  await syncNow();
};

export const discardSyncIssue = async (opId: string): Promise<void> => {
  const push = pushForActiveBusiness();
  if (!push) return;
  await push.discard(opId);
  await refreshSyncCounts();
};

/**
 * Keep the device's edit: rebase onto the current server version (new baseVersion) and push.
 * Never retries the stale op — that is what caused the 409 loop.
 */
export const keepLocalSyncIssue = async (opId: string): Promise<void> => {
  const businessId = activeBusinessId();
  if (!businessId || !isDatabaseAvailable()) return;

  const { rebaseKeepLocal } = await import('./keepLocal');
  await rebaseKeepLocal(opId, { businessId });
  await refreshSyncCounts();
  await syncNow();
};

/**
 * Accept the server's copy: abandon local ops for this record and mark the row synced so
 * the next pull fast-forwards over the local payload.
 */
export const keepServerSyncIssue = async (opId: string): Promise<void> => {
  const push = pushForActiveBusiness();
  if (!push) return;
  const operation = await getOperation(opId);
  await push.discard(opId);
  if (operation) {
    const db = await openDatabase();
    await db.runAsync(`UPDATE ${operation.entityType} SET sync_state = 'synced' WHERE local_id = ?`, [
      operation.entityLocalId
    ]);
  }
  await refreshSyncCounts();
  await syncNow();
};

/** Automatic passes are rate-limited; a manual "Sync now" is never held back. */
const AUTO_SYNC_INTERVAL_MS = 60_000;
/** A floor no trigger path can dip below, so nothing can turn a flapping radio into a loop. */
const MIN_SYNC_INTERVAL_MS = 5_000;
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
 * The one way an automatic pass starts.
 *
 * Every trigger used to call the sync path directly with its own ad-hoc guard, and the bugs that
 * produced were all the same bug seen from different directions: a queue that never drained at
 * launch, a rate limiter that swallowed the reconnect that mattered, a foreground event that
 * double-fired. One funnel owns gating, rate limiting and coalescing, and a caller supplies only
 * a reason.
 *
 * The rate limit is stamped when a pass actually *starts*. Stamping on intent was the C3 bug: a
 * pass that immediately returned because the device was already syncing still burned the next
 * sixty seconds, so airplane-mode off-on-off inside a minute produced no sync at all.
 */
export const requestSync = async (trigger: SyncTrigger): Promise<void> => {
  const preferences = getSyncPreferences();
  // 'reopen' is the only trigger the background switch governs — it is what that switch means.
  if (trigger === 'reopen' && !preferences.background) return;

  const blocked = autoSyncBlockedBy();
  if (blocked) {
    syncLog('sync_skipped', { trigger, blockedBy: blocked });
    return;
  }
  if (!activeBusinessId() || !isDatabaseAvailable()) {
    syncLog('sync_skipped', { trigger, blockedBy: activeBusinessId() ? 'no-database' : 'no-business' });
    return;
  }

  const now = Date.now();
  const since = now - lastAutoSyncAt;
  // Work waiting, or a pass that ended badly, is worth asking again about sooner than a routine
  // heartbeat is — but never faster than the floor.
  const wanted = snapshot.pending > 0 || snapshot.failed > 0 || snapshot.error ? MIN_SYNC_INTERVAL_MS : AUTO_SYNC_INTERVAL_MS;
  if (since < wanted) {
    syncLog('sync_skipped', { trigger, blockedBy: 'rate-limit', sinceMs: since });
    return;
  }
  // A pass already running *is* the pass this trigger wanted; joining it is the coalescing.
  if (snapshot.syncing) return;

  lastAutoSyncAt = now;
  await runSync(trigger);
};

/**
 * Picking up where a pass ran out of time.
 *
 * A push is bounded by a wall-clock deadline, and the deadline is checked between drain passes —
 * so a slow link with a few hundred queued operations stops half-drained, reports success, and
 * waits for the user to background the app or the network to flap. On a fast link the same queue
 * finishes in one pass, which is why this never showed up anywhere but the field.
 *
 * Deliberately not a timer that runs while there is work: that would be a second scheduler. This is
 * one follow-up request, through the same funnel, only when a pass actually hit its deadline with
 * work left. Bounded so that a link slow enough to time out on every pass cannot chain for ever.
 */
/**
 * Tied to the rate limiter's floor rather than picked: the continuation goes through `requestSync`
 * like everything else, so a delay shorter than the floor would be dropped as too soon. In practice
 * a pass that hit a 25s deadline is already well past it — the arithmetic must hold anyway, not by
 * accident of how slow the last pass happened to be.
 */
const CONTINUATION_DELAY_MS = MIN_SYNC_INTERVAL_MS;
const MAX_CONTINUATIONS = 10;
let continuationTimer: ReturnType<typeof setTimeout> | null = null;
let continuations = 0;

const cancelContinuation = () => {
  if (continuationTimer) clearTimeout(continuationTimer);
  continuationTimer = null;
};

const scheduleContinuation = () => {
  // One pending continuation at a time, and never while one is already queued.
  if (continuationTimer) return;
  if (continuations >= MAX_CONTINUATIONS) {
    syncLog('continuation_capped', { continuations });
    return;
  }

  continuations += 1;
  syncLog('continuation_scheduled', { continuations });
  continuationTimer = setTimeout(() => {
    continuationTimer = null;
    void requestSync('continuation');
  }, CONTINUATION_DELAY_MS);
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
    syncError('last_sync_read_failed', error);
  }
};

/**
 * Connectivity came back, so the waiting periods it caused are void. Without this an operation
 * that failed a few times offline sits out the rest of an exponential delay — up to an hour —
 * after the Wi-Fi is already back, and the queue counter simply stops moving.
 */
const onReconnect = async () => {
  const businessId = activeBusinessId();
  if (businessId && isDatabaseAvailable()) {
    try {
      const cleared = await enginesFor(businessId, engines?.deviceId).push.clearBackoff();
      if (cleared > 0) syncLog('backoff_cleared', { cleared });
    } catch (error) {
      syncError('backoff_clear_failed', error);
    }
  }
  await requestSync('reconnect');
};

let wired = false;

const wire = () => {
  if (wired) return;
  wired = true;

  // Adopt what onlineManager already knows before subscribing.
  //
  // The snapshot's initial value is read at module load, before the NetInfo bridge has reported
  // anything, so it starts optimistic. `onlineManager.subscribe` then only fires on *changes* — so
  // an app launched with no connectivity kept `online: true` for the whole session. The banner never
  // appeared, and worse, the reconnect edge (`online && !snapshot.online`) could never become true,
  // so a queue built offline would not drain when the network came back.
  set({ online: onlineManager.isOnline() });

  onlineManager.subscribe((online) => {
    const returned = online && !snapshot.online;
    set({ online });
    syncLog('net_change', { online, wifi: snapshot.wifi, returned });
    if (returned) void onReconnect();
  });
  // onlineManager only carries a boolean; the Wi-Fi/cellular distinction comes from NetInfo.
  // Connectivity itself is owned by query/networkBridge — this listener reads the link type only.
  NetInfo.addEventListener((state) => set({ wifi: state.type === 'wifi' }));
  AppState.addEventListener('change', (next) => {
    if (next === 'active') void requestSync('reopen');
  });
  subscribeToChanges(scheduleRefresh);
  // Turning a switch back on should not wait for the next reconnect to take effect.
  subscribeToSyncPreferences(() => {
    if (!autoSyncBlockedBy() && snapshot.pending > 0) void requestSync('preferences');
  });
  useAuthStore.subscribe((state, previous) => {
    if (state.user?.businessId === previous.user?.businessId) return;
    engines = null;
    // A continuation belongs to the business whose queue it was draining.
    cancelContinuation();
    continuations = 0;
    // Counts are carried over rather than zeroed: on sign-out the queue is still on disk, and on a
    // business switch the refresh below replaces them with that business's own numbers.
    set({ ...INITIAL, online: snapshot.online, wifi: snapshot.wifi, pending: snapshot.pending, failed: snapshot.failed });
    void loadLastSync();
    void refreshSyncCounts();
    // A fresh session is a fresh device that has to be brought up to date.
    if (state.user?.businessId) void startSync();
  });
};

/**
 * Starts the offline system. Called once from App.tsx after the session is hydrated, and again on
 * a business change.
 *
 * This exists because nothing used to start sync at all. The listeners were wired lazily by the
 * first badge that happened to mount, and every path to a pass needed an *edge* — an offline→online
 * transition, or a foreground transition. A process that launches already-online and already-active
 * produces neither, so a queue built the day before sat untouched until the user found the Sync
 * button or the network happened to flap. Maintenance ran inside the push path, so on a device that
 * never reached a push, crashed operations were never released and a numbering series was never
 * allocated — which is why a fresh install could not issue an offline invoice at all.
 *
 * Never throws, and never blocks the caller: App.tsx must not wait on the network to render.
 */
export const startSync = async (): Promise<void> => {
  wire();
  if (!isDatabaseAvailable()) return;

  await loadSyncPreferences();
  await loadLastSync();
  await refreshSyncCounts();

  const businessId = activeBusinessId();
  if (!businessId) return;

  syncLog('bootstrap', { pending: snapshot.pending, failed: snapshot.failed, online: snapshot.online });

  // Release anything the last run was killed holding, and get the series, even when a pass is not
  // allowed right now: an offline device still needs its crashed rows back in the queue.
  await runMaintenance(businessId);
  await refreshSyncCounts();
  await requestSync('launch');
};

/** useSyncExternalStore's subscribe. Also wires the sources, for the screens that mount first. */
export const subscribeToSync = (listener: () => void) => {
  listeners.add(listener);
  wire();
  return () => {
    listeners.delete(listener);
  };
};

/** Test seam. */
export const resetSyncStatus = () => {
  snapshot = { ...INITIAL };
  listeners.clear();
  engines = null;
  lastAutoSyncAt = 0;
  lastMaintenanceAt = 0;
  continuations = 0;
  cancelContinuation();
};
