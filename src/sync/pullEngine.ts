import type { SQLiteDatabase } from 'expo-sqlite';
import { api } from '../api/client';
import { emitChange, type ChangeEvent } from '../db/changeBus';
import { upsertEntityRow } from '../db/entityRepository';
import { fromRow, isUuid, toIsoText, toRow, uuidv7, type EntityRow, type EntityType, type MongoDoc } from '../db/mappers';
import { getSetting, setSetting } from '../db/settings';
import { withTransaction } from '../db/transaction';
import { applyResolution } from './conflictResolver';
import { SYNC_DEVICE_HEADER, SYNC_PROTOCOL_HEADER, SYNC_PROTOCOL_VERSION } from './pushEngine';

/**
 * Pull: server changes down into the local tables. No push — this module never reads the
 * outbox and never sends an operation. It is the mirror of pushEngine, kept separate for the
 * same reason: the two fail differently and run at different moments.
 *
 * The protocol is a keyset delta stream per collection. The device holds one opaque cursor
 * per collection — the composite (updatedAt, _id) the server last handed it — and asks for
 * everything after it. Pages are drained until `hasMore` is false.
 *
 * The two invariants that make this crash-safe:
 *
 *  1. a page and the cursor that follows it are written in ONE transaction. Applying records
 *     and then dying before storing the cursor would re-apply them (harmless, the merge is
 *     idempotent); storing the cursor first and then dying would skip them forever.
 *  2. a local row with unsynced edits is never overwritten. It becomes a conflict instead.
 */

export const CURSOR_KEY_PREFIX = 'sync.cursor.';

/** Server collection name to local table. Collections with no local table are not pulled. */
export const PULL_COLLECTIONS: Record<string, EntityType> = {
  products: 'products',
  customers: 'customers',
  invoices: 'invoices',
  payments: 'payments',
  expenses: 'expenses',
  purchases: 'purchases',
  vendors: 'suppliers'
};

export type PullRecord = MongoDoc & {
  _id?: string;
  clientId?: string | null;
  version?: number | null;
  updatedAt?: string;
  deletedAt?: string | null;
};

export type PullPage = { records: PullRecord[]; nextCursor: string | null; hasMore: boolean };

/** Fetches one page. Injected so the engine can be driven without a server. */
export type PullTransport = (request: {
  collection: string;
  cursor: string | null;
  limit: number;
}) => Promise<PullPage>;

export type PullEngineConfig = {
  businessId: string;
  transport?: PullTransport;
  deviceId?: string;
  /** Collections to pull, in order. Defaults to every collection with a local table. */
  collections?: string[];
  /** Records per page. The server caps this at 500. */
  pageLimit?: number;
  /** Pages per collection in one pull, so a large backlog cannot monopolise a foreground. */
  maxPages?: number;
  /** Stop starting pages after this long. */
  deadlineMs?: number;
  clock?: () => string;
  /** A database handle to run against instead of the app connection. */
  txn?: SQLiteDatabase;
};

export type CollectionResult = {
  collection: string;
  pages: number;
  applied: number;
  deleted: number;
  conflicts: number;
  skipped: number;
  hasMore: boolean;
  cursor: string | null;
  error?: string;
};

export type PullOutcome = {
  collections: CollectionResult[];
  applied: number;
  deleted: number;
  conflicts: number;
  hasMore: boolean;
  stopped: 'drained' | 'deadline' | 'busy';
};

const DEFAULT_PAGE_LIMIT = 200;
const DEFAULT_MAX_PAGES = 20;
const DEFAULT_DEADLINE_MS = 30_000;

const httpTransport = (deviceId?: string): PullTransport => async ({ collection, cursor, limit }) => {
  const response = await api.get<PullPage>('/sync/pull', {
    params: { collection, cursor: cursor ?? undefined, limit },
    headers: {
      [SYNC_PROTOCOL_HEADER]: String(SYNC_PROTOCOL_VERSION),
      ...(deviceId ? { [SYNC_DEVICE_HEADER]: deviceId } : {})
    }
  });
  return response.data;
};

export const cursorKey = (collection: string) => `${CURSOR_KEY_PREFIX}${collection}`;

/** A cleared cursor is stored as an empty string; it means "from the beginning", not "". */
export const readCursor = async (collection: string, txn?: SQLiteDatabase) =>
  (await getSetting(cursorKey(collection), txn)) || null;

// -- Merge ------------------------------------------------------------------------------

export type MergeOutcome = 'inserted' | 'updated' | 'deleted' | 'conflict' | 'skipped';

/** The records a merged row is also visible through — an invoice list, a customer ledger. */
const relatedOf = (row: EntityRow): ChangeEvent['related'] => {
  const related: NonNullable<ChangeEvent['related']> = [];
  for (const [column, entity] of [
    ['invoice_server_id', 'invoices'],
    ['customer_server_id', 'customers']
  ] as const) {
    if (row[column]) related.push({ entity, id: String(row[column]) });
  }
  return related.length ? related : undefined;
};

/**
 * Applies one server record to its local table.
 *
 * Conflict detection is a local-state question, not a diff: a row whose sync_state is
 * `pending` carries an edit the server has not seen, so the incoming record is a *second*
 * writer. Overwriting it would silently discard the shopkeeper's change, so the row is
 * marked `conflict` and its local payload is left exactly as it was. Resolution — which
 * version wins, and how the user is asked — is a later phase; what matters here is that the
 * losing edit is never destroyed by a background pull.
 *
 * Everything else is a fast-forward: the row is replaced wholesale with the server's copy,
 * because a synced row has no local state worth preserving.
 */
export const mergeRecord = async (
  db: SQLiteDatabase,
  entity: EntityType,
  record: PullRecord,
  context: { businessId: string; now: string }
): Promise<MergeOutcome> => {
  const serverId = record._id ? String(record._id) : null;
  const clientId = typeof record.clientId === 'string' ? record.clientId : null;
  if (!serverId) return 'skipped';

  // Either side of the identity: the server id once the record is known, the clientId while
  // the create this device made is still the only link.
  const existingRow = await db.getFirstAsync<EntityRow>(
    `SELECT * FROM ${entity} WHERE server_id = ? OR (? IS NOT NULL AND local_id = ?)`,
    [serverId, clientId, clientId]
  );
  const existing = existingRow ? fromRow(existingRow) : null;
  const pendingLocalEdit = existing?.syncState === 'pending' || existing?.syncState === 'conflict';

  // A tombstone travels as identity only — the server does not resend a deleted record's
  // fields, so it must never be merged into the payload.
  if (record.deletedAt) {
    if (!existing) return 'skipped';
    if (pendingLocalEdit) {
      // Deleted there, edited here. The user's edit stays; a person decides.
      await db.runAsync(
        `UPDATE ${entity} SET sync_state = 'conflict', server_id = ?, version = ?, server_updated_at = ?
          WHERE local_id = ?`,
        [serverId, record.version ?? null, toIsoText(record.updatedAt), existing.localId]
      );
      return 'conflict';
    }

    await db.runAsync(
      `UPDATE ${entity}
          SET deleted_at = ?, sync_state = 'synced', server_id = ?, version = ?, server_updated_at = ?,
              local_updated_at = ?
        WHERE local_id = ?`,
      [
        toIsoText(record.deletedAt),
        serverId,
        record.version ?? null,
        toIsoText(record.updatedAt),
        context.now,
        existing.localId
      ]
    );
    emitChange({ entity, type: 'deleted', localId: existing.localId, serverId, origin: 'sync' });
    return 'deleted';
  }

  if (existing && pendingLocalEdit) {
    // Two writers on one record. The entity's policy decides — field merge, server-wins or
    // escalation — and applying it is never a plain overwrite: an unsynced local edit is a
    // shopkeeper's work, and a background pull may not silently discard it.
    const resolution = await applyResolution(db, entity, record, {
      businessId: context.businessId,
      now: context.now,
      localRow: existingRow
    });

    if (resolution.outcome === 'escalate') {
      // Left in conflict for the Sync Issues screen. The server revision it competes with is
      // recorded so the resolution screen knows what it is choosing between.
      await db.runAsync(
        `UPDATE ${entity} SET sync_state = 'conflict', server_id = ?, version = ?, server_updated_at = ?
          WHERE local_id = ?`,
        [serverId, record.version ?? null, toIsoText(record.updatedAt), existing.localId]
      );
    }

    return 'conflict';
  }

  const localId = existing?.localId ?? (isUuid(clientId) ? clientId! : uuidv7());
  const row = toRow(entity, record, {
    businessId: context.businessId,
    localId,
    syncState: 'synced',
    now: context.now
  });
  await upsertEntityRow(db, entity, row);

  emitChange({
    entity,
    type: existing ? 'updated' : 'created',
    localId,
    serverId,
    origin: 'sync',
    related: relatedOf(row)
  });

  return existing ? 'updated' : 'inserted';
};

// -- Engine -----------------------------------------------------------------------------

export const createPullEngine = (config: PullEngineConfig) => {
  const transport = config.transport ?? httpTransport(config.deviceId);
  const collections = config.collections ?? Object.keys(PULL_COLLECTIONS);
  const pageLimit = config.pageLimit ?? DEFAULT_PAGE_LIMIT;
  const maxPages = config.maxPages ?? DEFAULT_MAX_PAGES;
  const deadlineMs = config.deadlineMs ?? DEFAULT_DEADLINE_MS;
  const clock = config.clock ?? (() => new Date().toISOString());

  let running = false;

  /**
   * Applies one page and advances the cursor in a single transaction — the pair is the unit
   * of progress. Returns what the page did.
   */
  const applyPage = async (collection: string, page: PullPage): Promise<Omit<CollectionResult, 'pages' | 'hasMore'>> =>
    withTransaction(async (db) => {
      const entity = PULL_COLLECTIONS[collection];
      const now = clock();
      const result = { collection, applied: 0, deleted: 0, conflicts: 0, skipped: 0, cursor: page.nextCursor };

      for (const record of page.records) {
        const outcome = await mergeRecord(db, entity, record, { businessId: config.businessId, now });
        if (outcome === 'conflict') result.conflicts += 1;
        else if (outcome === 'deleted') result.deleted += 1;
        else if (outcome === 'skipped') result.skipped += 1;
        else result.applied += 1;
      }

      if (page.nextCursor) await setSetting(cursorKey(collection), page.nextCursor, { txn: db, now });

      return result;
    }, config.txn);

  /** Drains one collection: page, apply, advance, repeat. */
  const pullCollection = async (
    collection: string,
    options: { deadline?: () => boolean } = {}
  ): Promise<CollectionResult> => {
    const total: CollectionResult = {
      collection,
      pages: 0,
      applied: 0,
      deleted: 0,
      conflicts: 0,
      skipped: 0,
      hasMore: false,
      cursor: await readCursor(collection, config.txn)
    };

    if (!PULL_COLLECTIONS[collection]) {
      return { ...total, error: `No local table for collection ${collection}` };
    }

    while (total.pages < maxPages) {
      let page: PullPage;
      try {
        page = await transport({ collection, cursor: total.cursor, limit: pageLimit });
      } catch (error) {
        // A failed page leaves the cursor where it was: the next pull re-requests it. Other
        // collections are unaffected — one 500 must not stall the whole sync.
        total.error = (error as Error)?.message ?? 'Pull failed';
        total.hasMore = true;
        return total;
      }

      let applied: Awaited<ReturnType<typeof applyPage>>;
      try {
        applied = await applyPage(collection, page);
      } catch (error) {
        // The transaction rolled back, so the cursor still points at this page and the next
        // pull re-requests it. Reported, never thrown: a pull is background work.
        total.error = (error as Error)?.message ?? 'Merge failed';
        total.hasMore = true;
        return total;
      }

      total.pages += 1;
      total.applied += applied.applied;
      total.deleted += applied.deleted;
      total.conflicts += applied.conflicts;
      total.skipped += applied.skipped;
      total.cursor = applied.cursor ?? total.cursor;
      total.hasMore = page.hasMore;

      if (!page.hasMore) break;
      if (options.deadline?.()) break;
    }

    return total;
  };

  /**
   * One pass over every collection. Never throws: a pull is background work, and a failed
   * collection is reported in its own result rather than aborting the others.
   */
  const pull = async (options: { deadlineMs?: number; now?: () => number } = {}): Promise<PullOutcome> => {
    const outcome: PullOutcome = {
      collections: [],
      applied: 0,
      deleted: 0,
      conflicts: 0,
      hasMore: false,
      stopped: 'drained'
    };

    if (running) return { ...outcome, stopped: 'busy' };

    running = true;
    const monotonic = options.now ?? (() => Date.now());
    const startedAt = monotonic();
    const budget = options.deadlineMs ?? deadlineMs;
    const expired = () => monotonic() - startedAt >= budget;

    try {
      for (const collection of collections) {
        if (expired()) {
          outcome.stopped = 'deadline';
          outcome.hasMore = true;
          break;
        }

        const result = await pullCollection(collection, { deadline: expired });
        outcome.collections.push(result);
        outcome.applied += result.applied;
        outcome.deleted += result.deleted;
        outcome.conflicts += result.conflicts;
        outcome.hasMore = outcome.hasMore || result.hasMore;
      }

      return outcome;
    } finally {
      running = false;
    }
  };

  return {
    pull,
    pullCollection,
    isPulling: () => running,
    cursor: (collection: string) => readCursor(collection, config.txn),
    /** Forgets every cursor: the next pull re-reads each collection from the beginning. */
    resetCursors: async () => {
      for (const collection of collections) await setSetting(cursorKey(collection), '', { txn: config.txn });
    }
  };
};

export type PullEngine = ReturnType<typeof createPullEngine>;
