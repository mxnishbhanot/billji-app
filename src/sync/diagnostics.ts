import { isDatabaseAvailable } from '../db/connection';
import { getDeviceSeries, type DeviceSeries } from '../db/invoiceNumbering';
import { countOperations, listOperations, type OutboxStatus } from '../db/outbox';
import { getSetting } from '../db/settings';
import { DEVICE_ID_KEY } from './deviceSeries';
import { PULL_COLLECTIONS, cursorKey } from './pullEngine';
import { LAST_SYNC_KEY } from './syncStatus';

/**
 * One snapshot of everything needed to answer "why is this queue stuck?" without a rebuild.
 *
 * Support for offline problems used to mean asking a shopkeeper to reproduce a bug that only
 * happens on their phone, on their network, with their data. This is the screenshot that replaces
 * that conversation: statuses, the age of the oldest unsent operation, the last error, the device's
 * numbering series and where each pull cursor has reached.
 */

const STATUSES: OutboxStatus[] = ['pending', 'inflight', 'done', 'failed', 'conflict', 'dead'];

export type SyncDiagnostics = {
  businessId: string;
  deviceId: string | null;
  series: DeviceSeries | null;
  lastSyncAt: string | null;
  counts: Record<OutboxStatus, number>;
  /** ISO timestamp of the oldest operation still waiting. The number that says "stuck". */
  oldestPendingAt: string | null;
  /** Most recent recorded failure across the queue, whatever its status. */
  lastError: { opId: string; entityType: string; opType: string; attempts: number; error: string } | null;
  cursors: { collection: string; cursor: string | null }[];
};

export const readSyncDiagnostics = async (businessId: string): Promise<SyncDiagnostics | null> => {
  if (!isDatabaseAvailable()) return null;

  const counts = {} as Record<OutboxStatus, number>;
  for (const status of STATUSES) counts[status] = await countOperations({ businessId, status });

  // Claim order, so the first row is the one holding everything else up.
  const waiting = await listOperations({ businessId, status: ['pending', 'inflight'], limit: 1 });
  const troubled = await listOperations({ businessId, status: ['failed', 'conflict', 'dead'], limit: 50 });
  const withError = [...troubled, ...waiting].find((operation) => operation.lastError);

  const cursors = await Promise.all(
    Object.keys(PULL_COLLECTIONS).map(async (collection) => ({
      collection,
      cursor: await getSetting(cursorKey(collection))
    }))
  );

  return {
    businessId,
    deviceId: await getSetting(DEVICE_ID_KEY),
    series: await getDeviceSeries(),
    lastSyncAt: await getSetting(LAST_SYNC_KEY),
    counts,
    oldestPendingAt: waiting[0]?.createdAt ?? null,
    lastError: withError
      ? {
          opId: withError.opId,
          entityType: withError.entityType,
          opType: withError.opType,
          attempts: withError.attempts,
          error: withError.lastError ?? ''
        }
      : null,
    cursors
  };
};

/** The text the Copy button puts on the clipboard. Ids, counts and errors — no record contents. */
export const formatSyncDiagnostics = (diagnostics: SyncDiagnostics): string =>
  [
    `business: ${diagnostics.businessId}`,
    `device: ${diagnostics.deviceId ?? 'none'}`,
    `series: ${diagnostics.series ? `${diagnostics.series.prefix} #${diagnostics.series.deviceIndex}` : 'none'}`,
    `lastSync: ${diagnostics.lastSyncAt ?? 'never'}`,
    `queue: ${STATUSES.map((status) => `${status}=${diagnostics.counts[status]}`).join(' ')}`,
    `oldestPending: ${diagnostics.oldestPendingAt ?? 'none'}`,
    diagnostics.lastError
      ? `lastError: ${diagnostics.lastError.entityType}:${diagnostics.lastError.opType} attempts=${diagnostics.lastError.attempts} ${diagnostics.lastError.error}`
      : 'lastError: none',
    ...diagnostics.cursors.map(({ collection, cursor }) => `cursor.${collection}: ${cursor ? 'set' : 'none'}`)
  ].join('\n');
