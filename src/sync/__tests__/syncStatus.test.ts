import { formatLastSync, syncPhase, type SyncSnapshot } from '../syncStatus';

const snapshot = (patch: Partial<SyncSnapshot> = {}): SyncSnapshot => ({
  online: true,
  wifi: true,
  syncing: false,
  pending: 0,
  failed: 0,
  lastSyncAt: null,
  error: null,
  ...patch
});

describe('syncPhase', () => {
  it('ranks syncing above every other state', () => {
    expect(syncPhase(snapshot({ syncing: true, online: false, pending: 3, failed: 2 }))).toBe('syncing');
  });

  it('reports offline before failures — no connection explains the failures', () => {
    expect(syncPhase(snapshot({ online: false, failed: 2 }))).toBe('offline');
  });

  it('ranks failures above a merely waiting queue', () => {
    expect(syncPhase(snapshot({ pending: 5, failed: 1 }))).toBe('failed');
    expect(syncPhase(snapshot({ pending: 5 }))).toBe('pending');
  });

  it('is synced only when online with an empty queue', () => {
    expect(syncPhase(snapshot())).toBe('synced');
  });
});

describe('formatLastSync', () => {
  const now = Date.parse('2026-08-03T12:00:00.000Z');

  it('handles a device that has never synced', () => {
    expect(formatLastSync(null, now)).toBe('Never synced');
    expect(formatLastSync('not a date', now)).toBe('Never synced');
  });

  it('scales the unit with the gap', () => {
    expect(formatLastSync('2026-08-03T11:59:30.000Z', now)).toBe('Synced just now');
    expect(formatLastSync('2026-08-03T11:45:00.000Z', now)).toBe('Synced 15m ago');
    expect(formatLastSync('2026-08-03T09:00:00.000Z', now)).toBe('Synced 3h ago');
    expect(formatLastSync('2026-08-01T12:00:00.000Z', now)).toBe('Synced 2d ago');
  });

  it('never reports a future clock skew as negative', () => {
    expect(formatLastSync('2026-08-03T12:05:00.000Z', now)).toBe('Synced just now');
  });
});
