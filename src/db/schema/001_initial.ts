import type { Migration } from '../migrations';

/**
 * Every synced entity table carries the same column set:
 *
 *   local_id           UUIDv7, generated on device, primary key, immutable forever. It is
 *                      never rewritten to the server's id — the outbox, dependent rows,
 *                      navigation params and React Query keys all reference it, and
 *                      swapping identity at sync time means updating all of them atomically.
 *   server_id          Mongo ObjectId, null until the record has been accepted by the server.
 *   business_id        Tenant scope. Every index leads with it.
 *   payload            The entity as the API represents it, verbatim JSON.
 *   version            Server version at the last sync; the basis for optimistic concurrency.
 *   sync_state         synced | pending | conflict | failed.
 *   deleted_at         Local tombstone.
 *   server_updated_at  Server's updatedAt at the last pull — the cursor component.
 *   local_updated_at   Last local edit.
 *
 * Plus promoted columns: the fields a screen filters or sorts by, lifted out of the JSON
 * into real columns. Storing every field as a column would mean a schema migration for
 * every backend field addition, and offline clients update on their own schedule, so
 * migrations must be near-free. Storing pure JSON would mean no indexes. Promoting the
 * eight-to-twelve queried fields per entity buys indexed reads and lets new backend fields
 * flow through untouched — only a new *filter* needs a migration.
 *
 * No foreign keys between entity tables. Invoices are windowed to 12 months while customers
 * are held in full, and a delivery agent may sync a narrowed scope, so an invoice can
 * legitimately reference a customer this device does not hold. A REFERENCES clause would
 * reject that row instead of storing it as a pending reference.
 *
 * ponytail: money lives in REAL, matching the backend's doubles exactly so nothing is lost
 * in conversion. These columns are for sorting and list display; the authoritative amounts
 * are in `payload` and every total is computed server-side. Move to integer paise if a
 * local aggregate ever becomes authoritative.
 */
const SYNCED_COLUMNS = `
  local_id TEXT PRIMARY KEY NOT NULL,
  server_id TEXT UNIQUE,
  business_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  version INTEGER,
  sync_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (sync_state IN ('synced', 'pending', 'conflict', 'failed')),
  deleted_at TEXT,
  server_updated_at TEXT,
  local_updated_at TEXT NOT NULL
`;

const SQL = `
-- Products -------------------------------------------------------------------------
-- Read on every line item of every invoice; searched by name, SKU and barcode.
CREATE TABLE IF NOT EXISTS products (
  ${SYNCED_COLUMNS},
  name TEXT NOT NULL,
  sku TEXT,
  barcode TEXT,
  category TEXT,
  unit TEXT,
  hsn TEXT,
  price REAL NOT NULL DEFAULT 0,
  tax_rate REAL NOT NULL DEFAULT 0,
  -- Server-authoritative. Held here as the last synced level so the UI can show a
  -- projection; the client never pushes this field.
  stock_quantity REAL NOT NULL DEFAULT 0,
  low_stock_threshold REAL,
  track_stock INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_products_name ON products (business_id, is_active, name);
CREATE INDEX IF NOT EXISTS idx_products_category ON products (business_id, category, name);
-- A scan is an exact lookup, not a search: this index is what makes it a sub-10ms seek.
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products (business_id, barcode)
  WHERE barcode IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_sku ON products (business_id, sku)
  WHERE sku IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_cursor ON products (business_id, server_updated_at, server_id);
CREATE INDEX IF NOT EXISTS idx_products_pending ON products (business_id, sync_state)
  WHERE sync_state <> 'synced';

-- Customers ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  ${SYNCED_COLUMNS},
  name TEXT NOT NULL,
  phone TEXT,
  -- Digits only, country code stripped: duplicate detection compares normalised phones,
  -- because two devices offline will both create "Ramesh, 98765 43210".
  phone_normalized TEXT,
  email TEXT,
  gst_number TEXT,
  -- Server-derived, never pushed. Mirrored for display and labelled as of the last sync.
  outstanding_dues REAL NOT NULL DEFAULT 0,
  available_credit REAL NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers (business_id, name);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (business_id, phone_normalized)
  WHERE phone_normalized IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_dues ON customers (business_id, outstanding_dues DESC);
CREATE INDEX IF NOT EXISTS idx_customers_cursor ON customers (business_id, server_updated_at, server_id);
CREATE INDEX IF NOT EXISTS idx_customers_pending ON customers (business_id, sync_state)
  WHERE sync_state <> 'synced';

-- Invoices -------------------------------------------------------------------------
-- Every sales document: invoice, quotation, delivery challan, credit note. The customer
-- snapshot is embedded in the payload, so a row renders with no join.
CREATE TABLE IF NOT EXISTS invoices (
  ${SYNCED_COLUMNS},
  document_number TEXT,
  document_type TEXT NOT NULL DEFAULT 'invoice',
  -- Both sides of the reference: the local id resolves while the customer is still
  -- unsynced, the server id once it is. Neither is a foreign key (see header).
  customer_local_id TEXT,
  customer_server_id TEXT,
  customer_name TEXT,
  date TEXT NOT NULL,
  due_date TEXT,
  subtotal REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  paid_amount REAL NOT NULL DEFAULT 0,
  balance_due REAL NOT NULL DEFAULT 0,
  document_status TEXT NOT NULL DEFAULT 'draft',
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  fulfillment_status TEXT
);
-- The invoice list: filtered by status, sorted by date, paged by keyset. Never OFFSET.
CREATE INDEX IF NOT EXISTS idx_invoices_list
  ON invoices (business_id, document_type, document_status, date DESC, local_id DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_unpaid
  ON invoices (business_id, payment_status, date DESC)
  WHERE payment_status IN ('unpaid', 'partial');
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices (business_id, customer_local_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices (business_id, document_number);
CREATE INDEX IF NOT EXISTS idx_invoices_cursor ON invoices (business_id, server_updated_at, server_id);
CREATE INDEX IF NOT EXISTS idx_invoices_pending ON invoices (business_id, sync_state)
  WHERE sync_state <> 'synced';

-- Payments -------------------------------------------------------------------------
-- Allocation across invoices is server-computed; the device records the receipt only.
CREATE TABLE IF NOT EXISTS payments (
  ${SYNCED_COLUMNS},
  invoice_local_id TEXT,
  invoice_server_id TEXT,
  customer_local_id TEXT,
  customer_server_id TEXT,
  amount REAL NOT NULL DEFAULT 0,
  method TEXT,
  type TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  reference TEXT,
  received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_received ON payments (business_id, received_at DESC, local_id DESC);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments (business_id, invoice_local_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments (business_id, customer_local_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_cursor ON payments (business_id, server_updated_at, server_id);
CREATE INDEX IF NOT EXISTS idx_payments_pending ON payments (business_id, sync_state)
  WHERE sync_state <> 'synced';

-- Expenses -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expenses (
  ${SYNCED_COLUMNS},
  category TEXT,
  date TEXT NOT NULL,
  total REAL NOT NULL DEFAULT 0,
  payment_method TEXT,
  vendor_name TEXT,
  reference TEXT,
  voided_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses (business_id, date DESC, local_id DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses (business_id, category, date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_cursor ON expenses (business_id, server_updated_at, server_id);
CREATE INDEX IF NOT EXISTS idx_expenses_pending ON expenses (business_id, sync_state)
  WHERE sync_state <> 'synced';

-- Suppliers ------------------------------------------------------------------------
-- The backend calls this entity a vendor; the app calls it a supplier. The mapping lives
-- here and nowhere else.
CREATE TABLE IF NOT EXISTS suppliers (
  ${SYNCED_COLUMNS},
  name TEXT NOT NULL,
  phone TEXT,
  phone_normalized TEXT,
  email TEXT,
  gst_number TEXT,
  -- Server-derived, mirrored for display.
  outstanding_payable REAL NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers (business_id, name);
CREATE INDEX IF NOT EXISTS idx_suppliers_phone ON suppliers (business_id, phone_normalized)
  WHERE phone_normalized IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_suppliers_cursor ON suppliers (business_id, server_updated_at, server_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_pending ON suppliers (business_id, sync_state)
  WHERE sync_state <> 'synced';

-- Business -------------------------------------------------------------------------
-- The synced business record: legal identity, tax config, document prefixes, template.
-- An invoice cannot be rendered without it. Pull-primary; writes are rare and admin-only.
CREATE TABLE IF NOT EXISTS business (
  ${SYNCED_COLUMNS},
  name TEXT NOT NULL,
  gst_number TEXT,
  state_code TEXT,
  invoice_prefix TEXT
);
CREATE INDEX IF NOT EXISTS idx_business_cursor ON business (business_id, server_updated_at, server_id);

-- Settings -------------------------------------------------------------------------
-- Device-local preferences only: theme, last tab, invoice window size, tour flags. These
-- are per-user-per-device and are never synced — they are separate from the business
-- table above, which holds the settings that *are* server state.
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Outbox ---------------------------------------------------------------------------
-- Append-only queue of user intent, durable across app kill, OS kill and reboot. One row
-- per operation. The engine that drains it is a later phase; the table exists now because
-- a write path without a durable queue loses work, and adding it later means migrating
-- every device mid-flight.
CREATE TABLE IF NOT EXISTS outbox (
  -- AUTOINCREMENT, not plain rowid: the total order of intent must never reuse a number,
  -- and SQLite reuses rowids after a delete.
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  -- UUIDv7, doubles as the Idempotency-Key sent to the server.
  op_id TEXT NOT NULL UNIQUE,
  business_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_local_id TEXT NOT NULL,
  op_type TEXT NOT NULL CHECK (op_type IN ('create', 'update', 'delete', 'action')),
  -- For op_type 'action': cancel, refund_processed, generate_invoice, mark_delivered.
  -- Domain transitions are named actions rather than status writes, so a client can never
  -- write documentStatus directly and skip the server's reversal logic.
  action_name TEXT,
  payload TEXT NOT NULL,
  -- The server version the edit was authored against. Null for creates, which cannot
  -- conflict. Conflict handling itself is a later phase; the column is here so an op
  -- enqueued today is still resolvable then.
  base_version INTEGER,
  -- JSON array of op_ids that must succeed first. Always points backwards in seq, so
  -- cycles are structurally impossible. Explicit dependencies rather than strict global
  -- ordering: one permanently failing op then poisons its own chain, not all 500 behind it.
  depends_on TEXT NOT NULL DEFAULT '[]',
  -- 1 money in, 2 documents, 3 masters, 4 background.
  priority INTEGER NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 4),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_error TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'inflight', 'done', 'failed', 'conflict', 'dead')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- The drain query: ready ops by priority then sequence. Priority orders between
-- independent chains; sequence and dependency always win within one.
CREATE INDEX IF NOT EXISTS idx_outbox_ready ON outbox (status, priority, seq)
  WHERE status IN ('pending', 'inflight');
CREATE INDEX IF NOT EXISTS idx_outbox_entity ON outbox (business_id, entity_type, entity_local_id);
-- Powers the pending badge and the Failed Operations screen.
CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox (business_id, status, seq);
`;

export const initialSchema: Migration = {
  version: 1,
  name: 'initial_schema',
  up: async (db) => {
    // execAsync runs the batch as written. Safe here precisely because none of it is
    // interpolated from input — every value above is a literal in this file.
    await db.execAsync(SQL);
  }
};
