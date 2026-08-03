/**
 * Mongo document <-> SQLite row.
 *
 * One table-driven spec per entity instead of seven hand-written mappers: every synced
 * table shares the same envelope (§ schema/001_initial) and differs only in which fields
 * are promoted to columns, so the difference is data, not code. Adding a promoted column
 * is one line here and one line in a migration.
 *
 * The row is *derived*, never authoritative: `payload` holds the API document verbatim,
 * and `fromRow` reads it back untouched. Promoted columns exist for indexes — a value
 * lost in conversion (a bad date, a missing number) degrades a sort, it does not lose
 * data. That is why every converter returns null rather than throwing.
 *
 * No persistence here. These are pure functions; the SQL that consumes them lands with
 * the read/write layer.
 */

/** Anything the API can hand back for one record. */
export type MongoDoc = Record<string, unknown>;

export type SyncState = 'synced' | 'pending' | 'conflict' | 'failed';

/** A SQLite row: only the four storage classes the driver binds. */
export type SqliteValue = string | number | null;
export type EntityRow = Record<string, SqliteValue>;

export type EntityType =
  | 'products'
  | 'customers'
  | 'invoices'
  | 'payments'
  | 'expenses'
  | 'purchases'
  | 'suppliers'
  | 'business';

export type ToRowContext = {
  /** Tenant scope. Falls back to the document's own `business` ref. */
  businessId?: string;
  /** Existing row's local_id. Immutable once minted — pass it on every update. */
  localId?: string;
  syncState?: SyncState;
  /** ISO timestamp for local_updated_at. Injected so tests are deterministic. */
  now?: string;
  /**
   * Resolves a server id to the local_id already held for it, for the *_local_id columns.
   * Requires a lookup, which is a caller concern; unresolved simply stores null and the
   * row keeps the server id alone.
   */
  resolveLocalId?: (entity: EntityType, serverId: string) => string | null | undefined;
};

// -- Primitive conversions ------------------------------------------------------------
// SQLite has no date, boolean, JSON or undefined. Each of those needs exactly one rule,
// applied everywhere, or two call sites disagree about what `false` looks like on disk.

/** Dates travel as ISO-8601 UTC text: sortable as a string, which is what the indexes need. */
export const toIsoText = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/** Booleans are 0/1 INTEGER. `undefined` is not `false` — it stays null unless a default says otherwise. */
export const toBoolInt = (value: unknown): 0 | 1 | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') return value === 'true' || value === '1' ? 1 : 0;
  return value ? 1 : 0;
};

export const fromBoolInt = (value: SqliteValue): boolean => value === 1 || value === '1';

export const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
};

/** Text columns hold strings only. An empty Mongo string is null here so partial indexes skip it. */
export const toText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const text = typeof value === 'string' ? value : String(value);
  return text.trim() === '' ? null : text;
};

/** JSON columns: objects in, TEXT out. Non-serialisable input is a programming error, not data loss. */
export const toJsonText = (value: unknown): string => JSON.stringify(value ?? null);

export const fromJsonText = <T = MongoDoc>(value: SqliteValue): T | null => {
  if (typeof value !== 'string' || value === '') return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    // A payload that will not parse is a corrupt row. Callers treat null as "re-pull it".
    return null;
  }
};

/**
 * UUIDv7: 48-bit millisecond timestamp, then random. Time-ordered, so it is a sane primary
 * key for an append-heavy table and sorts by creation without a second column.
 *
 * ponytail: falls back to Math.random when WebCrypto is absent (Hermes without a polyfill).
 * Fine for a device-local id; swap in expo-crypto if these ever need to be unguessable.
 */
export const uuidv7 = (now: number = Date.now()): string => {
  const bytes = new Uint8Array(10);
  const webcrypto = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => void } }).crypto;
  if (webcrypto?.getRandomValues) webcrypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const ts = now.toString(16).padStart(12, '0').slice(-12);
  // Version nibble 7, then the RFC 4122 variant bits.
  const versioned = ((parseInt(hex.slice(0, 3), 16) & 0x0fff) | 0x7000).toString(16).padStart(4, '0');
  const variant = ((parseInt(hex.slice(3, 7), 16) & 0x3fff) | 0x8000).toString(16).padStart(4, '0');

  return `${ts.slice(0, 8)}-${ts.slice(8, 12)}-${versioned}-${variant}-${hex.slice(7, 19)}`;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_RE.test(value);

/** Digits only, Indian country code stripped: the basis for offline duplicate detection. */
export const normalizePhone = (value: unknown): string | null => {
  const digits = typeof value === 'string' ? value.replace(/\D/g, '') : '';
  if (!digits) return null;
  return digits.length > 10 ? digits.slice(-10) : digits;
};

// -- Field specs ----------------------------------------------------------------------

type Kind = 'text' | 'num' | 'bool' | 'date';

type Field = {
  column: string;
  /** Dot path into the document, or a function for anything derived. */
  from: string | ((doc: MongoDoc, ctx: ToRowContext) => unknown);
  kind: Kind;
  /** Applied when the conversion yields null — mirrors the column's NOT NULL DEFAULT. */
  fallback?: SqliteValue;
};

const pick = (doc: MongoDoc, path: string): unknown =>
  path.split('.').reduce<unknown>((acc, key) => (acc == null ? undefined : (acc as MongoDoc)[key]), doc);

/** Mongo refs arrive either populated or as a bare ObjectId string. */
const refId = (value: unknown): string | null => {
  if (typeof value === 'string') return value || null;
  if (value && typeof value === 'object') return toText((value as MongoDoc)._id ?? (value as MongoDoc).id);
  return null;
};

const localRef = (entity: EntityType, ...paths: string[]) => (doc: MongoDoc, ctx: ToRowContext) => {
  const serverId = serverRef(...paths)(doc);
  return serverId ? (ctx.resolveLocalId?.(entity, serverId) ?? null) : null;
};

const serverRef = (...paths: string[]) => (doc: MongoDoc) => {
  for (const path of paths) {
    const id = refId(pick(doc, path));
    if (id) return id;
  }
  return null;
};

const f = (column: string, from: Field['from'], kind: Kind, fallback?: SqliteValue): Field => ({ column, from, kind, fallback });

/**
 * Promoted columns per table, in schema order. Field names are the API's, which is the
 * Mongo model's — see backend/src/models. The one deliberate rename is Vendor -> supplier.
 */
const SPECS: Record<EntityType, Field[]> = {
  products: [
    f('name', 'name', 'text'),
    f('sku', 'sku', 'text'),
    f('barcode', 'barcode', 'text'),
    f('category', 'category', 'text'),
    f('unit', 'unit', 'text'),
    f('hsn', 'hsn', 'text'),
    f('price', 'price', 'num', 0),
    f('tax_rate', 'taxRate', 'num', 0),
    f('stock_quantity', 'stockQuantity', 'num', 0),
    f('low_stock_threshold', 'lowStockThreshold', 'num'),
    f('track_stock', 'trackStock', 'bool', 1),
    f('is_active', 'isActive', 'bool', 1)
  ],
  customers: [
    f('name', 'name', 'text'),
    f('phone', 'phone', 'text'),
    f('phone_normalized', (doc) => normalizePhone(doc.phone), 'text'),
    f('email', 'email', 'text'),
    f('gst_number', (doc) => pick(doc, 'gstNumber') ?? pick(doc, 'taxIdentifiers.gstNumber'), 'text'),
    f('outstanding_dues', 'outstandingDues', 'num', 0),
    f('credit_balance', 'creditBalance', 'num', 0),
    f('is_active', 'isActive', 'bool', 1)
  ],
  invoices: [
    f('document_number', (doc) => doc.documentNumber ?? doc.invoiceNumber, 'text'),
    f('document_type', 'documentType', 'text', 'invoice'),
    // A document issued on the device names its customer by local id and only learns the
    // server's once that customer has synced; a pulled document arrives with the server id.
    f('customer_local_id', (doc, ctx) => doc.customerLocalId ?? localRef('customers', 'customer')(doc, ctx), 'text'),
    f('customer_server_id', serverRef('customer'), 'text'),
    f('customer_name', 'customerSnapshot.name', 'text'),
    f('date', 'date', 'date'),
    f('due_date', 'dueDate', 'date'),
    f('subtotal', 'subtotal', 'num', 0),
    f('total', 'total', 'num', 0),
    f('paid_amount', 'paidAmount', 'num', 0),
    f('balance_due', 'balanceDue', 'num', 0),
    f('document_status', 'documentStatus', 'text', 'draft'),
    f('payment_status', 'paymentStatus', 'text', 'unpaid'),
    f('fulfillment_status', 'fulfillmentStatus', 'text')
  ],
  payments: [
    // The backend is mid-rename: newer records carry salesDocument, older ones invoice.
    // A receipt taken at the counter names its invoice and customer by local id — the
    // invoice may itself be minutes old and unsynced — and learns the server ids later.
    f('invoice_local_id', (doc, ctx) => doc.invoiceLocalId ?? localRef('invoices', 'salesDocument', 'invoice')(doc, ctx), 'text'),
    f('invoice_server_id', serverRef('salesDocument', 'invoice'), 'text'),
    f('customer_local_id', (doc, ctx) => doc.customerLocalId ?? localRef('customers', 'customer')(doc, ctx), 'text'),
    f('customer_server_id', serverRef('customer'), 'text'),
    f('amount', 'amount', 'num', 0),
    f('method', 'method', 'text'),
    f('type', 'type', 'text'),
    f('status', 'status', 'text', 'completed'),
    f('reference', 'reference', 'text'),
    f('received_at', 'receivedAt', 'date')
  ],
  expenses: [
    f('category', 'category', 'text'),
    f('date', 'date', 'date'),
    f('total', 'total', 'num', 0),
    f('payment_method', 'paymentMethod', 'text'),
    f('vendor_name', 'vendorName', 'text'),
    f('reference', 'reference', 'text'),
    f('voided_at', 'voidedAt', 'date')
  ],
  purchases: [
    f('bill_number', 'billNumber', 'text'),
    f('vendor_bill_number', 'vendorBillNumber', 'text'),
    // Both sides of the vendor reference: the local id resolves while the supplier is still
    // unsynced, the server id once it is.
    // A bill written on the device names its supplier by local id and only learns the
    // server's once the supplier has synced; a pulled bill arrives with the server id alone.
    f('vendor_local_id', (doc, ctx) => doc.vendorLocalId ?? localRef('suppliers', 'vendor')(doc, ctx), 'text'),
    f('vendor_server_id', serverRef('vendor'), 'text'),
    f('vendor_name', 'vendorSnapshot.name', 'text'),
    f('date', 'date', 'date'),
    f('due_date', 'dueDate', 'date'),
    f('subtotal', 'subtotal', 'num', 0),
    f('tax_total', 'taxTotal', 'num', 0),
    f('total', 'total', 'num', 0),
    f('paid_amount', 'paidAmount', 'num', 0),
    f('balance_due', 'balanceDue', 'num', 0),
    f('status', 'status', 'text', 'received'),
    f('payment_status', 'paymentStatus', 'text', 'unpaid')
  ],
  suppliers: [
    f('name', 'name', 'text'),
    f('phone', 'phone', 'text'),
    f('phone_normalized', (doc) => normalizePhone(doc.phone), 'text'),
    f('email', 'email', 'text'),
    f('gst_number', 'gstNumber', 'text'),
    f('outstanding_payable', 'outstandingPayable', 'num', 0),
    f('is_active', 'isActive', 'bool', 1)
  ],
  business: [
    f('name', (doc) => doc.businessName ?? doc.name, 'text'),
    f('gst_number', 'gstNumber', 'text'),
    f('state_code', 'stateCode', 'text'),
    f('invoice_prefix', 'invoicePrefix', 'text')
  ]
};

/** Columns that are NOT NULL in the schema and have no server value to fall back on. */
const REQUIRED_TEXT: Partial<Record<EntityType, Record<string, () => string>>> = {
  products: { name: () => '' },
  customers: { name: () => '' },
  suppliers: { name: () => '' },
  business: { name: () => '' },
  invoices: { date: () => new Date(0).toISOString() },
  expenses: { date: () => new Date(0).toISOString() },
  purchases: { date: () => new Date(0).toISOString() },
  payments: { received_at: () => new Date(0).toISOString() }
};

const convert = (kind: Kind, value: unknown): SqliteValue => {
  if (kind === 'date') return toIsoText(value);
  if (kind === 'bool') return toBoolInt(value);
  if (kind === 'num') return toNumber(value);
  return toText(value);
};

// -- Document -> row ------------------------------------------------------------------

/**
 * Maps one API document to its row. `payload` keeps the document verbatim, so a backend
 * field this version of the app has never heard of still round-trips.
 *
 * `local_id` is minted once and never rewritten: the outbox, dependent rows and navigation
 * params all reference it. Pass `ctx.localId` when updating an existing row; on a first
 * insert the document's own `clientId` is reused if the device minted it, so the row the
 * server echoes back lands on the row that created it.
 */
export const toRow = (entity: EntityType, doc: MongoDoc, ctx: ToRowContext = {}): EntityRow => {
  const now = ctx.now ?? new Date().toISOString();
  const required = REQUIRED_TEXT[entity] ?? {};

  const row: EntityRow = {
    local_id: ctx.localId ?? (isUuid(doc.clientId) ? (doc.clientId as string) : uuidv7()),
    server_id: refId(doc._id ?? doc.id),
    business_id: ctx.businessId ?? refId(doc.business) ?? '',
    payload: toJsonText(doc),
    version: toNumber(doc.version),
    sync_state: ctx.syncState ?? 'synced',
    deleted_at: toIsoText(doc.deletedAt),
    server_updated_at: toIsoText(doc.updatedAt),
    local_updated_at: now
  };

  for (const field of SPECS[entity]) {
    const raw = typeof field.from === 'function' ? field.from(doc, ctx) : pick(doc, field.from);
    const value = convert(field.kind, raw);
    row[field.column] = value ?? field.fallback ?? required[field.column]?.() ?? null;
  }

  return row;
};

// -- Row -> document ------------------------------------------------------------------

export type EntityRecord = {
  localId: string;
  serverId: string | null;
  businessId: string;
  version: number | null;
  syncState: SyncState;
  deletedAt: string | null;
  serverUpdatedAt: string | null;
  localUpdatedAt: string | null;
  /** The API document as it was stored. Null only if the payload column is corrupt. */
  doc: MongoDoc | null;
};

/**
 * Reads a row back. Promoted columns are deliberately ignored — they are a derived index,
 * and reading the state of a record from anywhere but `payload` is how the two drift.
 */
export const fromRow = <T extends MongoDoc = MongoDoc>(row: EntityRow): EntityRecord & { doc: T | null } => ({
  localId: String(row.local_id),
  serverId: row.server_id == null ? null : String(row.server_id),
  businessId: String(row.business_id ?? ''),
  version: toNumber(row.version),
  syncState: (row.sync_state as SyncState) ?? 'pending',
  deletedAt: row.deleted_at == null ? null : String(row.deleted_at),
  serverUpdatedAt: row.server_updated_at == null ? null : String(row.server_updated_at),
  localUpdatedAt: row.local_updated_at == null ? null : String(row.local_updated_at),
  doc: fromJsonText<T>(row.payload)
});

/** Column names for an entity, envelope first — for INSERT construction by the write layer. */
export const columnsFor = (entity: EntityType): string[] => [
  'local_id',
  'server_id',
  'business_id',
  'payload',
  'version',
  'sync_state',
  'deleted_at',
  'server_updated_at',
  'local_updated_at',
  ...SPECS[entity].map((field) => field.column)
];
