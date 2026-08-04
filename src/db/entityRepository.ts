import type { SQLiteDatabase } from 'expo-sqlite';
import { emitChange, type ChangeEvent } from './changeBus';
import { openDatabase } from './connection';
import { DatabaseError, wrapDatabaseError } from './errors';
import {
  columnsFor,
  fromJsonText,
  fromRow,
  isUuid,
  toRow,
  uuidv7,
  type EntityRecord,
  type EntityRow,
  type EntityType,
  type MongoDoc,
  type SqliteValue,
  type SyncState
} from './mappers';
import { withTransaction } from './transaction';

/**
 * The shared body of every entity repository: CRUD, contains-search, keyset paging.
 *
 * Every synced table has the same envelope and differs only in which columns are promoted
 * (§ mappers), so the repositories differed only in a table name and a list of searchable
 * columns. One parameterised core, and an entity's own file holds just the queries that are
 * genuinely its own — a barcode scan, a phone-duplicate check.
 *
 * No network anywhere in this module. Writes leave the row `pending` and stop; pushing it
 * belongs to the sync engine, which joins the same transaction via `txn`.
 */

export type EntityDocument<TDoc extends MongoDoc> = EntityRecord & { doc: TDoc | null };

export type WriteOptions = {
  businessId?: string;
  /** Join a transaction already in progress instead of opening one. */
  txn?: SQLiteDatabase;
  /** Defaults to 'pending' for local edits. */
  syncState?: SyncState;
  now?: string;
};

/** Keyset position: the last row of the previous page. Never OFFSET — it drifts under writes. */
export type EntityCursor = { sortValue: string; localId: string };

export type ListQuery = {
  businessId: string;
  /** Contains-match across the entity's searchable columns. */
  search?: string;
  /** Defaults to true where the table has an is_active column. */
  activeOnly?: boolean;
  /** Equality filters, restricted to the entity's declared filter columns. */
  where?: Record<string, SqliteValue>;
  /** Set membership on declared columns — the multi-select status chips on a list screen. */
  whereIn?: Record<string, SqliteValue[]>;
  /**
   * Inclusive bounds on one declared column — a date period, in practice. ISO text sorts
   * chronologically, which is why the date columns are stored that way.
   */
  range?: { column: string; from?: SqliteValue; to?: SqliteValue };
  limit?: number;
  cursor?: EntityCursor | null;
  txn?: SQLiteDatabase;
};

export type EntityPage<TDoc extends MongoDoc> = {
  items: EntityDocument<TDoc>[];
  nextCursor: EntityCursor | null;
};

export type RepositoryConfig = {
  entity: EntityType;
  /** Used in error messages: "Could not read customer". */
  label: string;
  /** Columns a search term is matched against, in order of usefulness. */
  searchColumns: string[];
  /** The list's sort column; local_id breaks ties so paging cannot skip or repeat a row. */
  sortColumn: string;
  /** DESC for anything read newest-first — invoices, payments, expenses. */
  sortDirection?: 'ASC' | 'DESC';
  /** Columns accepted in `where`. Anything else is rejected — these names reach the SQL. */
  filterColumns?: string[];
  /** False for tables without an is_active column. */
  hasActiveColumn?: boolean;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * One upsert for both create and update, keyed on local_id — which never changes, so a
 * retried write is idempotent rather than a duplicate row. Shared with the pull engine,
 * which writes server records into the same tables.
 */
export const upsertEntityRow = async (db: SQLiteDatabase, entity: EntityType, row: EntityRow) => {
  const columns = columnsFor(entity);
  const assignments = columns
    .filter((column) => column !== 'local_id')
    .map((column) => `${column} = excluded.${column}`)
    .join(', ');

  await db.runAsync(
    `INSERT INTO ${entity} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})
     ON CONFLICT(local_id) DO UPDATE SET ${assignments}`,
    columns.map((column) => row[column] ?? null)
  );
};

const connect = async (txn?: SQLiteDatabase) => txn ?? (await openDatabase());

const serverIdOf = (row: EntityRow) => (row.server_id == null ? null : String(row.server_id));

// A write from the sync engine is server truth; anything else is this device's own edit.
const originOf = (options: WriteOptions) => (options.syncState === 'synced' ? 'sync' : 'local');

/**
 * The records this row is visible through. A payment against an invoice changes what that
 * invoice's detail screen shows, and a subscriber cannot know that from the payment's id.
 */
const relationsOf = (row: EntityRow): ChangeEvent['related'] => {
  const related: NonNullable<ChangeEvent['related']> = [];
  const seen = new Set<string>();

  const add = (entity: 'invoices' | 'customers', id: unknown) => {
    if (!id) return;
    const key = `${entity}:${String(id)}`;
    if (seen.has(key)) return;
    seen.add(key);
    related.push({ entity, id: String(id) });
  };

  for (const [column, entity] of [
    ['invoice_server_id', 'invoices'],
    ['invoice_local_id', 'invoices'],
    ['customer_server_id', 'customers'],
    ['customer_local_id', 'customers']
  ] as const) {
    add(entity, row[column]);
  }

  // A receipt can settle several bills at once, and the row's columns only name the last one.
  // Without the rest, the other bills' screens keep showing a balance that has been paid.
  const doc = fromJsonText(row.payload);
  const allocations = Array.isArray(doc?.provisionalAllocations) ? (doc!.provisionalAllocations as MongoDoc[]) : [];
  for (const allocation of allocations) {
    add('invoices', allocation.invoiceServerId);
    add('invoices', allocation.invoiceLocalId);
  }

  return related.length ? related : undefined;
};

// LIKE's own wildcards have to be escaped, or a search for "50%" matches every row.
const escapeLike = (term: string) => term.replace(/[\\%_]/g, (char) => `\\${char}`);

export const createEntityRepository = <TDoc extends MongoDoc>(config: RepositoryConfig) => {
  const { entity, label, searchColumns, sortColumn } = config;
  const table = entity;
  const filterColumns = new Set(config.filterColumns ?? []);
  const hasActiveColumn = config.hasActiveColumn ?? true;
  const direction = config.sortDirection ?? 'ASC';
  // A descending list pages backwards through the same keyset.
  const cursorOperator = direction === 'DESC' ? '<' : '>';

  const assertFilterable = (column: string) => {
    // These names are interpolated into the statement: an unchecked key is an injection.
    if (!filterColumns.has(column)) {
      throw new DatabaseError('DB_QUERY_FAILED', `${column} is not a filterable column on ${table}`);
    }
  };

  const asRecord = (row: EntityRow | null | undefined): EntityDocument<TDoc> | null =>
    row ? (fromRow<TDoc>(row) as EntityDocument<TDoc>) : null;

  const writeRow = (db: SQLiteDatabase, row: EntityRow) => upsertEntityRow(db, entity, row);

  const buildFilters = (query: ListQuery) => {
    const where: string[] = ['business_id = ?', 'deleted_at IS NULL'];
    const params: SqliteValue[] = [query.businessId];

    if (hasActiveColumn && query.activeOnly !== false) where.push('is_active = 1');

    for (const [column, value] of Object.entries(query.where ?? {})) {
      assertFilterable(column);
      if (value === null || value === undefined) continue;
      where.push(`${column} = ?`);
      params.push(value);
    }

    for (const [column, values] of Object.entries(query.whereIn ?? {})) {
      assertFilterable(column);
      if (!values?.length) continue;
      where.push(`${column} IN (${values.map(() => '?').join(', ')})`);
      params.push(...values);
    }

    if (query.range) {
      assertFilterable(query.range.column);
      if (query.range.from != null) {
        where.push(`${query.range.column} >= ?`);
        params.push(query.range.from);
      }
      if (query.range.to != null) {
        where.push(`${query.range.column} <= ?`);
        params.push(query.range.to);
      }
    }

    const search = query.search?.trim();
    if (search && searchColumns.length) {
      // ponytail: contains-match, which cannot use the sort index — fine for the few
      // thousand rows a device holds. Move to FTS5 if a large catalogue makes it hurt.
      const like = `%${escapeLike(search)}%`;
      where.push(`(${searchColumns.map((column) => `${column} LIKE ? ESCAPE '\\'`).join(' OR ')})`);
      searchColumns.forEach(() => params.push(like));
    }

    if (query.cursor) {
      where.push(`(${sortColumn}, local_id) ${cursorOperator} (?, ?)`);
      params.push(query.cursor.sortValue, query.cursor.localId);
    }

    return { where: where.join(' AND '), params };
  };

  const get = async (localId: string, txn?: SQLiteDatabase) =>
    wrapDatabaseError('DB_QUERY_FAILED', `Could not read ${label}`, async () => {
      const db = await connect(txn);
      return asRecord(await db.getFirstAsync<EntityRow>(`SELECT * FROM ${table} WHERE local_id = ?`, localId));
    });

  const getByServerId = async (serverId: string, txn?: SQLiteDatabase) =>
    wrapDatabaseError('DB_QUERY_FAILED', `Could not read ${label}`, async () => {
      const db = await connect(txn);
      return asRecord(await db.getFirstAsync<EntityRow>(`SELECT * FROM ${table} WHERE server_id = ?`, serverId));
    });

  /** One row matching an exact column value — the barcode / phone lookups build on this. */
  const findBy = async (column: string, value: SqliteValue, businessId: string, txn?: SQLiteDatabase) =>
    wrapDatabaseError('DB_QUERY_FAILED', `Could not look up ${label}`, async () => {
      if (!filterColumns.has(column)) {
        throw new DatabaseError('DB_QUERY_FAILED', `${column} is not a filterable column on ${table}`);
      }
      const db = await connect(txn);
      return asRecord(
        await db.getFirstAsync<EntityRow>(
          `SELECT * FROM ${table} WHERE business_id = ? AND ${column} = ? AND deleted_at IS NULL`,
          businessId,
          value
        )
      );
    });

  /**
   * One page. `nextCursor` is null on the last page — that, not a short page, is the
   * end-of-list signal.
   */
  const list = async (query: ListQuery): Promise<EntityPage<TDoc>> =>
    wrapDatabaseError('DB_QUERY_FAILED', `Could not list ${label}`, async () => {
      const db = await connect(query.txn);
      const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
      const { where, params } = buildFilters(query);

      // One row beyond the page: the cheapest way to know whether a next page exists.
      const rows = await db.getAllAsync<EntityRow>(
        `SELECT * FROM ${table} WHERE ${where}
         ORDER BY ${sortColumn} ${direction}, local_id ${direction} LIMIT ?`,
        [...params, limit + 1]
      );

      const page = rows.slice(0, limit);
      const last = page[page.length - 1];

      return {
        items: page.map((row) => asRecord(row)!),
        nextCursor:
          rows.length > limit && last ? { sortValue: String(last[sortColumn]), localId: String(last.local_id) } : null
      };
    });

  /** Total matching the same filters, for "showing 20 of 340". Ignores the cursor by design. */
  const count = async (query: ListQuery): Promise<number> =>
    wrapDatabaseError('DB_QUERY_FAILED', `Could not count ${label}`, async () => {
      const db = await connect(query.txn);
      const { where, params } = buildFilters({ ...query, cursor: null });
      const row = await db.getFirstAsync<{ total: number }>(
        `SELECT COUNT(*) AS total FROM ${table} WHERE ${where}`,
        params
      );
      return row?.total ?? 0;
    });

  /**
   * Inserts and returns the record as stored. `clientId` is set to the row's local_id so a
   * server create response can be matched back to this exact row.
   */
  const create = async (doc: TDoc, options: WriteOptions = {}): Promise<EntityDocument<TDoc>> =>
    wrapDatabaseError('DB_QUERY_FAILED', `Could not create ${label}`, async () =>
      withTransaction(async (db) => {
        const localId = isUuid(doc.clientId) ? (doc.clientId as string) : uuidv7();
        const row = toRow(
          entity,
          { ...doc, clientId: localId },
          { ...options, localId, syncState: options.syncState ?? 'pending' }
        );

        await writeRow(db, row);
        emitChange({ entity, type: 'created', localId, serverId: serverIdOf(row), origin: originOf(options), related: relationsOf(row) });
        return asRecord(row)!;
      }, options.txn)
    );

  /**
   * Shallow-merges `patch` into the stored document and rewrites the row. Shallow because
   * the caller owns nested objects — a deep merge makes clearing one impossible.
   *
   * Read and write share one transaction: two edits interleaving between the SELECT and the
   * UPDATE would silently drop one of them.
   */
  const update = async (
    localId: string,
    patch: Partial<TDoc>,
    options: WriteOptions = {}
  ): Promise<EntityDocument<TDoc> | null> =>
    wrapDatabaseError('DB_QUERY_FAILED', `Could not update ${label}`, async () =>
      withTransaction(async (db) => {
        const existing = await get(localId, db);
        if (!existing || existing.deletedAt) return null;

        const row = toRow(
          entity,
          { ...(existing.doc ?? {}), ...patch },
          {
            ...options,
            localId,
            businessId: options.businessId ?? existing.businessId,
            syncState: options.syncState ?? 'pending'
          }
        );

        // Sync identity is a property of the row, not of the document: a record acknowledged
        // by the server carries its id and version in columns the payload may not repeat. An
        // edit must never be the thing that forgets them — the record would look local-only
        // and be pushed as a second create.
        row.server_id = row.server_id ?? existing.serverId;
        row.version = row.version ?? existing.version;
        row.server_updated_at = row.server_updated_at ?? existing.serverUpdatedAt;

        await writeRow(db, row);
        emitChange({
          entity,
          type: 'updated',
          localId,
          serverId: serverIdOf(row),
          fields: Object.keys(patch),
          origin: originOf(options),
          related: relationsOf(row)
        });
        return asRecord(row)!;
      }, options.txn)
    );

  /**
   * Soft delete. The row stays as a tombstone: a hard delete cannot travel in a delta
   * stream, and every document referencing the record would lose its subject.
   */
  const softDelete = async (localId: string, options: WriteOptions = {}): Promise<boolean> =>
    wrapDatabaseError('DB_QUERY_FAILED', `Could not delete ${label}`, async () =>
      withTransaction(async (db) => {
        const now = options.now ?? new Date().toISOString();
        const result = await db.runAsync(
          `UPDATE ${table}
              SET deleted_at = ?, sync_state = ?, local_updated_at = ?,
                  payload = json_set(payload, '$.deletedAt', ?)
            WHERE local_id = ? AND deleted_at IS NULL`,
          [now, options.syncState ?? 'pending', now, now, localId]
        );

        if (result.changes > 0) emitChange({ entity, type: 'deleted', localId, origin: originOf(options) });
        return result.changes > 0;
      }, options.txn)
    );

  return { get, getByServerId, findBy, list, count, create, update, softDelete };
};
