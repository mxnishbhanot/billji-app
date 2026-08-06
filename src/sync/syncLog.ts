import { recordError, track } from '@/services/analytics';

/**
 * One place every sync step is recorded, because the alternative was what this module replaced:
 * scattered console.warn calls that a preview build on a real device never shows anyone. Offline
 * bugs are the kind you cannot reproduce on a desk, so the log has to survive to somewhere a
 * support conversation can reach — a logcat line, a Sentry breadcrumb attached to the next crash,
 * and for the handful of counters worth aggregating, an analytics event.
 *
 * PRIVACY: fields are ids, enums, counts and durations. Never a payload, an amount, a customer
 * name, a GST number or a document number — the rule the analytics facade states, applied here
 * too, because a breadcrumb leaves the device just like an event does.
 *
 * LAYERING: this module must never import from `db/`. The database layer logs through it (a wipe is
 * the one event the queue cannot report on its own), and a dependency back the other way would make
 * that a cycle.
 */

export type SyncLogFields = Record<string, string | number | boolean | null | undefined>;

/** Events aggregated in production. Everything else is a breadcrumb only. */
const TRACKED = {
  sync_start: 'sync_start',
  sync_end: 'sync_end',
  sync_failed: 'sync_failed',
  queue_recovered: 'queue_recovered',
  op_deferred: 'op_deferred',
  op_failed: 'op_failed',
  op_dead: 'op_dead',
  // The only irreversible event in the offline system: the local store was rebuilt, and anything
  // unsent went with it. Aggregated because one occurrence in the field is worth investigating.
  db_wiped: 'db_wiped'
} as const;

const isTracked = (event: string): event is keyof typeof TRACKED => event in TRACKED;

// Firebase params take scalars only, and undefined/null would be dropped on the floor anyway.
const scalars = (fields: SyncLogFields) => {
  const params: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) params[key] = value;
  }
  return params;
};

/**
 * Records one step. Never throws: a log line is not allowed to be the reason a sync fails, which
 * is exactly the trap the old `console.warn` inside a catch block was already avoiding by accident.
 */
export const syncLog = (event: string, fields: SyncLogFields = {}) => {
  const params = scalars(fields);

  try {
    if (__DEV__) console.log(`[sync] ${event}`, params);
    if (isTracked(event)) track(TRACKED[event], params);
  } catch {
    // Diagnostics are best-effort by definition.
  }
};

/**
 * A failure worth a stack trace as well as a breadcrumb. Use for the unexpected — a local write
 * that threw, a database that would not answer — not for an ordinary rejected operation, which is
 * a queue state rather than an error.
 */
export const syncError = (event: string, error: unknown, fields: SyncLogFields = {}) => {
  syncLog(event, { ...fields, error: (error as Error)?.message ?? String(error) });
  try {
    recordError(error, { area: 'sync', event });
  } catch {
    // As above.
  }
};
