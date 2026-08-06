/* eslint-disable import/first -- jest.mock is hoisted above imports, so the mocked modules have to
   be imported after the factories that replace them. */
import { onlineManager } from '@tanstack/react-query';

/**
 * The launch path, which is the part of offline mode that was missing entirely.
 *
 * Everything used to depend on an *edge*: an offline→online transition, or the app coming back to
 * the foreground. A phone that starts online and stays online produces neither, so a queue built
 * the day before was never drained, crashed in-flight rows were never released, and a device that
 * had never synced never received an invoice numbering series — which is why a fresh install could
 * not issue an offline invoice at all. None of it reproduced in development, where a Metro reload
 * and a tap on Sync supply the missing events by hand.
 *
 * These tests hold that path down with no network event and no lifecycle event of any kind.
 */

type PushStop = 'drained' | 'deadline' | 'aborted' | 'busy';

const mockPush = {
  push: jest.fn(async (): Promise<{
    claimed: number;
    batches: number;
    done: number;
    retried: number;
    deferred: number;
    conflicts: number;
    dead: number;
    hasMore: boolean;
    passes: number;
    stopped: PushStop;
  }> => ({
    claimed: 0,
    batches: 0,
    done: 0,
    retried: 0,
    deferred: 0,
    conflicts: 0,
    dead: 0,
    hasMore: false,
    passes: 1,
    stopped: 'drained'
  })),
  recover: jest.fn(async () => 0),
  prune: jest.fn(async () => 0),
  clearBackoff: jest.fn(async () => 0)
};

const mockPull = { pull: jest.fn(async () => ({ collections: [] })) };

jest.mock('../pushEngine', () => ({
  createPushEngine: () => mockPush,
  SYNC_PROTOCOL_HEADER: 'X-Sync-Protocol-Version',
  SYNC_DEVICE_HEADER: 'X-Device-Id',
  SYNC_PROTOCOL_VERSION: 1
}));
jest.mock('../pullEngine', () => ({ createPullEngine: () => mockPull }));
jest.mock('../deviceSeries', () => ({
  ensureDeviceSeries: jest.fn(async () => ({ deviceId: 'device-1', series: null }))
}));
jest.mock('../../db/connection', () => ({ isDatabaseAvailable: () => true, openDatabase: jest.fn() }));
jest.mock('../../db/outbox', () => ({ countOperations: jest.fn(async () => 0), getOperation: jest.fn() }));
jest.mock('../../db/settings', () => ({ getSetting: jest.fn(async () => null), setSetting: jest.fn(async () => undefined) }));
jest.mock('../../db/changeBus', () => ({ subscribeToChanges: jest.fn(() => () => undefined) }));
jest.mock('@react-native-community/netinfo', () => ({ addEventListener: jest.fn(() => () => undefined) }));
jest.mock('../../store/authStore', () => ({
  useAuthStore: {
    getState: () => ({ user: { id: 'u1', businessId: 'biz-1' } }),
    subscribe: jest.fn(() => () => undefined)
  }
}));

import { ensureDeviceSeries } from '../deviceSeries';
import { countOperations } from '../../db/outbox';
import { getSyncSnapshot, requestSync, resetSyncStatus, startSync } from '../syncStatus';
import { setSyncPreference } from '../syncPreferences';

describe('startSync', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    resetSyncStatus();
    onlineManager.setOnline(true);
    await setSyncPreference('auto', true);
    await setSyncPreference('wifiOnly', false);
  });

  it('drains the queue at launch with no network or lifecycle event', async () => {
    await startSync();

    expect(mockPush.push).toHaveBeenCalledTimes(1);
    expect(mockPull.pull).toHaveBeenCalledTimes(1);
  });

  it('releases operations the last run was killed holding, before pushing', async () => {
    mockPush.recover.mockResolvedValueOnce(3);

    await startSync();

    expect(mockPush.recover).toHaveBeenCalled();
    // Recovery must precede the push, or the released rows sit out another launch.
    expect(mockPush.recover.mock.invocationCallOrder[0]).toBeLessThan(mockPush.push.mock.invocationCallOrder[0]);
  });

  it('confirms the numbering series even when a pass is not allowed to run', async () => {
    // Automatic sync switched off: the device still needs its series and its crashed rows back,
    // because neither is a network preference. This is the fresh-install case — without the series
    // an offline invoice cannot be numbered, so invoice creation silently stays online-only.
    await setSyncPreference('auto', false);

    await startSync();

    expect(ensureDeviceSeries).toHaveBeenCalledWith('biz-1');
    expect(mockPush.recover).toHaveBeenCalled();
    expect(mockPush.push).not.toHaveBeenCalled();
  });

  it('prunes accepted operations once the queue has been drained', async () => {
    await startSync();
    expect(mockPush.prune).toHaveBeenCalled();
  });

  /**
   * Found on a real device: launching with no connectivity left the snapshot claiming `online: true`
   * for the entire session, because the initial value is read at module load and the subscription
   * only fires on changes. The banner never showed, and the reconnect edge — `online &&
   * !snapshot.online` — could never become true, so a queue built offline would never drain.
   */
  it('adopts the connectivity state that already exists at launch', async () => {
    onlineManager.setOnline(false);

    await startSync();

    expect(getSyncSnapshot().online).toBe(false);
    expect(mockPush.push).not.toHaveBeenCalled();

    // And the reconnect edge is now reachable, which is the part that actually drains the queue.
    onlineManager.setOnline(true);
    expect(getSyncSnapshot().online).toBe(true);
  });

  it('runs maintenance once per launch, not once per pass', async () => {
    // startSync does maintenance before deciding whether a pass is allowed, and the pass that
    // follows must not repeat it: confirming the numbering series is a round trip.
    await startSync();

    expect(ensureDeviceSeries).toHaveBeenCalledTimes(1);
    expect(mockPush.recover).toHaveBeenCalledTimes(1);
    expect(mockPush.push).toHaveBeenCalledTimes(1);
  });

  it('counts the queue so the badge is right before anything is sent', async () => {
    await startSync();
    expect(countOperations).toHaveBeenCalled();
  });
});

describe('requestSync', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    resetSyncStatus();
    onlineManager.setOnline(true);
    await setSyncPreference('auto', true);
    await setSyncPreference('background', true);
    await setSyncPreference('wifiOnly', false);
  });

  it('does not let a skipped pass consume the rate limit', async () => {
    onlineManager.setOnline(false);
    // Offline: nothing runs, and nothing may be charged for it. Stamping the limiter on intent was
    // the bug that made airplane-mode off-on-off inside a minute produce no sync at all.
    await requestSync('reconnect');
    expect(mockPush.push).not.toHaveBeenCalled();

    onlineManager.setOnline(true);
    await requestSync('reconnect');
    expect(mockPush.push).toHaveBeenCalledTimes(1);
  });

  it('rate-limits a routine trigger with an empty queue', async () => {
    await requestSync('reopen');
    await requestSync('reopen');
    expect(mockPush.push).toHaveBeenCalledTimes(1);
  });

  it('honours the background switch for a foreground trigger only', async () => {
    await setSyncPreference('background', false);

    await requestSync('reopen');
    expect(mockPush.push).not.toHaveBeenCalled();

    await requestSync('reconnect');
    expect(mockPush.push).toHaveBeenCalledTimes(1);
  });

  it('skips a pass entirely while automatic sync is switched off', async () => {
    await setSyncPreference('auto', false);
    await requestSync('reconnect');
    expect(mockPush.push).not.toHaveBeenCalled();
  });
});

/**
 * A push is bounded by a wall-clock deadline, and the deadline is checked between drain passes. A
 * few hundred operations on a slow link therefore stop half-drained, report success, and wait for
 * the user to background the app. On a fast link the same queue finishes in one pass, which is why
 * this only ever showed up in the field.
 */
describe('continuation after a deadline stop', () => {
  const outcome = (patch: { hasMore: boolean; stopped: PushStop }) => ({
    claimed: 200,
    batches: 8,
    done: 200,
    retried: 0,
    deferred: 0,
    conflicts: 0,
    dead: 0,
    passes: 5,
    ...patch
  });

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    resetSyncStatus();
    onlineManager.setOnline(true);
    await setSyncPreference('auto', true);
    await setSyncPreference('wifiOnly', false);
    // Work is waiting, which is what puts the rate limiter on its short floor.
    (countOperations as jest.Mock).mockResolvedValue(120);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const settle = async () => {
    // Let the scheduled continuation fire and its async pass run to completion.
    await jest.advanceTimersByTimeAsync(6_000);
  };

  it('drains a large queue to the end without any further trigger', async () => {
    mockPush.push
      .mockResolvedValueOnce(outcome({ stopped: 'deadline', hasMore: true }))
      .mockResolvedValueOnce(outcome({ stopped: 'deadline', hasMore: true }))
      .mockResolvedValueOnce(outcome({ stopped: 'drained', hasMore: false }));

    await requestSync('launch');
    await settle();
    await settle();

    // Three passes, from one request and no network or lifecycle event in between.
    expect(mockPush.push).toHaveBeenCalledTimes(3);
  });

  it('stops chaining once a pass finishes with nothing left', async () => {
    mockPush.push
      .mockResolvedValueOnce(outcome({ stopped: 'deadline', hasMore: true }))
      .mockResolvedValue(outcome({ stopped: 'drained', hasMore: false }));

    await requestSync('launch');
    await settle();
    await settle();

    expect(mockPush.push).toHaveBeenCalledTimes(2);
  });

  it('does not continue when the deadline was not the reason', async () => {
    // Aborted or busy means something is holding the queue; asking again immediately helps nobody.
    mockPush.push.mockResolvedValue(outcome({ stopped: 'aborted', hasMore: true }));

    await requestSync('launch');
    await settle();

    expect(mockPush.push).toHaveBeenCalledTimes(1);
  });

  it('does not continue when the queue is empty, deadline or not', async () => {
    mockPush.push.mockResolvedValue(outcome({ stopped: 'deadline', hasMore: false }));

    await requestSync('launch');
    await settle();

    expect(mockPush.push).toHaveBeenCalledTimes(1);
  });

  it('keeps at most one continuation pending', async () => {
    mockPush.push.mockResolvedValue(outcome({ stopped: 'deadline', hasMore: true }));

    await requestSync('launch');
    // Two more requests arrive while a continuation is already queued; neither may add another.
    await requestSync('reconnect');
    await requestSync('reopen');
    await settle();

    // The launch pass plus exactly one continuation.
    expect(mockPush.push).toHaveBeenCalledTimes(2);
  });

  it('cannot chain for ever on a link that times out every pass', async () => {
    mockPush.push.mockResolvedValue(outcome({ stopped: 'deadline', hasMore: true }));

    await requestSync('launch');
    for (let tick = 0; tick < 20; tick += 1) await settle();

    // Bounded: the first pass plus the continuation cap, never an unbroken chain.
    expect(mockPush.push).toHaveBeenCalledTimes(11);
  });
});
